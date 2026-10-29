// Organizational diagnosis: four survey models with original item wording,
// scoring with anonymity thresholds, eNPS, and a rule-based diagnosis report.
import { mean, sd, round, pick } from './text.js';

const D = (key, name, desc, items, low, mid) => ({ key, name, desc, items: items.map((text, i) => ({ id: `${key}${i}`, text })), low, mid });

export const MODELS = {
  sixbox: {
    key: 'sixbox',
    name: ['韦斯伯德六盒模型', 'Weisbord Six-Box model'],
    desc: ['从目标、结构、关系、激励、领导、支持机制六个维度（外加变革态度）全面扫描组织运行状况。', 'Scans how the organization runs across purposes, structure, relationships, rewards, leadership and helpful mechanisms, plus attitude toward change.'],
    when: ['组织整体健康体检、业绩下滑原因排查、年度组织诊断', 'Annual health checks, or finding why performance is slipping'],
    source: ['Marvin Weisbord, 1976', 'Marvin Weisbord, 1976'],
    dims: [
      D('purposes', ['目标', 'Purposes'], ['方向是否清晰并被认同', 'Is the direction clear and shared?'],
        [['我清楚公司未来 1-3 年的目标与方向', 'I understand where the company is heading over the next 1-3 years'], ['我的工作目标与部门和公司目标紧密相关', 'My goals clearly connect to department and company goals'], ['公司的目标被管理层和员工普遍认同', 'Leaders and employees broadly agree with the company goals']],
        [['开展战略解码工作坊（如 OGSM、战略地图），逐级分解目标', 'Run strategy-cascading workshops (OGSM, strategy maps) to break goals down level by level'], ['管理层举办目标宣讲与开放问答', 'Hold leadership town halls with open Q&A on goals']],
        [['引入 OKR，提升目标对齐与透明度', 'Introduce OKRs to improve alignment and transparency']]),
      D('structure', ['结构', 'Structure'], ['分工与权责是否合理', 'Is work divided sensibly?'],
        [['部门之间的职责分工清晰，很少推诿', 'Responsibilities between departments are clear; little passing the buck'], ['现有组织架构支持我们高效完成工作', 'The current structure helps us work efficiently'], ['决策权限明确，我知道什么事情该找谁', 'Decision rights are clear; I know who decides what']],
        [['梳理部门职责与接口，用 RACI 明确分工', 'Map responsibilities and interfaces; clarify roles with RACI'], ['评估管理幅度与层级，消除职责重叠', 'Review spans and layers; remove overlaps']],
        [['制定授权矩阵，明确关键决策权限', 'Write a delegation matrix for key decisions']]),
      D('relationships', ['关系', 'Relationships'], ['人与人、部门与部门之间如何协作', 'How people and teams work together'],
        [['同事之间相互信任、乐于互助', 'Colleagues trust and help each other'], ['部门之间协作顺畅，冲突能被建设性地解决', 'Departments cooperate well and resolve conflict constructively'], ['我可以坦诚地表达不同意见', 'I can openly voice a different opinion']],
        [['开展团队信任重建，必要时引入外部引导师', 'Rebuild trust, with an external facilitator if needed'], ['建立跨部门例会与共同目标', 'Set up cross-team rhythms and shared goals']],
        [['开展建设性冲突与反馈文化培训', 'Train constructive conflict and feedback habits']]),
      D('rewards', ['激励', 'Rewards'], ['付出是否得到公平回报', 'Is effort rewarded fairly?'],
        [['我的薪酬与我的贡献相匹配', 'My pay matches my contribution'], ['绩效评价公平透明', 'Performance evaluation is fair and transparent'], ['好的表现能及时得到认可', 'Good work is recognized promptly']],
        [['开展薪酬市场对标与内部公平性审查', 'Benchmark pay and review internal equity'], ['优化绩效评价标准与校准流程', 'Improve performance criteria and calibration']],
        [['建立即时认可机制（同伴认可、表彰）', 'Add timely recognition (peer awards, shout-outs)']]),
      D('leadership', ['领导', 'Leadership'], ['管理者是否让其他盒子保持平衡', 'Do leaders keep the other boxes in balance?'],
        [['我的上级能为团队指明方向', 'My manager sets clear direction for the team'], ['管理者言行一致，值得信赖', 'Leaders do what they say and can be trusted'], ['上级关注并支持我的成长', 'My manager supports my growth']],
        [['开展管理者 360 度评估与领导力发展项目', 'Run 360s and a leadership development program'], ['建立管理者一对一沟通机制', 'Make regular one-to-ones standard']],
        [['开展教练式领导力培训', 'Train managers in coaching skills']]),
      D('mechanisms', ['支持机制', 'Helpful mechanisms'], ['流程、制度、工具是否帮得上忙', 'Do processes, policies and tools help?'],
        [['工作流程清晰高效，没有不必要的环节', 'Processes are clear and efficient, without unnecessary steps'], ['我能及时获得工作所需的信息和工具', 'I get the information and tools I need in time'], ['会议、制度和 IT 系统有助于而非阻碍工作', 'Meetings, policies and IT systems help rather than hinder work']],
        [['开展流程梳理与精简（价值流分析）', 'Map and simplify processes (value stream analysis)'], ['评估并改进关键业务系统与工具', 'Review and improve key systems and tools']],
        [['建立会议规范，减少低效会议', 'Set meeting norms; cut low-value meetings']]),
      D('change', ['变革态度', 'Attitude toward change'], ['组织能否适应变化', 'Can the organization adapt?'],
        [['公司能及时适应市场和环境的变化', 'The company adapts to market changes in time'], ['我愿意尝试新的工作方式', 'I am willing to try new ways of working'], ['变革的原因和计划会被充分沟通', 'The reasons and plans for change are well communicated']],
        [['用变革管理方法（如 ADKAR）讲清"为什么"，设立变革代言人', 'Use a change model (e.g. ADKAR): explain why, appoint change champions']],
        [['小范围试点，及时庆祝早期成果', 'Pilot small and celebrate early wins']]),
    ],
  },
  mck7s: {
    key: 'mck7s',
    name: ['麦肯锡 7S 模型', 'McKinsey 7S framework'],
    desc: ['检验战略、结构、制度（硬要素）与共同价值观、风格、人员、技能（软要素）是否协调一致。', 'Checks whether the hard elements (strategy, structure, systems) and soft elements (shared values, style, staff, skills) are aligned.'],
    when: ['战略转型、组织变革前后、并购整合时检视组织一致性', 'Before or after a strategy shift, reorganization or merger'],
    source: ['Peters & Waterman, McKinsey, 1980', 'Peters & Waterman, McKinsey, 1980'],
    dims: [
      D('strategy', ['战略', 'Strategy'], ['竞争方向与资源配置', 'Where to compete and how to allocate resources'],
        [['公司有清晰且有竞争力的战略', 'The company has a clear, competitive strategy'], ['战略能转化为具体的行动计划和资源配置', 'Strategy turns into concrete plans and resource allocation'], ['我理解战略对我工作的意义', 'I understand what the strategy means for my work']],
        [['召开战略共创会，明确取舍与优先级', 'Hold a strategy co-creation session to set trade-offs and priorities']], [['将战略重点纳入季度经营复盘', 'Add strategic priorities to quarterly business reviews']]),
      D('structure', ['结构', 'Structure'], ['组织架构与汇报关系', 'Organization design and reporting lines'],
        [['组织架构与战略方向相匹配', 'The structure fits the strategy'], ['汇报关系清晰', 'Reporting lines are clear'], ['跨部门协作有明确的机制', 'There are clear mechanisms for cross-team work']],
        [['基于战略重新评估组织设计（按客户/产品/区域）', 'Revisit organization design against the strategy (customer, product or region)']], [['建立跨部门项目制或虚拟团队', 'Use cross-functional project teams']]),
      D('systems', ['制度', 'Systems'], ['流程、绩效与信息系统', 'Processes, performance and information systems'],
        [['业务流程与管理制度运转有效', 'Business processes and management systems work well'], ['绩效管理与激励体系支持战略落地', 'Performance and reward systems support the strategy'], ['数据与信息系统能支撑决策', 'Data and IT systems support decisions']],
        [['让绩效指标与战略目标挂钩', 'Link performance metrics to strategic goals'], ['优化关键流程，打通数据', 'Streamline key processes and connect the data']], [['定期审视制度的有效性，废止过时制度', 'Review policies regularly; retire outdated ones']]),
      D('shared_values', ['共同价值观', 'Shared values'], ['使命、愿景与文化', 'Mission, vision and culture'],
        [['我认同公司的使命和价值观', 'I identify with the company mission and values'], ['公司的价值观体现在日常决策和行为中', 'Values show up in everyday decisions and behavior'], ['员工对"什么是重要的"有共识', 'People agree on what matters most']],
        [['提炼并重新诠释价值观，转化为可观察的行为', 'Restate values as observable behaviors'], ['把价值观纳入招聘、晋升与认可标准', 'Build values into hiring, promotion and recognition']], [['用真实故事传播价值观', 'Share real stories that bring values to life']]),
      D('style', ['风格', 'Style'], ['领导方式与管理文化', 'Leadership style and management culture'],
        [['管理层的领导风格能激发员工', 'Leadership style energizes people'], ['管理者愿意倾听并授权', 'Managers listen and delegate'], ['决策过程透明', 'Decision-making is transparent']],
        [['开展领导力评估与发展，明确领导力标准', 'Assess and develop leaders against a clear leadership standard']], [['推行决策透明化，如公开决策纪要', 'Make decisions visible, e.g. publish decision notes']]),
      D('staff', ['人员', 'Staff'], ['人才数量、结构与质量', 'Talent numbers, mix and quality'],
        [['关键岗位上有合适的人', 'The right people are in key roles'], ['公司重视人才的招聘、培养和保留', 'The company invests in hiring, developing and keeping talent'], ['人员编制与工作量匹配', 'Staffing matches the workload']],
        [['开展人才盘点，识别关键岗位风险', 'Run a talent review to find key-role risks'], ['建立继任计划与人才保留方案', 'Build succession and retention plans']], [['优化人员编制规划', 'Improve headcount planning']]),
      D('skills', ['技能', 'Skills'], ['组织能力与个人技能', 'Organizational capabilities and skills'],
        [['组织具备实现战略所需的核心能力', 'We have the core capabilities the strategy needs'], ['员工的技能能够跟上业务变化', "Employees' skills keep pace with the business"], ['好的经验和知识能在组织内沉淀和共享', 'Know-how is captured and shared']],
        [['识别关键能力差距，制定能力建设计划', 'Find critical capability gaps and plan how to build them'], ['建立知识管理与经验萃取机制', 'Set up knowledge management and expert know-how capture']], [['完善内部讲师与课程体系', 'Grow internal trainers and the course catalog']]),
    ],
  },
  engagement: {
    key: 'engagement',
    name: ['员工敬业度脉搏调研', 'Employee engagement pulse'],
    desc: ['按"基本需求 → 个人贡献 → 团队归属 → 成长发展"四个层次衡量敬业度，并计算员工净推荐值（eNPS）。', 'Measures engagement across four levels of needs (basics, contribution, belonging, growth) and computes employee Net Promoter Score (eNPS).'],
    when: ['季度/半年度敬业度追踪、离职率上升时', 'Quarterly or half-yearly tracking, or when turnover rises'],
    source: ['参考员工需求层次的通用敬业度框架（题目为本工具原创）', 'Built on the common hierarchy-of-needs engagement framework (original items)'],
    enps: true,
    dims: [
      D('basic', ['基本需求', 'Basics'], ['明确期望与资源', 'Clear expectations and resources'],
        [['我的岗位职责与评价标准是明确的', 'My responsibilities and success criteria are clear'], ['完成工作所需的资源、工具和信息基本到位', 'The resources, tools and information I need are in place'], ['我的工作量是可持续的', 'My workload is sustainable']],
        [['上级与每位员工逐一澄清职责与期望', 'Managers clarify roles and expectations one by one'], ['排查资源瓶颈与超负荷岗位', 'Find resource bottlenecks and overloaded roles']], [['定期复核岗位说明与目标', 'Review job descriptions and goals regularly']]),
      D('contribution', ['个人贡献', 'Contribution'], ['优势发挥与认可', 'Using strengths and being recognized'],
        [['我的能力在工作中得到充分发挥', 'My strengths are put to good use in my job'], ['最近一个月，我的贡献得到了认可', 'My contribution was recognized in the past month'], ['我的上级会倾听我的想法和困难', 'My manager listens to my ideas and concerns']],
        [['建立日常认可习惯（例会表扬、感谢卡）', 'Build everyday recognition habits'], ['推行定期一对一沟通', 'Introduce regular one-to-ones']], [['基于优势分配任务', 'Assign work based on strengths']]),
      D('belonging', ['团队归属', 'Belonging'], ['被重视与团队氛围', 'Being valued and team climate'],
        [['团队决策时会考虑我的建议', 'The team considers my input when deciding'], ['我为公司的使命和产品感到自豪', 'I am proud of our mission and products'], ['团队成员相互支持，共同对结果负责', 'Teammates support each other and share accountability']],
        [['在团队决策中引入共创与征求意见环节', 'Add co-creation and input steps to team decisions'], ['开展团队建设与使命故事分享', 'Team building and mission storytelling']], [['让员工了解自己的工作对客户的影响', 'Show people how their work affects customers']]),
      D('growth', ['成长发展', 'Growth'], ['反馈、发展与去留意愿', 'Feedback, development and intent to stay'],
        [['我定期获得关于自身表现的有用反馈', 'I get useful feedback on my performance regularly'], ['我看得到自己在公司的职业发展路径', 'I can see a career path for myself here'], ['我计划两年后仍在公司工作', 'I see myself working here in two years']],
        [['为每位员工制定个人发展计划（IDP）', 'Agree an IDP with every employee'], ['公开职级体系与晋升标准，开放内部转岗', 'Publish levels and promotion criteria; open internal moves']], [['增加轮岗与项目历练机会', 'Offer more rotations and stretch projects']]),
    ],
  },
  team: {
    key: 'team',
    name: ['团队协作效能诊断', 'Team effectiveness check'],
    desc: ['基于团队协作五大障碍模型：信任、冲突、承诺、责任、结果，找出团队协作的瓶颈。', 'Based on the five dysfunctions model (trust, conflict, commitment, accountability, results) to find what blocks teamwork.'],
    when: ['新团队组建、团队协作不畅、管理团队复盘', 'New teams, struggling teams, leadership team retrospectives'],
    source: ['Patrick Lencioni, 2002（题目为本工具原创）', 'Patrick Lencioni, 2002 (original items)'],
    dims: [
      D('trust', ['信任', 'Trust'], ['敢于示弱、彼此信任', 'Willing to be vulnerable'],
        [['团队成员会坦然承认自己的错误和不足', 'Team members admit mistakes and weaknesses openly'], ['成员之间愿意寻求和提供帮助', 'People readily ask for and offer help'], ['我们相信彼此的出发点是好的', 'We assume good intent in each other']],
        [['开展个人经历分享与行为风格测评（如 DISC），增进了解', 'Share personal histories and use a style profile (e.g. DISC) to build understanding'], ['团队负责人率先示弱，承认错误', 'The leader goes first in admitting mistakes']], [['定期开展团队复盘', 'Hold regular team retrospectives']]),
      D('conflict', ['建设性冲突', 'Healthy conflict'], ['就观点坦诚辩论', 'Candid debate about ideas'],
        [['会议中大家会就重要问题展开坦诚的辩论', 'We debate important issues candidly in meetings'], ['分歧聚焦于观点而非个人', 'Disagreements focus on ideas, not people'], ['问题不会被拖到会后私下抱怨', 'Issues are raised in the room, not complained about afterwards']],
        [['约定冲突规范，指定"唱反调"角色挖掘不同意见', 'Agree conflict norms; assign a devil\'s advocate'], ['会议中主动邀请沉默者发言', 'Actively invite quieter members to speak']], [['用数据与事实支撑讨论', 'Ground debates in data and facts']]),
      D('commitment', ['承诺', 'Commitment'], ['对决定达成共识并支持', 'Agreeing and backing decisions'],
        [['讨论结束后，团队对决定有清晰的共识', 'We leave discussions with clear agreement on decisions'], ['即使最初不同意，成员也会支持最终决定', 'People back decisions even if they first disagreed'], ['团队的优先级清晰一致', 'Team priorities are clear and shared']],
        [['会议结束前复述决定、负责人与时间', 'End meetings by restating decisions, owners and dates'], ['明确决策规则（谁拍板、何时拍板）', 'Agree decision rules: who decides and when']], [['定期对齐团队优先级', 'Re-align priorities regularly']]),
      D('accountability', ['相互负责', 'Accountability'], ['同伴间相互问责', 'Peers holding each other to account'],
        [['成员会直接指出同伴不符合标准的表现', 'Members call out peers who fall short of standards'], ['每个人都清楚自己承诺交付的内容', 'Everyone knows what they committed to deliver'], ['团队定期检查承诺的完成情况', 'We regularly review progress on commitments']],
        [['公开团队目标与个人承诺看板', 'Make goals and commitments visible on a shared board'], ['建立定期进展复盘机制', 'Hold regular progress reviews']], [['开展同伴反馈练习', 'Practice peer feedback']]),
      D('results', ['关注结果', 'Results'], ['集体结果优先于个人', 'Collective results over individual ones'],
        [['团队目标优先于个人或部门利益', 'Team goals come before individual or department interests'], ['我们会根据结果及时调整做法', 'We adjust quickly based on results'], ['团队持续达成既定目标', 'The team consistently meets its goals']],
        [['设定少而清晰的团队共同目标并公开计分', 'Set a few clear shared goals and keep a visible scoreboard'], ['将团队结果纳入个人激励', 'Tie part of individual rewards to team results']], [['庆祝团队成果', 'Celebrate team wins']]),
    ],
  },
};

