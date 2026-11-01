// Shared write validation. Validate a complete document (merge PUT patches first).
// Never coerce input: CSV import converts numeric columns before calling this module.
import { COMP_KEYS, LEVELS } from './competency.js';

const rule = (check, message) => ({ check, message });
const str = (max = 300, min = 0) => rule(v => typeof v === 'string' && v.length <= max && v.trim().length >= min, `must be text (${min}–${max} characters)`);
const num = (min, max, integer = false) => rule(v => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v)), `must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}`);
const choice = values => rule(v => values.includes(v), `must be one of: ${values.join(', ')}`);
const bool = rule(v => typeof v === 'boolean', 'must be true or false');
const required = r => ({ ...r, required: true });
const nullable = r => ({ ...r, nullable: true });
const arr = (item, max = 100, min = 0) => ({ item, max, min });
const obj = fields => ({ fields });
const date = rule(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'must be a real date (YYYY-MM-DD)');
const timestamp = rule(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{3}Z)?$/.test(v) && Number.isFinite(Date.parse(v)), 'must be a valid timestamp');
const id = rule(v => typeof v === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(v), 'must be a valid identifier');
const ref = collection => ({ ...id, collection });
const text = str(4000);
const title = str(300, 1);
const pair = arr(str(4000, 1), 2, 2);
const rating = num(1, 5, true);
const competencies = obj(Object.fromEntries(COMP_KEYS.map(k => [k, nullable(rating)])));
const skills = arr(str(80, 1));
const level = choice(LEVELS);
const risk = choice(['low', 'medium', 'high']);
const status = choice(['active', 'left']);
const stages = ['applied', 'screen', 'interview', 'offer', 'hired', 'rejected'];
const comment = obj({ by: required(ref('employees')), at: required(timestamp), text: required(str(4000, 1)), textEn: text });
const action = obj({ type: required(choice(['70', '20', '10'])), text: required(pair), due: required(date), done: required(bool), courseId: ref('courses'), ownerId: nullable(ref('employees')) });
const factor = obj({ key: required(str(80, 1)), points: required(num(0, 100)), text: required(pair), action: required(pair) });
const metadata = { id, createdAt: timestamp, updatedAt: timestamp, createdBy: nullable(ref('employees')) };

