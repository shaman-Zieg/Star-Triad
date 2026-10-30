// Employee services: request types with SLAs, the policy knowledge base with a
// small bilingual search, and onboarding checklists.
import { addDays, parseYmd } from './text.js';

export const TICKET_TYPES = {
  leave: { name: ['请假与考勤', 'Leave & attendance'], sla: 1 },
  certificate: { name: ['证明开具', 'Certificates & letters'], sla: 2 },
  payroll: { name: ['薪资与社保', 'Payroll & social insurance'], sla: 3 },
  benefits: { name: ['福利', 'Benefits'], sla: 3 },
  records: { name: ['档案与合同', 'Records & contracts'], sla: 5 },
  it: { name: ['入转调离 / 设备', 'Moves & equipment'], sla: 2 },
  other: { name: ['其他咨询', 'Other questions'], sla: 3 },
};
export const TICKET_STATUS = {
  open: { name: ['待处理', 'Open'], tone: 'info' },
  in_progress: { name: ['处理中', 'In progress'], tone: 'warn' },
  resolved: { name: ['已解决', 'Resolved'], tone: 'ok' },
};

// Working-day deadline (skips weekends; public holidays are not modeled).
export function dueDate(createdAt, slaDays) {
  const d = parseYmd(createdAt);
  let left = slaDays;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) left -= 1;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const isOverdue = (t, today) => t.status !== 'resolved' && dueDate(t.createdAt, TICKET_TYPES[t.type]?.sla || 3) < today;

// The HR department(s), found by name so request assignment does not depend on seeded ids.
const HR_DEPT = /人力|人事|\bHR\b|\bPeople\b|Human Resources/i;
export const hrDepartmentIds = (departments) => departments.filter((d) => HR_DEPT.test(`${d.name || ''} ${d.nameEn || ''}`)).map((d) => d.id);

// Calculators that answer the numeric side of a policy question (matched on a question or an article's title and tags).
export const POLICY_CALCULATORS = [
  { key: 'leave', match: /年假|年休假|annual leave|vacation|\bpto\b/i, name: ['年假天数计算器', 'Annual leave calculator'] },
  { key: 'overtime', match: /加班|overtime/i, name: ['加班费计算器', 'Overtime pay calculator'] },
];
export const relatedCalculators = (text) => POLICY_CALCULATORS.filter((c) => c.match.test(String(text || '')));
export const articleText = (a) => `${a.title} ${a.titleEn || ''} ${(a.tags || []).join(' ')}`;

export const KB_CATEGORIES = {
  leave: ['假期与考勤', 'Leave & attendance'],
  pay: ['薪酬福利', 'Pay & benefits'],
  contract: ['劳动合同', 'Employment contracts'],
  growth: ['绩效与发展', 'Performance & growth'],
  daily: ['日常办事', 'Everyday services'],
};

const A = (id, category, title, body, tags) => ({ id, category, title: title[0], titleEn: title[1], body: body[0], bodyEn: body[1], tags });

