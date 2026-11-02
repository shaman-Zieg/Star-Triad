// Editing a development plan: levels, goals and 70-20-10 actions, saved together.
import { html, setHTML, api, today, personName, avatar, badge, callout, field, input, meter, on, toast, hasRole, getActor, icon } from '../core.js';
import { L, tx, loc } from '../i18n.js';
import { compByKey, COMPETENCIES, gaps, targetProfile } from '../engine/competency.js';
import { ACTION_TYPES, IDP_STATUS, idpDraftErrors, idpMix, newAction, newFocusArea } from '../engine/learning.js';
import { radar } from '../charts.js';
import { addDays } from '../engine/text.js';

// Mirrors the server rule: nobody rewrites their own development goals.
export const canEditPlan = (plan) => hasRole('hr') || (hasRole('manager') && plan.employeeId !== getActor());

const levelOptions = (value) => [1, 2, 3, 4, 5].map((n) => html`<option value="${n}" ${n === value ? 'selected' : ''}>${n}</option>`);
const defaultGoal = (f) => L(`在 6 个月内将「${tx(compByKey[f.competency].name)}」提升到 ${f.target} 级`, `Reach level ${f.target} in ${tx(compByKey[f.competency].name)} within 6 months`);
const goalText = (f) => (f.goal ? tx(f.goal) : '');

function cleanFocus(focus) {
  return focus.map(({ goal, ...f }) => ({
    ...f,
    ...(goal && String(goal[0]).trim() ? { goal: goal.map((s) => s.trim()) } : {}),
    actions: f.actions.map((a) => ({ ...a, text: a.text.map((s) => String(s).trim()) })),
  }));
}

const ACTION_ORDER = ['70', '20', '10'];

