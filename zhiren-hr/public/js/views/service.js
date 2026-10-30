// Employee services: directory and profiles, service requests, policy library, HR assistant and onboarding.
import {
  html, setHTML, load, api, byId, icon, fmt, today, daysBetween, personName, personLink, avatar, badge, callout, pageHead, tabs, empty,
  modal, toast, act, field, input, textarea, select, on, meter, method, getActor, nowStamp,
} from '../core.js';
import { L, tx, loc, lang, LOCATIONS, LEAVE_REASONS, ENROLL_STATUS, RISK_LEVEL } from '../i18n.js';
import { TICKET_TYPES, TICKET_STATUS, dueDate, isOverdue, KB_CATEGORIES, searchKB, bestParagraph, OWNERS, PHASES, buildChecklist } from '../engine/service.js';
import { COMPETENCIES, LEVELS, targetProfile } from '../engine/competency.js';
import { BOXES, boxKey, flightRisk, PERF_SCALE } from '../engine/talent.js';
import { idpProgress } from '../engine/learning.js';
import { radar } from '../charts.js';
import { md } from '../md.js';
import { aiEnabled, streamAI } from '../ai.js';
import { mdToHtml } from '../md.js';
import { reloadEmployees } from '../app.js';

const SUBS = [
  ['people', ['员工档案', 'Directory']],
  ['requests', ['服务申请', 'Requests']],
  ['kb', ['制度百科', 'Policy library']],
  ['assistant', ['HR 智能助手', 'HR assistant']],
  ['onboarding', ['入职管理', 'Onboarding']],
];

