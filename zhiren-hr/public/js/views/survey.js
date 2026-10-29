// Public, anonymous survey form (#/s/:id). Respondents never see results or other people's answers.
import { html, setHTML, api, logo, likert, empty, toast } from '../core.js';
import { L, tx, loc, setLang, lang } from '../i18n.js';
import { MODELS } from '../engine/diagnosis.js';

export default async function survey(el, ctx) {
  let s;
  let depts = [];
  try {
    [s, depts] = await Promise.all([api.get(`/api/surveys/${encodeURIComponent(ctx.sub)}`), api.get('/api/departments')]);
  } catch {
    return setHTML(el, empty(L('问卷不存在', 'Survey not found'), L('请确认链接是否完整。', 'Check that the link is complete.'), 'alert'));
  }
  const model = MODELS[s.model];
  document.title = `${loc(s, 'title')} · ${L('知人', 'Zhiren')}`;
  const done = (() => {
    try { return localStorage.getItem(`zr-survey-${s.id}`) === '1'; } catch { return false; }
  })();
  const total = model.dims.reduce((a, d) => a + d.items.length, 0);
  const render = () => {
    if (s.status !== 'open') return setHTML(el, html`<div class="row" style="margin-bottom:20px">${logo()}<strong>${L('知人', 'Zhiren')}</strong></div>${empty(L('本次调研已结束', 'This survey is closed'), L('感谢关注。', 'Thank you for your interest.'), 'check')}`);
    if (done) return setHTML(el, html`<div class="row" style="margin-bottom:20px">${logo()}<strong>${L('知人', 'Zhiren')}</strong></div>${empty(L('你已提交过本问卷', 'You have already responded'), L('感谢你的坦诚反馈！结果将以汇总形式与大家分享。', 'Thank you for your honest feedback. Results will be shared in aggregate.'), 'check')}`);
    setHTML(el, html`
      <div class="row-between" style="margin-bottom:20px"><div class="row">${logo()}<strong>${L('知人', 'Zhiren')}</strong></div><button class="btn btn-sm" type="button" data-lang>${lang() === 'en' ? '中文' : 'EN'}</button></div>
      <div class="card">
        <h1 style="font-size:22px">${loc(s, 'title')}</h1>
        <p class="page-sub">${tx(model.desc)}</p>
        <div class="callout callout-brand" style="margin:12px 0">${L(`本问卷完全匿名，不记录你的身份；部门回复少于 5 份时不会单独展示结果。共 ${total} 题，约 5 分钟。1 = 非常不同意，5 = 非常同意。`, `This survey is anonymous: your identity is not recorded, and departments with fewer than 5 responses are never shown separately. ${total} questions, about 5 minutes. 1 = strongly disagree, 5 = strongly agree.`)}</div>
        <form id="sv">
          <label class="field" style="max-width:320px"><span class="field-label">${L('所在部门（可选，用于分部门汇总）', 'Your department (optional, for department roll-ups)')}</span>
            <select class="input" name="deptId"><option value="">${L('不透露', 'Prefer not to say')}</option>${depts.filter((d) => s.scope === 'all' || d.id === s.scope).map((d) => html`<option value="${d.id}">${loc(d)}</option>`)}</select></label>
          ${model.dims.map((d) => html`<div class="section-title" style="margin-top:22px">${tx(d.name)}</div>
            ${d.items.map((it) => html`<div class="q-block"><p>${tx(it.text)}</p>${likert(it.id)}<div class="likert-ends"><span>${L('非常不同意', 'Strongly disagree')}</span><span>${L('非常同意', 'Strongly agree')}</span></div></div>`)}`)}
          ${model.enps ? html`<div class="q-block"><p>${L('你有多大可能向朋友推荐我们公司作为工作单位？（0-10）', 'How likely are you to recommend us as a place to work? (0-10)')}</p>${likert('enps', null, { min: 0, max: 10 })}</div>` : ''}
          <label class="field" style="margin-top:16px"><span class="field-label">${L('还有什么想对公司说的？（可选）', 'Anything else you want to tell us? (optional)')}</span><textarea class="input" name="comment" rows="3" maxlength="1000"></textarea></label>
          <div class="form-error" role="alert" hidden></div>
          <div class="row" style="margin-top:16px"><button class="btn btn-primary" type="submit">${L('匿名提交', 'Submit anonymously')}</button></div>
        </form>
      </div>`);
    el.querySelector('[data-lang]').addEventListener('click', () => {
      setLang(lang() === 'en' ? 'zh' : 'en');
      render();
    });
    const form = el.querySelector('#sv');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const answers = {};
      for (const d of model.dims) for (const it of d.items) {
        const v = form.querySelector(`input[name="${it.id}"]:checked`);
        if (v) answers[it.id] = Number(v.value);
      }
      const err = form.querySelector('.form-error');
      if (Object.keys(answers).length < total) {
        err.textContent = L(`还有 ${total - Object.keys(answers).length} 题未作答`, `${total - Object.keys(answers).length} question(s) left`);
        err.hidden = false;
        return;
      }
      const enps = form.querySelector('input[name="enps"]:checked');
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        await api.post('/api/responses', { surveyId: s.id, deptId: form.deptId.value || undefined, answers, enps: enps ? Number(enps.value) : undefined, comment: form.comment.value.trim() || undefined });
        try { localStorage.setItem(`zr-survey-${s.id}`, '1'); } catch { /* ignore */ }
        setHTML(el, html`<div class="row" style="margin-bottom:20px">${logo()}<strong>${L('知人', 'Zhiren')}</strong></div>${empty(L('提交成功，谢谢你！', 'Thank you!'), L('你的反馈将帮助我们把组织变得更好。', 'Your feedback helps us build a better workplace.'), 'check')}`);
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        btn.disabled = false;
        toast(ex.message, 'error');
      }
    });
  };
  render();
}
