// HR toolkit: a methodology library that links each method to its tool, plus calculators.
import { html, setHTML, icon, fmt, today, load, pageHead, field, input, select, method, callout, badge, on } from '../core.js';
import { L, tx } from '../i18n.js';
import { annualLeave, overtimePay, salaryBand, compaRatio, turnover, recruitingFunnel, headcountPlan, trailingTurnover, funnelRates, openSeats } from '../engine/calc.js';
import { hbars } from '../charts.js';

// `href` is the tool that applies the method; methods without one are reference only.
const M = (key, cat, name, what, steps, pitfall, href = null) => ({ key, cat, name, what, steps, pitfall, href });
const METHODS = [
  M('star', 'hire', ['STAR / 行为事件访谈（BEI）', 'STAR / behavioral event interviewing'], ['过去的行为是未来行为的最佳预测。通过情境-任务-行动-结果追问获取真实证据。', 'Past behavior predicts future behavior. Probe Situation, Task, Action, Result for real evidence.'],
    [['按岗位确定 4-5 项关键能力', 'Pick 4-5 critical competencies for the role'], ['每项能力准备 1-2 道行为题', 'Prepare 1-2 behavioral questions each'], ['追问"你具体做了什么"直到结果', 'Probe "what did you do" through to the result'], ['对照行为锚点独立评分后再讨论', 'Score against anchors independently, then discuss']],
    ['问假设性问题、被"我们"带过、凭印象打分', 'Hypothetical questions, accepting "we", scoring on impressions'], '#/recruit/interview'),
  M('fit', 'hire', ['人岗匹配与无偏筛选', 'Job fit and bias-aware screening'], ['用岗位必备要素加权打分，把注意力放在证据上，并剔除与岗位无关的信息。', 'Weight job-critical requirements and focus on evidence, leaving out job-irrelevant information.'],
    [['区分必备与加分条件', 'Separate must-haves from nice-to-haves'], ['为每项要求设定权重', 'Weight each requirement'], ['统一标准筛选全部简历', 'Screen every resume on the same standard'], ['记录筛选理由以便复盘', 'Record reasons so they can be reviewed']],
    ['用院校、年龄等代理指标替代能力判断', 'Using school or age as a proxy for ability'], '#/recruit/screen'),
  M('iceberg', 'talent', ['胜任力冰山模型', 'Competency iceberg model'], ['知识技能在水面之上易于培养；动机、特质、价值观在水面之下决定长期表现（Spencer & Spencer）。', 'Knowledge and skills sit above the waterline and are easy to build; motives, traits and values below it drive long-term performance (Spencer & Spencer).'],
    [['萃取高绩效者的关键行为', 'Extract the behaviors of top performers'], ['定义 5 级行为锚点', 'Define 5-level behavioral anchors'], ['按职级设定目标要求', 'Set targets by level'], ['用于招聘、评估与发展', 'Use for hiring, assessment and development']],
    ['能力项过多过泛、缺少行为描述', 'Too many vague competencies without behaviors'], '#/talent/competency'),
  M('ninebox', 'talent', ['人才九宫格', '9-box talent grid'], ['以绩效（结果）和潜力（未来）两个维度对人才分类，差异化投入资源。', 'Classify talent on performance (results) and potential (future) to invest differently.'],
    [['上级预评绩效与潜力', 'Managers pre-rate performance and potential'], ['召开校准会统一尺度', 'Calibrate in a talent review meeting'], ['按格子制定差异化措施', 'Agree actions per box'], ['跟踪行动并定期复盘', 'Track actions and review regularly']],
    ['把潜力等同于绩效、结果只停在贴标签', 'Treating potential as performance; stopping at labels'], '#/talent/ninebox'),
  M('agility', 'talent', ['学习敏锐度', 'Learning agility'], ['潜力的核心：在全新情境中快速学习并取得成果的意愿和能力（思维、人际、变革、结果、自我觉察）。', 'The core of potential: the will and skill to learn fast and deliver in new situations (mental, people, change, results, self-awareness).'],
    [['收集近一年的关键事例', 'Gather key examples from the past year'], ['按五个维度评分', 'Rate the five dimensions'], ['结合绩效判断潜力等级', 'Combine with performance to judge potential']],
    ['仅凭学历或表达能力判断潜力', 'Judging potential by degrees or eloquence'], '#/talent/ninebox'),
  M('succession', 'talent', ['继任计划与人才梯队', 'Succession and bench strength'], ['识别关键岗位，为每个岗位准备不同准备度的继任者，降低关键人员流失的业务风险。', 'Identify key roles and prepare successors at different readiness levels to reduce key-person risk.'],
    [['按影响和稀缺性识别关键岗位', 'Find key roles by impact and scarcity'], ['评估现任者的空缺风险', 'Assess vacancy risk for incumbents'], ['提名继任者并评估准备度', 'Nominate successors and rate readiness'], ['为继任者制定加速发展计划', 'Accelerate successor development']],
    ['名单做完就束之高阁', 'Building the list and never acting on it'], '#/talent/succession'),
  M('702010', 'grow', ['70-20-10 学习法则', '70-20-10 learning model'], ['70% 能力来自工作中的挑战与实践，20% 来自他人的反馈与辅导，10% 来自正式培训。', '70% of growth comes from challenging work, 20% from feedback and coaching, 10% from formal training.'],
    [['找到 2-3 项关键差距', 'Pick 2-3 critical gaps'], ['为每项设计挑战任务', 'Design a stretch assignment for each'], ['配套导师与反馈机制', 'Add mentoring and feedback'], ['用课程补齐知识', 'Fill knowledge gaps with courses']],
    ['把 IDP 写成"上课清单"', 'Writing the IDP as a list of courses'], '#/learning/idp'),
  M('grow', 'grow', ['GROW 教练模型', 'GROW coaching model'], ['Goal 目标 → Reality 现状 → Options 方案 → Will 行动，用提问帮助员工自己找到答案。', 'Goal, Reality, Options, Will: ask questions that help people find their own answers.'],
    [['G：你希望达成什么？', 'G: What do you want to achieve?'], ['R：现在情况如何？', 'R: Where are you now?'], ['O：有哪些可能的做法？', 'O: What could you do?'], ['W：你会先做什么？何时？', 'W: What will you do first, and when?']],
    ['急于给建议，把教练对话变成指导', 'Jumping to advice and turning coaching into telling']),
  M('kirkpatrick', 'grow', ['柯氏四级评估', 'Kirkpatrick four levels'], ['反应、学习、行为、结果四个层级评估培训效果，并可延伸计算 ROI。', 'Evaluate training at reaction, learning, behavior and results levels, and extend to ROI.'],
    [['训前定义业务目标与指标', 'Define business goals and metrics before training'], ['训后即时收集满意度与测试', 'Collect reactions and tests right after'], ['3 个月后评估行为改变', 'Assess behavior change after 3 months'], ['分析业务结果与 ROI', 'Analyze results and ROI']],
    ['只做满意度问卷', 'Stopping at the satisfaction survey'], '#/learning/eval'),
  M('sixbox', 'org', ['韦斯伯德六盒模型', 'Weisbord Six-Box model'], ['从目标、结构、关系、激励、领导、支持机制六个盒子诊断组织，领导盒居中维持平衡。', 'Diagnose purposes, structure, relationships, rewards, leadership and mechanisms; leadership keeps the boxes in balance.'],
    [['发起匿名调研', 'Run an anonymous survey'], ['识别得分低且分歧大的盒子', 'Find low-scoring, high-variance boxes'], ['焦点小组验证根因', 'Validate root causes in focus groups'], ['制定干预措施并复测', 'Act and re-measure']],
    ['只看平均分，忽略部门差异', 'Looking only at averages, ignoring department differences'], '#/org/diagnosis?new=sixbox'),
  M('7s', 'org', ['麦肯锡 7S', 'McKinsey 7S'], ['战略、结构、制度三个硬要素与共同价值观、风格、人员、技能四个软要素需要相互匹配。', 'Hard elements (strategy, structure, systems) must align with soft ones (shared values, style, staff, skills).'],
    [['描述当前 7 个要素', 'Describe the current state of all seven'], ['定义目标状态', 'Define the target state'], ['找出不一致之处', 'Find misalignments'], ['排序并制定变革计划', 'Prioritize and plan the change']],
    ['只调结构不调软要素', 'Changing structure without touching the soft elements'], '#/org/diagnosis?new=mck7s'),
  M('lencioni', 'org', ['团队协作五大障碍', 'Five dysfunctions of a team'], ['信任缺失 → 惧怕冲突 → 欠缺投入 → 逃避责任 → 无视结果，自下而上逐层解决。', 'Absence of trust, fear of conflict, lack of commitment, avoidance of accountability, inattention to results: fix them bottom up.'],
    [['团队匿名自评', 'Anonymous team self-assessment'], ['从最底层的短板开始', 'Start with the lowest layer that is weak'], ['约定团队行为规范', 'Agree team norms'], ['季度复盘', 'Review quarterly']],
    ['跳过信任直接要求结果', 'Demanding results before building trust'], '#/org/diagnosis?new=team'),
  M('raci', 'org', ['RACI 责任矩阵', 'RACI matrix'], ['明确跨部门流程中每个环节由谁执行（R）、谁拍板（A）、咨询谁（C）、通知谁（I）。', 'For every step of a cross-team process, define who does it (R), who decides (A), who is consulted (C) and informed (I).'],
    [['列出流程环节', 'List the process steps'], ['列出参与角色', 'List the roles'], ['逐格分配 RACI', 'Assign RACI cell by cell'], ['检查每行唯一 A', 'Check one A per row']],
    ['A 太多导致无人负责，C 太多导致决策缓慢', 'Too many As means nobody owns it; too many Cs slows decisions'], '#/org/raci'),
  M('onboarding', 'org', ['30-60-90 天融入计划', '30-60-90 day onboarding'], ['分阶段设定融入目标，让新员工尽快产生价值、建立关系、降低早期流失。', 'Staged goals help new hires deliver sooner, build relationships and stay.'],
    [['入职前准备设备与导师', 'Prepare equipment and a buddy before day one'], ['第一周明确目标', 'Agree goals in week one'], ['30/60/90 天定期沟通', 'Check in at 30/60/90 days'], ['试用期结束正式评估', 'Formal review at the end of probation']],
    ['入职当天才开始准备', 'Starting preparation on day one'], '#/service/onboarding'),
];
const CATS = { hire: ['招聘', 'Hiring'], talent: ['人才', 'Talent'], grow: ['发展', 'Development'], org: ['组织', 'Organization'] };

