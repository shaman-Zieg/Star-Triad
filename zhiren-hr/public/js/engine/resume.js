// Resume reading and candidate-position matching.
// Deliberately transparent: every point of the score can be traced to evidence,
// and characteristics unrelated to the job (age, gender, school prestige) never score.
import { extractSkills, skillLabel } from './skills.js';
import { isManagerLevel } from './competency.js';
import { pick, round, clamp } from './text.js';

export const EDUCATION = [
  { level: 0, name: ['未识别', 'Not found'] },
  { level: 1, name: ['高中/中专', 'High school'] },
  { level: 2, name: ['大专', 'Associate'] },
  { level: 3, name: ['本科', "Bachelor's"] },
  { level: 4, name: ['硕士', "Master's"] },
  { level: 5, name: ['博士', 'Doctorate'] },
];

const EDU_PATTERNS = [
  [5, /博士|ph\.?\s?d|doctor(ate)?\b/i],
  [4, /硕士|研究生|master|\bmba\b|\bm\.?s\.?c?\b|\bmsc\b|\bm\.?eng\b/i],
  [3, /本科|学士|bachelor|\bb\.?s\.?c?\b|\bb\.?a\.?\b|\bb\.?eng\b|统招/i],
  [2, /大专|专科|associate degree|college diploma|高职/i],
  [1, /高中|中专|技校|high school/i],
];

const CERTS = [
  'PMP', 'CPA', 'CFA', 'ACCA', 'CMA', 'FRM', 'CIA', 'CISA', 'CISSP', 'SHRM-CP', 'SHRM', 'PHR', 'GPHR',
  '注册会计师', '税务师', '人力资源管理师', '企业人力资源管理师', '法律职业资格', '软考', '系统架构设计师',
  'AWS Certified', 'Azure Certified', 'CKA', 'PMI-ACP', 'CSM', 'Six Sigma Green Belt', '六西格玛绿带', '六西格玛黑带',
];

const TOP_SCHOOLS = [
  '清华', '北京大学', '北大', '复旦', '上海交通大学', '上海交大', '浙江大学', '中国科学技术大学', '中科大', '南京大学',
  '武汉大学', '华中科技大学', '中山大学', '哈尔滨工业大学', '西安交通大学', '同济大学', '北京航空航天大学', '人民大学',
  'Tsinghua', 'Peking University', 'Fudan', 'Zhejiang University', 'MIT', 'Stanford', 'Harvard', 'Cambridge', 'Oxford', 'Berkeley',
];

const SCHOOL_LINE = /大学|学院|学校|university|college|school|institute|本科|硕士|博士|bachelor|master|ph\.?d/i;

// Full-width digits/punctuation -> ASCII so the date and number patterns work on Chinese resumes.
export function normalize(text) {
  return String(text || '')
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .replace(/[–—―−~～]/g, '-')
    .replace(/\r\n?/g, '\n');
}

const DATE_RANGE = /((?:19|20)\d{2})\s*(?:[年./-]\s*(\d{1,2})\s*月?)?\s*(?:-|至|到|to|until)\s*(?:((?:19|20)\d{2})\s*(?:[年./-]\s*(\d{1,2})\s*月?)?|(至今|今|现在|目前|present|now|current))/gi;

export function extractRanges(text, today = new Date()) {
  const nowM = today.getFullYear() * 12 + today.getMonth();
  const out = [];
  for (const line of normalize(text).split('\n')) {
    DATE_RANGE.lastIndex = 0;
    let m;
    while ((m = DATE_RANGE.exec(line))) {
      const start = Number(m[1]) * 12 + (m[2] ? clamp(Number(m[2]), 1, 12) - 1 : 0);
      const end = m[5] ? nowM : Number(m[3]) * 12 + (m[4] ? clamp(Number(m[4]), 1, 12) - 1 : 11);
      if (end < start || end > nowM + 1 || nowM - start > 50 * 12) continue;
      out.push({ start, end: Math.min(end, nowM), education: SCHOOL_LINE.test(line), line: line.trim().slice(0, 80) });
    }
  }
  return out;
}

// Merges overlapping periods so parallel roles are not double counted.
function mergedMonths(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let total = 0;
  let cur = null;
  for (const r of sorted) {
    if (!cur || r.start > cur.end + 1) {
      if (cur) total += cur.end - cur.start + 1;
      cur = { ...r };
    } else cur.end = Math.max(cur.end, r.end);
  }
  if (cur) total += cur.end - cur.start + 1;
  return total;
}

function longestGap(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let gap = 0;
  let end = null;
  for (const r of sorted) {
    if (end != null && r.start - end - 1 > gap) gap = r.start - end - 1;
    end = end == null ? r.end : Math.max(end, r.end);
  }
  return gap;
}

