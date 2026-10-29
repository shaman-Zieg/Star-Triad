// RACI matrix checks for cross-team processes.
// R = Responsible, A = Accountable, C = Consulted, I = Informed.

export const RACI = {
  R: ['负责执行', 'Responsible'],
  A: ['最终负责', 'Accountable'],
  C: ['咨询', 'Consulted'],
  I: ['知会', 'Informed'],
};

export function checkRaci(matrix) {
  const { roles = [], steps = [] } = matrix;
  const issues = [];
  steps.forEach((step, i) => {
    const cells = roles.map((_, j) => String(step.cells?.[j] || ''));
    const count = (letter) => cells.filter((c) => c.includes(letter)).length;
    const label = step.name || `#${i + 1}`;
    if (count('A') === 0) issues.push({ level: 'high', step: i, text: [`「${label}」没有最终负责人（A），出问题时无人拍板`, `"${label}" has no Accountable (A): nobody owns the decision`] });
    if (count('A') > 1) issues.push({ level: 'high', step: i, text: [`「${label}」有 ${count('A')} 个 A，最终负责人只能有一个`, `"${label}" has ${count('A')} As; there must be exactly one`] });
    if (count('R') === 0 && !cells.some((c) => c.includes('A'))) issues.push({ level: 'high', step: i, text: [`「${label}」没有执行人（R）`, `"${label}" has nobody Responsible (R)`] });
    else if (count('R') === 0) issues.push({ level: 'medium', step: i, text: [`「${label}」没有执行人（R），A 将默认承担执行`, `"${label}" has no R; the A will end up doing the work`] });
    if (count('R') > 3) issues.push({ level: 'medium', step: i, text: [`「${label}」执行人过多（${count('R')} 个），职责可能不清`, `"${label}" has ${count('R')} Rs; ownership may blur`] });
    if (count('C') > 3) issues.push({ level: 'low', step: i, text: [`「${label}」咨询方过多，可能拖慢决策`, `"${label}" consults many roles; decisions may slow down`] });
  });
  roles.forEach((role, j) => {
    const col = steps.map((s) => String(s.cells?.[j] || ''));
    if (steps.length && col.every((c) => !c)) issues.push({ level: 'low', role: j, text: [`角色「${role}」未参与任何环节，可考虑移除`, `Role "${role}" is not involved in any step; consider removing it`] });
    const a = col.filter((c) => c.includes('A')).length;
    if (steps.length >= 4 && a / steps.length > 0.6) issues.push({ level: 'medium', role: j, text: [`角色「${role}」承担了大部分 A，可能成为瓶颈，考虑授权`, `"${role}" is Accountable for most steps and may become a bottleneck; delegate`] });
  });
  return issues;
}
