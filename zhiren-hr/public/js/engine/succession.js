// Succession evaluation: role specifications, candidate eligibility, an explainable
// priority score, preferred-successor selection, coverage, concentration warnings and
// the urgency order of key roles. Everything is computed from stored data, so fixing a
// rule updates every plan without rewriting nominations.
import { COMP_KEYS, compByKey, LEVELS, targetProfile, levelRank, assessCompetencies, isManagerLevel } from './competency.js';
import { personFamily, FAMILIES } from './jd.js';
import { FAMILY_FOCUS } from './interview.js';
import { skillByKey, skillLabel } from './skills.js';
import { flightRisk } from './talent.js';
import { pick } from './text.js';

// Score components. Competency evidence is used once (fit); readiness is derived
// from the level distance only, so the same ratings are never counted twice.
export const WEIGHTS = { fit: 35, performance: 20, potential: 15, readiness: 20, retention: 10 };
export const COMPONENT_NAMES = {
  fit: ['能力匹配', 'Competency fit'],
  performance: ['绩效', 'Performance'],
  potential: ['潜力', 'Potential'],
  readiness: ['职级就绪', 'Level readiness'],
  retention: ['留任稳定性', 'Retention'],
};
// A candidate is only "suitable" (and can become the preferred successor) when the
// role-specific competency fit and the overall score both clear these bars.
export const SUITABILITY = { minFit: 75, minScore: 60 };
// Cross-functional candidates need at least this many of the role's key skills
// (or a written justification on the nomination).
export const MIN_SKILL_EVIDENCE = 2;
// Heuristic, adjustable: development attention spreads thin when one person is
// nominated for many roles. Preferred status in 2+ plans is always flagged, because
// one person can fill only one vacancy.
export const CONCENTRATION_NOMINATIONS = 3;
// Level distance (rank steps) beyond which someone is too far below the role. One
// step above is allowed: moving across tracks (e.g. P7 expert to M1 manager) is common.
export const MAX_LEVEL_DISTANCE = 3;
export const MAX_LEVEL_ABOVE = 1;

export const READINESS = {
  now: { name: ['随时可接任', 'Ready now'], tone: 'ok', points: 1 },
  y1: { name: ['1-2 年内', 'Ready in 1-2 years'], tone: 'info', points: 0.5 },
  y3: { name: ['3 年以上', 'Ready in 3+ years'], tone: '', points: 0.2 },
};
const READINESS_POINTS = { 0: 1, 1: 0.8, 2: 0.5, 3: 0.2 };
const readinessFromDistance = (d) => (d <= 1 ? 'now' : d === 2 ? 'y1' : 'y3');

export const STATUS = {
  preferred: { name: ['首选继任者', 'Preferred successor'], tone: 'ok', icon: 'star' },
  eligible: { name: ['合格候选', 'Eligible'], tone: 'info', icon: 'check' },
  below_bar: { name: ['合格但未达适任标准', 'Eligible, below the bar'], tone: 'warn', icon: 'alert' },
  insufficient_data: { name: ['信息不足', 'Missing information'], tone: 'warn', icon: 'info' },
  excluded_risk: { name: ['已排除：高流失风险', 'Excluded: high flight risk'], tone: 'danger', icon: 'x' },
  excluded: { name: ['已排除：不符合条件', 'Excluded: not eligible'], tone: 'danger', icon: 'x' },
};

export const COVERAGE = {
  strong: { name: ['覆盖充分', 'Well covered'], tone: 'ok', desc: ['有随时可接任的首选继任者，且另有合格候选', 'A ready-now preferred successor plus another eligible candidate'] },
  moderate: { name: ['基本覆盖', 'Partly covered'], tone: 'warn', desc: ['有首选继任者，但尚需培养或缺少备选', 'A preferred successor exists but still needs development or a backup'] },
  weak: { name: ['继任缺口', 'Succession gap'], tone: 'danger', desc: ['未找到合适的继任者', 'No suitable successor identified'] },
};

export const CRITICALITY = {
  critical: { name: ['极关键', 'Critical'], weight: 3, tone: 'danger' },
  high: { name: ['关键', 'High'], weight: 2, tone: 'warn' },
  medium: { name: ['重要', 'Medium'], weight: 1, tone: '' },
};

