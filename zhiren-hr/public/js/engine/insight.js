// Evidence-based individual insight. Every statement cites numbered facts taken from
// stored data; observations, hypotheses (to be verified in conversation) and actions
// are kept separate, and nothing is said about a person that the data does not show.
import { COMP_KEYS, compByKey, targetProfile, assessCompetencies, ladderInfo, BANDS } from './competency.js';
import { BOXES, boxKey, flightRisk, PERF_SCALE } from './talent.js';
import { EXPERIENCES, idpProgress } from './learning.js';
import { STATUS as SUCC_STATUS, COVERAGE } from './succession.js';
import { personFamily } from './jd.js';
import { monthsBetween, round, pick } from './text.js';

const T = (zh, en) => [zh, en];
const performanceHistory = (emp) => (emp.perfHistory || []).map((h) => Number(h.rating)).filter((r) => Number.isInteger(r) && r >= 1 && r <= 5);
// Proposed practice, not a claim about projects the employee has already done.
const ROLE_PRACTICE = {
  product: T('主导一个需求从用户验证、PRD 到上线复盘的闭环，事先约定采用率或业务价值等验收指标', 'Own a requirement from user validation and PRD through launch review, agreeing adoption or business-value measures upfront'),
  data: T('选取一个业务问题，完成数据口径核对、分析验证与决策建议，并请业务方评审可用性', 'Take one business question through metric validation, analysis and a decision recommendation, with a business-partner review'),
  tech: T('承担一个复杂模块的方案与交付，先约定性能、质量和评审标准，再与资深工程师复盘', 'Own the design and delivery of a complex module, agree performance, quality and review criteria, then review with a senior engineer'),
  design: T('完成一次用户研究与设计改进，记录可用性测试结果并与产品、研发共同复盘', 'Run user research and a design improvement, record usability results and review with product and engineering'),
  sales: T('推进一个有挑战的客户方案，复核需求、决策链与谈判策略，并按阶段复盘推进结果', 'Develop a challenging client proposal, review needs, decision makers and negotiation strategy, and assess progress at each stage'),
  marketing: T('设计并试点一项获客活动，事先约定转化与成本指标，完成后复盘渠道效果', 'Design and pilot an acquisition campaign, agree conversion and cost measures upfront and review channel results'),
  hr: T('改进一项人力资源流程，先访谈使用者、明确衡量指标，再试点并收集反馈', 'Improve an HR process by interviewing users, defining measures, piloting a change and collecting feedback'),
  finance: T('选择一项预算或财务分析课题，核对假设与数据口径，输出建议并接受专业复核', 'Investigate a budgeting or financial-analysis question, verify assumptions and definitions, and submit recommendations for professional review'),
  ops: T('梳理一项运营流程的瓶颈，试点改进并跟踪效率、质量或客户反馈', 'Identify a bottleneck in an operating process, pilot an improvement and track efficiency, quality or customer feedback'),
};
const practiceFor = (key, emp) => (key === 'professional' && ROLE_PRACTICE[personFamily(emp)]) || EXPERIENCES[key][0];

