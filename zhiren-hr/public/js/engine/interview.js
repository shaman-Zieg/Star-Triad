// Structured behavioral interviewing (STAR / BEI): question bank per competency,
// interview plans by job family and level, and scorecard aggregation.
import { COMP_KEYS, isManagerLevel, bandOf } from './competency.js';
import { detectFamily } from './jd.js';
import { mean, sd, round } from './text.js';

const Q = (q, good, red) => ({ q, good, red });

export const QUESTION_BANK = {
  professional: [
    Q(['请讲一个你运用专业知识解决的最复杂的问题。问题是什么？你是怎么做的？', 'Tell me about the most complex problem you solved with your expertise. What was it and how did you approach it?'],
      ['能讲清技术/专业细节与取舍，结果可衡量', 'Explains technical details and trade-offs; measurable result'],
      ['只谈概念、说不出细节，或把团队成果说成个人成果', 'Stays abstract, no details, or claims team results as personal']),
    Q(['最近一年你学习并应用了哪项新的专业技能？带来了什么变化？', 'Which new professional skill did you learn and apply in the past year? What changed as a result?'],
      ['主动学习，有应用场景和效果', 'Self-driven learning with a concrete application and effect'],
      ['学习停留在看书/听课，没有实践', 'Learning stayed theoretical with no practice']),
    Q(['你如何保证自己交付成果的质量？举一个发现并修正自己错误的例子。', 'How do you make sure your work is high quality? Give an example of catching and fixing your own mistake.'],
      ['有方法（检查清单、评审、测试），能坦然复盘', 'Has methods (checklists, reviews, tests) and reflects openly'],
      ['否认犯错或归咎他人', 'Denies mistakes or blames others']),
  ],
  problem: [
    Q(['请描述一次你在信息不完整的情况下做出重要判断的经历。', 'Describe a time you made an important call with incomplete information.'],
      ['说明假设、收集了哪些信息、如何控制风险', 'States assumptions, what data was gathered and how risk was managed'],
      ['凭直觉拍板且无法解释依据', 'Decided on gut feel with no rationale']),
    Q(['讲一个你找到问题根本原因的例子，你是如何一步步定位的？', 'Tell me about finding the root cause of a problem. How did you narrow it down?'],
      ['结构化拆解（如 5 Why、鱼骨图），数据验证', 'Structured breakdown (5 Whys, fishbone) and data validation'],
      ['停留在表面现象，只解决症状', 'Treated symptoms only']),
    Q(['有没有一次你的方案被证明是错的？你后来怎么调整的？', 'Was there a time your solution turned out wrong? How did you adjust?'],
      ['快速识别、承认并纠正，总结经验', 'Spotted it fast, owned it, corrected and learned'],
      ['坚持错误或掩盖问题', 'Doubled down or hid the problem']),
  ],
  execution: [
    Q(['请讲一个你在资源紧张或时间很紧的情况下仍然达成目标的例子。', 'Tell me about hitting a goal despite tight resources or time.'],
      ['明确优先级、主动协调资源、结果量化', 'Clear priorities, mobilized resources, quantified result'],
      ['依赖加班硬扛，没有方法', 'Just worked longer hours, no method']),
    Q(['你设定过的最有挑战的目标是什么？最终结果如何？', 'What is the most stretching goal you have set for yourself? How did it turn out?'],
      ['目标有挑战性，过程有复盘，对结果负责', 'Stretching goal, reviewed progress, owned the result'],
      ['目标模糊或回避讨论未达成的部分', 'Vague goal or avoids discussing what was missed']),
    Q(['描述一次项目遇到重大阻碍的经历，你是如何推动它继续前进的？', 'Describe a project that hit a major obstacle. How did you keep it moving?'],
      ['主动升级、找替代方案、保持节奏', 'Escalated, found alternatives, kept momentum'],
      ['等待他人解决或放弃', 'Waited for others or gave up']),
  ],
  communication: [
    Q(['讲一次你需要说服持不同意见的同事或上级的经历。', 'Tell me about convincing a colleague or manager who disagreed with you.'],
      ['理解对方立场，用数据和对方关心的利益沟通', 'Understood their view; used data and their interests'],
      ['强压或放弃，没有双向沟通', 'Forced it through or gave up; no dialogue']),
    Q(['你如何向非专业人士解释一个复杂的专业问题？请举例。', 'How do you explain a complex topic to non-experts? Give an example.'],
      ['因人调整表达，用类比和结论先行', 'Adapts to the audience; analogies; conclusion first'],
      ['堆砌术语，对方仍不理解', 'Jargon-heavy; audience still lost']),
    Q(['描述一次你给他人提出困难反馈的经历，结果怎样？', 'Describe giving someone difficult feedback. What happened?'],
      ['具体、基于事实、关注改进，维护关系', 'Specific, fact-based, focused on improvement; kept the relationship'],
      ['回避反馈或人身评价', 'Avoided it or made it personal']),
  ],
  collaboration: [
    Q(['讲一个你与其他部门合作完成重要事项的例子，过程中遇到了什么冲突？', 'Tell me about delivering something important with another department. What conflict came up?'],
      ['以共同目标对齐，主动补位，冲突处理得当', 'Aligned on shared goals, filled gaps, handled conflict well'],
      ['只强调他人不配合', 'Only blames the other side']),
    Q(['你曾经为了团队目标而牺牲个人利益或调整自己的计划吗？', 'Have you ever put your own goals aside for the team?'],
      ['真实例子，体现整体意识', 'A real example showing a team-first mindset'],
      ['无法举例或语气勉强', 'No example, or clearly reluctant']),
    Q(['你如何与风格和你很不一样的同事共事？', 'How do you work with someone whose style is very different from yours?'],
      ['理解差异、调整方式、关注结果', 'Understands differences, adapts, stays outcome-focused'],
      ['贴标签、回避合作', 'Labels people; avoids working together']),
  ],
  learning: [
    Q(['讲一次你在一个全新领域快速上手的经历，你是怎么做的？', 'Tell me about getting up to speed fast in a completely new area. How did you do it?'],
      ['有学习策略，向人学、在做中学', 'Clear learning strategy: learned from people and by doing'],
      ['只能描述被安排的培训', 'Only mentions assigned training']),
    Q(['你收到过最有价值的一条反馈是什么？之后你做了哪些改变？', 'What is the most valuable feedback you have received, and what did you change afterwards?'],
      ['开放接纳，有具体改变', 'Open to it, with concrete changes'],
      ['防御、否认或没有行动', 'Defensive, dismissive or no action']),
    Q(['讲一次失败的经历，你从中学到了什么？', 'Tell me about a failure. What did you learn?'],
      ['真诚复盘，经验迁移到后续工作', 'Honest reflection; lessons applied later'],
      ['把失败包装成成功或归咎外部', 'Spins it as success or blames circumstances']),
  ],
  innovation: [
    Q(['你提出并推动落地的最有价值的一个改进是什么？', 'What is the most valuable improvement you proposed and put into practice?'],
      ['发现机会、推动落地、效果可衡量', 'Spotted the opportunity, made it happen, measurable effect'],
      ['只有想法没有落地', 'Ideas only, nothing implemented']),
    Q(['描述一次你面对组织变化（如架构调整、新流程）时的做法。', 'Describe how you handled an organizational change such as a reorg or new process.'],
      ['理解变化的原因，主动适应并帮助他人', 'Understood why, adapted early and helped others'],
      ['抱怨、抵触或被动等待', 'Complained, resisted or waited passively']),
    Q(['你如何在工作中尝试新方法，同时控制风险？', 'How do you try new approaches while managing the risk?'],
      ['小步试点、数据验证、及时止损', 'Small pilots, data checks, quick to stop'],
      ['盲目冒进或从不尝试', 'Reckless, or never tries']),
  ],
  leadership: [
    Q(['讲一个你帮助团队成员显著成长的例子。', 'Tell me about helping a team member grow significantly.'],
      ['了解个人目标，给予挑战与辅导，有成长证据', 'Knew their goals, gave stretch and coaching; evidence of growth'],
      ['只谈布置任务', 'Only talks about assigning tasks']),
    Q(['你如何处理团队中长期绩效不佳的成员？', 'How have you handled a persistent underperformer?'],
      ['及时、坦诚、有改进计划并跟进到底', 'Timely, candid, with an improvement plan followed through'],
      ['长期回避或简单粗暴', 'Avoided it for months, or acted harshly']),
    Q(['描述一次你带领团队完成一个艰难目标的经历，你如何让大家保持投入？', 'Describe leading your team to a hard goal. How did you keep people engaged?'],
      ['讲清意义、授权、认可贡献', 'Explained why, delegated, recognized contributions'],
      ['依赖施压和个人英雄主义', 'Relied on pressure and personal heroics']),
  ],
};

