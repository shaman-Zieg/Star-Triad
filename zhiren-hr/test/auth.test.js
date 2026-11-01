import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhiren-auth-'));
process.env.ZHIREN_DB_PATH = path.join(dir, 'test.db');
const { createAuth, hashPassword } = await import('../server/auth.js');
const { employeeInScope, readDocuments, authorizeWrite, publicSurvey } = await import('../server/access.js');
const db = await import('../server/db.js');
const password = 'safe-password-for-tests';
const passwordHash = await hashPassword(password);
const people = [
  { id: 'e1', name: 'HR', deptId: 'd1', status: 'active', performance: 5 },
  { id: 'e2', name: 'Manager', deptId: 'd2', status: 'active', performance: 4 },
  { id: 'e3', name: 'Employee', deptId: 'd2', managerId: 'e2', status: 'active', performance: 3 },
  { id: 'e4', name: 'Other', deptId: 'd3', status: 'active', performance: 2, compaRatio: 0.9 },
];
for (const employee of people) db.insert('employees', employee);
const users = ['hr', 'manager', 'employee'].map((role, i) => ({ username: role, role, employeeId: people[i].id, passwordHash }));
const [hr, manager, employee] = users;
const request = (headers = {}, address = '127.0.0.1') => ({ headers: { host: 'company.test:3200', origin: 'http://company.test:3200', ...headers }, socket: { remoteAddress: address } });
const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; } });
const signIn = async (auth, username = 'employee', headers) => {
  const res = response();
  const data = await auth.login(request(headers), res, { username, password });
  return { data, res, req: request({ cookie: res.headers['Set-Cookie'].split(';')[0] }) };
};
after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('LAN fails closed without valid configured accounts, local mode retains actor selection', () => {
  assert.throws(() => createAuth({ required: true, usersFile: path.join(dir, 'missing.json') }), /requires an account file/);
  assert.throws(() => createAuth({ required: true, users: [employee] }), /HR account/);
  assert.throws(() => createAuth({ required: true, users: [...users, hr] }), /Invalid or duplicate/);
  const local = createAuth({ required: false });
  assert.equal(local.info(request()).required, false);
  assert.equal(local.actor(request({ 'x-actor': 'e4' })).id, 'e4');
});

test('sessions use private cookies, ignore forged actor and expire or logout', async () => {
  let time = 1000;
  const auth = createAuth({ required: true, users, now: () => time, ttl: 1000 });
  const { data, res, req } = await signIn(auth);
  assert.deepEqual(data.user, { username: 'employee', role: 'employee', employeeId: 'e3' });
  assert.match(res.headers['Set-Cookie'], /HttpOnly; SameSite=Strict; Max-Age=1/);
  req.headers['x-actor'] = 'e1';
  assert.equal(auth.actor(req).id, 'e3');
  assert.equal(auth.session(request({ 'x-actor': 'e1' })), null);
  time = 2001;
  assert.equal(auth.session(req), null);
  const again = await signIn(auth);
  const logout = response();
  auth.logout(again.req, logout);
  assert.match(logout.headers['Set-Cookie'], /Max-Age=0/);
  assert.equal(auth.session(again.req), null);
});

test('login rejects wrong credentials, cross-origin writes and brute-force attempts', async () => {
  const auth = createAuth({ required: true, users });
  assert.throws(() => auth.checkOrigin(request({ origin: 'http://attacker.test:3200' })), { status: 403 });
  assert.throws(() => auth.checkOrigin(request({ origin: 'null' })), { status: 403 });
  assert.throws(() => auth.checkOrigin(request({ 'sec-fetch-site': 'cross-site' })), { status: 403 });
  assert.doesNotThrow(() => auth.checkOrigin(request()));
  for (let n = 0; n < 10; n++) await assert.rejects(auth.login(request(), response(), { username: n % 2 ? 'missing' : 'employee', password: 'incorrect-password' }), { status: 401 });
  await assert.rejects(auth.login(request(), response(), { username: 'employee', password }), { status: 429 });
});

test('inactive employee accounts cannot sign in and existing sessions stop working', async () => {
  const auth = createAuth({ required: true, users });
  const signed = await signIn(auth);
  db.update('employees', 'e3', { status: 'left' });
  assert.equal(auth.session(signed.req), null);
  await assert.rejects(auth.login(request(), response(), { username: 'employee', password }), { status: 401 });
  db.update('employees', 'e3', { status: 'active' });
});