const CALCS = [
  ['leave', 'calc', ['年假天数计算', 'Annual leave'], ['按累计工龄与入职日期折算法定年假', 'Statutory leave by service years, pro-rated for new joiners']],
  ['overtime', 'clock', ['加班费计算', 'Overtime pay'], ['按 150% / 200% / 300% 计算加班工资', 'Overtime at 150% / 200% / 300%']],
  ['band', 'chart', ['薪酬带宽与比较比率', 'Pay bands & compa-ratio'], ['由中位值与带宽设计薪级，评估个人薪酬位置', 'Design a band from midpoint and spread; place a salary in it']],
  ['turnover', 'route', ['离职率与离职成本', 'Turnover & its cost'], ['年化离职率、主动离职占比与替换成本', 'Annualized turnover, voluntary share and replacement cost']],
  ['funnel', 'briefcase', ['招聘漏斗倒推', 'Recruiting funnel'], ['由招聘目标倒推每个阶段需要的候选人数', 'Work back from hires to candidates needed per stage']],
  ['headcount', 'users', ['人员编制规划', 'Headcount plan'], ['结合业务增长与离职率测算招聘需求', 'Hires needed from growth and attrition']],
];

export default async function toolkit(el, ctx) {
  if (ctx.sub && CALCS.some(([k]) => k === ctx.sub)) return calculator(el, ctx.sub);
  const cat = ctx.query.cat || '';
  setHTML(el, html`
    ${pageHead(L('HR 工具箱', 'HR toolkit'), L('经典 HR 方法论的要点与常见误区，每一条都连接到可直接使用的工具；以及常用的合规与测算计算器。', 'The essentials and common pitfalls of proven HR methods, each linked to a working tool, plus everyday compliance and planning calculators.'))}
    <section class="card" style="margin-bottom:16px"><div class="card-head"><div><h2>${L('计算器', 'Calculators')}</h2><p>${L('计算规则依据国家层面规定，地方政策可能不同', 'Rules follow national PRC regulations; local rules may differ')}</p></div></div>
      <div class="grid cols-4">${CALCS.map(([k, ic, n, p]) => html`<a class="card tool-card" href="#/toolkit/${k}"><span class="ico">${icon(ic)}</span><strong>${tx(n)}</strong><p>${tx(p)}</p></a>`)}</div></section>
    <div class="row-between" style="margin-bottom:12px"><h2 style="font-size:16px">${L('方法论库', 'Method library')}</h2>
      <div class="seg"><button type="button" class="${!cat ? 'on' : ''}" data-cat="">${L('全部', 'All')}</button>${Object.entries(CATS).map(([k, v]) => html`<button type="button" class="${cat === k ? 'on' : ''}" data-cat="${k}">${tx(v)}</button>`)}</div></div>
    <div class="grid cols-2">${METHODS.filter((m) => !cat || m.cat === cat).map((m) => html`<section class="card">
      <div class="card-head"><div><h2>${tx(m.name)}</h2></div>${badge(tx(CATS[m.cat]), 'brand')}</div>
      <p class="small">${tx(m.what)}</p>
      <ol class="small" style="padding-left:18px;margin:6px 0">${m.steps.map((s) => html`<li>${tx(s)}</li>`)}</ol>
      <div class="callout callout-warn small" style="margin:8px 0">${icon('alert')}<div>${L('常见误区：', 'Pitfall: ')}${tx(m.pitfall)}</div></div>
      ${m.href ? html`<a class="btn btn-sm" href="${m.href}">${L('打开工具', 'Open the tool')} ${icon('chevron-right')}</a>` : html`<span class="small muted">${L('方法参考，暂无对应工具', 'Reference only; no matching tool')}</span>`}</section>`)}</div>`);
  on(el, 'click', '[data-cat]', (e, b) => { location.hash = `#/toolkit${b.dataset.cat ? `?cat=${b.dataset.cat}` : ''}`; });
}

