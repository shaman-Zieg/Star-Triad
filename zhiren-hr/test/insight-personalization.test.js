import test from 'node:test';
import assert from 'node:assert/strict';
import { personalInsight, retentionActions } from '../public/js/engine/insight.js';
import { targetProfile } from '../public/js/engine/competency.js';
import { boxKey } from '../public/js/engine/talent.js';

const ctx = { today: '2026-10-24', idps: [], enrollments: [], courses: [] };
const person = (over = {}) => ({
  id: 'p', name: '示例', title: '前端工程师', titleEn: 'Frontend Engineer', level: 'P5',
  status: 'active', hireDate: '2018-01-01', lastPromotion: '2026-01-01',
  performance: 3, potential: 3, engagement: 4, compaRatio: 1,
  competencies: targetProfile('P5'), perfHistory: [{ rating: 3 }, { rating: 3 }],
  ...over,
});

test('same-box summaries distinguish the real trend and largest competency gap', () => {
  const a = person({ competencies: { ...targetProfile('P5'), learning: 5, communication: 1 }, perfHistory: [{ rating: 2 }, { rating: 3 }] });
  const b = person({ competencies: { ...targetProfile('P5'), execution: 5, problem: 2 }, perfHistory: [{ rating: 4 }, { rating: 3 }] });
  assert.equal(boxKey(a.performance, a.potential), boxKey(b.performance, b.potential));
  const ia = personalInsight(a, ctx);
  const ib = personalInsight(b, ctx);
  assert.notDeepEqual(ia.summary, ib.summary);
  assert.match(ia.summary[0], /2→3.*上升.*学习与成长.*沟通与影响（1→3）/);
  assert.match(ib.summary[0], /4→3.*回落.*执行与结果导向.*分析与解决问题（2→3）/);
  for (const ins of [ia, ib]) {
    assert.ok(ins.summary[0].length < 180, 'summary stays brief');
    const known = new Set(ins.facts.map((f) => f.id));
    assert.ok(ins.summaryFacts.length >= 3);
    assert.ok(ins.summaryFacts.every((id) => known.has(id)));
    assert.ok(ins.actions.every((a) => a.facts.length && a.facts.every((id) => known.has(id))));
    const development = ins.actions.find((a) => a.kind === 'development');
    assert.match(development.text[0], /前端工程师.*6 周.*复评/);
  }
});

test('summary does not invent assessment outcomes or a trend when data is missing', () => {
  const missing = personalInsight(person({ competencies: null, perfHistory: [{ rating: 3 }] }), ctx);
  assert.match(missing.summary[0], /暂无连续两期趋势依据.*能力尚未评估/);
  assert.doesNotMatch(missing.summary[0], /已达到|表现稳定/);
  assert.ok(missing.summaryFacts.includes('comp_missing'));
  const partial = personalInsight(person({ competencies: { professional: 4 } }), ctx);
  assert.match(partial.summary[0], /7 项能力待评估/);
  assert.doesNotMatch(partial.summary[0], /全部能力要求/);
});

test('next-level development names the actual next gap and cites its measurements', () => {
  const ins = personalInsight(person(), ctx);
  const action = ins.actions.find((a) => a.factor === 'potential');
  assert.match(action.text[0], /P6.*专业能力.*3→4.*前端工程师.*3 个月/);
  assert.ok(action.facts.includes('next_gap_professional'));
  assert.deepEqual(ins.facts.find((f) => f.id === 'next_gap_professional').value, [3, 4]);
  const product = personalInsight(person({ title: '高级产品经理', titleEn: 'Senior Product Manager' }), ctx);
  assert.match(product.actions.find((a) => a.factor === 'potential').text[0], /用户验证、PRD.*采用率或业务价值/);
  assert.doesNotMatch(action.text[0], /PRD/);
  const top = personalInsight(person({ level: 'M4', competencies: targetProfile('M4') }), ctx);
  assert.ok(top.actions.every((a) => !a.text[0].includes('M5')));
});

test('later risk factors are retained and each action slot addresses a distinct factor', () => {
  const ins = personalInsight(person({
    performance: 4, compaRatio: 0.8, engagement: 1, lastPromotion: '2020-01-01', managerChanged: true,
    competencies: { ...targetProfile('P5'), professional: 5, communication: 1, problem: 1 },
    perfHistory: [{ rating: 5 }, { rating: 4 }],
  }), ctx);
  assert.ok(ins.actions.length > 7, 'all supported actions survive before UI selection');
  assert.match(ins.summary[0], /优先跟进保留沟通/);
  const actions = retentionActions(ins, 20);
  assert.ok(actions.some((a) => a.factor === 'manager'), 'late manager-change action remains available');
  assert.equal(actions[0].factor, ins.risk.factors[0].key);
  const keys = actions.map((a) => a.factor || a.kind);
  assert.equal(keys.length, new Set(keys).size);
  assert.deepEqual(retentionActions(ins, 0), []);
});

test('moderate pay and promotion factors receive specific follow-up actions', () => {
  const ins = personalInsight(person({ compaRatio: 0.93, engagement: 3, lastPromotion: '2024-03-01' }), ctx);
  const actions = retentionActions(ins);
  assert.deepEqual(actions.map((a) => a.factor), ['promotion', 'pay']);
  assert.match(actions[0].text[0], /32 个月.*前端工程师.*评审日期/);
  assert.match(actions[1].text[0], /0.93.*P5.*薪酬评审/);
});

test('invalid historical ratings are ignored consistently by summary and observation', () => {
  const ins = personalInsight(person({ perfHistory: [{ rating: 2 }, { rating: 3 }, { rating: null }] }), ctx);
  assert.match(ins.summary[0], /2→3/);
  assert.ok(ins.observations.some((o) => /绩效由 2 升至 3/.test(o.text[0])));
  assert.ok(ins.observations.every((o) => !o.text[0].includes('null')));
});

test('M3 is the highest competency band but still has M4 as its next job level', () => {
  const source = person({ level: 'M3', performance: 4, lastPromotion: '2020-01-01', competencies: targetProfile('M3') });
  const ins = personalInsight(source, ctx);
  const fact = ins.facts.find((f) => f.id === 'track_top');
  assert.match(fact.text[0], /最高能力标准档.*下一职级 M4/);
  assert.match(fact.text[1], /highest competency band.*next level, M4/);
  const observation = ins.observations.find((o) => o.facts.includes('comp_met'));
  assert.match(observation.text[0], /最高能力标准档.*下一职级 M4/);
  assert.doesNotMatch(observation.text[0], /本通道最高职级/);
  const promotion = ins.actions.find((a) => a.factor === 'promotion');
  assert.match(promotion.text[0], /下一职级 M4.*M3.*共用.*8\/8.*职责范围/);
  const missing = personalInsight({ ...source, competencies: null }, ctx);
  assert.match(missing.actions.find((a) => a.factor === 'promotion').text[0], /下一职级 M4.*先补齐能力评估/);
  const top = personalInsight({ ...source, level: 'M4', competencies: targetProfile('M4') }, ctx);
  assert.match(top.facts.find((f) => f.id === 'track_top').text[0], /M4.*最高职级/);
  assert.ok(top.actions.every((a) => !a.text[0].includes('M5')));
});
