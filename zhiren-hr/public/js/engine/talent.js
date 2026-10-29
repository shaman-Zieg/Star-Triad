// Talent review: 9-box grid, calibration checks, learning-agility based potential,
// flight risk and succession bench strength.
import { mean, round, monthsBetween, clamp } from './text.js';

export const PERF_SCALE = {
  1: ['不符合期望', 'Does not meet'],
  2: ['部分符合', 'Partly meets'],
  3: ['符合期望', 'Meets'],
  4: ['超出期望', 'Exceeds'],
  5: ['卓越', 'Outstanding'],
};
export const POT_SCALE = {
  1: ['当前岗位胜任', 'Well placed'],
  2: ['可横向/晋升一级', 'Can grow one level'],
  3: ['高潜：可晋升两级以上', 'High potential: two levels or more'],
};

export const perfBand = (p) => (p >= 4 ? 2 : p >= 3 ? 1 : 0);
export const potBand = (p) => clamp((Number(p) || 1) - 1, 0, 2);

// Box keys are `${potentialBand}${performanceBand}`, 0 = low, 2 = high.
export const BOXES = {
  22: { no: 9, name: ['明星人才', 'Star'], tone: 'ok',
    desc: ['高绩效、高潜力，是组织的核心后备力量。', 'High performance and high potential: the core of the leadership pipeline.'],
    actions: [['纳入关键岗位继任者池，加速发展', 'Put in the succession pool for key roles and accelerate'], ['提供挑战性任务、轮岗或项目负责人机会', 'Give stretch assignments, rotations or project leadership'], ['高管导师辅导，制定保留方案（薪酬、认可、发展）', 'Executive mentoring and a retention plan (pay, recognition, growth)']] },
  21: { no: 8, name: ['潜力之星', 'High potential'], tone: 'ok',
    desc: ['潜力高、绩效达标，需要机会把潜力转化为业绩。', 'High potential with solid performance; needs chances to turn potential into results.'],
    actions: [['设定更高绩效目标，给予关键任务', 'Set higher goals and give critical assignments'], ['安排导师辅导与针对性能力提升', 'Mentoring plus targeted capability building'], ['6-12 个月后复评，评估晋升准备度', 'Reassess promotion readiness in 6-12 months']] },
  20: { no: 7, name: ['待发掘者', 'Enigma'], tone: 'warn',
    desc: ['潜力高但绩效偏低，可能岗位不匹配或遇到障碍。', 'High potential but low performance; possibly misplaced or blocked.'],
    actions: [['一对一沟通，找出影响绩效的原因', 'One-to-one conversation to find what blocks performance'], ['调整岗位或职责以更好发挥优势', 'Adjust role or scope to play to strengths'], ['明确 3 个月改进目标并密切辅导', 'Agree 3-month goals and coach closely']] },
  12: { no: 6, name: ['绩效骨干', 'High performer'], tone: 'ok',
    desc: ['绩效突出、潜力中等，是业务的中坚贡献者。', 'Strong results with moderate potential: a key contributor.'],
    actions: [['认可与激励，保持其投入度', 'Recognize and reward to keep engagement high'], ['拓展职责广度，培养第二专长', 'Broaden scope; build a second strength'], ['可作为带教导师，传承经验', 'Use as a mentor to pass on know-how']] },
  11: { no: 5, name: ['中坚力量', 'Core player'], tone: 'neutral',
    desc: ['绩效与潜力均为中等，是组织稳定运转的基础。', 'Moderate on both axes: the foundation of day-to-day delivery.'],
    actions: [['明确发展方向，制定个人发展计划', 'Clarify direction and agree an IDP'], ['提供有针对性的培训与反馈', 'Targeted training and regular feedback'], ['识别可提升绩效的关键行为', 'Identify the few behaviors that would lift performance']] },
  10: { no: 4, name: ['待提升者', 'Inconsistent player'], tone: 'warn',
    desc: ['潜力中等、绩效偏低，需要明确期望和支持。', 'Moderate potential, low performance; needs clear expectations and support.'],
    actions: [['设定清晰的绩效期望与改进计划', 'Set clear expectations and an improvement plan'], ['加强过程辅导与阶段性反馈', 'Increase coaching and interim feedback'], ['3-6 个月后复评', 'Review again in 3-6 months']] },
  2: { no: 3, name: ['专业能手', 'Trusted professional'], tone: 'ok',
    desc: ['绩效优秀、在当前岗位深耕，是专业领域的可靠力量。', 'Excellent performer who is well placed in the current role: a reliable expert.'],
    actions: [['发挥专业价值，发展专家通道', 'Leverage expertise; consider the expert track'], ['给予认可，承担知识传承角色', 'Recognize and involve in knowledge transfer'], ['关注其职业满意度，防止倦怠', 'Watch career satisfaction to prevent burnout']] },
  1: { no: 2, name: ['稳定贡献者', 'Effective employee'], tone: 'neutral',
    desc: ['绩效达标、潜力有限，能稳定完成本职工作。', 'Meets expectations with limited growth potential; reliable in role.'],
    actions: [['保持工作投入，提供必要的技能更新', 'Keep engaged; refresh skills as needed'], ['明确岗位期望与认可方式', 'Clarify expectations and recognition'], ['关注效率与质量的持续改进', 'Focus on steady efficiency and quality gains']] },
  0: { no: 1, name: ['需关注', 'Underperformer'], tone: 'danger',
    desc: ['绩效与潜力均偏低，需要尽快采取行动。', 'Low on both axes; action is needed soon.'],
    actions: [['启动绩效改进计划（PIP），明确目标与期限', 'Start a performance improvement plan with clear goals and dates'], ['评估岗位适配，考虑调岗', 'Assess role fit; consider a move'], ['按合规流程处理，做好沟通与记录', 'Follow a compliant process with clear communication and records']] },
};

