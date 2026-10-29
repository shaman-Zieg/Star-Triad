import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResume, matchCandidate } from '../public/js/engine/resume.js';
import { extractSkills } from '../public/js/engine/skills.js';
import { checkInclusive, generateJD, detectFamily } from '../public/js/engine/jd.js';
import { aggregateScorecards, planInterview } from '../public/js/engine/interview.js';
import { boxKey, ratingsForBox, distribution, flightRisk, potentialFromAgility } from '../public/js/engine/talent.js';
import { buildIDP, tna, evaluateProgram } from '../public/js/engine/learning.js';
import { targetProfile, fitScore } from '../public/js/engine/competency.js';
import { scoreSurvey, MODELS, enps, diagnosisReport } from '../public/js/engine/diagnosis.js';
import { checkRaci } from '../public/js/engine/raci.js';
import { annualLeave, overtimePay, salaryBand, compaRatio, turnover, recruitingFunnel, headcountPlan } from '../public/js/engine/calc.js';
import { searchKB, KB_ARTICLES, dueDate, buildChecklist } from '../public/js/engine/service.js';

const TODAY = new Date(2026, 9, 21);

const ZH_RESUME = `李明
电话：13912345678 | 邮箱：liming@mail.example
工作经历
2021.03-至今  某电商公司  高级前端工程师
· 使用 React、TypeScript 重构交易链路，性能提升 30%
· 带领 5 人团队完成组件库建设
2018.07-2021.02  某软件公司  前端工程师
教育背景
2014.09-2018.06  浙江大学  计算机科学与技术  本科
证书：PMP`;

test('parses a Chinese resume: experience, education, skills, contacts', () => {
  const p = parseResume(ZH_RESUME, TODAY);
  assert.equal(p.education, 3);
  assert.ok(p.years >= 8 && p.years <= 8.5, `years ${p.years}`);
  assert.equal(p.jobs, 2, 'education period must not count as a job');
  assert.ok(p.skills.includes('react') && p.skills.includes('typescript'));
  assert.ok(!p.skills.includes('java'), 'JavaScript-like text must not match Java');
  assert.equal(p.phone, '139****5678');
  assert.equal(p.management, true);
  assert.equal(p.teamSize, 5);
  assert.deepEqual(p.certs, ['PMP']);
  assert.ok(p.achievements.length >= 1);
});

test('parses an English resume with "Present" and explicit years', () => {
  const p = parseResume(`Jane Doe\n7+ years of experience in data analytics\n2020.02 - Present  Senior Analyst\nSKILLS: SQL, Python, Tableau\nMaster of Science, 2019`, TODAY);
  assert.equal(p.education, 4);
  assert.ok(p.years >= 7);
  assert.ok(['sql', 'python', 'bi'].every((k) => p.skills.includes(k)));
});

test('skill matching respects word boundaries and case-sensitive aliases', () => {
  assert.deepEqual(extractSkills('JavaScript only'), ['javascript']);
  assert.ok(extractSkills('Golang and Go 语言').includes('go'));
  assert.ok(!extractSkills('let us go to the park').includes('go'));
});

test('matching ranks a fitting resume above a weak one and explains gaps', () => {
  const pos = { skills: ['javascript', 'typescript', 'react'], niceSkills: ['nodejs'], minYears: 5, education: 3, level: 'P6' };
  const strong = matchCandidate(parseResume(ZH_RESUME, TODAY), pos);
  const weak = matchCandidate(parseResume('王五\n2024.01-至今 某公司 运营专员\n大专', TODAY), pos);
  assert.ok(strong.score > weak.score + 30);
  assert.equal(strong.tier, 'strong');
  assert.deepEqual(weak.missing.sort(), ['javascript', 'react', 'typescript']);
  assert.ok(weak.risks.some((r) => r.level === 'high'));
  assert.ok(weak.probes.length > 0);
});

test('JD checker flags discriminatory wording; generated JDs pass', () => {
  const hits = checkInclusive('要求：男性优先，年龄35岁以下，已婚已育，接受996');
  const levels = hits.map((h) => h.level);
  assert.ok(levels.includes('high'));
  assert.ok(hits.some((h) => h.terms.includes('男性优先')));
  assert.ok(hits.some((h) => h.terms.some((t) => t.includes('35'))));
  const jd = generateJD({ title: '高级前端工程师', level: 'P6', skills: ['react'], minYears: 5, education: 3 });
  assert.equal(checkInclusive(jd).filter((h) => h.level !== 'low').length, 0);
  assert.equal(detectFamily('数据开发工程师'), 'data');
  assert.equal(detectFamily('Key Account Manager'), 'sales');
});

