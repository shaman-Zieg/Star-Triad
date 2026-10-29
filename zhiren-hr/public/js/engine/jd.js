// Job description generator and inclusive-language / compliance checker.
import { skillLabel } from './skills.js';
import { EDUCATION } from './resume.js';
import { bandOf, isManagerLevel } from './competency.js';
import { pick } from './text.js';

export const FAMILIES = {
  tech: { name: ['技术研发', 'Engineering'], keywords: ['工程师', '开发', '研发', '架构', '前端', '后端', '测试', '运维', 'engineer', 'developer', 'architect', 'sre', 'devops', 'qa'] },
  data: { name: ['数据与算法', 'Data & AI'], keywords: ['数据', '算法', 'bi', 'data', 'analyst', 'scientist', 'machine learning'] },
  product: { name: ['产品', 'Product'], keywords: ['产品', 'product'] },
  design: { name: ['设计', 'Design'], keywords: ['设计', 'designer', 'ux', 'ui'] },
  marketing: { name: ['市场营销', 'Marketing'], keywords: ['市场', '品牌', '营销', '新媒体', 'marketing', 'brand', 'growth', 'content'] },
  sales: { name: ['销售与商务', 'Sales & BD'], keywords: ['销售', '客户经理', '商务', 'bd', 'sales', 'account', 'business development'] },
  hr: { name: ['人力资源', 'Human resources'], keywords: ['人力', '人事', '招聘', 'hr', '培训', '薪酬', 'talent', 'people', 'recruit'] },
  finance: { name: ['财务', 'Finance'], keywords: ['财务', '会计', '审计', '税务', 'finance', 'accountant', 'fp&a', 'controller', 'audit'] },
  ops: { name: ['运营与客户', 'Operations & customer'], keywords: ['运营', '客户成功', '客服', '项目', '供应链', '采购', 'operations', 'customer', 'project', 'supply'] },
  general: { name: ['通用', 'General'], keywords: [] },
};

export function detectFamily(title = '') {
  const t = String(title).toLowerCase();
  // Data before tech so "数据开发工程师" is classed as data.
  for (const key of ['data', 'product', 'design', 'hr', 'finance', 'marketing', 'sales', 'ops', 'tech']) {
    if (FAMILIES[key].keywords.some((k) => t.includes(k))) return key;
  }
  return 'general';
}

// A person's job family, read from both title languages. The department name only
// breaks ties (or fills in when titles are generic), so department membership alone
// never decides someone's function.
export function personFamily(person = {}, department) {
  const zh = detectFamily(person.title);
  const en = detectFamily(person.titleEn);
  const dept = department ? detectFamily(`${department.name || ''} ${department.nameEn || ''}`) : 'general';
  if (zh === en) return zh === 'general' ? dept : zh;
  if (zh === 'general') return en;
  if (en === 'general') return zh;
  return [zh, en].includes(dept) ? dept : zh;
}