export const STAR_PROBES = [
  ['S 情境：当时的背景是什么？涉及哪些人？', 'S - Situation: what was the context, and who was involved?'],
  ['T 任务：你具体负责什么？目标是什么？', 'T - Task: what were you responsible for, and what was the goal?'],
  ['A 行动：你个人做了哪些具体行动？为什么这么做？', 'A - Action: what exactly did you do, and why?'],
  ['R 结果：结果如何？如何衡量？如果重来会怎么做？', 'R - Result: what happened, how was it measured, what would you do differently?'],
];

// Which competencies to probe, by job family (most important first).
export const FAMILY_FOCUS = {
  tech: ['professional', 'problem', 'learning', 'collaboration', 'innovation'],
  data: ['problem', 'professional', 'communication', 'learning', 'execution'],
  product: ['problem', 'communication', 'collaboration', 'execution', 'innovation'],
  design: ['professional', 'communication', 'collaboration', 'innovation', 'learning'],
  marketing: ['execution', 'innovation', 'communication', 'problem', 'collaboration'],
  sales: ['execution', 'communication', 'collaboration', 'learning', 'problem'],
  hr: ['communication', 'collaboration', 'problem', 'professional', 'execution'],
  finance: ['professional', 'problem', 'execution', 'communication', 'collaboration'],
  ops: ['execution', 'problem', 'collaboration', 'communication', 'innovation'],
  general: ['execution', 'problem', 'communication', 'collaboration', 'learning'],
};