test('employee and manager scopes redact unrelated sensitive fields', () => {
  const staff = readDocuments('employees', people, employee);
  assert.equal(staff.find(e => e.id === 'e3').performance, 3);
  assert.equal(staff.find(e => e.id === 'e4').performance, undefined);
  assert.equal(staff.find(e => e.id === 'e4').compaRatio, undefined);
  assert.equal(staff.find(e => e.id === 'e4').restricted, true);
  assert.equal(readDocuments('employees', people, manager).find(e => e.id === 'e3').performance, 3);
  assert.equal(employeeInScope(people[3], manager), false);
  assert.deepEqual(readDocuments('employees', people, hr), people);
  assert.deepEqual(readDocuments('responses', [{ answers: { x: 5 } }], employee), []);
  assert.deepEqual(readDocuments('succession', [{ incumbentId: 'e3' }], manager), []);
  assert.throws(() => authorizeWrite('employees', 'PUT', { performance: 5 }, people[3], manager), { status: 403 });
  assert.throws(() => authorizeWrite('employees', 'PUT', { deptId: 'd2' }, people[2], manager), { status: 403 });
  assert.throws(() => authorizeWrite('employees', 'PUT', { performance: 5 }, people[2], employee), { status: 403 });
  const assessed = authorizeWrite('employees', 'PUT', { competencies: { learning: 4 }, assessedAt: '1999-01-01' }, people[2], manager);
  assert.equal(assessed.assessedAt, db.stamp().slice(0, 10));
  const agility = { avg: 4, at: '2026-11-01', dims: [{ key: 'mental', score: 4 }] };
  assert.deepEqual(authorizeWrite('employees', 'PUT', { potential: 2, agility }, people[2], manager), { potential: 2, agility });
});

test('interviewers see only assigned candidates and can update only their scorecards', () => {
  const candidate = { id: 'c1', name: 'A', resume: 'Resume', stage: 'screen', email: 'private@example.test', interviews: [
    { id: 'iv1', interviewerId: 'e3', round: 'r1', scores: {} },
    { id: 'iv2', interviewerId: 'e2', round: 'r2', scores: { learning: 2 }, notes: 'Confidential' },
  ] };
  const other = { id: 'c2', interviews: [{ interviewerId: 'e1', round: 'r1' }] };
  const [visible] = readDocuments('candidates', [candidate, other], employee);
  assert.equal(visible.email, undefined);
  assert.equal(visible.interviews.length, 1);
  const interviews = [{ ...visible.interviews[0], scores: { learning: 4 }, notes: 'Evidence' }];
  const patch = authorizeWrite('candidates', 'PUT', { interviews, stage: 'interview' }, candidate, employee);
  assert.equal(patch.stage, 'interview');
  assert.deepEqual(patch.interviews.find(i => i.id === 'iv2'), candidate.interviews[1]);
  assert.throws(() => authorizeWrite('candidates', 'PUT', { interviews: candidate.interviews }, candidate, employee), { status: 403 });
  assert.throws(() => authorizeWrite('candidates', 'PUT', { interviews, stage: 'hired' }, candidate, employee), { status: 403 });
  assert.throws(() => authorizeWrite('candidates', 'PUT', { interviews: [{ ...interviews[0], round: 'r3' }] }, candidate, employee), { status: 403 });
});

test('request ownership and comment attribution cannot be forged', () => {
  const created = authorizeWrite('tickets', 'POST', { type: 'other', title: 'Help' }, null, employee);
  assert.equal(created.requesterId, 'e3');
  assert.throws(() => authorizeWrite('tickets', 'POST', { requesterId: 'e1' }, null, employee), { status: 403 });
  const ticket = { ...created, comments: [{ by: 'e1', at: '2026-01-01', text: 'Previous' }] };
  const updated = authorizeWrite('tickets', 'PUT', { comments: [...ticket.comments, { by: 'e1', at: '1999-01-01', text: 'Answer' }] }, ticket, employee);
  assert.equal(updated.comments.at(-1).by, 'e3');
  assert.notEqual(updated.comments.at(-1).at, '1999-01-01');
  assert.throws(() => authorizeWrite('tickets', 'PUT', { comments: [{ by: 'e3', text: 'Replaced' }] }, ticket, employee), { status: 403 });
  assert.throws(() => authorizeWrite('tickets', 'PUT', { assigneeId: 'e3' }, ticket, employee), { status: 403 });
  assert.deepEqual(readDocuments('tickets', [{ requesterId: 'e4', assigneeId: 'e1' }], employee), []);
});