// Turnover, headcount and funnel start from the company's own records (same basis as the dashboard).
async function liveData(key) {
  if (!['turnover', 'headcount', 'funnel'].includes(key)) return null;
  const d = await load('employees', 'positions', 'candidates');
  return { tt: trailingTurnover(d.employees, today()), seats: openSeats(d.positions, d.candidates), rates: funnelRates(d.candidates) };
}

async function calculator(el, key) {
  const [, , name, desc] = CALCS.find(([k]) => k === key);
  const live = await liveData(key).catch(() => null);
  const tt = live?.tt;
  const pct1 = (x) => Math.round(x * 1000) / 10;
  // A live conversion rate when the pipeline has one, otherwise the benchmark default.
  const rate = (stage, fallback) => {
    const r = live?.rates[stage];
    return r?.rate ? { value: r.rate, hint: L(`当前管道：${r.to} / ${r.from} 人`, `Current pipeline: ${r.to} of ${r.from}`) } : { value: fallback, hint: live ? L('管道数据不足，使用经验值', 'Not enough pipeline data; benchmark value') : undefined };
  };
  const R = { applied: rate('applied', 30), screen: rate('screen', 50), interview: rate('interview', 25), offer: rate('offer', 80) };
  const seatsHint = live ? L(`在招职位剩余编制 ${live.seats} 人`, `${live.seats} seats left on open requisitions`) : undefined;
  const liveNote = {
    turnover: L('已按近 12 个月员工档案预填，结果与工作台的年化离职率一致；平均年薪与替换成本系数请按实际填写。', 'Prefilled from the last 12 months of employee records, so the rate matches the dashboard. Enter your own average salary and cost multiple.'),
    headcount: L('当前人数与离职率已按员工档案预填；增长比例请按业务计划填写。', 'Current headcount and attrition come from employee records; enter growth from your business plan.'),
    funnel: L('录用人数与各阶段转化率已按当前招聘管道预填。仍在流程中的候选人会让后段转化率偏低，可按经验调整。', 'Hires and conversion rates come from the current pipeline. Candidates still in process pull later-stage rates down; adjust as needed.'),
  }[key];
  const F = {
    leave: html`${field(L('累计工作年限（含以前单位）', 'Total years worked (all employers)'), input('totalYears', { type: 'number', min: 0, step: 0.5, value: 6 }))}
      ${field(L('本单位入职日期', 'Join date'), input('joinDate', { type: 'date', value: today() }))}
      ${field(L('计算年度', 'Year'), input('year', { type: 'number', value: new Date().getFullYear() }))}`,
    overtime: html`${field(L('月工资（元）', 'Monthly salary (RMB)'), input('monthly', { type: 'number', value: 15000 }))}
      ${field(L('工作日延时（小时）', 'Weekday overtime (hours)'), input('weekday', { type: 'number', value: 10 }))}
      ${field(L('休息日加班且未补休（小时）', 'Rest-day hours without time off in lieu'), input('restday', { type: 'number', value: 8 }))}
      ${field(L('法定节假日加班（小时）', 'Public-holiday hours'), input('holiday', { type: 'number', value: 0 }))}`,
    band: html`${field(L('薪级中位值（元/月）', 'Band midpoint (RMB/month)'), input('midpoint', { type: 'number', value: 25000 }))}
      ${field(L('带宽（%）', 'Range spread (%)'), input('spread', { type: 'number', value: 50 }), { hint: L('（最大值 − 最小值）÷ 最小值，专业岗常用 40-60%', '(max − min) / min; professional roles often 40-60%') })}
      ${field(L('员工当前月薪（元）', 'Employee salary (RMB/month)'), input('salary', { type: 'number', value: 21000 }))}`,
    turnover: html`${field(L('期间离职人数', 'Leavers in period'), input('leavers', { type: 'number', value: tt ? tt.leavers.length : 8 }))}
      ${field(L('其中主动离职', 'Of which voluntary'), input('voluntary', { type: 'number', value: tt ? tt.voluntary : 7 }))}
      ${field(L('期初人数', 'Headcount at start'), input('startHeadcount', { type: 'number', value: tt ? tt.startHeadcount : 70 }), { hint: tt ? L('当前在职 − 期间入职 + 期间离职', 'Current − joiners + leavers in the period') : undefined })}
      ${field(L('期末人数', 'Headcount at end'), input('endHeadcount', { type: 'number', value: tt ? tt.endHeadcount : 72 }))}
      ${field(L('期间月数', 'Months in period'), input('months', { type: 'number', value: 12 }))}
      ${field(L('离职员工平均年薪（元）', 'Average annual salary of leavers (RMB)'), input('avgSalary', { type: 'number', value: 240000 }))}
      ${field(L('替换成本系数', 'Replacement cost multiple'), select('costMultiple', [['0.5', L('0.5（基础岗位）', '0.5 (entry roles)')], ['1', L('1.0（专业岗位）', '1.0 (professionals)')], ['1.5', L('1.5（资深/管理岗位）', '1.5 (senior/managers)')], ['2', L('2.0（高管/稀缺岗位）', '2.0 (executives/scarce)')]], { value: '1' }))}`,
    funnel: html`${field(L('计划录用人数', 'Hires needed'), input('hires', { type: 'number', value: live?.seats || 5 }), { hint: seatsHint })}
      ${field(L('简历 → 初筛通过率（%）', 'Applied → screened (%)'), input('applied', { type: 'number', value: R.applied.value }), { hint: R.applied.hint })}
      ${field(L('初筛 → 面试通过率（%）', 'Screened → interviewed (%)'), input('screen', { type: 'number', value: R.screen.value }), { hint: R.screen.hint })}
      ${field(L('面试 → Offer 比例（%）', 'Interviewed → offer (%)'), input('interview', { type: 'number', value: R.interview.value }), { hint: R.interview.hint })}
      ${field(L('Offer 接受率（%）', 'Offer acceptance (%)'), input('offer', { type: 'number', value: R.offer.value }), { hint: R.offer.hint })}
      ${field(L('招聘总费用（元）', 'Total recruiting cost (RMB)'), input('costs', { type: 'number', value: 60000 }))}`,
    headcount: html`${field(L('当前人数', 'Current headcount'), input('current', { type: 'number', value: tt ? tt.endHeadcount : 72 }))}
      ${field(L('业务增长带来的人员增长（%）', 'Growth in headcount (%)'), input('growth', { type: 'number', value: 15 }), { hint: live && tt.endHeadcount ? L(`参考：${seatsHint}，约为当前人数的 ${fmt.pct(live.seats / tt.endHeadcount)}`, `For reference: ${seatsHint}, about ${fmt.pct(live.seats / tt.endHeadcount)} of current headcount`) : undefined })}
      ${field(L('预计年离职率（%）', 'Expected annual attrition (%)'), input('attrition', { type: 'number', step: 0.1, value: tt ? pct1(tt.rate) : 12 }), { hint: tt ? L('默认取近 12 个月实际离职率', 'Defaults to the actual last-12-month rate') : undefined })}`,
  };
  setHTML(el, html`${pageHead(tx(name), tx(desc))}
    <a href="#/toolkit" class="small">← ${L('工具箱', 'Toolkit')}</a>
    <div class="split-wide" style="margin-top:10px">
      <section class="card"><form id="calc" class="stack" style="gap:12px">${live && liveNote ? callout('info', liveNote) : ''}${F[key]}</form></section>
      <section class="card" id="out"></section>
    </div>`);
  const form = el.querySelector('#calc');
  const out = el.querySelector('#out');
  const big = (label, value, tone) => html`<div><div class="small muted">${label}</div><div class="result-big" style="${tone ? `color:var(--${tone})` : ''}">${value}</div></div>`;
  const render = () => {
    const v = Object.fromEntries(new FormData(form));
    let content;
    if (key === 'leave') {
      const r = annualLeave(v);
      content = html`<div class="row" style="gap:28px">${big(L('全年应休', 'Full-year entitlement'), L(`${r.full} 天`, `${r.full} days`))}${big(L('本年度可休', 'This year'), L(`${r.days} 天`, `${r.days} days`), 'brand-text')}</div>
        ${r.prorated ? callout('info', L('本年度新入职，按剩余日历天数折算：（剩余天数 ÷ 365）× 全年天数，不足 1 天的部分不计。', 'Joined this year, so pro-rated: (remaining days / 365) × entitlement, fractions dropped.')) : ''}
        ${method(L('规则：', 'Rule:'), L('累计工作满 1 年不满 10 年 5 天；满 10 年不满 20 年 10 天；满 20 年 15 天（《职工带薪年休假条例》）。', '1 to <10 years: 5 days; 10 to <20 years: 10 days; 20+ years: 15 days (PRC Regulations on Paid Annual Leave).'))}`;
    } else if (key === 'overtime') {
      const r = overtimePay(v);
      content = html`<div class="row" style="gap:28px">${big(L('小时工资', 'Hourly rate'), fmt.money(r.hourly))}${big(L('加班费合计', 'Total overtime pay'), fmt.money(r.total), 'brand-text')}</div>
        ${hbars([{ label: L('工作日 150%', 'Weekday 150%'), value: r.parts.weekday }, { label: L('休息日 200%', 'Rest day 200%'), value: r.parts.restday }, { label: L('法定节假日 300%', 'Holiday 300%'), value: r.parts.holiday }], { format: fmt.money, table: false })}
        ${method(L('规则：', 'Rule:'), L('小时工资 = 月工资 ÷ 21.75 ÷ 8。休息日加班优先安排补休；法定节假日加班不能以补休替代。', 'Hourly = monthly / 21.75 / 8. Rest-day work may be compensated with time off instead; public-holiday work cannot.'))}`;
    } else if (key === 'band') {
      const b = salaryBand(v);
      const c = compaRatio({ salary: v.salary, midpoint: b.mid, min: b.min, max: b.max });
      const pos = { below: [L('低于中位', 'Below midpoint'), 'warn'], at: [L('接近中位', 'Near midpoint'), 'ok'], above: [L('高于中位', 'Above midpoint'), 'info'] }[c.position] || ['—', ''];
      content = html`<div class="row" style="gap:28px">${big(L('最小值', 'Min'), fmt.money(b.min))}${big(L('中位值', 'Mid'), fmt.money(b.mid))}${big(L('最大值', 'Max'), fmt.money(b.max))}</div>
        <div class="row" style="gap:28px;margin-top:12px">${big(L('比较比率', 'Compa-ratio'), c.compa ?? '—', 'brand-text')}${big(L('带宽渗透率', 'Range penetration'), c.penetration != null ? `${c.penetration}%` : '—')}<div>${badge(pos[0], pos[1])}</div></div>
        ${c.compa != null && c.compa < 0.9 ? callout('warn', L('比较比率低于 0.9，存在保留风险，建议纳入调薪评审。', 'Compa-ratio below 0.9 is a retention risk; include in the pay review.')) : ''}
        ${method(L('解读：', 'Reading it:'), L('比较比率 = 薪酬 ÷ 中位值。0.9-1.1 为合理区间；新晋员工通常在 0.8-0.95，成熟胜任者在 1.0 附近。', 'Compa-ratio = pay ÷ midpoint. 0.9-1.1 is typical; new-in-role people sit around 0.8-0.95, fully proficient ones near 1.0.'))}`;
    } else if (key === 'turnover') {
      const r = turnover(v);
      content = html`<div class="row" style="gap:28px">${big(L('期间离职率', 'Period turnover'), `${r.rate}%`)}${big(L('年化离职率', 'Annualized'), `${r.annualized}%`, r.annualized > 20 ? 'danger' : 'brand-text')}${big(L('主动离职占比', 'Voluntary share'), r.voluntaryShare != null ? `${r.voluntaryShare}%` : '—')}</div>
        <div style="margin-top:12px">${big(L('估算离职成本', 'Estimated cost of turnover'), fmt.money(r.cost), 'danger')}</div>
        ${method(L('公式：', 'Formula:'), L('离职率 = 离职人数 ÷ 平均人数（期初与期末的平均）。离职成本含招聘、培训、产出损失等，常按年薪的 0.5-2 倍估算。', 'Turnover = leavers ÷ average headcount (start and end). Turnover cost covers hiring, training and lost output, often 0.5-2× annual salary.'))}`;
    } else if (key === 'funnel') {
      const r = recruitingFunnel({ hires: v.hires, rates: v, costs: v.costs });
      const names = { applied: L('需收简历', 'Applicants'), screen: L('初筛通过', 'Screened'), interview: L('进入面试', 'Interviewed'), offer: L('发出 Offer', 'Offers'), hired: L('录用', 'Hires') };
      content = html`${hbars(r.stages.map((s, i) => ({ label: names[s.stage], value: s.count, cls: `seq-${i + 1}` })), { table: false })}
        <div class="row" style="gap:28px;margin-top:12px">${big(L('人均招聘成本', 'Cost per hire'), r.costPerHire != null ? fmt.money(r.costPerHire) : '—', 'brand-text')}</div>
        ${method(L('用法：', 'Use:'), L('用历史转化率倒推需要的简历量，判断渠道投入是否足够；转化率异常低的环节就是优化重点。', 'Use historical conversion rates to size sourcing; the stage with an unusually low rate is where to improve.'))}`;
    } else {
      const r = headcountPlan(v);
      content = html`<div class="row" style="gap:28px">${big(L('目标人数', 'Target headcount'), r.target)}${big(L('预计离职', 'Expected leavers'), r.leavers)}${big(L('需招聘', 'Hires needed'), r.hires, 'brand-text')}</div>
        ${method(L('公式：', 'Formula:'), L('需招聘 = 目标人数 − 当前人数 + 平均人数 × 离职率。别忘了为关键岗位预留继任与培养周期。', 'Hires = target − current + average headcount × attrition. Allow lead time for key-role succession and ramp-up.'))}`;
    }
    setHTML(out, html`<div class="card-head"><h2>${L('结果', 'Result')}</h2></div><div class="stack" style="gap:12px">${content}</div>`);
  };
  form.addEventListener('input', render);
  render();
}
