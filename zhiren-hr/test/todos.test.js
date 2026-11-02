import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTodos, summarizeTodos } from '../public/js/engine/todos.js';

const TODAY = '2026-11-01';
const employees = [
  { id: 'manager', name: '经理', nameEn: 'Manager', status: 'active' },
  { id: 'employee', name: '员工', nameEn: 'Employee', status: 'active', managerId: 'manager' },
  { id: 'hr', name: 'HR', status: 'active' },
  { id: 'departed', name: '已离职', status: 'left', managerId: 'manager' },
];
const action = (patch = {}) => ({ text: ['学习与实践', 'Learn and practice'], due: '2026-11-08', done: false, ...patch });
const development = (patch = {}) => ({ id: 'idp', employeeId: 'employee', mode: 'gap', status: 'active', focus: [{ competency: 'learning', actions: [action()] }], ...patch });
const retention = (patch = {}) => ({ id: 'retention', employeeId: 'employee', mode: 'retention', status: 'active', reviewDue: '2026-12-01', actions: [action()], reviews: [], ...patch });
const candidate = (patch = {}) => ({ id: 'candidate', name: '候选人', nameEn: 'Candidate', stage: 'interview', interviews: [{ id: 'iv1', interviewerId: 'manager', round: 'r1', date: TODAY, scores: {} }], ...patch });
const collect = (data, actor = 'manager', today = TODAY) => buildTodos({ employees, ...data }, actor, today);

test('only active assigned interviews without submitted feedback appear, linked to their candidate', () => {
  const items = collect({ candidates: [
    candidate(), candidate({ id: 'hired', stage: 'hired' }), candidate({ id: 'rejected', stage: 'rejected' }),
    candidate({ id: 'scored', interviews: [{ interviewerId: 'manager', scores: { professional: 4 }, recommendation: 'yes' }] }),
    candidate({ id: 'other', interviews: [{ interviewerId: 'hr', scores: {} }] }),
    candidate({ id: 'legacy', interviews: [{ id: 'iv2', interviewerId: 'manager', date: '2026-10-30', scores: { professional: null } }] }),
  ] });
  assert.deepEqual(items.map(item => item.key), ['interview:legacy:iv2', 'interview:candidate:iv1']);
  assert.equal(items[0].bucket, 'overdue');
  assert.equal(items[1].bucket, 'today');
  assert.equal(items[1].href, '#/recruit/pipeline/candidate');
  assert.deepEqual(items[1].subject, ['候选人', 'Candidate']);
});

test('a partially scored interview remains pending until its recommendation is submitted', () => {
  const entry = { id: 'ivpartial', interviewerId: 'manager', date: TODAY, scores: { professional: 4 }, recommendation: null };
  const data = { candidates: [candidate({ interviews: [entry] })] };
  assert.equal(collect(data).length, 1);
  entry.recommendation = 'yes';
  assert.equal(collect(data).length, 0);
});

test('assigned requests use working-day SLAs and exclude requester-only or resolved work', () => {
  const ticket = { id: 'ticket', title: '证明', titleEn: 'Certificate', type: 'leave', status: 'open', createdAt: '2026-10-30 12:00:00', requesterId: 'employee', assigneeId: 'manager' };
  const items = collect({ tickets: [ticket, { ...ticket, id: 'resolved', status: 'resolved' }, { ...ticket, id: 'own-request', requesterId: 'manager', assigneeId: 'hr' }, { ...ticket, id: 'invalid-date', createdAt: '2026-02-30 12:00:00' }] });
  assert.equal(items.length, 2);
  assert.equal(items[0].due, '2026-11-02', 'Friday plus one working day is Monday');
  assert.equal(items[0].bucket, 'soon');
  assert.equal(items[1].bucket, 'undated');
  assert.equal(items[0].href, '#/service/requests/ticket');
});

test('development ownership defaults to the employee and explicit ownerId takes priority', () => {
  const plan = development({ focus: [{ actions: [action(), action({ ownerId: 'manager' }), action({ done: true }), action({ ownerId: 'hr' })] }] });
  assert.deepEqual(collect({ idps: [plan] }).map(item => item.key), ['development:idp:0:1']);
  assert.deepEqual(collect({ idps: [plan] }, 'employee').map(item => item.key), ['development:idp:0:0']);
  assert.deepEqual(collect({ idps: [plan] }, 'hr').map(item => item.key), ['development:idp:0:3']);
  assert.equal(collect({ idps: [plan] })[0].href, '#/learning/idp/idp');
  assert.deepEqual(collect({ idps: [] }, 'hr'), [], 'ownership never retrieves records outside supplied API scope');
});

test('retention actions use explicit owners or the employee manager, never free-form owner text', () => {
  const plan = retention({ reviewDue: '2027-01-01', actions: [action({ owner: ['HR', 'HR'] }), action({ ownerId: 'hr' }), action({ done: true }), action({ ownerId: 'departed' })] });
  assert.deepEqual(collect({ idps: [plan] }).map(item => item.key), ['retention-action:retention:0']);
  assert.deepEqual(collect({ idps: [plan] }, 'hr').map(item => item.key), ['retention-action:retention:1']);
  assert.deepEqual(collect({ idps: [plan] }, 'employee'), []);
  assert.deepEqual(collect({ idps: [plan] }, 'departed'), []);
});

