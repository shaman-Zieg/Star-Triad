// Training & development: 70-20-10 development plans, training needs analysis
// (TNA), learning statistics and Kirkpatrick / ROI evaluation.
import { COMP_KEYS, targetProfile, nextLevel, gaps, assessCompetencies } from './competency.js';
import { mean, round, addDays } from './text.js';

export const FORMATS = {
  online: ['在线课程', 'Online course'],
  classroom: ['面授课程', 'Classroom'],
  workshop: ['工作坊', 'Workshop'],
  mentoring: ['导师计划', 'Mentoring program'],
  project: ['行动学习项目', 'Action learning'],
};

// Seed catalog; each course develops one competency.
export const COURSE_CATALOG = [
  ['k01', 'professional', 'online', 12, ['岗位专业技能进阶（按序列）', 'Advanced job skills (by job family)'], 'foundation'],
  ['k02', 'professional', 'workshop', 8, ['专家经验萃取与知识沉淀', 'Capturing and sharing expert know-how'], 'advanced'],
  ['k03', 'problem', 'classroom', 7, ['结构化思维与问题解决', 'Structured thinking and problem solving'], 'foundation'],
  ['k04', 'problem', 'workshop', 7, ['数据驱动决策', 'Data-driven decision making'], 'advanced'],
  ['k05', 'execution', 'online', 4, ['目标管理与 OKR 实践', 'Goal setting and OKRs in practice'], 'foundation'],
  ['k06', 'execution', 'classroom', 7, ['项目管理实战', 'Practical project management'], 'advanced'],
  ['k07', 'communication', 'classroom', 7, ['高效沟通与金字塔表达', 'Effective communication and the pyramid principle'], 'foundation'],
  ['k08', 'communication', 'workshop', 7, ['影响力与跨部门说服', 'Influence without authority'], 'advanced'],
  ['k09', 'collaboration', 'workshop', 4, ['跨团队协作与冲突管理', 'Cross-team collaboration and conflict'], 'foundation'],
  ['k10', 'collaboration', 'project', 16, ['跨部门行动学习项目', 'Cross-functional action learning project'], 'advanced'],
  ['k11', 'learning', 'online', 3, ['成长型思维与学习方法', 'Growth mindset and learning how to learn'], 'foundation'],
  ['k12', 'learning', 'mentoring', 12, ['导师结对计划', 'Mentoring program'], 'advanced'],
  ['k13', 'innovation', 'workshop', 7, ['设计思维工作坊', 'Design thinking workshop'], 'foundation'],
  ['k14', 'innovation', 'classroom', 7, ['变革管理与领导变革', 'Leading change'], 'advanced'],
  ['k15', 'leadership', 'classroom', 14, ['新任经理必修：从个人贡献者到管理者', 'New manager essentials: from contributor to manager'], 'foundation'],
  ['k16', 'leadership', 'workshop', 7, ['教练式领导力（GROW 模型）', 'Coaching leadership with the GROW model'], 'advanced'],
  ['k17', 'leadership', 'project', 24, ['高潜人才领导力发展项目', 'High-potential leadership program'], 'advanced'],
  ['k18', 'communication', 'online', 2, ['如何给予与接收反馈', 'Giving and receiving feedback'], 'foundation'],
  ['k19', 'execution', 'online', 2, ['时间管理与精力管理', 'Managing time and energy'], 'foundation'],
  ['k20', 'professional', 'online', 6, ['AI 工具在工作中的应用', 'Using AI tools at work'], 'foundation'],
].map(([id, competency, format, hours, title, level]) => ({ id, competency, format, hours, title: title[0], titleEn: title[1], level, provider: format === 'online' ? 'e-Learning' : 'Academy' }));

