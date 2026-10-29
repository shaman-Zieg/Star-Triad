// Deterministic demo data for a fictional company, 星海科技 / Xinghai Tech.
// Dates are generated relative to today so the demo always looks current.
import { pathToFileURL } from 'node:url';
import * as db from './db.js';
import { targetProfile, COMP_KEYS } from '../public/js/engine/competency.js';
import { COURSE_CATALOG, buildIDP } from '../public/js/engine/learning.js';
import { MODELS } from '../public/js/engine/diagnosis.js';
import { KB_ARTICLES, buildChecklist } from '../public/js/engine/service.js';
import { evaluatePlan } from '../public/js/engine/succession.js';
import { ymd, addDays, clamp } from '../public/js/engine/text.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generate(today = new Date()) {
  const R = rng(20261021);
  const rand = (a, b) => a + R() * (b - a);
  const int = (a, b) => Math.floor(rand(a, b + 1));
  const pickOne = (xs) => xs[Math.floor(R() * xs.length)];
  const weighted = (pairs) => {
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let x = R() * total;
    for (const [v, w] of pairs) if ((x -= w) <= 0) return v;
    return pairs[pairs.length - 1][0];
  };
  const normal = () => (R() + R() + R() - 1.5) / 0.5;
  const T = ymd(today);
  const daysAgo = (n) => addDays(T, -Math.round(n));
  const stampAgo = (n, hour = 10) => {
    const d = new Date(today);
    d.setDate(d.getDate() - Math.round(n));
    d.setHours(hour, int(0, 59), 0, 0);
    if (d > today) d.setTime(today.getTime() - int(5, 120) * 60000);
    return db.stamp(d);
  };

  // ---------------------------------------------------------------- names
  const SURNAMES = [['张', 'Zhang'], ['王', 'Wang'], ['李', 'Li'], ['刘', 'Liu'], ['陈', 'Chen'], ['杨', 'Yang'], ['赵', 'Zhao'], ['黄', 'Huang'], ['周', 'Zhou'], ['吴', 'Wu'], ['徐', 'Xu'], ['孙', 'Sun'], ['胡', 'Hu'], ['朱', 'Zhu'], ['高', 'Gao'], ['林', 'Lin'], ['何', 'He'], ['郭', 'Guo'], ['马', 'Ma'], ['罗', 'Luo'], ['梁', 'Liang'], ['宋', 'Song'], ['郑', 'Zheng'], ['谢', 'Xie'], ['韩', 'Han'], ['唐', 'Tang'], ['冯', 'Feng'], ['董', 'Dong'], ['程', 'Cheng'], ['曹', 'Cao'], ['袁', 'Yuan'], ['邓', 'Deng'], ['沈', 'Shen'], ['彭', 'Peng'], ['苏', 'Su'], ['叶', 'Ye'], ['蒋', 'Jiang'], ['魏', 'Wei'], ['陆', 'Lu'], ['方', 'Fang']];
  const GIVEN = [['伟', 'Wei'], ['芳', 'Fang'], ['敏', 'Min'], ['静', 'Jing'], ['磊', 'Lei'], ['洋', 'Yang'], ['婷', 'Ting'], ['杰', 'Jie'], ['涛', 'Tao'], ['明', 'Ming'], ['超', 'Chao'], ['慧', 'Hui'], ['浩', 'Hao'], ['宇', 'Yu'], ['晨', 'Chen'], ['欣', 'Xin'], ['博', 'Bo'], ['思远', 'Siyuan'], ['子涵', 'Zihan'], ['雨桐', 'Yutong'], ['嘉怡', 'Jiayi'], ['俊杰', 'Junjie'], ['一鸣', 'Yiming'], ['文静', 'Wenjing'], ['佳琪', 'Jiaqi'], ['志强', 'Zhiqiang'], ['海涛', 'Haitao'], ['晓东', 'Xiaodong'], ['立新', 'Lixin'], ['梦瑶', 'Mengyao'], ['天宇', 'Tianyu'], ['诗涵', 'Shihan'], ['皓轩', 'Haoxuan'], ['雅琴', 'Yaqin'], ['建华', 'Jianhua'], ['晓燕', 'Xiaoyan'], ['鹏', 'Peng'], ['丽', 'Li'], ['昊', 'Hao'], ['悦', 'Yue'], ['凯', 'Kai'], ['琳', 'Lin'], ['毅', 'Yi'], ['可欣', 'Kexin'], ['泽宇', 'Zeyu'], ['若曦', 'Ruoxi'], ['逸凡', 'Yifan'], ['欣怡', 'Xinyi']];
  const used = new Set();
  const newName = () => {
    for (;;) {
      const s = pickOne(SURNAMES);
      const g = pickOne(GIVEN);
      const zh = s[0] + g[0];
      if (used.has(zh)) continue;
      used.add(zh);
      return { name: zh, nameEn: `${s[1]} ${g[1]}`, slug: `${g[1]}.${s[1]}`.toLowerCase() };
    }
  };

  // ---------------------------------------------------------------- org
  const departments = [
    ['d01', '总经办', 'Executive Office'],
    ['d02', '技术研发部', 'Engineering'],
    ['d03', '产品设计部', 'Product & Design'],
    ['d04', '数据智能部', 'Data & AI'],
    ['d05', '市场部', 'Marketing'],
    ['d06', '销售部', 'Sales'],
    ['d07', '客户成功部', 'Customer Success'],
    ['d08', '人力资源部', 'People & HR'],
    ['d09', '财务部', 'Finance'],
  ].map(([id, name, nameEn]) => ({ id, name, nameEn, parentId: id === 'd01' ? null : 'd01' }));

  // Role templates: [title, titleEn, level(s), skills, location]
  const ROLES = {
    ceo: ['首席执行官', 'Chief Executive Officer', ['M4'], ['team_mgmt', 'product_strategy', 'negotiation']],
    ea: ['总裁助理', 'Executive Assistant', ['P3'], ['excel', 'english', 'project_mgmt']],
    vpEng: ['技术副总裁', 'VP of Engineering', ['M3'], ['java', 'microservices', 'cloud', 'team_mgmt']],
    feLead: ['前端技术经理', 'Frontend Engineering Manager', ['M1'], ['javascript', 'typescript', 'react', 'team_mgmt']],
    beLead: ['后端技术经理', 'Backend Engineering Manager', ['M1'], ['java', 'spring', 'mysql', 'team_mgmt']],
    architect: ['架构师', 'Software Architect', ['P7'], ['java', 'microservices', 'k8s', 'performance']],
    seniorFe: ['高级前端工程师', 'Senior Frontend Engineer', ['P6'], ['javascript', 'typescript', 'react', 'frontend_eng']],
    fe: ['前端工程师', 'Frontend Engineer', ['P4', 'P5'], ['javascript', 'vue', 'html_css']],
    seniorBe: ['高级后端工程师', 'Senior Backend Engineer', ['P6'], ['java', 'spring', 'redis', 'mq']],
    be: ['后端工程师', 'Backend Engineer', ['P4', 'P5'], ['java', 'spring', 'mysql']],
    qa: ['测试工程师', 'QA Engineer', ['P4'], ['testing', 'python', 'linux']],
    sre: ['运维开发工程师', 'Site Reliability Engineer', ['P5'], ['linux', 'docker', 'k8s', 'devops']],
    prodDir: ['产品总监', 'Director of Product', ['M2'], ['product_strategy', 'saas', 'team_mgmt']],
    seniorPm: ['高级产品经理', 'Senior Product Manager', ['P6'], ['product_design', 'prd', 'saas', 'data_analysis']],
    pm: ['产品经理', 'Product Manager', ['P4', 'P5'], ['product_design', 'prd', 'prototyping']],
    pa: ['产品助理', 'Product Associate', ['P3'], ['prd', 'prototyping', 'user_research']],
    ui: ['UI 设计师', 'UI Designer', ['P4'], ['ui_design', 'prototyping']],
    ux: ['交互设计师', 'UX Designer', ['P5'], ['ux', 'user_research', 'prototyping']],
    dataDir: ['数据总监', 'Head of Data', ['M2'], ['data_analysis', 'ml', 'bigdata', 'team_mgmt']],
    da: ['数据分析师', 'Data Analyst', ['P4'], ['sql', 'data_analysis', 'excel', 'bi']],
    seniorDa: ['高级数据分析师', 'Senior Data Analyst', ['P6'], ['sql', 'python', 'statistics', 'ab_test']],
    mle: ['算法工程师', 'Machine Learning Engineer', ['P5', 'P6'], ['python', 'ml', 'dl', 'llm']],
    de: ['数据工程师', 'Data Engineer', ['P5'], ['sql', 'bigdata', 'python']],
    mktDir: ['市场总监', 'Marketing Director', ['M2'], ['brand', 'growth', 'team_mgmt']],
    brand: ['品牌经理', 'Brand Manager', ['P5'], ['brand', 'content', 'event']],
    content: ['内容运营', 'Content Marketing Specialist', ['P3', 'P4'], ['content', 'social']],
    growth: ['增长经理', 'Growth Manager', ['P5'], ['growth', 'paid_ads', 'data_analysis']],
    mkt: ['市场专员', 'Marketing Specialist', ['P3'], ['event', 'social']],
    vpSales: ['销售副总裁', 'VP of Sales', ['M3'], ['b2b_sales', 'negotiation', 'team_mgmt']],
    salesLeadE: ['华东区销售经理', 'Sales Manager, East China', ['M1'], ['b2b_sales', 'crm', 'team_mgmt']],
    salesLeadN: ['华北区销售经理', 'Sales Manager, North China', ['M1'], ['b2b_sales', 'channel', 'team_mgmt']],
    kam: ['大客户经理', 'Key Account Manager', ['P5'], ['b2b_sales', 'negotiation', 'crm']],
    rep: ['销售代表', 'Sales Representative', ['P3', 'P4'], ['b2b_sales', 'crm']],
    presales: ['售前顾问', 'Presales Consultant', ['P5'], ['saas', 'bidding', 'product_design']],
    csDir: ['客户成功总监', 'Head of Customer Success', ['M2'], ['customer_success', 'team_mgmt']],
    csm: ['客户成功经理', 'Customer Success Manager', ['P4', 'P5'], ['customer_success', 'saas']],
    impl: ['实施顾问', 'Implementation Consultant', ['P4'], ['project_mgmt', 'saas', 'sql']],
    support: ['客服专员', 'Support Specialist', ['P2', 'P3'], ['customer_success']],
    hrDir: ['人力资源总监', 'HR Director', ['M2'], ['od', 'hrbp', 'team_mgmt', 'employee_relations']],
    hrbp: ['HRBP', 'HR Business Partner', ['P5', 'P6'], ['hrbp', 'recruiting', 'performance_mgmt']],
    ta: ['招聘经理', 'Talent Acquisition Manager', ['P5'], ['recruiting', 'hris']],
    recruiter: ['招聘专员', 'Recruiter', ['P3'], ['recruiting']],
    ld: ['培训经理', 'L&D Manager', ['P5'], ['ld', 'od']],
    cb: ['薪酬福利专员', 'Compensation & Benefits Specialist', ['P4'], ['compensation', 'excel']],
    finDir: ['财务总监', 'Finance Director', ['M2'], ['fin_analysis', 'budget', 'gaap', 'team_mgmt']],
    fa: ['财务分析师', 'Financial Analyst', ['P4'], ['fin_analysis', 'budget', 'excel']],
    acct: ['会计', 'Accountant', ['P3', 'P4'], ['accounting', 'tax', 'erp']],
    tax: ['税务经理', 'Tax Manager', ['P5'], ['tax', 'accounting']],
  };

  const employees = [];
  let seq = 0;
  const hire = (role, deptId, managerId, { years = [0.5, 5], loc = 'sh', ratings } = {}) => {
    seq += 1;
    const [title, titleEn, levels, skills] = ROLES[role];
    const n = newName();
    const level = pickOne(levels);
    const tenureYears = rand(years[0], years[1]);
    const hireDate = daysAgo(tenureYears * 365);
    const performance = ratings?.perf ?? weighted([[1, 1], [2, 6], [3, 48], [4, 32], [5, 9]]);
    const potential = ratings?.pot ?? weighted([[1, 38], [2, 47], [3, 15]]);
    const target = targetProfile(level);
    const competencies = Object.fromEntries(COMP_KEYS.map((k) => [k, clamp(Math.round(target[k] + (performance - 3) * 0.55 + (potential - 2) * 0.3 + normal() * 0.55), 1, 5)]));
    const promoted = R() < 0.7 && tenureYears > 1.2;
    const lastPromotion = promoted ? daysAgo(rand(90, Math.min(tenureYears * 365 - 60, 4 * 365))) : hireDate;
    const prev = clamp(performance + weighted([[-1, 2], [0, 6], [1, 1]]), 1, 5);
    const emp = {
      id: `e${String(seq).padStart(2, '0')}`,
      empNo: `XH${String(1000 + seq)}`,
      name: n.name,
      nameEn: n.nameEn,
      email: `${n.slug}@xinghai.example`,
      phone: `1${int(35, 89)}****${String(int(0, 9999)).padStart(4, '0')}`,
      deptId,
      title,
      titleEn,
      level,
      managerId,
      location: loc,
      hireDate,
      status: 'active',
      skills,
      performance,
      potential,
      perfHistory: [{ period: 'H1', rating: prev }, { period: 'H2', rating: performance }],
      competencies,
      lastPromotion,
      compaRatio: Math.round(rand(0.82, 1.16) * 100) / 100,
      engagement: weighted([[1, 2], [2, 9], [3, 32], [4, 42], [5, 15]]),
      managerChanged: R() < 0.08,
    };
    employees.push(emp);
    return emp;
  };
  const team = (n, role, deptId, managerId, opts) => Array.from({ length: n }, () => hire(role, deptId, managerId, opts));

  const ceo = hire('ceo', 'd01', null, { years: [8, 8.5], ratings: { perf: 4, pot: 2 } });
  hire('ea', 'd01', ceo.id, { years: [1, 3] });

  const vpEng = hire('vpEng', 'd02', ceo.id, { years: [5, 7], ratings: { perf: 4, pot: 2 } });
  const feLead = hire('feLead', 'd02', vpEng.id, { years: [3, 5], ratings: { perf: 4, pot: 3 } });
  const beLead = hire('beLead', 'd02', vpEng.id, { years: [3, 6], ratings: { perf: 3, pot: 2 } });
  hire('architect', 'd02', vpEng.id, { years: [4, 6], ratings: { perf: 5, pot: 2 } });
  team(2, 'seniorFe', 'd02', feLead.id, { years: [2, 5] });
  team(3, 'fe', 'd02', feLead.id, { years: [0.5, 3] });
  team(2, 'seniorBe', 'd02', beLead.id, { years: [2, 5] });
  team(3, 'be', 'd02', beLead.id, { years: [0.5, 3] });
  team(2, 'qa', 'd02', beLead.id, { years: [1, 3] });
  hire('sre', 'd02', beLead.id, { years: [1, 4] });

  const prodDir = hire('prodDir', 'd03', ceo.id, { years: [3, 5], ratings: { perf: 4, pot: 3 } });
  team(2, 'seniorPm', 'd03', prodDir.id, { years: [2, 4] });
  team(2, 'pm', 'd03', prodDir.id, { years: [1, 3] });
  hire('pa', 'd03', prodDir.id, { years: [0.4, 1.5] });
  hire('ui', 'd03', prodDir.id, { years: [1, 3] });
  hire('ux', 'd03', prodDir.id, { years: [1, 4] });

  const dataDir = hire('dataDir', 'd04', ceo.id, { years: [2, 4], ratings: { perf: 3, pot: 2 } });
  team(2, 'da', 'd04', dataDir.id, { years: [0.6, 3] });
  hire('seniorDa', 'd04', dataDir.id, { years: [2, 4], ratings: { perf: 5, pot: 3 } });
  team(2, 'mle', 'd04', dataDir.id, { years: [1, 3] });
  hire('de', 'd04', dataDir.id, { years: [1, 3] });

  const mktDir = hire('mktDir', 'd05', ceo.id, { years: [2, 5], ratings: { perf: 3, pot: 2 } });
  hire('brand', 'd05', mktDir.id, { years: [1, 4] });
  team(2, 'content', 'd05', mktDir.id, { years: [0.5, 2.5] });
  hire('growth', 'd05', mktDir.id, { years: [1, 3], ratings: { perf: 4, pot: 3 } });
  hire('mkt', 'd05', mktDir.id, { years: [0.5, 2] });

  const vpSales = hire('vpSales', 'd06', ceo.id, { years: [4, 7], ratings: { perf: 4, pot: 1 } });
  const salesE = hire('salesLeadE', 'd06', vpSales.id, { years: [2, 5], ratings: { perf: 5, pot: 3 } });
  const salesN = hire('salesLeadN', 'd06', vpSales.id, { years: [2, 5], loc: 'bj', ratings: { perf: 3, pot: 2 } });
  team(2, 'kam', 'd06', salesE.id, { years: [1, 4] });
  team(3, 'rep', 'd06', salesE.id, { years: [0.4, 2.5] });
  hire('kam', 'd06', salesN.id, { years: [1, 4], loc: 'bj' });
  team(2, 'rep', 'd06', salesN.id, { years: [0.4, 2.5], loc: 'bj' });
  hire('presales', 'd06', vpSales.id, { years: [1, 4] });

  const csDir = hire('csDir', 'd07', ceo.id, { years: [2, 4], ratings: { perf: 4, pot: 2 } });
  team(2, 'csm', 'd07', csDir.id, { years: [1, 3] });
  hire('impl', 'd07', csDir.id, { years: [0.8, 3] });
  hire('impl', 'd07', csDir.id, { years: [1, 3], loc: 'sz' });
  team(2, 'support', 'd07', csDir.id, { years: [0.3, 2] });

  const hrDir = hire('hrDir', 'd08', ceo.id, { years: [3, 6], ratings: { perf: 4, pot: 2 } });
  const hrbp = hire('hrbp', 'd08', hrDir.id, { years: [1.5, 4], ratings: { perf: 4, pot: 3 } });
  const taMgr = hire('ta', 'd08', hrDir.id, { years: [1, 4] });
  const recruiter = hire('recruiter', 'd08', taMgr.id, { years: [0.5, 2] });
  hire('ld', 'd08', hrDir.id, { years: [1, 3] });
  const cb = hire('cb', 'd08', hrDir.id, { years: [1, 3] });

  const finDir = hire('finDir', 'd09', ceo.id, { years: [4, 7], ratings: { perf: 4, pot: 1 } });
  hire('fa', 'd09', finDir.id, { years: [0.8, 3] });
  team(2, 'acct', 'd09', finDir.id, { years: [1, 5] });
  hire('tax', 'd09', finDir.id, { years: [2, 5] });

  // Two people who joined in the last fortnight (onboarding in progress).
  const newFe = hire('fe', 'd02', feLead.id, { years: [0.01, 0.01], ratings: { perf: 3, pot: 2 } });
  newFe.hireDate = daysAgo(4);
  newFe.lastPromotion = newFe.hireDate;
  const newCsm = hire('csm', 'd07', csDir.id, { years: [0.03, 0.03], ratings: { perf: 3, pot: 2 } });
  newCsm.hireDate = daysAgo(11);
  newCsm.lastPromotion = newCsm.hireDate;

  // Leavers in the past year, for turnover analytics.
  const leavers = [
    ['be', 'd02', beLead.id, 40, 'voluntary', 'career'],
    ['fe', 'd02', feLead.id, 95, 'voluntary', 'pay'],
    ['rep', 'd06', salesE.id, 70, 'involuntary', 'performance'],
    ['rep', 'd06', salesN.id, 180, 'voluntary', 'pay'],
    ['support', 'd07', csDir.id, 130, 'voluntary', 'relocation'],
    ['da', 'd04', dataDir.id, 220, 'voluntary', 'career'],
    ['content', 'd05', mktDir.id, 260, 'voluntary', 'manager'],
    ['kam', 'd06', salesE.id, 310, 'voluntary', 'career'],
  ];
  for (const [role, deptId, mgr, ago, type, reason] of leavers) {
    const e = hire(role, deptId, mgr, { years: [1.2, 3.5] });
    Object.assign(e, { status: 'left', leaveDate: daysAgo(ago), leaveType: type, leaveReason: reason });
  }
  // Leadership roles are stable on purpose; a couple of named high-risk cases make the risk view meaningful.
  Object.assign(employees.find((e) => e.title === '高级数据分析师'), { compaRatio: 0.84, engagement: 2, lastPromotion: daysAgo(1200) });
  Object.assign(salesE, { compaRatio: 0.88, engagement: 3 });

  const active = employees.filter((e) => e.status === 'active');
  const byTitle = (t) => active.filter((e) => e.title === t);

  // ---------------------------------------------------------------- positions
  const P = (id, title, titleEn, deptId, level, skills, niceSkills, minYears, education, headcount, status, priority, hiringManagerId, salary, openedAgo, extra = {}) => ({
    id, title, titleEn, deptId, level, skills, niceSkills, minYears, maxYears: minYears + 6, education, headcount, status, priority, hiringManagerId,
    salaryMin: salary[0], salaryMax: salary[1], location: extra.location || 'sh', recruiterId: extra.recruiterId || taMgr.id,
    createdAt: stampAgo(openedAgo), openedAt: daysAgo(openedAgo), ...extra,
  });
  const positions = [
    P('p01', '高级前端工程师', 'Senior Frontend Engineer', 'd02', 'P6', ['javascript', 'typescript', 'react', 'frontend_eng'], ['nodejs', 'performance', 'testing'], 5, 3, 2, 'open', 'high', feLead.id, [35, 50], 42),
    P('p02', '后端工程师（Java）', 'Backend Engineer (Java)', 'd02', 'P5', ['java', 'spring', 'mysql', 'redis'], ['mq', 'microservices', 'k8s'], 3, 3, 2, 'open', 'high', beLead.id, [25, 38], 35, { recruiterId: recruiter.id }),
    P('p03', '数据分析师', 'Data Analyst', 'd04', 'P4', ['sql', 'data_analysis', 'statistics', 'excel'], ['python', 'bi', 'ab_test'], 2, 3, 1, 'open', 'medium', dataDir.id, [18, 28], 28, { recruiterId: recruiter.id }),
    P('p04', '高级产品经理（B 端）', 'Senior Product Manager (B2B)', 'd03', 'P6', ['product_design', 'prd', 'user_research', 'saas'], ['data_analysis', 'prototyping', 'product_strategy'], 5, 3, 1, 'open', 'high', prodDir.id, [35, 50], 50),
    P('p05', '大客户销售经理', 'Key Account Manager', 'd06', 'P5', ['b2b_sales', 'negotiation', 'crm'], ['bidding', 'channel', 'english'], 3, 2, 3, 'open', 'medium', salesE.id, [20, 30], 60, { recruiterId: recruiter.id }),
    P('p06', 'HRBP', 'HR Business Partner', 'd08', 'P6', ['hrbp', 'employee_relations', 'performance_mgmt', 'recruiting'], ['od', 'ld', 'compensation'], 5, 3, 1, 'open', 'medium', hrDir.id, [28, 40], 21),
    P('p07', '市场经理', 'Marketing Manager', 'd05', 'M1', ['brand', 'content', 'social', 'growth'], ['paid_ads', 'data_analysis', 'event'], 5, 3, 1, 'open', 'low', mktDir.id, [30, 45], 18),
    P('p08', '财务分析师', 'Financial Analyst', 'd09', 'P4', ['fin_analysis', 'budget', 'excel'], ['erp', 'gaap', 'bi'], 2, 3, 1, 'paused', 'low', finDir.id, [18, 26], 75),
    P('p09', '客户成功经理', 'Customer Success Manager', 'd07', 'P5', ['customer_success', 'saas', 'project_mgmt'], ['sql', 'english'], 3, 3, 1, 'closed', 'medium', csDir.id, [20, 30], 95, { closedAt: daysAgo(12) }),
    P('p10', '前端工程师', 'Frontend Engineer', 'd02', 'P4', ['javascript', 'vue', 'html_css'], ['typescript', 'react'], 2, 3, 1, 'closed', 'medium', feLead.id, [18, 28], 110, { closedAt: daysAgo(8) }),
  ];
  const posById = Object.fromEntries(positions.map((p) => [p.id, p]));

  // ---------------------------------------------------------------- resumes
  const SCHOOLS = [['浙江大学', 'Zhejiang University'], ['华东师范大学', 'East China Normal University'], ['南京邮电大学', 'Nanjing University of Posts and Telecommunications'], ['上海大学', 'Shanghai University'], ['武汉理工大学', 'Wuhan University of Technology'], ['深圳大学', 'Shenzhen University'], ['苏州大学', 'Soochow University'], ['西南交通大学', 'Southwest Jiaotong University'], ['杭州电子科技大学', 'Hangzhou Dianzi University'], ['复旦大学', 'Fudan University'], ['郑州大学', 'Zhengzhou University'], ['上海财经大学', 'Shanghai University of Finance and Economics']];
  const MAJORS = { tech: ['计算机科学与技术', 'Computer Science'], data: ['统计学', 'Statistics'], product: ['信息管理与信息系统', 'Information Systems'], sales: ['市场营销', 'Marketing'], hr: ['人力资源管理', 'Human Resource Management'], marketing: ['广告学', 'Advertising'], finance: ['会计学', 'Accounting'], ops: ['工商管理', 'Business Administration'] };
  const COMPANIES = [['某头部电商公司', 'a leading e-commerce company'], ['某金融科技公司', 'a fintech company'], ['某 SaaS 创业公司', 'a SaaS start-up'], ['某上市软件公司', 'a listed software company'], ['某外资制造企业', 'a multinational manufacturer'], ['某互联网教育公司', 'an online education company'], ['某本地生活平台', 'a local services platform'], ['某咨询公司', 'a consulting firm']];
  const BULLETS = {
    tech: [['负责核心交易链路的开发，使用 {s} 完成系统重构，接口性能提升 {n}%', 'Rebuilt the core checkout flow with {s}; API latency improved by {n}%'], ['主导组件库建设，覆盖 {m} 个业务线，开发效率提升 {n}%', 'Led a shared component library used by {m} product lines; delivery speed up {n}%'], ['参与需求评审与技术方案设计，独立负责 {s} 相关模块', 'Took part in design reviews and owned the {s} modules'], ['推动单元测试与 CI 落地，线上缺陷率下降 {n}%', 'Introduced unit tests and CI; production defects down {n}%']],
    data: [['搭建核心业务指标体系与 {s} 看板，服务 {m} 个业务团队', 'Built the KPI system and {s} dashboards for {m} business teams'], ['设计并分析 A/B 实验，转化率提升 {n}%', 'Designed and analyzed A/B tests; conversion up {n}%'], ['使用 {s} 完成用户流失预测，召回策略使留存提升 {n}%', 'Built churn prediction with {s}; win-back raised retention {n}%']],
    product: [['负责 B 端 SaaS 产品的规划与迭代，撰写 PRD，产品 ARR 增长 {n}%', 'Owned roadmap and PRDs for a B2B SaaS product; ARR up {n}%'], ['开展 {m} 场用户访谈与可用性测试，重构核心流程，任务完成率提升 {n}%', 'Ran {m} user interviews and usability tests; task completion up {n}%'], ['协调研发、设计、销售，按期交付 {m} 个大版本', 'Coordinated engineering, design and sales to ship {m} major releases on time']],
    sales: [['负责华东区大客户开拓，年度完成销售额 {m} 千万元，达成率 {n}%', 'Covered key accounts in East China; closed RMB {m}0 million, {n}% of target'], ['主导 {m} 个重点项目的招投标与商务谈判', 'Led bids and negotiations for {m} major deals'], ['使用 CRM 管理销售漏斗，预测准确率提升至 {n}%', 'Managed the pipeline in CRM; forecast accuracy {n}%']],
    hr: [['作为 HRBP 支持 {m} 人的研发团队，主导人才盘点与组织调整', 'HRBP for a {m}-person engineering org; led talent reviews and reorganization'], ['搭建招聘体系，年度完成 {m} 人招聘，平均招聘周期缩短 {n}%', 'Built the hiring process; hired {m} people, time-to-fill down {n}%'], ['处理员工关系与劳动争议，推动绩效管理改革', 'Handled employee relations and disputes; led a performance management redesign']],
    marketing: [['负责品牌与内容营销，社交媒体粉丝增长 {n}%', 'Ran brand and content marketing; social followers up {n}%'], ['策划 {m} 场行业市场活动，获取有效线索 {m}00+', 'Organized {m} industry events generating {m}00+ qualified leads'], ['统筹投放预算，获客成本降低 {n}%', 'Managed paid media budget; acquisition cost down {n}%']],
    ops: [['负责 {m} 家重点客户的续约与增购，续约率 {n}%', 'Managed renewals and upsell for {m} key accounts; {n}% renewal rate'], ['主导客户实施项目，按期上线率提升 {n}%', 'Led customer implementation projects; on-time go-live up {n}%'], ['搭建客户健康度模型，提前识别流失风险', 'Built a customer health score to flag churn risk early']],
    finance: [['负责月度经营分析与预算管理，支持管理层决策', 'Owned monthly business analysis and budgeting for leadership'], ['搭建财务模型，完成 {m} 个投资项目的回报分析', 'Built financial models for {m} investment cases'], ['优化月结流程，关账时间缩短 {n}%', 'Streamlined month-end close; close time down {n}%']],
  };
  const FAMILY_OF = { p01: 'tech', p02: 'tech', p03: 'data', p04: 'product', p05: 'sales', p06: 'hr', p07: 'marketing', p08: 'finance', p09: 'ops', p10: 'tech' };
  const SKILL_TEXT = { javascript: 'JavaScript', typescript: 'TypeScript', react: 'React', frontend_eng: 'Webpack/Vite 工程化', nodejs: 'Node.js', performance: '性能优化', testing: 'Jest 单元测试', java: 'Java', spring: 'Spring Boot', mysql: 'MySQL', redis: 'Redis', mq: 'Kafka', microservices: '微服务', k8s: 'Kubernetes', sql: 'SQL', data_analysis: '数据分析', statistics: '统计分析', excel: 'Excel', python: 'Python', bi: 'Tableau', ab_test: 'A/B测试', product_design: '产品设计', prd: 'PRD', user_research: '用户研究', saas: 'SaaS', prototyping: 'Axure/Figma', product_strategy: '产品规划', b2b_sales: '大客户销售', negotiation: '商务谈判', crm: 'CRM（Salesforce）', bidding: '招投标', channel: '渠道管理', english: '英语流利（CET-6）', hrbp: 'HRBP', employee_relations: '员工关系与劳动法', performance_mgmt: '绩效管理（OKR/KPI）', recruiting: '招聘', od: '组织发展', ld: '培训体系建设', compensation: '薪酬福利', brand: '品牌策划', content: '内容营销', social: '小红书/抖音运营', growth: '用户增长', paid_ads: '信息流投放', event: '市场活动', fin_analysis: '财务分析', budget: '预算管理', erp: 'SAP', gaap: 'IFRS', customer_success: '客户成功', project_mgmt: '项目管理（PMP）', vue: 'Vue', html_css: 'HTML/CSS' };
  const SKILL_TEXT_EN = { frontend_eng: 'Webpack/Vite', performance: 'performance optimization', testing: 'Jest unit testing', data_analysis: 'data analysis', statistics: 'statistics', ab_test: 'A/B test design', product_design: 'product design', user_research: 'user research', prototyping: 'Figma prototyping', product_strategy: 'product strategy', b2b_sales: 'key account sales', negotiation: 'negotiation', crm: 'Salesforce CRM', bidding: 'bidding', channel: 'channel management', english: 'English', employee_relations: 'employee relations', performance_mgmt: 'performance management', recruiting: 'recruiting', compensation: 'compensation', brand: 'branding', content: 'content marketing', social: 'social media', growth: 'growth', paid_ads: 'paid ads', event: 'event marketing', fin_analysis: 'financial analysis', budget: 'budgeting', microservices: 'microservices', mq: 'Kafka', bi: 'Tableau', od: 'organization development', ld: 'training', hrbp: 'HRBP', erp: 'SAP', gaap: 'IFRS', customer_success: 'customer success', project_mgmt: 'project management' };

  const fill = (tpl, s) => tpl.replace('{s}', s).replace('{n}', String(int(15, 45))).replace(/\{m\}/g, String(int(3, 9)));

  function buildResume(c, pos, fit, english) {
    const fam = FAMILY_OF[pos.id];
    const coverage = fit === 'high' ? 0.88 : fit === 'mid' ? 0.5 : 0.15;
    const req = pos.skills.filter((_, i) => i === 0 || R() < coverage);
    const nice = pos.niceSkills.filter(() => R() < coverage * 0.5);
    const skills = [...new Set([...req, ...nice])];
    const yearsTotal = Math.max(0.8, pos.minYears * (fit === 'high' ? rand(1.0, 1.8) : fit === 'mid' ? rand(0.6, 1.2) : rand(0.25, 0.6)));
    const hop = R() < 0.18;
    const jobsN = hop ? int(3, 4) : yearsTotal > 5 ? int(2, 3) : yearsTotal > 2 ? int(1, 2) : 1;
    const nowM = today.getFullYear() * 12 + today.getMonth();
    const totalMonths = Math.round(yearsTotal * 12);
    const per = Math.max(4, Math.round(totalMonths / jobsN));
    const jobs = [];
    let end = nowM;
    for (let i = 0; i < jobsN; i++) {
      const start = end - per + 1;
      jobs.push({ start, end, current: i === 0, company: pickOne(COMPANIES) });
      end = start - (R() < 0.12 ? int(10, 14) : 1);
    }
    const fmtM = (m) => `${Math.floor(m / 12)}.${String((m % 12) + 1).padStart(2, '0')}`;
    const gradM = jobs[jobs.length - 1].start - 1;
    const edu = fit === 'low' && R() < 0.4 ? 2 : R() < 0.25 ? 4 : 3;
    const school = pickOne(SCHOOLS);
    const major = MAJORS[fam];
    const certs = fam === 'finance' && R() < 0.5 ? ['CPA'] : fam === 'hr' && R() < 0.5 ? ['企业人力资源管理师（二级）'] : fam === 'tech' && R() < 0.2 ? ['AWS Certified Developer'] : [];
    const titleZh = pos.title.replace(/（.*）/, '');
    const skillsTxt = skills.map((k) => (english ? SKILL_TEXT_EN[k] || SKILL_TEXT[k] : SKILL_TEXT[k])).filter(Boolean);
    const bullets = BULLETS[fam];
    const lines = [];
    if (english) {
      lines.push(c.nameEn, `Phone: ${c.phoneRaw} | Email: ${c.email}`, `Objective: ${pos.titleEn}`, '', 'EXPERIENCE');
      jobs.forEach((j, i) => {
        lines.push(`${fmtM(j.start)} - ${j.current ? 'Present' : fmtM(j.end)}  ${i === 0 && fit !== 'low' ? pos.titleEn : pos.titleEn.replace('Senior ', '')}, ${j.company[1]}`);
        const bs = [...bullets].sort(() => R() - 0.5).slice(0, 2);
        bs.forEach((b) => lines.push(`- ${fill(b[1], skillsTxt[int(0, skillsTxt.length - 1)] || '')}`));
        if (i === 0 && jobs.length > 1 && R() < 0.4) lines.push(`- Led a team of ${int(3, 8)} people`);
      });
      lines.push('', 'EDUCATION', `${fmtM(gradM - 47)} - ${fmtM(gradM)}  ${school[1]}, ${edu === 4 ? 'Master of Science' : edu === 2 ? 'Associate degree' : 'Bachelor of Science'} in ${major[1]}`);
      lines.push('', `SKILLS: ${skillsTxt.join(', ')}`);
      if (certs.length) lines.push(`CERTIFICATIONS: ${certs.join(', ')}`);
    } else {
      lines.push(c.name, `电话：${c.phoneRaw} | 邮箱：${c.email}`, `求职意向：${titleZh}`, '', '工作经历');
      jobs.forEach((j, i) => {
        lines.push(`${fmtM(j.start)}-${j.current ? '至今' : fmtM(j.end)}  ${j.company[0]}  ${i === 0 && fit !== 'low' ? titleZh : titleZh.replace('高级', '')}`);
        const bs = [...bullets].sort(() => R() - 0.5).slice(0, 2);
        bs.forEach((b) => lines.push(`· ${fill(b[0], skillsTxt[int(0, skillsTxt.length - 1)] || '')}`));
        if (i === 0 && jobs.length > 1 && R() < 0.4) lines.push(`· 带领 ${int(3, 8)} 人团队完成年度目标`);
      });
      lines.push('', '教育背景', `${fmtM(gradM - 47)}-${fmtM(gradM)}  ${school[0]}  ${major[0]}  ${edu === 4 ? '硕士' : edu === 2 ? '大专' : '本科'}`);
      lines.push('', `专业技能：${skillsTxt.join('、')}`);
      if (certs.length) lines.push(`证书：${certs.join('、')}`);
    }
    return lines.join('\n');
  }

  // ---------------------------------------------------------------- candidates
  const SOURCES = ['referral', 'jobboard', 'jobboard', 'linkedin', 'website', 'agency', 'jobboard', 'referral'];
  const interviewersFor = (pos) => {
    const mgr = employees.find((e) => e.id === pos.hiringManagerId);
    const peers = active.filter((e) => e.deptId === pos.deptId && e.id !== mgr.id && !e.level.startsWith('M') && Number(e.level.slice(1)) >= 5);
    return { r1: (peers[0] || mgr).id, r2: mgr.id, r3: (pos.deptId === 'd08' ? hrDir : hrbp).id };
  };
  const plan = [
    // [position, stage, fit, daysAgo, english]
    ['p01', 'applied', 'mid', 3], ['p01', 'applied', 'low', 2], ['p01', 'screen', 'high', 9], ['p01', 'interview', 'high', 18], ['p01', 'interview', 'mid', 15], ['p01', 'offer', 'high', 30], ['p01', 'rejected', 'low', 25], ['p01', 'applied', 'high', 1, true],
    ['p02', 'applied', 'mid', 4], ['p02', 'applied', 'mid', 2], ['p02', 'screen', 'high', 8], ['p02', 'screen', 'low', 10], ['p02', 'interview', 'mid', 14], ['p02', 'interview', 'high', 20], ['p02', 'rejected', 'low', 22],
    ['p03', 'applied', 'high', 2, true], ['p03', 'screen', 'mid', 6], ['p03', 'interview', 'high', 13], ['p03', 'offer', 'high', 24],
    ['p04', 'applied', 'low', 5], ['p04', 'screen', 'mid', 11], ['p04', 'interview', 'high', 21, true], ['p04', 'rejected', 'mid', 33],
    ['p05', 'applied', 'mid', 1], ['p05', 'applied', 'high', 3], ['p05', 'screen', 'high', 7], ['p05', 'interview', 'mid', 16], ['p05', 'offer', 'high', 29], ['p05', 'hired', 'high', 48], ['p05', 'rejected', 'low', 40],
    ['p06', 'applied', 'high', 2], ['p06', 'screen', 'mid', 5], ['p06', 'interview', 'high', 12],
    ['p07', 'applied', 'mid', 4], ['p07', 'screen', 'high', 9, true],
    ['p08', 'applied', 'mid', 30], ['p08', 'rejected', 'low', 45],
    ['p09', 'hired', 'high', 60], ['p10', 'hired', 'high', 70],
  ];
  const candidates = plan.map(([posId, stage, fit, ago, english], i) => {
    const pos = posById[posId];
    const n = newName();
    const phoneRaw = `1${int(35, 89)}${String(int(0, 99999999)).padStart(8, '0')}`;
    const c = { name: n.name, nameEn: n.nameEn, email: `${n.slug.replace('.', '')}@mail.example`, phoneRaw };
    const appliedAt = daysAgo(ago);
    const doc = {
      id: `c${String(i + 1).padStart(2, '0')}`,
      name: english ? n.nameEn : n.name,
      nameEn: n.nameEn,
      positionId: posId,
      stage,
      source: pickOne(SOURCES),
      appliedAt,
      createdAt: stampAgo(ago, 9),
      email: c.email,
      phone: `${phoneRaw.slice(0, 3)}****${phoneRaw.slice(-4)}`,
      resume: buildResume(c, pos, fit, english),
      stageChangedAt: daysAgo(Math.max(0, ago - int(1, Math.max(1, Math.floor(ago / 2))))),
      interviews: [],
      notes: [],
    };
    if (stage === 'rejected') doc.rejectReason = pickOne(['skills', 'experience', 'salary', 'withdrew']);
    const rounds = { interview: int(1, 2), offer: 3, hired: 3, rejected: fit === 'mid' ? 2 : 0 }[stage] || 0;
    const ivs = interviewersFor(pos);
    const base = fit === 'high' ? 4 : fit === 'mid' ? 3.2 : 2.4;
    ['r1', 'r2', 'r3'].slice(0, rounds).forEach((r, k) => {
      const scores = Object.fromEntries(['professional', 'problem', 'execution', 'communication', 'collaboration', 'learning'].map((key) => [key, clamp(Math.round(base + normal() * 0.6), 1, 5)]));
      const avg = Object.values(scores).reduce((a, b) => a + b, 0) / 6;
      doc.interviews.push({
        id: `iv${i}${k}`,
        round: r,
        interviewerId: ivs[r],
        date: daysAgo(Math.max(1, ago - 3 - k * 3)),
        scores,
        recommendation: avg >= 4.2 ? 'strong_yes' : avg >= 3.4 ? 'yes' : avg >= 2.6 ? 'no' : 'strong_no',
        notes: avg >= 3.4 ? '案例讲得具体，行动和结果清晰。' : '部分回答停留在概念层面，缺少个人行动细节。',
      });
    });
    if (stage === 'offer' || stage === 'hired') doc.offer = { salary: Math.round(rand(pos.salaryMin, pos.salaryMax)), startDate: stage === 'hired' ? daysAgo(Math.max(1, ago - 25)) : addDays(T, int(10, 30)), status: stage === 'hired' ? 'accepted' : 'sent' };
    if (stage === 'screen' || stage === 'interview') doc.notes.push({ by: recruiter.id, at: stampAgo(Math.max(0, ago - 2)), text: '电话沟通：求职意向明确，期望薪资在预算范围内。' });
    return doc;
  });
  // Interviews scheduled but not yet scored, to show "awaiting feedback".
  const pending = candidates.find((c) => c.positionId === 'p02' && c.stage === 'interview');
  pending.interviews.push({ id: 'ivp1', round: 'r2', interviewerId: beLead.id, date: daysAgo(4), scores: {}, recommendation: null, notes: '' });

  // ---------------------------------------------------------------- succession
  const keyRoles = [
    ['s01', vpEng, 'critical'], ['s02', vpSales, 'critical'], ['s03', prodDir, 'high'], ['s04', dataDir, 'high'],
    ['s05', hrDir, 'high'], ['s06', finDir, 'critical'], ['s07', feLead, 'medium'],
  ];
  // Nominations come from the succession rules (same function, eligible, ranked), so a
  // fresh demo starts from plausible plans. One high-risk manual nomination is kept on
  // purpose to show how excluded candidates are displayed.
  const deptById = Object.fromEntries(departments.map((x) => [x.id, x]));
  const succession = keyRoles.map(([id, inc, criticality]) => {
    const planDoc = { id, title: inc.title, titleEn: inc.titleEn, deptId: inc.deptId, incumbentId: inc.id, criticality, vacancyRisk: inc.performance >= 4 && inc.potential === 1 ? 'medium' : 'low', successors: [] };
    if (id !== 's06') {
      const ev = evaluatePlan(planDoc, active, { today: T, departments: deptById });
      planDoc.successors = ev.suggestions.slice(0, id === 's01' ? 3 : 2).map((x) => ({ employeeId: x.employee.id, readiness: x.readiness, note: '' }));
      if (id === 's04' && ev.heldBack[0]) planDoc.successors.push({ employeeId: ev.heldBack[0].employee.id, readiness: 'y1', note: '上级提名（演示：高流失风险人员的显示方式）' });
    }
    return planDoc;
  });
  succession.find((s) => s.id === 's06').vacancyRisk = 'high';
  succession.find((s) => s.id === 's06').note = '财务总监计划 1 年内退休，尚无内部继任者。';
  succession.find((s) => s.id === 's06').noteEn = 'The Finance Director plans to retire within a year; no internal successor yet.';

  // ---------------------------------------------------------------- learning
  const courses = COURSE_CATALOG.map((c) => ({ ...c, createdAt: stampAgo(200) }));
  const enrollments = [];
  let en = 0;
  for (const e of active) {
    const k = int(0, 3);
    const chosen = [...courses].sort(() => R() - 0.5).slice(0, k);
    for (const c of chosen) {
      en += 1;
      const status = weighted([['completed', 60], ['in_progress', 25], ['planned', 15]]);
      enrollments.push({
        id: `n${String(en).padStart(3, '0')}`, employeeId: e.id, courseId: c.id, status,
        progress: status === 'completed' ? 100 : status === 'in_progress' ? int(15, 85) : 0,
        satisfaction: status === 'completed' ? weighted([[3, 2], [4, 6], [5, 4]]) : null,
        completedAt: status === 'completed' ? daysAgo(int(5, 200)) : null,
        createdAt: stampAgo(int(20, 220)),
      });
    }
  }
  const idpFor = [feLead, active.find((e) => e.title === '数据分析师'), hrbp, active.find((e) => e.title === '销售代表')];
  const idps = idpFor.map((emp, i) => {
    const plan = buildIDP(emp, courses, daysAgo(40 + i * 10));
    plan.focus.forEach((f) => f.actions.forEach((a, j) => { a.done = j === 0 || (j === 2 && i % 2 === 0); }));
    return { id: `i0${i + 1}`, employeeId: emp.id, period: `${today.getFullYear()}`, status: 'active', mode: plan.mode, focus: plan.focus, createdBy: emp.managerId, createdAt: stampAgo(40 + i * 10) };
  });

  // ---------------------------------------------------------------- surveys
  const surveys = [
    { id: 'v01', model: 'sixbox', title: `${today.getFullYear()} 年度组织健康诊断`, titleEn: `${today.getFullYear()} organizational health check`, scope: 'all', status: 'closed', anonymous: true, createdAt: stampAgo(45), closedAt: daysAgo(20) },
    { id: 'v02', model: 'engagement', title: '第三季度敬业度脉搏调研', titleEn: 'Q3 engagement pulse', scope: 'all', status: 'open', anonymous: true, createdAt: stampAgo(12) },
    { id: 'v03', model: 'team', title: '研发管理团队协作诊断', titleEn: 'Engineering leadership team check', scope: 'd02', status: 'open', anonymous: true, createdAt: stampAgo(6) },
  ];
  const BIAS = {
    sixbox: { purposes: 3.9, structure: 3.1, relationships: 3.6, rewards: 2.8, leadership: 3.5, mechanisms: 2.9, change: 3.4 },
    engagement: { basic: 3.8, contribution: 3.4, belonging: 3.7, growth: 3.0 },
    team: { trust: 3.6, conflict: 2.9, commitment: 3.3, accountability: 2.7, results: 3.5 },
  };
  const DEPT_OFFSET = { d02: { mechanisms: -0.4, growth: -0.2 }, d06: { rewards: 0.5, relationships: -0.3, basic: -0.3 }, d07: { rewards: -0.3, contribution: -0.3 }, d08: { purposes: 0.3 } };
  const COMMENTS = ['希望晋升标准更透明一些。', '跨部门协作流程太长，审批节点多。', '团队氛围很好，上级很支持。', '工作量偏大，希望增加人手。', '希望有更多学习和轮岗机会。', 'Would love clearer career paths for individual contributors.', '薪酬调整周期太长了。', '对公司产品方向很有信心！'];
  const responses = [];
  let rn = 0;
  const respond = (survey, count) => {
    const model = MODELS[survey.model];
    const pool = active.filter((e) => survey.scope === 'all' || e.deptId === survey.scope).sort(() => R() - 0.5).slice(0, count);
    for (const respondent of pool) {
      // About one in eight people choose not to state their department.
      const deptId = R() < 0.12 ? undefined : respondent.deptId;
      const person = normal() * 0.35;
      const answers = {};
      for (const d of model.dims) {
        const off = DEPT_OFFSET[deptId]?.[d.key] || 0;
        for (const it of d.items) answers[it.id] = clamp(Math.round(BIAS[survey.model][d.key] + off + person + normal() * 0.75), 1, 5);
      }
      rn += 1;
      const r = { id: `r${String(rn).padStart(3, '0')}`, surveyId: survey.id, ...(deptId && { deptId }), answers, createdAt: stampAgo(int(1, survey.id === 'v01' ? 40 : survey.id === 'v02' ? 11 : 5), int(9, 18)) };
      if (model.enps) r.enps = clamp(Math.round(7.7 + person * 3 + normal() * 1.5), 0, 10);
      if (survey.model === 'engagement' && R() < 0.22) r.comment = pickOne(COMMENTS);
      responses.push(r);
    }
  };
  respond(surveys[0], 54);
  respond(surveys[1], 43);
  respond(surveys[2], 9);

  // ---------------------------------------------------------------- service desk
  const hrTeam = [hrbp, cb, recruiter, taMgr];
  const TICKETS = [
    ['leave', '申请下周三至周五年假', 'Annual leave next Wed-Fri', 'open', 0, '因家中有事，想申请 3 天年假，请问当前年假余额是多少？', 'Requesting 3 days of annual leave for family matters. What is my current balance?'],
    ['certificate', '开具在职证明（签证用）', 'Employment letter for a visa', 'in_progress', 1, '需要中英文在职证明各一份，用于办理日本签证。', 'Need an employment letter in Chinese and English for a Japan visa.'],
    ['payroll', '上月加班费未计入工资', 'Overtime missing from last payslip', 'in_progress', 4, '上月有两个周末加班，工资条中没有看到加班费。', 'I worked two weekends last month but the overtime is not on my payslip.'],
    ['benefits', '补充医疗保险如何报销', 'How to claim supplementary medical', 'resolved', 9, '请问门诊费用如何通过补充商业保险报销？', 'How do I claim outpatient costs through supplementary insurance?'],
    ['records', '劳动合同续签', 'Contract renewal', 'open', 6, '我的劳动合同下个月到期，想确认续签流程。', 'My contract expires next month; what is the renewal process?'],
    ['it', '新员工电脑与账号开通', 'Laptop and accounts for new hire', 'resolved', 12, '新同事下周一入职，需要提前开通账号并准备电脑。', 'A new colleague starts Monday and needs accounts and a laptop.'],
    ['leave', '婚假天数咨询', 'How many days of marriage leave', 'resolved', 15, '下个月领证，想了解婚假天数和需要的材料。', 'Getting married next month. How many days of marriage leave, and what documents?'],
    ['payroll', '公积金提取材料', 'Housing fund withdrawal documents', 'open', 2, '准备买房，需要公司出具公积金提取相关材料。', 'Buying a home and need documents to withdraw from the housing fund.'],
    ['other', '内部转岗流程咨询', 'Internal transfer process', 'in_progress', 3, '对数据智能部的岗位感兴趣，想了解内部转岗的条件和流程。', 'Interested in a Data & AI role; what are the internal transfer rules?'],
    ['certificate', '收入证明（房贷）', 'Income letter for a mortgage', 'resolved', 20, '银行需要近一年的收入证明。', 'The bank needs an income letter for the past year.'],
    ['benefits', '体检预约时间调整', 'Reschedule health check', 'open', 7, '原定的年度体检时间有冲突，想改期。', 'My annual health check clashes with travel; can I reschedule?'],
    ['leave', '补卡申请', 'Missed clock-in correction', 'resolved', 18, '上周四忘记打卡，申请补卡。', 'Forgot to clock in last Thursday; requesting a correction.'],
  ];
  const tickets = TICKETS.map(([type, title, titleEn, status, ago, detail, detailEn], i) => {
    const requester = active[(i * 7 + 5) % active.length];
    const assignee = status === 'open' ? null : hrTeam[i % hrTeam.length].id;
    const t = { id: `t${String(i + 1).padStart(2, '0')}`, type, title, titleEn, detail, detailEn, status, requesterId: requester.id, assigneeId: assignee, createdAt: stampAgo(ago, int(9, 17)), comments: [] };
    if (status !== 'open') t.comments.push({ by: assignee, at: stampAgo(Math.max(0, ago - 1), 14), text: '已收到，正在处理中。', textEn: 'Received; working on it.' });
    if (status === 'resolved') {
      t.comments.push({ by: assignee, at: stampAgo(Math.max(0, ago - 2), 16), text: '已处理完毕，如有问题请随时联系。', textEn: 'Done. Let us know if you need anything else.' });
      t.resolvedAt = daysAgo(Math.max(0, ago - 2));
    }
    return t;
  });

  const kb = KB_ARTICLES.map((a) => ({ ...a, createdAt: stampAgo(300), updatedBy: hrDir.id }));

  const onboarding = [newFe, newCsm].map((e, i) => {
    const tasks = buildChecklist(e.hireDate, { manager: false });
    for (const t of tasks) if (t.due <= T && R() < 0.85) t.done = true;
    return { id: `o0${i + 1}`, employeeId: e.id, startDate: e.hireDate, buddyId: active.find((x) => x.deptId === e.deptId && x.id !== e.id && x.id !== e.managerId)?.id, tasks, createdAt: stampAgo(10 + i * 7) };
  });

  const raci = [
    {
      id: 'x01', title: '招聘流程', titleEn: 'Hiring process',
      roles: ['用人经理', 'HRBP', '招聘专员', '部门负责人', '财务'],
      rolesEn: ['Hiring manager', 'HRBP', 'Recruiter', 'Department head', 'Finance'],
      steps: [
        { name: '提出招聘需求', nameEn: 'Raise the requisition', cells: ['R', 'C', '', 'A', 'I'] },
        { name: '编制与预算审批', nameEn: 'Approve headcount and budget', cells: ['I', 'R', '', 'A', 'C'] },
        { name: '发布职位与简历筛选', nameEn: 'Post the job and screen resumes', cells: ['C', 'A', 'R', '', ''] },
        { name: '面试与评估', nameEn: 'Interview and assess', cells: ['A', 'R', 'R', 'C', ''] },
        { name: '录用决策', nameEn: 'Hiring decision', cells: ['A', 'C', 'I', 'A', ''] },
        { name: '发放 Offer 与背调', nameEn: 'Offer and background check', cells: ['I', 'A', 'R', 'I', 'C'] },
      ],
      createdAt: stampAgo(30),
    },
    {
      id: 'x02', title: '新员工入职', titleEn: 'New hire onboarding',
      roles: ['HR', '直属上级', 'IT / 行政', '入职导师'],
      rolesEn: ['HR', 'Manager', 'IT & facilities', 'Buddy'],
      steps: [
        { name: '入职材料与合同', nameEn: 'Paperwork and contract', cells: ['A', 'I', '', ''] },
        { name: '设备与账号准备', nameEn: 'Equipment and accounts', cells: ['C', 'I', 'A', ''] },
        { name: '第一周安排', nameEn: 'Week-one plan', cells: ['C', 'A', '', 'R'] },
        { name: '试用期目标设定', nameEn: 'Set probation goals', cells: ['C', 'A', '', 'I'] },
      ],
      createdAt: stampAgo(25),
    },
  ];
  // x02 rows deliberately lack an explicit R in places so the checker has something to say.

  const activity = [
    [0.2, hrbp, 'update', 'candidates', candidates.find((c) => c.stage === 'offer'), { field: 'stage', from: 'interview', to: 'offer' }],
    [0.5, recruiter, 'create', 'candidates', candidates[0], null],
    [1, cb, 'update', 'tickets', tickets[3], { field: 'status', from: 'in_progress', to: 'resolved' }],
    [1.4, hrDir, 'create', 'surveys', surveys[2], null],
    [2, feLead, 'update', 'candidates', candidates.find((c) => c.positionId === 'p01' && c.stage === 'interview'), { field: 'stage', from: 'screen', to: 'interview' }],
    [3, hrDir, 'update', 'employees', salesE, null],
    [4, taMgr, 'create', 'positions', positions[5], null],
    [5, hrbp, 'create', 'idps', { id: idps[2].id, name: employees.find((e) => e.id === idps[2].employeeId).name, nameEn: employees.find((e) => e.id === idps[2].employeeId).nameEn }, null],
  ].map(([ago, actor, action, col, doc, detail]) => ({ at: db.stamp(new Date(today.getTime() - ago * 86400000)), actor, action, col, doc, detail }));

  return { departments, employees, positions, candidates, succession, courses, enrollments, idps, surveys, responses, tickets, kb, onboarding, raci, activity };
}

export function reseed(today = new Date()) {
  const data = generate(today);
  db.wipe();
  for (const col of Object.keys(db.COLLECTIONS)) db.insertMany(col, data[col] || []);
  for (const a of data.activity) db.logActivity({ at: a.at, actor: { id: a.actor.id, name: a.actor.name, nameEn: a.actor.nameEn }, action: a.action, col: a.col, doc: a.doc, detail: a.detail });
  return data;
}

export function seedIfEmpty() {
  db.open();
  if (db.count('employees') > 0) return false;
  reseed();
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  db.open();
  if (process.argv.includes('--reset') || db.count('employees') === 0) {
    const data = reseed();
    console.log(`Demo data ready: ${data.employees.length} employees, ${data.candidates.length} candidates, ${data.responses.length} survey responses.`);
  } else console.log('Database already has data. Use --reset to regenerate it.');
  db.close();
}
