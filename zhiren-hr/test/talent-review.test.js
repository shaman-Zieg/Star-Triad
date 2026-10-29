// Talent review logic on synthetic fixtures (never touches the live database).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, ladderInfo, assessCompetencies, targetProfile, levelRank, COMP_KEYS } from '../public/js/engine/competency.js';
import { personFamily } from '../public/js/engine/jd.js';
import { evaluateCandidate, evaluatePlan, evaluateAll, roleSpec, successionLinks, SUITABILITY } from '../public/js/engine/succession.js';
import { personalInsight, retentionActions, buildFacts } from '../public/js/engine/insight.js';
import { flightRisk } from '../public/js/engine/talent.js';

const TODAY = '2026-10-24';
const all = (v) => Object.fromEntries(COMP_KEYS.map((k) => [k, v]));
const dept = { d06: { id: 'd06', name: '销售部', nameEn: 'Sales' }, d02: { id: 'd02', name: '技术研发部', nameEn: 'Engineering' }, d03: { id: 'd03', name: '产品设计部', nameEn: 'Product & Design' } };
// Low flight risk by default: long tenure, recent promotion, pay at midpoint, engaged.
const person = (id, over = {}) => ({
  id, name: id, nameEn: id, status: 'active', deptId: 'd06', title: '大客户经理', titleEn: 'Key Account Manager', level: 'M1',
  hireDate: '2018-01-01', lastPromotion: '2026-03-01', compaRatio: 1.02, engagement: 4, performance: 4, potential: 2,
  competencies: all(5), skills: ['b2b_sales', 'negotiation'], perfHistory: [{ period: 'H1', rating: 4 }, { period: 'H2', rating: 4 }], ...over,
});
const highRisk = { compaRatio: 0.8, engagement: 1, lastPromotion: '2021-01-01', performance: 5, potential: 3 };
const incumbent = person('vp', { title: '销售副总裁', titleEn: 'VP of Sales', level: 'M3' });
const plan = (successors = [], extra = {}) => ({ id: 'p1', title: '销售副总裁', titleEn: 'VP of Sales', deptId: 'd06', incumbentId: 'vp', criticality: 'critical', successors, ...extra });

test('ladder follows shared bands and never invents levels above the top', () => {
  assert.deepEqual(ladderInfo('P6').sharedLevels, ['P6', 'P7']);
  assert.equal(ladderInfo('P6').nextLevel, 'P8');
  assert.equal(ladderInfo('P6').nextStep, 'P7');
  assert.equal(ladderInfo('P6').nextStepSharesStandard, true);
  assert.equal(ladderInfo('M1').nextLevel, 'M3');
  assert.equal(ladderInfo('P8').trackTop, true);
  assert.equal(ladderInfo('P8').nextLevel, null);
  assert.equal(ladderInfo('M4').trackTop, true);
  for (const l of LEVELS) {
    const info = ladderInfo(l);
    assert.ok(info.nextLevel === null || LEVELS.includes(info.nextLevel), `${l} -> ${info.nextLevel}`);
    assert.notEqual(info.nextLevel, 'M5');
  }
  assert.equal(levelRank('M1'), levelRank('P6'));
});

test('missing competency ratings are missing information, not zero and not a pass', () => {
  const t = targetProfile('P6');
  const none = assessCompetencies(null, t);
  assert.equal(none.status, 'missing');
  assert.equal(none.fit, null);
  assert.equal(none.verdict, 'unassessed');
  assert.equal(none.gaps.length, 0, 'no gaps are claimed without evidence');
  const partial = assessCompetencies({ professional: 4, problem: 4 }, t);
  assert.equal(partial.status, 'partial');
  assert.equal(partial.fit, null);
  assert.equal(partial.missing.length, 6);
  const full = assessCompetencies(t, t);
  assert.equal(full.verdict, 'full');
  assert.equal(full.met, 8);
  assert.equal(assessCompetencies(all(1), t).verdict, 'significant');
});