// 70%: learning on the job.
export const EXPERIENCES = {
  professional: [['承担一项超出当前难度的专业任务，并在完成后复盘', 'Take on a technically harder assignment and review it afterwards'], ['在团队内做一次专题分享', 'Run a knowledge-sharing session for the team'], ['参与制定或评审一项专业标准/规范', 'Help write or review a professional standard']],
  problem: [['主导一个问题的根因分析，输出改进方案', 'Lead a root-cause analysis and propose a fix'], ['用数据验证一个业务假设', 'Test a business hypothesis with data'], ['参与一次复杂事故或问题的复盘', 'Take part in the post-mortem of a complex incident']],
  execution: [['负责一个有明确目标和期限的小项目', 'Own a small project with clear goals and deadlines'], ['为自己设定季度 OKR 并每周跟踪', 'Set quarterly OKRs and track them weekly'], ['接手一个停滞的事项并推动完成', 'Take over a stalled item and drive it to completion']],
  communication: [['在部门例会上汇报一次工作进展', 'Present progress at a department meeting'], ['主导一次跨部门需求沟通会', 'Lead a cross-team requirements meeting'], ['为高层撰写一页纸决策建议', 'Write a one-page decision memo for leadership']],
  collaboration: [['参与一个跨部门项目并承担接口角色', 'Act as the interface on a cross-department project'], ['主动支持一位同事完成关键任务', 'Help a colleague deliver a critical task'], ['组织一次团队协作复盘', 'Facilitate a team collaboration retrospective']],
  learning: [['在新领域承担一项任务（轮岗或兼岗）', 'Take on a task in a new area (rotation or side role)'], ['每月向上级和同事征求一次反馈', 'Ask manager and peers for feedback monthly'], ['学完一门课程后在工作中实践并分享', 'Apply and share what was learned after a course']],
  innovation: [['提出并试点一项流程或产品改进', 'Propose and pilot a process or product improvement'], ['参与内部创新大赛或黑客松', 'Join an internal innovation challenge or hackathon'], ['调研行业新做法并给出引入建议', 'Research new industry practices and recommend adoption']],
  leadership: [['带领 2-3 人的小组完成一项任务', 'Lead a 2-3 person group to deliver a task'], ['担任新员工的入职导师', 'Be an onboarding buddy for a new hire'], ['代理上级主持一次团队会议', 'Chair a team meeting on behalf of the manager']],
};

// 20%: learning from others.
export const SOCIAL = {
  professional: [['向领域专家请教，每月一次', 'Monthly sessions with a domain expert'], ['参加行业社群或技术沙龙', 'Join an industry community or meetup']],
  problem: [['与资深同事结对分析问题', 'Pair with a senior colleague on analyses'], ['请上级点评自己的分析报告', 'Ask the manager to critique an analysis']],
  execution: [['与上级每两周进行一次目标复盘', 'Bi-weekly goal check-ins with the manager'], ['观察高绩效同事的工作方式', 'Shadow a high performer']],
  communication: [['请同事对一次汇报给出具体反馈', 'Get specific feedback on a presentation'], ['观摩优秀的跨部门沟通会议', 'Observe a strong cross-team meeting']],
  collaboration: [['与协作方负责人定期沟通', 'Regular syncs with partner team leads'], ['参加 360 度反馈', 'Take part in 360-degree feedback']],
  learning: [['找一位导师，每月交流', 'Find a mentor and meet monthly'], ['加入学习小组', 'Join a learning circle']],
  innovation: [['与其他团队交流最佳实践', 'Exchange best practices with other teams'], ['邀请用户/客户访谈获取新视角', 'Interview users or customers for new perspectives']],
  leadership: [['接受教练式辅导（GROW）', 'Receive coaching (GROW model)'], ['与资深管理者结对，讨论管理案例', 'Pair with a senior manager on management cases']],
};

// Builds a 70-20-10 IDP from competency gaps. When there is no gap against the
// current level, the plan targets the next level instead (career growth).
export function buildIDP(emp, courses = COURSE_CATALOG, startDate) {
  const current = targetProfile(emp.level);
  // Without a full assessment there is no evidence for gaps; ask for one first.
  if (assessCompetencies(emp.competencies, current).status !== 'complete') return { mode: 'unassessed', focus: [] };
  let list = gaps(emp.competencies, current).filter((g) => g.gap > 0);
  let mode = 'gap';
  if (!list.length) {
    list = gaps(emp.competencies, targetProfile(nextLevel(emp.level))).filter((g) => g.gap > 0);
    mode = 'growth';
  }
  if (!list.length) {
    // Already at the top of the profile: deepen the two strongest areas.
    list = COMP_KEYS.map((key) => ({ key, actual: emp.competencies?.[key] || 0, target: 5, gap: 5 - (emp.competencies?.[key] || 0) })).filter((g) => g.gap > 0).sort((a, b) => a.gap - b.gap);
    mode = 'mastery';
  }
  const start = startDate || new Date().toISOString().slice(0, 10);
  const focus = list.slice(0, 3).map((g, idx) => {
    const course = courses.find((c) => c.competency === g.key && (g.actual >= 3 ? c.level === 'advanced' : c.level === 'foundation'))
      || courses.find((c) => c.competency === g.key);
    const actions = [
      ...EXPERIENCES[g.key].slice(0, 2).map((text, i) => ({ type: '70', text, due: addDays(start, 60 + i * 30 + idx * 15), done: false })),
      { type: '20', text: SOCIAL[g.key][0], due: addDays(start, 45 + idx * 15), done: false },
    ];
    if (course) actions.push({ type: '10', courseId: course.id, text: [course.title, course.titleEn], due: addDays(start, 30 + idx * 15), done: false });
    return {
      competency: g.key,
      actual: g.actual,
      target: Math.min(5, Math.max(g.target, g.actual + 1)),
      actions,
    };
  });
  return { mode, focus };
}