export const KEY_ROLE_REASONS = {
  impact: ['对业务结果影响大', 'Large impact on business results'],
  scarce: ['所需技能稀缺、外部难招', 'Scarce skills, hard to hire'],
  replace: ['替代与培养周期长', 'Long time to replace or develop'],
  knowledge: ['掌握关键知识或客户关系，存在单点依赖', 'Holds critical knowledge or relationships (single point of failure)'],
  compliance: ['涉及合规或资质要求', 'Regulatory or certification requirement'],
};

// The requirements a successor is measured against. Defaults come from the role's
// function and level; a saved plan.spec overrides them.
export function roleSpec(plan, incumbent, department) {
  const saved = plan.spec || {};
  const family = saved.family || personFamily(incumbent || { title: plan.title, titleEn: plan.titleEn }, department);
  const level = saved.level || incumbent?.level || 'P6';
  const critical = saved.critical?.length ? saved.critical : [...new Set([...(isManagerLevel(level) ? ['leadership'] : []), ...FAMILY_FOCUS[family].slice(0, 3)])];
  // Key functional skills default to the incumbent's non-generic skills.
  const skills = saved.skills?.length ? saved.skills : (incumbent?.skills || []).filter((k) => skillByKey[k] && skillByKey[k].family !== 'general');
  return { family, level, critical, skills, profile: targetProfile(level), custom: Boolean(plan.spec) };
}

// Competency fit against the role profile; critical competencies count double.
function weightedFit(actual, spec) {
  let met = 0;
  let total = 0;
  for (const k of COMP_KEYS) {
    const t = spec.profile[k] || 0;
    if (!t) continue;
    const w = spec.critical.includes(k) ? 2 : 1;
    total += t * w;
    met += Math.min(t, Number(actual[k]) || 0) * w;
  }
  return total ? Math.round((met / total) * 100) : 0;
}

