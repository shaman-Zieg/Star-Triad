import test from 'node:test';
import assert from 'node:assert/strict';
import { previewEmployees } from '../public/js/engine/employee-import.js';
import { boxKey, boxOf, distribution, ratingsForBox, hasTalentRatings } from '../public/js/engine/talent.js';
import { personalInsight } from '../public/js/engine/insight.js';
import { evaluateCandidate, evaluatePlan, roleSpec } from '../public/js/engine/succession.js';
import { targetProfile } from '../public/js/engine/competency.js';

const departments = [{ id: 'd1', name: 'Engineering' }];
const preview = previewEmployees('name,title,department,hireDate,empNo\nNew employee,Engineer,d1,2026-10-01,NEW1', [], departments);
assert.equal(preview.valid, true);
const imported = preview.rows[0].employee;
const ctx = { today: '2026-11-01' };

test('missing, partial and invalid talent ratings have no grid classification', () => {
  for (const [performance, potential] of [[null, null], [undefined, 3], [4, null], [0, 1], [6, 3], ['4', 3], [4, 1.5]]) {
    const employee = { ...imported, performance, potential };
    assert.equal(boxKey(performance, potential), null);
    assert.equal(boxOf(employee), null);
    assert.equal(hasTalentRatings(employee), false);
  }
  assert.equal(boxKey(1, 1), 0, 'a recorded low score still has its correct classification');
  assert.deepEqual(ratingsForBox(0, imported), { performance: 2, potential: 1 }, 'assigning a box must not preserve a missing score');
});

test('unassessed imports do not change calibrated distributions or their denominator', () => {
  const rated = Array.from({ length: 10 }, () => ({ performance: 5, potential: 3 }));
  const original = distribution(rated);
  const mixed = distribution([...rated, ...Array.from({ length: 20 }, () => imported)]);
  assert.deepEqual(mixed.counts, original.counts);
  assert.deepEqual(mixed.checks, original.checks);
  assert.equal(mixed.n, 10);
  assert.equal(mixed.unassessed, 20);
  assert.equal(mixed.total, 30);
  const empty = distribution([imported]);
  assert.equal(empty.counts[0], 0);
  assert.deepEqual(empty.checks, []);
});

test('an unassessed employee receives assessment guidance instead of a low-performance plan', () => {
  const result = personalInsight(imported, ctx);
  assert.ok(result.facts.some(fact => fact.id === 'talent_missing'));
  assert.ok(!result.facts.some(fact => fact.id === 'box'));
  assert.match(result.summary[0], /绩效尚未评估/);
  assert.doesNotMatch(JSON.stringify(result), /null（|null \(|Underperformer|绩效改进计划|60-90 day improvement/);
  assert.ok(result.actions.some(action => action.kind === 'assess'));
  assert.ok(!result.actions.some(action => action.kind === 'performance'));
  const ids = new Set(result.facts.map(fact => fact.id));
  assert.ok(result.actions.every(action => action.facts.length && action.facts.every(id => ids.has(id))));
});

test('missing pay or engagement cannot trigger hypotheses that either is low', () => {
  const result = personalInsight({ ...imported, hireDate: '2020-01-01', performance: 4, potential: 2, managerChanged: true }, ctx);
  assert.deepEqual(result.hypotheses, []);
  assert.ok(!result.facts.some(fact => ['pay', 'engagement'].includes(fact.id)));
  const low = personalInsight({ ...imported, performance: 2 }, ctx);
  assert.ok(low.actions.some(action => action.kind === 'performance' && action.facts.includes('performance')), 'an explicit low performance rating remains actionable even without a potential rating');
});

test('succession distinguishes missing ratings from low ratings and never recommends them', () => {
  const incumbent = { ...imported, id: 'incumbent', performance: 4, potential: 3, competencies: targetProfile('P4') };
  const plan = { id: 'plan', title: 'Engineer', incumbentId: incumbent.id, successors: [] };
  const spec = roleSpec(plan, incumbent);
  for (const missing of [{ performance: null, potential: 3 }, { performance: 4, potential: null }]) {
    const employee = { ...incumbent, id: 'candidate', ...missing };
    const evaluated = evaluateCandidate(employee, { ...ctx, spec });
    assert.equal(evaluated.status, 'insufficient_data');
    assert.equal(evaluated.score, null);
    assert.equal(evaluated.components, null);
    assert.doesNotMatch(JSON.stringify(evaluated.reasons), /低于 3|below 3/);
    assert.equal(evaluatePlan(plan, [incumbent, employee], ctx).suggestions.length, 0);
  }
});