export function idpEditor(el, { plan, emp, courses, people, intro, cancelHref, onSaved }) {
  const isNew = !plan.id;
  const draft = { period: plan.period || String(new Date().getFullYear()), status: plan.status || 'active', focus: structuredClone(plan.focus || []) };
  const defaultDue = () => addDays(today(), 60);
  // Errors stay quiet until the first save attempt, then update as each one is fixed.
  let checking = false;
  const usedElsewhere = (fi) => new Set(draft.focus.filter((_, i) => i !== fi).map((f) => f.competency));

  // Courses for this competency come first, since a plan usually draws on them.
  const courseOptions = (f, a) => [...courses].sort((x, y) => (y.competency === f.competency) - (x.competency === f.competency))
    .map((c) => html`<option value="${c.id}" ${c.id === a.courseId ? 'selected' : ''}>${loc(c, 'title')}${c.competency === f.competency ? '' : ` · ${tx(compByKey[c.competency]?.name || ['', ''])}`}</option>`);
  const ownerOptions = (a) => {
    const known = people.some((p) => p.id === a.ownerId);
    return [...people, ...(a.ownerId && !known ? [{ id: a.ownerId, name: a.ownerId }] : [])].map((p) => html`<option value="${p.id}" ${p.id === a.ownerId ? 'selected' : ''}>${personName(p)}</option>`);
  };
  const actionRow = (a, fi, ai) => html`<div class="idp-action" data-where="action-${fi}-${ai}">
    <input type="checkbox" data-done="${fi}:${ai}" ${a.done ? 'checked' : ''} aria-label="${L('已完成', 'Done')}" data-tip="${L('已完成', 'Done')}">
    <select class="input" data-type="${fi}:${ai}" aria-label="${L('行动类型', 'Action type')}">${ACTION_ORDER.map((t) => html`<option value="${t}" ${t === a.type ? 'selected' : ''}>${tx(ACTION_TYPES[t])}</option>`)}</select>
    <div class="idp-action-text">
      ${a.type === '10' ? html`<select class="input" data-course="${fi}:${ai}" aria-label="${L('关联课程', 'Linked course')}"><option value="">${L('不关联课程（自行填写）', 'No linked course (describe it)')}</option>${courseOptions(draft.focus[fi], a)}</select>` : ''}
      ${a.courseId ? '' : html`<input class="input" data-text="${fi}:${ai}" value="${tx(a.text)}" maxlength="300" placeholder="${L('具体要做什么、做到什么程度', 'What to do, and to what standard')}" aria-label="${L('行动内容', 'Action')}">`}
    </div>
    <div class="idp-action-meta">
      <label class="small">${L('截止', 'Due')} <input class="input" type="date" data-due="${fi}:${ai}" value="${a.due}"></label>
      <label class="small">${L('负责人', 'Owner')} <select class="input" data-owner="${fi}:${ai}"><option value="">${L('员工本人', 'The employee')}</option>${ownerOptions(a)}</select></label>
    </div>
    <button class="icon-btn" type="button" data-del-action="${fi}:${ai}" aria-label="${L('删除行动', 'Remove action')}" data-tip="${L('删除行动', 'Remove action')}">${icon('trash')}</button>
  </div>`;

  const focusCard = (f, fi) => html`<section class="card idp-focus" data-where="focus-${fi}">
    <div class="card-head"><h2>${L(`发展重点 ${fi + 1}`, `Focus area ${fi + 1}`)}</h2><button class="btn btn-sm" type="button" data-del-focus="${fi}">${icon('trash')}${L('移除此重点', 'Remove this area')}</button></div>
    <div class="form-grid cols-3">
      ${field(L('能力', 'Competency'), html`<select class="input" data-competency="${fi}">${COMPETENCIES.filter((c) => c.key === f.competency || !usedElsewhere(fi).has(c.key)).map((c) => html`<option value="${c.key}" ${c.key === f.competency ? 'selected' : ''}>${tx(c.name)}</option>`)}</select>`)}
      ${field(L('当前等级', 'Current level'), html`<select class="input" data-actual="${fi}">${levelOptions(f.actual)}</select>`)}
      ${field(L('目标等级', 'Target level'), html`<select class="input" data-target="${fi}">${levelOptions(f.target)}</select>`)}
      <div class="span-3">${field(L('SMART 目标（留空则按能力与目标等级自动生成）', 'SMART goal (leave blank to generate it from the competency and target)'), html`<textarea class="input" rows="2" maxlength="600" data-goal="${fi}" placeholder="${defaultGoal(f)}">${goalText(f)}</textarea>`)}</div>
    </div>
    <div class="section-title">${L('发展行动', 'Actions')}</div>
    ${f.actions.map((a, ai) => actionRow(a, fi, ai))}
    <div class="row" style="margin-top:10px">${ACTION_ORDER.map((t) => html`<button class="btn btn-sm" type="button" data-add-action="${fi}:${t}">${icon('plus')}${tx(ACTION_TYPES[t])}</button>`)}</div>
  </section>`;

  // The target line follows the draft, so changing a level shows up here straight away.
  const sidePanel = () => {
    const mix = idpMix(draft.focus);
    const missing = mix.filter((m) => !m.count).map((m) => tx(ACTION_TYPES[m.type]));
    return html`<div class="stack idp-side">
      <section class="card"><div class="card-head"><div><h2>${L('行动结构', 'Action mix')}</h2><p>${L('参考比例 70-20-10，不必严格一致', 'A guide of 70-20-10, not a quota')}</p></div></div>
        ${mix.map((m) => html`<div class="idp-mix"><span class="small">${tx(ACTION_TYPES[m.type])}</span>${meter(m.share, 100, m.type === '70' ? 'ok' : '')}<strong class="small num">${m.count} · ${m.share}%</strong></div>`)}
        ${missing.length && draft.focus.length ? callout('warn', L(`还没有「${missing.join('、')}」类行动。`, `No actions yet for: ${missing.join(', ')}.`)) : ''}</section>
      ${emp.competencies ? html`<section class="card"><div class="card-head"><h2>${L('能力对照', 'Profile vs target')}</h2></div>
        ${radar({ axes: COMPETENCIES.map((c) => ({ key: c.key, label: tx(c.name) })), series: [{ name: L('当前', 'Current'), values: emp.competencies, cls: 's1' }, { name: L('计划目标', 'Plan target'), values: { ...emp.competencies, ...Object.fromEntries(draft.focus.map((f) => [f.competency, f.target])) }, cls: 's2' }], size: 300 })}</section>` : ''}
    </div>`;
  };

  const markErrors = () => {
    const errors = checking ? idpDraftErrors(draft) : [];
    const box = el.querySelector('.idp-errors');
    box.hidden = !errors.length;
    setHTML(box, errors.length ? callout('danger', html`<strong>${L(`还有 ${errors.length} 处需要修改：`, `${errors.length} item(s) to fix:`)}</strong><ul style="margin:4px 0 0;padding-left:18px">${errors.map((x) => html`<li>${tx(x.text)}</li>`)}</ul>`) : '');
    const where = new Set(errors.map((x) => x.where));
    el.querySelectorAll('[data-where]').forEach((node) => node.classList.toggle('has-error', where.has(node.dataset.where)));
    return errors;
  };
  const render = () => setHTML(el, html`
    <div class="row-between" style="margin-bottom:12px"><div class="row">${avatar(emp, 'md')}<div><a href="${cancelHref}" class="small">← ${L('返回', 'Back')}</a><h2 style="font-size:19px">${isNew ? L('新建发展计划', 'New development plan') : L('编辑发展计划', 'Edit development plan')} · ${personName(emp)}</h2><div class="small muted">${loc(emp, 'title')} · ${emp.level}</div></div></div>
      <div class="row"><a class="btn" href="${cancelHref}">${L('取消', 'Cancel')}</a><button class="btn btn-primary" type="button" data-save>${icon('check')}${L('保存计划', 'Save plan')}</button></div></div>
    ${intro || ''}
    <div class="idp-errors" role="alert" hidden></div>
    <div class="split" style="margin-top:12px"><div class="stack">
      <section class="card"><div class="card-head"><h2>${L('计划信息', 'Plan details')}</h2></div>
        <div class="form-grid">
          ${field(L('计划周期', 'Period'), input('period', { value: draft.period, maxlength: 80, placeholder: L('如：2026 下半年', 'e.g. H2 2026') }))}
          ${isNew ? '' : field(L('状态', 'Status'), html`<select class="input" name="status">${Object.entries(IDP_STATUS).map(([k, s]) => html`<option value="${k}" ${k === draft.status ? 'selected' : ''}>${tx(s.name)}</option>`)}</select>`)}
        </div></section>
      ${draft.focus.map(focusCard)}
      <div>${draft.focus.length < COMPETENCIES.length ? html`<button class="btn" type="button" data-add-focus>${icon('plus')}${L('添加发展重点', 'Add focus area')}</button>` : ''}</div>
    </div>${sidePanel()}</div>`);
  const draw = () => {
    render();
    markErrors();
  };

  const at = (value) => draft.focus[Number(value)];
  on(el, 'input', '[name=period]', (e, box) => { draft.period = box.value; });
  on(el, 'change', '[name=status]', (e, box) => { draft.status = box.value; });
  on(el, 'input', '[data-goal]', (e, box) => { at(box.dataset.goal).goal = [box.value, box.value]; });
  on(el, 'change', '[data-actual]', (e, box) => {
    at(box.dataset.actual).actual = Number(box.value);
    markErrors();
  });
  on(el, 'change', '[data-target]', (e, box) => { at(box.dataset.target).target = Number(box.value); draw(); });
  on(el, 'change', '[data-competency]', (e, box) => {
    // The levels describe one competency, so a new choice starts from that competency's own values.
    const { actual, target } = newFocusArea(box.value, emp, defaultDue());
    Object.assign(at(box.dataset.competency), { competency: box.value, actual, target });
    draw();
  });
  const action = (value) => {
    const [fi, ai] = value.split(':').map(Number);
    return draft.focus[fi].actions[ai];
  };
  on(el, 'input', '[data-text]', (e, box) => {
    action(box.dataset.text).text = [box.value, box.value];
    markErrors();
  });
  on(el, 'change', '[data-due]', (e, box) => {
    action(box.dataset.due).due = box.value;
    markErrors();
  });
  on(el, 'change', '[data-done]', (e, box) => { action(box.dataset.done).done = box.checked; });
  on(el, 'change', '[data-owner]', (e, box) => {
    const a = action(box.dataset.owner);
    if (box.value) a.ownerId = box.value;
    else delete a.ownerId;
  });
  on(el, 'change', '[data-type]', (e, box) => {
    const a = action(box.dataset.type);
    a.type = box.value;
    if (a.type !== '10') delete a.courseId;
    draw();
  });
  on(el, 'change', '[data-course]', (e, box) => {
    const a = action(box.dataset.course);
    const course = courses.find((c) => c.id === box.value);
    if (course) Object.assign(a, { courseId: course.id, text: [course.title, course.titleEn || course.title] });
    else delete a.courseId;
    draw();
  });
  on(el, 'click', '[data-add-action]', (e, b) => {
    const [fi, type] = b.dataset.addAction.split(':');
    const list = at(fi).actions;
    list.push(newAction(type, defaultDue()));
    draw();
    el.querySelector(`[data-text="${fi}:${list.length - 1}"]`)?.focus();
  });
  on(el, 'click', '[data-del-action]', (e, b) => {
    const [fi, ai] = b.dataset.delAction.split(':').map(Number);
    draft.focus[fi].actions.splice(ai, 1);
    draw();
  });
  on(el, 'click', '[data-del-focus]', (e, b) => {
    draft.focus.splice(Number(b.dataset.delFocus), 1);
    draw();
  });
  on(el, 'click', '[data-add-focus]', () => {
    // Suggest the widest remaining gap, so the common case needs no further choosing.
    const used = new Set(draft.focus.map((f) => f.competency));
    const next = gaps(emp.competencies || {}, targetProfile(emp.level)).find((g) => !used.has(g.key));
    if (!next) return;
    draft.focus.push(newFocusArea(next.key, emp, defaultDue()));
    draw();
    el.querySelector(`[data-competency="${draft.focus.length - 1}"]`)?.scrollIntoView({ block: 'center' });
  });
  on(el, 'click', '[data-save]', async (e, button) => {
    checking = true;
    if (markErrors().length) return el.querySelector('.idp-errors').scrollIntoView({ block: 'center' });
    button.disabled = true;
    try {
      const body = { focus: cleanFocus(draft.focus), period: draft.period.trim() };
      const saved = isNew
        ? await api.post('/api/idps', { ...body, employeeId: emp.id, status: 'active', mode: plan.mode, name: emp.name, nameEn: emp.nameEn })
        : await api.put(`/api/idps/${plan.id}`, { ...body, status: draft.status });
      toast(L('发展计划已保存', 'Plan saved'));
      onSaved(saved);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  });
  draw();
}