export function buildFacts(emp, ctx) {
  const { today, evaluation, idps = [], enrollments = [], courses = [] } = ctx;
  const facts = [];
  const add = (id, kind, text, value) => facts.push({ id, kind, text, value });
  const lad = ladderInfo(emp.level);
  const target = targetProfile(emp.level);
  const a = assessCompetencies(emp.competencies, target);

  if (emp.title) add('role', 'role', T(`岗位：${emp.title}`, `Role: ${emp.titleEn || emp.title}`), [emp.title, emp.titleEn || emp.title]);
  add('level', 'level', T(`职级 ${emp.level}，属于${pick(lad.bandName, 'zh')}段（${lad.sharedLevels.join('、')} 共用一套能力标准）`, `Level ${emp.level}, ${pick(lad.bandName, 'en')} band (${lad.sharedLevels.join(', ')} share one standard)`), emp.level);
  const box = BOXES[boxKey(emp.performance, emp.potential)];
  add('box', 'talent', T(`九宫格：${box.no} ${pick(box.name, 'zh')}（绩效 ${emp.performance}，潜力 ${emp.potential}）`, `9-box: ${box.no} ${pick(box.name, 'en')} (performance ${emp.performance}, potential ${emp.potential})`), box.no);
  const hist = performanceHistory(emp);
  if (hist.length >= 2) {
    const [prev, last] = hist.slice(-2);
    add('perf_trend', 'performance', T(`最近两期绩效 ${prev} → ${last}`, `Last two ratings ${prev} → ${last}`), last - prev);
  }
  if (emp.agility?.avg) add('agility', 'potential', T(`学习敏锐度评估均分 ${emp.agility.avg}（${emp.agility.at || ''}）`, `Learning agility average ${emp.agility.avg} (${emp.agility.at || ''})`), emp.agility.avg);

  if (a.status === 'missing') add('comp_missing', 'competency', T('尚无能力评估记录', 'No competency assessment on record'), null);
  else {
    if (a.status === 'partial') add('comp_partial', 'competency', T(`能力评估不完整：${a.missing.length} 项未评估`, `Incomplete assessment: ${a.missing.length} not rated`), a.missing.length);
    add('comp_met', 'competency', T(`对照 ${emp.level} 标准，${a.assessedCount} 项已评估中 ${a.met} 项达标`, `Against the ${emp.level} standard, ${a.met} of ${a.assessedCount} rated competencies are met`), a.met);
    for (const g of a.gaps) add(`gap_${g.key}`, 'gap', T(`${pick(compByKey[g.key].name, 'zh')}：当前 ${g.actual}，${emp.level} 要求 ${g.target}`, `${pick(compByKey[g.key].name, 'en')}: ${g.actual} vs ${emp.level} target ${g.target}`), g.gap);
    for (const s of a.strengths) add(`str_${s.key}`, 'strength', T(`${pick(compByKey[s.key].name, 'zh')}：当前 ${s.actual}，高于 ${emp.level} 要求 ${s.target}`, `${pick(compByKey[s.key].name, 'en')}: ${s.actual}, above the ${emp.level} target of ${s.target}`), -s.gap);
    if (a.status === 'complete' && lad.nextLevel) {
      const nb = assessCompetencies(emp.competencies, targetProfile(lad.nextLevel));
      add('next_band', 'competency', T(`按更高一档 ${lad.nextLevel}（${pick(BANDS[lad.nextBand].name, 'zh')}段）标准，8 项中 ${nb.met} 项达标`, `Against the next band (${lad.nextLevel}, ${pick(BANDS[lad.nextBand].name, 'en')}), ${nb.met} of 8 are met`), nb.met);
      for (const g of nb.gaps) add(`next_gap_${g.key}`, 'next_gap', T(`${pick(compByKey[g.key].name, 'zh')}：当前 ${g.actual}，更高一档 ${lad.nextLevel} 要求 ${g.target}`, `${pick(compByKey[g.key].name, 'en')}: ${g.actual} vs next-band ${lad.nextLevel} target ${g.target}`), [g.actual, g.target]);
    }
    if (lad.trackTop) add('track_top', 'level', lad.nextStep
      ? T(`${emp.level} 已在本通道最高能力标准档，下一职级 ${lad.nextStep} 与其共用能力标准`, `${emp.level} is in the highest competency band; the next level, ${lad.nextStep}, shares that standard`)
      : T(`${emp.level} 是${lad.track === 'M' ? '管理' : '专业'}通道的最高职级`, `${emp.level} is the top of the ${lad.track === 'M' ? 'management' : 'professional'} track`), true);
  }

  const tenureYears = round(monthsBetween(emp.hireDate, today) / 12, 1);
  add('tenure', 'tenure', T(`司龄 ${tenureYears} 年`, `Tenure ${tenureYears} years`), tenureYears);
  const sincePromo = Math.round(monthsBetween(emp.lastPromotion || emp.hireDate, today));
  add('promotion', 'promotion', T(emp.lastPromotion && emp.lastPromotion !== emp.hireDate ? `距上次晋升 ${sincePromo} 个月` : `入职 ${sincePromo} 个月以来未有晋升记录`, emp.lastPromotion && emp.lastPromotion !== emp.hireDate ? `${sincePromo} months since last promotion` : `No promotion recorded in ${sincePromo} months since joining`), sincePromo);
  if (emp.compaRatio) add('pay', 'pay', T(`薪酬比较比率 ${emp.compaRatio}（实际薪酬 ÷ 薪级中位值）`, `Compa-ratio ${emp.compaRatio} (pay ÷ band midpoint)`), emp.compaRatio);
  if (emp.engagement) add('engagement', 'engagement', T(`敬业度评分 ${emp.engagement}/5`, `Engagement score ${emp.engagement}/5`), emp.engagement);
  if (emp.managerChanged) add('manager_change', 'manager', T('记录显示近期更换了直属上级', 'Records show a recent change of manager'), true);
  const risk = flightRisk(emp, today);
  if (risk) add('risk', 'risk', T(`流失风险 ${risk.score} 分（${{ high: '高', medium: '中', low: '低' }[risk.level]}）：${risk.factors.slice(0, 3).map((f) => pick(f.text, 'zh')).join('；') || '无主要因素'}`, `Flight risk ${risk.score} (${risk.level}): ${risk.factors.slice(0, 3).map((f) => pick(f.text, 'en')).join('; ') || 'no main factors'}`), risk.score);

  if (evaluation) {
    for (const ev of evaluation.plans) {
      if (ev.plan.incumbentId === emp.id) add(`own_${ev.plan.id}`, 'succession_own', T(`担任关键岗位「${ev.plan.title}」，继任状态：${pick(COVERAGE[ev.coverage].name, 'zh')}${ev.preferred ? `（首选 ${ev.preferred.employee.name}）` : ''}`, `Holds key role "${ev.plan.titleEn || ev.plan.title}", succession: ${pick(COVERAGE[ev.coverage].name, 'en')}${ev.preferred ? ` (preferred: ${ev.preferred.employee.nameEn || ev.preferred.employee.name})` : ''}`), ev.coverage);
      for (const n of ev.nominations.filter((x) => x.employee.id === emp.id)) add(`cand_${ev.plan.id}`, 'succession_candidate', T(`被提名为「${ev.plan.title}」继任候选，状态：${pick(SUCC_STATUS[n.status].name, 'zh')}`, `Nominated for "${ev.plan.titleEn || ev.plan.title}", status: ${pick(SUCC_STATUS[n.status].name, 'en')}`), n.status);
    }
  }
  const idp = idps.find((i) => i.employeeId === emp.id && i.status !== 'closed');
  if (idp) add('idp', 'learning', T(`有在执行的发展计划，完成度 ${idpProgress(idp)}%`, `Active development plan, ${idpProgress(idp)}% complete`), idpProgress(idp));
  else add('no_idp', 'learning', T('暂无发展计划', 'No development plan'), null);
  const mine = enrollments.filter((e) => e.employeeId === emp.id);
  if (mine.length) {
    const byId = Object.fromEntries(courses.map((c) => [c.id, c]));
    const done = mine.filter((e) => e.status === 'completed').map((e) => byId[e.courseId]?.title).filter(Boolean);
    const doing = mine.filter((e) => e.status !== 'completed').map((e) => byId[e.courseId]?.title).filter(Boolean);
    add('learning', 'learning', T(`学习记录：已完成 ${done.length} 门${doing.length ? `，进行中/计划 ${doing.length} 门` : ''}`, `Learning: ${done.length} completed${doing.length ? `, ${doing.length} in progress or planned` : ''}`), done.length);
  }
  return { facts, assessment: a, risk, ladder: lad, idp };
}