const RESP = {
  tech: [
    ['参与需求评审与技术方案设计，负责核心模块的开发与维护', 'Take part in requirement reviews and technical design; build and maintain core modules'],
    ['编写高质量、可测试的代码，参与代码评审，持续改进工程质量', 'Write high-quality, testable code, review code and keep raising engineering quality'],
    ['定位并解决线上问题，持续优化系统性能、稳定性与可扩展性', 'Diagnose production issues and improve performance, reliability and scalability'],
    ['与产品、设计、测试等角色紧密协作，按期交付迭代目标', 'Work closely with product, design and QA to deliver each iteration on time'],
    ['沉淀技术文档与最佳实践，推动工具化与自动化', 'Document designs and best practices; drive tooling and automation'],
  ],
  data: [
    ['围绕业务目标搭建指标体系，监控核心指标并及时发现异常', 'Build metric systems around business goals, monitor key metrics and flag anomalies'],
    ['开展专题分析与 A/B 实验，输出可落地的业务洞察与建议', 'Run deep-dive analyses and A/B tests that lead to actionable recommendations'],
    ['建设数据报表与看板，提升业务团队的数据自助能力', 'Build reports and dashboards that let business teams self-serve'],
    ['与数据工程团队协作，推动数据质量与口径统一', 'Partner with data engineering to improve data quality and consistent definitions'],
    ['将分析方法沉淀为模型或工具，提升分析效率', 'Turn analyses into reusable models and tools'],
  ],
  product: [
    ['深入理解用户与业务，挖掘需求并定义产品方案与优先级', 'Understand users and the business deeply; define solutions and priorities'],
    ['撰写 PRD 与原型，推动研发、设计、测试按计划交付', 'Write PRDs and prototypes; drive engineering, design and QA to deliver on plan'],
    ['跟踪上线后数据与用户反馈，持续迭代优化产品体验', 'Track post-launch data and feedback; iterate on the experience'],
    ['开展竞品与市场分析，参与制定产品路线图', 'Analyze competitors and the market; shape the product roadmap'],
    ['协调跨部门资源，对齐目标与里程碑', 'Coordinate cross-functional resources and align goals and milestones'],
  ],
  design: [
    ['负责产品的交互与视觉设计，输出高质量设计方案与规范', 'Own interaction and visual design; deliver high-quality designs and specs'],
    ['参与用户研究与可用性测试，以用户洞察驱动设计决策', 'Run user research and usability tests; let insights drive design decisions'],
    ['建设和维护设计系统，提升设计与研发协作效率', 'Build and maintain the design system to speed up design-engineering work'],
    ['与产品、研发紧密协作，确保设计高质量落地', 'Work with product and engineering to ensure designs ship as intended'],
  ],
  marketing: [
    ['制定并执行市场推广计划，达成品牌与获客目标', 'Plan and run marketing programs that hit brand and acquisition targets'],
    ['策划内容与传播活动，运营社交媒体等渠道', 'Create content and campaigns; manage social and other channels'],
    ['分析投放与活动数据，优化渠道 ROI', 'Analyze campaign data and optimize channel ROI'],
    ['开展市场调研与竞品分析，为产品和销售提供洞察', 'Research the market and competitors to inform product and sales'],
    ['协同销售团队，提供市场支持与销售工具', 'Support the sales team with materials and enablement'],
  ],
  sales: [
    ['开拓目标行业客户，完成销售业绩与回款目标', 'Win customers in target industries; meet sales and collection targets'],
    ['深入理解客户需求，提供解决方案并推动商务谈判与签约', 'Understand customer needs, propose solutions, negotiate and close'],
    ['维护重点客户关系，提升续约与增购', 'Grow key accounts and drive renewals and upsell'],
    ['管理销售漏斗与客户信息，准确进行销售预测', 'Manage the pipeline in CRM and forecast accurately'],
    ['反馈市场与竞品信息，协同产品与市场团队', 'Share market and competitor insight with product and marketing'],
  ],
  hr: [
    ['作为业务伙伴，理解业务战略并转化为人力资源解决方案', 'Partner with the business and turn strategy into people solutions'],
    ['负责招聘、人才盘点、绩效与发展等人才管理工作', 'Run hiring, talent review, performance and development'],
    ['开展组织诊断与组织发展项目，提升组织效能', 'Lead organizational diagnosis and OD projects that raise effectiveness'],
    ['处理员工关系，营造积极健康的组织氛围，确保合规', 'Handle employee relations, foster a healthy climate and ensure compliance'],
    ['用数据分析人力资源状况，为管理决策提供支持', 'Use people analytics to inform management decisions'],
  ],
  finance: [
    ['负责预算编制、滚动预测与经营分析', 'Own budgeting, rolling forecasts and business performance analysis'],
    ['准确及时完成会计核算与财务报表', 'Deliver accurate, timely accounting and financial statements'],
    ['完善内控流程，配合内外部审计', 'Strengthen internal controls and support internal and external audits'],
    ['为业务决策提供财务模型与投资回报分析', 'Provide financial models and ROI analysis for business decisions'],
    ['推动财务流程与系统的优化', 'Improve finance processes and systems'],
  ],
  ops: [
    ['制定运营策略与计划，达成用户、客户或业务指标', 'Set operating plans that hit user, customer or business targets'],
    ['设计并优化业务流程，提升效率与服务质量', 'Design and improve processes for efficiency and service quality'],
    ['跟踪核心数据，发现问题并推动改进', 'Track key data, spot issues and drive improvements'],
    ['协调跨部门资源，推动项目按时落地', 'Coordinate across teams to land projects on time'],
  ],
  general: [
    ['负责本岗位核心工作的规划与执行，达成团队目标', 'Plan and deliver the core work of the role to meet team goals'],
    ['与相关部门紧密协作，推动跨团队事项落地', 'Work closely with other teams to land cross-team initiatives'],
    ['持续优化工作方法与流程，提升效率与质量', 'Keep improving methods and processes for efficiency and quality'],
    ['沉淀经验与知识，支持团队成长', 'Capture know-how and help the team grow'],
  ],
};