test('employees may complete existing IDP actions but cannot rewrite their goals', () => {
  const plan = { employeeId: 'e3', mode: 'gap', focus: [{ competency: 'learning', actions: [{ text: ['Learn', 'Learn'], due: '2026-12-01', done: false }] }] };
  const focus = structuredClone(plan.focus);
  focus[0].actions[0].done = true;
  assert.deepEqual(authorizeWrite('idps', 'PUT', { focus }, plan, employee), { focus });
  focus[0].actions[0].text = ['Forged', 'Forged'];
  assert.throws(() => authorizeWrite('idps', 'PUT', { focus }, plan, employee), { status: 403 });
  assert.throws(() => authorizeWrite('idps', 'PUT', { employeeId: 'e4' }, plan, employee), { status: 403 });
});

test('public survey metadata includes only scoped department labels', () => {
  const result = publicSurvey({ id: 'v1', title: 'Survey', model: 'engagement', scope: 'd1', status: 'open', createdBy: 'e1', internalNote: 'secret' }, [
    { id: 'd1', name: 'HR', budget: 999, managerId: 'e1' }, { id: 'd2', name: 'Other' },
  ]);
  assert.deepEqual(result.departments, [{ id: 'd1', name: 'HR' }]);
  assert.equal(result.survey.createdBy, undefined);
  assert.equal(result.survey.internalNote, undefined);
});

test('malformed nested changes fail authorization instead of throwing internal errors', () => {
  const candidate = { interviews: [{ interviewerId: 'e3', round: 'r1' }] };
  for (const interviews of [null, [null], [4], {}]) assert.throws(() => authorizeWrite('candidates', 'PUT', { interviews }, candidate, employee), { status: 403 });
  const ticket = { requesterId: 'e3', comments: [] };
  assert.throws(() => authorizeWrite('tickets', 'PUT', { comments: [null] }, ticket, employee), { status: 403 });
  const plan = { employeeId: 'e3', mode: 'gap', focus: [] };
  for (const focus of [null, {}, [null], [{ actions: [null] }]]) assert.throws(() => authorizeWrite('idps', 'PUT', { focus }, plan, employee), { status: 403 });
  for (const employeeId of [null, {}, ['e3'], 42]) assert.throws(() => authorizeWrite('idps', 'POST', { employeeId }, null, manager), { status: 403 });
});

test('onboarding tasks are writable only by their actual responsible person', () => {
  const plan = { employeeId: 'e3', buddyId: 'e4', tasks: [
    { id: 'a', owner: 'newhire', done: false }, { id: 'b', owner: 'hr', done: false },
    { id: 'c', owner: 'buddy', done: false }, { id: 'd', owner: 'manager', done: false },
  ] };
  const toggle = index => ({ tasks: plan.tasks.map((task, n) => ({ ...task, done: n === index })) });
  assert.doesNotThrow(() => authorizeWrite('onboarding', 'PUT', toggle(0), plan, employee));
  assert.throws(() => authorizeWrite('onboarding', 'PUT', toggle(1), plan, employee), { status: 403 });
  const buddy = { role: 'employee', employeeId: 'e4' };
  assert.doesNotThrow(() => authorizeWrite('onboarding', 'PUT', toggle(2), plan, buddy));
  assert.throws(() => authorizeWrite('onboarding', 'PUT', toggle(1), plan, buddy), { status: 403 });
  assert.doesNotThrow(() => authorizeWrite('onboarding', 'PUT', toggle(3), plan, manager));
  assert.throws(() => authorizeWrite('onboarding', 'PUT', toggle(2), plan, manager), { status: 403 });
  assert.throws(() => authorizeWrite('onboarding', 'PUT', { tasks: [null] }, plan, employee), { status: 403 });
});