export default async function service(el, ctx) {
  const sub = SUBS.some(([k]) => k === ctx.sub) ? ctx.sub : 'people';
  setHTML(el, html`${pageHead(L('员工服务', 'Employee services'), L('让员工自助获取信息、提交申请，让 HR 把时间花在更有价值的事情上。', 'Self-service answers and requests for employees, so HR can spend time where it matters.'))}
    ${tabs(SUBS.map(([k, n]) => [k, tx(n)]), sub, (k) => `#/service/${k}`)}`);
  const body = document.createElement('div');
  el.appendChild(body);
  await ({ people: peopleView, requests: requestsView, kb: kbView, assistant: assistantView, onboarding: onboardingView })[sub](body, ctx);
}

const typeBadge = (t) => badge(tx(TICKET_TYPES[t]?.name || [t, t]));
const statusBadge = (s) => badge(tx(TICKET_STATUS[s].name), TICKET_STATUS[s].tone);

// ------------------------------------------------------------------ directory & profiles
function employeeForm(e, d, onSaved) {
  const isNew = !e.id;
  modal({
    title: isNew ? L('新增员工', 'Add employee') : L(`编辑档案 · ${personName(e)}`, `Edit record · ${personName(e)}`),
    wide: true,
    body: html`<div class="form-grid cols-3">
      ${field(L('姓名', 'Name'), input('name', { value: e.name, required: true }))}
      ${field(L('英文名/拼音', 'English name'), input('nameEn', { value: e.nameEn }))}
      ${field(L('邮箱', 'Email'), input('email', { type: 'email', value: e.email }))}
      ${field(L('职位', 'Job title'), input('title', { value: e.title, required: true }))}
      ${field(L('职位（英文）', 'Job title (English)'), input('titleEn', { value: e.titleEn }))}
      ${field(L('职级', 'Level'), select('level', LEVELS.map((l) => [l, l]), { value: e.level || 'P4' }))}
      ${field(L('部门', 'Department'), select('deptId', d.departments.map((x) => [x.id, loc(x)]), { value: e.deptId }))}
      ${field(L('直属上级', 'Manager'), select('managerId', d.employees.filter((x) => x.status !== 'left' && x.id !== e.id).map((x) => [x.id, `${personName(x)} · ${loc(x, 'title')}`]), { value: e.managerId, placeholder: '—' }))}
      ${field(L('工作地点', 'Location'), select('location', Object.entries(LOCATIONS).map(([k, v]) => [k, tx(v)]), { value: e.location || 'sh' }))}
      ${field(L('入职日期', 'Hire date'), input('hireDate', { type: 'date', value: e.hireDate || today() }))}
      ${field(L('状态', 'Status'), select('status', [['active', L('在职', 'Active')], ['left', L('已离职', 'Left')]], { value: e.status || 'active' }))}
      ${field(L('离职日期', 'Leave date'), input('leaveDate', { type: 'date', value: e.leaveDate }))}
      ${field(L('离职原因', 'Leave reason'), select('leaveReason', Object.entries(LEAVE_REASONS).map(([k, v]) => [k, tx(v)]), { value: e.leaveReason, placeholder: '—' }))}
      ${field(L('薪酬比较比率', 'Compa-ratio'), input('compaRatio', { type: 'number', step: 0.01, min: 0.5, max: 1.5, value: e.compaRatio ?? 1 }), { hint: L('实际薪酬 ÷ 薪级中位值', 'Pay ÷ band midpoint') })}
      ${field(L('敬业度（1-5）', 'Engagement (1-5)'), input('engagement', { type: 'number', min: 1, max: 5, value: e.engagement ?? 4 }))}
    </div>`,
    onSubmit: async (v) => {
      if (!v.name.trim() || !v.title.trim()) throw new Error(L('请填写姓名和职位', 'Name and job title are required'));
      if (v.status === 'left' && !v.leaveDate) throw new Error(L('请填写离职日期', 'Leave date is required'));
      const doc = {
        name: v.name.trim(), nameEn: v.nameEn.trim() || v.name.trim(), email: v.email.trim(), title: v.title.trim(), titleEn: v.titleEn.trim() || v.title.trim(),
        level: v.level, deptId: v.deptId, managerId: v.managerId || null, location: v.location, hireDate: v.hireDate, status: v.status,
        leaveDate: v.status === 'left' ? v.leaveDate : null, leaveReason: v.status === 'left' ? v.leaveReason || null : null,
        leaveType: v.status === 'left' ? (v.leaveReason === 'performance' ? 'involuntary' : 'voluntary') : null,
        compaRatio: Number(v.compaRatio) || 1, engagement: Number(v.engagement) || 3,
      };
      // New records start unassessed rather than with invented competency ratings.
      if (isNew) Object.assign(doc, { performance: 3, potential: 2, perfHistory: [], skills: [], lastPromotion: v.hireDate, competencies: null });
      if (!isNew && v.managerId !== e.managerId) doc.managerChanged = true;
      const saved = isNew ? await api.post('/api/employees', doc) : await api.put(`/api/employees/${e.id}`, doc);
      await reloadEmployees();
      toast(L('档案已保存', 'Record saved'));
      onSaved(saved);
    },
  });
}

async function peopleView(el, ctx) {
  const d = await load('employees', 'departments');
  if (ctx.id) return profile(el, ctx, d);
  const dept = ctx.query.dept || '';
  const status = ctx.query.status || 'active';
  const q = (ctx.query.q || '').toLowerCase();
  const emp = byId(d.employees);
  const rows = d.employees.filter((e) => (status === 'all' || e.status === status) && (!dept || e.deptId === dept) && (!q || `${e.name} ${e.nameEn} ${e.title} ${e.titleEn} ${e.empNo || ''}`.toLowerCase().includes(q)));
  setHTML(el, html`
    <div class="row-between" style="margin-bottom:12px">
      <div class="row"><input class="input" type="search" id="q" value="${ctx.query.q || ''}" placeholder="${L('姓名、职位、工号', 'Name, title, ID')}" style="width:220px">
        <select class="input" id="dept" style="width:auto"><option value="">${L('全部部门', 'All departments')}</option>${d.departments.map((x) => html`<option value="${x.id}" ${x.id === dept ? 'selected' : ''}>${loc(x)}</option>`)}</select>
        <div class="seg">${[['active', L('在职', 'Active')], ['left', L('已离职', 'Left')], ['all', L('全部', 'All')]].map(([k, n]) => html`<button type="button" class="${status === k ? 'on' : ''}" data-status="${k}">${n}</button>`)}</div></div>
      <button class="btn btn-primary" type="button" data-new>${icon('plus')}${L('新增员工', 'Add employee')}</button></div>
    <section class="card card-flush"><div class="table-wrap"><table class="table">
      <thead><tr><th>${L('员工', 'Employee')}</th><th>${L('部门', 'Department')}</th><th>${L('职级', 'Level')}</th><th>${L('地点', 'Location')}</th><th>${L('司龄', 'Tenure')}</th><th>${L('直属上级', 'Manager')}</th></tr></thead>
      <tbody>${rows.map((e) => html`<tr class="clickable" data-href="#/service/people/${e.id}"><td>${personLink(e)}</td><td>${loc(d.departments.find((x) => x.id === e.deptId))}</td><td>${e.level}</td>
        <td>${tx(LOCATIONS[e.location] || [e.location, e.location])}</td><td class="small">${e.status === 'left' ? html`${badge(L('已离职', 'Left'))} ${fmt.date(e.leaveDate)}` : fmt.tenure(e.hireDate)}</td><td>${personName(emp[e.managerId])}</td></tr>`)}</tbody></table></div>
      ${rows.length ? '' : empty(L('没有匹配的员工', 'No matching people'), '', 'users')}</section>`);
  const go = (patch) => {
    const qs = new URLSearchParams({ ...(dept && { dept }), ...(status !== 'active' && { status }), ...(ctx.query.q && { q: ctx.query.q }), ...patch });
    for (const [k, v] of [...qs]) if (!v || (k === 'status' && v === 'active')) qs.delete(k);
    location.hash = `#/service/people${qs.toString() ? `?${qs}` : ''}`;
  };
  el.querySelector('#dept').addEventListener('change', (e) => go({ dept: e.target.value }));
  let t;
  el.querySelector('#q').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => go({ q: e.target.value }), 350);
  });
  on(el, 'click', '[data-status]', (e, b) => go({ status: b.dataset.status }));
  on(el, 'click', 'tr[data-href]', (e, tr) => { if (!e.target.closest('a')) location.hash = tr.dataset.href; });
  on(el, 'click', '[data-new]', () => employeeForm({}, d, (s) => { location.hash = `#/service/people/${s.id}`; }));
}