const SENIOR = [
  ['主导复杂项目或关键模块的方案设计，对结果负责', 'Lead design of complex projects or key modules and own the outcome'],
  ['指导和培养初中级同事，推动团队能力提升', 'Mentor junior colleagues and raise team capability'],
];
const MANAGER = [
  ['带领团队制定目标与计划，合理分配资源并跟踪执行', 'Lead the team to set goals and plans, allocate resources and track delivery'],
  ['负责团队的招聘、绩效管理与人才培养，打造高绩效团队', 'Own hiring, performance and development for the team; build a high-performing team'],
  ['参与部门战略规划，推动跨部门协同', 'Contribute to department strategy and drive cross-functional collaboration'],
];

const OFFER = [
  ['有竞争力的薪酬与年度绩效奖金', 'Competitive pay and an annual performance bonus'],
  ['五险一金及补充商业保险', 'Statutory social insurance and housing fund, plus supplementary insurance'],
  ['带薪年假、弹性工作与完善的培训发展体系', 'Paid annual leave, flexible hours and structured learning and development'],
  ['清晰的职业发展通道（专业 / 管理双通道）', 'Clear career paths on both professional and management tracks'],
];

export function generateJD(input, lang = 'zh') {
  const L = (zh, en) => (lang === 'en' ? en : zh);
  const family = input.family || detectFamily(input.title);
  const band = bandOf(input.level);
  const resp = [...RESP[family] || RESP.general];
  if (band === 'senior' || band === 'expert') resp.unshift(...SENIOR);
  if (isManagerLevel(input.level)) resp.unshift(...MANAGER);
  const skills = (input.skills || []).map((k) => skillLabel(k, lang));
  const nice = (input.niceSkills || []).map((k) => skillLabel(k, lang));
  const edu = Number(input.education) || 0;
  const years = Number(input.minYears) || 0;

  const reqs = [];
  if (edu) reqs.push(L(`${pick(EDUCATION[edu].name, lang)}及以上学历，专业不限或相关专业优先`, `${pick(EDUCATION[edu].name, lang)} degree or equivalent practical experience`));
  if (years) reqs.push(L(`${years} 年以上相关工作经验`, `${years}+ years of relevant experience`));
  if (skills.length) reqs.push(L(`熟练掌握：${skills.join('、')}`, `Proficient in: ${skills.join(', ')}`));
  if (isManagerLevel(input.level)) reqs.push(L('具备团队管理经验，善于激励和培养他人', 'Experience leading teams and developing people'));
  reqs.push(L('良好的沟通协作能力与结果导向，能在变化中快速学习', 'Strong communication and collaboration, results-driven and quick to learn'));

  const lines = [];
  lines.push(`# ${input.title || L('岗位名称', 'Job title')}`);
  const meta = [input.dept, input.location, input.level].filter(Boolean).join(' · ');
  if (meta) lines.push(meta);
  lines.push('');
  lines.push(`## ${L('关于这个岗位', 'About the role')}`);
  lines.push(input.highlights
    ? input.highlights
    : L(`我们正在寻找一位${input.title || '伙伴'}加入${input.dept || '团队'}，与优秀的同事一起解决有挑战的问题，并在这里获得持续成长。`,
      `We are looking for a ${input.title || 'teammate'} to join ${input.dept || 'our team'}, solve challenging problems with great colleagues and keep growing.`));
  lines.push('');
  lines.push(`## ${L('岗位职责', 'Responsibilities')}`);
  resp.slice(0, 7).forEach((r, i) => lines.push(`${i + 1}. ${pick(r, lang)}`));
  lines.push('');
  lines.push(`## ${L('任职要求', 'Requirements')}`);
  reqs.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  if (nice.length) {
    lines.push('');
    lines.push(`## ${L('加分项', 'Nice to have')}`);
    nice.forEach((n) => lines.push(`- ${n}`));
  }
  lines.push('');
  lines.push(`## ${L('我们提供', 'What we offer')}`);
  OFFER.forEach((o) => lines.push(`- ${pick(o, lang)}`));
  lines.push('');
  lines.push(L('*我们坚持平等雇佣，欢迎不同背景的候选人申请。*', '*We are an equal opportunity employer and welcome applicants from all backgrounds.*'));
  return lines.join('\n');
}