export const boxKey = (perf, pot) => Number(`${potBand(pot)}${perfBand(perf)}`);
export const boxOf = (emp) => BOXES[boxKey(emp.performance, emp.potential)];

// Representative ratings when someone is dragged into a box.
export const BOX_DEFAULTS = { perf: [2, 3, 4], pot: [1, 2, 3] };
export function ratingsForBox(key, current = {}) {
  const pb = key % 10;
  const tb = Math.floor(key / 10);
  const perf = perfBand(current.performance) === pb ? current.performance : BOX_DEFAULTS.perf[pb];
  return { performance: perf, potential: tb + 1 };
}

export function distribution(emps) {
  const counts = Object.fromEntries(Object.keys(BOXES).map((k) => [k, 0]));
  for (const e of emps) counts[boxKey(e.performance, e.potential)] += 1;
  const n = emps.length || 1;
  const pct = (k) => counts[k] / n;
  const checks = [];
  if (emps.length >= 8) {
    const top = pct(22) + pct(21) + pct(12);
    if (pct(22) > 0.2) checks.push({ level: 'warn', text: ['明星人才占比超过 20%，可能存在评分偏宽，建议校准。', 'Over 20% are Stars; ratings may be lenient. Calibrate.'] });
    if (pct(11) > 0.5) checks.push({ level: 'warn', text: ['超过一半集中在中间格，可能存在居中趋势，区分度不足。', 'Over half sit in the middle box: central tendency, not enough differentiation.'] });
    if (top < 0.1) checks.push({ level: 'info', text: ['高绩效/高潜人才不足 10%，关注人才梯队厚度。', 'Under 10% are high performers or high potentials; check pipeline depth.'] });
    if (pct(0) === 0 && pct(10) === 0 && emps.length >= 20) checks.push({ level: 'info', text: ['没有低绩效人员，请确认是否回避了困难评价。', 'No low performers at all; check that hard calls were not avoided.'] });
    if (!checks.length) checks.push({ level: 'ok', text: ['分布较为合理，未发现明显的评分偏差。', 'Distribution looks reasonable; no obvious rating bias.'] });
  }
  return { counts, n: emps.length, checks };
}

// Learning-agility questionnaire for rating potential (after Lombardo & Eichinger).
export const AGILITY = [
  { key: 'mental', name: ['思维敏捷', 'Mental agility'], items: [['面对新问题时能快速找到解决思路', 'Finds a way into unfamiliar problems quickly'], ['善于从不同角度看问题，能接受复杂和模糊', 'Looks at issues from several angles; comfortable with ambiguity']] },
  { key: 'people', name: ['人际敏捷', 'People agility'], items: [['能与各类人有效合作，并从他人身上学习', 'Works well with all kinds of people and learns from them'], ['冲突中保持建设性，能读懂他人', 'Constructive in conflict; reads others well']] },
  { key: 'change', name: ['变革敏捷', 'Change agility'], items: [['主动尝试新方法，乐于推动变化', 'Tries new approaches and likes driving change'], ['在变化中保持投入，并带动他人', 'Stays engaged through change and brings others along']] },
  { key: 'results', name: ['结果敏捷', 'Results agility'], items: [['在首次接触的任务中也能交出成果', 'Delivers results even in first-time assignments'], ['在压力下保持表现，激发团队', 'Performs under pressure and energizes others']] },
  { key: 'self', name: ['自我觉察', 'Self-awareness'], items: [['清楚自己的优势与不足', 'Knows own strengths and limits'], ['主动寻求反馈并做出改变', 'Seeks feedback and acts on it']] },
];