export const ROUNDS = [
  { key: 'r1', name: ['专业面试', 'Skills interview'], who: ['团队专家', 'Team expert'] },
  { key: 'r2', name: ['用人经理面试', 'Hiring manager'], who: ['用人经理', 'Hiring manager'] },
  { key: 'r3', name: ['HR / 文化面试', 'HR & values'], who: ['HRBP', 'HRBP'] },
];

export function planInterview(position = {}) {
  const family = detectFamily(position.title || position.titleEn || '');
  let focus = [...FAMILY_FOCUS[family]];
  if (isManagerLevel(position.level)) focus = ['leadership', ...focus.filter((k) => k !== 'leadership')].slice(0, 5);
  else if (bandOf(position.level) === 'junior') focus = focus.filter((k) => k !== 'innovation').concat('learning').filter((k, i, a) => a.indexOf(k) === i).slice(0, 5);
  focus = focus.slice(0, 5);
  // Spread competencies across rounds so each interviewer owns a distinct part of the evidence.
  const byRound = { r1: [], r2: [], r3: [] };
  focus.forEach((k, i) => {
    const r = k === 'professional' || k === 'problem' ? 'r1' : k === 'leadership' || k === 'execution' ? 'r2' : ['r3', 'r2', 'r1'][i % 3];
    byRound[r].push(k);
  });
  return {
    family,
    focus,
    byRound,
    questions: Object.fromEntries(focus.map((k) => [k, QUESTION_BANK[k].slice(0, 2)])),
    agenda: [
      { min: 5, text: ['开场：介绍流程，建立信任', 'Opening: explain the format and build rapport'] },
      { min: 35, text: ['行为面试：每个能力 1-2 题，用 STAR 追问', 'Behavioral questions: 1-2 per competency, probe with STAR'] },
      { min: 10, text: ['候选人提问，介绍岗位与团队', 'Candidate questions; sell the role and team'] },
      { min: 5, text: ['结束：说明后续流程与时间', 'Close: explain next steps and timing'] },
    ],
  };
}

export const RECOMMENDATIONS = {
  strong_yes: { name: ['强烈推荐', 'Strong hire'], score: 2, tone: 'ok' },
  yes: { name: ['推荐', 'Hire'], score: 1, tone: 'info' },
  no: { name: ['不推荐', 'No hire'], score: -1, tone: 'warn' },
  strong_no: { name: ['强烈不推荐', 'Strong no hire'], score: -2, tone: 'danger' },
};

// Combines several interviewers' scorecards into one evaluation.
export function aggregateScorecards(interviews = []) {
  const done = interviews.filter((i) => i.scores && Object.keys(i.scores).length);
  const comps = {};
  for (const k of COMP_KEYS) {
    const xs = done.map((i) => Number(i.scores[k])).filter((v) => v >= 1 && v <= 5);
    if (xs.length) comps[k] = { mean: round(mean(xs), 2), sd: round(sd(xs), 2), n: xs.length, values: xs };
  }
  const allMeans = Object.values(comps).map((c) => c.mean);
  const overall = allMeans.length ? round(mean(allMeans), 2) : null;
  const recs = Object.fromEntries(Object.keys(RECOMMENDATIONS).map((k) => [k, 0]));
  for (const i of done) if (recs[i.recommendation] != null) recs[i.recommendation] += 1;
  const disagreements = Object.entries(comps).filter(([, c]) => c.sd > 1).map(([k]) => k);
  const vetoes = recs.strong_no;
  let decision = null;
  if (overall != null) {
    if (vetoes || overall < 3) decision = 'reject';
    else if (overall >= 3.8 && !recs.no) decision = 'hire';
    else decision = 'discuss';
  }
  return { count: done.length, comps, overall, recs, disagreements, vetoes, decision };
}

export const DECISIONS = {
  hire: { name: ['建议录用', 'Recommend hire'], tone: 'ok' },
  discuss: { name: ['需集体校准讨论', 'Needs calibration discussion'], tone: 'warn' },
  reject: { name: ['建议不录用', 'Recommend no hire'], tone: 'danger' },
};