const SCHEMAS = {
  departments: {
    name: required(title), nameEn: str(), parentId: nullable(ref('departments')),
  },
  employees: {
    name: required(title), nameEn: str(), empNo: str(80), email: rule(v => typeof v === 'string' && v.length <= 254 && (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)), 'must be a valid email address'), phone: str(80),
    deptId: required(ref('departments')), title: required(title), titleEn: str(), level: required(level), managerId: nullable(ref('employees')),
    location: choice(['sh', 'bj', 'sz', 'hz', 'remote']), hireDate: required(date), status: required(status),
    skills, performance: nullable(rating), potential: nullable(num(1, 3, true)), engagement: nullable(rating), compaRatio: nullable(num(0.01, 10)),
    competencies: nullable(competencies), perfHistory: arr(obj({ period: required(str(80, 1)), rating: required(rating) }), 100),
    lastPromotion: nullable(date), assessedAt: date, managerChanged: bool,
    leaveDate: nullable(date), leaveReason: nullable(choice(['career', 'pay', 'manager', 'relocation', 'performance'])), leaveType: nullable(choice(['voluntary', 'involuntary'])),
    fromCandidateId: ref('candidates'), agility: obj({ avg: required(nullable(num(1, 5))), at: required(date), dims: required(arr(obj({ key: required(choice(['mental', 'people', 'change', 'results', 'self'])), score: required(nullable(num(1, 5))) }), 5)) }),
  },
  positions: {
    title: required(title), titleEn: str(), deptId: ref('departments'), level, headcount: num(1, 10000, true), priority: risk,
    status: required(choice(['open', 'paused', 'closed'])), skills, niceSkills: skills, minYears: num(0, 80), maxYears: num(0, 80), education: num(0, 5, true),
    location: choice(['sh', 'bj', 'sz', 'hz', 'remote']), salaryMin: nullable(num(0, 1000000)), salaryMax: nullable(num(0, 1000000)),
    hiringManagerId: nullable(ref('employees')), recruiterId: nullable(ref('employees')), openedAt: date, closedAt: nullable(date), jd: str(100000),
  },
  candidates: {
    name: required(title), nameEn: str(), positionId: required(ref('positions')), stage: required(choice(stages)),
    source: choice(['referral', 'jobboard', 'linkedin', 'website', 'agency', 'campus']), email: nullable(str(254)), phone: nullable(str(80)), resume: str(200000),
    appliedAt: date, stageChangedAt: date, rejectedFrom: choice(stages), rejectReason: choice(['skills', 'experience', 'salary', 'withdrew', 'culture']),
    notes: arr(comment, 500), offer: nullable(obj({ salary: nullable(num(0, 100000000)), startDate: date, status: required(choice(['sent', 'accepted', 'declined', 'withdrawn'])) })),
    interviews: arr(obj({ id: required(id), round: required(choice(['r1', 'r2', 'r3'])), interviewerId: required(ref('employees')), date: required(date), scores: required(obj(Object.fromEntries(COMP_KEYS.map(k => [k, rating])))), recommendation: nullable(choice(['strong_yes', 'yes', 'no', 'strong_no'])), notes: text }), 100),
  },
  succession: {
    title: required(title), titleEn: str(), deptId: ref('departments'), incumbentId: required(ref('employees')), criticality: required(choice(['critical', 'high', 'medium'])), vacancyRisk: required(risk),
    note: text, noteEn: text, keyReasons: arr(str(1000, 1), 30),
    spec: obj({ family: required(choice(['tech', 'data', 'product', 'design', 'sales', 'hr', 'marketing', 'ops', 'finance', 'general'])), level: required(level), critical: required(arr(choice(COMP_KEYS), 8, 1)), skills: required(skills) }),
    successors: required(arr(obj({ employeeId: required(ref('employees')), readiness: required(choice(['now', 'y1', 'y3'])), note: text, evidence: text, nominatedBy: nullable(ref('employees')), nominatedAt: date }), 100)),
  },
  courses: {
    title: required(title), titleEn: str(), competency: required(choice(COMP_KEYS)), format: required(choice(['online', 'classroom', 'workshop', 'mentoring', 'project'])),
    hours: required(num(0.1, 10000)), level: required(choice(['foundation', 'advanced'])), provider: str(),
  },
  enrollments: {
    employeeId: required(ref('employees')), courseId: required(ref('courses')), status: required(choice(['planned', 'in_progress', 'completed'])),
    progress: num(0, 100), satisfaction: nullable(rating), completedAt: nullable(date),
  },
  idps: {
    employeeId: required(ref('employees')), period: str(80), status: required(choice(['active', 'completed', 'cancelled'])), mode: required(choice(['gap', 'growth', 'mastery', 'unassessed', 'retention'])), name: str(), nameEn: str(),
    focus: arr(obj({ competency: required(choice(COMP_KEYS)), actual: required(num(1, 5)), target: required(num(1, 5)), actions: required(arr(action, 100)) }), 8),
    startedAt: date, reviewDue: date, baseline: obj({ score: required(num(0, 100)), engagement: required(nullable(rating)), factors: required(arr(factor, 30)) }),
    actions: arr(obj({ key: required(str(80, 1)), reason: required(pair), text: required(pair), owner: required(pair), ownerId: nullable(ref('employees')), evidence: required(pair), due: required(date), done: required(bool) }), 100),
    reviews: arr(obj({ checkpoint: required(choice(['30', '60', '90'])), date: required(date), note: required(str(4000, 1)), nextStep: required(str(4000, 1)), riskScore: required(nullable(num(0, 100))), engagement: required(nullable(rating)), employmentStatus: required(status), progress: required(num(0, 100)) }), 100),
  },
  surveys: {
    title: required(title), titleEn: str(), model: required(choice(['sixbox', 'mck7s', 'engagement', 'team'])), scope: required(str(64, 1)),
    status: required(choice(['open', 'closed'])), anonymous: required(choice([true])), closedAt: nullable(date),
  },
  // Survey submissions also pass server validation for the open survey and question IDs.
  responses: { surveyId: required(ref('surveys')), deptId: ref('departments'), answers: required({ map: rating, max: 100 }), enps: num(0, 10, true), comment: str(1000) },
  tickets: {
    type: required(choice(['leave', 'certificate', 'payroll', 'benefits', 'records', 'it', 'other'])), title: required(title), titleEn: str(), detail: str(10000), detailEn: str(10000),
    status: required(choice(['open', 'in_progress', 'resolved'])), requesterId: required(ref('employees')), assigneeId: nullable(ref('employees')), comments: arr(comment, 500), resolvedAt: nullable(date),
  },
  kb: { title: required(title), titleEn: str(), category: required(choice(['leave', 'pay', 'contract', 'growth', 'daily'])), body: required(str(100000, 1)), bodyEn: str(100000), tags: arr(str(100, 1)), updatedBy: nullable(ref('employees')) },
  onboarding: {
    employeeId: required(ref('employees')), startDate: required(date), buddyId: nullable(ref('employees')),
    tasks: required(arr(obj({ id: required(id), phase: required(choice(['pre', 'day1', 'week1', 'd30', 'd60', 'd90'])), owner: required(choice(['hr', 'manager', 'it', 'buddy', 'newhire'])), text: required(pair), due: required(date), done: required(bool) }), 100)),
  },
  raci: {
    title: required(title), titleEn: str(), roles: required(arr(str(100, 1), 30, 1)), rolesEn: arr(str(100), 30),
    steps: required(arr(obj({ name: required(str(300, 1)), nameEn: str(300), cells: required(arr(choice(['R', 'A', 'C', 'I', '']), 30)) }), 200)),
  },
};

