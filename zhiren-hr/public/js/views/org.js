// Organizational diagnosis: survey models and reports, structure analytics and RACI collaboration matrices.
import {
  html, setHTML, load, api, byId, icon, fmt, today, daysBetween, personName, avatar, badge, callout, pageHead, tabs, empty,
  modal, toast, act, field, input, select, on, method, copyText, confirmDialog, setLeaveGuard,
} from '../core.js';
import { L, tx, loc, LEAVE_REASONS } from '../i18n.js';
import { MODELS, scoreSurvey, diagnosisReport, BANDS, MIN_GROUP } from '../engine/diagnosis.js';
import { checkRaci, RACI } from '../engine/raci.js';
import { radar, heatmap, divColor, hbars, stackbar } from '../charts.js';
import { mountReport } from '../ai.js';
import { trailingTurnover } from '../engine/calc.js';

const SUBS = [
  ['diagnosis', ['诊断调研', 'Diagnosis surveys']],
  ['structure', ['组织结构分析', 'Structure analytics']],
  ['raci', ['RACI 协作矩阵', 'RACI matrix']],
];

export default async function org(el, ctx) {
  const sub = SUBS.some(([k]) => k === ctx.sub) ? ctx.sub : 'diagnosis';
  setHTML(el, html`${pageHead(L('组织诊断与协作', 'Organizational diagnosis'), L('用经典模型给组织做"体检"，量化结构与协作问题，并把诊断结论转化为行动。', 'Give the organization a health check with proven models, quantify structure and collaboration issues, and turn findings into action.'))}
    ${tabs(SUBS.map(([k, n]) => [k, tx(n)]), sub, (k) => `#/org/${k}`)}`);
  const body = document.createElement('div');
  el.appendChild(body);
  await ({ diagnosis: diagnosisView, structure: structureView, raci: raciView })[sub](body, ctx);
}

const surveyLink = (s) => `${location.origin}/#/s/${s.id}`;
const bandBadge = (band) => (band ? badge(tx(BANDS[band].name), BANDS[band].tone) : '');
const bandColor = (band) => (band === 'healthy' ? 'var(--ok-mark)' : band === 'watch' ? 'var(--warn-mark)' : 'var(--danger-mark)');

// Rounds of the same model and scope up to and including `s`, oldest first; rounds without responses are skipped.
function roundsOf(s, d) {
  return d.surveys.filter((x) => x.model === s.model && x.scope === s.scope && x.createdAt <= s.createdAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((x) => ({ s: x, r: scoreSurvey(x.model, d.responses.filter((y) => y.surveyId === x.id)) }))
    .filter((x) => x.r.n);
}
const previousRound = (s, d) => {
  const rounds = roundsOf(s, d);
  return rounds.length > 1 && rounds.at(-1).s.id === s.id ? rounds.at(-2) : null;
};
// Change against an earlier value, coloured by direction.
function delta(now, before, digits = 2) {
  if (now == null || before == null) return '';
  const v = Number((now - before).toFixed(digits));
  const tone = v > 0 ? 'var(--ok)' : v < 0 ? 'var(--danger)' : 'var(--text-3)';
  return html`<span class="small num" style="color:${tone}" data-tip="${L(`上一轮 ${before}`, `Previous round ${before}`)}">${v > 0 ? `▲ +${v.toFixed(digits)}` : v < 0 ? `▼ ${v.toFixed(digits)}` : `± ${v.toFixed(digits)}`}</span>`;
}

// ------------------------------------------------------------------ diagnosis
async function diagnosisView(el, ctx) {
  const d = await load('surveys', 'responses', 'departments');
  if (ctx.id) return surveyResult(el, ctx, d);
  const scored = d.surveys.map((s) => ({ s, r: scoreSurvey(s.model, d.responses.filter((x) => x.surveyId === s.id)), prev: previousRound(s, d) })).sort((a, b) => b.s.createdAt.localeCompare(a.s.createdAt));
  setHTML(el, html`
    <div class="row-between" style="margin-bottom:12px"><span class="small muted">${L('所有调研均为匿名；按部门查看时，回复少于 5 份的部门不单独展示。', 'All surveys are anonymous; departments with fewer than 5 responses are never shown separately.')}</span>
      <button class="btn btn-primary" type="button" data-new>${icon('plus')}${L('发起诊断调研', 'New survey')}</button></div>
    <div class="grid cols-3">${scored.map(({ s, r, prev }) => html`<section class="card">
      <div class="card-head"><div><h2><a href="#/org/diagnosis/${s.id}">${loc(s, 'title')}</a></h2><p>${tx(MODELS[s.model].name)} · ${s.scope === 'all' ? L('全公司', 'Whole company') : loc(d.departments.find((x) => x.id === s.scope))}</p></div>${badge(s.status === 'open' ? L('进行中', 'Open') : L('已结束', 'Closed'), s.status === 'open' ? 'info' : '')}</div>
      <div class="row" style="gap:20px"><div><div class="small muted">${L('回复数', 'Responses')}</div><div class="result-big">${r.n}</div></div><div><div class="small muted">${L('整体得分', 'Overall')}</div><div class="result-big">${r.overall ?? '—'}</div>${prev ? delta(r.overall, prev.r.overall) : ''}</div>${r.enps ? html`<div><div class="small muted">eNPS</div><div class="result-big">${r.enps.score}</div></div>` : ''}</div>
      <div style="margin:8px 0">${bandBadge(r.band)}</div>
      <div class="row"><a class="btn btn-sm" href="#/org/diagnosis/${s.id}">${L('查看报告', 'View report')}</a>${s.status === 'open' ? html`<button class="btn btn-sm" type="button" data-copy="${s.id}">${icon('link')}${L('复制填写链接', 'Copy survey link')}</button>` : ''}</div>
    </section>`)}</div>`);
  const openNew = (model) => modal({
    title: L('发起诊断调研', 'New diagnosis survey'),
    body: html`<div class="stack" style="gap:12px">
      ${field(L('诊断模型', 'Model'), select('model', Object.values(MODELS).map((m) => [m.key, tx(m.name)]), { value: model }))}
      <div id="model-desc" class="method"></div>
      ${field(L('调研标题', 'Title'), input('title', { required: true, placeholder: L('如：2026 下半年组织健康诊断', 'e.g. H2 organizational health check') }))}
      ${field(L('范围', 'Scope'), select('scope', [['all', L('全公司', 'Whole company')], ...d.departments.map((x) => [x.id, loc(x)])]))}
      ${callout('info', L('调研默认匿名，不记录填写人；生成链接后可通过企业微信、钉钉或邮件发送。', 'Surveys are anonymous by default. Share the link through your chat or email tools.'))}</div>`,
    submitLabel: L('创建', 'Create'),
    onOpen: (form) => {
      const show = () => setHTML(form.querySelector('#model-desc'), html`<strong>${tx(MODELS[form.model.value].name)}</strong>（${tx(MODELS[form.model.value].source)}）<br>${tx(MODELS[form.model.value].desc)}<br><span class="muted">${L('适用：', 'Use for: ')}${tx(MODELS[form.model.value].when)}</span><br><span class="muted">${L('维度：', 'Dimensions: ')}${MODELS[form.model.value].dims.map((x) => tx(x.name)).join(' · ')}</span><br><span class="muted">${L(`共 ${MODELS[form.model.value].dims.reduce((a, x) => a + x.items.length, 0)} 题，约 5 分钟`, `${MODELS[form.model.value].dims.reduce((a, x) => a + x.items.length, 0)} questions, about 5 minutes`)}</span>`);
      form.model.addEventListener('change', show);
      show();
    },
    onSubmit: async (v) => {
      if (!v.title.trim()) throw new Error(L('请填写标题', 'Title is required'));
      const s = await api.post('/api/surveys', { model: v.model, title: v.title.trim(), titleEn: v.title.trim(), scope: v.scope, status: 'open', anonymous: true });
      toast(L('调研已创建，复制链接即可分发', 'Survey created; copy the link to share it'));
      location.hash = `#/org/diagnosis/${s.id}`;
    },
  });
  on(el, 'click', '[data-copy]', (e, b) => copyText(surveyLink(d.surveys.find((s) => s.id === b.dataset.copy))));
  on(el, 'click', '[data-new]', () => openNew());
  // Method cards in the toolkit link here with ?new=<model> to start a survey with that model.
  if (MODELS[ctx.query.new]) {
    history.replaceState(null, '', '#/org/diagnosis');
    openNew(ctx.query.new);
  }
}

async function surveyResult(el, ctx, d) {
  const s = d.surveys.find((x) => x.id === ctx.id);
  if (!s) return setHTML(el, empty(L('调研不存在', 'Survey not found'), '', 'alert'));
  const model = MODELS[s.model];
  const rs = d.responses.filter((x) => x.surveyId === s.id);
  const r = scoreSurvey(s.model, rs);
  const dimMeta = Object.fromEntries(model.dims.map((x) => [x.key, x]));
  const itemText = Object.fromEntries(model.dims.flatMap((x) => x.items.map((it) => [it.id, it.text])));
  const allItems = r.dims.flatMap((x) => x.items).filter((i) => i.mean != null).sort((a, b) => a.mean - b.mean);
  const deptName = (id) => loc(d.departments.find((x) => x.id === id));
  const scopeName = s.scope === 'all' ? L('全公司', 'Whole company') : deptName(s.scope);
  const rounds = roundsOf(s, d).slice(-4);
  const prev = rounds.length > 1 && rounds.at(-1).s.id === s.id ? rounds.at(-2).r : null;
  const dimMean = (res, key) => res.dims.find((x) => x.key === key)?.mean;

  setHTML(el, html`
    <div class="row-between" style="margin-bottom:12px">
      <div><a href="#/org/diagnosis" class="small">← ${L('全部调研', 'All surveys')}</a><h2 style="font-size:19px">${loc(s, 'title')} ${badge(s.status === 'open' ? L('进行中', 'Open') : L('已结束', 'Closed'), s.status === 'open' ? 'info' : '')}</h2>
        <div class="small muted">${tx(model.name)} · ${scopeName} · ${L('创建于', 'Created')} ${fmt.date(s.createdAt)}</div></div>
      <div class="row">${s.status === 'open' ? html`<button class="btn" type="button" data-copy>${icon('link')}${L('复制填写链接', 'Copy link')}</button><a class="btn" href="#/s/${s.id}" target="_blank" rel="noopener">${L('预览问卷', 'Preview')}</a>` : ''}
        <button class="btn" type="button" data-toggle>${s.status === 'open' ? L('结束调研', 'Close survey') : L('重新开启', 'Reopen')}</button></div>
    </div>
    ${r.n ? html`
    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="card kpi"><span class="label">${L('有效回复', 'Responses')}</span><span class="value">${r.n}</span></div>
      <div class="card kpi"><span class="label">${L('整体得分', 'Overall score')}</span><span class="value">${r.overall}<small>/5</small></span><span class="sub">${bandBadge(r.band)} ${prev ? delta(r.overall, prev.overall) : ''}</span></div>
      <div class="card kpi"><span class="label">${L('最强维度', 'Strongest')}</span><span class="value" style="font-size:20px">${r.strengths[0] ? tx(dimMeta[r.strengths[0]].name) : '—'}</span></div>
      ${r.enps ? html`<div class="card"><div class="small muted">eNPS</div><div class="result-big">${r.enps.score > 0 ? '+' : ''}${r.enps.score} ${prev?.enps ? delta(r.enps.score, prev.enps.score, 0) : ''}</div>${stackbar([{ label: L('贬损者 0-6', 'Detractors 0-6'), value: r.enps.detractors, cls: 'neg' }, { label: L('中立 7-8', 'Passives 7-8'), value: r.enps.passives, cls: 'mid' }, { label: L('推荐者 9-10', 'Promoters 9-10'), value: r.enps.promoters, cls: 'pos' }])}</div>`
        : html`<div class="card kpi"><span class="label">${L('最需改进', 'Weakest')}</span><span class="value" style="font-size:20px">${r.issues[0] ? tx(dimMeta[r.issues[0]].name) : '—'}</span></div>`}
    </div>
    <div class="grid cols-2">
      <section class="card"><div class="card-head"><div><h2>${L('维度得分', 'Dimension scores')}</h2><p>${L('竖线为 4.0 健康线；σ 为回答分散程度', 'The tick marks the 4.0 healthy line; σ shows how much answers vary')}</p></div></div>
        ${r.dims.map((x) => html`<div class="dim-row"><span>${tx(dimMeta[x.key].name)}</span><span class="dim-track" data-tip="${tx(dimMeta[x.key].name)}: ${x.mean} (σ ${x.sd})"><span style="width:${((x.mean || 0) / 5) * 100}%;background:${bandColor(x.band)}"></span><i style="left:80%"></i></span><strong class="num">${x.mean ?? '—'}</strong><span>${x.sd > 1 ? badge(`σ ${x.sd}`, 'warn') : html`<span class="small muted">σ ${x.sd}</span>`}</span></div>`)}
      </section>
      <section class="card"><div class="card-head"><h2>${L('模型全景', 'Model overview')}</h2></div>
        ${radar({ axes: model.dims.map((x) => ({ key: x.key, label: tx(x.name) })), series: [{ name: L('得分', 'Score'), values: Object.fromEntries(r.dims.map((x) => [x.key, x.mean])), cls: 's1' }, ...(prev ? [{ name: L('上一轮', 'Previous round'), values: Object.fromEntries(prev.dims.map((x) => [x.key, x.mean])), cls: 's2' }] : [])], size: 320, format: (v) => fmt.num(v, 2) })}
      </section>
    </div>
    ${prev ? html`<section class="card" style="margin-top:16px"><div class="card-head"><div><h2>${L('历次对比', 'Compared with earlier rounds')}</h2><p>${L(`同一模型、同一范围的最近 ${rounds.length} 轮调研；“变化”为本轮相对上一轮`, `The last ${rounds.length} rounds with the same model and scope; "Change" is this round against the previous one`)}</p></div></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>${L('维度', 'Dimension')}</th>${rounds.map((x) => html`<th class="num">${x.s.id === s.id ? L('本轮', 'This round') : html`<a href="#/org/diagnosis/${x.s.id}">${loc(x.s, 'title')}</a>`}<div class="small muted">${fmt.date(x.s.createdAt)} · ${L(`${x.r.n} 份`, `n=${x.r.n}`)}</div></th>`)}<th class="num">${L('变化', 'Change')}</th></tr></thead>
        <tbody><tr><td><strong>${L('整体得分', 'Overall')}</strong></td>${rounds.map((x) => html`<td class="num"><strong>${x.r.overall ?? '—'}</strong></td>`)}<td class="num">${delta(r.overall, prev.overall)}</td></tr>
          ${model.dims.map((m) => html`<tr><td>${tx(m.name)}</td>${rounds.map((x) => html`<td class="num">${dimMean(x.r, m.key) ?? '—'}</td>`)}<td class="num">${delta(dimMean(r, m.key), dimMean(prev, m.key))}</td></tr>`)}
          ${r.enps ? html`<tr><td>eNPS</td>${rounds.map((x) => html`<td class="num">${x.r.enps?.score ?? '—'}</td>`)}<td class="num">${prev.enps ? delta(r.enps.score, prev.enps.score, 0) : ''}</td></tr>` : ''}</tbody></table></div>
      <div style="margin-top:12px">${callout('info', L('变化受填写人构成影响：两轮回复数相差较大，或变化小于 0.1 时，不宜据此下结论。', 'Changes depend on who answered: with very different response counts, or changes under 0.1, avoid drawing conclusions.'))}</div></section>` : ''}
    ${r.depts.length > 1 || s.scope === 'all' ? html`<section class="card" style="margin-top:16px"><div class="card-head"><div><h2>${L('部门对比', 'By department')}</h2><p>${L(`红色低于 3.5，蓝色高于 3.5；少于 ${MIN_GROUP} 份回复的部门已隐藏以保护匿名`, `Red is below 3.5, blue above; departments with fewer than ${MIN_GROUP} responses are hidden to protect anonymity`)}</p></div></div>
      ${heatmap({
        rows: r.depts.sort((a, b) => b.n - a.n).map((x) => ({ label: `${deptName(x.deptId)} (${x.n})`, cells: x.suppressed ? {} : x.dims, note: x.suppressed ? L(`少于 ${MIN_GROUP} 份，已隐藏`, `Under ${MIN_GROUP} responses; hidden`) : '' })),
        cols: model.dims.map((x) => ({ key: x.key, label: tx(x.name) })),
        color: (v) => divColor(v),
      })}</section>` : ''}
    <div class="grid cols-2" style="margin-top:16px">
      <section class="card"><div class="card-head"><h2>${L('得分最低的题目', 'Lowest-scoring items')}</h2></div>
        ${allItems.slice(0, 5).map((i) => html`<div class="list-item"><div class="grow"><div>${tx(itemText[i.id])}</div><div class="meta">${L('认同率', 'Favorable')} ${fmt.pct(i.fav)}</div></div><strong class="num" style="color:var(--danger)">${i.mean}</strong></div>`)}</section>
      <section class="card"><div class="card-head"><h2>${L('得分最高的题目', 'Highest-scoring items')}</h2></div>
        ${allItems.slice(-4).reverse().map((i) => html`<div class="list-item"><div class="grow"><div>${tx(itemText[i.id])}</div><div class="meta">${L('认同率', 'Favorable')} ${fmt.pct(i.fav)}</div></div><strong class="num" style="color:var(--ok)">${i.mean}</strong></div>`)}</section>
    </div>
    ${r.comments.length ? html`<section class="card" style="margin-top:16px"><div class="card-head"><h2>${L('员工留言', 'Comments')}</h2><span class="badge">${r.comments.length}</span></div>${r.comments.map((c) => html`<div class="list-item">${icon('message')}<div class="grow">${c}</div></div>`)}</section>` : ''}
    <div id="ai-diagnosis" style="margin-top:16px"></div>` : empty(L('还没有回复', 'No responses yet'), L('复制填写链接分发给员工，回复会实时汇总在这里。', 'Copy the survey link and share it; responses roll up here in real time.'), 'pulse')}`);

  on(el, 'click', '[data-copy]', () => copyText(surveyLink(s)));
  on(el, 'click', '[data-toggle]', async (e, b) => {
    const next = s.status === 'open' ? 'closed' : 'open';
    await act(b, () => api.put(`/api/surveys/${s.id}`, { status: next, ...(next === 'closed' && { closedAt: today() }) }), next === 'closed' ? L('调研已结束', 'Survey closed') : L('调研已重新开启', 'Survey reopened'));
    ctx.rerender();
  });
  if (r.n) {
    mountReport(el.querySelector('#ai-diagnosis'), {
      title: L('组织诊断报告', 'Diagnosis report'),
      ruleMd: diagnosisReport(r, L('zh', 'en'), { title: loc(s, 'title'), deptName: scopeName }),
      task: 'diagnosis',
      input: () => ({
        model: model.name[1], survey: s.titleEn || s.title, scope: s.scope === 'all' ? 'Whole company' : d.departments.find((x) => x.id === s.scope)?.nameEn, responses: r.n, overall: r.overall,
        dimensions: r.dims.map((x) => ({ name: dimMeta[x.key].name[1], mean: x.mean, spread: x.sd, lowestItem: x.items.filter((i) => i.mean != null).sort((a, b) => a.mean - b.mean).map((i) => ({ text: itemText[i.id][1], mean: i.mean }))[0] })),
        departments: r.depts.filter((x) => !x.suppressed).map((x) => ({ name: d.departments.find((y) => y.id === x.deptId)?.nameEn, n: x.n, scores: Object.fromEntries(Object.entries(x.dims).map(([k, v]) => [dimMeta[k].name[1], v])) })),
        enps: r.enps, comments: r.comments.slice(0, 20),
      }),
    });
  }
}

// ------------------------------------------------------------------ structure
async function structureView(el) {
  const d = await load('employees', 'departments');
  const T = today();
  const active = d.employees.filter((e) => e.status !== 'left');
  const kids = {};
  for (const e of active) (kids[e.managerId || 'root'] ||= []).push(e);
  const roots = kids.root || [];
  const managers = active.filter((e) => (kids[e.id] || []).length);
  const spans = managers.map((m) => kids[m.id].length);
  const avgSpan = spans.length ? (spans.reduce((a, b) => a + b, 0) / spans.length).toFixed(1) : '—';
  const depth = (e, n = 1) => (e.managerId && byIdMap[e.managerId] ? depth(byIdMap[e.managerId], n + 1) : n);
  const byIdMap = byId(active);
  const layers = Math.max(...active.map((e) => depth(e)));
  const tenure = active.map((e) => daysBetween(e.hireDate, T) / 365);
  const avgTenure = (tenure.reduce((a, b) => a + b, 0) / (tenure.length || 1)).toFixed(1);
  const tt = trailingTurnover(d.employees, T);
  const reasons = Object.entries(LEAVE_REASONS).map(([k, v]) => ({ label: tx(v), value: tt.leavers.filter((e) => e.leaveReason === k).length })).filter((x) => x.value);
  const tenureBands = [[0, 1, L('<1 年', '<1 yr')], [1, 3, L('1-3 年', '1-3 yrs')], [3, 5, L('3-5 年', '3-5 yrs')], [5, 99, L('5 年以上', '5+ yrs')]].map(([a, b, label], i) => ({ label, value: tenure.filter((t) => t >= a && t < b).length, cls: `seq-${i + 2}` }));
  // 11-15 direct reports suits standardized operations but is wide for knowledge work, so it is only noted.
  const spanFlag = (n) => (n < 3 ? ['warn', L('幅度过窄', 'Too narrow')] : n > 15 ? ['danger', L('幅度过宽', 'Too wide')] : n > 10 ? ['info', L('知识型团队偏宽', 'Wide for knowledge work')] : null);

  const node = (e) => {
    const ch = (kids[e.id] || []).sort((a, b) => (b.level.startsWith('M') - a.level.startsWith('M')) || a.level.localeCompare(b.level));
    const flag = ch.length ? spanFlag(ch.length) : null;
    const label = html`<span class="org-node">${avatar(e, 'xs')}<a href="#/service/people/${e.id}"><strong>${personName(e)}</strong></a><span class="small muted">${loc(e, 'title')}</span>${ch.length ? html`<span class="badge span" data-tip="${L('直接下属', 'Direct reports')}">${ch.length}</span>` : ''}${flag ? badge(flag[1], flag[0]) : ''}</span>`;
    return ch.length ? html`<li><details ${depth(e) <= 2 ? 'open' : ''}><summary>${label}</summary><ul>${ch.map(node)}</ul></details></li>` : html`<li>${label}</li>`;
  };

  setHTML(el, html`
    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="card kpi"><span class="label">${L('在职人数', 'Headcount')}</span><span class="value">${active.length}</span><span class="sub">${L(`${d.departments.length} 个部门`, `${d.departments.length} departments`)}</span></div>
      <div class="card kpi"><span class="label">${L('平均管理幅度', 'Average span of control')}</span><span class="value">${avgSpan}</span><span class="sub">${L(`${managers.length} 名管理者 · 管理者占比 ${fmt.pct(managers.length / active.length)}`, `${managers.length} managers · ${fmt.pct(managers.length / active.length)} of staff`)}</span></div>
      <div class="card kpi"><span class="label">${L('管理层级', 'Layers')}</span><span class="value">${layers}</span><span class="sub">${L('从 CEO 到一线的最多层级', 'Most levels from CEO to front line')}</span></div>
      <div class="card kpi" data-tip="${L(`近 12 个月离职人数 ÷ 期初期末平均人数（期初 ${tt.startHeadcount}，期末 ${tt.endHeadcount}），与工作台口径一致`, `Leavers in the last 12 months ÷ average of opening and closing headcount (${tt.startHeadcount} and ${tt.endHeadcount}); same basis as the dashboard`)}"><span class="label">${L('年化离职率', 'Annual turnover')}</span><span class="value">${fmt.pct(tt.rate, 1)}</span><span class="sub">${L(`近 12 个月离职 ${tt.leavers.length} 人，主动 ${tt.voluntary} 人（${fmt.pct(tt.leavers.length ? tt.voluntary / tt.leavers.length : null)}）`, `${tt.leavers.length} leavers in 12 months, ${tt.voluntary} voluntary (${fmt.pct(tt.leavers.length ? tt.voluntary / tt.leavers.length : null)})`)}</span></div>
    </div>
    <div class="split">
      <section class="card"><div class="card-head"><div><h2>${L('组织架构', 'Org chart')}</h2><p>${L('按汇报关系展开；徽标为直接下属人数', 'Expand by reporting line; the badge shows direct reports')}</p></div></div>
        <div class="org-tree"><ul>${roots.map(node)}</ul></div></section>
      <div class="stack">
        <section class="card"><div class="card-head"><h2>${L('管理幅度检查', 'Span of control check')}</h2></div>
          ${managers.map((m) => ({ m, n: kids[m.id].length, f: spanFlag(kids[m.id].length) })).filter((x) => x.f).map((x) => html`<div class="list-item"><div class="grow"><div class="title">${personName(x.m)}</div><div class="meta">${loc(x.m, 'title')} · ${L(`${x.n} 名直接下属`, `${x.n} direct reports`)}</div></div>${badge(x.f[1], x.f[0])}</div>`)}
          ${method(L('经验值：', 'Rule of thumb:'), L('知识型团队 5-8 人、标准化运营团队 10-15 人较为合适。少于 3 人标为过窄；11-15 人对知识型团队偏宽；超过 15 人标为过宽。幅度过窄会增加层级与成本，过宽则辅导不足。', 'Knowledge teams work well with 5-8 reports, standardized operations with 10-15. Under 3 is marked too narrow, 11-15 as wide for knowledge work, and over 15 as too wide. Too narrow adds layers and cost; too wide starves coaching.'))}</section>
        <section class="card"><div class="card-head"><h2>${L('离职原因（近 12 个月）', 'Why people left (12 months)')}</h2><a class="btn btn-sm" href="#/toolkit/turnover">${L('估算离职成本', 'Estimate the cost')}</a></div>${reasons.length ? hbars(reasons, { head: [L('原因', 'Reason'), L('人数', 'People')] }) : html`<p class="muted">—</p>`}</section>
        <section class="card"><div class="card-head"><div><h2>${L('司龄分布', 'Tenure mix')}</h2><p>${L(`平均司龄 ${avgTenure} 年`, `Average tenure ${avgTenure} years`)}</p></div></div>${hbars(tenureBands, { head: [L('司龄', 'Tenure'), L('人数', 'People')] })}</section>
      </div>
    </div>`);
}

// ------------------------------------------------------------------ RACI
async function raciView(el, ctx) {
  const d = await load('raci');
  const current = d.raci.find((x) => x.id === ctx.id) || d.raci[0];
  const OPTIONS = ['', 'R', 'A', 'C', 'I', 'A/R'];
  let m = current ? structuredClone(current) : null;
  // Edits stay local until Save; the shell asks before navigating away from unsaved changes.
  let dirty = false;
  setLeaveGuard(() => dirty);
  const markDirty = () => {
    dirty = true;
    el.querySelector('#raci-dirty')?.removeAttribute('hidden');
  };
  const draw = () => {
    const issues = m ? checkRaci({ roles: m.roles, steps: m.steps }) : [];
    const bad = new Set(issues.filter((i) => i.level === 'high' && i.step != null).map((i) => i.step));
    const roleLabel = (j) => L(m.roles[j], m.rolesEn?.[j] || m.roles[j]);
    setHTML(el, html`
      <div class="split-wide">
        <section class="card"><div class="card-head"><h2>${L('流程矩阵', 'Matrices')}</h2><button class="btn btn-sm" type="button" data-new>${icon('plus')}${L('新建', 'New')}</button></div>
          ${d.raci.map((x) => html`<a class="list-item" href="#/org/raci/${x.id}" style="color:inherit;text-decoration:none"><div class="grow"><div class="title" style="${x.id === m?.id ? 'color:var(--brand-text)' : ''}">${loc(x, 'title')}</div><div class="meta">${L(`${x.steps.length} 个环节 · ${x.roles.length} 个角色`, `${x.steps.length} steps · ${x.roles.length} roles`)}</div></div>${icon('chevron-right')}</a>`)}
          <div style="margin-top:12px">${method('RACI：', html`${Object.entries(RACI).map(([k, v]) => html`<strong>${k}</strong> ${tx(v)}　`)}<br>${L('每个环节有且只有一个 A，至少一个 R；C 双向沟通，I 单向知会。', 'Each step needs exactly one A and at least one R; C is two-way, I is one-way.')}`)}</div></section>
        ${m ? html`<div class="stack">
          <section class="card">
            <div class="card-head"><input class="input" id="raci-title" value="${loc(m, 'title')}" style="max-width:360px;font-weight:600" aria-label="${L('矩阵名称', 'Matrix name')}">
              <div class="row"><span id="raci-dirty" class="badge badge-warn" ${dirty ? '' : 'hidden'}>${L('未保存', 'Unsaved')}</span><button class="btn btn-sm" type="button" data-addrole>${icon('plus')}${L('角色', 'Role')}</button><button class="btn btn-sm" type="button" data-addstep>${icon('plus')}${L('环节', 'Step')}</button><button class="btn btn-sm btn-primary" type="button" data-save>${L('保存', 'Save')}</button><button class="icon-btn" type="button" data-delete aria-label="${L('删除矩阵', 'Delete matrix')}" data-tip="${L('删除矩阵', 'Delete matrix')}">${icon('trash')}</button></div></div>
            <div class="table-wrap"><table class="table raci-table"><thead><tr><th>${L('环节 \\ 角色', 'Step \\ Role')}</th>${m.roles.map((_, j) => html`<th style="text-align:center"><input class="input" data-role="${j}" value="${roleLabel(j)}" style="width:110px;text-align:center;padding:4px"><button class="icon-btn" type="button" data-delrole="${j}" aria-label="${L('删除角色', 'Remove role')}" style="width:24px;height:24px">${icon('x')}</button></th>`)}<th></th></tr></thead>
              <tbody>${m.steps.map((s, i) => html`<tr class="${bad.has(i) ? 'bad' : ''}"><td><input class="input" data-step="${i}" value="${L(s.name, s.nameEn || s.name)}" style="min-width:160px"></td>
                ${m.roles.map((_, j) => html`<td class="cell"><select class="input" data-cell="${i}:${j}" aria-label="${L(s.name, s.nameEn || s.name)} · ${roleLabel(j)}">${OPTIONS.map((o) => html`<option value="${o}" ${(s.cells[j] || '') === o ? 'selected' : ''}>${o || '·'}</option>`)}</select></td>`)}
                <td><button class="icon-btn" type="button" data-delstep="${i}" aria-label="${L('删除环节', 'Remove step')}">${icon('trash')}</button></td></tr>`)}</tbody></table></div>
          </section>
          <section class="card"><div class="card-head"><h2>${L('自动检查', 'Automatic checks')}</h2>${badge(issues.length ? L(`${issues.length} 个问题`, `${issues.length} issues`) : L('通过', 'Passed'), issues.some((i) => i.level === 'high') ? 'danger' : issues.length ? 'warn' : 'ok')}</div>
            ${issues.length ? html`<div class="callouts">${issues.map((i) => callout(i.level === 'high' ? 'danger' : i.level === 'medium' ? 'warn' : 'info', tx(i.text)))}</div>` : callout('ok', L('职责分工清晰：每个环节都有唯一的最终负责人。', 'Clear ownership: every step has exactly one accountable owner.'))}</section>
        </div>` : empty(L('还没有协作矩阵', 'No matrices yet'), '', 'layers')}
      </div>`);
  };
  draw();
  // Keep the bilingual fields in sync with edits made in the current language.
  const setText = (obj, key, value) => {
    if (L('zh', 'en') === 'en') obj[`${key}En`] = value;
    else obj[key] = value;
  };
  el.addEventListener('change', (e) => {
    const t = e.target;
    if (!m) return;
    if (t.dataset.cell) {
      const [i, j] = t.dataset.cell.split(':').map(Number);
      m.steps[i].cells[j] = t.value;
      dirty = true;
      draw();
    } else if (t.dataset.step) {
      setText(m.steps[Number(t.dataset.step)], 'name', t.value);
      markDirty();
    } else if (t.dataset.role) {
      const j = Number(t.dataset.role);
      if (L('zh', 'en') === 'en') {
        m.rolesEn = m.rolesEn || [...m.roles];
        m.rolesEn[j] = t.value;
      } else m.roles[j] = t.value;
      markDirty();
    } else if (t.id === 'raci-title') {
      setText(m, 'title', t.value);
      markDirty();
    }
  });
  on(el, 'click', '[data-addrole]', () => {
    m.roles.push(L('新角色', 'New role'));
    if (m.rolesEn) m.rolesEn.push('New role');
    m.steps.forEach((s) => s.cells.push(''));
    dirty = true;
    draw();
  });
  on(el, 'click', '[data-addstep]', () => {
    m.steps.push({ name: L('新环节', 'New step'), nameEn: 'New step', cells: m.roles.map(() => '') });
    dirty = true;
    draw();
  });
  on(el, 'click', '[data-delrole]', (e, b) => {
    const j = Number(b.dataset.delrole);
    m.roles.splice(j, 1);
    m.rolesEn?.splice(j, 1);
    m.steps.forEach((s) => s.cells.splice(j, 1));
    dirty = true;
    draw();
  });
  on(el, 'click', '[data-delstep]', (e, b) => {
    m.steps.splice(Number(b.dataset.delstep), 1);
    dirty = true;
    draw();
  });
  on(el, 'click', '[data-save]', async (e, b) => {
    const saved = await act(b, () => api.put(`/api/raci/${m.id}`, { title: m.title, titleEn: m.titleEn, roles: m.roles, rolesEn: m.rolesEn, steps: m.steps }), L('矩阵已保存', 'Matrix saved'));
    if (!saved) return;
    dirty = false;
    ctx.rerender();
  });
  on(el, 'click', '[data-delete]', async (e, b) => {
    const yes = await confirmDialog(L(`删除「${loc(m, 'title')}」？此操作无法撤销。`, `Delete "${loc(m, 'title')}"? This cannot be undone.`), { danger: true, confirmLabel: L('删除', 'Delete') });
    if (!yes || !(await act(b, () => api.del(`/api/raci/${m.id}`), L('矩阵已删除', 'Matrix deleted')))) return;
    dirty = false;
    if (location.hash === '#/org/raci') ctx.rerender();
    else location.hash = '#/org/raci';
  });
  on(el, 'click', '[data-new]', async () => {
    const yes = await confirmDialog(dirty
      ? L('当前矩阵有未保存的修改，将被丢弃。从通用模板创建一个新的 RACI 矩阵？', 'The current matrix has unsaved changes that will be discarded. Create a new RACI matrix from the starter template?')
      : L('从通用模板创建一个新的 RACI 矩阵？', 'Create a new RACI matrix from the starter template?'), { confirmLabel: L('创建', 'Create') });
    if (!yes) return;
    dirty = false;
    const doc = await api.post('/api/raci', {
      title: L('新流程', 'New process'), titleEn: 'New process',
      roles: [L('发起人', 'Requester'), L('负责人', 'Owner'), L('审批人', 'Approver'), L('相关方', 'Stakeholder')], rolesEn: ['Requester', 'Owner', 'Approver', 'Stakeholder'],
      steps: [{ name: L('提出需求', 'Raise request'), nameEn: 'Raise request', cells: ['R', 'C', 'A', 'I'] }, { name: L('执行', 'Execute'), nameEn: 'Execute', cells: ['I', 'R', 'A', 'C'] }],
    });
    location.hash = `#/org/raci/${doc.id}`;
  });
}