async function profile(el, ctx, d) {
  const e = d.employees.find((x) => x.id === ctx.id);
  if (!e) return setHTML(el, empty(L('员工不存在', 'Person not found'), '', 'alert'));
  const more = await load('enrollments', 'courses', 'idps', 'tickets', 'onboarding');
  const emp = byId(d.employees);
  const reports = d.employees.filter((x) => x.managerId === e.id && x.status !== 'left');
  const b = BOXES[boxKey(e.performance, e.potential)];
  const risk = flightRisk(e, today());
  const enrolls = more.enrollments.filter((x) => x.employeeId === e.id);
  const idp = more.idps.find((x) => x.employeeId === e.id && x.mode !== 'retention');
  const tickets = more.tickets.filter((x) => x.requesterId === e.id);
  const ob = more.onboarding.find((x) => x.employeeId === e.id);
  const courseBy = byId(more.courses);
  setHTML(el, html`
    <div class="row-between" style="margin-bottom:12px">
      <div class="row">${avatar(e, 'lg')}<div><a href="#/service/people" class="small">← ${L('员工档案', 'Directory')}</a><h2 style="font-size:20px">${personName(e)} ${e.status === 'left' ? badge(L('已离职', 'Left')) : ''}</h2>
        <div class="muted">${loc(e, 'title')} · ${loc(d.departments.find((x) => x.id === e.deptId))} · ${e.level}</div>
        <div class="small muted">${e.empNo || ''} · ${e.email || ''} · ${e.phone || ''}</div></div></div>
      <button class="btn" type="button" data-edit>${icon('edit')}${L('编辑档案', 'Edit')}</button></div>
    <div class="grid cols-3">
      <section class="card"><div class="card-head"><h2>${L('基本信息', 'Basics')}</h2></div>
        <dl class="kv"><dt>${L('入职日期', 'Hired')}</dt><dd>${fmt.date(e.hireDate)}（${fmt.tenure(e.hireDate)}）</dd>
          <dt>${L('工作地点', 'Location')}</dt><dd>${tx(LOCATIONS[e.location] || [e.location, e.location])}</dd>
          <dt>${L('直属上级', 'Manager')}</dt><dd>${emp[e.managerId] ? html`<a href="#/service/people/${e.managerId}">${personName(emp[e.managerId])}</a>` : '—'}</dd>
          <dt>${L('直接下属', 'Direct reports')}</dt><dd>${reports.length}</dd>
          <dt>${L('上次晋升', 'Last promotion')}</dt><dd>${fmt.date(e.lastPromotion)}</dd>
          ${e.status === 'left' ? html`<dt>${L('离职', 'Left')}</dt><dd>${fmt.date(e.leaveDate)} · ${tx(LEAVE_REASONS[e.leaveReason] || ['—', '—'])}</dd>` : ''}</dl>
        ${(e.skills || []).length ? html`<div class="section-title">${L('技能标签', 'Skills')}</div><div>${e.skills.map((s) => html`<span class="tag">${s}</span>`)}</div>` : ''}
        ${reports.length ? html`<div class="section-title">${L('团队成员', 'Team')}</div>${reports.map((r) => html`<div style="margin:6px 0">${personLink(r)}</div>`)}` : ''}</section>
      <section class="card"><div class="card-head"><h2>${L('人才画像', 'Talent profile')}</h2><a class="btn btn-sm" href="#/talent/competency?emp=${e.id}">${L('详情', 'Details')}</a></div>
        <div class="row" style="margin-bottom:8px">${badge(`${b.no} · ${tx(b.name)}`, b.tone === 'neutral' ? '' : b.tone)}${badge(`${L('绩效', 'Perf')} ${e.performance} · ${tx(PERF_SCALE[e.performance] || ['', ''])}`)}${badge(`${L('潜力', 'Pot')} ${e.potential}`)}${risk ? badge(`${L('流失风险', 'Flight risk')} ${tx(RISK_LEVEL[risk.level][0])}`, RISK_LEVEL[risk.level][1]) : ''}</div>
        ${radar({ axes: COMPETENCIES.map((c) => ({ key: c.key, label: tx(c.name) })), series: [{ name: L('当前', 'Current'), values: e.competencies || {}, cls: 's1' }, { name: L('目标', 'Target'), values: targetProfile(e.level), cls: 's2' }], size: 280 })}</section>
      <div class="stack">
        <section class="card"><div class="card-head"><h2>${L('学习发展', 'Learning')}</h2>${idp ? html`<a class="btn btn-sm" href="#/learning/idp/${idp.id}">IDP ${idpProgress(idp)}%</a>` : html`<a class="btn btn-sm" href="#/learning/idp?emp=${e.id}">${L('创建 IDP', 'Create IDP')}</a>`}</div>
          ${enrolls.length ? enrolls.map((x) => html`<div class="list-item"><div class="grow"><div>${loc(courseBy[x.courseId], 'title')}</div></div>${badge(tx(ENROLL_STATUS[x.status][0]), ENROLL_STATUS[x.status][1])}</div>`) : html`<p class="muted small">${L('暂无学习记录', 'No courses yet')}</p>`}</section>
        <section class="card"><div class="card-head"><h2>${L('服务申请', 'Requests')}</h2></div>
          ${tickets.length ? tickets.map((t) => html`<a class="list-item" href="#/service/requests/${t.id}" style="color:inherit;text-decoration:none"><div class="grow"><div>${loc(t, 'title')}</div><div class="meta">${fmt.date(t.createdAt)}</div></div>${statusBadge(t.status)}</a>`) : html`<p class="muted small">${L('暂无申请', 'No requests')}</p>`}</section>
        ${ob ? html`<section class="card"><div class="card-head"><h2>${L('入职进度', 'Onboarding')}</h2><a class="btn btn-sm" href="#/service/onboarding/${ob.id}">${L('查看', 'Open')}</a></div>${meter(ob.tasks.filter((t) => t.done).length, ob.tasks.length, 'ok')}</section>` : ''}
      </div>
    </div>`);
  on(el, 'click', '[data-edit]', () => employeeForm(e, d, () => ctx.rerender()));
}

