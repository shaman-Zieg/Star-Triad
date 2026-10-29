import { flightRisk } from '../public/js/engine/talent.js';

// Existing nominations remain available as excluded history when risk rises.
// Only additions are subject to the hard gate, so editing a role or removing an
// excluded person is always possible. Evaluation independently excludes every
// high-risk nominee from ranking and coverage on every read.
export function successionNominationError(patch, previous, employeeById, today) {
  if (!Object.hasOwn(patch, 'successors')) return null;
  if (!Array.isArray(patch.successors)) return '继任名单必须为数组 / Successors must be an array';
  const existing = new Set((previous?.successors || []).map((n) => n.employeeId));
  const seen = new Set();
  for (const nominee of patch.successors) {
    const id = nominee?.employeeId;
    if (typeof id !== 'string' || !id) return '请选择继任员工 / Choose a successor';
    if (seen.has(id)) return '同一员工不能重复提名 / Duplicate successor nomination';
    seen.add(id);
    if (existing.has(id)) continue;
    const employee = employeeById(id);
    if (!employee || employee.status === 'left') return '不能提名已离职或不存在的员工 / Successor must be an active employee';
    if (id === (patch.incumbentId ?? previous?.incumbentId)) return '现任者不能继任自己的岗位 / The incumbent cannot succeed themselves';
    const risk = flightRisk(employee, today);
    if (risk?.level === 'high') return `${employee.name || id}：高流失风险，不得新增为继任候选；风险降低后可重新评估 / High flight risk: cannot be added as a successor; reassess when risk falls`;
  }
  return null;
}
