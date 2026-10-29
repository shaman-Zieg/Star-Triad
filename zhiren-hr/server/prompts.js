// Prompt builders for the optional Claude assistance. Every task also has a
// rule-based counterpart in public/js/engine, so the app is complete without AI;
// these prompts add judgment and narrative on top of the same inputs.

const SYSTEM = `You are a senior HR and organization development consultant with 15+ years of experience in talent acquisition, talent management, learning and development, and organizational diagnosis, working in companies in China and internationally.

How you work:
- Ground every statement in the data provided. When the data is thin, say what is missing instead of inventing facts.
- Be practical: concrete actions, owners and time frames beat generic advice.
- Follow employment law and fair-hiring practice. Never recommend decisions based on gender, age, marital or family status, ethnicity, religion, health or other protected characteristics; point out such content if you see it.
- Write in Markdown with short headings (##), bullets and **bold** for key points. No tables wider than 4 columns. Keep it under about 600 words unless the task needs more.`;

const LANG = {
  zh: 'Write the entire answer in Simplified Chinese (简体中文).',
  en: 'Write the entire answer in English.',
};

const json = (v) => JSON.stringify(v, null, 1);

const TASKS = {
  jd: {
    effort: 'medium',
    build: (i) => `Draft a complete, attractive and inclusive job description for this role.

Role details (JSON):
${json(i)}

Structure: a one-paragraph role summary; ## Responsibilities (6-8 bullets, outcome-oriented); ## Requirements (must-haves only); ## Nice to have; ## What we offer (keep generic placeholders the hiring team can edit); finally ## Notes for the hiring team with any wording that could be exclusionary or legally risky and how to fix it.`,
  },
  resume: {
    effort: 'medium',
    build: (i) => `Evaluate this candidate against the open position. A rule-based screener has already scored the resume; use its result as a starting point, correct it where the resume text says otherwise, and add judgment.

Position (JSON):
${json(i.position)}

Rule-based screening result (JSON):
${json(i.analysis)}

Resume text:
"""
${i.resume}
"""

Structure: ## Overall verdict (one line: strong / good / possible / not a fit, plus why); ## Evidence of fit; ## Gaps and risks; ## What to verify in the interview (5 targeted questions, each tied to a gap or claim in the resume). Ignore personal characteristics unrelated to the job.`,
  },
  interview: {
    effort: 'medium',
    build: (i) => `Prepare a structured behavioral interview guide (STAR format) for this interview.

Position and focus competencies (JSON):
${json(i)}

For each focus competency give: 2 behavioral questions tailored to the role and level, 2-3 follow-up probes (Situation/Task/Action/Result), what a strong answer shows, and red flags. If candidate notes are provided, add a section of 3 candidate-specific questions. Finish with a short scoring reminder (rate each competency 1-5 against evidence, not impression).`,
  },
  diagnosis: {
    effort: 'medium',
    build: (i) => `Write an organizational diagnosis report from these survey results.

Survey and results (JSON; scores are 1-5 Likert means, "spread" is the standard deviation across respondents, departments with fewer than 5 responses are already suppressed for anonymity):
${json(i)}

Structure: ## Executive summary (3-4 sentences); ## Strengths to build on; ## Priority issues (top 2-3, with the evidence and the likely root causes across dimensions - explain how the dimensions interact in the chosen model); ## Recommended interventions (each with owner, first 30-day step and how to measure progress); ## Where to dig deeper (focus groups, interviews or data to collect, especially where spread is high).`,
  },
  idp: {
    effort: 'medium',
    build: (i) => `Write an individual development plan (IDP) using the 70-20-10 model.

Employee profile, competency gaps and the rule-based draft (JSON):
${json(i)}

Structure: ## Development focus (why these 2-3 competencies matter for this person's role and career); then for each focus area ## <competency>: a SMART goal, 70% on-the-job experiences, 20% learning from others (mentor, coaching, feedback), 10% formal learning (prefer the listed courses), and evidence of progress at 30/60/90 days; finally ## Manager support (what the manager commits to).`,
  },
  talent: {
    effort: 'medium',
    build: (i) => `Summarize this talent review (9-box calibration) for the leadership team.

Talent review data (JSON):
${json(i)}

Structure: ## Talent landscape (distribution, notable concentrations, signs of rating inflation or central tendency); ## Key talent to invest in; ## Retention risks; ## Succession gaps; ## Decisions to take in the meeting (5-7 concrete items).`,
  },
  assistant: {
    effort: 'low',
    build: (i) => `An employee asks the HR service desk a question. Answer using the company policy articles below. Quote the relevant rule, give the steps to follow, and say clearly when the policies do not cover the question (then suggest opening a service request). Do not invent policy details.

Company policy articles (JSON):
${json(i.articles)}

Employee question:
"""
${i.question}
"""`,
  },
};

export const TASK_NAMES = Object.keys(TASKS);
export const MAX_INPUT_CHARS = 60_000;

export function buildPrompt(task, input, lang) {
  const spec = TASKS[task];
  if (!spec) return null;
  const prompt = spec.build(input || {});
  return { system: `${SYSTEM}\n\n${LANG[lang] || LANG.zh}`, prompt, effort: spec.effort };
}