export function parseResume(text, today = new Date()) {
  const t = normalize(text);
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const skills = extractSkills(t);

  let education = 0;
  for (const [level, re] of EDU_PATTERNS) {
    if (re.test(t)) {
      education = level;
      break;
    }
  }
  const topSchool = TOP_SCHOOLS.find((s) => t.toLowerCase().includes(s.toLowerCase())) || null;

  const ranges = extractRanges(t, today);
  const work = ranges.filter((r) => !r.education);
  const workMonths = mergedMonths(work);
  let explicit = 0;
  for (const m of t.matchAll(/(\d{1,2}(?:\.\d)?)\s*\+?\s*年(?:以上)?\s*(?:的)?\s*[一-龥A-Za-z/]{0,8}经验/g)) explicit = Math.max(explicit, Number(m[1]));
  for (const m of t.matchAll(/(\d{1,2}(?:\.\d)?)\s*\+?\s*years?(?:'s)?\s+(?:of\s+)?(?:[a-z/-]+\s+){0,3}experience/gi)) explicit = Math.max(explicit, Number(m[1]));
  const years = round(Math.max(explicit, workMonths / 12), 1);
  const jobs = work.length;
  const avgTenure = jobs ? round(workMonths / 12 / jobs, 1) : null;
  const gapMonths = longestGap(work);

  const certs = CERTS.filter((c) => t.toLowerCase().includes(c.toLowerCase()))
    .filter((c, i, arr) => !arr.some((o, j) => j !== i && o.length > c.length && o.toLowerCase().includes(c.toLowerCase())));
  const managementMatch = t.match(/(?:带领|管理|负责)\s*(\d{1,3})\s*人(?:的)?(?:团队)?|team of (\d{1,3})|managed (\d{1,3}) (?:people|engineers|staff)/i);
  const management = Boolean(managementMatch) || /团队管理|带团队|团队负责人|team lead|people manager|managed a team|led a team/i.test(t);
  const teamSize = managementMatch ? Number(managementMatch[1] || managementMatch[2] || managementMatch[3]) : null;

  // Achievement lines with numbers (%, growth, revenue...) are strong evidence.
  const hasRange = new RegExp(DATE_RANGE.source, 'i');
  const achievements = lines.filter((l) => /\d+(\.\d+)?\s*(%|倍|万|亿|k\b|m\b|million)|提升|增长|降低|节省|increased|reduced|grew|saved/i.test(l) && /\d/.test(l) && l.length < 160 && !hasRange.test(l)).slice(0, 4);

  const email = (t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [null])[0];
  const phoneRaw = (t.match(/(?<!\d)1[3-9]\d[\d*]{4}\d{4}(?!\d)/) || [null])[0];
  const phone = phoneRaw ? `${phoneRaw.slice(0, 3)}****${phoneRaw.slice(-4)}` : null;
  const name = lines[0] && lines[0].length <= 20 && !/[@\d]/.test(lines[0]) ? lines[0].replace(/^(姓名|name)\s*[:：]\s*/i, '') : null;

  return { name, email, phone, skills, education, topSchool, years, explicitYears: explicit, workMonths, jobs, avgTenure, gapMonths, certs, management, teamSize, achievements };
}

export const TIERS = {
  strong: { min: 80, name: ['强烈推荐', 'Strong match'], tone: 'ok', next: ['安排面试', 'Schedule interviews'] },
  good: { min: 65, name: ['推荐', 'Good match'], tone: 'info', next: ['电话初筛后面试', 'Phone screen, then interview'] },
  possible: { min: 50, name: ['待定', 'Possible'], tone: 'warn', next: ['与用人经理确认后决定', 'Check with the hiring manager'] },
  no: { min: 0, name: ['不匹配', 'Not a fit'], tone: 'danger', next: ['礼貌婉拒并入人才库', 'Decline politely; keep in talent pool'] },
};
export const tierOf = (score) => Object.entries(TIERS).find(([, t]) => score >= t.min)[0];

export const WEIGHTS = { required: 45, nice: 10, experience: 20, education: 15, bonus: 10 };

export function matchCandidate(parsed, position = {}, lang = 'zh') {
  const L = (zh, en) => (lang === 'en' ? en : zh);
  const req = position.skills || [];
  const nice = position.niceSkills || [];
  const has = new Set(parsed.skills);
  const matched = req.filter((k) => has.has(k));
  const missing = req.filter((k) => !has.has(k));
  const niceMatched = nice.filter((k) => has.has(k));

  const reqScore = req.length ? matched.length / req.length : 1;
  const niceScore = nice.length ? niceMatched.length / nice.length : 1;

  const minYears = Number(position.minYears) || 0;
  const maxYears = Number(position.maxYears) || 0;
  let expScore = minYears ? clamp(parsed.years / minYears, 0, 1) : 1;
  const overqualified = maxYears && parsed.years > maxYears + 5;
  if (overqualified) expScore = 0.8;

  const minEdu = Number(position.education) || 0;
  let eduScore = 1;
  if (minEdu && parsed.education === 0) eduScore = 0.5;
  else if (minEdu && parsed.education < minEdu) eduScore = parsed.education === minEdu - 1 ? 0.5 : 0.2;

  let bonus = 0;
  if (parsed.certs.length) bonus += 0.3;
  if (parsed.achievements.length) bonus += 0.3;
  if (isManagerLevel(position.level)) bonus += parsed.management ? 0.4 : 0;
  else if (parsed.avgTenure != null && parsed.avgTenure >= 2) bonus += 0.4;
  bonus = Math.min(1, bonus);

  const parts = {
    required: reqScore * WEIGHTS.required,
    nice: niceScore * WEIGHTS.nice,
    experience: expScore * WEIGHTS.experience,
    education: eduScore * WEIGHTS.education,
    bonus: bonus * WEIGHTS.bonus,
  };
  const score = Math.round(Object.values(parts).reduce((a, b) => a + b, 0));
  const tier = tierOf(score);

  const highlights = [];
  if (matched.length) highlights.push(L(`具备核心技能：${matched.map((k) => skillLabel(k, lang)).join('、')}`, `Has core skills: ${matched.map((k) => skillLabel(k, lang)).join(', ')}`));
  if (parsed.years >= minYears && parsed.years) highlights.push(L(`约 ${parsed.years} 年相关工作经验`, `About ${parsed.years} years of experience`));
  if (parsed.certs.length) highlights.push(L(`持有证书：${parsed.certs.join('、')}`, `Certifications: ${parsed.certs.join(', ')}`));
  if (parsed.management) highlights.push(L(`有团队管理经验${parsed.teamSize ? `（约 ${parsed.teamSize} 人）` : ''}`, `People management experience${parsed.teamSize ? ` (team of ~${parsed.teamSize})` : ''}`));
  if (parsed.achievements.length) highlights.push(L('简历中有量化的业绩成果', 'Resume shows quantified results'));

  const risks = [];
  if (missing.length) risks.push({ level: reqScore < 0.6 ? 'high' : 'medium', text: L(`缺少要求技能：${missing.map((k) => skillLabel(k, lang)).join('、')}`, `Missing required skills: ${missing.map((k) => skillLabel(k, lang)).join(', ')}`) });
  if (minYears && parsed.years < minYears) risks.push({ level: parsed.years < minYears * 0.6 ? 'high' : 'medium', text: L(`经验约 ${parsed.years} 年，低于要求的 ${minYears} 年`, `About ${parsed.years} years, below the ${minYears} required`) });
  if (overqualified) risks.push({ level: 'medium', text: L('经验远超岗位要求，需确认动机与薪酬预期', 'Far more experienced than the role needs; check motivation and pay expectations') });
  if (minEdu && parsed.education && parsed.education < minEdu) risks.push({ level: 'medium', text: L(`学历低于要求（${pick(EDUCATION[minEdu].name, lang)}）`, `Education below requirement (${pick(EDUCATION[minEdu].name, lang)})`) });
  if (minEdu && !parsed.education) risks.push({ level: 'low', text: L('未识别到学历信息，需人工确认', 'No education found; confirm manually') });
  if (parsed.jobs >= 3 && parsed.avgTenure != null && parsed.avgTenure < 1.5) risks.push({ level: 'medium', text: L(`跳槽较频繁：${parsed.jobs} 段经历，平均 ${parsed.avgTenure} 年`, `Frequent moves: ${parsed.jobs} roles, ${parsed.avgTenure} years on average`) });
  if (parsed.gapMonths >= 12) risks.push({ level: 'low', text: L(`存在约 ${Math.round(parsed.gapMonths)} 个月的职业间隔，可了解原因（不作为负面判断）`, `A career break of ~${Math.round(parsed.gapMonths)} months; ask neutrally (not a negative signal by itself)`) });
  if (isManagerLevel(position.level) && !parsed.management) risks.push({ level: 'medium', text: L('管理岗位，但简历未体现带团队经验', 'Management role, but no people management shown') });
  if (!parsed.achievements.length) risks.push({ level: 'low', text: L('缺少量化成果描述', 'No quantified achievements') });

  // Interview probes that target the evidence gaps.
  const probes = [];
  for (const k of missing.slice(0, 3)) probes.push(L(`请举一个你使用或快速学习 ${skillLabel(k, lang)} 解决实际问题的例子。`, `Tell me about a time you used, or quickly learned, ${skillLabel(k, lang)} to solve a real problem.`));
  if (parsed.jobs >= 3 && parsed.avgTenure != null && parsed.avgTenure < 1.5) probes.push(L('能谈谈每次换工作的考虑吗？你希望下一份工作有什么不同？', 'What drove each of your job changes, and what do you want to be different next?'));
  if (isManagerLevel(position.level)) probes.push(L('请描述一次你带领团队扭转困难局面的经历，你具体做了什么？', 'Describe a time you led a team through a difficult situation. What exactly did you do?'));
  if (matched.length) probes.push(L(`请深入讲讲你用 ${skillLabel(matched[0], lang)} 做过的最有挑战的项目，你的角色和结果是什么？`, `Walk me through your most challenging project using ${skillLabel(matched[0], lang)}: your role and the result.`));
  if (!parsed.achievements.length) probes.push(L('你最自豪的一项成果是什么？如何衡量它的影响？', 'What result are you proudest of, and how did you measure its impact?'));

  return { score, tier, parts, matched, missing, niceMatched, highlights, risks, probes: probes.slice(0, 5), overqualified: Boolean(overqualified) };
}
