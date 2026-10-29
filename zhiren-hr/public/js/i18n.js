// Language handling. Views write strings inline as L('中文', 'English');
// engine content uses [zh, en] pairs read through tx().
import { pick } from './engine/text.js';

const KEY = 'zr-lang';
function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch { /* storage unavailable */ }
  return String(navigator.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
let current = initial();
document.documentElement.lang = current === 'en' ? 'en' : 'zh-CN';

export const lang = () => current;
export function setLang(l) {
  current = l === 'en' ? 'en' : 'zh';
  document.documentElement.lang = current === 'en' ? 'en' : 'zh-CN';
  try { localStorage.setItem(KEY, current); } catch { /* ignore */ }
}
export const L = (zh, en) => (current === 'en' ? en : zh);
export const tx = (pair) => pick(pair, current);
// Reads a field with an optional English variant, e.g. loc(emp, 'title') -> titleEn in English.
export const loc = (obj, field = 'name') => (obj ? (current === 'en' && obj[`${field}En`]) || obj[field] || '' : '');

// Shared vocabularies.
export const STAGES = {
  applied: ['新投递', 'Applied'],
  screen: ['初筛', 'Screening'],
  interview: ['面试中', 'Interviewing'],
  offer: ['Offer', 'Offer'],
  hired: ['已入职', 'Hired'],
  rejected: ['未通过', 'Not selected'],
};
export const STAGE_ORDER = ['applied', 'screen', 'interview', 'offer', 'hired', 'rejected'];
export const SOURCES = {
  referral: ['内部推荐', 'Referral'],
  jobboard: ['招聘网站', 'Job boards'],
  linkedin: ['领英', 'LinkedIn'],
  website: ['官网投递', 'Careers site'],
  agency: ['猎头', 'Agency'],
  campus: ['校园招聘', 'Campus'],
};
export const REJECT_REASONS = {
  skills: ['技能不匹配', 'Skills gap'],
  experience: ['经验不足', 'Not enough experience'],
  salary: ['薪资预期不符', 'Pay expectations'],
  withdrew: ['候选人放弃', 'Candidate withdrew'],
  culture: ['价值观/动机不符', 'Values or motivation'],
};
export const POSITION_STATUS = {
  open: [['招聘中', 'Open'], 'ok'],
  paused: [['暂停', 'Paused'], 'warn'],
  closed: [['已关闭', 'Closed'], ''],
};
export const PRIORITY = {
  high: [['高', 'High'], 'danger'],
  medium: [['中', 'Medium'], 'warn'],
  low: [['低', 'Low'], ''],
};
export const LOCATIONS = {
  sh: ['上海', 'Shanghai'],
  bj: ['北京', 'Beijing'],
  sz: ['深圳', 'Shenzhen'],
  hz: ['杭州', 'Hangzhou'],
  remote: ['远程', 'Remote'],
};
export const LEAVE_REASONS = {
  career: ['职业发展', 'Career growth'],
  pay: ['薪酬', 'Pay'],
  manager: ['与上级关系', 'Relationship with manager'],
  relocation: ['个人/家庭原因', 'Personal or relocation'],
  performance: ['绩效原因（公司提出）', 'Performance (company initiated)'],
};
export const ENROLL_STATUS = {
  planned: [['计划中', 'Planned'], ''],
  in_progress: [['学习中', 'In progress'], 'info'],
  completed: [['已完成', 'Completed'], 'ok'],
};
export const RISK_LEVEL = {
  high: [['高', 'High'], 'danger'],
  medium: [['中', 'Medium'], 'warn'],
  low: [['低', 'Low'], 'ok'],
};
