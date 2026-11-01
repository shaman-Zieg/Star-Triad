import test from 'node:test';
import assert from 'node:assert/strict';
import { validationErrors } from '../public/js/engine/validation.js';
import { generate } from '../server/seed.js';
import { buildRetentionPlan } from '../public/js/engine/retention.js';
import { potentialFromAgility } from '../public/js/engine/talent.js';

const data = generate(new Date(2026, 9, 21));
const lookup = (col, id) => data[col]?.find(row => row.id === id);
const errors = (col, patch) => validationErrors(col, { ...structuredClone(data[col][0]), ...patch }, lookup);
const invalid = (col, patch, field) => assert.ok(errors(col, patch).some(error => error.includes(field)), JSON.stringify({ col, patch, errors: errors(col, patch) }));

test('all seeded collections satisfy shared validation with references', () => {
  for (const [col, rows] of Object.entries(data)) {
    if (col === 'activity') continue;
    for (const row of rows) assert.deepEqual(validationErrors(col, row, lookup), [], `${col}/${row.id}`);
  }
});

test('employee ratings reject coercion, non-finite numbers and out-of-range values', () => {
  for (const value of [99, 0, -1, 1.5, '4', true, [], {}, Infinity, NaN]) invalid('employees', { performance: value }, 'performance');
  invalid('employees', { potential: 4 }, 'potential');
  invalid('employees', { engagement: 6 }, 'engagement');
  invalid('employees', { competencies: { professional: 99 } }, 'competencies.professional');
  invalid('employees', { competencies: { invented: 3 } }, 'unknown field');
  invalid('employees', { perfHistory: [{ period: 'H1', rating: 6 }] }, 'rating');
  assert.deepEqual(errors('employees', { competencies: null, performance: null, potential: null }), []);
  assert.deepEqual(errors('employees', { agility: { ...(({ dims, avg }) => ({ dims, avg }))(potentialFromAgility({ mental0: 4 })), at: '2026-10-21' } }), []);
});

test('required fields, date ordering, enums, lengths and references are enforced', () => {
  assert.ok(validationErrors('employees', {}).some(e => e.includes('name')));
  invalid('employees', { name: '   ' }, 'name');
  invalid('employees', { name: 'a'.repeat(301) }, 'name');
  invalid('employees', { status: 'admin' }, 'status');
  invalid('employees', { level: 'P99' }, 'level');
  invalid('employees', { hireDate: '2026-02-30' }, 'hireDate');
  invalid('employees', { status: 'left', leaveDate: null }, 'leaveDate');
  invalid('employees', { leaveDate: '2001-01-01' }, 'leaveDate');
  invalid('employees', { managerId: 'nonexistent' }, 'managerId');
  invalid('employees', { deptId: 'nonexistent' }, 'deptId');
  invalid('employees', { managerId: data.employees[0].id }, 'managerId');
  invalid('employees', { email: 'no email' }, 'email');
  invalid('employees', { managerId: data.employees[1].id }, 'management cycle');
  invalid('departments', { parentId: data.departments[1].id }, 'department cycle');
  invalid('positions', { salaryMin: 50, salaryMax: 20 }, 'salaryMax');
  invalid('positions', { headcount: -1 }, 'headcount');
  invalid('surveys', { scope: 'nonexistent' }, 'scope');
  invalid('surveys', { anonymous: false }, 'anonymous');
  assert.deepEqual(validationErrors('employees', { ...data.employees[0], deptId: 'external' }), [], 'preview can validate before a lookup is available');
});

test('nested scores, plans, requests and matrix data cannot bypass validation', () => {
  const interview = { id: 'iv1', round: 'r1', interviewerId: data.employees[0].id, date: '2026-10-21', scores: { professional: 99 } };
  invalid('candidates', { interviews: [interview] }, 'scores.professional');
  invalid('candidates', { stage: 'unknown' }, 'stage');
  invalid('candidates', { interviews: [{ ...interview, scores: {}, isAdmin: true }] }, 'unknown field');
  invalid('candidates', { interviews: [{ ...interview, scores: {} }, { ...interview, scores: {} }] }, 'duplicate');
  invalid('idps', { focus: [{ competency: 'professional', actual: 3, target: 9, actions: [] }] }, 'target');
  invalid('idps', { focus: undefined }, 'focus');
  invalid('tickets', { comments: [{ by: data.employees[0].id, at: '2026-10-21 10:00:00', text: { x: 1 } }] }, 'text');
  invalid('onboarding', { tasks: [{ ...data.onboarding[0].tasks[0], done: 'true' }] }, 'done');
  invalid('raci', { steps: [{ name: 'Step', cells: ['A'] }] }, 'cells');
  invalid('enrollments', { progress: 101 }, 'progress');
  invalid('kb', { body: 123 }, 'body');
  invalid('courses', { format: 'anything' }, 'format');
  assert.deepEqual(errors('tickets', { detail: '' }), [], 'request description is optional in the form');
  assert.deepEqual(errors('candidates', { email: null, phone: null }), [], 'resume parser uses null for absent contact details');
});

test('retention plans and editable reviews validate without losing the generated evidence', () => {
  const plan = data.employees.map(e => buildRetentionPlan(e, '2026-10-21')).find(Boolean);
  assert.ok(plan);
  assert.deepEqual(validationErrors('idps', plan, lookup), []);
  plan.actions[0].done = true;
  plan.reviews.push({ checkpoint: '30', date: '2026-11-20', note: 'Reviewed', nextStep: 'Follow up', riskScore: 40, engagement: 3, employmentStatus: 'active', progress: 50 });
  assert.deepEqual(validationErrors('idps', plan, lookup), []);
  plan.reviews[0].riskScore = 101;
  assert.match(validationErrors('idps', plan, lookup).join(' '), /riskScore/);
});

test('unknown and prototype keys are rejected without mutation or unbounded traversal', () => {
  const input = { ...data.employees[0], admin: true };
  const before = structuredClone(input);
  assert.match(validationErrors('employees', input, lookup).join(' '), /unknown field admin/);
  assert.deepEqual(input, before);
  assert.match(validationErrors('departments', JSON.parse('{"name":"A","__proto__":{"admin":true}}')).join(' '), /unknown field __proto__/);
  assert.ok(validationErrors('departments', null).length);
  assert.ok(validationErrors('departments', []).length);
  assert.ok(validationErrors('unknown', {}).length);
  invalid('candidates', { notes: Array(501).fill({}) }, 'array');
});

test('RACI cells accept the combined A/R role', () => {
  const matrix = { title: 'Process', roles: ['Owner'], steps: [{ name: 'Step', cells: ['A/R'] }] };
  assert.deepEqual(validationErrors('raci', matrix), []);
  assert.ok(validationErrors('raci', { ...matrix, steps: [{ name: 'Step', cells: ['R/A'] }] }).length);
});
