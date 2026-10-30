import test from 'node:test';
import assert from 'node:assert/strict';
import { hiringGap, crossRoleRecommendations } from '../public/js/engine/cross-role.js';
import { buildRetentionPlan, retentionEligible, retentionProgress } from '../public/js/engine/retention.js';

const today = '2026-10-30';
const role = { id: 'p1', status: 'open', priority: 'high', openedAt: '2026-09-01', headcount: 2, minYears: 3, education: 3, skills: ['java'], niceSkills: [] };
const candidate = (id, extra = {}) => ({ id, positionId: 'p2', stage: 'screen', resume: '本科，5年开发经验，Java', ...extra });
const employee = { id: 'e1', status: 'active', hireDate: '2020-01-01', lastPromotion: '2020-01-01', performance: 5, potential: 3, compaRatio: 0.8, engagement: 1 };

test('urgent vacancies require >30 days, high priority, open status and unfilled headcount', () => {
  assert.equal(hiringGap(role, [], today).urgent, true);
  for (const patch of [{ openedAt: '2026-09-30' }, { status: 'closed' }, { priority: 'medium' }]) assert.equal(hiringGap({ ...role, ...patch }, [], today).urgent, false);
  assert.equal(hiringGap(role, [candidate('1', { positionId: 'p1', stage: 'hired' }), candidate('2', { positionId: 'p1', stage: 'hired' })], today).urgent, false);
});

test('cross-role recommendations enforce every hard requirement and preserve original application', () => {
  const people = [candidate('good'), candidate('own', { positionId: 'p1' }), candidate('hired', { stage: 'hired' }), candidate('offer', { stage: 'offer' }), candidate('missing', { resume: 'Java' }), candidate('skill', { resume: '本科，5年开发经验，Python' }), candidate('junior', { resume: '本科，1年开发经验，Java' }), candidate('edu', { resume: '大专，5年开发经验，Java' })];
  const before = JSON.stringify(people);
  assert.deepEqual(crossRoleRecommendations(role, people, today).map(x => x.candidate.id), ['good']);
  assert.equal(JSON.stringify(people), before);
  assert.equal(crossRoleRecommendations(role, Array.from({ length: 5 }, (_, i) => candidate(String(i))), today).length, 3);
  assert.deepEqual(crossRoleRecommendations({ ...role, priority: 'low' }, people, today), []);
});

test('retention plans target high-risk key talent, retain baseline and actionable interventions', () => {
  assert.equal(retentionEligible(employee, today), true);
  assert.equal(buildRetentionPlan({ ...employee, status: 'left' }, today), null);
  assert.equal(buildRetentionPlan({ ...employee, performance: 3, potential: 2 }, today), null);
  assert.equal(buildRetentionPlan({ ...employee, compaRatio: 1, engagement: 5, lastPromotion: today }, today), null);
  const plan = buildRetentionPlan(employee, today);
  assert.ok(plan.baseline.score >= 55);
  assert.equal(plan.reviewDue, '2027-01-28');
  assert.ok(plan.actions.some(a => a.key === 'pay'));
  assert.ok(plan.actions.some(a => a.key === 'promotion'));
  assert.ok(plan.actions.every(a => a.reason && a.owner && a.evidence && a.due));
  assert.equal(retentionProgress(plan), 0);
  plan.actions.forEach(a => { a.done = true; });
  assert.equal(retentionProgress(plan), 100);
  assert.deepEqual(plan.reviews, []);
});