// Wording that is discriminatory under PRC law (Employment Promotion Law, Law on the
// Protection of Women's Rights and Interests) or exclusionary in any market.
export const INCLUSIVE_RULES = [
  { level: 'high', re: /男性优先|限男|仅限男|男士优先|女性优先|限女|仅限女|女士优先|male only|female only|men only|women only/gi,
    why: ['性别限制违反《就业促进法》《妇女权益保障法》', 'Gender restrictions are unlawful (PRC Employment Promotion Law; women\'s rights law)'],
    fix: ['删除性别要求，只描述岗位所需能力', 'Remove gender requirements; describe job-related abilities only'] },
  { level: 'high', re: /已婚已育|已婚|未婚|已育|婚育|marital status|married|unmarried/gi,
    why: ['婚育状况与工作能力无关，属于就业歧视', 'Marital or parental status is unrelated to the job and is discriminatory'],
    fix: ['删除婚育相关表述', 'Remove references to marital or parental status'] },
  { level: 'high', re: /乙肝|hepatitis b/gi,
    why: ['不得以乙肝病原携带为由拒绝录用', 'Refusing hepatitis B carriers is unlawful in China'],
    fix: ['删除相关表述，健康要求仅限法律规定的特殊岗位', 'Remove it; health requirements only where the law requires them'] },
  { level: 'high', re: /民族|宗教|religion|ethnicity/gi,
    why: ['民族、宗教信仰不得作为录用条件', 'Ethnicity and religion must not be hiring criteria'],
    fix: ['删除相关表述', 'Remove these references'] },
  { level: 'medium', re: /\d{2}\s*周?岁(以下|以内|之前)|年龄\s*\d{2}\s*(-|至|到)\s*\d{2}|年龄不超过|年龄限制|under\s*\d{2}\s*(years old)?|aged?\s*\d{2}\s*(-|to)\s*\d{2}/gi,
    why: ['年龄限制易构成年龄歧视，且会错失有经验的候选人', 'Age limits amount to age discrimination and shrink the pool of experienced candidates'],
    fix: ['改为描述所需经验与能力', 'Describe the experience and abilities needed instead'] },
  { level: 'medium', re: /本地户口|户籍|本地人优先|籍贯|hukou/gi,
    why: ['户籍限制缺乏岗位相关性，可能构成歧视', 'Household registration limits are not job-related and may be discriminatory'],
    fix: ['删除户籍要求', 'Remove the household registration requirement'] },
  { level: 'medium', re: /身高|体重|形象好|气质佳|五官端正|相貌|颜值|attractive|good-looking|height|weight/gi,
    why: ['外貌要求除特殊岗位外与工作无关', 'Appearance requirements are not job-related except for rare roles'],
    fix: ['如确需，改为与岗位直接相关的客观要求', 'If truly needed, state an objective job-related requirement'] },
  { level: 'medium', re: /996|大小周|无条件加班|接受加班|狼性/gi,
    why: ['暗示超时工作，可能违反工时规定并损害雇主品牌', 'Signals excessive hours; may breach working-time rules and hurts the employer brand'],
    fix: ['如实描述工作节奏与弹性安排', 'Describe the real pace of work and flexibility honestly'] },
  { level: 'low', re: /985|211|名校|双一流|统招/gi,
    why: ['院校背景筛选会缩小人才池，建议以能力为准', 'Filtering by school narrows the talent pool; screen on skills'],
    fix: ['改为能力与经验要求', 'Use skill and experience requirements'] },
  { level: 'low', re: /rock ?star|ninja|guru|digital native|young and energetic|年轻有活力|年轻化/gi,
    why: ['隐含排斥性的用语，会劝退部分优秀候选人', 'Exclusionary jargon that discourages good candidates'],
    fix: ['用具体能力描述替代', 'Replace with concrete abilities'] },
];

export function checkInclusive(text) {
  const t = String(text || '');
  const hits = [];
  for (const rule of INCLUSIVE_RULES) {
    rule.re.lastIndex = 0;
    const found = new Set();
    let m;
    while ((m = rule.re.exec(t))) found.add(m[0]);
    if (found.size) hits.push({ level: rule.level, terms: [...found], why: rule.why, fix: rule.fix });
  }
  return hits;
}