export function evaluateCandidate(emp, ctx) {
  const { spec, today, nomination, departments = {} } = ctx;
  const reasons = [];
  const checks = {};
  const fam = personFamily(emp, departments[emp.deptId]);

  // 1. Function: same family, a general-management role, or explicit evidence
  // (a written justification, or several of the role's own key skills).
  const roleSkills = (emp.skills || []).filter((k) => spec.skills.includes(k));
  if (fam === spec.family || spec.family === 'general') checks.function = { ok: true, kind: fam === spec.family ? 'same' : 'general' };
  else if (nomination?.evidence?.trim()) checks.function = { ok: true, kind: 'justified', evidence: nomination.evidence.trim() };
  else if (roleSkills.length >= Math.min(MIN_SKILL_EVIDENCE, spec.skills.length || MIN_SKILL_EVIDENCE) && roleSkills.length) checks.function = { ok: true, kind: 'skills', skills: roleSkills };
  else {
    checks.function = { ok: false, kind: 'mismatch' };
    reasons.push([`职能不匹配：候选人属于「${pick(FAMILIES[fam].name, 'zh')}」，岗位属于「${pick(FAMILIES[spec.family].name, 'zh')}」，且没有跨职能依据`, `Function mismatch: ${pick(FAMILIES[fam].name, 'en')} candidate for a ${pick(FAMILIES[spec.family].name, 'en')} role, with no cross-functional evidence`]);
  }

  // 2. Level distance to the role.
  const distance = levelRank(spec.level) - levelRank(emp.level);
  checks.level = { distance, ok: distance >= -MAX_LEVEL_ABOVE && distance <= MAX_LEVEL_DISTANCE };
  if (distance < -MAX_LEVEL_ABOVE) reasons.push([`职级（${emp.level}）明显高于目标岗位（${spec.level}）`, `Level ${emp.level} is well above the role (${spec.level})`]);
  else if (distance > MAX_LEVEL_DISTANCE) reasons.push([`职级差距过大（${emp.level} → ${spec.level}，差 ${distance} 级）`, `Too far below the role (${emp.level} → ${spec.level}, ${distance} steps)`]);

  // 3. Performance floor.
  checks.performance = { ok: Number(emp.performance) >= 3 };
  if (!checks.performance.ok) reasons.push([`最近绩效 ${emp.performance} 分，低于 3 分`, `Latest rating ${emp.performance} is below 3`]);

  // 4. Competency evidence against the role profile.
  const assess = assessCompetencies(emp.competencies, spec.profile);
  checks.data = { ok: assess.status === 'complete', missing: assess.missing };

  // 5. Flight risk.
  const risk = flightRisk(emp, today);
  checks.risk = { ok: !risk || risk.level !== 'high', risk };

  const fit = checks.data.ok ? weightedFit(emp.competencies, spec) : null;
  const components = checks.data.ok ? {
    fit: Math.round((fit / 100) * WEIGHTS.fit),
    performance: Math.round(((Math.min(5, Math.max(1, Number(emp.performance) || 1)) - 1) / 4) * WEIGHTS.performance),
    potential: Math.round(((Math.min(3, Math.max(1, Number(emp.potential) || 1)) - 1) / 2) * WEIGHTS.potential),
    readiness: Math.round((READINESS_POINTS[Math.min(Math.max(distance, 0), 3)] ?? 0) * WEIGHTS.readiness),
    retention: risk?.level === 'low' ? WEIGHTS.retention : risk?.level === 'medium' ? Math.round(WEIGHTS.retention / 2) : 0,
  } : null;
  const score = components ? Object.values(components).reduce((a, b) => a + b, 0) : null;

  let status;
  if (!checks.risk.ok) {
    status = 'excluded_risk';
    reasons.unshift([`流失风险 ${risk.score} 分（高）：不得进入有效继任名单，不参与排名或覆盖；建议先落实保留措施`, `Flight risk ${risk.score} (high): excluded from the eligible successor list, ranking and coverage; act on retention first`]);
  } else if (reasons.length) status = 'excluded';
  else if (!checks.data.ok) {
    status = 'insufficient_data';
    reasons.push([`缺少能力评估（${assess.missing.length} 项未评估），无法判断是否胜任`, `Missing competency ratings (${assess.missing.length} not assessed); suitability cannot be judged`]);
  } else if (fit < SUITABILITY.minFit || score < SUITABILITY.minScore) {
    status = 'below_bar';
    reasons.push([`能力匹配 ${fit}%、综合分 ${score}，未达适任标准（匹配 ≥ ${SUITABILITY.minFit}% 且综合分 ≥ ${SUITABILITY.minScore}）`, `Fit ${fit}% and score ${score} are below the bar (fit ≥ ${SUITABILITY.minFit}% and score ≥ ${SUITABILITY.minScore})`]);
  } else status = 'eligible';

  return {
    employee: emp,
    family: fam,
    status,
    reasons,
    checks,
    fit,
    components,
    score,
    distance,
    readiness: readinessFromDistance(Math.max(0, distance)),
    nominatedReadiness: nomination?.readiness || null,
    gaps: assess.gaps.map((g) => ({ ...g, critical: spec.critical.includes(g.key) })),
    risk,
  };
}

const rankEval = (a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.fit ?? -1) - (a.fit ?? -1) || a.employee.id.localeCompare(b.employee.id);

