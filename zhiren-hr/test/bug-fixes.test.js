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