// A short review of the person, with the same traceable facts as the detailed
// insight. People in one grid cell can have different trends, strengths and gaps.
function individualSummary(emp, facts, assessment, risk) {
  const ids = new Set(facts.map((f) => f.id));
  const used = ['level', ...(ids.has('role') ? ['role'] : [])];
  const clauses = [];
  const hist = performanceHistory(emp);
  if (hist.length >= 2) {
    const [prev, last] = hist.slice(-2);
    clauses.push(T(`近两期绩效 ${prev}→${last}${last > prev ? '，呈上升趋势' : last < prev ? '，需关注回落' : '，表现稳定'}`, `Recent ratings ${prev}→${last}${last > prev ? ', improving' : last < prev ? ', a decline to review' : ', stable'}`));
    used.push('perf_trend');
  } else {
    clauses.push(T(`本期绩效 ${emp.performance}（${pick(PERF_SCALE[emp.performance] || ['待确认', 'unconfirmed'], 'zh')}），暂无连续两期趋势依据`, `Current performance ${emp.performance} (${pick(PERF_SCALE[emp.performance] || ['待确认', 'unconfirmed'], 'en')}); two-cycle trend not available`));
    used.push('box');
  }
  const strength = assessment.strengths[0];
  const gap = assessment.gaps[0];
  if (assessment.status === 'missing') {
    clauses.push(T('能力尚未评估，强项与差距待确认', 'Competencies are not assessed; strengths and gaps remain unknown'));
    used.push('comp_missing');
  } else {
    if (strength) {
      clauses.push(T(`${pick(compByKey[strength.key].name, 'zh')}是相对本级要求的强项`, `${pick(compByKey[strength.key].name, 'en')} exceeds this level’s requirements`));
      used.push(`str_${strength.key}`);
    }
    if (gap) {
      clauses.push(T(`优先补齐${pick(compByKey[gap.key].name, 'zh')}（${gap.actual}→${gap.target}）`, `Prioritize ${pick(compByKey[gap.key].name, 'en')} (${gap.actual}→${gap.target})`));
      used.push(`gap_${gap.key}`);
    } else if (assessment.status === 'complete') {
      clauses.push(T(`已达到 ${emp.level} 全部能力要求`, `Meets all ${emp.level} competency requirements`));
      used.push('comp_met');
    }
    if (assessment.status === 'partial') {
      clauses.push(T(`另有 ${assessment.missing.length} 项能力待评估`, `${assessment.missing.length} competencies still need assessment`));
      used.push('comp_partial');
    }
  }
  if (risk?.level === 'high') {
    clauses.push(T('当前需优先跟进保留沟通', 'Prioritize a retention conversation'));
    used.push('risk');
  }
  const prefix = T(`${emp.title ? `${emp.title} · ` : ''}${emp.level}：`, `${emp.title ? `${emp.titleEn || emp.title} · ` : ''}${emp.level}: `);
  return {
    summary: T(`${prefix[0]}${clauses.map((c) => c[0]).join('；')}。`, `${prefix[1]}${clauses.map((c) => c[1]).join('; ')}.`),
    summaryFacts: [...new Set(used)].filter((id) => ids.has(id)),
  };
}

