// App shell: navigation, routing, global search, acting user, language and theme.
import { html, setHTML, icon, logo, api, load, setActor, getActor, toast, initTooltips, loading, empty, avatar, personName, confirmDialog } from './core.js';
import { L, lang, setLang, loc } from './i18n.js';
import { setMeta, aiEnabled, aiHint } from './ai.js';

const MODULES = [
  { key: 'home', icon: 'home', name: ['工作台', 'Dashboard'], load: () => import('./views/home.js') },
  { group: ['招聘与人才', 'Hiring & talent'] },
  { key: 'recruit', icon: 'briefcase', name: ['智能招聘', 'Recruitment'], load: () => import('./views/recruit.js'), count: 'applied' },
  { key: 'talent', icon: 'grid', name: ['人才盘点', 'Talent review'], load: () => import('./views/talent.js') },
  { key: 'learning', icon: 'book', name: ['培训发展', 'Learning & growth'], load: () => import('./views/learning.js') },
  { group: ['组织与员工', 'Organization & people'] },
  { key: 'org', icon: 'pulse', name: ['组织诊断', 'Org diagnosis'], load: () => import('./views/org.js') },
  { key: 'service', icon: 'heart', name: ['员工服务', 'Employee services'], load: () => import('./views/service.js'), count: 'tickets' },
  { group: ['方法与工具', 'Methods & tools'] },
  { key: 'toolkit', icon: 'tool', name: ['HR 工具箱', 'HR toolkit'], load: () => import('./views/toolkit.js') },
];
const PUBLIC = { s: () => import('./views/survey.js') };

const state = { meta: null, employees: [], counts: {}, renderToken: 0 };
const appEl = document.getElementById('app');

function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [module = 'home', sub = '', id = ''] = path.split('/').map(decodeURIComponent);
  return { module: module || 'home', sub, id, query: Object.fromEntries(new URLSearchParams(query)) };
}

function shell() {
  const route = parseHash();
  const me = state.employees.find((e) => e.id === getActor());
  setHTML(appEl, html`<div class="app">
    <aside class="sidebar" aria-label="${L('主导航', 'Main navigation')}">
      <a class="brand" href="#/">${logo()}<span><strong>${L('知人', 'Zhiren')}</strong><small>${L('招聘 · 人才 · 组织发展', 'Hiring · Talent · OD')}</small></span></a>
      <nav class="nav">${MODULES.map((m) => (m.group
        ? html`<div class="nav-label">${L(...m.group)}</div>`
        : html`<a href="#/${m.key === 'home' ? '' : m.key}" class="${route.module === m.key ? 'active' : ''}" data-nav>${icon(m.icon)}<span>${L(...m.name)}</span>${m.count && state.counts[m.count] ? html`<span class="count">${state.counts[m.count]}</span>` : ''}</a>`))}</nav>
      <div class="sidebar-foot">
        ${aiEnabled() ? html`<div class="ai-pill" style="margin-top:4px" data-tip="Claude · ${state.meta?.ai?.model}"><span class="dot on"></span>${L('Claude 辅助已启用', 'Claude assistance on')}</div>` : ''}
        <div style="margin-top:6px">${L('星海科技 · 演示数据', 'Xinghai Tech · demo data')}</div>
        <div style="margin-top:6px"><a href="/api/export" download style="color:inherit">${L('导出数据', 'Export data')}</a>${state.meta?.demo ? html` · <a href="#" data-reset style="color:inherit">${L('重置演示数据', 'Reset demo')}</a>` : ''}</div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn menu-btn" type="button" data-menu aria-label="${L('打开菜单', 'Open menu')}">${icon('menu')}</button>
        <div class="search">${icon('search')}<input type="search" id="global-search" placeholder="${L('搜索员工、候选人、职位、制度…', 'Search people, candidates, jobs, policies…')}" autocomplete="off" aria-label="${L('全局搜索', 'Global search')}"><div class="search-menu" hidden></div></div>
        <div class="top-actions">
          <label class="actor" data-tip="${L('当前以此身份操作（用于记录操作人）', 'You act as this person (used for attribution)')}">${me ? avatar(me, 'xs') : icon('user')}<span>${L('身份', 'Acting as')}</span>
            <select id="actor-select" aria-label="${L('当前身份', 'Acting as')}">${actorOptions()}</select></label>
          <button class="btn btn-sm" type="button" data-lang aria-label="${L('Switch to English', '切换到中文')}">${lang() === 'en' ? '中文' : 'EN'}</button>
          <button class="icon-btn" type="button" data-theme aria-label="${L('切换深浅色', 'Toggle theme')}">${icon(isDark() ? 'sun' : 'moon')}</button>
        </div>
      </header>
      <main class="content" id="view" tabindex="-1"></main>
    </div>
  </div>`);
  wireShell();
}

