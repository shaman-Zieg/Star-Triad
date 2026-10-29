// Skill dictionary with Chinese/English aliases, used to read resumes and JDs.
// An alias starting with "=" is matched case-sensitively (e.g. "Go").

export const SKILL_FAMILIES = {
  tech: ['技术研发', 'Engineering'],
  data: ['数据与算法', 'Data & AI'],
  product: ['产品', 'Product'],
  design: ['设计', 'Design'],
  marketing: ['市场营销', 'Marketing'],
  sales: ['销售与商务', 'Sales & BD'],
  hr: ['人力资源', 'Human resources'],
  finance: ['财务', 'Finance'],
  ops: ['运营与项目', 'Operations & projects'],
  general: ['通用', 'General'],
};

const S = (key, family, label, aliases) => ({ key, family, label, aliases });

export const SKILLS = [
  // Engineering
  S('javascript', 'tech', ['JavaScript', 'JavaScript'], ['JavaScript', 'ES6', '=JS']),
  S('typescript', 'tech', ['TypeScript', 'TypeScript'], ['TypeScript', '=TS']),
  S('react', 'tech', ['React', 'React'], ['React', 'React.js', 'ReactJS', 'Next.js']),
  S('vue', 'tech', ['Vue', 'Vue'], ['Vue', 'Vue.js', 'Vue3', 'Vue2', 'Nuxt']),
  S('angular', 'tech', ['Angular', 'Angular'], ['Angular']),
  S('frontend_eng', 'tech', ['前端工程化', 'Frontend tooling'], ['Webpack', 'Vite', '前端工程化', 'Rollup', 'Babel']),
  S('html_css', 'tech', ['HTML/CSS', 'HTML/CSS'], ['HTML5', 'CSS3', 'HTML', 'CSS', 'Sass', 'Less', 'Tailwind']),
  S('nodejs', 'tech', ['Node.js', 'Node.js'], ['Node.js', 'NodeJS', 'Node', 'Express', 'Koa', 'NestJS']),
  S('java', 'tech', ['Java', 'Java'], ['Java']),
  S('spring', 'tech', ['Spring', 'Spring'], ['Spring Boot', 'SpringBoot', 'Spring Cloud', 'Spring', 'MyBatis']),
  S('python', 'tech', ['Python', 'Python'], ['Python', 'Django', 'Flask', 'FastAPI']),
  S('go', 'tech', ['Go', 'Go'], ['Golang', 'Go语言', '=Go']),
  S('cpp', 'tech', ['C/C++', 'C/C++'], ['C++', '=C语言']),
  S('sql', 'tech', ['SQL', 'SQL'], ['SQL']),
  S('mysql', 'tech', ['MySQL', 'MySQL'], ['MySQL', 'MariaDB']),
  S('postgresql', 'tech', ['PostgreSQL', 'PostgreSQL'], ['PostgreSQL', 'Postgres']),
  S('redis', 'tech', ['Redis', 'Redis'], ['Redis']),
  S('mq', 'tech', ['消息队列', 'Message queues'], ['Kafka', 'RabbitMQ', 'RocketMQ', '消息队列']),
  S('microservices', 'tech', ['微服务', 'Microservices'], ['微服务', 'microservice', 'microservices', 'Dubbo', 'gRPC']),
  S('docker', 'tech', ['Docker', 'Docker'], ['Docker', '容器化']),
  S('k8s', 'tech', ['Kubernetes', 'Kubernetes'], ['Kubernetes', 'K8s']),
  S('linux', 'tech', ['Linux', 'Linux'], ['Linux', 'Shell']),
  S('cloud', 'tech', ['云平台', 'Cloud platforms'], ['AWS', 'Azure', '阿里云', '腾讯云', '华为云', 'GCP', '云计算']),
  S('devops', 'tech', ['CI/CD', 'CI/CD'], ['CI/CD', 'Jenkins', 'DevOps', 'GitLab CI', 'GitHub Actions']),
  S('testing', 'tech', ['自动化测试', 'Test automation'], ['自动化测试', '单元测试', 'unit test', 'unit testing', 'Jest', 'Selenium', 'Cypress', 'JUnit']),
  S('mobile', 'tech', ['移动端开发', 'Mobile'], ['iOS', 'Android', '小程序', 'mini program', 'React Native', 'Flutter', 'Swift', 'Kotlin']),
  S('performance', 'tech', ['性能优化', 'Performance tuning'], ['性能优化', 'performance optimization', '高并发', 'high concurrency']),
  // Data & AI
  S('data_analysis', 'data', ['数据分析', 'Data analysis'], ['数据分析', 'data analysis', 'data analytics', '数据挖掘', 'data mining', '经营分析']),
  S('statistics', 'data', ['统计学', 'Statistics'], ['统计学', '统计分析', 'statistics', 'statistical', '回归分析', 'regression']),
  S('ab_test', 'data', ['A/B 实验', 'A/B testing'], ['A/B测试', 'A/B test', 'AB测试', 'A/B实验', '实验设计']),
  S('ml', 'data', ['机器学习', 'Machine learning'], ['机器学习', 'machine learning', 'XGBoost', 'scikit-learn', 'sklearn']),
  S('dl', 'data', ['深度学习', 'Deep learning'], ['深度学习', 'deep learning', 'PyTorch', 'TensorFlow']),
  S('llm', 'data', ['大模型 / NLP', 'LLM / NLP'], ['大模型', 'LLM', 'NLP', '自然语言处理', 'RAG', 'Prompt']),
  S('bigdata', 'data', ['大数据', 'Big data'], ['Spark', 'Hadoop', 'Hive', 'Flink', '大数据', '数据仓库', 'data warehouse']),
  S('bi', 'data', ['BI 可视化', 'BI & dashboards'], ['Tableau', 'Power BI', 'PowerBI', 'FineBI', '帆软', 'BI报表', 'Looker', '数据可视化']),
  S('excel', 'data', ['Excel', 'Excel'], ['Excel', 'VBA', '透视表', 'pivot table']),
  S('pandas', 'data', ['Pandas', 'Pandas'], ['Pandas', 'NumPy']),
  // Product & design
  S('product_design', 'product', ['产品设计', 'Product design'], ['产品设计', 'product design', '需求分析', 'requirements analysis', '产品方案']),
  S('prd', 'product', ['PRD 撰写', 'PRD writing'], ['PRD', '产品需求文档']),
  S('user_research', 'product', ['用户研究', 'User research'], ['用户研究', 'user research', '用户访谈', '可用性测试', 'usability']),
  S('prototyping', 'product', ['原型工具', 'Prototyping'], ['Axure', 'Figma', '原型设计', 'prototyping', '墨刀', 'Sketch']),
  S('product_strategy', 'product', ['产品规划', 'Product strategy'], ['产品规划', 'roadmap', '产品战略', 'product strategy', '商业模式']),
  S('saas', 'product', ['B 端 / SaaS', 'B2B / SaaS'], ['SaaS', 'B端', 'ToB', 'B2B产品']),
  S('ui_design', 'design', ['UI / 视觉设计', 'UI & visual design'], ['UI设计', 'UI design', '视觉设计', 'visual design', 'Photoshop']),
  S('ux', 'design', ['交互 / 体验设计', 'UX design'], ['交互设计', 'interaction design', '用户体验', 'UX']),
  // Marketing
  S('brand', 'marketing', ['品牌营销', 'Brand marketing'], ['品牌', 'brand', '品牌策划', 'branding']),
  S('content', 'marketing', ['内容营销', 'Content marketing'], ['内容营销', 'content marketing', '新媒体', '文案', 'copywriting']),
  S('social', 'marketing', ['社交媒体', 'Social media'], ['社交媒体', 'social media', '小红书', '抖音', '微博', '公众号', 'LinkedIn']),
  S('paid_ads', 'marketing', ['投放与 SEO/SEM', 'Paid media & SEO/SEM'], ['SEO', 'SEM', '信息流', '广告投放', 'paid ads', 'Google Ads', '巨量引擎']),
  S('growth', 'marketing', ['用户增长', 'Growth'], ['用户增长', 'growth hacking', '增长黑客', '拉新', '留存', 'retention']),
  S('event', 'marketing', ['市场活动', 'Events'], ['活动策划', '市场活动', '展会', 'event marketing', 'event planning']),
  S('market_research', 'marketing', ['市场调研', 'Market research'], ['市场调研', 'market research', '竞品分析', 'competitive analysis']),
  // Sales & BD
  S('b2b_sales', 'sales', ['大客户销售', 'Key account sales'], ['大客户', 'key account', 'KA销售', '解决方案销售', 'solution selling', 'B2B销售', 'enterprise sales']),
  S('crm', 'sales', ['CRM', 'CRM'], ['CRM', 'Salesforce', '销售易', '纷享销客']),
  S('negotiation', 'sales', ['商务谈判', 'Negotiation'], ['商务谈判', '谈判', 'negotiation']),
  S('channel', 'sales', ['渠道管理', 'Channel management'], ['渠道', 'channel', '代理商', '合作伙伴', 'partner management']),
  S('bd', 'sales', ['商务拓展', 'Business development'], ['商务拓展', 'business development', '=BD']),
  S('bidding', 'sales', ['招投标', 'Bids & tenders'], ['招投标', '投标', 'bidding', '=RFP']),
  // HR
  S('recruiting', 'hr', ['招聘', 'Recruiting'], ['招聘', 'recruiting', 'recruitment', '人才获取', 'talent acquisition', '猎头']),
  S('hrbp', 'hr', ['HRBP', 'HRBP'], ['HRBP', 'HR业务伙伴', 'HR business partner']),
  S('compensation', 'hr', ['薪酬福利', 'Compensation & benefits'], ['薪酬', 'compensation', 'C&B', '薪酬福利', '福利']),
  S('performance_mgmt', 'hr', ['绩效管理', 'Performance management'], ['绩效管理', 'performance management', 'OKR', 'KPI', '绩效考核']),
  S('od', 'hr', ['组织发展', 'Organization development'], ['组织发展', '组织诊断', 'organization development', '组织设计', '=OD']),
  S('ld', 'hr', ['培训与人才发展', 'L&D'], ['培训', '学习发展', 'L&D', 'training', '人才发展', '人才盘点', 'talent review']),
  S('employee_relations', 'hr', ['员工关系 / 劳动法', 'Employee relations & labor law'], ['员工关系', 'employee relations', '劳动法', 'labor law', '劳动争议', '劳动合同']),
  S('hris', 'hr', ['HR 系统', 'HRIS'], ['HRIS', 'SuccessFactors', 'Workday', '北森', 'Moka', '人事系统']),
  // Finance
  S('fin_analysis', 'finance', ['财务分析', 'Financial analysis'], ['财务分析', 'financial analysis', 'FP&A', '财务建模', 'financial modeling']),
  S('budget', 'finance', ['预算与预测', 'Budgeting & forecasting'], ['预算', 'budgeting', 'budget', '滚动预测', 'forecast']),
  S('accounting', 'finance', ['会计核算', 'Accounting'], ['会计', 'accounting', '总账', '核算', '财务报表', '月结']),
  S('audit', 'finance', ['审计与内控', 'Audit & controls'], ['审计', 'audit', '内控', 'internal control', 'SOX']),
  S('tax', 'finance', ['税务', 'Tax'], ['税务', '纳税筹划', 'tax']),
  S('gaap', 'finance', ['会计准则', 'Accounting standards'], ['IFRS', 'US GAAP', 'GAAP', '会计准则', 'CAS']),
  S('erp', 'finance', ['ERP 系统', 'ERP'], ['SAP', 'Oracle EBS', '用友', '金蝶', 'ERP']),
  // Operations & projects
  S('project_mgmt', 'ops', ['项目管理', 'Project management'], ['项目管理', 'project management', 'PMP', 'PMO']),
  S('agile', 'ops', ['敏捷 / Scrum', 'Agile / Scrum'], ['敏捷', 'Agile', 'Scrum', 'Jira']),
  S('operations', 'ops', ['运营', 'Operations'], ['用户运营', '内容运营', '活动运营', '运营策略', 'operations']),
  S('customer_success', 'ops', ['客户成功', 'Customer success'], ['客户成功', 'customer success', '续约', 'renewal', '客户满意度']),
  S('supply_chain', 'ops', ['供应链', 'Supply chain'], ['供应链', 'supply chain', '采购', 'procurement']),
  S('lean', 'ops', ['精益 / 六西格玛', 'Lean / Six Sigma'], ['精益', 'Lean', '六西格玛', 'Six Sigma']),
  // General
  S('english', 'general', ['英语', 'English'], ['英语', 'English', 'CET-6', 'CET6', '雅思', 'IELTS', '托福', 'TOEFL', '英文']),
  S('japanese', 'general', ['日语', 'Japanese'], ['日语', 'Japanese', 'JLPT']),
  S('team_mgmt', 'general', ['团队管理', 'Team management'], ['团队管理', 'team management', '带领团队', '管理团队', 'led a team', 'people management', '团队负责人']),
  S('mentoring', 'general', ['带教辅导', 'Mentoring & coaching'], ['带教', 'mentoring', '辅导新人', 'coaching']),
];

