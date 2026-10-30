import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { retentionEligible } from '../public/js/engine/retention.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhiren-test-'));
process.env.ZHIREN_DB_PATH = path.join(dir, 'test.db');
process.env.ZHIREN_AI = '0';

let server;
let base;
let db;

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

const call = async (method, url, body, headers = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

test('retention API enforces eligibility, prevents duplicates and preserves risk baseline', async () => {
  const today = db.stamp().slice(0, 10);
  const people = db.list('employees');
  const eligible = people.find(e => retentionEligible(e, today));
  const ineligible = people.find(e => !retentionEligible(e, today));
  assert.ok(eligible && ineligible);
  assert.equal((await call('POST', '/api/idps', { mode: 'retention', employeeId: ineligible.id })).status, 400);
  const created = await call('POST', '/api/idps', { mode: 'retention', employeeId: eligible.id, baseline: { score: 0 } });
  assert.equal(created.status, 201);
  assert.ok(created.data.baseline.score >= 55);
  assert.equal((await call('POST', '/api/idps', { mode: 'retention', employeeId: eligible.id })).status, 409);
  const actions = structuredClone(created.data.actions);
  actions[0].done = true;
  const saved = await call('PUT', `/api/idps/${created.data.id}`, { actions, baseline: { score: 0 } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.actions[0].done, true);
  assert.deepEqual(saved.data.baseline, created.data.baseline);
  assert.equal((await call('PUT', `/api/idps/${created.data.id}`, { employeeId: ineligible.id })).status, 400);
  assert.equal((await call('PUT', `/api/idps/${created.data.id}`, { mode: 'gap' })).status, 400);
  await call('DELETE', `/api/idps/${created.data.id}`);
});

test('meta reports AI off and demo data is present', async () => {
  const meta = await call('GET', '/api/meta');
  assert.equal(meta.status, 200);
  assert.equal(meta.data.ai.enabled, false);
  assert.equal(Object.hasOwn(meta.data, 'qwen'), false);
  const emps = await call('GET', '/api/employees');
  assert.ok(emps.data.length >= 70);
  const filtered = await call('GET', '/api/candidates?stage=hired');
  assert.ok(filtered.data.length >= 1 && filtered.data.every((c) => c.stage === 'hired'));
});

test('documents can be created, updated with attribution, and deleted', async () => {
  const actor = (await call('GET', '/api/employees')).data[0];
  const created = await call('POST', '/api/positions', { title: '测试职位', status: 'open', headcount: 1 }, { 'X-Actor': actor.id });
  assert.equal(created.status, 201);
  assert.match(created.data.id, /^p[0-9a-f]{10}$/);
  assert.equal(created.data.createdBy, actor.id);
  const updated = await call('PUT', `/api/positions/${created.data.id}`, { status: 'closed', id: 'hijack', createdAt: '1999-01-01' }, { 'X-Actor': actor.id });
  assert.equal(updated.data.status, 'closed');
  assert.equal(updated.data.id, created.data.id, 'ids cannot be overwritten');
  assert.notEqual(updated.data.createdAt, '1999-01-01');
  const activity = await call('GET', '/api/activity?limit=5');
  assert.equal(activity.data[0].detail.field, 'status');
  assert.equal(activity.data[0].actor.id, actor.id);
  assert.equal((await call('DELETE', `/api/positions/${created.data.id}`, {})).status, 200);
  assert.equal((await call('GET', `/api/positions/${created.data.id}`)).status, 404);
});

test('retired connector and analysis endpoints are unavailable without altering legacy records', async () => {
  const legacy = db.insert('assessments', { id: 'qlegacy', employeeId: 'e01', status: 'pending_review' });
  for (const method of ['GET', 'POST']) {
    assert.equal((await call(method, '/mcp', method === 'POST' ? { jsonrpc: '2.0', method: 'tools/list', id: 1 } : undefined)).status, 404);
  }
  assert.equal((await call('GET', '/api/assessments')).status, 404);
  assert.equal((await call('POST', '/api/assessments', { employeeId: 'e01' })).status, 404);
  for (const method of ['GET', 'PUT', 'DELETE']) {
    assert.equal((await call(method, `/api/assessments/${legacy.id}`, method === 'GET' ? undefined : { status: 'approved' })).status, 404);
  }
  assert.deepEqual(db.get('assessments', legacy.id), legacy);
});

test('survey responses are validated and stay anonymous', async () => {
  const surveys = (await call('GET', '/api/surveys')).data;
  const open = surveys.find((s) => s.status === 'open');
  const closed = surveys.find((s) => s.status === 'closed');
  const actor = (await call('GET', '/api/employees')).data[0];
  const ok = await call('POST', '/api/responses', { surveyId: open.id, answers: { x0: 4, bad: 9, '<script>': 3 }, enps: 8, createdBy: 'someone' }, { 'X-Actor': actor.id });
  assert.equal(ok.status, 201);
  assert.deepEqual(ok.data.answers, { x0: 4 });
  assert.equal(ok.data.createdBy, undefined, 'responses never record who answered');
  const act = (await call('GET', '/api/activity?limit=1')).data[0];
  assert.equal(act.actor, null);
  assert.equal((await call('POST', '/api/responses', { surveyId: closed.id, answers: { x0: 3 } })).status, 400);
  assert.equal((await call('POST', '/api/responses', { surveyId: open.id, answers: {} })).status, 400);
  assert.equal((await call('PUT', `/api/responses/${ok.data.id}`, { answers: {} })).status, 405);
});

test('rejects non-JSON writes, unknown collections and foreign hosts', async () => {
  const res = await fetch(`${base}/api/tickets`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(res.status, 415);
  assert.equal((await call('GET', '/api/secrets')).status, 404);
  assert.equal((await call('POST', '/api/ai/jd', { input: {} })).status, 503);
  const evil = await new Promise((resolve, reject) => {
    http.get(`${base}/api/meta`, { headers: { Host: 'evil.example' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject);
  });
  assert.equal(evil, 421, 'DNS-rebinding style Host headers are refused');
  const page = await fetch(`${base}/recruit/pipeline`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await fetch(`${base}/../server/db.js`)).status !== 200, true);
});

