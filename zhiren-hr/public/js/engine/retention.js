import { flightRisk } from './talent.js';
import { addDays } from './text.js';

export function retentionEligible(employee, today) {
  const risk = employee && flightRisk(employee, today);
  return Boolean(employee && employee.status !== 'left' && risk?.level === 'high' && risk.regrettable);
}

const ACTIONS = {
  pay: [['绩效价值与薪酬面谈：共同确定下阶段 2–3 项可交付目标，明确绩效激励规则，并提交薪酬竞争力评审。', 'Hold a performance and pay conversation: agree 2–3 deliverables, document incentive rules and submit a pay review.'], ['直属上级 + HR', 'Manager + HR'], ['确认目标、激励规则及薪酬评审结论；不预先承诺调薪。', 'Document goals, incentive rules and pay-review outcome; no unapproved pay promises.']],
  promotion: [['员工、专业负责人和 HR 三方面谈，确认专业深耕或管理路线，列出下一职级差距、实践任务和评审时间。', 'Meet with the employee, function lead and HR to agree an expert or management path, gaps, assignments and a review date.'], ['专业负责人 + HR', 'Function lead + HR'], ['形成员工确认的职业路线图、下一阶段任务和评审日期。', 'Record an employee-confirmed career path, assignments and review date.']],
  engagement: [['进行留任访谈，确认两项主要困扰，协商工作负荷或协作调整，每两周回访一次。', 'Hold a stay interview, identify two concerns, agree workload or collaboration changes and check in fortnightly.'], ['直属上级 + HR', 'Manager + HR'], ['记录诉求、调整措施及员工对落实情况的反馈。', 'Record concerns, changes and employee feedback on delivery.']],
  manager: [['安排新上级与员工对齐职责、决策权限和反馈方式，连续四周开展一对一沟通。', 'Align responsibilities, decision rights and feedback with the new manager; hold weekly 1:1s for four weeks.'], ['直属上级', 'Manager'], ['完成职责约定和四次沟通记录。', 'Document responsibilities and four check-ins.']],
  growth: [['共同选择一项符合员工意愿的挑战任务，指定导师、资源和阶段成果，30 天检查首次交付。', 'Agree a stretch assignment with the employee, assign a mentor and resources, and review the first deliverable at day 30.'], ['直属上级 + 导师', 'Manager + mentor'], ['确认任务范围、资源支持、阶段成果与员工反馈。', 'Confirm scope, resources, milestone outcomes and employee feedback.']],
};

export function buildRetentionPlan(employee, today) {
  if (!retentionEligible(employee, today)) return null;
  const risk = flightRisk(employee, today);
  const seen = new Set();
  const actions = risk.factors.flatMap(factor => {
    const key = ACTIONS[factor.key] ? factor.key : 'growth';
    if (seen.has(key)) return [];
    seen.add(key);
    const [text, owner, evidence] = ACTIONS[key];
    return [{ key, reason: factor.text, text, owner, evidence, due: addDays(today, key === 'growth' ? 30 : 14), done: false }];
  });
  return { employeeId: employee.id, mode: 'retention', status: 'active', name: employee.name, nameEn: employee.nameEn,
    startedAt: today, reviewDue: addDays(today, 90), baseline: { score: risk.score, engagement: employee.engagement ?? null, factors: risk.factors }, actions, reviews: [] };
}

export function retentionProgress(plan) {
  return plan.actions?.length ? Math.round(100 * plan.actions.filter(a => a.done).length / plan.actions.length) : 0;
}