function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t) return t === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function wireShell() {
  const app = appEl.querySelector('.app');
  appEl.querySelector('[data-menu]').addEventListener('click', () => app.classList.toggle('nav-open'));
  appEl.querySelectorAll('[data-nav]').forEach((a) => a.addEventListener('click', () => app.classList.remove('nav-open')));
  appEl.querySelector('[data-lang]').addEventListener('click', () => {
    setLang(lang() === 'en' ? 'zh' : 'en');
    shell();
    route();
  });
  appEl.querySelector('[data-theme]').addEventListener('click', (e) => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('zr-theme', next); } catch { /* ignore */ }
    setHTML(e.currentTarget, icon(next === 'dark' ? 'sun' : 'moon'));
  });
  appEl.querySelector('[data-reset]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!(await confirmDialog(L('将删除所有修改并重新生成演示数据，确定继续？', 'This deletes all changes and regenerates the demo data. Continue?'), { danger: true, confirmLabel: L('重置', 'Reset') }))) return;
    await api.post('/api/admin/reset', {});
    await reloadEmployees();
    toast(L('演示数据已重置', 'Demo data reset'));
    shell();
    route();
  });
  appEl.querySelector('#actor-select').addEventListener('change', (e) => {
    setActor(e.target.value);
    shell();
    route();
    toast(L('已切换身份', 'Switched user'));
  });
  wireSearch();
}

// ------------------------------------------------------------------ global search
let searchCache = null;
let searchAt = 0;
async function searchData() {
  if (searchCache && Date.now() - searchAt < 60_000) return searchCache;
  searchCache = await load('employees', 'candidates', 'positions', 'kb');
  searchAt = Date.now();
  return searchCache;
}
function wireSearch() {
  const box = appEl.querySelector('#global-search');
  const menu = appEl.querySelector('.search-menu');
  let items = [];
  let active = 0;
  const draw = () => {
    if (!items.length) {
      setHTML(menu, html`<div class="search-group">${L('没有匹配结果', 'No matches')}</div>`);
      menu.hidden = false;
      return;
    }
    let group = '';
    setHTML(menu, html`${items.map((it, i) => {
      const head = it.group !== group ? html`<div class="search-group">${it.group}</div>` : '';
      group = it.group;
      return html`${head}<a href="${it.href}" class="${i === active ? 'active' : ''}" data-i="${i}">${it.icon}<span>${it.title}<small>${it.sub}</small></span></a>`;
    })}`);
    menu.hidden = false;
  };
  let timer;
  box.addEventListener('input', () => {
    clearTimeout(timer);
    const q = box.value.trim().toLowerCase();
    if (!q) {
      menu.hidden = true;
      return;
    }
    timer = setTimeout(async () => {
      const d = await searchData().catch(() => null);
      if (!d) return;
      const hit = (...xs) => xs.some((x) => String(x || '').toLowerCase().includes(q));
      items = [
        ...d.employees.filter((e) => hit(e.name, e.nameEn, e.title, e.titleEn, e.empNo)).slice(0, 6).map((e) => ({ group: L('员工', 'People'), href: `#/service/people/${e.id}`, icon: avatar(e, 'xs'), title: personName(e), sub: `${loc(e, 'title')}${e.status === 'left' ? ` · ${L('已离职', 'Left')}` : ''}` })),
        ...d.candidates.filter((c) => hit(c.name, c.nameEn)).slice(0, 5).map((c) => ({ group: L('候选人', 'Candidates'), href: `#/recruit/pipeline/${c.id}`, icon: icon('user'), title: personName(c), sub: loc(d.positions.find((p) => p.id === c.positionId), 'title') })),
        ...d.positions.filter((p) => hit(p.title, p.titleEn)).slice(0, 4).map((p) => ({ group: L('职位', 'Jobs'), href: `#/recruit/positions/${p.id}`, icon: icon('briefcase'), title: loc(p, 'title'), sub: p.level })),
        ...d.kb.filter((a) => hit(a.title, a.titleEn, (a.tags || []).join(' '))).slice(0, 4).map((a) => ({ group: L('制度百科', 'Policies'), href: `#/service/kb/${a.id}`, icon: icon('file'), title: loc(a, 'title'), sub: '' })),
      ];
      active = 0;
      draw();
    }, 120);
  });
  box.addEventListener('keydown', (e) => {
    if (menu.hidden || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      draw();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      location.hash = items[active].href;
      menu.hidden = true;
      box.value = '';
    } else if (e.key === 'Escape') menu.hidden = true;
  });
  menu.addEventListener('mousedown', (e) => {
    const a = e.target.closest('a');
    if (a) {
      e.preventDefault();
      location.hash = a.getAttribute('href');
      menu.hidden = true;
      box.value = '';
    }
  });
  box.addEventListener('blur', () => setTimeout(() => { menu.hidden = true; }, 150));
}

