import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSurveyResults } from '../server/survey-results.js';
import { MODELS, scoreSurvey } from '../public/js/engine/diagnosis.js';

const survey = { id: 'vprivacy', model: 'engagement', scope: 'all' };
const answers = (value) => Object.fromEntries(MODELS.engagement.dims.flatMap((dim) => dim.items.map((item) => [item.id, value])));
const group = (deptId, count, value = 4, extra = {}) => Array.from({ length: count }, (_, i) => ({
  id: `private-${deptId}-${i}`, surveyId: survey.id, deptId, answers: answers(value), enps: 9,
  comment: 'PRIVATE COMMENT', createdAt: '2026-10-31 12:00:00', createdBy: 'PRIVATE PERSON', ...extra,
}));

test('four replies expose no scores or department information; five release aggregates', () => {
  const hidden = buildSurveyResults(survey, group('small', 4));
  assert.equal(hidden.totalResponses, 4);
  assert.equal(hidden.n, 0);
  assert.equal(hidden.suppressed, true);
  assert.equal(hidden.overall, null);
  assert.equal(hidden.enps, null);
  assert.deepEqual(hidden.depts, []);
  assert.ok(hidden.dims.every((dim) => dim.mean === null && dim.items.every((item) => item.mean === null)));
  assert.equal(JSON.stringify(hidden).includes('small'), false);
  const visible = buildSurveyResults(survey, group('large', 5));
  assert.equal(visible.n, 5);
  assert.equal(visible.suppressed, false);
  assert.equal(visible.overall, 4);
  assert.equal(visible.enps.score, 100);
  assert.equal(visible.depts[0].deptId, 'large');
});

test('hidden groups cannot be recovered by subtracting visible department scores', () => {
  const visible = group('large', 5);
  const first = buildSurveyResults(survey, [...visible, ...group('small', 1, 1, { enps: 0 })]);
  const second = buildSurveyResults(survey, [...visible, ...group('small', 1, 5, { enps: 10 })]);
  assert.deepEqual(first, second, 'changing a hidden response must not change any published value');
  assert.equal(first.overall, 4);
  assert.equal(first.n, 5);
  assert.equal(first.totalResponses, 6);
  assert.equal(first.excludedResponses, 1);
  assert.equal(first.depts.length, 1);
});

test('sparse items and eNPS are excluded from every aggregate before scoring', () => {
  const rows = group('large', 5);
  rows.forEach((row, i) => {
    delete row.answers.basic1;
    delete row.enps;
    if (i === 0) { row.answers.basic1 = 1; row.enps = 0; }
  });
  const before = structuredClone(rows);
  const first = buildSurveyResults(survey, rows);
  assert.deepEqual(rows, before, 'aggregation must not mutate stored responses');
  assert.equal(first.dims[0].items.find((item) => item.id === 'basic1').mean, null);
  assert.equal(first.enps, null);
  assert.equal(first.dims[0].mean, 4);
  assert.equal(first.depts[0].dims.basic, 4);
  rows[0].answers.basic1 = 5;
  rows[0].enps = 10;
  assert.deepEqual(buildSurveyResults(survey, rows), first);
});

test('a sparse item in one department is excluded even when another department makes the total five', () => {
  const rows = [...group('a', 5), ...group('b', 5, 1)];
  rows.slice(6).forEach((row) => { delete row.answers.basic0; delete row.enps; });
  const first = buildSurveyResults(survey, rows);
  assert.equal(first.dims[0].items[0].n, 5);
  assert.equal(first.dims[0].items[0].mean, 4);
  assert.equal(first.enps.n, 5);
  rows[5].answers.basic0 = 5;
  rows[5].enps = 0;
  assert.deepEqual(buildSurveyResults(survey, rows), first);
});

test('anonymous department groups and separate survey rounds cannot bypass the threshold', () => {
  const rows = [...group(undefined, 4), ...group('named', 4), ...group('named', 4, 2, { surveyId: 'another-round' })];
  assert.equal(buildSurveyResults(survey, rows).n, 0);
  rows.push(...group(undefined, 1));
  const result = buildSurveyResults(survey, rows);
  assert.equal(result.n, 5);
  assert.equal(result.totalResponses, 9);
  assert.deepEqual(result.depts, []);
  const scoped = { ...survey, scope: 'named' };
  assert.equal(buildSurveyResults(scoped, group(undefined, 1)).suppressed, true);
  assert.equal(buildSurveyResults(scoped, [...group(undefined, 2), ...group('named', 3)]).n, 5);
});

test('complete eligible groups preserve scoring, without raw text, identifiers or timestamps', () => {
  const rows = [...group('a', 5), ...group('b', 5, 2, { enps: 3 })];
  const result = buildSurveyResults(survey, rows);
  const expected = scoreSurvey(survey.model, rows);
  for (const key of ['overall', 'band', 'dims', 'depts', 'enps', 'strengths', 'issues', 'divergent']) assert.deepEqual(result[key], expected[key]);
  assert.deepEqual(result.comments, []);
  assert.equal(result.privacy.commentsWithheld, true);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|private-|2026-10-31|createdAt|createdBy|answers/);
});
