// Shared building blocks: safe HTML templating, API client, formatting, icons and UI widgets.
import { L, lang } from './i18n.js';

// ------------------------------------------------------------------ templating
// `html` escapes every interpolated value unless it is itself the result of `html`/`raw`.
export class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Safe(String(s ?? ''));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
function renderValue(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return esc(v);
}
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += renderValue(values[i]) + strings[i + 1];
  return new Safe(out);
}
export function attrs(obj) {
  return raw(Object.entries(obj)
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`))
    .join(' '));
}
export const setHTML = (el, content) => { el.innerHTML = String(content); };

// ------------------------------------------------------------------ acting user
const ACTOR_KEY = 'zr-actor';
let actorId = (() => {
  try { return localStorage.getItem(ACTOR_KEY) || ''; } catch { return ''; }
})();
export const getActor = () => actorId;
export function setActor(id) {
  actorId = id || '';
  try { localStorage.setItem(ACTOR_KEY, actorId); } catch { /* ignore */ }
}

// ------------------------------------------------------------------ API
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
async function request(method, url, body) {
  const opts = { method, headers: { Accept: 'application/json' } };
  if (actorId) opts.headers['X-Actor'] = actorId;
  if (method !== 'GET') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body || {});
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new ApiError(0, L('无法连接服务器，请检查网络后重试。', 'Could not reach the server. Check your connection and try again.'));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `${L('请求失败', 'Request failed')} (${res.status})`);
  return data;
}
export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b),
  put: (u, b) => request('PUT', u, b),
  del: (u) => request('DELETE', u),
};
export async function load(...cols) {
  const lists = await Promise.all(cols.map((c) => api.get(`/api/${c}`)));
  return Object.fromEntries(cols.map((c, i) => [c, lists[i]]));
}
export const byId = (arr) => Object.fromEntries((arr || []).map((x) => [x.id, x]));

// ------------------------------------------------------------------ dates & numbers
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const nowStamp = (d = new Date()) => `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export function parseDate(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
const loc = () => (lang() === 'en' ? 'en-US' : 'zh-CN');

export const fmt = {
  date: (s) => (s ? new Intl.DateTimeFormat(loc(), { year: 'numeric', month: 'short', day: 'numeric' }).format(parseDate(s)) : '—'),
  short: (s) => (s ? new Intl.DateTimeFormat(loc(), { month: 'short', day: 'numeric' }).format(parseDate(s)) : '—'),
  stamp: (s) => (s ? `${fmt.short(s)} ${String(s).slice(11, 16)}` : '—'),
  rel(s) {
    if (!s) return '—';
    const n = daysBetween(String(s).slice(0, 10), today());
    if (n === 0) return L('今天', 'today');
    if (n === 1) return L('昨天', 'yesterday');
    if (n > 1 && n < 31) return L(`${n} 天前`, `${n} days ago`);
    if (n < 0 && n > -31) return L(`${-n} 天后`, `in ${-n} days`);
    return fmt.date(s);
  },
  num: (n, digits = 0) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString(loc(), { minimumFractionDigits: digits, maximumFractionDigits: digits })),
  pct: (x, digits = 0) => (x == null ? '—' : `${(Number(x) * 100).toFixed(digits)}%`),
  money: (n) => (n == null ? '—' : `¥${Number(n).toLocaleString(loc(), { maximumFractionDigits: 0 })}`),
  tenure(hire) {
    const months = Math.max(0, Math.floor(daysBetween(hire, today()) / 30.44));
    const y = Math.floor(months / 12);
    const m = months % 12;
    if (!months) return L('本月入职', 'New this month');
    return lang() === 'en' ? [y ? `${y} yr` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ') : `${y ? `${y} 年` : ''}${m ? `${m} 个月` : ''}`;
  },
};

// ------------------------------------------------------------------ icons
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>',
  org: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12.5h18"/>',
  grid: '<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="9.5" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="3" y="9.5" width="5" height="5" rx="1"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><rect x="16" y="9.5" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><rect x="9.5" y="16" width="5" height="5" rx="1"/><rect x="16" y="16" width="5" height="5" rx="1"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5V4.5M8 7h8"/>',
  pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  heart: '<path d="M12 20s-7.5-4.6-9.2-9.3C1.7 7.5 3.8 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.2 0 5.3 3 4.2 6.2C19.5 15.4 12 20 12 20z"/>',
  tool: '<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3z"/><path d="M14.5 6.5 17 4l3 3-2.5 2.5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.8-3.8"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  alert: '<path d="M12 3.5l9 16H3z"/><path d="M12 10v4"/><circle cx="12" cy="16.8" r=".7" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.8" r=".7" fill="currentColor"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.2 4.2-6.5 8-6.5s7 2.3 8 6.5"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  message: '<path d="M4 5h16v11H9l-5 4z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.1-8 9-4.6-.9-8-4.5-8-9V6z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h0M16 12h0M8 16h2M12 16h0M16 16h0"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7"/>',
  inbox: '<path d="M3 13l2.5-8h13L21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
  'chevron-right': '<path d="M9 5l7 7-7 7"/>',
  'chevron-down': '<path d="M5 9l7 7 7-7"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .8c0 1.8-2.5 2.2-2.5 4"/><circle cx="12" cy="17.2" r=".7" fill="currentColor"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
};
export const icon = (name, cls = '') => raw(
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`,
);
export const logo = () => raw(
  '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#17876f"/><circle cx="16" cy="11" r="4.2" fill="#fff"/><path d="M7.5 25c1.2-5 4.6-7.6 8.5-7.6s7.3 2.6 8.5 7.6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="24.5" cy="8" r="2.2" fill="#9be8d2"/></svg>',
);

// ------------------------------------------------------------------ people & badges
export function initials(p) {
  const name = (lang() === 'en' ? p.nameEn : p.name) || p.name || '?';
  if (/[一-鿿]/.test(name)) return name.length >= 3 ? name.slice(-2) : name.slice(-2);
  const parts = name.split(/\s+/);
  return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase();
}
const hash = (s) => [...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0);
export const avatar = (p, size = 'md') => html`<span class="avatar avatar-${size} av-${hash(p.id || p.name) % 8}" aria-hidden="true">${initials(p)}</span>`;
export const personName = (p) => (p ? (lang() === 'en' && p.nameEn) || p.name : '—');
export const personLink = (p, sub) => (p ? html`<a class="person" href="#/service/people/${p.id}">${avatar(p, 'sm')}<span><strong>${personName(p)}</strong><small>${sub ?? ((lang() === 'en' && p.titleEn) || p.title || '')}</small></span></a>` : html`<span class="muted">—</span>`);
export const badge = (text, tone = '') => html`<span class="badge ${tone ? `badge-${tone}` : ''}">${text}</span>`;

// ------------------------------------------------------------------ layout helpers
export const pageHead = (title, sub, actions) => html`<header class="page-head"><div><h1>${title}</h1>${sub ? html`<p class="page-sub">${sub}</p>` : ''}</div>${actions ? html`<div class="page-actions">${actions}</div>` : ''}</header>`;
export function tabs(items, active, hrefFor) {
  return html`<nav class="tabs" role="tablist">${items.map(([key, label, count]) => html`<a role="tab" class="tab ${key === active ? 'active' : ''}" aria-selected="${key === active ? 'true' : 'false'}" href="${hrefFor(key)}">${label}${count ? html`<span class="tab-count">${count}</span>` : ''}</a>`)}</nav>`;
}
export const empty = (title, text, iconName = 'info', action = '') => html`<div class="empty">${icon(iconName)}<h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action}</div>`;
export const loading = () => html`<div class="view-loading"><span class="spinner"></span>${L('加载中…', 'Loading…')}</div>`;
export const meter = (value, max, tone = '') => html`<div class="meter ${tone}" role="progressbar" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}"><span style="width:${Math.max(0, Math.min(100, max ? (value / max) * 100 : 0)).toFixed(1)}%"></span></div>`;
export const callout = (tone, content, iconName) => html`<div class="callout callout-${tone}">${icon(iconName || (tone === 'ok' ? 'check' : tone === 'info' || tone === 'brand' ? 'info' : 'alert'))}<div>${content}</div></div>`;
export const method = (title, text) => html`<div class="method"><strong>${title}</strong> ${text}</div>`;
export const scoreRing = (v, tone = 'brand') => html`<div class="score-ring" style="--v:${Math.round(v)};--ring:var(--${tone === 'brand' ? 'brand' : `${tone}-mark`})"><span>${Math.round(v)}</span></div>`;

// ------------------------------------------------------------------ form controls
// Use `group: true` for composite controls (chip pickers, rating scales) so the wrapper is not a <label>.
export const field = (label, control, { hint, span = false, group = false } = {}) => (group
  ? html`<div class="field ${span ? 'span-2' : ''}" role="group"><span class="field-label">${label}</span>${control}${hint ? html`<span class="field-hint">${hint}</span>` : ''}</div>`
  : html`<label class="field ${span ? 'span-2' : ''}"><span class="field-label">${label}</span>${control}${hint ? html`<span class="field-hint">${hint}</span>` : ''}</label>`);
export const input = (name, o = {}) => html`<input class="input" ${attrs({
  name, type: o.type || 'text', value: o.value ?? '', required: o.required, placeholder: o.placeholder, min: o.min, max: o.max,
  step: o.step, autofocus: o.autofocus, maxlength: o.maxlength, autocomplete: o.autocomplete || 'off', id: o.id, disabled: o.disabled, list: o.list,
})}>`;
export const textarea = (name, o = {}) => html`<textarea class="input ${o.mono ? 'mono' : ''}" ${attrs({ name, rows: o.rows || 4, required: o.required, placeholder: o.placeholder, maxlength: o.maxlength, id: o.id })}>${o.value ?? ''}</textarea>`;
export function select(name, options, o = {}) {
  return html`<select class="input" ${attrs({ name, required: o.required, id: o.id })}>${o.placeholder != null ? html`<option value="">${o.placeholder}</option>` : ''}${options.map((opt) => {
    const [value, label] = Array.isArray(opt) ? opt : [opt, opt];
    return html`<option ${attrs({ value, selected: String(value) === String(o.value ?? '') })}>${label}</option>`;
  })}</select>`;
}
// Toggleable chips that write a comma-separated list into a hidden input.
export function chipSelect(name, options, selected = []) {
  const set = new Set(selected);
  return html`<div class="chips-input" data-chips="${name}"><input type="hidden" name="${name}" value="${[...set].join(',')}">${options.map(([v, label]) => html`<button type="button" class="chip-toggle ${set.has(v) ? 'on' : ''}" data-v="${v}" aria-pressed="${set.has(v) ? 'true' : 'false'}">${label}</button>`)}</div>`;
}
export function wireChips(root) {
  root.querySelectorAll('[data-chips]').forEach((box) => {
    if (box.dataset.wired) return;
    box.dataset.wired = '1';
    const hidden = box.querySelector('input[type=hidden]');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.chip-toggle');
      if (!b) return;
      b.classList.toggle('on');
      b.setAttribute('aria-pressed', b.classList.contains('on') ? 'true' : 'false');
      hidden.value = [...box.querySelectorAll('.chip-toggle.on')].map((x) => x.dataset.v).join(',');
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}
export const likert = (name, value, { min = 1, max = 5 } = {}) => html`<div class="likert" role="radiogroup">${Array.from({ length: max - min + 1 }, (_, i) => i + min).map((v) => html`<label><input type="radio" ${attrs({ name, value: v, checked: Number(value) === v })}><span>${v}</span></label>`)}</div>`;

export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value;
  }
  return out;
}
export const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

// ------------------------------------------------------------------ unsaved changes
// A view registers a check that returns true while it holds unsaved edits; the shell asks before leaving.
let leaveGuard = null;
export const setLeaveGuard = (fn) => { leaveGuard = fn; };
export const hasUnsavedChanges = () => Boolean(leaveGuard?.());

// ------------------------------------------------------------------ events
export function on(root, event, selector, handler) {
  root.addEventListener(event, (e) => {
    const el = e.target.closest(selector);
    if (el && root.contains(el)) handler(e, el);
  });
}

// Runs an async action with the trigger disabled; shows a toast on success or failure.
export async function act(btn, fn, success) {
  if (btn) btn.disabled = true;
  try {
    const result = await fn();
    if (success) toast(typeof success === 'function' ? success(result) : success);
    return result;
  } catch (err) {
    toast(err.message, 'error');
    return undefined;
  } finally {
    if (btn && btn.isConnected) btn.disabled = false;
  }
}

export function download(name, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(L('已复制', 'Copied'));
  } catch {
    toast(L('复制失败，请手动选择文本', 'Copy failed; select the text manually'), 'error');
  }
}

