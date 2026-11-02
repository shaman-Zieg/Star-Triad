import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhiren-idp-'));
process.env.ZHIREN_DB_PATH = path.join(dir, 'test.db');
process.env.ZHIREN_AI = '0';

let server, base, db;
before(async () => {
  db = await import('../server/db.js');
  const { reseed } = await import('../server/seed.js');
  const { createServer } = await import('../server/index.js');
  db.open();
  reseed(new Date(2026, 9, 21));
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
const call = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const plans = () => db.list('idps').filter((p) => p.mode !== 'retention');
const action = { type: '70', text: ['实践', 'Practice'], due: '2026-12-01', done: false };
const area = { competency: 'learning', actual: 2, target: 3, actions: [action] };

test('an edited plan is saved and re-read with its new content', async () => {
  const [plan] = plans();
  const focus = structuredClone(plan.focus);
  focus[0].target = 5;
  focus[0].goal = ['半年内独立主导', 'Lead it independently within 6 months'];
  focus[0].actions[0] = { ...focus[0].actions[0], text: ['改写的行动', 'Rewritten action'], due: '2027-01-15' };
  focus[0].actions.push({ type: '20', text: ['找导师', 'Find a mentor'], due: '2027-02-01', done: false });
  const saved = await call('PUT', `/api/idps/${plan.id}`, { focus, period: '2027 H1' });
  assert.equal(saved.status, 200);
  const reread = await call('GET', `/api/idps/${plan.id}`);
  assert.deepEqual(reread.data.focus, focus);
  assert.equal(reread.data.period, '2027 H1');
  assert.equal(reread.data.createdAt, plan.createdAt);
});

test('invalid edits are refused and leave the stored plan untouched', async () => {
  const [plan] = plans();
  const before = db.get('idps', plan.id);
  for (const focus of [[], [area, area], [{ ...area, actual: 4, target: 3 }], [{ ...area, actions: [] }], [{ ...area, actions: [{ ...action, due: 'soon' }] }]]) {
    assert.equal((await call('PUT', `/api/idps/${plan.id}`, { focus })).status, 400);
  }
  assert.deepEqual(db.get('idps', plan.id), before);
});

test('a development plan cannot be moved to someone else or another type', async () => {
  const [plan] = plans();
  const other = db.list('employees').find((e) => e.id !== plan.employeeId);
  assert.equal((await call('PUT', `/api/idps/${plan.id}`, { employeeId: other.id })).status, 400);
  assert.equal((await call('PUT', `/api/idps/${plan.id}`, { mode: 'retention' })).status, 400);
  assert.equal((await call('PUT', `/api/idps/${plan.id}`, { mode: 'growth' })).status, 400);
  assert.equal(db.get('idps', plan.id).employeeId, plan.employeeId);
});

test('an employee has at most one active development plan', async () => {
  const [plan] = plans();
  const body = { employeeId: plan.employeeId, status: 'active', mode: 'gap', focus: [area] };
  assert.equal((await call('POST', '/api/idps', body)).status, 409);
  assert.equal((await call('PUT', `/api/idps/${plan.id}`, { status: 'completed' })).status, 200);
  const next = await call('POST', '/api/idps', body);
  assert.equal(next.status, 201, 'a finished plan no longer blocks a new one');
  assert.equal((await call('PUT', `/api/idps/${plan.id}`, { status: 'active' })).status, 409, 'nor can it be reopened alongside the new one');
  assert.equal((await call('DELETE', `/api/idps/${next.data.id}`, {})).status, 200);
  assert.equal((await call('PUT', `/api/idps/${plan.id}`, { status: 'active' })).status, 200);
  const left = db.list('employees').find((e) => e.status === 'left');
  assert.equal((await call('POST', '/api/idps', { ...body, employeeId: left.id })).status, 400);
});