export function idpProgress(idp) {
  const all = (idp.focus || []).flatMap((f) => f.actions);
  return all.length ? Math.round((all.filter((a) => a.done).length / all.length) * 100) : 0;
}

// Training needs analysis across a population.
export function tna(employees, departments = []) {
  // Only fully assessed people count; missing ratings are not treated as gaps.
  const active = employees.filter((e) => e.status !== 'left' && assessCompetencies(e.competencies, targetProfile(e.level)).status === 'complete');
  const byComp = COMP_KEYS.map((key) => {
    const gs = active.map((e) => targetProfile(e.level)[key] - (e.competencies[key] || 0));
    const withGap = gs.filter((g) => g >= 1).length;
    const avgGap = round(mean(gs.map((g) => Math.max(0, g))), 2);
    const share = active.length ? withGap / active.length : 0;
    return { key, avgGap, share: round(share, 3), withGap, priority: round(share * (1 + avgGap) * 100, 1) };
  }).sort((a, b) => b.priority - a.priority);

  const matrix = departments.map((d) => {
    const ds = active.filter((e) => e.deptId === d.id);
    const cells = Object.fromEntries(COMP_KEYS.map((key) => [key, ds.length ? round(mean(ds.map((e) => Math.max(0, targetProfile(e.level)[key] - (e.competencies[key] || 0)))), 2) : null]));
    return { deptId: d.id, n: ds.length, cells };
  }).filter((r) => r.n > 0);
  const unassessed = employees.filter((e) => e.status !== 'left').length - active.length;
  return { n: active.length, unassessed, byComp, matrix };
}

export function learningStats(enrollments, employees, courses) {
  const courseById = Object.fromEntries(courses.map((c) => [c.id, c]));
  const active = employees.filter((e) => e.status !== 'left');
  const done = enrollments.filter((e) => e.status === 'completed');
  const hours = done.reduce((a, e) => a + (courseById[e.courseId]?.hours || 0), 0);
  const scores = done.map((e) => e.satisfaction).filter(Boolean);
  return {
    enrollments: enrollments.length,
    completed: done.length,
    completionRate: enrollments.length ? done.length / enrollments.length : 0,
    hoursPerHead: active.length ? round(hours / active.length, 1) : 0,
    satisfaction: scores.length ? round(mean(scores), 2) : null,
    learners: new Set(enrollments.map((e) => e.employeeId)).size,
  };
}

// Kirkpatrick four-level evaluation plus Phillips ROI.
export function evaluateProgram({ reaction, pre, post, behavior, metricBefore, metricAfter, benefit, cost }) {
  const out = { levels: [] };
  const n = (v) => (v === '' || v == null ? null : Number(v));
  const r = n(reaction);
  if (r != null) out.levels.push({ level: 1, value: r, max: 5, ok: r >= 4, note: r >= 4 ? ['学员满意度良好', 'Participants were satisfied'] : ['满意度偏低，检查内容匹配度与讲师', 'Low satisfaction: check content fit and facilitation'] });
  const a = n(pre);
  const b = n(post);
  if (a != null && b != null) {
    const gain = a ? (b - a) / a : null;
    out.levels.push({ level: 2, value: round(b - a, 1), gain: gain == null ? null : round(gain * 100, 1), ok: b > a, note: b > a ? ['学习效果明显，知识/技能得到提升', 'Clear learning gain'] : ['测试成绩无提升，需复查教学设计', 'No test gain: review the learning design'] });
  }
  const c = n(behavior);
  if (c != null) out.levels.push({ level: 3, value: c, max: 5, ok: c >= 3.5, note: c >= 3.5 ? ['上级观察到行为改变', 'Managers see behavior change'] : ['行为迁移不足，加强训后跟进与上级支持', 'Weak transfer: add follow-up and manager support'] });
  const m0 = n(metricBefore);
  const m1 = n(metricAfter);
  if (m0 != null && m1 != null) {
    const change = m0 ? (m1 - m0) / Math.abs(m0) : null;
    out.levels.push({ level: 4, value: change == null ? null : round(change * 100, 1), ok: m1 > m0, note: m1 > m0 ? ['业务指标改善（需排除其他因素影响）', 'Business metric improved (isolate other factors)'] : ['业务指标未改善', 'Business metric did not improve'] });
  }
  const B = n(benefit);
  const C = n(cost);
  if (B != null && C) {
    out.roi = round(((B - C) / C) * 100, 1);
    out.bcr = round(B / C, 2);
  }
  return out;
}