// ------------------------------------------------------------------ requests
function newRequest(prefill = {}, onSaved) {
  modal({
    title: L('发起服务申请', 'New request'),
    body: html`<div class="stack" style="gap:12px">
      ${field(L('类型', 'Type'), select('type', Object.entries(TICKET_TYPES).map(([k, v]) => [k, `${tx(v.name)} · ${L(`${v.sla} 个工作日`, `${v.sla} working days`)}`]), { value: prefill.type || 'other' }))}
      ${field(L('标题', 'Subject'), input('title', { value: prefill.title, required: true, maxlength: 120 }))}
      ${field(L('详细说明', 'Details'), textarea('detail', { rows: 5, value: prefill.detail, maxlength: 2000 }))}</div>`,
    submitLabel: L('提交', 'Submit'),
    onSubmit: async (v) => {
      if (!v.title.trim()) throw new Error(L('请填写标题', 'Subject is required'));
      const t = await api.post('/api/tickets', { type: v.type, title: v.title.trim(), detail: v.detail.trim(), status: 'open', requesterId: getActor(), assigneeId: null, comments: [] });
      toast(L('申请已提交，HR 会尽快处理', 'Request submitted; HR will pick it up soon'));
      onSaved?.(t);
    },
  });
}

async function requestsView(el, ctx) {
  const d = await load('tickets', 'employees');
  const emp = byId(d.employees);
  const T = today();
  if (ctx.id) return ticketDetail(el, ctx, d, emp);
  const f = ctx.query.f || 'active';
  const rows = d.tickets.filter((t) => (f === 'all') || (f === 'active' && t.status !== 'resolved') || (f === 'mine' && t.requesterId === getActor()) || (f === 'overdue' && isOverdue(t, T)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const resolved = d.tickets.filter((t) => t.status === 'resolved' && t.resolvedAt);
  const onTime = resolved.filter((t) => t.resolvedAt <= dueDate(t.createdAt, TICKET_TYPES[t.type]?.sla || 3)).length;
  setHTML(el, html`
    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="card kpi"><span class="label">${L('待处理', 'Open')}</span><span class="value">${d.tickets.filter((t) => t.status === 'open').length}</span></div>
      <div class="card kpi"><span class="label">${L('处理中', 'In progress')}</span><span class="value">${d.tickets.filter((t) => t.status === 'in_progress').length}</span></div>
      <div class="card kpi"><span class="label">${L('已超时', 'Past SLA')}</span><span class="value" style="color:var(--danger)">${d.tickets.filter((t) => isOverdue(t, T)).length}</span></div>
      <div class="card kpi"><span class="label">${L('按时解决率', 'Resolved on time')}</span><span class="value">${resolved.length ? fmt.pct(onTime / resolved.length) : '—'}</span></div>
    </div>
    <div class="row-between" style="margin-bottom:12px">
      <div class="seg">${[['active', L('未完成', 'Active')], ['overdue', L('已超时', 'Overdue')], ['mine', L('我提交的', 'Mine')], ['all', L('全部', 'All')]].map(([k, n]) => html`<button type="button" class="${f === k ? 'on' : ''}" data-f="${k}">${n}</button>`)}</div>
      <button class="btn btn-primary" type="button" data-new>${icon('plus')}${L('发起申请', 'New request')}</button></div>
    <section class="card card-flush">${rows.length ? html`<div class="table-wrap"><table class="table">
      <thead><tr><th>${L('申请', 'Request')}</th><th>${L('类型', 'Type')}</th><th>${L('申请人', 'From')}</th><th>${L('处理人', 'Owner')}</th><th>${L('时限', 'Due')}</th><th>${L('状态', 'Status')}</th></tr></thead>
      <tbody>${rows.map((t) => {
        const due = dueDate(t.createdAt, TICKET_TYPES[t.type]?.sla || 3);
        return html`<tr class="clickable" data-href="#/service/requests/${t.id}"><td><a href="#/service/requests/${t.id}"><strong>${loc(t, 'title')}</strong></a><div class="small muted">${fmt.rel(t.createdAt)}</div></td><td>${typeBadge(t.type)}</td>
          <td>${personName(emp[t.requesterId])}</td><td>${t.assigneeId ? personName(emp[t.assigneeId]) : html`<span class="muted">${L('未分配', 'Unassigned')}</span>`}</td>
          <td class="small">${t.status === 'resolved' ? '—' : isOverdue(t, T) ? badge(L(`超时 ${daysBetween(due, T)} 天`, `${daysBetween(due, T)} d late`), 'danger') : fmt.date(due)}</td><td>${statusBadge(t.status)}</td></tr>`;
      })}</tbody></table></div>` : empty(L('没有申请', 'No requests'), '', 'inbox')}</section>`);
  on(el, 'click', '[data-f]', (e, b) => { location.hash = `#/service/requests?f=${b.dataset.f}`; });
  on(el, 'click', 'tr[data-href]', (e, tr) => { if (!e.target.closest('a')) location.hash = tr.dataset.href; });
  on(el, 'click', '[data-new]', () => newRequest({}, (t) => { location.hash = `#/service/requests/${t.id}`; }));
}

async function ticketDetail(el, ctx, d, emp) {
  const t = d.tickets.find((x) => x.id === ctx.id);
  if (!t) return setHTML(el, empty(L('申请不存在', 'Request not found'), '', 'alert'));
  const T = today();
  const due = dueDate(t.createdAt, TICKET_TYPES[t.type]?.sla || 3);
  const hr = d.employees.filter((x) => x.deptId === 'd08' && x.status !== 'left');
  setHTML(el, html`
    <a href="#/service/requests" class="small">← ${L('全部申请', 'All requests')}</a>
    <div class="split" style="margin-top:8px">
      <section class="card"><div class="card-head"><div><h2>${loc(t, 'title')}</h2><p>${typeBadge(t.type)} · ${fmt.stamp(t.createdAt)}</p></div>${statusBadge(t.status)}</div>
        <div class="list-item" style="align-items:flex-start">${avatar(emp[t.requesterId] || { name: '?' }, 'sm')}<div class="grow"><strong>${personName(emp[t.requesterId])}</strong><div style="white-space:pre-wrap;margin-top:4px">${loc(t, 'detail') || '—'}</div></div></div>
        ${(t.comments || []).map((c) => html`<div class="list-item" style="align-items:flex-start">${avatar(emp[c.by] || { name: '?' }, 'sm')}<div class="grow"><strong>${personName(emp[c.by])}</strong> <span class="small muted">${fmt.stamp(c.at)}</span><div style="white-space:pre-wrap;margin-top:4px">${loc(c, 'text')}</div></div></div>`)}
        <form id="reply" class="stack" style="gap:8px;margin-top:12px">${textarea('text', { rows: 3, placeholder: L('回复或补充说明…', 'Reply or add details…'), maxlength: 2000 })}
          <div class="row"><button class="btn btn-primary" type="submit">${L('发送', 'Send')}</button>${t.status !== 'resolved' ? html`<button class="btn" type="button" data-resolve>${icon('check')}${L('回复并标记解决', 'Reply and resolve')}</button>` : ''}</div></form></section>
      <section class="card"><div class="card-head"><h2>${L('处理信息', 'Handling')}</h2></div>
        <dl class="kv"><dt>${L('时限', 'Due')}</dt><dd>${fmt.date(due)} ${t.status !== 'resolved' && isOverdue(t, T) ? badge(L('已超时', 'Overdue'), 'danger') : ''}</dd><dt>SLA</dt><dd>${L(`${TICKET_TYPES[t.type]?.sla} 个工作日`, `${TICKET_TYPES[t.type]?.sla} working days`)}</dd>${t.resolvedAt ? html`<dt>${L('解决于', 'Resolved')}</dt><dd>${fmt.date(t.resolvedAt)}</dd>` : ''}</dl>
        <div class="stack" style="gap:10px;margin-top:12px">
          ${field(L('处理人', 'Owner'), select('assignee', hr.map((x) => [x.id, personName(x)]), { value: t.assigneeId, placeholder: L('未分配', 'Unassigned'), id: 'assignee' }))}
          ${field(L('状态', 'Status'), select('status', Object.entries(TICKET_STATUS).map(([k, v]) => [k, tx(v.name)]), { value: t.status, id: 'status' }))}
        </div>
        <div style="margin-top:12px">${method(L('提示：', 'Tip:'), L('常见问题可沉淀到制度百科，让 HR 助手自动回答。', 'Turn frequent questions into policy articles so the HR assistant can answer them.'))}</div></section>
    </div>`);
  const save = (patch, msg) => act(null, () => api.put(`/api/tickets/${t.id}`, patch), msg).then(() => ctx.rerender());
  el.querySelector('#assignee').addEventListener('change', (e) => save({ assigneeId: e.target.value || null, ...(t.status === 'open' && e.target.value && { status: 'in_progress' }) }, L('已分配', 'Assigned')));
  el.querySelector('#status').addEventListener('change', (e) => save({ status: e.target.value, ...(e.target.value === 'resolved' && { resolvedAt: today() }) }, L('状态已更新', 'Status updated')));
  const reply = async (resolve) => {
    const text = el.querySelector('#reply').text.value.trim();
    if (!text && !resolve) return;
    const comments = [...(t.comments || [])];
    if (text) comments.push({ by: getActor(), at: nowStamp(), text });
    const patch = { comments };
    if (resolve) Object.assign(patch, { status: 'resolved', resolvedAt: today() });
    else if (t.status === 'open' && getActor() !== t.requesterId) Object.assign(patch, { status: 'in_progress', assigneeId: t.assigneeId || getActor() });
    await save(patch, resolve ? L('已标记解决', 'Resolved') : L('已回复', 'Reply sent'));
  };
  el.querySelector('#reply').addEventListener('submit', (e) => {
    e.preventDefault();
    reply(false);
  });
  on(el, 'click', '[data-resolve]', () => reply(true));
}

// ------------------------------------------------------------------ policy library
function articleForm(a, onSaved) {
  const isNew = !a.id;
  modal({
    title: isNew ? L('新建制度文章', 'New article') : L('编辑文章', 'Edit article'),
    wide: true,
    body: html`<div class="form-grid">
      ${field(L('标题', 'Title'), input('title', { value: a.title, required: true }))}
      ${field(L('英文标题', 'English title'), input('titleEn', { value: a.titleEn }))}
      ${field(L('分类', 'Category'), select('category', Object.entries(KB_CATEGORIES).map(([k, v]) => [k, tx(v)]), { value: a.category }))}
      ${field(L('关键词（逗号分隔）', 'Keywords (comma-separated)'), input('tags', { value: (a.tags || []).join(', ') }))}
      ${field(L('正文（中文，支持 Markdown）', 'Body (Chinese, Markdown)'), textarea('body', { rows: 10, value: a.body }), { span: true })}
      ${field(L('正文（英文）', 'Body (English)'), textarea('bodyEn', { rows: 6, value: a.bodyEn }), { span: true })}</div>`,
    onSubmit: async (v) => {
      if (!v.title.trim() || !(v.body.trim() || v.bodyEn.trim())) throw new Error(L('请填写标题和正文', 'Title and body are required'));
      const doc = { title: v.title.trim(), titleEn: v.titleEn.trim() || v.title.trim(), category: v.category, tags: v.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean), body: v.body.trim() || v.bodyEn.trim(), bodyEn: v.bodyEn.trim() || v.body.trim(), updatedBy: getActor() };
      const saved = isNew ? await api.post('/api/kb', doc) : await api.put(`/api/kb/${a.id}`, doc);
      toast(L('文章已保存', 'Article saved'));
      onSaved(saved);
    },
  });
}

async function kbView(el, ctx) {
  const d = await load('kb');
  if (ctx.id) {
    const a = d.kb.find((x) => x.id === ctx.id);
    if (!a) return setHTML(el, empty(L('文章不存在', 'Article not found'), '', 'alert'));
    setHTML(el, html`<a href="#/service/kb" class="small">← ${L('制度百科', 'Policy library')}</a>
      <div class="split" style="margin-top:8px"><section class="card"><div class="card-head"><div><h2 style="font-size:19px">${loc(a, 'title')}</h2><p>${tx(KB_CATEGORIES[a.category] || ['', ''])} · ${L('更新于', 'Updated')} ${fmt.date(a.updatedAt)}</p></div><button class="btn btn-sm" type="button" data-edit>${icon('edit')}${L('编辑', 'Edit')}</button></div>
        ${md(lang() === 'en' ? a.bodyEn : a.body)}
        <div style="margin-top:12px">${(a.tags || []).map((t) => html`<span class="tag">${t}</span>`)}</div></section>
        <section class="card"><div class="card-head"><h2>${L('没找到答案？', 'Still have a question?')}</h2></div>
          <p class="small">${L('可以问问 HR 助手，或直接发起服务申请。', 'Ask the HR assistant, or open a request.')}</p>
          <div class="row"><a class="btn" href="#/service/assistant">${icon('sparkle')}${L('问 HR 助手', 'Ask the assistant')}</a><button class="btn" type="button" data-req>${L('发起申请', 'Open a request')}</button></div>
          ${callout('info', L('示例制度依据国家层面规定编写，实际执行请以当地法规和公司制度为准。', 'Sample policies follow national PRC rules; local regulations and company policy take precedence.'))}</section></div>`);
    on(el, 'click', '[data-edit]', () => articleForm(a, () => ctx.rerender()));
    on(el, 'click', '[data-req]', () => newRequest({ title: loc(a, 'title') }));
    return;
  }
  const cat = ctx.query.cat || '';
  const q = ctx.query.q || '';
  let rows = d.kb.filter((a) => !cat || a.category === cat);
  if (q) rows = searchKB(rows, q).map((r) => r.article);
  setHTML(el, html`
    <div class="row-between" style="margin-bottom:12px">
      <div class="row"><input class="input" type="search" id="q" value="${q}" placeholder="${L('搜索制度，如"年假""加班费"', 'Search, e.g. "annual leave", "overtime"')}" style="width:260px">
        <div class="seg"><button type="button" class="${!cat ? 'on' : ''}" data-cat="">${L('全部', 'All')}</button>${Object.entries(KB_CATEGORIES).map(([k, v]) => html`<button type="button" class="${cat === k ? 'on' : ''}" data-cat="${k}">${tx(v)}</button>`)}</div></div>
      <button class="btn btn-primary" type="button" data-new>${icon('plus')}${L('新建文章', 'New article')}</button></div>
    <div class="grid cols-3">${rows.map((a) => html`<a class="card tool-card" href="#/service/kb/${a.id}"><span class="badge" style="width:max-content">${tx(KB_CATEGORIES[a.category] || ['', ''])}</span><strong>${loc(a, 'title')}</strong><p>${(lang() === 'en' ? a.bodyEn : a.body).slice(0, 80).replace(/\n/g, ' ')}…</p></a>`)}</div>
    ${rows.length ? '' : empty(L('没有找到相关制度', 'No matching policies'), L('换个关键词，或问问 HR 助手。', 'Try other words, or ask the HR assistant.'), 'search')}`);
  let t;
  el.querySelector('#q').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { location.hash = `#/service/kb?${new URLSearchParams({ ...(cat && { cat }), ...(e.target.value && { q: e.target.value }) })}`; }, 400);
  });
  on(el, 'click', '[data-cat]', (e, b) => { location.hash = `#/service/kb${b.dataset.cat ? `?cat=${b.dataset.cat}` : ''}`; });
  on(el, 'click', '[data-new]', () => articleForm({ category: 'daily' }, (s) => { location.hash = `#/service/kb/${s.id}`; }));
}