export const MIN_GROUP = 5; // anonymity threshold for department breakdowns

export const BANDS = {
  healthy: { min: 4, name: ['健康', 'Healthy'], tone: 'ok' },
  watch: { min: 3, name: ['需关注', 'Watch'], tone: 'warn' },
  risk: { min: 0, name: ['风险', 'At risk'], tone: 'danger' },
};
export const bandOf = (score) => (score >= 4 ? 'healthy' : score >= 3 ? 'watch' : 'risk');

export function enps(values) {
  const xs = values.filter((v) => Number.isInteger(v));
  if (!xs.length) return null;
  const promoters = xs.filter((v) => v >= 9).length;
  const detractors = xs.filter((v) => v <= 6).length;
  return { n: xs.length, promoters, passives: xs.length - promoters - detractors, detractors, score: Math.round(((promoters - detractors) / xs.length) * 100) };
}

export function scoreSurvey(modelKey, responses = []) {
  const model = MODELS[modelKey];
  const dims = model.dims.map((d) => {
    const perPerson = responses.map((r) => {
      const xs = d.items.map((it) => r.answers?.[it.id]).filter((v) => v >= 1 && v <= 5);
      return xs.length ? mean(xs) : null;
    }).filter((v) => v != null);
    const items = d.items.map((it) => {
      const xs = responses.map((r) => r.answers?.[it.id]).filter((v) => v >= 1 && v <= 5);
      return { id: it.id, mean: xs.length ? round(mean(xs), 2) : null, n: xs.length, fav: xs.length ? round(xs.filter((v) => v >= 4).length / xs.length, 3) : null };
    });
    const m = perPerson.length ? round(mean(perPerson), 2) : null;
    return { key: d.key, mean: m, sd: round(sd(perPerson), 2), n: perPerson.length, band: m == null ? null : bandOf(m), items };
  });
  const scored = dims.filter((d) => d.mean != null);
  const overall = scored.length ? round(mean(scored.map((d) => d.mean)), 2) : null;
  const ranked = [...scored].sort((a, b) => b.mean - a.mean);

  const byDept = {};
  for (const r of responses) if (r.deptId) (byDept[r.deptId] ||= []).push(r);
  const depts = Object.entries(byDept).map(([deptId, rs]) => {
    if (rs.length < MIN_GROUP) return { deptId, n: rs.length, suppressed: true };
    const sub = scoreSurvey.inner(model, rs);
    return { deptId, n: rs.length, suppressed: false, dims: sub };
  });

  return {
    model: modelKey,
    n: responses.length,
    overall,
    band: overall == null ? null : bandOf(overall),
    dims,
    strengths: ranked.slice(0, 2).map((d) => d.key),
    issues: ranked.slice(-2).reverse().filter((d) => d.mean < 4).map((d) => d.key),
    divergent: scored.filter((d) => d.sd > 1).map((d) => d.key),
    enps: model.enps ? enps(responses.map((r) => r.enps)) : null,
    depts,
    comments: responses.map((r) => r.comment).filter(Boolean),
  };
}
scoreSurvey.inner = (model, rs) => Object.fromEntries(model.dims.map((d) => {
  const per = rs.map((r) => {
    const xs = d.items.map((it) => r.answers?.[it.id]).filter((v) => v >= 1 && v <= 5);
    return xs.length ? mean(xs) : null;
  }).filter((v) => v != null);
  return [d.key, per.length ? round(mean(per), 2) : null];
}));

