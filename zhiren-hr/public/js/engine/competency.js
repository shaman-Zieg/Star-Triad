// General competency model (8 competencies, 5 proficiency levels) with
// behaviorally anchored rating scales (BARS) and target profiles per job level.
// Used by interview scorecards, talent assessment, IDPs and training needs analysis.

export const COMPETENCIES = [
  {
    key: 'professional',
    name: ['专业能力', 'Professional expertise'],
    def: ['掌握岗位所需的专业知识与技能，并能运用于解决实际问题。', 'Has the job-specific knowledge and skills and applies them to real problems.'],
    anchors: {
      1: ['需要在指导下完成基础工作，专业知识有明显欠缺。', 'Needs guidance for routine work; clear knowledge gaps.'],
      3: ['独立完成本岗位常规与较复杂任务，质量稳定。', 'Handles routine and moderately complex work independently with steady quality.'],
      5: ['是公认的领域专家，能解决疑难问题并制定专业标准。', 'Recognized expert who solves the hardest problems and sets professional standards.'],
    },
  },
  {
    key: 'problem',
    name: ['分析与解决问题', 'Problem solving'],
    def: ['能拆解复杂问题、找到根因，基于数据做出合理判断。', 'Breaks down complex problems, finds root causes and makes sound, data-based judgments.'],
    anchors: {
      1: ['停留在表面现象，依赖他人给出方案。', 'Stays at symptoms; relies on others for solutions.'],
      3: ['能用结构化方法分析问题并提出可行方案。', 'Uses structured methods to analyze issues and propose workable options.'],
      5: ['在模糊与跨领域情境中洞察本质，形成系统性解决方案。', 'Sees the core of ambiguous, cross-domain problems and builds systemic solutions.'],
    },
  },
  {
    key: 'execution',
    name: ['执行与结果导向', 'Drive for results'],
    def: ['设定挑战性目标，克服障碍，按时高质量交付结果。', 'Sets stretching goals, overcomes obstacles and delivers quality results on time.'],
    anchors: {
      1: ['经常延误或需要反复催促，结果不稳定。', 'Often late or needs chasing; inconsistent results.'],
      3: ['可靠地达成目标，主动跟进与解决阻碍。', 'Reliably meets goals and proactively removes blockers.'],
      5: ['持续超越高目标，并带动团队形成结果文化。', 'Consistently beats high targets and builds a results culture around them.'],
    },
  },
  {
    key: 'communication',
    name: ['沟通与影响', 'Communication & influence'],
    def: ['清晰表达观点，倾听他人，并能影响利益相关方达成共识。', 'Expresses ideas clearly, listens, and influences stakeholders toward agreement.'],
    anchors: {
      1: ['表达不清或单向输出，容易引起误解。', 'Unclear or one-way communication that causes misunderstandings.'],
      3: ['针对不同对象调整沟通方式，有效传递信息。', 'Adapts style to the audience and gets messages across effectively.'],
      5: ['在高利害场合中化解分歧，影响高层与外部关键方。', 'Resolves disagreement in high-stakes settings and influences executives and key externals.'],
    },
  },
  {
    key: 'collaboration',
    name: ['团队协作', 'Collaboration'],
    def: ['以整体目标为重，跨部门合作，主动分享与支持他人。', 'Puts shared goals first, works across boundaries, shares and supports others.'],
    anchors: {
      1: ['只关注自身任务，协作中推诿或回避。', 'Focuses only on own tasks; avoids or deflects in joint work.'],
      3: ['积极配合他人，主动分享信息与资源。', 'Cooperates willingly and shares information and resources.'],
      5: ['搭建跨部门协作机制，推动组织层面的协同。', 'Builds cross-functional mechanisms and drives organization-wide collaboration.'],
    },
  },
  {
    key: 'learning',
    name: ['学习与成长', 'Learning agility'],
    def: ['主动学习新知识，从经验和反馈中快速成长并迁移应用。', 'Learns actively and grows quickly from experience and feedback, applying lessons to new situations.'],
    anchors: {
      1: ['被动学习，对反馈有防御心理。', 'Learns passively; defensive about feedback.'],
      3: ['主动寻求反馈并改进，能较快掌握新技能。', 'Seeks feedback and improves; picks up new skills fairly fast.'],
      5: ['在全新领域快速上手，并把学习转化为团队能力。', 'Ramps up fast in unfamiliar areas and turns learning into team capability.'],
    },
  },
  {
    key: 'innovation',
    name: ['创新与变革', 'Innovation & change'],
    def: ['挑战现状，提出新思路并推动落地，积极拥抱变化。', 'Challenges the status quo, brings new ideas to life and embraces change.'],
    anchors: {
      1: ['习惯沿用旧方法，对变化有抵触。', 'Sticks to old ways; resists change.'],
      3: ['提出改进建议并在本职范围内实施。', 'Suggests improvements and implements them within own scope.'],
      5: ['引领重大变革或创新，改变业务或组织的做法。', 'Leads major change or innovation that reshapes how the business works.'],
    },
  },
  {
    key: 'leadership',
    name: ['领导与培养他人', 'Leading & developing others'],
    def: ['明确方向，激发团队，识别并培养人才。', 'Sets direction, energizes the team, and spots and develops talent.'],
    anchors: {
      1: ['较少关注他人发展，未承担带人职责。', 'Pays little attention to developing others; no people responsibility.'],
      3: ['能辅导新人或带领小组完成任务。', 'Coaches newcomers or leads a small group to deliver.'],
      5: ['打造高绩效团队，持续输出后备人才。', 'Builds high-performing teams and a steady pipeline of successors.'],
    },
  },
];