// ------------------------------------------------------------------ routing
const actorOptions = () => html`${state.employees.filter((e) => e.status !== 'left').map((e) => html`<option value="${e.id}" ${e.id === getActor() ? 'selected' : ''}>${personName(e)} · ${loc(e, 'title')}</option>`)}`;
const signature = (emps) => emps.map((e) => `${e.id}|${e.name}|${e.nameEn}|${e.title}|${e.status}`).join(';');

// Keeps the shell's cached data (people list, nav badges) in step with changes made by others.
async function refreshShellData() {
  try {
    const [cands, tickets, emps] = await Promise.all([api.get('/api/candidates?stage=applied'), api.get('/api/tickets?status=open'), api.get('/api/employees')]);
    if (signature(emps) !== signature(state.employees)) {
      state.employees = emps;
      searchCache = null;
      const sel = appEl.querySelector('#actor-select');
      if (sel) setHTML(sel, actorOptions());
      const me = emps.find((e) => e.id === getActor());
      const av = appEl.querySelector('.actor .avatar');
      if (me && av) av.outerHTML = String(avatar(me, 'xs'));
    }
    const next = { applied: cands.length, tickets: tickets.length };
    const changed = JSON.stringify(next) !== JSON.stringify(state.counts);
    state.counts = next;
    if (changed) {
      appEl.querySelectorAll('[data-nav]').forEach((a) => {
        const m = MODULES.find((x) => a.getAttribute('href') === `#/${x.key === 'home' ? '' : x.key}`);
        if (!m?.count) return;
        let badge = a.querySelector('.count');
        if (!state.counts[m.count]) return badge?.remove();
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'count';
          a.appendChild(badge);
        }
        badge.textContent = state.counts[m.count];
      });
    }
  } catch { /* counts are decorative */ }
}

async function route() {
  const r = parseHash();
  const token = ++state.renderToken;
  if (PUBLIC[r.module]) {
    setHTML(appEl, html`<div class="public-wrap" id="view"></div>`);
    const mod = await PUBLIC[r.module]();
    return mod.default(appEl.querySelector('#view'), { ...r, rerender: route });
  }
  if (!appEl.querySelector('.app')) shell();
  appEl.querySelectorAll('[data-nav]').forEach((a) => {
    const key = (a.getAttribute('href').replace('#/', '') || 'home');
    a.classList.toggle('active', key === r.module);
  });
  const view = appEl.querySelector('#view');
  const mod = MODULES.find((m) => m.key === r.module);
  if (!mod) {
    setHTML(view, empty(L('页面不存在', 'Page not found'), '', 'alert', html`<a class="btn" href="#/">${L('返回工作台', 'Back to dashboard')}</a>`));
    return;
  }
  setHTML(view, loading());
  try {
    const m = await mod.load();
    if (token !== state.renderToken) return;
    await m.default(view, { ...r, rerender: () => route() });
    document.title = `${L(...mod.name)} · ${L('知人', 'Zhiren')}`;
  } catch (err) {
    console.error(err);
    if (token === state.renderToken) {
      setHTML(view, empty(L('加载失败', 'Could not load this page'), err.message, 'alert', html`<button class="btn" type="button" data-retry>${L('重试', 'Retry')}</button>`));
      view.querySelector('[data-retry]').addEventListener('click', () => route());
    }
  }
  refreshShellData();
}

async function boot() {
  initTooltips();
  try {
    state.meta = await api.get('/api/meta');
    setMeta(state.meta);
    state.employees = await api.get('/api/employees');
  } catch (err) {
    setHTML(appEl, html`<div class="public-wrap">${empty(L('无法连接服务器', 'Cannot reach the server'), err.message, 'alert')}</div>`);
    return;
  }
  if (!state.employees.some((e) => e.id === getActor())) {
    const hr = state.employees.find((e) => e.title === '人力资源总监') || state.employees[0];
    if (hr) setActor(hr.id);
  }
  window.addEventListener('hashchange', () => {
    const r = parseHash();
    if (!PUBLIC[r.module] && !appEl.querySelector('.app')) shell();
    route();
    window.scrollTo(0, 0);
  });
  if (!PUBLIC[parseHash().module]) shell();
  route();
}

// Lets views refresh the cached employee list after edits.
export async function reloadEmployees() {
  state.employees = await api.get('/api/employees');
  searchCache = null;
}

boot();