test('interview plan and scorecard aggregation', () => {
  const plan = planInterview({ title: '销售经理', level: 'M1' });
  assert.equal(plan.focus[0], 'leadership');
  const agg = aggregateScorecards([
    { scores: { execution: 5, communication: 4 }, recommendation: 'strong_yes' },
    { scores: { execution: 2, communication: 4 }, recommendation: 'no' },
    { scores: {}, recommendation: null },
  ]);
  assert.equal(agg.count, 2);
  assert.ok(agg.disagreements.includes('execution'));
  assert.equal(agg.decision, 'discuss');
});

test('9-box keys, drag defaults and calibration checks', () => {
  assert.equal(boxKey(5, 3), 22);
  assert.equal(boxKey(1, 1), 0);
  assert.equal(boxKey(3, 2), 11);
  assert.deepEqual(ratingsForBox(12, { performance: 5, potential: 1 }), { performance: 5, potential: 2 });
  const inflated = distribution(Array.from({ length: 10 }, () => ({ performance: 5, potential: 3 })));
  assert.equal(inflated.checks[0].level, 'warn');
});

test('flight risk adds transparent factors', () => {
  const base = { hireDate: '2024-01-01', lastPromotion: '2024-01-01', compaRatio: 1.05, engagement: 4, performance: 3, potential: 1 };
  const calm = flightRisk(base, '2024-08-01');
  const risky = flightRisk({ ...base, compaRatio: 0.85, engagement: 2, performance: 5, potential: 3 }, '2026-10-01');
  assert.equal(calm.level, 'low');
  assert.equal(risky.level, 'high');
  assert.equal(risky.regrettable, true);
  assert.equal(flightRisk({ ...base, status: 'left' }, '2026-10-01'), null);
});

test('agility-based potential', () => {
  assert.equal(potentialFromAgility({ mental0: 5, mental1: 4, people0: 4, people1: 5 }).potential, 3);
  assert.equal(potentialFromAgility({}).potential, null);
});

test('IDP follows 70-20-10 and targets the next level when gaps are closed', () => {
  const gap = buildIDP({ level: 'P6', competencies: { professional: 2, problem: 3, execution: 4, communication: 3, collaboration: 3, learning: 3, innovation: 3, leadership: 3 } }, undefined, '2026-01-01');
  assert.equal(gap.mode, 'gap');
  assert.equal(gap.focus[0].competency, 'professional');
  assert.deepEqual([...new Set(gap.focus[0].actions.map((a) => a.type))].sort(), ['10', '20', '70']);
  const t = targetProfile('P6');
  assert.equal(buildIDP({ level: 'P6', competencies: t }).mode, 'growth');
  assert.equal(fitScore(t, t), 100);
  assert.equal(buildIDP({ level: 'P6', competencies: null }).mode, 'unassessed', 'no plan without an assessment');
});

test('training needs analysis ranks the widest, deepest gaps first', () => {
  const people = [
    { level: 'P4', deptId: 'd1', competencies: { professional: 1, problem: 3, execution: 3, communication: 3, collaboration: 3, learning: 3, innovation: 3, leadership: 2 } },
    { level: 'P4', deptId: 'd1', competencies: { professional: 2, problem: 3, execution: 3, communication: 3, collaboration: 3, learning: 3, innovation: 3, leadership: 2 } },
  ];
  const r = tna(people, [{ id: 'd1' }]);
  assert.equal(r.byComp[0].key, 'professional');
  assert.equal(r.byComp[0].share, 1);
  assert.equal(r.matrix[0].cells.professional, 1.5);
});

test('program evaluation computes Kirkpatrick levels and ROI', () => {
  const r = evaluateProgram({ reaction: 4.5, pre: 60, post: 80, behavior: 3.8, metricBefore: 100, metricAfter: 110, benefit: 150000, cost: 50000 });
  assert.equal(r.levels.length, 4);
  assert.equal(r.roi, 200);
  assert.equal(r.bcr, 3);
});

