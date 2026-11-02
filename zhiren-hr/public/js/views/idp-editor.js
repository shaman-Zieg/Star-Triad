// Editing a development plan: levels, goals and 70-20-10 actions, saved together.
import { html, setHTML, api, today, personName, avatar, badge, field, input, textarea, on, toast, hasRole, getActor, icon } from '../core.js';
import { L, tx, loc } from '../i18n.js';
import { compByKey, COMPETENCIES } from '../engine/competency.js';
import { IDP_STATUS, idpDraftErrors } from '../engine/learning.js';

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

export function idpEditor(el, { plan, emp, courses, people, intro, cancelHref, onSaved }) {
  const isNew = !plan.id;
  const draft = { period: plan.period || String(new Date().getFullYear()), status: plan.status || 'active', focus: structuredClone(plan.focus || []) };
  const usedElsewhere = (fi) => new Set(draft.focus.filter((_, i) => i !== fi).map((f) => f.competency));

  const focusCard = (f, fi) => html`<section class="card idp-focus" data-where="focus-${fi}">
    <div class="card-head"><h2>${L(`发展重点 ${fi + 1}`, `Focus area ${fi + 1}`)}</h2></div>
    <div class="form-grid cols-3">
      ${field(L('能力', 'Competency'), html`<select class="input" data-competency="${fi}">${COMPETENCIES.filter((c) => c.key === f.competency || !usedElsewhere(fi).has(c.key)).map((c) => html`<option value="${c.key}" ${c.key === f.competency ? 'selected' : ''}>${tx(c.name)}</option>`)}</select>`)}
      ${field(L('当前等级', 'Current level'), html`<select class="input" data-actual="${fi}">${levelOptions(f.actual)}</select>`)}
      ${field(L('目标等级', 'Target level'), html`<select class="input" data-target="${fi}">${levelOptions(f.target)}</select>`)}
      <div class="span-3">${field(L('SMART 目标（留空则按能力与目标等级自动生成）', 'SMART goal (leave blank to generate it from the competency and target)'), html`<textarea class="input" rows="2" maxlength="600" data-goal="${fi}" placeholder="${defaultGoal(f)}">${goalText(f)}</textarea>`)}</div>
    </div>
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
