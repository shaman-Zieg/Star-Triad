// Lightweight charts (HTML + inline SVG): horizontal bars, columns, radar,
// heatmap and a 100% stacked bar. Every chart has hover tooltips via data-tip
// and a "view as table" fallback. Colors come from CSS tokens (see app.css).
import { html, raw, esc, fmt } from './core.js';
import { L } from './i18n.js';

export const dataTable = (head, rows) => html`<details class="chart-table"><summary>${L('以表格查看', 'View as table')}</summary>
  <div class="table-wrap"><table class="table table-compact"><thead><tr>${head.map((h, i) => html`<th class="${i ? 'num' : ''}">${h}</th>`)}</tr></thead>
  <tbody>${rows.map((r) => html`<tr>${r.map((c, i) => html`<td class="${i ? 'num' : ''}">${c}</td>`)}</tr>`)}</tbody></table></div></details>`;

// rows: [{ label, value, cls?, tip? }]; cls picks the bar color (seq-1..5, ok, warn, danger, s2).
export function hbars(rows, { format = (v) => fmt.num(v), head = ['', L('数值', 'Value')], max, table = true } = {}) {
  const top = max ?? (Math.max(0, ...rows.map((r) => r.value)) || 1);
  return html`<div class="chart">
    ${rows.map((r) => html`<div class="hbar-row"><span class="hbar-label" title="${r.label}">${r.label}</span>
      <span class="hbar-track"><span class="hbar-bar ${r.cls || ''}" tabindex="0" style="width:${((Math.max(0, r.value) / top) * 82).toFixed(1)}%" data-tip="${r.tip || `${r.label}: ${format(r.value)}`}"></span><span class="hbar-value">${format(r.value)}</span></span></div>`)}
    ${table ? dataTable(head, rows.map((r) => [r.label, format(r.value)])) : ''}
  </div>`;
}

function niceScale(max) {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const rough = max / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * mag >= rough) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let t = 0; t <= top + step / 2; t += step) ticks.push(Math.round(t * 100) / 100);
  return { top, ticks };
}

// groups = [{ label, tip, values: [..] }], series = [{ name, cls: 's1' | 's2' }]
export function columns(groups, series, { format = (v) => fmt.num(v), head } = {}) {
  const { top, ticks } = niceScale(Math.max(0, ...groups.flatMap((g) => g.values)));
  return html`<div class="chart">
    ${series.length > 1 ? html`<div class="legend">${series.map((s) => html`<span><i class="${s.cls}"></i>${s.name}</span>`)}</div>` : ''}
    <div class="cols">
      <div class="cols-grid">${ticks.map((t) => html`<div style="bottom:${((t / top) * 100).toFixed(2)}%"><span>${fmt.num(t)}</span></div>`)}</div>
      <div class="cols-bars">${groups.map((g) => html`<div class="col-group" tabindex="0" data-tip="${g.tip || g.label}\n${series.map((s, i) => `${s.name}: ${format(g.values[i])}`).join('\n')}">
        ${g.values.map((v, i) => html`<span class="col ${series[i].cls}" style="height:${((v / top) * 100).toFixed(2)}%"></span>`)}</div>`)}</div>
    </div>
    <div class="cols-x">${groups.map((g) => html`<span>${g.label}</span>`)}</div>
    ${dataTable(head || ['', ...series.map((s) => s.name)], groups.map((g) => [g.tip || g.label, ...g.values.map(format)]))}
  </div>`;
}