export function evaluatePlan(plan, employees, { today, departments = {} } = {}) {
  const byId = Object.fromEntries(employees.map((e) => [e.id, e]));
  const incumbent = byId[plan.incumbentId];
  const spec = roleSpec(plan, incumbent, departments[incumbent?.deptId || plan.deptId]);
  const ctx = { spec, today, departments };
  const nominations = (plan.successors || []).map((n, index) => {
    const emp = byId[n.employeeId];
    if (!emp || emp.status === 'left') return { index, nomination: n, employee: emp || { id: n.employeeId, name: '?' }, status: 'excluded', reasons: [['该员工已离职或不存在', 'This person has left or no longer exists']], checks: {}, score: null, fit: null, components: null };
    return { index, nomination: n, ...evaluateCandidate(emp, { ...ctx, nomination: n }) };
  });
  const ranked = nominations.filter((x) => x.status === 'eligible').sort(rankEval);
  ranked.forEach((candidate, index) => { candidate.priority = index + 1; });
  const preferred = ranked[0] || null;
  if (preferred) preferred.status = 'preferred';

  // Suggestions are only people who pass every gate and are not yet nominated.
  const nominated = new Set((plan.successors || []).map((n) => n.employeeId));
  const pool = employees.filter((e) => e.status !== 'left' && e.id !== plan.incumbentId && !nominated.has(e.id)).map((e) => evaluateCandidate(e, ctx));
  const suggestions = pool.filter((x) => x.status === 'eligible').sort(rankEval).slice(0, 5);
  // Strong candidates held back only by flight risk: shown separately, never recommended.
  const heldBack = pool.filter((x) => x.status === 'excluded_risk'
    && x.checks.function.ok && x.checks.level.ok && x.checks.data.ok && x.checks.performance.ok
    && x.fit >= SUITABILITY.minFit && x.score >= SUITABILITY.minScore).sort(rankEval).slice(0, 3);

  const eligibleCount = ranked.length;
  let coverage = 'weak';
  if (preferred && preferred.readiness === 'now' && eligibleCount >= 2) coverage = 'strong';
  else if (preferred) coverage = 'moderate';

  const incumbentRisk = incumbent ? flightRisk(incumbent, today) : null;
  const crit = CRITICALITY[plan.criticality] || CRITICALITY.medium;
  const gapWeight = { weak: 3, moderate: 2, strong: 1 }[coverage];
  const urgencyParts = [
    { label: [`${pick(crit.name, 'zh')} ×${crit.weight}`, `${pick(crit.name, 'en')} ×${crit.weight}`], value: null },
    { label: [`${pick(COVERAGE[coverage].name, 'zh')} ×${gapWeight}`, `${pick(COVERAGE[coverage].name, 'en')} ×${gapWeight}`], value: null },
  ];
  let urgency = crit.weight * gapWeight;
  if (incumbentRisk?.level === 'high' || incumbentRisk?.level === 'medium') {
    const p = incumbentRisk.level === 'high' ? 2 : 1;
    urgency += p;
    urgencyParts.push({ label: [`现任者流失风险${incumbentRisk.level === 'high' ? '高' : '中'} +${p}`, `Incumbent flight risk ${incumbentRisk.level} +${p}`] });
  }
  if (plan.vacancyRisk === 'high' || plan.vacancyRisk === 'medium') {
    const p = plan.vacancyRisk === 'high' ? 2 : 1;
    urgency += p;
    urgencyParts.push({ label: [`空缺风险${plan.vacancyRisk === 'high' ? '高' : '中'} +${p}`, `Vacancy risk ${plan.vacancyRisk} +${p}`] });
  }

  return { plan, incumbent, spec, nominations, ranked, preferred, suggestions, heldBack, coverage, eligibleCount, incumbentRisk, urgency, urgencyParts };
}

// Evaluates every plan, adds concentration warnings and orders by urgency.
export function evaluateAll(plans, employees, { today, departments = [] } = {}) {
  const deptMap = Array.isArray(departments) ? Object.fromEntries(departments.map((d) => [d.id, d])) : departments;
  const evaluated = plans.map((p) => evaluatePlan(p, employees, { today, departments: deptMap }));
  const concentration = {};
  for (const ev of evaluated) {
    for (const n of ev.ranked) {
      const c = (concentration[n.employee.id] ||= { nominated: [], preferred: [] });
      c.nominated.push(ev.plan.id);
      if (n.status === 'preferred') c.preferred.push(ev.plan.id);
    }
  }
  const warnings = Object.entries(concentration)
    .filter(([, c]) => c.preferred.length >= 2 || c.nominated.length >= CONCENTRATION_NOMINATIONS)
    .map(([employeeId, c]) => ({ employeeId, ...c }));
  const order = [...evaluated].sort((a, b) => b.urgency - a.urgency
    || (CRITICALITY[b.plan.criticality]?.weight || 0) - (CRITICALITY[a.plan.criticality]?.weight || 0)
    || String(a.plan.title).localeCompare(String(b.plan.title)));
  const summary = { strong: 0, moderate: 0, weak: 0 };
  for (const ev of evaluated) summary[ev.coverage] += 1;
  return { plans: order, concentration, warnings, summary };
}

// Where a person appears in succession: plans for their own role, and plans in
// which they are a candidate.
export function successionLinks(employeeId, evaluation) {
  const own = evaluation.plans.filter((ev) => ev.plan.incumbentId === employeeId);
  const asCandidate = evaluation.plans.flatMap((ev) => ev.nominations.filter((n) => n.employee.id === employeeId).map((n) => ({ ev, n })));
  return { own, asCandidate };
}

export const familyName = (key, lang = 'zh') => pick(FAMILIES[key]?.name || [key, key], lang);
export const compName = (key, lang = 'zh') => pick(compByKey[key].name, lang);
export { LEVELS, skillLabel };
