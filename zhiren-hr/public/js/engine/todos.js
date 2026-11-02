// Personal work queue. Input must already be filtered by the API's access rules;
// ownership here narrows that visible data and never grants additional access.
import { dueDate, TICKET_TYPES } from './service.js';

export const TODO_CATEGORIES = {
  interviews: { name: ['面试评分', 'Interview feedback'], icon: 'briefcase' },
  tickets: { name: ['服务请求', 'Service requests'], icon: 'inbox' },
  development: { name: ['发展行动', 'Development actions'], icon: 'book' },
  retention: { name: ['留任行动与评估', 'Retention actions & reviews'], icon: 'heart' },
};
export const TODO_BUCKETS = {
  overdue: { name: ['已逾期', 'Overdue'], tone: 'danger' },
  today: { name: ['今天', 'Today'], tone: 'warn' },
  soon: { name: ['未来 7 天', 'Next 7 days'], tone: 'info' },
  later: { name: ['稍后', 'Later'], tone: '' },
  undated: { name: ['无有效日期', 'No valid date'], tone: '' },
};
const list = value => Array.isArray(value) ? value.filter(v => v && typeof v === 'object') : [];
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : null;
};
const daysUntil = (due, today) => (Date.parse(due) - Date.parse(today)) / 86400000;
const owner = (explicit, fallback) => typeof explicit === 'string' && explicit.trim() ? explicit : fallback;
export const hasInterviewFeedback = interview => ['strong_yes', 'yes', 'no', 'strong_no'].includes(interview.recommendation)
  && Object.values(interview.scores || {}).length > 0
  && Object.values(interview.scores || {}).every(v => Number.isInteger(v) && v >= 1 && v <= 5);
// Interviews that have taken place without feedback, for candidates still in the process.
export const unscoredInterviews = (candidates, today) => list(candidates)
  .filter((c) => ['applied', 'screen', 'interview', 'offer'].includes(c.stage))
  .flatMap((c) => list(c.interviews).filter((i) => i.date < today && !hasInterviewFeedback(i)).map((i) => ({ c, i })));
const label = (document, field = 'name') => [document?.[field] || '—', document?.[`${field}En`] || document?.[field] || '—'];
const pathId = id => encodeURIComponent(id);

/** Pure, deterministic aggregation. today must be an explicit YYYY-MM-DD date. */
export function buildTodos(data = {}, actorId, today) {
  data ||= {};
  const employees = new Map(list(data.employees).map(employee => [employee.id, employee]));
  const actor = employees.get(actorId);
  if (!actorId || !actor || actor.status === 'left' || !date(today)) return [];
  const items = [], seen = new Set();
  const add = item => {
    if (seen.has(item.key)) return;
    seen.add(item.key);
    item.due = date(item.due);
    const days = item.due ? daysUntil(item.due, today) : null;
    item.bucket = days === null ? 'undated' : days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'soon' : 'later';
    items.push(item);
  };
  for (const candidate of list(data.candidates)) {
    if (!candidate.id || !['applied', 'screen', 'interview', 'offer'].includes(candidate.stage)) continue;
    list(candidate.interviews).forEach((interview, index) => {
      if (interview.interviewerId !== actorId || hasInterviewFeedback(interview)) return;
      add({ key: `interview:${candidate.id}:${interview.id || index}`, category: 'interviews', kind: 'interview',
        title: ['完成面试评分', 'Complete interview feedback'], subject: label(candidate), round: interview.round,
        due: interview.date, href: `#/recruit/pipeline/${pathId(candidate.id)}` });
    });
  }
  for (const ticket of list(data.tickets)) {
    if (!ticket.id || ticket.assigneeId !== actorId || !['open', 'in_progress'].includes(ticket.status)) continue;
    const created = date(typeof ticket.createdAt === 'string' ? ticket.createdAt.slice(0, 10) : null);
    add({ key: `ticket:${ticket.id}`, category: 'tickets', kind: 'ticket', title: label(ticket, 'title'),
      subject: employees.has(ticket.requesterId) ? label(employees.get(ticket.requesterId)) : null,
      due: created && TICKET_TYPES[ticket.type] ? dueDate(created, TICKET_TYPES[ticket.type].sla) : null,
      href: `#/service/requests/${pathId(ticket.id)}` });
  }
  for (const plan of list(data.idps)) {
    const employee = employees.get(plan.employeeId);
    if (!plan.id || plan.status !== 'active' || !employee || employee.status === 'left') continue;
    if (plan.mode === 'retention') {
      list(plan.actions).forEach((action, index) => {
        if (action.done || owner(action.ownerId, employee.managerId) !== actorId) return;
        add({ key: `retention-action:${plan.id}:${index}`, category: 'retention', kind: 'retention-action',
          title: action.text || ['落实留任行动', 'Complete retention action'], subject: label(employee), due: action.due,
          href: `#/learning/idp/${pathId(plan.id)}` });
      });
      const reviewDue = date(plan.reviewDue);
      const reviewed = list(plan.reviews).some(review => String(review.checkpoint) === '90' && date(review.date) && review.date <= today);
      if (owner(plan.createdBy, employee.managerId) === actorId && reviewDue && daysUntil(reviewDue, today) <= 30 && !reviewed) {
        add({ key: `retention-review:${plan.id}`, category: 'retention', kind: 'retention-review',
          title: ['完成 90 天留任评估', 'Complete the 90-day retention review'], subject: label(employee), due: reviewDue,
          href: `#/learning/eval?kind=retention&plan=${pathId(plan.id)}` });
      }
    } else {
      list(plan.focus).forEach((focus, focusIndex) => list(focus.actions).forEach((action, actionIndex) => {
        if (action.done || owner(action.ownerId, plan.employeeId) !== actorId) return;
        add({ key: `development:${plan.id}:${focusIndex}:${actionIndex}`, category: 'development', kind: 'development',
          title: action.text || ['完成发展行动', 'Complete development action'], subject: label(employee), due: action.due,
          href: `#/learning/idp/${pathId(plan.id)}` });
      }));
    }
  }
  const order = Object.keys(TODO_BUCKETS);
  return items.sort((a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket) || (a.due || '').localeCompare(b.due || '') || a.key.localeCompare(b.key));
}

export function summarizeTodos(items) {
  return {
    total: items.length,
    categories: Object.fromEntries(Object.keys(TODO_CATEGORIES).map(key => [key, items.filter(item => item.category === key).length])),
    buckets: Object.fromEntries(Object.keys(TODO_BUCKETS).map(key => [key, items.filter(item => item.bucket === key).length])),
  };
}