test('survey scoring suppresses small groups and computes eNPS', () => {
  const model = MODELS.engagement;
  const answers = (v) => Object.fromEntries(model.dims.flatMap((d) => d.items.map((i) => [i.id, v])));
  const rs = [
    ...Array.from({ length: 6 }, () => ({ deptId: 'a', answers: answers(4), enps: 9 })),
    ...Array.from({ length: 3 }, () => ({ deptId: 'b', answers: answers(2), enps: 3 })),
  ];
  const r = scoreSurvey('engagement', rs);
  assert.equal(r.n, 9);
  assert.equal(r.depts.find((d) => d.deptId === 'a').suppressed, false);
  assert.equal(r.depts.find((d) => d.deptId === 'b').suppressed, true);
  assert.equal(r.enps.score, Math.round(((6 - 3) / 9) * 100));
  assert.deepEqual(enps([10, 9, 7, 0]), { n: 4, promoters: 2, passives: 1, detractors: 1, score: 25 });
  assert.match(diagnosisReport(r, 'en'), /anonymity/);
});

test('RACI checks require exactly one A per step', () => {
  const issues = checkRaci({ roles: ['A', 'B'], steps: [{ name: 's1', cells: ['A', 'A'] }, { name: 's2', cells: ['R', ''] }, { name: 's3', cells: ['A/R', 'I'] }] });
  assert.ok(issues.some((i) => i.step === 0 && i.level === 'high'));
  assert.ok(issues.some((i) => i.step === 1 && i.level === 'high'));
  assert.ok(!issues.some((i) => i.step === 2));
});

test('statutory calculators', () => {
  assert.equal(annualLeave({ totalYears: 0.5 }).full, 0);
  assert.equal(annualLeave({ totalYears: 9 }).full, 5);
  assert.equal(annualLeave({ totalYears: 10 }).full, 10);
  assert.equal(annualLeave({ totalYears: 25 }).full, 15);
  // Joined 1 July: 184 remaining days / 365 x 5 = 2.52 -> 2 days.
  assert.equal(annualLeave({ totalYears: 3, joinDate: '2026-07-01', year: 2026 }).days, 2);
  const ot = overtimePay({ monthly: 21750, weekday: 1, restday: 1, holiday: 1 });
  assert.equal(ot.hourly, 125);
  assert.equal(ot.total, 125 * (1.5 + 2 + 3));
  const band = salaryBand({ midpoint: 25000, spread: 50 });
  assert.deepEqual(band, { min: 20000, mid: 25000, max: 30000 });
  assert.equal(compaRatio({ salary: 22500, midpoint: 25000, min: 20000, max: 30000 }).compa, 0.9);
  assert.equal(turnover({ leavers: 7, startHeadcount: 68, endHeadcount: 72 }).rate, 10);
  assert.equal(recruitingFunnel({ hires: 4, rates: { applied: 50, screen: 50, interview: 50, offer: 50 } }).stages[0].count, 64);
  assert.deepEqual(headcountPlan({ current: 100, growth: 10, attrition: 10 }), { target: 110, leavers: 11, hires: 21 });
});

test('policy search finds the right article for typical employee questions', () => {
  const cases = [
    ['我入职第一年有几天年假？', 'a01'], ['加班费怎么计算？', 'a04'], ['试用期最长多久？', 'a07'], ['怎么开在职证明？', 'a12'],
    ['离职要提前多久通知？', 'a08'], ['产假有多少天？', 'a02'], ['公积金怎么提取', 'a05'], ['工资什么时候发', 'a06'],
    ['晋升需要什么条件', 'a10'], ['病假工资怎么算', 'a03'], ['忘记打卡怎么办', 'a04'], ['入职要带什么材料', 'a13'],
    ['How many days of annual leave do I get?', 'a01'], ['how is overtime paid', 'a04'], ['how much notice before I resign', 'a08'],
  ];
  for (const [q, id] of cases) assert.equal(searchKB(KB_ARTICLES, q)[0]?.article.id, id, q);
  assert.equal(searchKB(KB_ARTICLES, '公司可以报销健身卡吗').length, 0, 'unrelated questions fall through to a request');
});

test('SLA due dates and onboarding checklists', () => {
  assert.equal(dueDate('2026-10-23', 1), '2026-10-26'); // Friday + 1 working day = Monday
  const list = buildChecklist('2026-11-02');
  assert.ok(list.length >= 12);
  assert.ok(list.some((t) => t.phase === 'pre' && t.due < '2026-11-02'));
  assert.ok(buildChecklist('2026-11-02', { manager: true }).length > list.length);
});
