import { retentionView } from './retention.js';
import { canEditPlan, idpEditor } from './idp-editor.js';
// Training & development: 70-20-10 IDPs, training needs analysis, course catalog and program evaluation.
import {
  html, setHTML, load, api, byId, icon, fmt, today, personName, personLink, avatar, badge, callout, pageHead, tabs, empty,
  modal, toast, act, field, input, select, on, meter, method, hasRole, getActor, confirmDialog,
} from '../core.js';
import { L, tx, loc, ENROLL_STATUS } from '../i18n.js';
import { COMPETENCIES, COMP_KEYS, compByKey, targetProfile, gaps, nextLevel, assessCompetencies } from '../engine/competency.js';
import { ACTION_TYPES, IDP_STATUS, activeDevelopmentPlan, buildIDP, idpProgress, tna, learningStats, evaluateProgram, FORMATS } from '../engine/learning.js';
import { radar, heatmap, seqColor, hbars } from '../charts.js';
import { mountReport } from '../ai.js';

const SUBS = [
  ['idp', ['个人发展计划', 'Development plans']],
  ['tna', ['培训需求分析', 'Training needs']],
  ['courses', ['课程与学习', 'Courses']],
  ['eval', ['培训效果评估', 'Evaluation']],
];

export default async function learning(el, ctx) {
  const allowed = hasRole('hr', 'manager') ? SUBS : SUBS.filter(([key]) => ['idp', 'courses'].includes(key));
  if ((ctx.sub && !allowed.some(([key]) => key === ctx.sub)) || (!hasRole('hr', 'manager') && (ctx.query.emp || ctx.query.kind === 'retention'))) return setHTML(el, empty(L('当前角色无权访问此工具', 'This tool is not available for your role'), '', 'shield'));
  const sub = SUBS.some(([k]) => k === ctx.sub) ? ctx.sub : 'idp';
  const d = await load('employees', 'departments', 'courses', 'enrollments', 'idps');
  d.active = d.employees.filter((e) => e.status !== 'left' && !e.restricted);
  setHTML(el, html`${pageHead(L('培训发展', 'Learning & growth'), L('从能力差距出发：诊断需求、制定 70-20-10 发展计划、跟踪学习、评估效果。', 'Start from capability gaps: diagnose needs, plan 70-20-10 development, track learning and measure impact.'))}
    ${tabs(allowed.map(([k, n]) => [k, tx(n)]), sub, (k) => `#/learning/${k}`)}`);
  const body = document.createElement('div');
  el.appendChild(body);
  if (['idp', 'eval'].includes(sub) && !ctx.id && !ctx.query.emp) {
    const kind = ctx.query.kind === 'retention' ? 'retention' : 'development';
    setHTML(body, hasRole('hr', 'manager') ? html`<div class="seg" style="margin-bottom:16px"><a class="btn ${kind === 'development' ? 'btn-primary' : ''}" href="#/learning/${sub}">${L('普通发展', 'Development')}</a><a class="btn ${kind === 'retention' ? 'btn-primary' : ''}" href="#/learning/${sub}?kind=retention">${sub === 'eval' ? L('留任评估', 'Retention evaluation') : L('留任干预', 'Retention intervention')}</a></div>` : '');
    const content = document.createElement('div'); body.appendChild(content);
    if (kind === 'retention') return retentionView(content, ctx, d, sub === 'eval');
    return (sub === 'idp' ? idpView : evalView)(content, ctx, { ...d, idps: d.idps.filter(p => p.mode !== 'retention') });
  }
  await ({ idp: idpView, tna: tnaView, courses: coursesView, eval: evalView })[sub](body, ctx, d);
}

const actionText = (a, courses) => (a.courseId ? loc(courses.find((c) => c.id === a.courseId), 'title') || tx(a.text) : tx(a.text));

// ------------------------------------------------------------------ IDP
async function idpView(el, ctx, d) {
  if (ctx.id) return idpDetail(el, ctx, d);
  if (ctx.query.emp) return idpNew(el, ctx, d);
  const emp = byId(d.employees);
  // A finished plan is history; it should not stop the person getting a new one.
  const withIdp = new Set(d.idps.filter((i) => i.status === 'active').map((i) => i.employeeId));
  const rank = (i) => (i.status === 'active' ? 0 : 1);
  const plans = [...d.idps].sort((a, b) => rank(a) - rank(b));
  setHTML(el, html`
    <div class="row-between" style="margin-bottom:12px">
      ${method('70-20-10：', L('70% 来自在岗实践与挑战任务，20% 来自导师、教练与反馈，10% 来自正式培训。', '70% from on-the-job challenges, 20% from mentors, coaching and feedback, 10% from formal training.'))}
      ${hasRole('hr', 'manager') ? html`<div class="row"><select class="input" id="new-emp" style="width:auto" aria-label="${L('选择员工', 'Choose employee')}"><option value="">${L('为员工新建 IDP…', 'New IDP for…')}</option>${d.active.filter((e) => !withIdp.has(e.id) && canEditPlan({ employeeId: e.id })).map((e) => html`<option value="${e.id}">${personName(e)} · ${loc(e, 'title')}</option>`)}</select></div>` : ''}
    </div>
    <section class="card card-flush">
      ${d.idps.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>${L('员工', 'Employee')}</th><th>${L('发展重点', 'Focus areas')}</th><th>${L('类型', 'Type')}</th><th>${L('状态', 'Status')}</th><th>${L('进度', 'Progress')}</th><th>${L('创建', 'Created')}</th><th></th></tr></thead>
        <tbody>${plans.map((i) => html`<tr class="clickable" data-href="#/learning/idp/${i.id}"><td>${personLink(emp[i.employeeId])}</td>
          <td>${(i.focus || []).map((f) => html`<span class="tag">${tx(compByKey[f.competency].name)}</span>`)}</td>
          <td>${badge(i.mode === 'growth' ? L('晋升准备', 'Next level') : i.mode === 'mastery' ? L('精进', 'Mastery') : L('补齐差距', 'Close gaps'), i.mode === 'gap' ? 'warn' : 'info')}</td>
          <td>${badge(tx(IDP_STATUS[i.status]?.name || [i.status, i.status]), IDP_STATUS[i.status]?.tone)}</td>
          <td style="min-width:140px"><div class="row" style="flex-wrap:nowrap"><div style="flex:1">${meter(idpProgress(i), 100, 'ok')}</div><span class="small num">${idpProgress(i)}%</span></div></td>
          <td class="small">${fmt.date(i.createdAt)}</td>
          <td>${canEditPlan(i) ? html`<a class="btn btn-sm" href="#/learning/idp/${i.id}?edit=1">${icon('edit')}${L('编辑', 'Edit')}</a>` : ''}</td></tr>`)}</tbody></table></div>` : empty(L('还没有发展计划', 'No development plans yet'), L('从右上角选择员工，系统将根据能力差距自动生成。', 'Pick an employee above; the plan is generated from their competency gaps.'), 'target')}
    </section>`);
  el.querySelector('#new-emp')?.addEventListener('change', (e) => { if (e.target.value) location.hash = `#/learning/idp?emp=${e.target.value}`; });
  on(el, 'click', 'tr[data-href]', (e, tr) => { if (!e.target.closest('a')) location.hash = tr.dataset.href; });
}

function planBlocks(focus, courses, { editable = false, locked = false, people = [], ownerId } = {}) {
  return focus.map((f, fi) => html`<section class="card">
    <div class="card-head"><div><h2>${fi + 1}. ${tx(compByKey[f.competency].name)}</h2><p>${L(`当前 ${f.actual} → 目标 ${f.target}`, `Current ${f.actual} → target ${f.target}`)} · ${tx(compByKey[f.competency].def)}</p></div></div>
    <p class="small"><strong>${L('SMART 目标：', 'SMART goal: ')}</strong>${f.goal ? tx(f.goal) : L(`在 6 个月内将「${tx(compByKey[f.competency].name)}」提升到 ${f.target} 级，表现为：${tx(compByKey[f.competency].anchors[f.target >= 5 ? 5 : 3])}`, `Within 6 months, reach level ${f.target} in ${tx(compByKey[f.competency].name)}, shown by: ${tx(compByKey[f.competency].anchors[f.target >= 5 ? 5 : 3])}`)}</p>
    ${f.actions.map((a, ai) => html`<div class="list-item">
      ${editable ? html`<input type="checkbox" data-toggle="${fi}:${ai}" ${a.done ? 'checked' : ''} ${locked ? 'disabled' : ''} aria-label="${L('完成', 'Done')}">` : ''}
      <div class="grow"><div style="${a.done ? 'text-decoration:line-through;color:var(--text-3)' : ''}">${actionText(a, courses)}</div><div class="meta">${tx(ACTION_TYPES[a.type])} · ${L('截止', 'Due')} ${fmt.date(a.due)}${a.ownerId && a.ownerId !== ownerId ? ` · ${L('负责人', 'Owner')} ${personName(people.find((p) => p.id === a.ownerId))}` : ''}</div></div>
      ${badge(a.type === '70' ? '70' : a.type === '20' ? '20' : '10', a.type === '70' ? 'brand' : '')}</div>`)}
  </section>`);
}

async function idpNew(el, ctx, d) {
  const emp = d.active.find((e) => e.id === ctx.query.emp);
  if (!emp) return setHTML(el, empty(L('员工不存在', 'Employee not found'), '', 'alert'));
  if (!canEditPlan({ employeeId: emp.id })) return setHTML(el, empty(L('发展计划由上级或 HR 制定', 'Development plans are set by your manager or HR'), '', 'shield'));
  // Links from the talent review and profiles land here, so an existing plan must not be duplicated.
  const current = activeDevelopmentPlan(d.idps, emp.id);
  if (current) {
    return setHTML(el, html`<a href="#/learning/idp" class="small">← ${L('全部计划', 'All plans')}</a>
      <section class="card" style="margin-top:8px">${callout('info', L(`${personName(emp)} 已有一份进行中的发展计划，可以直接在原计划上修改。`, `${personName(emp)} already has an active plan; change that one instead.`))}
        <div class="row" style="margin-top:12px"><a class="btn btn-primary" href="#/learning/idp/${current.id}">${L('查看计划', 'Open plan')}</a><a class="btn" href="#/learning/idp/${current.id}?edit=1">${icon('edit')}${L('编辑计划', 'Edit plan')}</a></div></section>`);
  }
  const plan = buildIDP(emp, d.courses, today());
  if (plan.mode === 'unassessed') {
    return setHTML(el, html`<a href="#/learning/idp" class="small">← ${L('全部计划', 'All plans')}</a>
      <section class="card" style="margin-top:8px">${callout('info', L(`${personName(emp)} 还没有完整的能力评估。发展计划要基于真实的能力差距，请先完成评估。`, `${personName(emp)} has no complete competency assessment. A development plan needs real gaps, so assess first.`))}
        <a class="btn btn-primary" style="margin-top:12px" href="#/talent/competency?emp=${emp.id}">${L('去完成能力评估', 'Assess competencies')}</a></section>`);
  }
  const intro = callout('brand', plan.mode === 'gap' ? L('已识别当前职级的能力差距，计划聚焦补齐差距。', 'Gaps against the current level found; the plan focuses on closing them.') : plan.mode === 'growth' ? L(`已达到 ${emp.level} 的要求，计划按更高职级段（${nextLevel(emp.level)}）的标准准备发展。`, `Meets ${emp.level}; the plan prepares for the next level band (${nextLevel(emp.level)}).`) : plan.focus.length ? L('已达到最高要求，计划聚焦优势精进。', 'At the top of the profile; the plan deepens strengths.') : L('所有能力都已是最高等级，系统没有可生成的内容。如需计划，请手动添加发展重点。', 'Every competency is at the top level, so nothing was generated. Add a focus area by hand if a plan is still needed.'));
  idpEditor(el, { plan, emp, courses: d.courses, people: d.active, intro, cancelHref: '#/learning/idp', onSaved: (saved) => { location.hash = `#/learning/idp/${saved.id}`; } });
}

async function idpDetail(el, ctx, d) {
  const idp = d.idps.find((i) => i.id === ctx.id);
  if (!idp) return setHTML(el, empty(L('计划不存在', 'Plan not found'), '', 'alert'));
  if (idp.mode === 'retention') return retentionView(el, ctx, { ...d, idps: [idp] });
  const emp = d.employees.find((e) => e.id === idp.employeeId) || {};
  const detailHref = `#/learning/idp/${idp.id}`;
  if (ctx.query.edit && canEditPlan(idp)) {
    return idpEditor(el, { plan: idp, emp, courses: d.courses, people: d.active, cancelHref: detailHref, onSaved: () => { location.hash = detailHref; } });
  }
  const progress = idpProgress(idp);
  const ended = idp.status !== 'active';
  setHTML(el, html`
    <div class="row-between" style="margin-bottom:12px"><div class="row">${avatar(emp, 'md')}<div><a href="#/learning/idp" class="small">← ${L('全部计划', 'All plans')}</a><h2 style="font-size:19px">${L('个人发展计划', 'Development plan')} · ${personName(emp)}</h2><div class="small muted">${loc(emp, 'title')} · ${idp.period} ${badge(tx(IDP_STATUS[idp.status]?.name || [idp.status, idp.status]), IDP_STATUS[idp.status]?.tone)}</div></div></div>
      <div class="row" style="min-width:220px"><div style="flex:1">${meter(progress, 100, 'ok')}</div><strong>${progress}%</strong>${canEditPlan(idp) ? html`<a class="btn btn-sm no-print" href="${detailHref}?edit=1">${icon('edit')}${L('编辑计划', 'Edit plan')}</a>` : ''}<button class="btn btn-sm no-print" type="button" data-print aria-label="${L('打印', 'Print')}">${icon('printer')}</button>${hasRole('hr') ? html`<button class="btn btn-sm no-print" type="button" data-delete-plan aria-label="${L('删除计划', 'Delete plan')}" data-tip="${L('删除计划', 'Delete plan')}">${icon('trash')}</button>` : ''}</div></div>
    ${ended ? callout('info', html`${L('该计划已结束，行动不再计入待办。', 'This plan has ended; its actions no longer appear in task lists.')} ${canEditPlan(idp) ? html`<button class="btn btn-sm no-print" type="button" data-status="active">${L('重新开启', 'Reopen')}</button>` : ''}`) : ''}
    ${!ended && progress === 100 && canEditPlan(idp) ? callout('ok', html`${L('所有行动都已完成。', 'Every action is done.')} <button class="btn btn-sm no-print" type="button" data-status="completed">${icon('check')}${L('标记计划为已完成', 'Mark plan completed')}</button>`) : ''}
    <div class="split" style="margin-top:12px"><div class="stack">${planBlocks(idp.focus || [], d.courses, { editable: true, locked: ended, people: d.employees, ownerId: idp.employeeId })}</div>
      <div class="stack"><div id="ai-idp"></div>
        <section class="card"><div class="card-head"><h2>${L('上级支持', 'Manager support')}</h2></div>
          <ul class="small" style="margin:0;padding-left:18px"><li>${L('每月一次发展对话，回顾行动进展', 'Monthly development conversation to review progress')}</li><li>${L('提供挑战性任务与曝光机会', 'Provide stretch work and visibility')}</li><li>${L('季度末对照行为锚点给出反馈', 'Feedback against the anchors each quarter')}</li></ul></section></div></div>`);
  on(el, 'change', '[data-toggle]', async (e, cb) => {
    const [fi, ai] = cb.dataset.toggle.split(':').map(Number);
    const focus = structuredClone(idp.focus);
    focus[fi].actions[ai].done = cb.checked;
    // Ticking sends the whole plan, so it must not bring back text that was edited since this page loaded.
    await act(null, () => api.put(`/api/idps/${idp.id}`, { focus, expectedUpdatedAt: idp.updatedAt }));
    ctx.rerender();
  });
  on(el, 'click', '[data-status]', async (e, b) => {
    await act(b, () => api.put(`/api/idps/${idp.id}`, { status: b.dataset.status }), L('计划状态已更新', 'Plan status updated'));
    ctx.rerender();
  });
  on(el, 'click', '[data-delete-plan]', async (e, b) => {
    const yes = await confirmDialog(L(`删除 ${personName(emp)} 的发展计划？此操作无法撤销；如只是不再执行，可在编辑页将状态改为“已取消”。`, `Delete ${personName(emp)}'s plan? This cannot be undone. To simply stop it, set its status to Cancelled instead.`), { danger: true, confirmLabel: L('删除', 'Delete') });
    if (yes && await act(b, () => api.del(`/api/idps/${idp.id}`), L('发展计划已删除', 'Plan deleted'))) location.hash = '#/learning/idp';
  });
  on(el, 'click', '[data-print]', () => window.print());
  const g = gaps(emp.competencies, targetProfile(emp.level));
  mountReport(el.querySelector('#ai-idp'), {
    title: L('发展建议', 'Development advice'),
    ruleMd: [
      `**${L('为什么是这些能力', 'Why these areas')}**`,
      ...(idp.focus || []).map((f) => `- **${tx(compByKey[f.competency].name)}**：${L(`当前 ${f.actual}，目标 ${f.target}`, `now ${f.actual}, target ${f.target}`)}。${tx(compByKey[f.competency].def)}`),
      '',
      `**${L('30/60/90 天检查点', '30/60/90-day checkpoints')}**`,
      L('- 30 天：完成正式课程，与上级确认在岗任务\n- 60 天：完成第一项挑战任务并复盘，收集同事反馈\n- 90 天：对照行为锚点自评与上级评估，调整计划', '- 30 days: finish the course and agree the stretch assignment\n- 60 days: complete the first stretch task, review it and gather peer feedback\n- 90 days: self and manager rating against the anchors; adjust the plan'),
    ].join('\n'),
    task: 'idp',
    input: () => ({ employee: { title: emp.titleEn, level: emp.level, performance: emp.performance, potential: emp.potential }, gaps: g.map((x) => ({ competency: compByKey[x.key].name[1], current: x.actual, target: x.target })), draft: (idp.focus || []).map((f) => ({ competency: compByKey[f.competency].name[1], actions: f.actions.map((a) => ({ type: a.type, text: a.courseId ? loc(d.courses.find((c) => c.id === a.courseId), 'titleEn') || a.text?.[1] : a.text?.[1] })) })), courses: d.courses.map((c) => c.titleEn) }),
  });
}

// ------------------------------------------------------------------ TNA
async function tnaView(el, ctx, d) {
  const dept = ctx.query.dept || '';
  const people = d.active.filter((e) => !dept || e.deptId === dept);
  const r = tna(people, d.departments);
  const top = r.byComp.slice(0, 3);
  setHTML(el, html`
    <div class="row-between" style="margin-bottom:12px">
      <select class="input" id="dept" style="width:auto"><option value="">${L('全公司', 'Whole company')}</option>${d.departments.map((x) => html`<option value="${x.id}" ${x.id === dept ? 'selected' : ''}>${loc(x)}</option>`)}</select>
      ${method(L('优先级 =', 'Priority ='), L('存在差距的人数占比 ×（1 + 平均差距）。先解决"面广且差距大"的能力。', 'share of people with a gap × (1 + average gap). Tackle wide and deep gaps first.'))}
    </div>
    <div class="grid cols-2">
      <section class="card"><div class="card-head"><div><h2>${L('培训需求优先级', 'Training priorities')}</h2><p>${L(`基于 ${r.n} 人的完整能力评估${r.unassessed ? `；另有 ${r.unassessed} 人未完成评估，未计入` : ''}`, `From ${r.n} complete assessments${r.unassessed ? `; ${r.unassessed} people without one are excluded` : ''}`)}</p></div></div>
        ${hbars(r.byComp.map((x, i) => ({ label: tx(compByKey[x.key].name), value: x.priority, cls: i < 3 ? 's2' : '', tip: `${tx(compByKey[x.key].name)}: ${L('有差距', 'with gap')} ${fmt.pct(x.share)} · ${L('平均差距', 'avg gap')} ${x.avgGap}` })), { format: (v) => fmt.num(v, 0), head: [L('能力', 'Competency'), L('优先级', 'Priority')] })}
      </section>
      <section class="card"><div class="card-head"><div><h2>${L('推荐培训项目', 'Recommended programs')}</h2><p>${L('针对前三项优先能力', 'For the top three priorities')}</p></div></div>
        ${top.map((x) => {
          const courses = d.courses.filter((c) => c.competency === x.key);
          // Same population as the analysis: a missing rating is not a gap.
          const needing = people.filter((e) => assessCompetencies(e.competencies, targetProfile(e.level)).status === 'complete' && targetProfile(e.level)[x.key] - e.competencies[x.key] >= 1);
          return html`<div class="list-item" style="align-items:flex-start"><div class="grow"><div class="title">${tx(compByKey[x.key].name)} <span class="small muted">${L(`${x.withGap} 人有差距`, `${x.withGap} people with a gap`)}</span></div>
            ${courses.map((c) => html`<div class="meta">${icon('book')} ${loc(c, 'title')} · ${tx(FORMATS[c.format])} · ${c.hours}h</div>`)}</div>
            ${courses[0] && hasRole('hr') ? html`<button class="btn btn-sm" type="button" data-enroll="${courses[0].id}" data-people="${needing.map((e) => e.id).join(',')}">${L(`为 ${needing.length} 人报名`, `Enroll ${needing.length}`)}</button>` : ''}</div>`;
        })}
      </section>
    </div>
    <section class="card" style="margin-top:16px"><div class="card-head"><div><h2>${L('部门 × 能力 平均差距', 'Average gap by department and competency')}</h2><p>${L('颜色越深差距越大', 'Darker means a bigger gap')}</p></div></div>
      ${heatmap({ rows: r.matrix.map((m) => ({ label: `${loc(d.departments.find((x) => x.id === m.deptId))} (${m.n})`, cells: m.cells })), cols: COMPETENCIES.map((c) => ({ key: c.key, label: tx(c.name) })), color: (v) => (v === 0 ? { bg: 'var(--surface-2)', dark: false } : seqColor(v, 2)) })}
    </section>`);
  el.querySelector('#dept').addEventListener('change', (e) => { location.hash = `#/learning/tna${e.target.value ? `?dept=${e.target.value}` : ''}`; });
  on(el, 'click', '[data-enroll]', async (e, b) => {
    const ids = b.dataset.people.split(',').filter(Boolean);
    const existing = new Set(d.enrollments.filter((x) => x.courseId === b.dataset.enroll).map((x) => x.employeeId));
    const todo = ids.filter((id) => !existing.has(id));
    if (!todo.length) return toast(L('这些员工都已报名', 'Everyone is already enrolled'));
    const enrolled = await act(b, () => Promise.all(todo.map((id) => api.post('/api/enrollments', { employeeId: id, courseId: b.dataset.enroll, status: 'planned', progress: 0 }))), L(`已为 ${todo.length} 人报名`, `Enrolled ${todo.length} people`));
    if (!enrolled) return;
    b.textContent = L('已报名', 'Enrolled');
    b.disabled = true;
  });
}

// ------------------------------------------------------------------ courses
async function coursesView(el, ctx, d) {
  const stats = learningStats(d.enrollments, d.employees, d.courses);
  const emp = byId(d.employees);
  const per = (c) => {
    const es = d.enrollments.filter((x) => x.courseId === c.id);
    const done = es.filter((x) => x.status === 'completed');
    const sat = done.map((x) => x.satisfaction).filter(Boolean);
    return { n: es.length, done: done.length, sat: sat.length ? (sat.reduce((a, b) => a + b, 0) / sat.length).toFixed(1) : '—' };
  };
  setHTML(el, html`
    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="card kpi"><span class="label">${L('报名人次', 'Enrollments')}</span><span class="value">${stats.enrollments}</span><span class="sub">${L(`${stats.learners} 名学员`, `${stats.learners} learners`)}</span></div>
      <div class="card kpi"><span class="label">${L('完成率', 'Completion')}</span><span class="value">${fmt.pct(stats.completionRate)}</span></div>
      <div class="card kpi"><span class="label">${L('人均学时', 'Hours per head')}</span><span class="value">${stats.hoursPerHead}<small>h</small></span></div>
      <div class="card kpi"><span class="label">${L('平均满意度', 'Satisfaction')}</span><span class="value">${stats.satisfaction ?? '—'}<small>/5</small></span></div>
    </div>
    <div class="row-between" style="margin-bottom:12px"><span class="small muted">${L('每门课程对应一项能力，便于从差距直接找到资源', 'Each course maps to a competency, so gaps lead straight to resources')}</span>
      ${hasRole('hr') ? html`<button class="btn btn-primary" type="button" data-new>${icon('plus')}${L('新增课程', 'Add course')}</button>` : ''}</div>
    <section class="card card-flush"><div class="table-wrap"><table class="table">
      <thead><tr><th>${L('课程', 'Course')}</th><th>${L('对应能力', 'Competency')}</th><th>${L('形式', 'Format')}</th><th class="num">${L('学时', 'Hours')}</th><th class="num">${L('报名/完成', 'Enrolled/done')}</th><th class="num">${L('满意度', 'Rating')}</th><th></th></tr></thead>
      <tbody>${d.courses.map((c) => {
        const p = per(c);
        return html`<tr><td><strong>${loc(c, 'title')}</strong><div class="small muted">${c.level === 'advanced' ? L('进阶', 'Advanced') : L('基础', 'Foundation')} · ${c.provider || ''}</div></td>
          <td>${tx(compByKey[c.competency]?.name || [c.competency, c.competency])}</td><td>${tx(FORMATS[c.format] || [c.format, c.format])}</td><td class="num">${c.hours}</td><td class="num">${p.n} / ${p.done}</td><td class="num">${p.sat}</td>
          <td><button class="btn btn-sm" type="button" data-view="${c.id}">${L('学员', 'Learners')}</button></td></tr>`;
      })}</tbody></table></div></section>`);
  on(el, 'click', '[data-view]', (e, b) => {
    const c = d.courses.find((x) => x.id === b.dataset.view);
    const es = d.enrollments.filter((x) => x.courseId === c.id);
    modal({
      title: loc(c, 'title'),
      wide: true,
      body: html`${es.length ? html`<div class="table-wrap"><table class="table table-compact"><thead><tr><th>${L('学员', 'Learner')}</th><th>${L('状态', 'Status')}</th><th>${L('进度', 'Progress')}</th><th></th></tr></thead>
        <tbody>${es.map((x) => html`<tr><td>${personLink(emp[x.employeeId])}</td><td>${badge(tx(ENROLL_STATUS[x.status][0]), ENROLL_STATUS[x.status][1])}</td><td style="min-width:100px">${meter(x.progress || 0, 100, 'ok')}</td>
          <td>${x.status !== 'completed' && (hasRole('hr') || x.employeeId === getActor()) ? html`<button class="btn btn-sm" type="button" data-complete="${x.id}">${L('标记完成', 'Mark done')}</button>` : ''}</td></tr>`)}</tbody></table></div>` : empty(L('暂无学员', 'No learners yet'), '', 'users')}
        ${hasRole('hr') ? html`<div class="row" style="margin-top:12px"><select class="input" name="add" style="flex:1"><option value="">${L('添加学员…', 'Add a learner…')}</option>${d.active.filter((e2) => !es.some((x) => x.employeeId === e2.id)).map((e2) => html`<option value="${e2.id}">${personName(e2)} · ${loc(e2, 'title')}</option>`)}</select></div>` : ''}`,
      submitLabel: L('添加', 'Add'),
      onOpen: (form) => {
        on(form, 'click', '[data-complete]', async (ev, btn) => {
          const done = await act(btn, () => api.put(`/api/enrollments/${btn.dataset.complete}`, { status: 'completed', progress: 100, completedAt: today() }), L('已标记完成', 'Marked done'));
          if (done) btn.closest('td').innerHTML = '';
        });
      },
      onSubmit: hasRole('hr') ? async (v) => {
        if (!v.add) throw new Error(L('请选择学员', 'Choose a learner'));
        await api.post('/api/enrollments', { employeeId: v.add, courseId: c.id, status: 'planned', progress: 0 });
        toast(L('已报名', 'Enrolled'));
        ctx.rerender();
      } : null,
      onClose: () => ctx.rerender(),
    });
  });
  on(el, 'click', '[data-new]', () => modal({
    title: L('新增课程', 'Add course'),
    body: html`<div class="form-grid">
      ${field(L('课程名称', 'Title'), input('title', { required: true }), { span: true })}
      ${field(L('对应能力', 'Competency'), select('competency', COMPETENCIES.map((c) => [c.key, tx(c.name)])))}
      ${field(L('形式', 'Format'), select('format', Object.entries(FORMATS).map(([k, v]) => [k, tx(v)])))}
      ${field(L('学时', 'Hours'), input('hours', { type: 'number', min: 1, value: 4 }))}
      ${field(L('难度', 'Level'), select('level', [['foundation', L('基础', 'Foundation')], ['advanced', L('进阶', 'Advanced')]]))}
      ${field(L('提供方', 'Provider'), input('provider', { value: 'Academy' }))}</div>`,
    onSubmit: async (v) => {
      if (!v.title.trim()) throw new Error(L('请填写课程名称', 'Title is required'));
      await api.post('/api/courses', { title: v.title.trim(), titleEn: v.title.trim(), competency: v.competency, format: v.format, hours: Number(v.hours) || 1, level: v.level, provider: v.provider });
      toast(L('课程已添加', 'Course added'));
      ctx.rerender();
    },
  }));
}

// ------------------------------------------------------------------ evaluation
async function evalView(el) {
  setHTML(el, html`
    <div class="split-wide">
      <section class="card"><div class="card-head"><h2>${L('柯氏四级评估 + ROI', 'Kirkpatrick four levels + ROI')}</h2></div>
        <form id="eval-form" class="stack" style="gap:10px">
          ${field(L('L1 反应层：学员满意度（1-5）', 'L1 Reaction: satisfaction (1-5)'), input('reaction', { type: 'number', min: 1, max: 5, step: 0.1, value: 4.3 }))}
          <div class="form-grid">${field(L('L2 学习层：训前测试分', 'L2 Learning: pre-test'), input('pre', { type: 'number', value: 62 }))}${field(L('训后测试分', 'Post-test'), input('post', { type: 'number', value: 81 }))}</div>
          ${field(L('L3 行为层：上级评价的行为改变（1-5）', 'L3 Behavior: manager-rated change (1-5)'), input('behavior', { type: 'number', min: 1, max: 5, step: 0.1, value: 3.6 }))}
          <div class="form-grid">${field(L('L4 结果层：训前业务指标', 'L4 Results: metric before'), input('metricBefore', { type: 'number', value: 100 }))}${field(L('训后业务指标', 'Metric after'), input('metricAfter', { type: 'number', value: 112 }))}</div>
          <div class="form-grid">${field(L('培训带来的货币化收益（元）', 'Monetized benefit (RMB)'), input('benefit', { type: 'number', value: 180000 }))}${field(L('培训总成本（元）', 'Total cost (RMB)'), input('cost', { type: 'number', value: 60000 }))}</div>
        </form></section>
      <div class="stack"><section class="card" id="eval-out"></section>
        <section class="card">${method(L('方法说明：', 'About the method:'), L('L1 学员是否满意；L2 是否学会；L3 是否用在工作中；L4 是否带来业务结果。ROI =（收益 − 成本）÷ 成本（Phillips）。计算 L4 与 ROI 时，应通过对照组或趋势分析剔除其他因素的影响。', 'L1: did they like it; L2: did they learn; L3: do they use it at work; L4: did it move results. ROI = (benefit − cost) / cost (Phillips). For L4 and ROI, isolate the training effect with a control group or trend analysis.'))}</section></div>
    </div>`);
  const form = el.querySelector('#eval-form');
  const out = el.querySelector('#eval-out');
  const names = { 1: L('反应层', 'Reaction'), 2: L('学习层', 'Learning'), 3: L('行为层', 'Behavior'), 4: L('结果层', 'Results') };
  const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
  const render = () => {
    const r = evaluateProgram(Object.fromEntries(new FormData(form)));
    setHTML(out, html`<div class="card-head"><h2>${L('评估结果', 'Results')}</h2></div>
      ${r.levels.map((l) => html`<div class="list-item"><span class="badge ${l.ok ? 'badge-ok' : 'badge-warn'}">L${l.level}</span><div class="grow"><div class="title">${names[l.level]} · ${l.level === 2 ? L(`变化 ${signed(l.value)} 分${l.gain != null ? `（${signed(l.gain)}%）` : ''}`, `${signed(l.value)} points${l.gain != null ? ` (${signed(l.gain)}%)` : ''}`) : l.level === 4 ? `${l.value > 0 ? '+' : ''}${l.value}%` : `${l.value} / ${l.max}`}</div><div class="meta">${tx(l.note)}</div></div></div>`)}
      ${r.roi != null ? html`<div class="row" style="margin-top:12px;gap:24px"><div><div class="small muted">ROI</div><div class="result-big" style="color:var(--${r.roi >= 0 ? 'ok' : 'danger'})">${r.roi}%</div></div><div><div class="small muted">${L('收益成本比', 'Benefit-cost ratio')}</div><div class="result-big">${r.bcr}</div></div></div>` : ''}`);
  };
  form.addEventListener('input', render);
  render();
}
