import test from 'node:test';
import assert from 'node:assert/strict';
import { personalInsight } from '../public/js/engine/insight.js';
import { generate } from '../server/seed.js';

const data = generate(new Date(2026, 9, 21));
const TODAY = '2026-10-21';

test('only an active development plan counts as one in the individual insight', () => {
  const emp = data.employees.find((e) => e.competencies && e.status !== 'left');
  const factIds = (idps) => personalInsight(emp, { today: TODAY, idps, enrollments: [], courses: [] }).facts.map((f) => f.id);
  const plan = (patch) => ({ id: 'x', employeeId: emp.id, mode: 'gap', status: 'active', focus: [], ...patch });
  assert.ok(factIds([plan()]).includes('idp'));
  for (const idps of [[], [plan({ status: 'completed' })], [plan({ status: 'cancelled' })], [plan({ mode: 'retention', actions: [] })]]) {
    assert.ok(factIds(idps).includes('no_idp'), JSON.stringify(idps));
  }
});

test('a new hire with no ratings is valid and stays outside the talent grid', async () => {
  const { validationErrors } = await import('../public/js/engine/validation.js');
  const { boxKey, flightRisk } = await import('../public/js/engine/talent.js');
  const hire = { name: '新人', deptId: data.departments[0].id, title: '工程师', level: 'P4', hireDate: TODAY, status: 'active', performance: null, potential: null, engagement: null, competencies: null, perfHistory: [] };
  assert.deepEqual(validationErrors('employees', hire), []);
  assert.equal(boxKey(hire.performance, hire.potential), null);
  assert.equal(flightRisk(hire, TODAY).regrettable, false);
});

test('the activity feed words a status change for the kind of record', async () => {
  const { activityStatusWord } = await import('../public/js/engine/service.js');
  assert.equal(activityStatusWord('idps', 'completed')[0], '已完成');
  assert.equal(activityStatusWord('idps', 'active')[0], '进行中');
  assert.equal(activityStatusWord('employees', 'active')[0], '在职');
  assert.equal(activityStatusWord('positions', 'open')[0], '招聘中');
  assert.equal(activityStatusWord('tickets', 'open')[0], '待处理');
  assert.deepEqual(activityStatusWord('raci', 'odd'), ['odd', 'odd']);
});