test('90-day reviews appear at the 30-day boundary for the creator, or manager when no creator', () => {
  const plans = [
    retention({ id: 'boundary', actions: [] }),
    retention({ id: 'future', reviewDue: '2026-12-02', actions: [] }),
    retention({ id: 'late', reviewDue: '2026-10-31', actions: [] }),
    retention({ id: 'creator', createdBy: 'hr', actions: [] }),
    retention({ id: 'no-date', reviewDue: 'invalid', actions: [] }),
  ];
  assert.deepEqual(collect({ idps: plans }).map(item => item.key), ['retention-review:late', 'retention-review:boundary']);
  const hr = collect({ idps: plans }, 'hr');
  assert.deepEqual(hr.map(item => item.key), ['retention-review:creator']);
  assert.equal(hr[0].href, '#/learning/eval?kind=retention&plan=creator');
});

test('a completed 90-day review clears the reminder; 30-day reviews and future-dated records do not', () => {
  const plan = retention({ actions: [], reviews: [{ checkpoint: '90', date: TODAY }] });
  assert.deepEqual(collect({ idps: [plan] }), []);
  assert.equal(collect({ idps: [{ ...plan, reviews: [{ checkpoint: '30', date: TODAY }] }] }).length, 1);
  assert.equal(collect({ idps: [{ ...plan, reviews: [{ checkpoint: '90', date: '2026-11-02' }] }] }).length, 1);
  assert.equal(collect({ idps: [{ ...plan, reviews: [{ checkpoint: '90', date: 'invalid' }] }] }).length, 1);
});

test('due groups distinguish overdue, today, next seven days, later and invalid dates', () => {
  const dates = ['2026-11-09', 'bad', '2026-11-08', TODAY, '2026-10-31', '2026-02-30'];
  const plan = development({ employeeId: 'manager', focus: [{ actions: dates.map(due => action({ due })) }] });
  const items = collect({ idps: [plan] });
  assert.deepEqual(items.map(item => item.bucket), ['overdue', 'today', 'soon', 'later', 'undated', 'undated']);
  assert.equal(items[2].due, '2026-11-08');
  assert.deepEqual(summarizeTodos(items), { total: 6, categories: { interviews: 0, tickets: 0, development: 6, retention: 0 }, buckets: { overdue: 1, today: 1, soon: 1, later: 1, undated: 2 } });
  assert.equal(collect({ idps: [plan] }, 'manager', '2026-11-08')[0].bucket, 'overdue');
});

test('empty identities, departed people, closed plans and malformed legacy arrays are safe', () => {
  assert.deepEqual(buildTodos({}, null, TODAY), []);
  assert.deepEqual(buildTodos(null, 'manager', TODAY), []);
  assert.deepEqual(collect({ idps: [development()] }, 'missing'), []);
  assert.deepEqual(collect({ idps: [development()] }, 'employee', 'bad'), []);
  assert.deepEqual(collect({ idps: [development({ status: 'completed' }), retention({ status: 'cancelled' }), retention({ employeeId: 'departed' }), retention({ employeeId: 'missing' })] }), []);
  assert.deepEqual(collect({ candidates: [null, candidate({ interviews: null })], tickets: null, idps: [null, development({ focus: null }), retention({ actions: null, reviews: null, reviewDue: '' })] }), []);
});

test('aggregation is stable, deduplicated and does not mutate source records', () => {
  const data = { employees, candidates: [candidate(), candidate()], idps: [development(), retention()] };
  const before = structuredClone(data);
  const first = buildTodos(data, 'manager', TODAY);
  assert.deepEqual(buildTodos(data, 'manager', TODAY), first);
  assert.equal(first.filter(item => item.kind === 'interview').length, 1);
  assert.deepEqual(data, before);
});

test('the dashboard reminder ignores candidates who have left the process', async () => {
  const { unscoredInterviews } = await import('../public/js/engine/todos.js');
  const interview = { id: 'i', interviewerId: 'x', date: '2026-10-01', scores: {}, recommendation: null };
  const scored = { ...interview, scores: { learning: 4 }, recommendation: 'yes' };
  const person = (stage, interviews = [interview]) => ({ id: stage, stage, interviews });
  const ids = (candidates, today = '2026-10-21') => unscoredInterviews(candidates, today).map((x) => x.c.id);
  assert.deepEqual(ids([person('interview'), person('rejected'), person('hired')]), ['interview']);
  assert.deepEqual(ids([person('interview', [scored])]), []);
  assert.deepEqual(ids([person('interview')], '2026-10-01'), [], 'not overdue on the day itself');
  assert.deepEqual(ids([{ id: 'none', stage: 'screen' }]), []);
});
