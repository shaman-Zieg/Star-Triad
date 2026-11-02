import * as db from './db.js';
import { AccessError } from './auth.js';

const full = user => !user || user.role === 'hr';
const pick = (doc, keys) => Object.fromEntries(keys.filter(k => Object.hasOwn(doc, k)).map(k => [k, doc[k]]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const deny = () => { throw new AccessError(403, 'Your role does not allow this operation.'); };
const only = (body, keys) => { if (Object.keys(body).some(k => !keys.includes(k))) deny(); };
export function employeeInScope(employee, user) {
  if (!employee) return false;
  if (full(user) || employee.id === user.employeeId) return true;
  const me = db.get('employees', user.employeeId);
  return user.role === 'manager' && (employee.managerId === user.employeeId || (me?.deptId && employee.deptId === me.deptId));
}
export function visible(col, doc, user) {
  if (full(user)) return true;
  switch (col) {
    case 'employees': case 'departments': case 'positions': case 'courses': case 'kb': case 'raci': return true;
    case 'candidates': return (doc.interviews || []).some(i => i.interviewerId === user.employeeId);
    case 'tickets': return doc.requesterId === user.employeeId || doc.assigneeId === user.employeeId;
    // A retention plan records that someone is a flight risk, so it is never shown to that person.
    case 'idps': return (doc.mode !== 'retention' || (user.role === 'manager' && doc.employeeId !== user.employeeId)) && employeeInScope(db.get('employees', doc.employeeId), user);
    case 'enrollments': return employeeInScope(db.get('employees', doc.employeeId), user);
    case 'onboarding': return doc.buddyId === user.employeeId || employeeInScope(db.get('employees', doc.employeeId), user);
    // Succession nominations and company-wide survey results remain HR-only.
    default: return false;
  }
}
export function readDocuments(col, docs, user) {
  return docs.filter(doc => visible(col, doc, user)).map(doc => {
    if (full(user)) return doc;
    if (col === 'employees' && !employeeInScope(doc, user)) return { ...pick(doc, ['id', 'name', 'nameEn', 'title', 'titleEn', 'deptId', 'managerId', 'location', 'status', 'email']), restricted: true };
    if (col === 'candidates') return { ...pick(doc, ['id', 'name', 'nameEn', 'positionId', 'stage', 'resume', 'createdAt', 'updatedAt']), interviews: (doc.interviews || []).filter(i => i.interviewerId === user.employeeId) };
    return doc;
  });
}

// Returns the authorized patch. Non-HR writers never control ownership or the
// authors of comments; nested-array permissions compare against stored data.
export function authorizeWrite(col, method, body, previous, user) {
  if (full(user)) return body;
  if (method === 'DELETE') deny();
  if (method === 'PUT' && (!previous || !visible(col, previous, user))) deny();
  if (col === 'employees' && method === 'PUT' && user.role === 'manager' && previous.id !== user.employeeId && employeeInScope(previous, user)) {
    only(body, ['performance', 'potential', 'perfHistory', 'competencies', 'agility', 'assessedAt']);
    return Object.hasOwn(body, 'assessedAt') ? { ...body, assessedAt: db.stamp().slice(0, 10) } : body;
  }
  if (col === 'candidates' && method === 'PUT') {
    only(body, ['interviews', 'stage', 'stageChangedAt']);
    const own = (previous.interviews || []).filter(i => i.interviewerId === user.employeeId);
    const incoming = body.interviews;
    if (!Array.isArray(incoming) || incoming.length !== own.length || incoming.some(i => !i || typeof i !== 'object' || i.interviewerId !== user.employeeId)) deny();
    // The existing UI replaces a pending scorecard with a new id. Require one
    // card per previously assigned round, preserving the assignment itself.
    const used = new Set();
    for (const card of incoming) {
      const index = own.findIndex((i, n) => !used.has(n) && i.round === card.round);
      if (index < 0) deny();
      used.add(index);
    }
    const others = (previous.interviews || []).filter(i => i.interviewerId !== user.employeeId);
    const result = { interviews: [...others, ...incoming] };
    if (['applied', 'screen'].includes(previous.stage) && body.stage === 'interview') Object.assign(result, { stage: 'interview', stageChangedAt: db.stamp().slice(0, 10) });
    else if (body.stage && body.stage !== previous.stage) deny();
    return result;
  }
  if (col === 'tickets') {
    if (method === 'POST') {
      only(body, ['type', 'title', 'detail', 'status', 'requesterId', 'assigneeId', 'comments']);
      if ((body.requesterId && body.requesterId !== user.employeeId) || body.assigneeId || (body.comments || []).length || (body.status && body.status !== 'open')) deny();
      return { ...body, requesterId: user.employeeId, assigneeId: null, status: 'open', comments: [] };
    }
    if (Object.hasOwn(body, 'assigneeId') && body.assigneeId === previous.assigneeId) { const { assigneeId, ...rest } = body; body = rest; }
    only(body, ['comments', 'status', 'resolvedAt']);
    const result = { ...body };
    if (body.comments) {
      const old = previous.comments || [];
      if (!Array.isArray(body.comments) || body.comments.length !== old.length + 1 || !same(body.comments.slice(0, -1), old) || !body.comments.at(-1) || typeof body.comments.at(-1) !== 'object') deny();
      result.comments = [...old, { by: user.employeeId, at: db.stamp(), text: body.comments.at(-1).text }];
    }
    if (body.status && !(body.status === 'resolved' || (previous.assigneeId === user.employeeId && ['open', 'in_progress'].includes(body.status)))) deny();
    if (body.resolvedAt || body.status === 'resolved') result.resolvedAt = db.stamp().slice(0, 10);
    return result;
  }
  if (col === 'idps') {
    const employeeId = previous?.employeeId || body.employeeId;
    if (typeof employeeId !== 'string' || !/^[a-z0-9]{1,24}$/i.test(employeeId)) deny();
    if (!employeeInScope(db.get('employees', employeeId), user)) deny();
    // Nobody sets their own development goals: a manager's own plan follows the employee rules below.
    if (user.role === 'manager' && employeeId !== user.employeeId) {
      if (method === 'POST' && body.mode === 'retention') return { employeeId, mode: 'retention' };
      only(body, method === 'POST' ? ['employeeId', 'period', 'status', 'mode', 'focus', 'name', 'nameEn'] : ['focus', 'actions', 'reviews', 'status', 'period']);
      return body;
    }
    if (method !== 'PUT' || previous.mode === 'retention' || ['completed', 'cancelled'].includes(previous.status)) deny();
    only(body, ['focus']);
    if (!Array.isArray(body.focus) || body.focus.some(f => !f || !Array.isArray(f.actions) || f.actions.some(a => !a || typeof a !== 'object'))) deny();
    const eraseDone = fs => fs?.map(f => ({ ...f, actions: f.actions?.map(a => { const { done, ...rest } = a; return rest; }) }));
    if (!same(eraseDone(body.focus), eraseDone(previous.focus))) deny();
    return body;
  }
  if (col === 'enrollments' && method === 'PUT' && previous.employeeId === user.employeeId) {
    only(body, ['status', 'progress', 'completedAt']);
    return body;
  }
  if (col === 'onboarding' && method === 'PUT') {
    only(body, ['tasks']);
    if (!Array.isArray(body.tasks) || body.tasks.some(t => !t || typeof t !== 'object')) deny();
    const withoutDone = tasks => tasks.map(t => { const { done, ...rest } = t; return rest; });
    if (!same(withoutDone(body.tasks), withoutDone(previous.tasks || []))) deny();
    const employee = db.get('employees', previous.employeeId);
    body.tasks.forEach((task, index) => {
      if (task.done === previous.tasks[index].done) return;
      const owns = task.owner === 'newhire' && previous.employeeId === user.employeeId
        || task.owner === 'buddy' && previous.buddyId === user.employeeId
        || task.owner === 'manager' && user.role === 'manager' && employee?.managerId === user.employeeId;
      if (!owns) deny();
    });
    return body;
  }
  deny();
}

export function publicSurvey(survey, departments) {
  return { survey: pick(survey, ['id', 'title', 'titleEn', 'model', 'scope', 'status']), departments: departments
    .filter(d => survey.scope === 'all' || survey.scope === d.id).map(d => pick(d, ['id', 'name', 'nameEn'])) };
}