// ------------------------------------------------------------------ modal, confirm, toast
export function modal({ title, body, submitLabel, cancelLabel, onSubmit, onOpen, onClose, wide = false, danger = false, footer = true }) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  setHTML(backdrop, html`<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <form class="modal-form" novalidate>
      <header class="modal-head"><h2 id="modal-title">${title}</h2><button type="button" class="icon-btn" data-close aria-label="${L('关闭', 'Close')}">${icon('x')}</button></header>
      <div class="modal-body">${body}<div class="form-error" role="alert" hidden></div></div>
      ${footer ? html`<footer class="modal-foot"><button type="button" class="btn" data-close>${onSubmit ? cancelLabel || L('取消', 'Cancel') : L('关闭', 'Close')}</button>${onSubmit ? html`<button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${submitLabel || L('保存', 'Save')}</button>` : ''}</footer>` : ''}
    </form></div>`);
  root.appendChild(backdrop);
  const form = backdrop.querySelector('form');
  const error = backdrop.querySelector('.form-error');
  const previous = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    if (previous && previous.isConnected) previous.focus();
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  const showError = (msg) => {
    error.textContent = msg;
    error.hidden = !msg;
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return close();
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    showError('');
    try {
      const keepOpen = await onSubmit(formValues(form), { form, close, showError });
      if (keepOpen !== false) close();
    } catch (err) {
      showError(err.message);
    } finally {
      submit.disabled = false;
    }
  });
  wireChips(form);
  onOpen?.(form, { close, showError });
  setTimeout(() => {
    const target = form.querySelector('[autofocus]') || form.querySelector('.modal-body input:not([type=hidden]):not([type=radio]), .modal-body select, .modal-body textarea') || form.querySelector('[type=submit]');
    target?.focus();
  }, 0);
  return { close, form, showError };
}