// axes = [{ key, label }], series = [{ name, values: {key: n}, cls: 's1' | 's2' | 's3' }]
export function radar({ axes, series, max = 5, size = 340, format = (v) => fmt.num(v, 1) }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 58;
  const n = axes.length;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, v) => [cx + Math.cos(angle(i)) * r * (v / max), cy + Math.sin(angle(i)) * r * (v / max)];
  const rings = Array.from({ length: max }, (_, k) => k + 1);
  const svg = [];
  svg.push(`<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(series.map((s) => s.name).join(' / '))}">`);
  for (const k of rings) svg.push(`<polygon class="grid-line" points="${axes.map((_, i) => pt(i, k).join(',')).join(' ')}"/>`);
  axes.forEach((a, i) => {
    const [x, y] = pt(i, max);
    svg.push(`<line class="axis-line" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`);
    const [lx, ly] = pt(i, max + 0.62);
    const anchor = Math.abs(lx - cx) < 4 ? 'middle' : lx > cx ? 'start' : 'end';
    svg.push(`<text class="axis-label" x="${lx}" y="${ly + 4}" text-anchor="${anchor}">${esc(a.label)}</text>`);
  });
  for (const k of rings) svg.push(`<text class="tick-label" x="${cx + 3}" y="${cy - (r * k) / max - 2}">${k}</text>`);
  for (const s of series) {
    const pts = axes.map((a, i) => pt(i, Math.max(0, Math.min(max, Number(s.values[a.key]) || 0))));
    svg.push(`<polygon class="area ${s.cls}" points="${pts.map((p) => p.join(',')).join(' ')}"/>`);
  }
  for (const s of series) {
    axes.forEach((a, i) => {
      const v = Number(s.values[a.key]) || 0;
      const [x, y] = pt(i, Math.max(0, Math.min(max, v)));
      svg.push(`<circle class="pt ${s.cls}" cx="${x}" cy="${y}" r="4"/>`);
    });
  }
  // Generous invisible hit targets per axis carry the tooltip for all series.
  axes.forEach((a, i) => {
    const [x, y] = pt(i, max * 0.72);
    const tip = `${a.label}\n${series.map((s) => `${s.name}: ${format(s.values[a.key])}`).join('\n')}`;
    svg.push(`<circle class="hit" cx="${x}" cy="${y}" r="${Math.max(16, r / 4)}" data-tip="${esc(tip)}" tabindex="0"/>`);
  });
  svg.push('</svg>');
  return html`<div class="chart radar">
    ${series.length > 1 ? html`<div class="legend">${series.map((s) => html`<span><i class="${s.cls === 's2' ? 'line2' : s.cls}"></i>${s.name}</span>`)}</div>` : ''}
    ${raw(svg.join(''))}
    ${dataTable(['', ...series.map((s) => s.name)], axes.map((a) => [a.label, ...series.map((s) => format(s.values[a.key]))]))}
  </div>`;
}

// Sequential (one hue) for magnitudes such as competency gaps.
export function seqColor(v, max) {
  if (v == null) return null;
  const steps = ['--seq-100', '--seq-200', '--seq-300', '--seq-400', '--seq-500', '--seq-600'];
  const i = Math.max(0, Math.min(steps.length - 1, Math.floor((v / max) * steps.length)));
  return { bg: `var(${steps[i]})`, dark: i >= 3 };
}
// Diverging around a neutral midpoint, for 1-5 survey scores (red low, blue high).
export function divColor(v, mid = 3.5, span = 1.2) {
  if (v == null) return null;
  const d = (v - mid) / span;
  const step = d <= -0.75 ? 'neg-3' : d <= -0.4 ? 'neg-2' : d <= -0.12 ? 'neg-1' : d < 0.12 ? 'mid' : d < 0.4 ? 'pos-1' : d < 0.75 ? 'pos-2' : 'pos-3';
  return { bg: `var(--div-${step})`, dark: step.endsWith('3') || step === 'neg-2' || step === 'pos-2' };
}

// rows: [{ label, cells: { key: value | null } }], cols: [{ key, label }]
export function heatmap({ rows, cols, color, format = (v) => fmt.num(v, 2), legend }) {
  return html`<div class="chart table-wrap">
    <table class="heatmap"><thead><tr><th></th>${cols.map((c) => html`<th>${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr><th class="row-h">${r.label}</th>${cols.map((c) => {
      const v = r.cells[c.key];
      if (v == null) return html`<td class="na" data-tip="${r.label} · ${c.label}: ${r.note || '—'}">—</td>`;
      const col = color(v);
      return html`<td tabindex="0" style="background:${col.bg};color:${col.dark ? '#fff' : 'var(--text)'}" data-tip="${r.label} · ${c.label}: ${format(v)}">${format(v)}</td>`;
    })}</tr>`)}</tbody></table>
    ${legend || ''}
  </div>`;
}

// parts: [{ label, value, cls: 'neg' | 'mid' | 'pos' }]
export function stackbar(parts, { format = (v) => fmt.num(v) } = {}) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return html`<div class="chart">
    <div class="legend">${parts.map((p) => html`<span><i style="background:var(--${p.cls === 'neg' ? 'div-neg-2' : p.cls === 'pos' ? 'div-pos-2' : 'axis'})"></i>${p.label}</span>`)}</div>
    <div class="stackbar">${parts.filter((p) => p.value > 0).map((p) => html`<span class="${p.cls}" style="flex:${p.value}" tabindex="0" data-tip="${p.label}: ${format(p.value)} (${Math.round((p.value / total) * 100)}%)">${p.value / total > 0.08 ? `${Math.round((p.value / total) * 100)}%` : ''}</span>`)}</div>
  </div>`;
}