export const COMP_KEYS = COMPETENCIES.map((c) => c.key);
export const compByKey = Object.fromEntries(COMPETENCIES.map((c) => [c.key, c]));

// Job levels: P = professional track, M = management track.
export const LEVELS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'M1', 'M2', 'M3', 'M4'];

export const BANDS = {
  junior: { name: ['初级', 'Junior'], levels: ['P1', 'P2', 'P3'] },
  mid: { name: ['中级', 'Intermediate'], levels: ['P4', 'P5'] },
  senior: { name: ['高级', 'Senior'], levels: ['P6', 'P7'] },
  expert: { name: ['专家', 'Expert'], levels: ['P8'] },
  manager: { name: ['经理', 'Manager'], levels: ['M1', 'M2'] },
  director: { name: ['高级经理/总监', 'Director'], levels: ['M3', 'M4'] },
};

// Target proficiency per competency for each band (order follows COMP_KEYS).
const TARGETS = {
  junior: [2, 2, 3, 2, 3, 3, 2, 1],
  mid: [3, 3, 3, 3, 3, 3, 3, 2],
  senior: [4, 4, 4, 3, 3, 3, 3, 3],
  expert: [5, 4, 4, 4, 4, 4, 4, 3],
  manager: [3, 4, 4, 4, 4, 3, 3, 4],
  director: [4, 4, 4, 5, 4, 4, 4, 5],
};

export function bandOf(level) {
  for (const [key, b] of Object.entries(BANDS)) if (b.levels.includes(level)) return key;
  return 'mid';
}

export const isManagerLevel = (level) => String(level || '').startsWith('M');

export function targetProfile(level) {
  const t = TARGETS[bandOf(level)];
  return Object.fromEntries(COMP_KEYS.map((k, i) => [k, t[i]]));
}

// The first level up the same track whose profile is more demanding, used when
// someone already meets their current targets and should prepare for the next role.
// Returns the level itself at the top of a track.
export function nextLevel(level) {
  return ladderInfo(level).nextLevel || level;
}