// Sample policies based on national PRC rules; adjust to local regulations and company policy.
export const KB_ARTICLES = [
  A('a01', 'leave', ['年假（带薪年休假）规定', 'Annual leave (paid annual leave)'], [
    `员工累计工作已满 1 年不满 10 年的，年休假 5 天；已满 10 年不满 20 年的，年休假 10 天；已满 20 年的，年休假 15 天（依据《职工带薪年休假条例》）。

新入职员工当年的年假按剩余日历天数折算：（当年剩余日历天数 ÷ 365）× 全年应休天数，折算后不足 1 天的部分不享受。

申请方式：在"员工服务 → 发起申请"中选择"请假与考勤"，至少提前 3 个工作日提交，由直属上级审批。当年年假原则上应在当年休完，因工作需要未休的，按规定支付或经本人同意顺延。`,
    `Employees with at least 1 but under 10 years of cumulative work get 5 days of annual leave; 10 to 20 years, 10 days; 20 years or more, 15 days (PRC Regulations on Paid Annual Leave).

New joiners get a pro-rated entitlement in their first year: (remaining calendar days in the year / 365) x full entitlement, with any fraction below one day dropped.

How to apply: in Employee services, open a "Leave & attendance" request at least 3 working days ahead; your manager approves it. Leave should be taken within the year; untaken leave required by work is paid or carried over with your agreement, as regulations require.`], ['年假', '年休假', '休假', 'annual leave', 'vacation', 'pto']),
  A('a02', 'leave', ['婚假、产假、陪产假与育儿假', 'Marriage, maternity, paternity and parental leave'], [
    `婚假：国家规定 3 天，各地在此基础上有延长规定（如部分省市延长至 10 天以上），按员工社保缴纳地标准执行。

产假：国家规定 98 天（含产前 15 天）；难产增加 15 天；生育多胞胎的，每多生育 1 个婴儿增加 15 天。各地另有延长产假规定。

陪产假（护理假）、育儿假：按社保缴纳地的地方规定执行。

办理：请提前通过员工服务提交申请并上传结婚证或出生证明等材料，HR 将协助办理生育津贴申领。`,
    `Marriage leave: 3 days nationally; most provinces add more (some to 10+ days). The rules of the city where your social insurance is paid apply.

Maternity leave: 98 days nationally (including 15 days before birth); +15 days for a difficult birth; +15 days for each additional baby in a multiple birth. Local rules add more.

Paternity (nursing) leave and parental leave follow local rules where your social insurance is paid.

How to apply: submit a request in Employee services with the marriage or birth certificate. HR helps you claim the maternity allowance.`], ['婚假', '产假', '陪产假', '育儿假', '护理假', 'maternity', 'paternity', 'marriage leave', 'parental leave']),
  A('a03', 'leave', ['病假与医疗期', 'Sick leave and medical treatment period'], [
    `员工因病需要休息的，凭正规医院出具的病假证明申请病假。病假期间工资按公司制度及当地规定支付，且不低于当地最低工资标准的 80%。

医疗期根据实际工作年限和在本单位工作年限确定，为 3 至 24 个月。

请在病假开始当天告知上级，并在返岗后 3 个工作日内补交证明材料。`,
    `If you need time off for illness, request sick leave with a certificate from a recognized hospital. Sick pay follows company policy and local rules and is at least 80% of the local minimum wage.

The medical treatment period is 3 to 24 months, depending on total years of work and years with the company.

Tell your manager on the first day and submit documents within 3 working days of returning.`], ['病假', '医疗期', '请病假', 'sick leave', 'illness', 'medical']),
  A('a04', 'leave', ['考勤与加班规定', 'Attendance and overtime'], [
    `公司实行标准工时制，每日工作 8 小时，每周 40 小时；部分岗位经审批实行综合工时或不定时工作制。

加班需事先在系统中申请并获上级批准。加班工资计算基数为：月工资 ÷ 21.75 ÷ 8 = 小时工资。工作日延长工作时间按 150% 支付；休息日加班且未安排补休的按 200% 支付；法定节假日加班按 300% 支付。

忘记打卡请在 3 个工作日内提交补卡申请。`,
    `The company uses standard hours: 8 hours a day, 40 a week. Some roles use comprehensive or flexible hours with approval.

Overtime must be requested and approved in advance. Hourly rate = monthly salary / 21.75 / 8. Weekday overtime is paid at 150%; rest-day overtime without time off in lieu at 200%; public-holiday work at 300%.

If you forget to clock in or out, submit a correction within 3 working days.`], ['考勤', '加班', '加班费', '打卡', '补卡', 'overtime', 'attendance', 'clock']),
  A('a05', 'pay', ['五险一金说明', 'Social insurance and housing fund'], [
    `公司依法为员工缴纳养老保险、医疗保险（含生育保险）、失业保险、工伤保险和住房公积金。缴费基数按员工上年度月平均工资确定，并在当地规定的上下限范围内，每年调整一次。

个人缴纳部分由公司在每月工资中代扣代缴。可在"员工服务"中申请开具社保缴纳证明或公积金提取材料。`,
    `As the law requires, the company pays pension, medical (including maternity), unemployment and work-injury insurance plus the housing provident fund. The contribution base is your average monthly salary last year, within local limits, adjusted once a year.

Your personal share is withheld from monthly pay. Request contribution certificates or housing fund withdrawal documents in Employee services.`], ['五险一金', '社保', '公积金', '医保', 'social insurance', 'housing fund', 'pension']),
  A('a06', 'pay', ['工资发放与个税', 'Payroll and individual income tax'], [
    `工资于每月 10 日发放上月工资，遇节假日提前。工资条可在系统中查看。

个人所得税按累计预扣法由公司代扣代缴。员工可在"个人所得税"App 中填报子女教育、继续教育、大病医疗、住房贷款利息或住房租金、赡养老人、3 岁以下婴幼儿照护等专项附加扣除。

对工资有疑问，请发起"薪资与社保"类申请，HR 将在 3 个工作日内回复。`,
    `Salary for the previous month is paid on the 10th, earlier if it falls on a holiday. Payslips are available online.

Income tax is withheld using the cumulative withholding method. Declare special additional deductions (children's education, continuing education, serious illness, mortgage interest or rent, elderly care, care of children under 3) in the national tax app.

For payroll questions, open a "Payroll & social insurance" request; HR replies within 3 working days.`], ['工资', '发薪', '个税', '工资条', '专项附加扣除', 'payroll', 'salary', 'tax', 'payslip']),
  A('a07', 'contract', ['试用期规定', 'Probation'], [
    `试用期期限依据《劳动合同法》第十九条：劳动合同期限 3 个月以上不满 1 年的，试用期不超过 1 个月；1 年以上不满 3 年的，不超过 2 个月；3 年以上固定期限和无固定期限的，不超过 6 个月。同一员工只能约定一次试用期。

试用期工资不低于本单位相同岗位最低档工资或劳动合同约定工资的 80%，并不低于当地最低工资标准。

转正评估：试用期结束前 2 周，由上级根据试用期目标完成情况进行评估。`,
    `Probation limits follow Article 19 of the PRC Labor Contract Law: contracts of 3 months to under 1 year allow up to 1 month; 1 to under 3 years, up to 2 months; 3 years or more, or open-ended, up to 6 months. Probation may be set only once per employee.

Probation pay is at least 80% of the contract salary or of the lowest pay for the same role, and never below the local minimum wage.

Confirmation review: two weeks before probation ends, your manager reviews progress against your probation goals.`], ['试用期', '转正', 'probation', 'confirmation']),
  A('a08', 'contract', ['离职办理流程', 'Resignation process'], [
    `员工提出辞职，应提前 30 日以书面形式通知公司；试用期内提前 3 日通知（《劳动合同法》第三十七条）。

流程：1）向上级和 HRBP 提交书面辞职申请；2）与上级确认工作交接计划；3）完成资产归还与账号注销；4）HR 办理离职证明、社保公积金减员。

离职面谈：HR 会与离职员工进行面谈，了解离职原因，帮助公司改进。`,
    `To resign, give 30 days' written notice, or 3 days during probation (Article 37, PRC Labor Contract Law).

Steps: 1) submit a written resignation to your manager and HRBP; 2) agree a handover plan with your manager; 3) return equipment and close accounts; 4) HR issues the separation certificate and stops social insurance.

Exit interview: HR meets leavers to understand the reasons and help the company improve.`], ['离职', '辞职', '交接', '离职证明', 'resign', 'resignation', 'quit', 'notice period']),
  A('a09', 'growth', ['绩效考核与校准', 'Performance reviews and calibration'], [
    `公司每半年进行一次绩效评估，采用 5 级评分：1 不符合期望、2 部分符合、3 符合期望、4 超出期望、5 卓越。

流程：员工自评 → 上级评估 → 部门绩效校准会 → 结果沟通。校准会用于统一评价尺度、减少宽严不一。

绩效结果用于调薪、奖金、晋升与发展计划。年度人才盘点会结合绩效与潜力（九宫格）识别关键人才。`,
    `Performance is reviewed twice a year on a 5-point scale: 1 does not meet, 2 partly meets, 3 meets, 4 exceeds, 5 outstanding.

Steps: self-review, manager review, department calibration, feedback conversation. Calibration aligns standards and reduces rating bias.

Results feed pay, bonus, promotion and development plans. The annual talent review combines performance and potential (9-box) to identify key talent.`], ['绩效', '考核', '评分', '校准', '九宫格', 'performance', 'review', 'rating', 'calibration']),
  A('a10', 'growth', ['晋升与职级体系', 'Promotion and job levels'], [
    `公司采用双通道职级：专业通道 P1-P8，管理通道 M1-M4。每年 4 月和 10 月开放晋升评审。

基本条件：在当前职级任职满 1 年，最近一次绩效 4 分及以上，并达到目标职级的能力要求。

流程：上级提名 → 能力评估（含答辩）→ 晋升委员会评审 → 结果公示。`,
    `There are two career tracks: professional P1-P8 and management M1-M4. Promotion reviews open every April and October.

Basic criteria: at least 1 year at the current level, a latest rating of 4 or higher, and meeting the competency profile of the target level.

Steps: manager nomination, capability assessment (including a presentation), promotion committee review, announcement.`], ['晋升', '升职', '职级', 'promotion', 'level', 'career']),
  A('a11', 'growth', ['培训与学习发展', 'Training and development'], [
    `每位员工每年享有不少于 40 小时的学习时间，并可在上级批准后申请外部培训。

学习资源：线上课程库、面授课程、导师计划、行动学习项目。每位员工每年与上级共同制定个人发展计划（IDP），按 70-20-10 原则安排在岗实践、向他人学习和正式培训。

公司出资的外部培训费用较高时，可能需要签订服务期协议。`,
    `Every employee has at least 40 hours of learning time a year and may request external training with manager approval.

Resources: online library, classroom courses, mentoring and action learning. Each employee agrees an IDP with their manager every year, following the 70-20-10 principle.

Expensive company-funded external training may require a service period agreement.`], ['培训', '学习', '课程', '发展计划', 'IDP', 'training', 'learning', 'course']),
  A('a12', 'daily', ['常用证明开具', 'Certificates and letters'], [
    `可开具的证明包括：在职证明、收入证明、社保缴纳证明、实习证明、离职证明等。

申请方式：在"员工服务"中选择"证明开具"，注明用途（如签证、贷款、租房）与份数。电子版 1 个工作日内发送，纸质盖章版 2 个工作日内可到 HR 处领取。`,
    `Available letters include employment verification, income verification, social insurance records, internship and separation certificates.

How to apply: choose "Certificates & letters" in Employee services and state the purpose (visa, loan, rental) and number of copies. Electronic copies arrive within 1 working day; stamped paper copies are ready at HR within 2 working days.`], ['证明', '在职证明', '收入证明', '签证', 'certificate', 'letter', 'employment verification', 'visa']),
  A('a13', 'daily', ['新员工入职指南', 'New joiner guide'], [
    `入职当天请携带身份证、学历学位证书原件、离职证明、银行卡及近期体检报告到前台报到。

第一周：完成入职培训、领取设备与账号、与导师（Buddy）和上级见面并确认试用期目标。

30/60/90 天：上级会与你进行阶段性沟通，帮助你顺利融入。`,
    `On day one, bring your ID, original degree certificates, separation certificate from your last employer, a bank card and a recent medical report to reception.

Week one: orientation, equipment and accounts, meet your buddy and manager, and agree probation goals.

At 30, 60 and 90 days your manager checks in to help you settle in.`], ['入职', '报到', '新员工', '材料', 'onboarding', 'new hire', 'first day']),
];