test('job family uses both titles; department only breaks ties', () => {
  assert.equal(personFamily({ title: '技术副总裁', titleEn: 'VP of Engineering' }, dept.d02), 'tech');
  assert.equal(personFamily({ title: '售前顾问', titleEn: 'Presales Consultant' }, dept.d06), 'sales');
  assert.equal(personFamily({ title: 'UI 设计师', titleEn: 'UI Designer' }, dept.d03), 'design', 'a designer in the product department is not product by department alone');
});

test('candidate eligibility: function, level, performance, data and flight risk', () => {
  const spec = roleSpec(plan(), incumbent, dept.d06);
  assert.equal(spec.family, 'sales');
  assert.equal(spec.level, 'M3');
  assert.ok(spec.critical.includes('leadership'));
  const ctx = { spec, today: TODAY, departments: dept };
  const ok = evaluateCandidate(person('a'), ctx);
  assert.equal(ok.status, 'eligible');
  assert.ok(ok.score >= SUITABILITY.minScore);

  const engineer = person('b', { deptId: 'd02', title: '前端技术经理', titleEn: 'Frontend Engineering Manager', skills: ['javascript', 'react'] });
  const crossNo = evaluateCandidate(engineer, ctx);
  assert.equal(crossNo.status, 'excluded');
  assert.match(crossNo.reasons[0][1], /Function mismatch/);
  const crossYes = evaluateCandidate(engineer, { ...ctx, nomination: { evidence: '曾负责华东区大客户业务 2 年' } });
  assert.equal(crossYes.checks.function.kind, 'justified');
  assert.notEqual(crossYes.status, 'excluded');

  const risky = evaluateCandidate(person('c', highRisk), ctx);
  assert.equal(flightRisk(person('c', highRisk), TODAY).level, 'high');
  assert.equal(risky.status, 'excluded_risk');

  assert.equal(evaluateCandidate(person('d', { competencies: null }), ctx).status, 'insufficient_data');
  assert.equal(evaluateCandidate(person('e', { performance: 2 }), ctx).status, 'excluded');
  assert.equal(evaluateCandidate(person('f', { level: 'P2' }), ctx).status, 'excluded', 'too far below the role');
  assert.equal(evaluateCandidate(person('g', { level: 'M4' }), { ...ctx, spec: { ...spec, level: 'M1' } }).status, 'excluded', 'well above the role');
  assert.equal(evaluateCandidate(person('h', { level: 'M4', competencies: all(5) }), { ...ctx, spec: { ...spec, level: 'M3' } }).checks.level.ok, true, 'one step above is a lateral move');
});

test('score components do not double count competency evidence', () => {
  const spec = roleSpec(plan(), incumbent, dept.d06);
  const ctx = { spec, today: TODAY, departments: dept };
  const near = evaluateCandidate(person('a', { level: 'M2' }), ctx);
  const far = evaluateCandidate(person('b', { level: 'P5' }), ctx);
  assert.equal(near.components.fit, far.components.fit, 'same ratings, same fit');
  assert.ok(near.components.readiness > far.components.readiness, 'readiness depends only on level distance');
  assert.equal(near.readiness, 'now');
  assert.equal(far.readiness, 'y3');
  assert.equal(Object.values(near.components).reduce((a, b) => a + b, 0), near.score);
});

test('plan: preferred only when suitable; high-risk and ineligible never count as coverage', () => {
  const employees = [incumbent, person('a'), person('risky', highRisk), person('eng', { deptId: 'd02', title: '前端技术经理', titleEn: 'Frontend Engineering Manager', skills: ['react'] }), person('weak', { competencies: all(2) })];
  const ev = evaluatePlan(plan([{ employeeId: 'risky', readiness: 'now' }, { employeeId: 'eng', readiness: 'now' }, { employeeId: 'weak', readiness: 'now' }]), employees, { today: TODAY, departments: dept });
  assert.equal(ev.preferred, null, 'nobody suitable among the nominees');
  assert.equal(ev.coverage, 'weak');
  const statuses = Object.fromEntries(ev.nominations.map((n) => [n.employee.id, n.status]));
  assert.deepEqual(statuses, { risky: 'excluded_risk', eng: 'excluded', weak: 'below_bar' });
  assert.ok(ev.suggestions.some((x) => x.employee.id === 'a'), 'the suitable non-nominee is suggested');
  const open = evaluatePlan(plan([]), employees, { today: TODAY, departments: dept });
  assert.ok(!open.suggestions.some((x) => x.employee.id === 'risky'), 'high-risk people are never suggested');
  assert.ok(open.heldBack.some((x) => x.employee.id === 'risky'), 'but they are shown as held back');

  const covered = evaluatePlan(plan([{ employeeId: 'a', readiness: 'y1' }, { employeeId: 'risky', readiness: 'now' }]), employees, { today: TODAY, departments: dept });
  assert.equal(covered.preferred.employee.id, 'a');
  assert.equal(covered.eligibleCount, 1, 'the high-risk nominee is not counted');
});

