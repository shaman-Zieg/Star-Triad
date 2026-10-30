// HR calculators. Statutory rules follow national PRC regulations; local rules may differ.
import { round, parseYmd } from './text.js';

// Paid annual leave by cumulative years of work (PRC Regulations on Paid Annual Leave),
// pro-rated for the first calendar year with the company.
export function annualLeave({ totalYears, joinDate, year }) {
  const yrs = Number(totalYears) || 0;
  const full = yrs >= 20 ? 15 : yrs >= 10 ? 10 : yrs >= 1 ? 5 : 0;
  let days = full;
  let prorated = false;
  if (joinDate && full) {
    const j = parseYmd(joinDate);
    const y = Number(year) || j.getFullYear();
    if (j.getFullYear() === y) {
      // (remaining calendar days / 365) x entitlement, fractions of a day dropped.
      const end = new Date(y, 11, 31);
      const remaining = Math.round((end - j) / 86400000) + 1;
      days = Math.floor((remaining / 365) * full);
      prorated = true;
    }
  }
  return { full, days, prorated };
}

// Overtime pay: hourly = monthly / 21.75 / 8; 150% weekdays, 200% rest days, 300% public holidays.
export function overtimePay({ monthly, weekday = 0, restday = 0, holiday = 0 }) {
  const hourly = (Number(monthly) || 0) / 21.75 / 8;
  const parts = {
    weekday: hourly * 1.5 * (Number(weekday) || 0),
    restday: hourly * 2 * (Number(restday) || 0),
    holiday: hourly * 3 * (Number(holiday) || 0),
  };
  return { hourly: round(hourly, 2), parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, round(v, 2)])), total: round(parts.weekday + parts.restday + parts.holiday, 2) };
}

// Salary band from a midpoint and a range spread ((max - min) / min).
export function salaryBand({ midpoint, spread }) {
  const mid = Number(midpoint) || 0;
  const s = (Number(spread) || 0) / 100;
  const min = (mid * 2) / (2 + s);
  const max = min * (1 + s);
  return { min: Math.round(min), mid: Math.round(mid), max: Math.round(max) };
}

export function compaRatio({ salary, midpoint, min, max }) {
  const sal = Number(salary) || 0;
  const mid = Number(midpoint) || 0;
  const cr = mid ? sal / mid : null;
  const penetration = Number(max) > Number(min) ? (sal - Number(min)) / (Number(max) - Number(min)) : null;
  let position = null;
  if (cr != null) position = cr < 0.9 ? 'below' : cr <= 1.1 ? 'at' : 'above';
  return { compa: cr == null ? null : round(cr, 3), penetration: penetration == null ? null : round(penetration * 100, 1), position };
}

// Annualized turnover and its estimated cost (replacement cost as a multiple of salary).
export function turnover({ leavers, startHeadcount, endHeadcount, months = 12, voluntary, avgSalary, costMultiple = 1 }) {
  const avg = ((Number(startHeadcount) || 0) + (Number(endHeadcount) || 0)) / 2;
  const rate = avg ? (Number(leavers) || 0) / avg : 0;
  const annual = rate * (12 / (Number(months) || 12));
  const vol = voluntary !== '' && voluntary != null ? (Number(voluntary) || 0) / (Number(leavers) || 1) : null;
  const cost = (Number(leavers) || 0) * (Number(avgSalary) || 0) * (Number(costMultiple) || 0);
  return { avgHeadcount: round(avg, 1), rate: round(rate * 100, 1), annualized: round(annual * 100, 1), voluntaryShare: vol == null ? null : round(vol * 100, 1), cost: Math.round(cost) };
}

// Recruiting funnel worked backwards from the number of hires needed.
export function recruitingFunnel({ hires, rates, costs = 0, daysToFill }) {
  const stages = ['applied', 'screen', 'interview', 'offer', 'hired'];
  const need = { hired: Number(hires) || 0 };
  for (let i = stages.length - 2; i >= 0; i--) {
    const r = (Number(rates[stages[i]]) || 100) / 100;
    need[stages[i]] = Math.ceil(need[stages[i + 1]] / (r || 1));
  }
  return { stages: stages.map((s) => ({ stage: s, count: need[s] })), costPerHire: need.hired ? Math.round((Number(costs) || 0) / need.hired) : null, daysToFill: Number(daysToFill) || null };
}

// Headcount plan: hires needed to reach a target given expected attrition.
export function headcountPlan({ current, growth, attrition }) {
  const cur = Number(current) || 0;
  const target = Math.round(cur * (1 + (Number(growth) || 0) / 100));
  const leavers = Math.round(((cur + target) / 2) * ((Number(attrition) || 0) / 100));
  return { target, leavers, hires: Math.max(0, target - cur + leavers) };
}

// ------------------------------------------------------------------ figures from live records
// Shared by the dashboard, structure analytics and the calculators so they always agree.

// Trailing-12-month turnover: leavers ÷ average of opening and closing headcount.
// Opening headcount is rebuilt as current active − joiners in the window + leavers in the window.
export function trailingTurnover(employees, today) {
  const from = `${parseYmd(today).getFullYear() - 1}${today.slice(4)}`;
  const active = employees.filter((e) => e.status !== 'left');
  const leavers = employees.filter((e) => e.status === 'left' && e.leaveDate >= from && e.leaveDate <= today);
  const hires = employees.filter((e) => e.hireDate >= from && e.hireDate <= today).length;
  const startHeadcount = active.length - hires + leavers.length;
  const avg = (startHeadcount + active.length) / 2;
  return {
    from, leavers, hires, startHeadcount, endHeadcount: active.length,
    voluntary: leavers.filter((e) => e.leaveType === 'voluntary').length,
    rate: avg ? leavers.length / avg : 0,
  };
}

export const FUNNEL_STAGES = ['applied', 'screen', 'interview', 'offer', 'hired'];

// How many candidates reached each stage. A rejected candidate counts up to the stage they were
// turned down at (`rejectedFrom`); records without it count as applied only.
export function stageReach(candidates) {
  const furthest = (c) => FUNNEL_STAGES.indexOf(c.stage === 'rejected' ? c.rejectedFrom || 'applied' : c.stage);
  return FUNNEL_STAGES.map((stage, i) => ({ stage, count: candidates.filter((c) => furthest(c) >= i).length }));
}

// Stage-to-stage conversion from those counts, keyed by the earlier stage (as recruitingFunnel expects).
export function funnelRates(candidates) {
  const reach = stageReach(candidates);
  return Object.fromEntries(reach.slice(0, -1).map((s, i) => [s.stage, { from: s.count, to: reach[i + 1].count, rate: s.count ? round((reach[i + 1].count / s.count) * 100, 0) : null }]));
}

// Seats still to fill on open requisitions (planned headcount minus people already hired for it).
export function openSeats(positions, candidates) {
  return positions.filter((p) => p.status === 'open')
    .reduce((a, p) => a + Math.max(0, (Number(p.headcount) || 0) - candidates.filter((c) => c.positionId === p.id && c.stage === 'hired').length), 0);
}
