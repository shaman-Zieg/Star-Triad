import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { COMP_KEYS } from '../public/js/engine/competency.js';
import { evaluateCandidate, evaluatePlan, evaluateAll, roleSpec, WEIGHTS } from '../public/js/engine/succession.js';
import { successionNominationError } from '../server/succession-validation.js';

const TODAY = '2026-10-24';
const department = { id: 'sales', name: '销售部', nameEn: 'Sales' };
const departments = { sales: department };
const person = (id, patch = {}) => ({
  id, name: id, nameEn: id, status: 'active', deptId: 'sales', title: '大客户经理', titleEn: 'Key Account Manager', level: 'M2',
  hireDate: '2018-01-01', lastPromotion: TODAY, compaRatio: 1.02, engagement: 5, performance: 5, potential: 3,
  competencies: Object.fromEntries(COMP_KEYS.map((k) => [k, 5])), skills: ['b2b_sales', 'negotiation'], ...patch,
});
const riskPatch = { compaRatio: 0.8, engagement: 1, lastPromotion: '2020-01-01' };
const incumbent = person('inc', { title: '销售总监', titleEn: 'Sales Director' });
const plan = (ids, patch = {}) => ({ id: 'p', title: '销售总监', deptId: 'sales', incumbentId: 'inc', criticality: 'high', successors: ids.map((employeeId) => ({ employeeId })), ...patch });

test('high risk remains explicit even when the candidate also fails function checks', () => {
  const spec = roleSpec(plan([]), incumbent, department);
  const candidate = person('risk', { ...riskPatch, title: '后端工程师', titleEn: 'Backend Engineer', skills: ['java'] });
  const result = evaluateCandidate(candidate, { spec, today: TODAY, departments });
  assert.equal(result.status, 'excluded_risk');
  assert.equal(result.checks.function.ok, false);
  assert.match(result.reasons[0][0], /高/);
  assert.ok(result.reasons.some((r) => /职能不匹配/.test(r[0])));
  const ev = evaluatePlan(plan([]), [incumbent, candidate], { today: TODAY, departments });
  assert.equal(ev.heldBack.length, 0, 'a person who fails other requirements is not presented as held back only by risk');
});

test('priority is deterministic, assigned only to eligible nominees, and scores stay within 100', () => {
  const employees = [incumbent, person('b'), person('a'), person('risk', riskPatch), person('weak', { performance: 3, potential: 1 })];
  const ev = evaluatePlan(plan(['risk', 'weak', 'b', 'a']), employees, { today: TODAY, departments });
  assert.deepEqual(ev.ranked.map((n) => [n.employee.id, n.priority]), [['a', 1], ['b', 2], ['weak', 3]]);
  assert.equal(ev.preferred.employee.id, 'a');
  assert.equal(ev.nominations.find((n) => n.employee.id === 'risk').priority, undefined);
  assert.equal(ev.eligibleCount, 3);
  assert.equal(ev.ranked[0].score, 100);
  assert.equal(Object.values(WEIGHTS).reduce((sum, w) => sum + w, 0), 100);
  const malformed = evaluateCandidate(person('legacy', { performance: 99, potential: 99 }), { spec: ev.spec, today: TODAY, departments });
  assert.ok(malformed.score <= 100, 'legacy out-of-range ratings cannot create a score over 100');
});

test('excluded high-risk history does not inflate effective concentration', () => {
  const employees = [incumbent, person('risk', riskPatch)];
  const result = evaluateAll([1, 2, 3].map((i) => plan(['risk'], { id: `p${i}` })), employees, { today: TODAY, departments });
  assert.equal(result.warnings.length, 0);
  assert.equal(result.concentration.risk, undefined);
  assert.equal(result.summary.weak, 3);
});

test('nomination validation blocks high-risk additions but permits history edits and removals', () => {
  const risky = person('risk', riskPatch);
  const lookup = (id) => id === 'risk' ? risky : person(id);
  assert.match(successionNominationError(plan(['risk']), null, lookup, TODAY), /高流失风险/);
  assert.match(successionNominationError({ successors: [{ employeeId: 'risk' }] }, plan([]), lookup, TODAY), /高流失风险/);
  assert.equal(successionNominationError({ note: 'reviewed' }, plan(['risk']), lookup, TODAY), null);
  assert.equal(successionNominationError({ successors: [{ employeeId: 'risk', note: 'excluded history' }, { employeeId: 'new' }] }, plan(['risk']), lookup, TODAY), null);
  assert.equal(successionNominationError({ successors: [] }, plan(['risk']), lookup, TODAY), null);
  assert.match(successionNominationError({ successors: [{ employeeId: 'risk' }, { employeeId: 'risk' }] }, plan(['risk']), lookup, TODAY), /重复/);
});

test('REST endpoints enforce the risk gate without changing an existing plan on rejection', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhiren-succession-test-'));
  process.env.ZHIREN_DB_PATH = path.join(dir, 'test.db');
  process.env.ZHIREN_AI = '0';
  const db = await import('../server/db.js');
  const { createServer } = await import('../server/index.js');
  db.open();
  const server = createServer();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const safe = db.insert('employees', person('safe', { lastPromotion: db.stamp().slice(0, 10) }));
  const risky = db.insert('employees', person('risk', riskPatch));
  const legacy = db.insert('succession', plan([risky.id]));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, route, body) => {
    const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  const rejected = await call('POST', '/api/succession', plan([risky.id]));
  assert.equal(rejected.status, 400);
  assert.match(rejected.data.error, /高流失风险/);
  const created = await call('POST', '/api/succession', plan([safe.id]));
  assert.equal(created.status, 201);
  const update = await call('PUT', `/api/succession/${created.data.id}`, { successors: [{ employeeId: safe.id }, { employeeId: risky.id }] });
  assert.equal(update.status, 400);
  assert.deepEqual(db.get('succession', created.data.id).successors, [{ employeeId: safe.id }]);
  assert.equal((await call('PUT', `/api/succession/${legacy.id}`, { note: 'review completed' })).status, 200);
  assert.equal((await call('PUT', `/api/succession/${legacy.id}`, { successors: [{ employeeId: risky.id, note: 'excluded history' }, { employeeId: safe.id }] })).status, 200);
  assert.equal((await call('PUT', `/api/succession/${legacy.id}`, { successors: [] })).status, 200);
  assert.equal((await call('PUT', `/api/succession/${legacy.id}`, { successors: [{ employeeId: risky.id }] })).status, 400, 'once removed, a risky candidate cannot be re-added');
});