export const skillByKey = Object.fromEntries(SKILLS.map((s) => [s.key, s]));

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasLatin = (s) => /[A-Za-z]/.test(s);

// Pre-compile a matcher per skill. Latin aliases need word boundaries so that
// "Java" does not match inside "JavaScript"; CJK aliases match as substrings.
const MATCHERS = SKILLS.map((s) => {
  const parts = [];
  const exact = [];
  for (const raw of s.aliases) {
    const cs = raw.startsWith('=');
    const alias = cs ? raw.slice(1) : raw;
    if (!hasLatin(alias)) parts.push(escapeRe(alias));
    else (cs ? exact : parts).push(`(?<![A-Za-z0-9])${escapeRe(alias)}(?![A-Za-z0-9+#])`);
  }
  return {
    key: s.key,
    re: parts.length ? new RegExp(parts.join('|'), 'i') : null,
    reCs: exact.length ? new RegExp(exact.join('|')) : null,
  };
});

// Skills that imply another one (TypeScript and React developers write JavaScript, etc.).
const IMPLIES = {
  typescript: ['javascript'], react: ['javascript'], vue: ['javascript'], angular: ['javascript'], nodejs: ['javascript'],
  spring: ['java'], mysql: ['sql'], postgresql: ['sql'], pandas: ['python'], k8s: ['docker'],
};

export function extractSkills(text) {
  const t = String(text || '');
  const found = new Set(MATCHERS.filter((m) => (m.re && m.re.test(t)) || (m.reCs && m.reCs.test(t))).map((m) => m.key));
  for (const k of [...found]) for (const implied of IMPLIES[k] || []) found.add(implied);
  return SKILLS.map((s) => s.key).filter((k) => found.has(k));
}

export const skillLabel = (key, lang = 'zh') => {
  const s = skillByKey[key];
  if (!s) return key;
  return lang === 'en' ? s.label[1] : s.label[0];
};
