import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { trailingTurnover, stageReach, funnelRates, openSeats } from '../public/js/engine/calc.js';
import { hrDepartmentIds, relatedCalculators, articleText, KB_ARTICLES } from '../public/js/engine/service.js';
import { scoreSurvey } from '../public/js/engine/diagnosis.js';

const TODAY = '2026-10-21';

test('trailing turnover uses leavers over the average of rebuilt opening and current headcount', () => {
  const employees = [
    ...Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, status: 'active', hireDate: '2020-01-01' })),
    { id: 'n1', status: 'active', hireDate: '2026-03-01' },
    { id: 'n2', status: 'active', hireDate: '2026-09-01' },
    { id: 'l1', status: 'left', hireDate: '2019-01-01', leaveDate: '2026-05-01', leaveType: 'voluntary' },
    { id: 'l2', status: 'left', hireDate: '2019-01-01', leaveDate: '2026-08-01', leaveType: 'involuntary' },
    { id: 'old', status: 'left', hireDate: '2018-01-01', leaveDate: '2025-06-01', leaveType: 'voluntary' },
    { id: 'future', status: 'left', hireDate: '2018-01-01', leaveDate: '2026-12-01', leaveType: 'voluntary' },
  ];
  const t = trailingTurnover(employees, TODAY);
  assert.equal(t.from, '2025-10-21');
  assert.deepEqual(t.leavers.map((e) => e.id), ['l1', 'l2'], 'only leavers inside the window, not future-dated ones');
  assert.equal(t.voluntary, 1);
  assert.equal(t.endHeadcount, 10);
  // Opening = 10 active − 2 joiners + 2 leavers = 10; 2 / ((10 + 10) / 2) = 20%.
  assert.equal(t.startHeadcount, 10);
  assert.equal(t.rate, 0.2);
});

test('funnel counts rejected candidates up to the stage they were turned down at', () => {
  const candidates = [
    { stage: 'applied' }, { stage: 'screen' }, { stage: 'interview' }, { stage: 'offer' }, { stage: 'hired' },
    { stage: 'rejected', rejectedFrom: 'interview' },
    { stage: 'rejected' },
  ];
  assert.deepEqual(stageReach(candidates).map((s) => s.count), [7, 5, 4, 2, 1]);
  const rates = funnelRates(candidates);
  assert.deepEqual(rates.applied, { from: 7, to: 5, rate: 71 });
  assert.deepEqual(rates.offer, { from: 2, to: 1, rate: 50 });
  assert.equal(funnelRates([]).applied.rate, null, 'no rate without candidates');
});

test('open seats subtract people already hired against each open requisition', () => {
  const positions = [{ id: 'p1', status: 'open', headcount: 3 }, { id: 'p2', status: 'open', headcount: 1 }, { id: 'p3', status: 'closed', headcount: 4 }];
  const candidates = [{ positionId: 'p1', stage: 'hired' }, { positionId: 'p2', stage: 'hired' }, { positionId: 'p2', stage: 'hired' }, { positionId: 'p1', stage: 'offer' }];
  assert.equal(openSeats(positions, candidates), 2);
});

test('the HR department is found by name, not by id', () => {
  const departments = [{ id: 'x1', name: '技术研发部', nameEn: 'Engineering' }, { id: 'x7', name: '人力资源部', nameEn: 'People & HR' }, { id: 'x9', name: 'Finance', nameEn: 'Finance' }];
  assert.deepEqual(hrDepartmentIds(departments), ['x7']);
  assert.deepEqual(hrDepartmentIds([{ id: 'h', name: 'Human Resources' }]), ['h']);
  assert.deepEqual(hrDepartmentIds([{ id: 'c', name: 'Chrome team' }]), [], 'no false match on "hr" inside a word');
});

test('policy questions and articles point to the matching calculator', () => {
  const keys = (text) => relatedCalculators(text).map((c) => c.key);
  assert.deepEqual(keys('我今年有几天年假？'), ['leave']);
  assert.deepEqual(keys('How is overtime pay calculated?'), ['overtime']);
  assert.deepEqual(keys('产假有多少天？'), []);
  assert.deepEqual(keys('flu symptoms'), [], '"pto" only matches as a word');
  const byId = Object.fromEntries(KB_ARTICLES.map((a) => [a.id, keys(articleText(a))]));
  assert.deepEqual(byId.a01, ['leave']);
  assert.deepEqual(byId.a04, ['overtime']);
  assert.deepEqual(byId.a02, [], 'maternity and marriage leave have no calculator');
});

test('demo data records rejection stages and a previous engagement round', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhiren-seed-'));
  process.env.ZHIREN_DB_PATH = path.join(dir, 'unused.db');
  const { generate } = await import('../server/seed.js');
  const data = generate(new Date(2026, 9, 21));
  const rejected = data.candidates.filter((c) => c.stage === 'rejected');
  assert.ok(rejected.length && rejected.every((c) => ['applied', 'interview'].includes(c.rejectedFrom)));
  const rounds = data.surveys.filter((s) => s.model === 'engagement' && s.scope === 'all').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  assert.equal(rounds.length, 2);
  const [prev, latest] = rounds.map((s) => scoreSurvey('engagement', data.responses.filter((r) => r.surveyId === s.id)));
  assert.ok(prev.n >= 30 && latest.n >= 30);
  const growth = (r) => r.dims.find((d) => d.key === 'growth').mean;
  assert.ok(growth(latest) < growth(prev), 'growth slips between rounds, so the trend view has a story to show');
});