// ------------------------------------------------------------------ HR assistant
const history = [];
async function assistantView(el) {
  const d = await load('kb');
  const SUGGEST = [L('我今年有几天年假？', 'How many days of annual leave do I get?'), L('加班费怎么计算？', 'How is overtime pay calculated?'), L('试用期最长多久？', 'How long can probation be?'), L('怎么开在职证明？', 'How do I get an employment letter?'), L('离职要提前多久通知？', 'How much notice do I need to give?'), L('产假有多少天？', 'How long is maternity leave?')];
  setHTML(el, html`
    <div class="split">
      <section class="card">
        <div class="card-head"><div><h2>${L('HR 智能助手', 'HR assistant')}</h2><p>${aiEnabled() ? L('由 Claude 基于公司制度百科回答，并标注依据', 'Claude answers from the policy library and cites its sources') : L('基于制度百科检索回答（配置 AI 后可获得更自然的回答）', 'Answers by searching the policy library (configure AI for conversational answers)')}</p></div>${badge(aiEnabled() ? 'AI' : L('检索模式', 'Search mode'), aiEnabled() ? 'info' : '')}</div>
        <div class="chat" id="chat" aria-live="polite">${history.length ? '' : html`<div class="msg bot">${L('你好！我可以回答假期、薪酬社保、合同、绩效与日常办事等问题。', 'Hi! Ask me about leave, pay and benefits, contracts, performance or everyday HR services.')}</div>`}</div>
        <form id="ask" class="row" style="margin-top:12px"><input class="input" name="q" placeholder="${L('输入你的问题…', 'Type your question…')}" style="flex:1" maxlength="500" autocomplete="off"><button class="btn btn-primary" type="submit">${icon('send')}${L('发送', 'Send')}</button></form>
        <div class="chips-input" style="margin-top:10px">${SUGGEST.map((s) => html`<button type="button" class="chip-toggle" data-q="${s}">${s}</button>`)}</div>
      </section>
      <section class="card"><div class="card-head"><h2>${L('它是怎么工作的', 'How it works')}</h2></div>
        <ol class="small" style="padding-left:18px;margin:0"><li>${L('将问题切分为关键词，在制度百科中检索最相关的文章', 'Splits the question into keywords and finds the most relevant articles')}</li><li>${L('给出最相关的条款原文与出处链接', 'Shows the most relevant passage with a link to the source')}</li><li>${L('启用 AI 后，由 Claude 仅依据检索到的制度组织答案，不编造规定', 'With AI on, Claude composes an answer only from the retrieved policies')}</li><li>${L('找不到答案时，一键转为服务申请交给 HR', 'When nothing matches, turn the question into a request for HR in one click')}</li></ol></section>
    </div>`);
  const chat = el.querySelector('#chat');
  const push = (role, content) => {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    setHTML(div, content);
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
  };
  for (const h of history) push(h.role, h.content);
  const ask = async (q) => {
    if (!q.trim()) return;
    push('me', html`${q}`);
    history.push({ role: 'me', content: html`${q}` });
    const hits = searchKB(d.kb, q).slice(0, 3);
    const sources = hits.length ? html`<div class="src">${L('依据：', 'Sources: ')}${hits.map((h, i) => html`${i ? '、' : ''}<a href="#/service/kb/${h.article.id}">${loc(h.article, 'title')}</a>`)}</div>` : '';
    const fallback = hits.length
      ? html`${md(bestParagraph(hits[0].article, q, lang()))}${sources}`
      : html`${L('制度百科中暂时没有找到相关内容。', 'I could not find this in the policy library.')} <button class="btn btn-sm" type="button" data-ticket="${q}">${L('转给 HR 处理', 'Ask HR')}</button>`;
    if (!aiEnabled() || !hits.length) {
      push('bot', fallback);
      history.push({ role: 'bot', content: fallback });
      return;
    }
    const div = push('bot', html`<span class="ai-cursor">${L('思考中…', 'Thinking…')}</span>`);
    try {
      const r = await streamAI('assistant', { question: q, articles: hits.map((h) => ({ title: loc(h.article, 'title'), body: lang() === 'en' ? h.article.bodyEn : h.article.body })) }, (text) => {
        div.innerHTML = `<div class="md ai-cursor">${mdToHtml(text)}</div>`;
        chat.scrollTop = chat.scrollHeight;
      });
      const content = html`${md(r.text)}${sources}`;
      setHTML(div, content);
      history.push({ role: 'bot', content });
    } catch (err) {
      setHTML(div, fallback);
      history.push({ role: 'bot', content: fallback });
      toast(err.message, 'error');
    }
  };
  el.querySelector('#ask').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = e.target.q.value;
    e.target.q.value = '';
    ask(q);
  });
  on(el, 'click', '[data-q]', (e, b) => ask(b.dataset.q));
  on(el, 'click', '[data-ticket]', (e, b) => newRequest({ title: b.dataset.ticket.slice(0, 120), detail: b.dataset.ticket }));
}

