import { html, setHTML, api, today, personName, fmt, badge, callout, empty, on, act, modal, field, input, textarea, select } from '../core.js';
import { L, tx } from '../i18n.js';
import { flightRisk } from '../engine/talent.js';
import { retentionEligible, buildRetentionPlan, retentionProgress } from '../engine/retention.js';

export function retentionView(el, ctx, d, evaluation = false) {
  const plans = d.idps.filter(p => p.mode === 'retention');
  const existing = new Set(plans.filter(p => p.status === 'active').map(p => p.employeeId));
  const eligible = d.active.filter(e => retentionEligible(e, today()) && !existing.has(e.id));
  setHTML(el, html`
    ${callout('info', L('留任干预仅为高流失风险核心人员创建（风险分 ≥55，且绩效 ≥4 或潜力为3）。计划保存创建时的风险基线；30/60/90天回访记录用于核对落实情况，风险变化不等于干预的因果效果。', 'Create retention plans only for high-risk key talent (risk ≥55 and performance ≥4 or potential 3). Preserve the initial baseline and review delivery at days 30/60/90. Risk changes do not establish causality.'))}
    ${!evaluation ? html`<div class="row-between" style="margin:16px 0"><h2>${L('留任干预 IDP', 'Retention intervention IDPs')}</h2><select class="input" id="retention-new" style="width:auto" aria-label="${L('创建留任干预', 'Create retention plan')}"><option value="">${L('为高风险核心人员创建…', 'Create for high-risk key talent…')}</option>${eligible.map(e => html`<option value="${e.id}">${personName(e)} · ${flightRisk(e, today()).score}</option>`)}</select></div>` : ''}
    <div class="stack" style="margin-top:16px">${plans.length ? plans.map(p => {
      const employee = d.employees.find(e => e.id === p.employeeId);
      const risk = employee && flightRisk(employee, today());
      return html`<section class="card">
        <div class="card-head"><div><h2>${personName(employee)} · ${L('留任干预', 'Retention intervention')}</h2><p>${L('创建基线', 'Initial risk')} ${p.baseline.score} → ${L('当前风险', 'Current risk')} ${risk?.score ?? '—'} · ${L('行动完成', 'Actions completed')} ${retentionProgress(p)}% · ${L('90天复盘', '90-day review')} ${fmt.date(p.reviewDue)}</p></div>${badge(employee?.status === 'left' ? L('已离职', 'Left') : L('在职', 'Active'), employee?.status === 'left' ? 'danger' : 'ok')}</div>
        ${evaluation ? html`
          <p class="small muted">${L('当前风险来自最新员工档案；回访保存当日风险、敬业度与在职状态快照。完成行动不自动代表留任成功。', 'Current risk uses the latest employee record. Reviews preserve dated risk, engagement and employment status. Completed actions alone do not mean successful retention.')}</p>
          <button class="btn btn-primary" type="button" data-review="${p.id}">${L('记录留任回访', 'Record retention review')}</button>
          ${(p.reviews || []).length ? p.reviews.map(r => html`<div class="list-item"><div><strong>${r.checkpoint} ${L('天回访', 'day review')} · ${fmt.date(r.date)}</strong><div class="small">${L('风险', 'Risk')} ${p.baseline.score} → ${r.riskScore ?? '—'} · ${L('敬业度', 'Engagement')} ${p.baseline.engagement ?? '—'} → ${r.engagement ?? '—'} · ${L('完成率', 'Completion')} ${r.progress}% · ${r.employmentStatus === 'left' ? L('已离职', 'Left') : L('在职', 'Active')}</div><p>${r.note}</p><div class="small muted">${L('下一步：', 'Next step: ')}${r.nextStep}</div></div></div>`) : empty(L('尚无回访记录', 'No reviews yet'), L('请在实际回访后记录结果。', 'Record results after a real check-in.'), 'message')}
        ` : html`${p.actions.map((a, index) => html`<div class="list-item" style="align-items:flex-start"><input type="checkbox" data-plan="${p.id}" data-action="${index}" ${a.done ? 'checked' : ''} aria-label="${tx(a.text)}"><div class="grow"><strong>${tx(a.text)}</strong><p class="small muted">${L('依据：', 'Evidence: ')}${tx(a.reason)}</p><div class="small">${L('负责人：', 'Owner: ')}${tx(a.owner)} · ${L('截止：', 'Due: ')}${fmt.date(a.due)}</div><p class="small">${L('验收：', 'Acceptance: ')}${tx(a.evidence)}</p></div><button class="btn btn-sm" type="button" data-edit-action="${p.id}:${index}">${L('调整', 'Edit')}</button></div>`)}<a class="btn btn-sm" href="#/learning/eval?kind=retention">${L('查看留任评估', 'View retention evaluation')}</a>`}
      </section>`;
    }) : empty(L('尚无留任干预计划', 'No retention plans yet'), L('从个人发展计划的“留任干预”中创建。', 'Create one under Development plans → Retention intervention.'), 'target')}</div>`);
  el.querySelector('#retention-new')?.addEventListener('change', event => {
    const employee = eligible.find(e => e.id === event.target.value);
    if (!employee) return;
    const plan = buildRetentionPlan(employee, today());
    modal({ title: L('确认留任干预计划', 'Review retention plan'), body: html`<p>${personName(employee)} · ${L('初始风险', 'Initial risk')} ${plan.baseline.score}</p>${plan.actions.map(a => html`<div class="list-item"><div><strong>${tx(a.text)}</strong><p>${tx(a.owner)} · ${fmt.date(a.due)}</p><p class="small muted">${tx(a.evidence)}</p></div></div>`)}`, onSubmit: async () => { await api.post('/api/idps', plan); ctx.rerender(); } });
    event.target.value = '';
  });
  on(el, 'change', '[data-action]', async (event, checkbox) => {
    const plan = plans.find(p => p.id === checkbox.dataset.plan);
    const actions = structuredClone(plan.actions);
    actions[Number(checkbox.dataset.action)].done = checkbox.checked;
    await act(checkbox, () => api.put(`/api/idps/${plan.id}`, { actions }));
    ctx.rerender();
  });
  on(el, 'click', '[data-edit-action]', (event, button) => {
    const [id, index] = button.dataset.editAction.split(':');
    const plan = plans.find(p => p.id === id);
    const action = plan.actions[Number(index)];
    modal({ title: L('调整行动与责任人', 'Edit action and owner'), body: html`${field(L('行动方案', 'Action'), textarea('text', { value: tx(action.text), required: true }))}${field(L('具体负责人', 'Owner'), input('owner', { value: tx(action.owner), required: true }))}${field(L('截止日期', 'Due date'), input('due', { type: 'date', value: action.due, required: true }))}${field(L('验收标准', 'Acceptance criteria'), textarea('evidence', { value: tx(action.evidence), required: true }))}`, onSubmit: async v => {
      if (!v.text.trim() || !v.owner.trim() || !v.evidence.trim()) throw new Error(L('请填写方案、负责人和验收标准', 'Action, owner and acceptance criteria are required'));
      const actions = structuredClone(plan.actions);
      actions[Number(index)] = { ...action, text: [v.text, v.text], owner: [v.owner, v.owner], due: v.due, evidence: [v.evidence, v.evidence] };
      await api.put(`/api/idps/${id}`, { actions }); ctx.rerender();
    } });
  });
  on(el, 'click', '[data-review]', (event, button) => {
    const plan = plans.find(p => p.id === button.dataset.review);
    modal({ title: L('留任回访记录', 'Retention review'), body: html`${field(L('检查点', 'Checkpoint'), select('checkpoint', [['30', '30天 / days'], ['60', '60天 / days'], ['90', '90天 / days']]))}${field(L('实际落实与员工反馈', 'Delivery and employee feedback'), textarea('note', { required: true }))}${field(L('后续行动', 'Next step'), textarea('nextStep', { required: true }))}`, onSubmit: async v => {
      if (!v.note.trim() || !v.nextStep.trim()) throw new Error(L('请填写反馈和后续行动', 'Feedback and next step are required'));
      const employee = await api.get(`/api/employees/${plan.employeeId}`);
      const latest = await api.get(`/api/idps/${plan.id}`);
      const review = { ...v, date: today(), riskScore: flightRisk(employee, today())?.score ?? null, engagement: employee.engagement ?? null, employmentStatus: employee.status, progress: retentionProgress(latest) };
      await api.put(`/api/idps/${plan.id}`, { reviews: [...(latest.reviews || []), review] }); ctx.rerender();
    } });
  });
}