export function confirmDialog(message, { title, confirmLabel, danger = false } = {}) {
  return new Promise((resolve) => {
    let ok = false;
    modal({
      title: title || L('确认操作', 'Are you sure?'), body: html`<p>${message}</p>`, submitLabel: confirmLabel || L('确认', 'Confirm'), danger,
      onSubmit: () => { ok = true; },
      onClose: () => resolve(ok),
    });
  });
}

export function toast(message, tone = 'ok') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  setHTML(el, html`${icon(tone === 'error' ? 'alert' : 'check')}<span>${message}</span>`);
  root.appendChild(el);
  setTimeout(() => el.classList.add('out'), tone === 'error' ? 5000 : 3000);
  setTimeout(() => el.remove(), tone === 'error' ? 5400 : 3400);
}

// Shared tooltip for chart marks and other elements with data-tip.
export function initTooltips() {
  const tip = document.getElementById('tooltip');
  const show = (el, x, y) => {
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2))}px`;
    tip.style.top = `${y - r.height - 12 < 8 ? y + 18 : y - r.height - 12}px`;
  };
  document.addEventListener('mousemove', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el) show(el, e.clientX, e.clientY);
    else tip.hidden = true;
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    show(el, r.left + r.width / 2, r.top);
  });
  document.addEventListener('focusout', () => { tip.hidden = true; });
  window.addEventListener('scroll', () => { tip.hidden = true; }, true);
}