// Rule-based report in Markdown, written from the scored result.
export function diagnosisReport(result, lang = 'zh', { title, deptName } = {}) {
  const L = (zh, en) => (lang === 'en' ? en : zh);
  const model = MODELS[result.model];
  const dim = Object.fromEntries(model.dims.map((d) => [d.key, d]));
  const score = Object.fromEntries(result.dims.map((d) => [d.key, d]));
  const name = (k) => pick(dim[k].name, lang);
  const out = [];
  out.push(`## ${L('诊断摘要', 'Summary')}`);
  out.push(L(
    `本次「${title || pick(model.name, lang)}」共回收 ${result.n} 份有效问卷${deptName ? `（范围：${deptName}）` : ''}，整体得分 **${result.overall ?? '—'} / 5**，处于「${result.band ? pick(BANDS[result.band].name, lang) : '—'}」区间。`,
    `"${title || pick(model.name, lang)}" received ${result.n} valid responses${deptName ? ` (scope: ${deptName})` : ''}. The overall score is **${result.overall ?? '—'} / 5**, in the "${result.band ? pick(BANDS[result.band].name, lang) : '—'}" band.`,
  ));
  if (result.enps) out.push(L(`员工净推荐值 eNPS 为 **${result.enps.score}**（推荐者 ${result.enps.promoters} 人，贬损者 ${result.enps.detractors} 人）。`, `eNPS is **${result.enps.score}** (${result.enps.promoters} promoters, ${result.enps.detractors} detractors).`));
  out.push('');
  if (result.strengths.length) {
    out.push(`## ${L('优势', 'Strengths')}`);
    for (const k of result.strengths) out.push(`- **${name(k)}**（${score[k].mean}）：${pick(dim[k].desc, lang)}`);
    out.push('');
  }
  if (result.issues.length) {
    out.push(`## ${L('优先改进项', 'Priority issues')}`);
    for (const k of result.issues) {
      const s = score[k];
      const low = [...s.items].filter((i) => i.mean != null).sort((a, b) => a.mean - b.mean)[0];
      const item = low ? dim[k].items.find((i) => i.id === low.id) : null;
      out.push(`- **${name(k)}**（${s.mean}，${pick(BANDS[s.band].name, lang)}）${item ? L(`，最低题项：「${pick(item.text, lang)}」${low.mean}`, `; lowest item: "${pick(item.text, lang)}" ${low.mean}`) : ''}`);
    }
    out.push('');
    out.push(`## ${L('建议措施', 'Recommended actions')}`);
    for (const k of result.issues) {
      const s = score[k];
      const list = s.band === 'risk' ? [...dim[k].low, ...dim[k].mid] : dim[k].mid.concat(dim[k].low.slice(0, 1));
      out.push(`**${name(k)}**`);
      for (const a of list) out.push(`- ${pick(a, lang)}`);
    }
    out.push('');
  }
  if (result.divergent.length) {
    out.push(`## ${L('需要深入了解', 'Dig deeper')}`);
    out.push(L(
      `以下维度的回答分歧较大（标准差 > 1），说明不同群体感受差异明显，建议通过焦点小组访谈进一步了解：${result.divergent.map(name).join('、')}。`,
      `Answers vary widely (standard deviation > 1) on: ${result.divergent.map(name).join(', ')}. Different groups experience this differently; follow up with focus groups.`,
    ));
    out.push('');
  }
  const hidden = result.depts.filter((d) => d.suppressed).length;
  if (hidden) out.push(L(`*为保护匿名性，${hidden} 个回复数少于 ${MIN_GROUP} 份的部门未单独展示。*`, `*To protect anonymity, ${hidden} departments with fewer than ${MIN_GROUP} responses are not shown separately.*`));
  return out.join('\n');
}