// Tokenizes Latin words and CJK bigrams so short Chinese questions match well.
export function tokens(text) {
  const t = String(text || '').toLowerCase();
  const out = new Set(t.match(/[a-z0-9]{2,}/g) || []);
  for (const run of t.match(/[一-鿿]+/g) || []) {
    if (run.length === 1) out.add(run);
    for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2));
  }
  return [...out];
}
const STOP = new Set(['怎么', '如何', '什么', '可以', '需要', '是否', '多少', '公司', '我的', '我们', 'the', 'how', 'what', 'can', 'do', 'does', 'is', 'my', 'and', 'for', 'to']);

// Ranks articles for a question. Rare words count more (IDF), so a specific term such as
// "年假" outweighs a common one such as "入职"; a keyword tag that appears verbatim in the
// question is the strongest signal.
export function searchKB(articles, query) {
  const q = tokens(query).filter((x) => !STOP.has(x));
  if (!q.length) return [];
  const docs = articles.map((a) => ({
    a,
    title: `${a.title} ${a.titleEn}`.toLowerCase(),
    tags: (a.tags || []).map((t) => t.toLowerCase()),
    body: `${a.body} ${a.bodyEn}`.toLowerCase(),
  }));
  const df = Object.fromEntries(q.map((w) => [w, docs.filter((d) => d.title.includes(w) || d.body.includes(w) || d.tags.some((t) => t.includes(w))).length]));
  const idf = (w) => Math.log((docs.length + 1) / ((df[w] || 0) + 0.5));
  const ql = String(query).toLowerCase();
  return docs.map((d) => {
    let score = 0;
    for (const w of q) {
      if (!df[w]) continue;
      const hits = (d.title.includes(w) ? 3 : 0) + (d.tags.some((t) => t.includes(w)) ? 3 : 0) + (d.body.includes(w) ? 1 : 0);
      score += hits * idf(w);
    }
    for (const t of d.tags) if (t.length >= 2 && ql.includes(t)) score += 4 + t.length;
    return { article: d.a, score: Math.round(score * 10) / 10 };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
}

// The paragraph of an article that best answers the query.
export function bestParagraph(article, query, lang = 'zh') {
  const body = lang === 'en' ? article.bodyEn : article.body;
  const q = tokens(query).filter((x) => !STOP.has(x));
  const paras = body.split(/\n\s*\n/);
  let best = paras[0];
  let bestScore = -1;
  for (const p of paras) {
    const s = q.filter((w) => p.toLowerCase().includes(w)).length;
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return best;
}

export const OWNERS = {
  hr: ['HR', 'HR'],
  manager: ['直属上级', 'Manager'],
  it: ['IT / 行政', 'IT & facilities'],
  buddy: ['入职导师', 'Buddy'],
  newhire: ['新员工', 'New hire'],
};
export const PHASES = {
  pre: ['入职前', 'Before day one'],
  day1: ['第一天', 'Day one'],
  week1: ['第一周', 'Week one'],
  d30: ['30 天', '30 days'],
  d60: ['60 天', '60 days'],
  d90: ['90 天', '90 days'],
};

const T = (phase, owner, offset, text, managerOnly = false) => ({ phase, owner, offset, text, managerOnly });
export const ONBOARDING_TEMPLATE = [
  T('pre', 'hr', -7, ['发送入职通知与材料清单', 'Send the welcome email and document checklist']),
  T('pre', 'it', -3, ['准备电脑、账号、门禁与工位', 'Prepare laptop, accounts, badge and desk']),
  T('pre', 'manager', -3, ['指定入职导师（Buddy），规划第一周安排', 'Assign a buddy and plan week one']),
  T('day1', 'hr', 0, ['办理入职手续，签订劳动合同', 'Complete paperwork and sign the employment contract']),
  T('day1', 'manager', 0, ['欢迎午餐，介绍团队成员', 'Welcome lunch and team introductions']),
  T('day1', 'buddy', 0, ['带领熟悉办公环境与常用工具', 'Tour of the office and everyday tools']),
  T('week1', 'newhire', 3, ['完成公司文化与制度入职培训', 'Finish orientation on culture and policies']),
  T('week1', 'manager', 5, ['沟通岗位职责与试用期目标', 'Agree responsibilities and probation goals']),
  T('week1', 'manager', 5, ['了解团队现状与人员，安排与关键协作方见面', 'Meet the team one by one and key partners'], true),
  T('d30', 'manager', 30, ['30 天沟通：反馈与支持需求', '30-day check-in: feedback and support needed']),
  T('d30', 'newhire', 30, ['完成第一个独立交付的任务', 'Deliver a first piece of work independently']),
  T('d60', 'buddy', 60, ['60 天回顾：融入情况与问题', '60-day review: settling in and open issues']),
  T('d60', 'manager', 60, ['制定团队 90 天计划并与上级对齐', 'Write and align a 90-day team plan'], true),
  T('d90', 'manager', 90, ['试用期评估与转正面谈', 'Probation review and confirmation conversation']),
  T('d90', 'hr', 90, ['收集新员工入职体验反馈', 'Collect onboarding experience feedback']),
];

export function buildChecklist(startDate, { manager = false } = {}) {
  return ONBOARDING_TEMPLATE.filter((t) => manager || !t.managerOnly).map((t, i) => ({
    id: `t${i + 1}`, phase: t.phase, owner: t.owner, text: t.text, due: addDays(startDate, t.offset), done: false,
  }));
}