export function potentialFromAgility(answers = {}) {
  const dims = AGILITY.map((d) => {
    const xs = d.items.map((_, i) => Number(answers[`${d.key}${i}`])).filter((v) => v >= 1 && v <= 5);
    return { key: d.key, score: xs.length ? round(mean(xs), 1) : null };
  });
  const scored = dims.filter((d) => d.score != null);
  const avg = scored.length ? round(mean(scored.map((d) => d.score)), 2) : null;
  const potential = avg == null ? null : avg >= 4 ? 3 : avg >= 3 ? 2 : 1;
  return { dims, avg, potential };
}

// Flight risk with transparent, additive factors.
export function flightRisk(emp, today) {
  if (emp.status === 'left') return null;
  const factors = [];
  const add = (points, text, action, key) => factors.push({ points, text, action, key });
  const tenure = monthsBetween(emp.hireDate, today) / 12;
  if (tenure >= 1 && tenure < 3) add(12, ['司龄 1-3 年，处于离职高发期', 'Tenure of 1-3 years, a high-turnover window'], ['关注职业发展期望，明确下一步', 'Discuss career expectations and the next step'], 'tenure');
  else if (tenure < 1) add(6, ['入职不满一年', 'Less than a year in the company'], ['做好融入与导师支持', 'Strengthen onboarding and buddy support'], 'tenure_new');
  const sincePromo = monthsBetween(emp.lastPromotion || emp.hireDate, today);
  if (sincePromo >= 36) add(20, ['超过 3 年未晋升/调薪', 'No promotion in over 3 years'], ['评估晋升或拓展职责的机会', 'Review promotion or a broader role'], 'promotion');
  else if (sincePromo >= 24) add(10, ['超过 2 年未晋升', 'No promotion in over 2 years'], ['沟通发展路径与时间表', 'Agree a development path and timeline'], 'promotion');
  if (emp.compaRatio && emp.compaRatio < 0.9) add(20, ['薪酬显著低于市场中位（比较比率 < 0.9）', 'Pay well below the market midpoint (compa-ratio < 0.9)'], ['纳入调薪评审，校准薪酬竞争力', 'Include in the pay review to restore competitiveness'], 'pay');
  else if (emp.compaRatio && emp.compaRatio < 0.95) add(10, ['薪酬略低于市场中位', 'Pay slightly below market midpoint'], ['关注下一轮调薪', 'Watch in the next pay cycle'], 'pay');
  if (emp.engagement && emp.engagement <= 2) add(25, ['敬业度低', 'Low engagement'], ['上级一对一沟通，了解诉求', 'Manager 1:1 to understand concerns'], 'engagement');
  else if (emp.engagement === 3) add(8, ['敬业度一般', 'Moderate engagement'], ['加强认可与反馈', 'More recognition and feedback'], 'engagement');
  if (emp.performance >= 4) add(10, ['高绩效人才，外部市场需求大', 'High performer in demand externally'], ['给予认可和有挑战的任务', 'Recognition and stretching work'], 'performance');
  if (emp.potential === 3) add(5, ['高潜人才，期待更快成长', 'High potential expecting faster growth'], ['提供加速发展机会', 'Offer accelerated development'], 'potential');
  if (emp.managerChanged) add(10, ['近期更换直属上级', 'Recent change of manager'], ['新上级尽快建立信任与期望', 'New manager to build trust and set expectations early'], 'manager');
  const score = Math.min(100, factors.reduce((a, f) => a + f.points, 0));
  const level = score >= 55 ? 'high' : score >= 30 ? 'medium' : 'low';
  const regrettable = emp.performance >= 4 || emp.potential === 3;
  return { score, level, regrettable, factors: factors.sort((a, b) => b.points - a.points) };
}

// Succession evaluation lives in succession.js (role specifications, eligibility and ranking).