// Turns facts into observations, hypotheses and actions. Each item lists the fact
// ids it rests on, so a reviewer can trace it back.
export function personalInsight(emp, ctx) {
  const { facts, assessment: a, risk, ladder: lad, idp } = buildFacts(emp, ctx);
  const has = (id) => facts.some((f) => f.id === id);
  const fact = (id) => facts.find((f) => f.id === id);
  const obs = [];
  const hyp = [];
  const act = [];
  const push = (list, text, ids, extra = {}) => list.push({ text, facts: ids.filter(has), ...extra });

  const trend = fact('perf_trend')?.value ?? 0;
  const months = fact('promotion').value;
  const compa = emp.compaRatio;
  const hist = performanceHistory(emp);
  const role = T(emp.title || '本岗位', emp.titleEn || emp.title || 'the current role');

  // Observations: the data, stated plainly.
  if (a.status === 'missing') push(obs, T('没有能力评估记录，无法判断能力强项与差距。', 'No competency assessment, so strengths and gaps are unknown.'), ['comp_missing']);
  else {
    if (a.strengths.length) push(obs, T(`相对 ${emp.level} 要求的强项：${a.strengths.slice(0, 3).map((s) => pick(compByKey[s.key].name, 'zh')).join('、')}。`, `Strengths against the ${emp.level} standard: ${a.strengths.slice(0, 3).map((s) => pick(compByKey[s.key].name, 'en')).join(', ')}.`), a.strengths.slice(0, 3).map((s) => `str_${s.key}`));
    if (a.gaps.length) push(obs, T(`未达 ${emp.level} 要求：${a.gaps.map((g) => `${pick(compByKey[g.key].name, 'zh')}（${g.actual}/${g.target}）`).join('、')}。`, `Below the ${emp.level} standard: ${a.gaps.map((g) => `${pick(compByKey[g.key].name, 'en')} (${g.actual}/${g.target})`).join(', ')}.`), a.gaps.map((g) => `gap_${g.key}`));
    else if (a.status === 'complete') push(obs, T(`已达到 ${emp.level} 的全部 8 项能力要求${lad.nextLevel ? `；按 ${lad.nextLevel} 标准达标 ${fact('next_band')?.value ?? '—'}/8 项` : lad.nextStep ? `；已处于最高能力标准档，下一职级 ${lad.nextStep} 与其共用标准` : '，且已处于本通道最高职级'}。`, `Meets all 8 requirements for ${emp.level}${lad.nextLevel ? `; ${fact('next_band')?.value ?? '—'}/8 against ${lad.nextLevel}` : lad.nextStep ? `; in the highest competency band, shared with the next level, ${lad.nextStep}` : ', at the top of the track'}.`), ['comp_met', 'next_band', 'track_top']);
  }
  if (trend) push(obs, T(`绩效由 ${hist.at(-2)} ${trend > 0 ? '升至' : '降至'} ${hist.at(-1)}。`, `Performance went ${trend > 0 ? 'up' : 'down'} from ${hist.at(-2)} to ${hist.at(-1)}.`), ['perf_trend']);
  if (risk && risk.level !== 'low') push(obs, T(`流失风险${risk.level === 'high' ? '高' : '中'}（${risk.score} 分），主要来自：${risk.factors.slice(0, 2).map((f) => pick(f.text, 'zh')).join('、')}。`, `${risk.level === 'high' ? 'High' : 'Medium'} flight risk (${risk.score}), mainly: ${risk.factors.slice(0, 2).map((f) => pick(f.text, 'en')).join('; ')}.`), ['risk']);

  // Hypotheses: possible explanations to test in conversation, never conclusions.
  if (emp.performance >= 4 && months >= 36 && (compa < 0.95 || emp.engagement <= 3)) push(hyp, T('高绩效但长期未晋升，且薪酬或敬业度偏低，可能对发展空间或回报有顾虑。需在一对一沟通中确认。', 'Strong performance with no recent promotion, plus lower pay or engagement, may mean concerns about growth or reward. Confirm in a one-to-one.'), ['box', 'promotion', ...(compa < 0.95 ? ['pay'] : []), ...(emp.engagement <= 3 ? ['engagement'] : [])]);
  if (emp.engagement <= 2 && emp.managerChanged) push(hyp, T('敬业度偏低与近期更换上级可能有关，也可能另有原因。需了解。', 'Low engagement may relate to the recent change of manager, or may not. Ask.'), ['engagement', 'manager_change']);
  if (trend < 0 && emp.engagement && emp.engagement <= 3) push(hyp, T('绩效下滑与投入度可能相关，原因尚不清楚。需在复盘中了解。', 'The performance drop may be linked to engagement; the cause is unknown. Explore in the review.'), ['perf_trend', 'engagement']);
  if (emp.potential === 3 && a.status === 'complete' && !a.gaps.length) push(hyp, T('已达到本职级全部要求且潜力高，当前岗位的挑战可能不足。', 'Meets every requirement with high potential; the current role may not stretch them enough.'), ['comp_met', 'box']);

  // Actions: specific, owned, and tied to the facts above.
  if (a.status !== 'complete') push(act, T(`两周内由上级完成${a.status === 'partial' ? '剩余' : '全部'}能力评估，再据此制定发展建议。`, `Manager completes the ${a.status === 'partial' ? 'remaining' : 'full'} competency assessment within two weeks before planning development.`), ['comp_missing', 'comp_partial'], { owner: T('直属上级', 'Manager'), kind: 'assess' });
  if (emp.performance <= 2) push(act, T('制定 60–90 天绩效改进计划：明确 2–3 个可衡量目标、每两周一次反馈，并记录支持措施。', 'Agree a 60-90 day improvement plan: 2-3 measurable goals, feedback every two weeks, and the support provided.'), ['box', 'perf_trend'], { owner: T('直属上级 + HRBP', 'Manager + HRBP'), kind: 'performance' });
  if (risk?.level === 'high') push(act, T('两周内由直属上级进行一对一保留沟通，了解其职业期望与顾虑，并约定跟进时间。', 'Manager holds a retention one-to-one within two weeks to learn career goals and concerns, and agrees a follow-up date.'), ['risk'], { owner: T('直属上级', 'Manager'), kind: 'retention' });
  if (emp.engagement && emp.engagement <= 2) push(act, T(`敬业度 ${emp.engagement}/5：围绕「${role[0]}」近期任务，确认最影响投入的 1–2 件事${emp.managerChanged ? '，重点核对新上级的目标与支持是否清楚' : ''}（原因需沟通验证），约定一项一个月内可改善的安排并复访。`, `Engagement ${emp.engagement}/5: discuss recent work in ${role[1]} and the one or two things affecting commitment${emp.managerChanged ? ', checking whether the new manager’s goals and support are clear' : ''} (verify the reasons in conversation); agree one change within a month and follow up.`), ['engagement', 'role', 'manager_change'], { owner: T('直属上级', 'Manager'), kind: 'engagement', factor: 'engagement' });
  else if (emp.engagement === 3 && risk && risk.level !== 'low') push(act, T('敬业度一般（3/5）：增加具体、及时的认可，并安排一项可见度更高的任务。', 'Engagement is moderate (3/5): give specific, timely recognition and a more visible piece of work.'), ['engagement'], { owner: T('直属上级', 'Manager'), kind: 'engagement', factor: 'engagement' });
  const tenureYears = fact('tenure').value;
  if (tenureYears >= 1 && tenureYears < 3 && risk && risk.level !== 'low') push(act, T(`司龄 ${tenureYears} 年，处于常见的离职窗口：与其讨论未来 1–2 年的发展路径和下一步可以期待的变化。`, `At ${tenureYears} years' tenure, a common leaving window: discuss the next 1-2 years and what change they can expect next.`), ['tenure', 'risk'], { owner: T('直属上级', 'Manager'), kind: 'career', factor: 'tenure' });
  if (compa && compa < 0.9) {
    const raise = Math.round((0.95 / compa - 1) * 100);
    push(act, T(`在下一轮薪酬评审中复核其薪酬定位。情景测算：比较比率由 ${compa} 调至 0.95 约需上调 ${raise}%。这只是成本测算，不能证明调薪可以避免离职。`, `Review pay positioning in the next pay cycle. Scenario: moving the compa-ratio from ${compa} to 0.95 needs about ${raise}%. This is a cost estimate, not proof that a raise prevents leaving.`), ['pay'], { owner: T('HRBP + 薪酬', 'HRBP + C&B'), kind: 'pay', factor: 'pay' });
  } else if (compa && compa < 0.95) {
    push(act, T(`薪酬比较比率 ${compa}：在下次一对一中了解回报预期，由 HRBP 复核 ${emp.level} 薪级定位，在下一轮薪酬评审前反馈依据与安排。`, `Compa-ratio ${compa}: ask about reward expectations at the next one-to-one; HRBP reviews positioning in the ${emp.level} pay band and shares the evidence and next steps before the next pay cycle.`), ['pay', 'level'], { owner: T('HRBP + 直属上级', 'HRBP + manager'), kind: 'pay', factor: 'pay' });
  }
  if (months >= 36 && emp.performance >= 4) {
    if (lad.nextLevel && a.status === 'complete') push(act, a.gaps.length
      ? T(`晋升前先补齐 ${emp.level} 的 ${a.gaps.length} 项差距；对照 ${lad.nextLevel} 标准目前 ${fact('next_band').value}/8 项达标，可在下一轮评审中复核。`, `Close the ${a.gaps.length} gap(s) at ${emp.level} first; against ${lad.nextLevel} ${fact('next_band').value}/8 are met, so revisit at the next review.`)
      : lad.nextStepSharesStandard
        ? T(`纳入下一轮晋升评审：下一职级 ${lad.nextStep} 与 ${emp.level} 共用能力标准，${emp.level} 的 8 项要求已全部达到；如考虑更高一档 ${lad.nextLevel}，目前 ${fact('next_band').value}/8 项达标。`, `Put forward for the next promotion review: the next level, ${lad.nextStep}, shares the ${emp.level} standard, which is fully met; against the higher ${lad.nextLevel} standard, ${fact('next_band').value}/8 are met.`)
        : T(`纳入下一轮晋升评审，对照下一职级 ${lad.nextLevel} 的标准逐项核对（目前 ${fact('next_band').value}/8 项达标）。`, `Put forward for the next promotion review and check against the next level, ${lad.nextLevel}, item by item (currently ${fact('next_band').value}/8 met).`), ['promotion', 'next_band', 'comp_met'], { owner: T('直属上级 + HRBP', 'Manager + HRBP'), kind: 'promotion', factor: 'promotion' });
    else if (lad.trackTop && lad.nextStep) push(act, T(`下一职级 ${lad.nextStep} 与 ${emp.level} 共用最高一档能力标准：${a.status === 'complete' ? `当前 ${a.met}/8 项达标` : '先补齐能力评估'}，下一轮晋升评审应结合职责范围、绩效成果与组织需求判断准备度。`, `The next level, ${lad.nextStep}, shares the highest competency band with ${emp.level}: ${a.status === 'complete' ? `${a.met}/8 requirements are currently met` : 'complete the assessment first'}; review readiness using scope, performance evidence and organizational needs at the next promotion review.`), ['promotion', 'level', 'track_top', 'comp_met', 'comp_missing', 'comp_partial'], { owner: T('直属上级 + HRBP', 'Manager + HRBP'), kind: 'promotion', factor: 'promotion' });
    else if (lad.trackTop) push(act, T(`已在${lad.track === 'M' ? '管理' : '专业'}通道最高职级，可讨论扩大职责范围或承担跨部门项目。`, `Already at the top of the ${lad.track === 'M' ? 'management' : 'professional'} track; discuss a broader remit or cross-team projects.`), ['promotion', 'level', 'track_top'], { owner: T('直属上级', 'Manager'), kind: 'promotion', factor: 'promotion' });
  }
  if (months >= 24 && !act.some((x) => x.factor === 'promotion')) push(act, T(`已有 ${months} 个月无晋升记录：一个月内对齐「${role[0]}」的发展诉求，${a.status !== 'complete' ? '先补齐能力评估' : a.gaps.length ? `先补齐 ${emp.level} 的 ${a.gaps.length} 项能力差距` : `结合 ${emp.level} 的达标情况评估职责拓展机会`}，明确下一次评审日期与所需成果。`, `${months} months without a recorded promotion: within a month discuss growth goals in ${role[1]}, ${a.status !== 'complete' ? 'complete the competency assessment first' : a.gaps.length ? `close the ${a.gaps.length} competency gaps at ${emp.level}` : `review broader responsibilities based on meeting the ${emp.level} standard`}, and agree a review date and required evidence.`), ['promotion', 'role', 'comp_met', 'comp_missing', 'comp_partial'], { owner: T('直属上级 + HRBP', 'Manager + HRBP'), kind: 'promotion', factor: 'promotion' });
  if (trend < 0 && emp.performance > 2) push(act, T(`复盘「${role[0]}」绩效 ${hist.at(-2)}→${hist.at(-1)} 的变化：两周内核对目标、资源与交付阻碍，选定一项下期改进指标，每两周跟踪。`, `Review the ${hist.at(-2)}→${hist.at(-1)} decline in ${role[1]}: within two weeks check goals, resources and delivery blockers, choose one improvement metric and follow up fortnightly.`), ['perf_trend', 'role'], { owner: T('直属上级', 'Manager'), kind: 'performance' });
  if (trend > 0) push(act, T(`复盘「${role[0]}」绩效提升（${hist.at(-2)}→${hist.at(-1)}）的有效做法，选择一项沉淀为团队案例，并与本人确认希望承担的下一项任务。`, `Review what contributed to the ${hist.at(-2)}→${hist.at(-1)} improvement in ${role[1]}, document one practice as a team case, and agree the next assignment with them.`), ['perf_trend', 'role'], { owner: T('直属上级', 'Manager'), kind: 'recognition', factor: 'performance' });
  for (const g of a.gaps.slice(0, 2)) {
    const exp = practiceFor(g.key, emp);
    push(act, T(`补齐「${pick(compByKey[g.key].name, 'zh')}」（${g.actual}→${g.target}）：从「${role[0]}」的实际任务中选择练习，${pick(exp, 'zh')}；由上级在 6 周后结合交付结果与协作反馈复评${idp ? `，记入现有发展计划（完成度 ${idpProgress(idp)}%）` : '，写入发展计划'}。`, `Close the ${pick(compByKey[g.key].name, 'en')} gap (${g.actual}→${g.target}) using real work in ${role[1]}: ${pick(exp, 'en')}; the manager reviews delivery evidence and partner feedback after six weeks${idp ? `, tracked in the current plan (${idpProgress(idp)}% done)` : ', recorded in a development plan'}.`), [`gap_${g.key}`, 'role', idp ? 'idp' : 'no_idp'], { owner: T('员工 + 上级', 'Employee + manager'), kind: 'development' });
  }
  const lever = a.strengths.find((s) => s.actual >= 4);
  if (lever) push(act, T(`发挥「${pick(compByKey[lever.key].name, 'zh')}」强项：安排其带教新人或在团队内分享相关经验。`, `Use the ${pick(compByKey[lever.key].name, 'en')} strength: have them mentor newer colleagues or run a knowledge session.`), [`str_${lever.key}`], { owner: T('直属上级', 'Manager'), kind: 'leverage', factor: 'performance' });
  if (emp.potential === 3 && a.status === 'complete' && !a.gaps.length && lad.nextLevel && !(months >= 36 && emp.performance >= 4)) {
    const nextGap = assessCompetencies(emp.competencies, targetProfile(lad.nextLevel)).gaps[0];
    push(act, nextGap
      ? T(`按 ${lad.nextLevel} 标准优先发展「${pick(compByKey[nextGap.key].name, 'zh')}」（${nextGap.actual}→${nextGap.target}）：${pick(practiceFor(nextGap.key, emp), 'zh')}，结合「${role[0]}」职责约定验收成果，3 个月后复评。`, `Develop ${pick(compByKey[nextGap.key].name, 'en')} toward ${lad.nextLevel} (${nextGap.actual}→${nextGap.target}): ${pick(practiceFor(nextGap.key, emp), 'en')}; agree a deliverable relevant to ${role[1]} and reassess after three months.`)
      : T(`已达到 ${lad.nextLevel} 的全部能力要求：在「${role[0]}」相关业务中承担一次更大范围的任务，先约定成果与支持人，3 个月后结合绩效评估发展准备度。`, `All ${lad.nextLevel} competency requirements are met: agree a broader assignment related to ${role[1]}, its outcome and sponsor, then review readiness with performance evidence in three months.`), ['box', 'next_band', 'role', ...(nextGap ? [`next_gap_${nextGap.key}`] : [])], { owner: T('直属上级', 'Manager'), kind: 'development', factor: 'potential' });
  }
  for (const f of facts.filter((x) => x.kind === 'succession_own' && x.value === 'weak')) push(act, T(`其岗位尚无合适继任者：请指定 1–2 名合格候选并开始知识传承。`, 'Their role has no suitable successor: name one or two eligible candidates and start knowledge transfer.'), [f.id], { owner: T('上级 + HRBP', 'Manager + HRBP'), kind: 'succession' });
  for (const f of facts.filter((x) => x.kind === 'succession_candidate')) {
    if (f.value === 'preferred') push(act, T('作为首选继任者，制定加速发展计划并安排与现任者的交接实践。', 'As the preferred successor, agree an accelerated plan and shadowing with the incumbent.'), [f.id], { owner: T('现任者 + HRBP', 'Incumbent + HRBP'), kind: 'succession' });
    if (f.value === 'excluded_risk') push(act, T('先落实保留措施；风险降低后再重新评估其继任资格。', 'Act on retention first; reassess succession eligibility once the risk falls.'), [f.id, 'risk'], { owner: T('HRBP', 'HRBP'), kind: 'succession' });
  }
  if (fact('tenure').value < 1) push(act, T(`入职 ${tenureYears} 年：核对「${role[0]}」入职计划与导师支持，安排一次融入沟通，并约定下一次 30/60/90 天检查节点。`, `Tenure ${tenureYears} years: check onboarding and buddy support for ${role[1]}, hold an integration conversation and agree the next 30/60/90-day checkpoint.`), ['tenure', 'role'], { owner: T('直属上级', 'Manager'), kind: 'onboarding', factor: 'tenure_new' });
  if (emp.managerChanged) push(act, T(`近期更换上级：新上级两周内与其核对「${role[0]}」的目标、决策权限与支持方式，记录一项双方约定的改进，30 天后回访。`, `Following the manager change, the new manager reviews goals, decision rights and support for ${role[1]} within two weeks; record one agreed improvement and check back after 30 days.`), ['manager_change', 'role'], { owner: T('新上级', 'New manager'), kind: 'manager', factor: 'manager' });

  return { ...individualSummary(emp, facts, a, risk), facts, observations: obs, hypotheses: hyp.slice(0, 2), actions: act, assessment: a, risk };
}

export const RETENTION_KINDS = new Set(['retention', 'engagement', 'pay', 'promotion', 'succession', 'manager', 'recognition', 'career']);

// Retention actions ordered by the person's own top risk factors; the universal
// one-to-one step is left out so each row shows what is specific to the person.
export function retentionActions(insight, limit = 2) {
  const order = Object.fromEntries((insight.risk?.factors || []).map((f, i) => [f.key, i]));
  const keyed = insight.actions.filter((a) => a.factor && order[a.factor] != null).sort((a, b) => order[a.factor] - order[b.factor]);
  const rest = insight.actions.filter((a) => !keyed.includes(a) && RETENTION_KINDS.has(a.kind) && a.kind !== 'retention');
  const seen = new Set();
  return [...keyed, ...rest].filter((action) => {
    const key = action.factor || action.kind;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, Math.max(0, limit));
}

export { COMP_KEYS };
