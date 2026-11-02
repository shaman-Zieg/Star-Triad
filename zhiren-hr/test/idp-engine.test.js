import test from 'node:test';
import assert from 'node:assert/strict';
import { activeDevelopmentPlan, idpDraftErrors, idpMix, newAction, newFocusArea } from '../public/js/engine/learning.js';

const action = (patch = {}) => ({ type: '70', text: ['实践', 'Practice'], due: '2026-12-01', done: false, ...patch });
const area = (patch = {}) => ({ competency: 'learning', actual: 2, target: 3, actions: [action()], ...patch });
const where = (focus) => idpDraftErrors({ focus }).map((e) => e.where);

test('the active plan ignores retention records and finished plans', () => {
  const idps = [
    { id: 'a', employeeId: 'e1', mode: 'gap', status: 'completed' },
    { id: 'b', employeeId: 'e1', mode: 'retention', status: 'active' },
    { id: 'c', employeeId: 'e1', mode: 'gap', status: 'active' },
    { id: 'd', employeeId: 'e2', mode: 'gap', status: 'active' },
  ];
  assert.equal(activeDevelopmentPlan(idps, 'e1').id, 'c');
  assert.equal(activeDevelopmentPlan(idps.slice(0, 2), 'e1'), null);
  assert.equal(activeDevelopmentPlan(null, 'e1'), null);
});

test('a focus area added by hand starts from the assessed level', () => {
  const emp = { level: 'P4', competencies: { learning: 2, leadership: 5 } };
  assert.deepEqual([newFocusArea('learning', emp, '2027-01-01').actual, newFocusArea('learning', emp, '2027-01-01').target], [2, 3]);
  const strong = newFocusArea('leadership', emp, '2027-01-01');
  assert.deepEqual([strong.actual, strong.target], [5, 5], 'the target never exceeds the scale');
  assert.equal(newFocusArea('learning', {}, '2027-01-01').actual, 1, 'an unassessed competency starts at the bottom');
  assert.deepEqual(newFocusArea('learning', emp, '2027-01-01').actions, [newAction('70', '2027-01-01')]);
});

test('the 70-20-10 mix counts actions across every focus area', () => {
  const focus = [area({ actions: [action(), action(), action({ type: '20' })] }), area({ actions: [action({ type: '10' })] })];
  assert.deepEqual(idpMix(focus).map((m) => [m.type, m.count, m.share]), [['70', 2, 50], ['20', 1, 25], ['10', 1, 25]]);
  assert.deepEqual(idpMix([]).map((m) => m.share), [0, 0, 0]);
});

test('draft errors point at the part of the plan that needs fixing', () => {
  assert.deepEqual(where([area()]), []);
  assert.deepEqual(where([]), [null]);
  assert.deepEqual(where([area(), area()]), ['focus-1']);
  assert.deepEqual(where([area({ actual: 4 })]), ['focus-0']);
  assert.deepEqual(where([area({ actions: [] })]), ['focus-0']);
  assert.deepEqual(where([area({ actions: [action(), action({ text: ['  ', ''] })] })]), ['action-0-1']);
  assert.deepEqual(where([area({ actions: [action({ due: '' })] })]), ['action-0-0']);
  assert.deepEqual(where([area({ actions: [action({ text: ['', ''], courseId: 'k01' })] })]), [], 'a course names the action itself');
  assert.ok(idpDraftErrors({ focus: [] })[0].text.every((t) => typeof t === 'string' && t));
});