function validate(value, schema, field, errors, lookup) {
  if (errors.length >= 50) return;
  const fail = message => errors.push(`${field}: ${message}`);
  if (value === undefined) { if (schema.required) fail('is required'); return; }
  if (value === null && schema.nullable) return;
  if (schema.item) {
    if (!Array.isArray(value) || value.length < schema.min || value.length > schema.max) return fail(`must be an array of ${schema.min}–${schema.max} items`);
    value.forEach((v, i) => validate(v, schema.item, `${field}[${i}]`, errors, lookup));
  } else if (schema.fields || schema.map) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail('must be an object');
    const keys = Object.keys(value);
    if (schema.map && keys.length > schema.max) return fail(`has more than ${schema.max} keys`);
    for (const key of keys) {
      if (['__proto__', 'constructor', 'prototype'].includes(key) || (schema.fields && !Object.hasOwn(schema.fields, key)) || (schema.map && !/^[a-z0-9_]{1,40}$/i.test(key))) fail(`unknown field ${key}`);
      else validate(value[key], schema.fields?.[key] || schema.map, `${field}.${key}`, errors, lookup);
    }
    for (const [key, child] of Object.entries(schema.fields || {})) if (!Object.hasOwn(value, key)) validate(undefined, child, `${field}.${key}`, errors, lookup);
  } else if (!schema.check(value)) fail(schema.message);
  else if (schema.collection && lookup && !lookup(schema.collection, value)) fail(`references a missing ${schema.collection} record`);
}

/** Returns field-specific errors without changing input. lookup(collection, id) is optional. */
export function validationErrors(collection, document, lookup) {
  if (!Object.hasOwn(SCHEMAS, collection)) return ['Unknown collection'];
  const errors = [];
  validate(document, obj({ ...metadata, ...SCHEMAS[collection] }), collection, errors, lookup);
  if (errors.length) return errors;
  const fail = (key, message) => errors.push(`${collection}.${key}: ${message}`);
  if (collection === 'employees') {
    if (document.id && document.managerId === document.id) fail('managerId', 'cannot be the employee themself');
    if (document.status === 'left' && !document.leaveDate) fail('leaveDate', 'is required for employees who have left');
    if (document.leaveDate && document.leaveDate < document.hireDate) fail('leaveDate', 'cannot be before hireDate');
    if (lookup && document.id) {
      const seen = new Set([document.id]);
      let manager = document.managerId;
      while (manager) {
        if (seen.has(manager)) { fail('managerId', 'would create a management cycle'); break; }
        seen.add(manager); manager = lookup('employees', manager)?.managerId;
      }
    }
  }
  if (collection === 'departments' && document.id && lookup) {
    const seen = new Set([document.id]);
    let parent = document.parentId;
    while (parent) {
      if (seen.has(parent)) { fail('parentId', 'would create a department cycle'); break; }
      seen.add(parent); parent = lookup('departments', parent)?.parentId;
    }
  }
  if (collection === 'positions') for (const [min, max] of [['salaryMin', 'salaryMax'], ['minYears', 'maxYears']]) {
    if (document[min] != null && document[max] != null && document[min] > document[max]) fail(max, `cannot be less than ${min}`);
  }
  if (collection === 'surveys' && document.scope !== 'all' && lookup && !lookup('departments', document.scope)) fail('scope', 'must be all or an existing department');
  if (collection === 'idps') {
    for (const key of document.mode === 'retention' ? ['startedAt', 'reviewDue', 'baseline', 'actions', 'reviews'] : ['focus']) if (document[key] === undefined) fail(key, 'is required');
  }
  if (collection === 'raci') {
    if (document.rolesEn && document.rolesEn.length !== document.roles.length) fail('rolesEn', 'must match the number of roles');
    document.steps.forEach((step, i) => { if (step.cells.length !== document.roles.length) fail(`steps[${i}].cells`, 'must match the number of roles'); });
  }
  for (const [field, key] of ({ candidates: [['interviews', 'id']], succession: [['successors', 'employeeId']], onboarding: [['tasks', 'id']] }[collection] || [])) {
    const values = (document[field] || []).map(v => v[key]);
    if (new Set(values).size !== values.length) fail(field, `contains duplicate ${key} values`);
  }
  return errors;
}
