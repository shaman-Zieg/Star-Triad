import { parseResume, matchCandidate } from './resume.js';
import { parseYmd } from './text.js';

export function hiringGap(position, candidates, today) {
  const hired = candidates.filter(c => c.positionId === position.id && c.stage === 'hired').length;
  const days = Math.floor((parseYmd(today) - parseYmd(position.openedAt || position.createdAt)) / 86400000);
  const remaining = Math.max(0, Number(position.headcount) - hired);
  return { days, remaining, urgent: position.status === 'open' && position.priority === 'high' && days > 30 && remaining > 0 };
}

// Unknown hard requirements do not count as a pass. Never change the application.
export function crossRoleRecommendations(position, candidates, today, lang = 'zh') {
  if (!hiringGap(position, candidates, today).urgent) return [];
  return candidates.filter(c => c.positionId !== position.id && ['applied', 'screen', 'interview', 'rejected', 'talent_pool'].includes(c.stage))
    .flatMap(candidate => {
      const parsed = parseResume(candidate.resume || '', parseYmd(today));
      if (parsed.years < (Number(position.minYears) || 0) || parsed.education < (Number(position.education) || 0)) return [];
      if ((position.skills || []).some(skill => !parsed.skills.includes(skill))) return [];
      const match = matchCandidate(parsed, position, lang);
      return [{ candidate, parsed, match }];
    }).sort((a, b) => b.match.score - a.match.score || a.candidate.id.localeCompare(b.candidate.id)).slice(0, 3);
}
