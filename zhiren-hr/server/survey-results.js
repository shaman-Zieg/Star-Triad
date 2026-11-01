// Only this projection may leave the server. Raw responses remain in storage.
import { MIN_GROUP, MODELS, scoreSurvey } from '../public/js/engine/diagnosis.js';

const validRating = (value) => Number.isInteger(value) && value >= 1 && value <= 5;
const validEnps = (value) => Number.isInteger(value) && value >= 0 && value <= 10;

export function buildSurveyResults(survey, responses = []) {
  const model = MODELS[survey.model];
  if (!model) throw new Error('Unknown survey model');
  const rows = responses.filter((response) => response.surveyId === survey.id);
  const groups = new Map();
  for (const response of rows) {
    // A department-scoped survey already reveals the department even when the
    // respondent chooses not to provide it. Treat the entire scope as one group.
    const deptId = survey.scope && survey.scope !== 'all' ? survey.scope : response.deptId || '';
    if (!groups.has(deptId)) groups.set(deptId, []);
    groups.get(deptId).push(response);
  }

  const itemIds = model.dims.flatMap((dim) => dim.items.map((item) => item.id));
  const publishable = [];
  for (const [deptId, group] of groups) {
    if (group.length < MIN_GROUP) continue;
    const eligibleItems = itemIds.filter((id) => group.filter((row) => validRating(row.answers?.[id])).length >= MIN_GROUP);
    const includeEnps = model.enps && group.filter((row) => validEnps(row.enps)).length >= MIN_GROUP;
    for (const row of group) {
      const answers = Object.fromEntries(eligibleItems.filter((id) => validRating(row.answers?.[id])).map((id) => [id, row.answers[id]]));
      const enps = includeEnps && validEnps(row.enps) ? row.enps : undefined;
      if (!Object.keys(answers).length && enps === undefined) continue;
      publishable.push({ ...(deptId && { deptId }), answers, ...(enps !== undefined && { enps }) });
    }
  }

  // Remove small groups and sparse answers BEFORE computing both the overall
  // and departmental scores. Otherwise subtraction can recover hidden groups.
  // The no-department group follows the same threshold. Never copy identifiers,
  // timestamps, attribution, or free-text comments into the public projection.
  const scored = scoreSurvey(survey.model, publishable);
  return {
    ...scored,
    surveyId: survey.id,
    totalResponses: rows.length,
    excludedResponses: rows.length - publishable.length,
    suppressed: !publishable.length,
    privacy: { minimumGroup: MIN_GROUP, commentsWithheld: true, eligibleGroupsOnly: true },
  };
}
