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

test('all writes validate full documents and rejected patches leave data and activity untouched', async () => {
  const employee = db.list('employees')[0];
  const before = structuredClone(employee);
  const activity = db.recentActivity(1);
  for (const patch of [{ performance: 99 }, { potential: 4 }, { performance: '4' }, { deptId: 'missing' }, { competencies: { professional: 99 } }, { isAdmin: true }]) {
    const result = await call('PUT', `/api/employees/${employee.id}`, patch);
    assert.equal(result.status, 400, JSON.stringify(result));
    assert.deepEqual(db.get('employees', employee.id), before);
  }
  assert.deepEqual(db.recentActivity(1), activity);
  const count = db.count('employees');
  assert.equal((await call('POST', '/api/employees', { ...employee, performance: 99 })).status, 400);
  assert.equal(db.count('employees'), count);
  for (const col of Object.keys(db.COLLECTIONS).filter(c => c !== 'responses')) {
    assert.equal((await call('POST', `/api/${col}`, {})).status, 400, col);
  }
  const candidate = db.list('candidates').find(c => c.interviews.length);
  const interviews = structuredClone(candidate.interviews);
  interviews[0].scores.professional = 99;
  assert.equal((await call('PUT', `/api/candidates/${candidate.id}`, { interviews })).status, 400);
  assert.deepEqual(db.get('candidates', candidate.id), candidate);
  const valid = await call('PUT', `/api/employees/${employee.id}`, { performance: 4 });
  assert.equal(valid.status, 200);
  assert.equal(valid.data.performance, 4);
  await call('PUT', `/api/employees/${employee.id}`, { performance: before.performance });
  assert.equal((await call('PUT', '/api/employees/does-not-exist', { performance: 99 })).status, 404);
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

test('employee CSV preview is read-only and confirmation saves only a fully valid fresh batch', async () => {
  const header = '姓名,职位,部门,入职日期,工号,邮箱,绩效,潜力\n';
  const csv = header + '导入甲,工程师,d02,2026-10-01,IMPORT-A,import-a@example.test,4,2\n导入乙,工程师,d02,2026-10-01,IMPORT-B,import-b@example.test,,\n';
  const before = db.count('employees');
  const log = db.recentActivity(1);
  const preview = await call('POST', '/api/employees/import-preview', { csv });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.valid, true);
  assert.equal(db.count('employees'), before);
  assert.deepEqual(db.recentActivity(1), log);
  const bad = await call('POST', '/api/employees/import', { csv: csv.replace(',4,2', ',99,2') });
  assert.equal(bad.status, 409);
  assert.equal(bad.data.rows[0].line, 2);
  assert.equal(db.count('employees'), before);
  const saved = await call('POST', '/api/employees/import', { csv });
  assert.equal(saved.status, 201);
  assert.equal(saved.data.count, 2);
  assert.equal(db.count('employees'), before + 2);
  assert.equal(db.get('employees', saved.data.ids[1]).performance, null, 'missing ratings are not invented');
  assert.equal((await call('POST', '/api/employees/import', { csv })).status, 409, 'replaying a batch cannot duplicate employees');
  assert.equal(db.count('employees'), before + 2);
  for (const id of saved.data.ids) await call('DELETE', `/api/employees/${id}`);
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
  assert.deepEqual(ok.data, { ok: true }, 'submissions do not echo identifiable response records');
  assert.equal(ok.data.createdBy, undefined, 'responses never record who answered');
  const act = (await call('GET', '/api/activity?limit=1')).data[0];
  assert.equal(act.actor, null);
  assert.equal((await call('POST', '/api/responses', { surveyId: closed.id, answers: { x0: 3 } })).status, 400);
  assert.equal((await call('POST', '/api/responses', { surveyId: open.id, answers: {} })).status, 400);
  assert.equal(act.docId, null);
  assert.equal((await call('PUT', '/api/responses/any-response', { answers: {} })).status, 405);
});

test('raw survey answers never leave API or export, and aggregate filters cannot isolate respondents', async () => {
  const response = db.list('responses')[0];
  for (const path of ['/api/responses', `/api/responses/${response.id}`, `/api/responses?deptId=${response.deptId}`, `/api/responses?id=${response.id}`]) {
    const result = await call('GET', path);
    assert.equal(result.status, 403);
    assert.equal(result.data.answers, undefined);
  }
  assert.equal((await call('GET', '/api/survey-results?deptId=d01')).status, 400);
  assert.equal((await call('GET', `/api/survey-results/${response.surveyId}?id=${response.id}`)).status, 400);
  assert.equal((await call('GET', '/api/survey-results/missing')).status, 404);
  const aggregate = await call('GET', `/api/survey-results/${response.surveyId}`);
  assert.equal(aggregate.status, 200);
  assert.equal(aggregate.data.privacy.minimumGroup, 5);
  const exported = await call('GET', '/api/export');
  assert.equal(exported.data.responses, undefined);
  assert.ok(exported.data.surveyResults.length);
  assert.deepEqual(exported.data.surveyResults.find(s => s.surveyId === response.surveyId), aggregate.data);
  assert.doesNotMatch(JSON.stringify(exported.data.surveyResults), /"answers"|"createdAt"|"createdBy"/);
  assert.ok(exported.data.surveyResults.every(s => s.comments.length === 0));
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