test('concentration warnings, links and urgency order', () => {
  const employees = [incumbent, person('a'), person('inc2', { level: 'M3' }), person('inc3', { level: 'M3' })];
  const plans = [plan([{ employeeId: 'a' }]), { ...plan([{ employeeId: 'a' }]), id: 'p2', incumbentId: 'inc2', criticality: 'medium' }, { ...plan([{ employeeId: 'a' }]), id: 'p3', incumbentId: 'inc3', criticality: 'high' }];
  const r = evaluateAll(plans, employees, { today: TODAY, departments: Object.values(dept) });
  const w = r.warnings.find((x) => x.employeeId === 'a');
  assert.ok(w, 'nominated in 3 plans');
  assert.equal(w.preferred.length, 3);
  assert.deepEqual(r.plans.map((p) => p.plan.criticality), ['critical', 'high', 'medium']);
  const links = successionLinks('a', r);
  assert.equal(links.own.length, 0);
  assert.equal(links.asCandidate.length, 3);
  assert.equal(successionLinks('vp', r).own[0].plan.id, 'p1');
});

test('insight: grounded, separated, and different for people in the same 9-box cell', () => {
  const ctx = { today: TODAY, evaluation: null, idps: [], enrollments: [], courses: [] };
  const a = person('a', { performance: 5, potential: 3, ...highRisk, level: 'P6', title: '高级数据分析师', titleEn: 'Senior Data Analyst' });
  const b = person('b', { performance: 5, potential: 3, level: 'P6', title: '高级数据分析师', titleEn: 'Senior Data Analyst', competencies: { ...targetProfile('P6'), communication: 2 }, perfHistory: [{ rating: 3 }, { rating: 5 }] });
  const ia = personalInsight(a, ctx);
  const ib = personalInsight(b, ctx);
  assert.notDeepEqual(ia.actions.map((x) => x.text[0]), ib.actions.map((x) => x.text[0]));
  for (const ins of [ia, ib]) {
    const ids = new Set(ins.facts.map((f) => f.id));
    for (const item of [...ins.observations, ...ins.hypotheses, ...ins.actions]) {
      assert.ok(item.facts.length > 0, `cites facts: ${item.text[1]}`);
      assert.ok(item.facts.every((id) => ids.has(id)), 'only known facts');
    }
  }
  const pay = ia.actions.find((x) => x.kind === 'pay');
  assert.match(pay.text[0], /不能证明/);
  assert.match(pay.text[1], /not proof/);
  assert.ok(ia.hypotheses.every((h) => /确认|验证|了解|可能/.test(h.text[0])), 'hypotheses are framed as things to verify');
  assert.equal(retentionActions(ia)[0].factor, flightRisk(a, TODAY).factors[0].key, 'retention actions follow the top risk factor');
});

test('insight with missing competency data asks for an assessment and claims no gaps', () => {
  const ins = personalInsight(person('n', { competencies: null }), { today: TODAY, idps: [], enrollments: [], courses: [] });
  assert.ok(ins.facts.some((f) => f.id === 'comp_missing'));
  assert.equal(ins.actions[0].kind, 'assess');
  assert.ok(!ins.actions.some((x) => x.kind === 'development'));
  assert.ok(!buildFacts(person('n', { competencies: null }), { today: TODAY }).facts.some((f) => f.id.startsWith('gap_')));
});