// Where a level sits on the two career tracks (P1-P8, M1-M4). Levels share one
// competency standard within a band, so "the next standard" is the next band,
// and the top of each track has no higher standard.
export function ladderInfo(level) {
  const track = String(level || '').charAt(0) === 'M' ? 'M' : 'P';
  const band = bandOf(level);
  const shared = BANDS[band].levels;
  const i = LEVELS.indexOf(level);
  const next = i < 0 ? null : LEVELS.slice(i + 1).find((l) => l.charAt(0) === track && bandOf(l) !== band) || null;
  // The immediate next level on the same track (it may share the current standard).
  const step = i < 0 ? null : LEVELS.slice(i + 1).find((l) => l.charAt(0) === track) || null;
  return {
    level,
    track,
    band,
    bandName: BANDS[band].name,
    sharedLevels: shared,
    trackTop: !next,
    topLevel: track === 'M' ? 'M4' : 'P8',
    nextLevel: next,
    nextBand: next ? bandOf(next) : null,
    nextStep: step,
    nextStepSharesStandard: Boolean(step && bandOf(step) === band),
  };
}

// Common rank across the two tracks, used for distance between a person and a
// role: M1 sits alongside P6, M2 alongside P7, M3 alongside P8, M4 above them.
export const levelRank = (level) => {
  const n = Number(String(level).slice(1)) || 0;
  return String(level).startsWith('M') ? n + 5 : n;
};

const valid = (v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 5;

// Summarizes an assessment against a target profile. Missing ratings are treated
// as missing information, never as a score of zero or as meeting the target.
export function assessCompetencies(actual, target) {
  const rated = COMP_KEYS.filter((k) => valid(actual?.[k]));
  const status = rated.length === COMP_KEYS.length ? 'complete' : rated.length ? 'partial' : 'missing';
  const items = COMP_KEYS.map((key) => {
    const t = Number(target[key]) || 0;
    if (!valid(actual?.[key])) return { key, actual: null, target: t, gap: null };
    const a = Number(actual[key]);
    return { key, actual: a, target: t, gap: t - a };
  });
  const assessed = items.filter((x) => x.actual != null);
  const met = assessed.filter((x) => x.gap <= 0).length;
  const gapsList = assessed.filter((x) => x.gap > 0).sort((a, b) => b.gap - a.gap || COMP_KEYS.indexOf(a.key) - COMP_KEYS.indexOf(b.key));
  const fit = status === 'complete' ? fitScore(actual, target) : null;
  let verdict = 'unassessed';
  if (status === 'complete') {
    if (!gapsList.length) verdict = 'full';
    else if (fit >= 85 && gapsList.every((g) => g.gap === 1)) verdict = 'near';
    else if (fit >= 70) verdict = 'partial';
    else verdict = 'significant';
  }
  return {
    status,
    total: COMP_KEYS.length,
    assessedCount: assessed.length,
    met,
    fit,
    verdict,
    gaps: gapsList,
    strengths: assessed.filter((x) => x.gap < 0).sort((a, b) => a.gap - b.gap),
    missing: items.filter((x) => x.actual == null).map((x) => x.key),
    items,
  };
}

export const VERDICTS = {
  full: { name: ['全部达标', 'Meets all requirements'], tone: 'ok', icon: 'check' },
  near: { name: ['基本胜任', 'Nearly meets'], tone: 'warn', icon: 'alert' },
  partial: { name: ['部分胜任', 'Partly meets'], tone: 'warn', icon: 'alert' },
  significant: { name: ['明显差距', 'Significant gaps'], tone: 'danger', icon: 'x' },
  unassessed: { name: ['未完成评估', 'Not assessed'], tone: 'info', icon: 'info' },
};

// Positive gap = below target.
export function gaps(actual = {}, target = {}) {
  return COMP_KEYS.map((key) => {
    const a = Number(actual[key]) || 0;
    const t = Number(target[key]) || 0;
    return { key, actual: a, target: t, gap: t - a };
  }).sort((x, y) => y.gap - x.gap || COMP_KEYS.indexOf(x.key) - COMP_KEYS.indexOf(y.key));
}

export function fitScore(actual, target) {
  // Share of target met, capped per competency so strengths cannot hide gaps.
  let met = 0;
  let total = 0;
  for (const k of COMP_KEYS) {
    const t = Number(target[k]) || 0;
    if (!t) continue;
    total += t;
    met += Math.min(t, Number(actual[k]) || 0);
  }
  return total ? Math.round((met / total) * 100) : 0;
}
