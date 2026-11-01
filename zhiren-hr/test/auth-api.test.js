import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhiren-auth-api-'));
process.env.ZHIREN_DB_PATH = path.join(dir, 'test.db');
process.env.ZHIREN_AI = '0';
let db, server, base, people, accounts, cookies;
const password = 'integration-test-password';
async function call(method, route, body, cookie, headers = {}) {
  const res = await fetch(base + route, { method, headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
before(async () => {
  db = await import('../server/db.js');
  const { reseed } = await import('../server/seed.js');
  const { createAuth, hashPassword } = await import('../server/auth.js');
  const { createServer } = await import('../server/index.js');
  reseed();
  people = db.list('employees');
  const manager = people.find(e => people.some(p => p.managerId === e.id && p.status === 'active') && e.deptId === 'd02');
  const employee = people.find(e => e.managerId === manager.id && e.status === 'active');
  const hr = people.find(e => e.deptId === 'd08');
  const passwordHash = await hashPassword(password);
  accounts = [hr, manager, employee].map((e, i) => ({ username: ['hr', 'manager', 'employee'][i], role: ['hr', 'manager', 'employee'][i], employeeId: e.id, passwordHash }));
  server = createServer({ auth: createAuth({ required: true, users: accounts }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  cookies = {};
  for (const user of accounts) {
    const result = await call('POST', '/api/auth/login', { username: user.username, password });
    assert.equal(result.status, 200);
    cookies[user.role] = result.cookie;
  }
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('LAN gates private endpoints but keeps questionnaire metadata and submission public', async () => {
  for (const route of ['/api/employees', '/api/candidates', '/api/export', '/api/activity', '/api/surveys', '/api/departments', '/api/survey-results']) {
    assert.equal((await call('GET', route, undefined, undefined, { 'X-Actor': accounts[0].employeeId })).status, 401, route);
  }
  assert.equal((await call('POST', '/api/admin/reset', {})).status, 401);
  const survey = db.list('surveys').find(s => s.status === 'open');
  const publicResult = await call('GET', `/api/public/surveys/${survey.id}`);
  assert.equal(publicResult.status, 200);
  assert.equal(publicResult.data.survey.createdBy, undefined);
  assert.ok(publicResult.data.departments.length);
  assert.ok(publicResult.data.departments.every(d => !d.parentId));
  const submitted = await call('POST', '/api/responses', { surveyId: survey.id, answers: { basic0: 4 }, createdBy: accounts[0].employeeId });
  assert.equal(submitted.status, 201);
  assert.deepEqual(submitted.data, { ok: true });
  assert.equal((await call('GET', '/api/responses', undefined, cookies.hr)).status, 403, 'HR cannot bypass survey privacy');
});

test('role-scoped reads and filters cannot reveal other employee ratings', async () => {
  const me = accounts[2].employeeId;
  const outsider = people.find(e => e.deptId === 'd09');
  const staff = (await call('GET', '/api/employees', undefined, cookies.employee)).data;
  assert.equal(staff.find(e => e.id === me).performance, db.get('employees', me).performance);
  assert.equal(staff.find(e => e.id === outsider.id).performance, undefined);
  assert.equal((await call('GET', `/api/employees/${outsider.id}`, undefined, cookies.employee)).data.compaRatio, undefined);
  const filtered = await call('GET', `/api/employees?performance=${outsider.performance}&id=${outsider.id}`, undefined, cookies.employee);
  assert.deepEqual(filtered.data, []);
  const team = (await call('GET', '/api/employees', undefined, cookies.manager)).data;
  assert.equal(team.find(e => e.id === me).performance, db.get('employees', me).performance);
  assert.equal(team.find(e => e.id === outsider.id).performance, undefined);
  assert.equal((await call('GET', '/api/export', undefined, cookies.employee)).status, 403);
  assert.equal((await call('GET', '/api/export', undefined, cookies.manager)).status, 403);
  assert.equal((await call('GET', '/api/export', undefined, cookies.hr)).status, 200);
  assert.deepEqual((await call('GET', '/api/activity', undefined, cookies.employee)).data, []);
});

test('write permissions ignore forged actors and reject ownership changes', async () => {
  const me = accounts[2].employeeId;
  const outsider = people.find(e => e.deptId === 'd09');
  assert.equal((await call('PUT', `/api/employees/${me}`, { performance: 5 }, cookies.employee, { 'X-Actor': accounts[0].employeeId })).status, 403);
  assert.equal((await call('PUT', `/api/employees/${outsider.id}`, { performance: 5 }, cookies.manager)).status, 403);
  assert.equal((await call('PUT', `/api/employees/${me}`, { deptId: 'd08' }, cookies.manager)).status, 403);
  const managerUpdate = await call('PUT', `/api/employees/${me}`, { performance: 4 }, cookies.manager, { 'X-Actor': accounts[0].employeeId });
  assert.equal(managerUpdate.status, 200);
  assert.equal(db.recentActivity(1)[0].actor.id, accounts[1].employeeId);
  assert.equal((await call('POST', '/api/admin/reset', {}, cookies.manager)).status, 403);
  const ticket = await call('POST', '/api/tickets', { type: 'other', title: 'Help', detail: '' }, cookies.employee, { 'X-Actor': accounts[0].employeeId });
  assert.equal(ticket.status, 201);
  assert.equal(ticket.data.requesterId, me);
  assert.equal(ticket.data.createdBy, me);
  assert.equal((await call('POST', '/api/tickets', { type: 'other', title: 'Forged', requesterId: accounts[0].employeeId }, cookies.employee)).status, 403);
  const privateTicket = db.list('tickets').find(t => t.requesterId !== me && t.assigneeId !== me);
  assert.equal((await call('GET', `/api/tickets/${privateTicket.id}`, undefined, cookies.employee)).status, 404);
  assert.equal((await call('DELETE', `/api/tickets/${ticket.data.id}`, {}, cookies.employee)).status, 403);
});

test('assigned interviewer can score only their own round without seeing or overwriting others', async () => {
  const me = accounts[2].employeeId;
  const other = accounts[1].employeeId;
  const entry = (id, interviewerId) => ({ id, interviewerId, round: 'r1', date: '2026-11-01', scores: {}, recommendation: null, notes: '' });
  const candidate = db.insert('candidates', { name: 'Interview', positionId: db.list('positions')[0].id, stage: 'interview', interviews: [entry('ivmine', me), entry('ivother', other)] });
  const view = await call('GET', `/api/candidates/${candidate.id}`, undefined, cookies.employee);
  assert.equal(view.data.interviews.length, 1);
  const patch = { interviews: [{ ...view.data.interviews[0], scores: { professional: 4 }, recommendation: 'yes' }] };
  const saved = await call('PUT', `/api/candidates/${candidate.id}`, patch, cookies.employee);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.interviews.length, 1, 'write responses must also be projected');
  assert.deepEqual(db.get('candidates', candidate.id).interviews.find(i => i.interviewerId === other).scores, {});
  patch.interviews[0].interviewerId = other;
  assert.equal((await call('PUT', `/api/candidates/${candidate.id}`, patch, cookies.employee)).status, 403);
});

test('cross-site writes are blocked and logout invalidates the cookie', async () => {
  assert.equal((await call('POST', '/api/auth/login', { username: 'hr', password }, undefined, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('POST', '/api/admin/reset', {}, cookies.hr, { Origin: 'https://evil.example' })).status, 403);
  const signed = await call('POST', '/api/auth/login', { username: 'employee', password });
  assert.equal((await call('GET', '/api/auth/session', undefined, signed.cookie)).data.user.role, 'employee');
  assert.equal((await call('POST', '/api/auth/logout', {}, signed.cookie)).status, 200);
  assert.equal((await call('GET', '/api/employees', undefined, signed.cookie)).status, 401);
});

test('employee imports require HR on both preview and save endpoints', async () => {
  const csv = 'name,title,deptId,hireDate,empNo\nImported,Engineer,d02,2026-10-01,AUTH-IMPORT-1';
  const before = db.count('employees');
  for (const endpoint of ['import-preview', 'import']) {
    assert.equal((await call('POST', `/api/employees/${endpoint}`, { csv })).status, 401);
    for (const role of ['employee', 'manager']) assert.equal((await call('POST', `/api/employees/${endpoint}`, { csv }, cookies[role])).status, 403);
  }
  assert.equal(db.count('employees'), before);
  assert.equal((await call('POST', '/api/employees/import-preview', { csv }, cookies.hr)).data.valid, true);
  assert.equal(db.count('employees'), before);
  assert.equal((await call('POST', '/api/employees/import', { csv }, cookies.hr)).status, 201);
  assert.equal(db.count('employees'), before + 1);
});
