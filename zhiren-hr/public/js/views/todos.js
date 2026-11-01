import { html, setHTML, load, getActor, today, personName, pageHead, empty, callout, icon, badge, fmt, on } from '../core.js';
import { L, tx } from '../i18n.js';
import { buildTodos, summarizeTodos, TODO_CATEGORIES, TODO_BUCKETS } from '../engine/todos.js';

const queueLink = (category = 'all', bucket = 'all') => {
  const query = new URLSearchParams();
  if (category !== 'all') query.set('kind', category);
  if (bucket !== 'all') query.set('when', bucket);
  return `#/todos${query.size ? `?${query}` : ''}`;
};

export default async function todos(el, ctx) {
  const actorId = getActor();
  if (!actorId) return setHTML(el, html`${pageHead(L('我的待办', 'My tasks'))}${empty(L('请先选择当前身份', 'Choose your acting identity first'), L('待办会按当前身份汇总。', 'Tasks are gathered for your current identity.'), 'user')}`);
  const data = await load('employees', 'candidates', 'tickets', 'idps');
  const actor = data.employees.find(employee => employee.id === actorId);
  const items = buildTodos(data, actorId, today()), summary = summarizeTodos(items);
  const category = Object.hasOwn(TODO_CATEGORIES, ctx.query?.kind) ? ctx.query.kind : 'all';
  const bucket = Object.hasOwn(TODO_BUCKETS, ctx.query?.when) ? ctx.query.when : 'all';
  const visible = items.filter(item => (category === 'all' || item.category === category) && (bucket === 'all' || item.bucket === bucket));
  setHTML(el, html`
    ${pageHead(L('我的待办', 'My tasks'), actor ? L(`${personName(actor)}，这里是仍需你处理的事项。`, `${personName(actor)}, here is the work that needs your attention.`) : '', html`<button class="btn" type="button" data-refresh>${icon('refresh')}${L('刷新', 'Refresh')}</button>`)}
    ${callout('info', L('仅显示你有权查看且由你负责的事项。留任评估在到期前 30 天出现；服务请求按工作日时效排序。进入详情完成后，待办会自动移除。', 'Only work you can access and are responsible for appears here. Retention reviews appear 30 days before their deadline; service requests use working-day SLAs. Complete work in its detail page to clear it from this list.'))}
    <div class="grid cols-4" style="margin:16px 0">
      ${Object.entries(TODO_CATEGORIES).map(([key, meta]) => html`<a class="card kpi tool-card" href="${queueLink(key)}" aria-current="${category === key ? 'page' : 'false'}"><span class="label">${icon(meta.icon)}${tx(meta.name)}</span><strong class="value">${summary.categories[key]}</strong><span class="sub">${L('查看待办', 'View tasks')}</span></a>`)}
    </div>
    <div class="row-between" style="margin-bottom:14px">
      <div class="row"><h2>${category === 'all' ? L('全部待办', 'All tasks') : tx(TODO_CATEGORIES[category].name)}</h2>${badge(L(`${visible.length} 项`, `${visible.length} tasks`))}${category !== 'all' || bucket !== 'all' ? html`<a class="btn btn-sm" href="#/todos">${L('显示全部', 'Show all')}</a>` : ''}</div>
      <label class="row small">${L('时间', 'Due')}<select class="input" style="width:auto" id="todo-when"><option value="all">${L('全部日期', 'All dates')}</option>${Object.entries(TODO_BUCKETS).map(([key, meta]) => html`<option value="${key}" ${key === bucket ? 'selected' : ''}>${tx(meta.name)}</option>`)}</select></label>
    </div>
    <div class="stack">${visible.length ? Object.entries(TODO_BUCKETS).map(([key, meta]) => {
      const group = visible.filter(item => item.bucket === key);
      return group.length ? html`<section class="card"><div class="card-head"><h2>${tx(meta.name)}</h2>${badge(group.length, meta.tone)}</div>
        ${group.map(item => html`<div class="list-item"><span aria-hidden="true">${icon(TODO_CATEGORIES[item.category].icon)}</span><div class="grow"><a href="${item.href}"><strong>${tx(item.title)}</strong></a><div class="meta">${item.subject ? tx(item.subject) : ''}${item.round ? ` · ${L('轮次', 'Round')} ${String(item.round).replace(/^r/, '')}` : ''} · ${tx(TODO_CATEGORIES[item.category].name)}</div></div><div class="row">${badge(item.due ? fmt.date(item.due) : L('待确认日期', 'Date needed'), meta.tone)}<a class="btn btn-sm" href="${item.href}" aria-label="${L('处理：', 'Open: ')}${tx(item.title)}">${L('去处理', 'Open')}${icon('chevron-right')}</a></div></div>`)}
      </section>` : '';
    }) : empty(actor?.status === 'left' ? L('当前身份已离职', 'This identity is no longer active') : summary.total ? L('这个筛选下没有待办', 'No tasks match this filter') : L('当前没有待办', 'You are up to date'), summary.total ? L('可以切换分类或日期查看其他事项。', 'Choose another category or date range to see other work.') : L('新面试、指派请求及未完成计划行动会显示在这里。', 'New interviews, assigned requests and unfinished plan actions will appear here.'), 'check')}
    </div>`);
  el.querySelector('#todo-when').addEventListener('change', event => { location.hash = queueLink(category, event.target.value); });
  on(el, 'click', '[data-refresh]', () => ctx.rerender());
}