// ------------------------------------------------------------------ onboarding
async function onboardingView(el, ctx) {
  const d = await load('onboarding', 'employees');
  const emp = byId(d.employees);
  const T = today();
  if (ctx.id) {
    const ob = d.onboarding.find((x) => x.id === ctx.id);
    if (!ob) return setHTML(el, empty(L('入职计划不存在', 'Plan not found'), '', 'alert'));
    const e = emp[ob.employeeId] || {};
    const done = ob.tasks.filter((t) => t.done).length;
    setHTML(el, html`
      <div class="row-between" style="margin-bottom:12px"><div class="row">${avatar(e, 'md')}<div><a href="#/service/onboarding" class="small">← ${L('入职管理', 'Onboarding')}</a><h2 style="font-size:19px">${personName(e)} · ${L('入职计划', 'Onboarding plan')}</h2>
        <div class="small muted">${loc(e, 'title')} · ${L('入职日期', 'Start date')} ${fmt.date(ob.startDate)}${ob.buddyId ? ` · ${L('入职导师', 'Buddy')} ${personName(emp[ob.buddyId])}` : ''}</div></div></div>
        <div class="row" style="min-width:220px"><div style="flex:1">${meter(done, ob.tasks.length, 'ok')}</div><strong>${done}/${ob.tasks.length}</strong></div></div>
      <div class="grid cols-3">${Object.entries(PHASES).map(([p, name]) => {
        const ts = ob.tasks.filter((t) => t.phase === p);
        if (!ts.length) return '';
        return html`<section class="card"><div class="card-head"><h2>${tx(name)}</h2><span class="badge">${ts.filter((t) => t.done).length}/${ts.length}</span></div>
          ${ts.map((t) => html`<label class="list-item check" style="align-items:flex-start"><input type="checkbox" data-task="${t.id}" ${t.done ? 'checked' : ''}><span class="grow"><span style="${t.done ? 'text-decoration:line-through;color:var(--text-3)' : ''}">${tx(t.text)}</span><span class="meta" style="display:block">${tx(OWNERS[t.owner])} · ${fmt.date(t.due)} ${!t.done && t.due < T ? badge(L('逾期', 'Overdue'), 'danger') : ''}</span></span></label>`)}</section>`;
      })}</div>`);
    on(el, 'change', '[data-task]', async (e, cb) => {
      const tasks = ob.tasks.map((t) => (t.id === cb.dataset.task ? { ...t, done: cb.checked } : t));
      await act(null, () => api.put(`/api/onboarding/${ob.id}`, { tasks }));
      ctx.rerender();
    });
    return;
  }
  setHTML(el, html`
    <div class="row-between" style="margin-bottom:12px">${method(L('30-60-90 天融入：', '30-60-90 day onboarding:'), L('清单按入职前、第一天、第一周、30/60/90 天分阶段，分别指派给 HR、上级、IT、导师和新员工本人。', 'Checklists run from before day one to 90 days, with tasks for HR, the manager, IT, the buddy and the new hire.'))}
      <button class="btn btn-primary" type="button" data-new>${icon('plus')}${L('新建入职计划', 'New plan')}</button></div>
    <section class="card card-flush">${d.onboarding.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>${L('新员工', 'New hire')}</th><th>${L('入职日期', 'Start')}</th><th>${L('进度', 'Progress')}</th><th>${L('逾期任务', 'Overdue')}</th></tr></thead>
      <tbody>${d.onboarding.map((ob) => {
        const done = ob.tasks.filter((t) => t.done).length;
        const late = ob.tasks.filter((t) => !t.done && t.due < T).length;
        return html`<tr class="clickable" data-href="#/service/onboarding/${ob.id}"><td>${personLink(emp[ob.employeeId])}</td><td>${fmt.date(ob.startDate)}</td><td style="min-width:160px"><div class="row" style="flex-wrap:nowrap"><div style="flex:1">${meter(done, ob.tasks.length, 'ok')}</div><span class="small">${done}/${ob.tasks.length}</span></div></td><td>${late ? badge(late, 'danger') : badge(0, 'ok')}</td></tr>`;
      })}</tbody></table></div>` : empty(L('还没有入职计划', 'No onboarding plans'), '', 'user')}</section>`);
  on(el, 'click', 'tr[data-href]', (e, tr) => { if (!e.target.closest('a')) location.hash = tr.dataset.href; });
  on(el, 'click', '[data-new]', () => modal({
    title: L('新建入职计划', 'New onboarding plan'),
    body: html`<div class="form-grid">
      ${field(L('新员工', 'New hire'), select('employeeId', d.employees.filter((e) => e.status !== 'left' && !d.onboarding.some((o) => o.employeeId === e.id)).sort((a, b) => b.hireDate.localeCompare(a.hireDate)).map((e) => [e.id, `${personName(e)} · ${fmt.date(e.hireDate)}`])), { span: true })}
      ${field(L('入职导师', 'Buddy'), select('buddyId', d.employees.filter((e) => e.status !== 'left').map((e) => [e.id, personName(e)]), { placeholder: '—' }))}
      ${field(L('管理岗位', 'Manager role'), select('manager', [['0', L('否', 'No')], ['1', L('是（增加管理者任务）', 'Yes (adds manager tasks)')]]))}</div>`,
    submitLabel: L('生成计划', 'Create plan'),
    onSubmit: async (v) => {
      const e = emp[v.employeeId];
      if (!e) throw new Error(L('请选择新员工', 'Choose the new hire'));
      const ob = await api.post('/api/onboarding', { employeeId: e.id, startDate: e.hireDate, buddyId: v.buddyId || null, tasks: buildChecklist(e.hireDate, { manager: v.manager === '1' }) });
      toast(L('入职计划已生成', 'Plan created'));
      location.hash = `#/service/onboarding/${ob.id}`;
    },
  }));
}
