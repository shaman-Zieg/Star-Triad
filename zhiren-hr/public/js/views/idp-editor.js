// Editing a development plan: levels, goals and 70-20-10 actions, saved together.
import { html, setHTML, api, today, personName, avatar, badge, field, input, textarea, on, toast, hasRole, getActor, icon } from '../core.js';
import { L, tx, loc } from '../i18n.js';
import { compByKey, COMPETENCIES } from '../engine/competency.js';
import { ACTION_TYPES, IDP_STATUS, idpDraftErrors } from '../engine/learning.js';

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
  </div>`;

  const focusCard = (f, fi) => html`<section class="card idp-focus" data-where="focus-${fi}">
    <div class="card-head"><h2>${L(`发展重点 ${fi + 1}`, `Focus area ${fi + 1}`)}</h2></div>
    <div class="form-grid cols-3">
      ${field(L('能力', 'Competency'), html`<select class="input" data-competency="${fi}">${COMPETENCIES.filter((c) => c.key === f.competency || !usedElsewhere(fi).has(c.key)).map((c) => html`<option value="${c.key}" ${c.key === f.competency ? 'selected' : ''}>${tx(c.name)}</option>`)}</select>`)}
      ${field(L('当前等级', 'Current level'), html`<select class="input" data-actual="${fi}">${levelOptions(f.actual)}</select>`)}
      ${field(L('目标等级', 'Target level'), html`<select class="input" data-target="${fi}">${levelOptions(f.target)}</select>`)}
      <div class="span-3">${field(L('SMART 目标（留空则按能力与目标等级自动生成）', 'SMART goal (leave blank to generate it from the competency and target)'), html`<textarea class="input" rows="2" maxlength="600" data-goal="${fi}" placeholder="${defaultGoal(f)}">${goalText(f)}</textarea>`)}</div>
    </div>
    <div class="section-title">${L('发展行动', 'Actions')}</div>
    ${f.actions.map((a, ai) => actionRow(a, fi, ai))}
  </section>`;

  const draw = () => setHTML(el, html`
    <div class="row-between" style="margin-bottom:12px"><div class="row">${avatar(emp, 'md')}<div><a href="${cancelHref}" class="small">← ${L('返回', 'Back')}</a><h2 style="font-size:19px">${isNew ? L('新建发展计划', 'New development plan') : L('编辑发展计划', 'Edit development plan')} · ${personName(emp)}</h2><div class="small muted">${loc(emp, 'title')} · ${emp.level}</div></div></div>
      <div class="row"><a class="btn" href="${cancelHref}">${L('取消', 'Cancel')}</a><button class="btn btn-primary" type="button" data-save>${icon('check')}${L('保存计划', 'Save plan')}</button></div></div>
    ${intro || ''}
    <div class="stack" style="margin-top:12px">
      <section class="card"><div class="card-head"><h2>${L('计划信息', 'Plan details')}</h2></div>
        <div class="form-grid">
          ${field(L('计划周期', 'Period'), input('period', { value: draft.period, maxlength: 80, placeholder: L('如：2026 下半年', 'e.g. H2 2026') }))}
          ${isNew ? '' : field(L('状态', 'Status'), html`<select class="input" name="status">${Object.entries(IDP_STATUS).map(([k, s]) => html`<option value="${k}" ${k === draft.status ? 'selected' : ''}>${tx(s.name)}</option>`)}</select>`)}
        </div></section>
      ${draft.focus.map(focusCard)}
    </div>`);

  const at = (value) => draft.focus[Number(value)];
  on(el, 'input', '[name=period]', (e, box) => { draft.period = box.value; });
  on(el, 'change', '[name=status]', (e, box) => { draft.status = box.value; });
  on(el, 'input', '[data-goal]', (e, box) => { at(box.dataset.goal).goal = [box.value, box.value]; });
  on(el, 'change', '[data-actual]', (e, box) => { at(box.dataset.actual).actual = Number(box.value); });
  on(el, 'change', '[data-target]', (e, box) => { at(box.dataset.target).target = Number(box.value); draw(); });
  on(el, 'change', '[data-competency]', (e, box) => { at(box.dataset.competency).competency = box.value; draw(); });
  const action = (value) => {
    const [fi, ai] = value.split(':').map(Number);
    return draft.focus[fi].actions[ai];
  };
  on(el, 'input', '[data-text]', (e, box) => { action(box.dataset.text).text = [box.value, box.value]; });
  on(el, 'change', '[data-due]', (e, box) => { action(box.dataset.due).due = box.value; });
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
  on(el, 'click', '[data-save]', async (e, button) => {
    const errors = idpDraftErrors(draft);
    if (errors.length) return toast(tx(errors[0].text), 'error');
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
