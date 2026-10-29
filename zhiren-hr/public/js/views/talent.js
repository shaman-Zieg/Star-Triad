// Talent review: 9-box calibration with individual insight, competency assessment,
// succession planning and flight risk.
import {
  html, setHTML, load, api, icon, fmt, today, personName, personLink, avatar, badge, callout, pageHead, tabs, empty,
  modal, toast, act, field, select, textarea, likert, on, meter, method, chipSelect, list, getActor,
} from '../core.js';
import { L, tx, loc, lang, RISK_LEVEL } from '../i18n.js';
import { BOXES, boxKey, ratingsForBox, distribution, PERF_SCALE, POT_SCALE, AGILITY, potentialFromAgility, flightRisk } from '../engine/talent.js';
import { COMPETENCIES, COMP_KEYS, compByKey, targetProfile, assessCompetencies, ladderInfo, VERDICTS, BANDS, LEVELS } from '../engine/competency.js';
import {
  evaluateAll, evaluatePlan, evaluateCandidate, roleSpec, successionLinks, WEIGHTS, COMPONENT_NAMES, SUITABILITY, STATUS, COVERAGE, CRITICALITY,
  KEY_ROLE_REASONS, READINESS, CONCENTRATION_NOMINATIONS, MAX_LEVEL_DISTANCE, familyName,
} from '../engine/succession.js';
import { FAMILIES } from '../engine/jd.js';
import { SKILLS, skillLabel } from '../engine/skills.js';
import { personalInsight, retentionActions } from '../engine/insight.js';
import { radar, heatmap, seqColor, hbars } from '../charts.js';
import { mountReport } from '../ai.js';

const SUBS = [
  ['ninebox', ['人才九宫格', '9-box grid']],
  ['competency', ['能力评估', 'Competencies']],
  ['succession', ['继任计划', 'Succession']],
  ['risk', ['流失风险', 'Flight risk']],
];

export default async function talent(el, ctx) {
  const sub = SUBS.some(([k]) => k === ctx.sub) ? ctx.sub : 'ninebox';
  const d = await load('employees', 'departments', 'succession', 'idps', 'enrollments', 'courses');
  d.active = d.employees.filter((e) => e.status !== 'left');
  d.today = today();
  d.evaluation = evaluateAll(d.succession, d.employees, { today: d.today, departments: d.departments });
  d.insightCtx = { today: d.today, evaluation: d.evaluation, idps: d.idps, enrollments: d.enrollments, courses: d.courses };
  setHTML(el, html`${pageHead(L('人才盘点', 'Talent review'), L('用统一的标准识别关键人才、发现风险、规划继任——把人才盘点会的方法论变成日常可用的工具。', 'Identify key talent, spot risks and plan succession on one standard: the talent review meeting, turned into an everyday tool.'))}
    ${tabs(SUBS.map(([k, n]) => [k, tx(n)]), sub, (k) => `#/talent/${k}`)}`);
  const body = document.createElement('div');
  el.appendChild(body);
  await ({ ninebox: nineboxView, competency: competencyView, succession: successionView, risk: riskView })[sub](body, ctx, d);
}

const deptOptions = (d, value) => html`<select class="input" id="dept" style="width:auto" aria-label="${L('部门', 'Department')}"><option value="">${L('全公司', 'Whole company')}</option>${d.departments.map((x) => html`<option value="${x.id}" ${x.id === value ? 'selected' : ''}>${loc(x)}</option>`)}</select>`;
const deptMap = (d) => Object.fromEntries(d.departments.map((x) => [x.id, x]));

// ------------------------------------------------------------------ shared: individual insight
// Facts are numbered per person; every statement shows which facts it rests on.
function factChips(ids, numbering, factsById) {
  return html`${ids.filter((id) => numbering[id]).map((id) => html`<span class="fact" tabindex="0" data-tip="[${numbering[id]}] ${tx(factsById[id].text)}">${numbering[id]}</span>`)}`;
}

function insightBlock(ins) {
  const factsById = Object.fromEntries(ins.facts.map((f) => [f.id, f]));
  const used = [...new Set([...ins.observations, ...ins.hypotheses, ...ins.actions].flatMap((x) => x.facts))];
  const numbering = Object.fromEntries(used.map((id, i) => [id, i + 1]));
  const section = (title, iconName, items, cls, extra) => (items.length ? html`<div class="insight ${cls}"><div class="insight-title">${icon(iconName)}${title}</div>
    <ul>${items.map((x) => html`<li>${tx(x.text)}${extra ? extra(x) : ''} ${factChips(x.facts, numbering, factsById)}</li>`)}</ul></div>` : '');
  return html`
    ${section(L('观察（数据显示）', 'Observations (what the data shows)'), 'chart', ins.observations, 'obs')}
    ${section(L('推测（需沟通验证，不是结论）', 'Hypotheses (to verify, not conclusions)'), 'help', ins.hypotheses, 'hyp')}
    ${section(L('建议措施', 'Suggested actions'), 'target', ins.actions.slice(0, 4), 'act', (x) => (x.owner ? html` <span class="badge">${tx(x.owner)}</span>` : ''))}
    ${ins.actions.length > 4 ? html`<details class="small"><summary>${L(`更多建议（${ins.actions.length - 4}）`, `More actions (${ins.actions.length - 4})`)}</summary>${section('', 'target', ins.actions.slice(4), 'act', (x) => (x.owner ? html` <span class="badge">${tx(x.owner)}</span>` : ''))}</details>` : ''}
    <details class="small"><summary class="muted">${L(`数据依据（${used.length} 条）`, `Evidence (${used.length} facts)`)}</summary>
      <ol class="fact-list">${used.map((id) => html`<li>${tx(factsById[id].text)}</li>`)}</ol></details>`;
}

// ------------------------------------------------------------------ rating forms
function ratingForm(emp, onSaved) {
  modal({
    title: L(`调整评级 · ${personName(emp)}`, `Adjust ratings · ${personName(emp)}`),
    body: html`
      <div class="q-block"><p>${L('绩效（最近一期）', 'Performance (latest cycle)')}</p>${likert('performance', emp.performance)}<div class="small muted" style="margin-top:6px">${Object.entries(PERF_SCALE).map(([k, v]) => `${k} ${tx(v)}`).join(' · ')}</div></div>
      <div class="q-block"><p>${L('潜力', 'Potential')}</p>${likert('potential', emp.potential, { max: 3 })}<div class="small muted" style="margin-top:6px">${Object.entries(POT_SCALE).map(([k, v]) => `${k} ${tx(v)}`).join(' · ')}</div></div>
      <p class="small" style="margin-top:10px"><a href="#" data-agility>${L('不确定潜力？使用学习敏锐度问卷评估 →', 'Unsure about potential? Use the learning agility questionnaire →')}</a></p>`,
    onOpen: (form, { close }) => {
      form.querySelector('[data-agility]').addEventListener('click', (e) => {
        e.preventDefault();
        close();
        agilityForm(emp, onSaved);
      });
    },
    onSubmit: async (v) => {
      await api.put(`/api/employees/${emp.id}`, { performance: Number(v.performance), potential: Number(v.potential) });
      toast(L('评级已更新', 'Ratings updated'));
      onSaved();
    },
  });
}

function agilityForm(emp, onSaved) {
  modal({
    title: L(`潜力评估 · ${personName(emp)}`, `Potential assessment · ${personName(emp)}`),
    wide: true,
    body: html`${method(L('学习敏锐度：', 'Learning agility:'), L('潜力的最佳预测指标之一——在全新情境中快速学习并取得成果的能力。请由直属上级基于近一年的观察评分（1 很少如此，5 总是如此）。', 'One of the best predictors of potential: learning fast and delivering in new situations. The manager rates observations from the past year (1 rarely, 5 always).'))}
      ${AGILITY.map((dim) => html`<div class="section-title">${tx(dim.name)}</div>${dim.items.map((it, i) => html`<div class="q-block" style="padding:8px 0"><p style="font-weight:400">${tx(it)}</p>${likert(`${dim.key}${i}`)}</div>`)}`)}`,
    submitLabel: L('计算并保存潜力', 'Calculate and save'),
    onSubmit: async (v) => {
      const r = potentialFromAgility(v);
      if (r.potential == null) throw new Error(L('请至少完成一个维度', 'Answer at least one dimension'));
      await api.put(`/api/employees/${emp.id}`, { potential: r.potential, agility: { avg: r.avg, dims: r.dims, at: today() } });
      toast(L(`学习敏锐度 ${r.avg}，潜力评定为 ${r.potential}`, `Learning agility ${r.avg}; potential set to ${r.potential}`));
      onSaved();
    },
  });
}

// ------------------------------------------------------------------ 9-box
async function nineboxView(el, ctx, d) {
  const dept = ctx.query.dept || '';
  const people = d.active.filter((e) => !dept || e.deptId === dept);
  const dist = distribution(people);
  const rows = [2, 1, 0];
  const colsP = [0, 1, 2];
  let selected = null;
  const deptName = (id) => loc(d.departments.find((x) => x.id === id));

  const boxHtml = (key) => {
    const b = BOXES[key];
    const ps = people.filter((e) => boxKey(e.performance, e.potential) === key).sort((a, z) => z.performance - a.performance);
    return html`<div class="box tone-${b.tone}" data-box="${key}" aria-label="${tx(b.name)}">
      <div class="box-head"><strong>${b.no} · ${tx(b.name)}</strong><span>${ps.length} · ${fmt.pct(ps.length / (people.length || 1))}</span></div>
      <div class="box-people">${ps.map((e) => html`<span class="pchip" draggable="true" tabindex="0" data-emp="${e.id}" data-tip="${personName(e)} · ${loc(e, 'title')}\n${L('绩效', 'Perf')} ${e.performance} · ${L('潜力', 'Pot')} ${e.potential}">${avatar(e, 'xs')}<span>${personName(e)}</span></span>`)}</div>
    </div>`;
  };

  setHTML(el, html`
    <div class="row-between" style="margin-bottom:12px">
      <div class="row">${deptOptions(d, dept)}<span class="small muted">${L(`${people.length} 人参与盘点 · 拖动头像即可调整格子`, `${people.length} people · drag a person to another box to recalibrate`)}</span></div>
    </div>
    <div class="split">
      <section class="card">
        <div class="ninebox-wrap">
          <div class="axis-y ${lang() === 'en' ? 'en' : 'zh'}" aria-label="${L('潜力，由下向上升高', 'Potential increases upward')}"><div class="axis-y-content" aria-hidden="true"><span class="axis-y-arrow">↑</span><span class="axis-y-label">${L('潜力', 'Potential')}</span></div></div>
          <div class="ninebox">${rows.map((p) => colsP.map((f) => boxHtml(Number(`${p}${f}`))))}</div>
          <div class="axis-x">${L('绩效 →', 'Performance →')}</div>
        </div>
      </section>
      <div class="stack">
        <section class="card" id="detail">${empty(L('选择一位员工', 'Select a person'), L('点击九宫格中的头像，查看基于其个人数据的解读与建议。', 'Click someone in the grid to see an insight built from their own data.'), 'user')}</section>
        <section class="card"><div class="card-head"><h2>${L('校准检查', 'Calibration check')}</h2></div>
          <div class="callouts">${dist.checks.map((c) => callout(c.level === 'ok' ? 'ok' : c.level === 'warn' ? 'warn' : 'info', tx(c.text)))}</div>
          ${method(L('参考分布：', 'Reference:'), L('明星人才约 10-15%，中间格 30-40%，需关注 5-10%。分布用于引导讨论，而非强制配额。', 'Stars about 10-15%, middle box 30-40%, underperformers 5-10%. Use as a discussion guide, not a forced quota.'))}
        </section>
      </div>
    </div>
    <div id="ai-talent" style="margin-top:16px"></div>`);

  const showDetail = (emp) => {
    if (!emp) return;
    selected = emp;
    el.querySelectorAll('.pchip').forEach((c) => c.classList.toggle('sel', c.dataset.emp === emp.id));
    const b = BOXES[boxKey(emp.performance, emp.potential)];
    const ins = personalInsight(emp, d.insightCtx);
    setHTML(el.querySelector('#detail'), html`
      <div class="row" style="margin-bottom:10px">${avatar(emp, 'md')}<div><a href="#/service/people/${emp.id}"><strong>${personName(emp)}</strong></a><div class="small muted">${loc(emp, 'title')} · ${deptName(emp.deptId)} · ${emp.level}</div></div></div>
      <div class="row" style="margin-bottom:10px">${badge(`${b.no} · ${tx(b.name)}`, b.tone === 'neutral' ? '' : b.tone)}${badge(`${L('绩效', 'Perf')} ${emp.performance} · ${tx(PERF_SCALE[emp.performance])}`)}${badge(`${L('潜力', 'Pot')} ${emp.potential}`)}${ins.risk ? badge(`${L('流失风险', 'Flight risk')} ${tx(RISK_LEVEL[ins.risk.level][0])}`, RISK_LEVEL[ins.risk.level][1]) : ''}</div>
      <div class="personal-summary"><div class="insight-title">${L('综合评语', 'Overall assessment')}</div><p>${tx(ins.summary)}</p></div>
      <div class="section-title">${L('个人解读（规则引擎，基于本人数据）', 'Individual insight (rule engine, from their own data)')}</div>
      ${insightBlock(ins)}
      <details class="small" style="margin-top:8px"><summary class="muted">${L('该格子的通用做法', 'General practice for this box')}</summary><ul style="margin:6px 0 0;padding-left:18px">${b.actions.map((a) => html`<li>${tx(a)}</li>`)}</ul></details>
      <div class="row" style="margin-top:12px"><button class="btn btn-sm" type="button" data-rate>${icon('edit')}${L('调整评级', 'Adjust ratings')}</button><a class="btn btn-sm" href="#/talent/competency?emp=${emp.id}">${L('能力画像', 'Competencies')}</a><a class="btn btn-sm" href="#/learning/idp?emp=${emp.id}">${L('发展计划', 'IDP')}</a></div>`);
  };
  on(el, 'click', '.pchip', (e, c) => showDetail(people.find((x) => x.id === c.dataset.emp)));
  on(el, 'keydown', '.pchip', (e, c) => { if (e.key === 'Enter') showDetail(people.find((x) => x.id === c.dataset.emp)); });
  on(el, 'click', '[data-rate]', () => selected && ratingForm(selected, () => ctx.rerender()));
  el.querySelector('#dept').addEventListener('change', (e) => { location.hash = `#/talent/ninebox${e.target.value ? `?dept=${e.target.value}` : ''}`; });
  el.querySelectorAll('.pchip').forEach((c) => c.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', c.dataset.emp)));
  el.querySelectorAll('.box').forEach((box) => {
    box.addEventListener('dragover', (e) => {
      e.preventDefault();
      box.classList.add('over');
    });
    box.addEventListener('dragleave', () => box.classList.remove('over'));
    box.addEventListener('drop', async (e) => {
      e.preventDefault();
      box.classList.remove('over');
      const emp = people.find((x) => x.id === e.dataTransfer.getData('text/plain'));
      const key = Number(box.dataset.box);
      if (!emp || boxKey(emp.performance, emp.potential) === key) return;
      const patch = ratingsForBox(key, emp);
      await act(null, () => api.put(`/api/employees/${emp.id}`, patch), L(`${personName(emp)} 已调整到「${tx(BOXES[key].name)}」`, `${personName(emp)} moved to ${tx(BOXES[key].name)}`));
      ctx.rerender();
    });
  });
  if (ctx.query.emp) showDetail(people.find((x) => x.id === ctx.query.emp));

  const keyTalent = people.filter((e) => [22, 21, 12].includes(boxKey(e.performance, e.potential)));
  const atRisk = people.map((e) => ({ e, r: flightRisk(e, d.today) })).filter((x) => x.r?.level === 'high' && x.r.regrettable);
  const succGaps = d.evaluation.plans.filter((ev) => ev.coverage === 'weak');
  const ruleMd = [
    `## ${L('人才分布', 'Talent landscape')}`,
    ...Object.entries(BOXES).sort((a, b) => b[1].no - a[1].no).map(([k, b]) => `- ${b.no} ${tx(b.name)}：${dist.counts[k]} ${L('人', '')}（${fmt.pct(dist.counts[k] / (people.length || 1))}）`),
    ...dist.checks.map((c) => `- ${tx(c.text)}`),
    '',
    `## ${L('重点投入的关键人才', 'Key talent to invest in')}`,
    ...(keyTalent.length ? keyTalent.slice(0, 10).map((e) => `- **${personName(e)}**（${loc(e, 'title')}）— ${tx(BOXES[boxKey(e.performance, e.potential)].name)}`) : ['- —']),
    '',
    `## ${L('保留风险', 'Retention risks')}`,
    ...(atRisk.length ? atRisk.map(({ e, r }) => `- **${personName(e)}**：${r.factors.slice(0, 2).map((f) => tx(f.text)).join('；')}`) : [L('- 暂无高风险核心人才', '- No high-risk key talent')]),
    '',
    `## ${L('继任缺口', 'Succession gaps')}`,
    ...(succGaps.length ? succGaps.map((ev) => `- ${loc(ev.plan, 'title')}`) : [L('- 关键岗位均有合适继任者', '- Every key role has a suitable successor')]),
    '',
    `## ${L('会议决议建议', 'Decisions for the meeting')}`,
    L('1. 确认关键人才名单并指定发展负责人\n2. 为高风险核心人才制定 30 天内的保留行动\n3. 为存在继任缺口的岗位确定外部招聘或内部培养方案\n4. 需关注人员启动绩效改进计划\n5. 3 个月后复盘行动进展', '1. Confirm the key talent list and name a development owner for each\n2. Agree 30-day retention actions for high-risk key people\n3. Decide external hiring or internal development for roles with a succession gap\n4. Start improvement plans for underperformers\n5. Review progress in 3 months'),
  ].join('\n');
  mountReport(el.querySelector('#ai-talent'), {
    title: L('人才盘点会纪要', 'Talent review summary'),
    ruleMd,
    task: 'talent',
    input: () => ({
      scope: dept ? deptName(dept) : 'Whole company', headcount: people.length,
      distribution: Object.fromEntries(Object.entries(BOXES).map(([k, b]) => [b.name[1], dist.counts[k]])),
      calibrationFlags: dist.checks.map((c) => c.text[1]),
      keyTalent: keyTalent.map((e) => ({ name: e.nameEn, title: e.titleEn, box: BOXES[boxKey(e.performance, e.potential)].name[1] })),
      highFlightRisk: atRisk.map(({ e, r }) => ({ name: e.nameEn, title: e.titleEn, factors: r.factors.map((f) => f.text[1]) })),
      weakSuccession: succGaps.map((ev) => ev.plan.titleEn),
    }),
  });
}

// ------------------------------------------------------------------ competencies
function competencyForm(emp, onSaved) {
  modal({
    title: L(`能力评估 · ${personName(emp)}`, `Competency assessment · ${personName(emp)}`),
    wide: true,
    body: html`${method(L('评估方法：', 'Method:'), L('对照行为锚点，基于过去 6-12 个月的具体事例评分。建议上级评估后与员工沟通确认。', 'Rate against the behavioral anchors using examples from the past 6-12 months, then discuss with the employee.'))}
      ${COMPETENCIES.map((c) => html`<div class="q-block"><p>${tx(c.name)} <span class="small muted" style="font-weight:400">— ${tx(c.def)}</span></p>${likert(c.key, emp.competencies?.[c.key])}
        <div class="small muted" style="margin-top:6px">1：${tx(c.anchors[1])}　3：${tx(c.anchors[3])}　5：${tx(c.anchors[5])}</div></div>`)}`,
    onSubmit: async (v) => {
      const missing = COMP_KEYS.filter((k) => !v[k]);
      if (missing.length) throw new Error(L(`还有 ${missing.length} 项未评分`, `${missing.length} competencies are not rated yet`));
      const competencies = Object.fromEntries(COMP_KEYS.map((k) => [k, Number(v[k])]));
      await api.put(`/api/employees/${emp.id}`, { competencies, assessedAt: today() });
      toast(L('能力评估已保存', 'Assessment saved'));
      onSaved();
    },
  });
}

function levelExplainer(emp, a) {
  const lad = ladderInfo(emp.level);
  const band = `${emp.level} · ${tx(lad.bandName)}${L('段', ' band')}${lad.sharedLevels.length > 1 ? L(`（${lad.sharedLevels.join('、')} 共用同一套能力标准）`, ` (${lad.sharedLevels.join(', ')} share one standard)`) : ''}`;
  let next;
  if (lad.trackTop) next = lad.nextStep
    ? L(`${emp.level} 已处于最高能力标准档；下一职级 ${lad.nextStep} 共用本档标准，发展可聚焦职责范围与业务影响。`, `${emp.level} is in the highest competency band; the next level, ${lad.nextStep}, shares this standard. Focus development on scope and business impact.`)
    : L(`${emp.level} 是${lad.track === 'M' ? '管理' : '专业'}通道的最高职级，可聚焦强项精进与扩大影响力。`, `${emp.level} is the top of the ${lad.track === 'M' ? 'management' : 'professional'} track. Focus on deeper expertise and wider impact.`);
  else if (a.status === 'complete') {
    const nb = assessCompetencies(emp.competencies, targetProfile(lad.nextLevel));
    next = L(`更高一档标准为 ${lad.nextLevel}（${tx(BANDS[lad.nextBand].name)}段），按该标准 8 项中 ${nb.met} 项达标${nb.gaps.length ? `，差距：${nb.gaps.map((g) => `${tx(compByKey[g.key].name)} ${g.actual}→${g.target}`).join('、')}` : ''}。`,
      `The next standard is ${lad.nextLevel} (${tx(BANDS[lad.nextBand].name)} band): ${nb.met} of 8 met${nb.gaps.length ? `; gaps: ${nb.gaps.map((g) => `${tx(compByKey[g.key].name)} ${g.actual}→${g.target}`).join(', ')}` : ''}.`);
  } else next = L(`更高一档标准为 ${lad.nextLevel}（${tx(BANDS[lad.nextBand].name)}段）。`, `The next standard is ${lad.nextLevel} (${tx(BANDS[lad.nextBand].name)} band).`);
  return { band, next };
}

async function competencyView(el, ctx, d) {
  const dept = ctx.query.dept || '';
  const emp = d.active.find((e) => e.id === ctx.query.emp) || d.active.find((e) => !dept || e.deptId === dept);
  const team = d.active.filter((e) => !dept || e.deptId === dept);
  const target = emp ? targetProfile(emp.level) : {};
  const a = emp ? assessCompetencies(emp.competencies, target) : null;
  const axes = COMPETENCIES.map((c) => ({ key: c.key, label: tx(c.name) }));
  const v = a ? VERDICTS[a.verdict] : null;
  const ex = emp ? levelExplainer(emp, a) : null;
  const fitTone = !a || a.fit == null ? 'info' : a.verdict === 'full' ? 'ok' : a.fit < 85 ? 'danger' : 'warn';
  setHTML(el, html`
    <div class="row" style="margin-bottom:12px">${deptOptions(d, dept)}
      <select class="input" id="emp" style="width:auto" aria-label="${L('员工', 'Employee')}">${team.map((e) => html`<option value="${e.id}" ${e.id === emp?.id ? 'selected' : ''}>${personName(e)} · ${loc(e, 'title')}</option>`)}</select></div>
    ${emp ? html`<div class="split">
      <section class="card">
        <div class="card-head"><div><h2>${L('能力画像', 'Competency profile')} · ${personName(emp)}</h2><p>${loc(emp, 'title')} · ${ex.band}</p></div>
          <div class="row"><button class="btn btn-sm" type="button" data-assess>${icon('edit')}${a.status === 'complete' ? L('重新评估', 'Reassess') : L('开始评估', 'Assess now')}</button>${a.status === 'complete' ? html`<a class="btn btn-sm btn-primary" href="#/learning/idp?emp=${emp.id}">${L('生成发展计划', 'Create IDP')}</a>` : ''}</div></div>
        ${a.status === 'missing' ? callout('info', L('尚无能力评估记录。下图只显示该职级的目标要求；完成评估后才能判断强项与差距。', 'No assessment yet. The chart shows only the target for this level; strengths and gaps need an assessment.')) : ''}
        ${radar({ axes, series: [...(a.status !== 'missing' ? [{ name: L('当前水平', 'Current'), values: emp.competencies || {}, cls: 's1' }] : []), { name: L(`${emp.level} 目标`, `${emp.level} target`), values: target, cls: 's2' }] })}
      </section>
      <div class="stack">
        <section class="card"><div class="card-head"><h2>${L(`能力差距 · ${emp.level} 职级`, `Competency gaps · ${emp.level}`)}</h2></div>
          <div class="verdict verdict-${fitTone}">${icon(v.icon)}<div><strong>${a.gaps.length ? L(`尚未达到 ${emp.level} 全部要求，${a.gaps.length} 项能力需提升`, `${a.gaps.length} competencies need development to meet ${emp.level}`) : tx(v.name)}</strong><div class="small">${a.status === 'missing' ? L('尚未评估', 'Not assessed yet') : L(`对照 ${emp.level} 标准，${a.assessedCount} 项已评估中 ${a.met} 项达标${a.status === 'partial' ? `，${a.missing.length} 项未评估` : ''}`, `Against ${emp.level}: ${a.met} of ${a.assessedCount} rated competencies met${a.status === 'partial' ? `, ${a.missing.length} not rated` : ''}`)}</div></div></div>
          <div class="competency-score score-${fitTone}"><div class="competency-score-value">${a.fit == null ? '—' : a.fit}<span>${a.fit == null ? '' : '%'}</span></div><div><strong>${L(`${emp.level} 岗位要求达成度`, `${emp.level} target attainment`)}</strong><div class="small muted">${a.status === 'complete' ? L(`${a.met} / ${a.total} 项能力达标`, `${a.met} / ${a.total} competencies met`) : L('完成全部评估后计算', 'Calculated after a complete assessment')}</div></div></div>
          ${a.gaps.length ? html`<ul class="gap-list">${a.gaps.map((g) => html`<li class="${g.gap >= 2 ? 'big' : ''}">${icon(g.gap >= 2 ? 'x' : 'alert')}<span>${tx(compByKey[g.key].name)}</span><strong>${g.actual} → ${g.target}</strong><span class="small">${L(`差 ${g.gap}`, `short by ${g.gap}`)}</span></li>`)}</ul>` : ''}
          <p class="small muted">${L(`100% 表示达到 ${emp.level} 全部能力要求；按每项目标封顶计算，强项不抵消短板。`, `100% means all ${emp.level} requirements are met. Each item is capped at its target; strengths cannot offset gaps.`)}</p></section>
        <section class="card"><div class="card-head"><h2>${L('职级与能力标准', 'Level and standard')}</h2></div>
          <p class="small">${ex.band}</p><p class="small">${ex.next}</p>
          ${a.status === 'complete' && !a.gaps.length ? callout('ok', L(`已达到 ${emp.level} 全部 8 项能力要求。${ladderInfo(emp.level).trackTop ? '可聚焦强项精进与扩大影响力。' : `可按 ${ladderInfo(emp.level).nextLevel} 标准规划发展。`}`, `Meets all 8 requirements for ${emp.level}. ${ladderInfo(emp.level).trackTop ? 'Focus on deepening strengths and wider impact.' : `Plan development against ${ladderInfo(emp.level).nextLevel}.`}`)) : ''}
          <div class="section-title">${L('强项', 'Strengths')}</div>
          <div>${a.strengths.map((x) => html`<span class="tag tag-ok">${tx(compByKey[x.key].name)} +${-x.gap}</span>`)}${a.strengths.length ? '' : html`<span class="muted small">—</span>`}</div>
        </section>
      </div>
    </div>` : empty(L('没有员工', 'No employees'), '', 'users')}
    <section class="card" style="margin-top:16px">
      <div class="card-head"><div><h2>${L('团队能力差距矩阵', 'Team gap matrix')}</h2><p>${L('数值 = 目标要求 − 当前水平（0 表示达标，颜色越深差距越大；“—”表示未评估）', 'Value = target − current (0 means on target; darker means a bigger gap; "—" means not rated)')}</p></div></div>
      ${heatmap({
        rows: team.slice(0, 40).map((e) => ({ label: `${personName(e)} · ${e.level}`, note: L('未评估', 'Not rated'), cells: Object.fromEntries(COMP_KEYS.map((k) => [k, Number.isInteger(Number(e.competencies?.[k])) && e.competencies?.[k] ? Math.max(0, targetProfile(e.level)[k] - e.competencies[k]) : null])) })),
        cols: COMPETENCIES.map((c) => ({ key: c.key, label: tx(c.name) })),
        color: (val) => (val === 0 ? { bg: 'var(--surface-2)', dark: false } : seqColor(val, 3)),
        format: (val) => String(val),
      })}
    </section>`);
  el.querySelector('#dept').addEventListener('change', (e) => { location.hash = `#/talent/competency${e.target.value ? `?dept=${e.target.value}` : ''}`; });
  el.querySelector('#emp')?.addEventListener('change', (e) => { location.hash = `#/talent/competency?${dept ? `dept=${dept}&` : ''}emp=${e.target.value}`; });
  on(el, 'click', '[data-assess]', () => competencyForm(emp, () => ctx.rerender()));
}

// ------------------------------------------------------------------ succession
const statusBadge = (status) => html`<span class="badge badge-${STATUS[status].tone}">${icon(STATUS[status].icon)}${tx(STATUS[status].name)}</span>`;
const componentsTip = (n) => (n.components ? Object.entries(n.components).map(([k, v]) => `${tx(COMPONENT_NAMES[k])} ${v}/${WEIGHTS[k]}`).join('\n') : '');

function scoreBar(n) {
  if (!n.components) return html`<span class="muted small">—</span>`;
  return html`<span class="score-stack" tabindex="0" data-tip="${L('综合分', 'Score')} ${n.score}\n${componentsTip(n)}">${Object.entries(n.components).map(([k, v]) => html`<i class="c-${k}" style="width:${v}%"></i>`)}</span><strong class="num">${n.score}</strong>`;
}

function specForm(ev, d, onSaved) {
  const s = ev.spec;
  modal({
    title: L(`岗位要求 · ${loc(ev.plan, 'title')}`, `Role requirements · ${loc(ev.plan, 'title')}`),
    wide: true,
    body: html`${method(L('说明：', 'Note:'), L('继任者按“目标岗位”的职能、职级、关键能力和关键技能评估，而不仅是现任者的职级。默认值来自现任者的职位与技能，可按岗位实际调整。', 'Successors are measured against the target role: its function, level, critical competencies and key skills, not just the incumbent\'s grade. Defaults come from the incumbent\'s title and skills; adjust them to the real role.'))}
      <div class="form-grid" style="margin-top:12px">
        ${field(L('职能', 'Function'), select('family', Object.entries(FAMILIES).map(([k, f]) => [k, tx(f.name)]), { value: s.family }))}
        ${field(L('职级', 'Level'), select('level', LEVELS.map((l) => [l, l]), { value: s.level }))}
        ${field(L('关键能力（权重加倍）', 'Critical competencies (double weight)'), chipSelect('critical', COMPETENCIES.map((c) => [c.key, tx(c.name)]), s.critical), { span: true, group: true })}
        ${field(L('关键技能（跨职能人选的佐证依据）', 'Key skills (evidence for cross-functional candidates)'), chipSelect('skills', SKILLS.filter((k) => k.family !== 'general').map((k) => [k.key, tx(k.label)]), s.skills), { span: true, group: true })}
      </div>`,
    onSubmit: async (v) => {
      const critical = list(v.critical);
      if (!critical.length) throw new Error(L('请至少选择一项关键能力', 'Choose at least one critical competency'));
      await api.put(`/api/succession/${ev.plan.id}`, { spec: { family: v.family, level: v.level, critical, skills: list(v.skills) } });
      toast(L('岗位要求已保存', 'Requirements saved'));
      onSaved();
    },
  });
}

function nominateForm(ev, d, onSaved, presetId) {
  const deps = deptMap(d);
  const nominated = new Set((ev.plan.successors || []).map((n) => n.employeeId));
  const options = d.active.filter((e) => e.id !== ev.plan.incumbentId && !nominated.has(e.id) && flightRisk(e, d.today)?.level !== 'high');
  modal({
    title: L(`提名继任者 · ${loc(ev.plan, 'title')}`, `Nominate a successor · ${loc(ev.plan, 'title')}`),
    wide: true,
    body: html`
      ${callout('info', L('高流失风险人员已从提名名单中排除；风险降低后可重新评估。', 'High-flight-risk employees are excluded from nominations; reassess once their risk falls.'))}
      ${ev.suggestions.length ? html`<div class="section-title">${L('系统建议（已通过全部资格检查，按综合分排序）', 'Suggested (passed every check, ranked by score)')}</div>
        ${ev.suggestions.map((x) => html`<label class="list-item check"><input type="radio" name="employeeId" value="${x.employee.id}" ${x.employee.id === presetId ? 'checked' : ''}><span class="grow">${personName(x.employee)} <span class="small muted">${loc(x.employee, 'title')} · ${x.employee.level} · ${L('能力匹配', 'fit')} ${x.fit}% · ${tx(READINESS[x.readiness].name)}</span></span>${scoreBar(x)}</label>`)}` : callout('info', L('没有人通过全部资格检查。可以手动提名，但系统会显示其资格状态。', 'Nobody passes every check. You can still nominate someone; their eligibility status will be shown.'))}
      ${ev.heldBack.length ? html`<p class="small muted" style="margin-top:8px">${L('因高流失风险未推荐：', 'Not suggested because of high flight risk: ')}${ev.heldBack.map((x) => personName(x.employee)).join('、')}</p>` : ''}
      <div class="form-grid" style="margin-top:12px">
        ${field(L('或选择其他员工', 'Or pick someone else'), select('other', options.map((e) => [e.id, `${personName(e)} · ${loc(e, 'title')} · ${e.level}`]), { placeholder: '—', value: ev.suggestions.some((x) => x.employee.id === presetId) ? '' : presetId }))}
        ${field(L('上级判断的准备度', 'Readiness (manager judgment)'), select('readiness', Object.entries(READINESS).map(([k, r]) => [k, tx(r.name)]), { value: 'y1' }))}
        ${field(L('跨职能依据（候选人与岗位职能不同时必填）', 'Cross-functional evidence (required when functions differ)'), textarea('evidence', { rows: 2, placeholder: L('例如：曾负责产品线 2 年，主导过 3 个产品版本上线', 'e.g. ran a product line for 2 years and shipped 3 releases') }), { span: true })}
      </div>
      <div id="nominee-check"></div>`,
    submitLabel: L('提名', 'Nominate'),
    onOpen: (form) => {
      const check = () => {
        const id = form.other.value || form.querySelector('input[name=employeeId]:checked')?.value;
        const emp = d.employees.find((e) => e.id === id);
        if (!emp) return setHTML(form.querySelector('#nominee-check'), '');
        const r = evaluateCandidate(emp, { spec: ev.spec, today: d.today, departments: deps, nomination: { evidence: form.evidence.value } });
        setHTML(form.querySelector('#nominee-check'), html`<div style="margin-top:10px">${statusBadge(r.status)} ${r.reasons.map((x) => html`<div class="small">${tx(x)}</div>`)}${r.status === 'eligible' ? html`<div class="small">${L(`综合分 ${r.score}，能力匹配 ${r.fit}%`, `Score ${r.score}, fit ${r.fit}%`)}</div>` : ''}</div>`);
      };
      form.addEventListener('change', check);
      form.addEventListener('input', check);
      check();
    },
    onSubmit: async (v) => {
      const id = v.other || v.employeeId;
      const emp = d.employees.find((e) => e.id === id);
      if (!emp) throw new Error(L('请选择员工', 'Choose someone'));
      const r = evaluateCandidate(emp, { spec: ev.spec, today: d.today, departments: deps, nomination: { evidence: v.evidence } });
      if (r.risk?.level === 'high') throw new Error(L('高流失风险人员不可加入继任名单，请先落实保留措施。', 'High-flight-risk employees cannot be nominated. Address retention first.'));
      if (r.checks.function && !r.checks.function.ok) throw new Error(L('该人选与岗位职能不同，请填写跨职能依据后再提名。', 'This person is from a different function; add cross-functional evidence first.'));
      await api.put(`/api/succession/${ev.plan.id}`, { successors: [...(ev.plan.successors || []), { employeeId: id, readiness: v.readiness, evidence: v.evidence.trim(), note: '', nominatedBy: getActor(), nominatedAt: today() }] });
      toast(L('已提名', 'Nominated'));
      onSaved();
    },
  });
}

export function keyRoleForm(d, onSaved, presetEmployeeId) {
  const holders = new Set(d.succession.map((s) => s.incumbentId));
  const candidates = d.active.filter((e) => !holders.has(e.id));
  modal({
    title: L('评估是否列为关键岗位', 'Assess whether this is a key role'),
    wide: true,
    body: html`${method(L('关键岗位不限于管理岗：', 'Key roles are not only management roles:'), L('对业务影响大、技能稀缺、替代周期长或存在单点依赖的岗位都应纳入继任规划。高流失风险本身不是列为关键岗位的理由——需要基于岗位本身判断。', 'Include roles with big business impact, scarce skills, long replacement time or a single point of failure. High flight risk alone is not a reason: judge the role itself.'))}
      <div class="form-grid" style="margin-top:12px">
        ${field(L('岗位（按现任者选择）', 'Role (by incumbent)'), select('incumbentId', candidates.map((e) => [e.id, `${loc(e, 'title')} · ${personName(e)} · ${e.level}`]), { value: presetEmployeeId }), { span: true })}
        ${field(L('关键原因（至少一项）', 'Why it is key (at least one)'), chipSelect('reasons', Object.entries(KEY_ROLE_REASONS).map(([k, r]) => [k, tx(r)]), []), { span: true, group: true })}
        ${field(L('补充说明', 'Notes'), textarea('note', { rows: 2 }), { span: true })}
        ${field(L('关键程度', 'Criticality'), select('criticality', Object.entries(CRITICALITY).map(([k, c]) => [k, tx(c.name)]), { value: 'high' }))}
        ${field(L('空缺风险', 'Vacancy risk'), select('vacancyRisk', [['low', L('低', 'Low')], ['medium', L('中', 'Medium')], ['high', L('高', 'High')]], { value: 'low' }))}
      </div>`,
    submitLabel: L('列为关键岗位', 'Make it a key role'),
    onSubmit: async (v) => {
      const inc = d.employees.find((e) => e.id === v.incumbentId);
      if (!inc) throw new Error(L('请选择岗位', 'Choose a role'));
      if (!list(v.reasons).length) throw new Error(L('请说明为什么这是关键岗位', 'Say why this role is key'));
      const doc = await api.post('/api/succession', { title: inc.title, titleEn: inc.titleEn, deptId: inc.deptId, incumbentId: inc.id, criticality: v.criticality, vacancyRisk: v.vacancyRisk, keyReasons: list(v.reasons), note: v.note.trim(), noteEn: v.note.trim(), successors: [] });
      toast(L('已列为关键岗位', 'Key role added'));
      onSaved(doc);
    },
  });
}

// A missing formal plan still has a useful destination from the flight-risk page.
// This preview evaluates the person's own role and never creates stored records.
function successorPreview(emp, d) {
  const preview = evaluatePlan({ id: `preview-${emp.id}`, title: emp.title, titleEn: emp.titleEn, deptId: emp.deptId, incumbentId: emp.id, criticality: 'high', successors: [] }, d.employees, { today: d.today, departments: deptMap(d) });
  return html`<section class="card successor-preview" data-preview="${emp.id}">
    <div class="card-head"><div><h2>${personName(emp)} · ${L('对应继任者', 'Successors for this role')}</h2><p>${loc(emp, 'title')} · ${emp.level} · ${L('候选预览', 'Candidate preview')}</p></div>${badge(L('尚未建立正式计划', 'No formal plan yet'), 'warn')}</div>
    ${callout('info', L('按本人岗位要求筛选可考察人选，已排除现任者及所有高流失风险人员。以下为系统建议，尚未计入正式继任覆盖。', 'Candidates are screened against this person’s role, excluding the incumbent and all high-flight-risk employees. These suggestions do not yet count as formal succession coverage.'))}
    ${preview.suggestions.length ? html`<div class="section-title">${L('建议考察顺序', 'Suggested review order')}</div>${preview.suggestions.map((n, i) => html`<div class="cand-row"><span class="candidate-priority">${i + 1}</span><div class="grow">${personLink(n.employee, `${loc(n.employee, 'title')} · ${n.employee.level}`)}<div class="small">${i === 0 ? badge(L('优先考察', 'Review first'), 'ok') : ''} ${L('能力匹配', 'Fit')} ${n.fit}% · ${L('绩效', 'Performance')} ${n.employee.performance}/5 · ${L('流失风险', 'Flight risk')} ${n.risk ? tx(RISK_LEVEL[n.risk.level][0]) : L('未知', 'Unknown')}</div></div><div class="cand-score">${scoreBar(n)}</div></div>`)}` : callout('danger', L('暂未找到通过全部条件的内部候选。建议补充能力评估、开展定向培养或建立外部人才储备。', 'No internal candidates currently pass every check. Complete assessments, develop a pipeline, or consider external candidates.'))}
    <button class="btn btn-primary btn-sm" type="button" data-keyrole="${emp.id}" style="margin-top:12px">${L('评估并建立正式继任计划', 'Assess and create a formal plan')}</button>
  </section>`;
}

async function successionView(el, ctx, d) {
  const order = ctx.query.order === 'dept' ? 'dept' : 'risk';
  const ev = d.evaluation;
  const focusEmp = d.active.find((e) => e.id === ctx.query.emp);
  const relevant = ctx.query.emp ? ev.plans.filter((p) => p.plan.incumbentId === ctx.query.emp) : ev.plans;
  const plans = order === 'dept'
    ? [...relevant].sort((a, b) => d.departments.findIndex((x) => x.id === a.plan.deptId) - d.departments.findIndex((x) => x.id === b.plan.deptId) || b.urgency - a.urgency)
    : relevant;
  const deptName = (id) => loc(d.departments.find((x) => x.id === id));
  const card = (p, rank) => {
    const s = p.spec;
    const sorted = [...p.nominations].sort((a, b) => ['preferred', 'eligible', 'below_bar', 'insufficient_data', 'excluded_risk', 'excluded'].indexOf(a.status) - ['preferred', 'eligible', 'below_bar', 'insufficient_data', 'excluded_risk', 'excluded'].indexOf(b.status) || (a.priority ?? Infinity) - (b.priority ?? Infinity) || (b.score ?? -1) - (a.score ?? -1));
    const conc = (id) => ev.concentration[id];
    return html`<section class="card succ-card" id="plan-${p.plan.id}" data-plan="${p.plan.id}">
      <div class="card-head"><div><h2>${order === 'risk' ? html`<span class="rank">${rank}</span>` : ''}${loc(p.plan, 'title')}</h2><p>${deptName(p.plan.deptId)}</p></div>
        <div class="row">${badge(tx(CRITICALITY[p.plan.criticality]?.name || [p.plan.criticality, p.plan.criticality]), CRITICALITY[p.plan.criticality]?.tone)}<span class="badge badge-${COVERAGE[p.coverage].tone}">${icon(p.coverage === 'weak' ? 'alert' : 'check')}${tx(COVERAGE[p.coverage].name)}</span></div></div>
      <p class="small muted" data-tip="${L('继任风险分', 'Succession risk score')} ${p.urgency}">${L('排序依据：', 'Ranked by: ')}${p.urgencyParts.map((x) => tx(x.label)).join(' · ')} = ${p.urgency}</p>
      <div class="row-between"><div>${personLink(p.incumbent, L('现任', 'Incumbent'))}</div><div class="small muted">${p.incumbentRisk ? html`${L('现任者流失风险', 'Incumbent flight risk')} ${badge(tx(RISK_LEVEL[p.incumbentRisk.level][0]), RISK_LEVEL[p.incumbentRisk.level][1])}` : ''}${p.plan.vacancyRisk === 'high' ? html` ${badge(L('空缺风险高', 'Vacancy risk high'), 'danger')}` : ''}</div></div>
      ${p.plan.note ? html`<p class="small muted" style="margin-top:8px">${loc(p.plan, 'note')}</p>` : ''}
      <div class="spec small"><span>${L('岗位要求：', 'Requirements: ')}<strong>${familyName(s.family, lang())}</strong> · ${s.level} · ${L('关键能力', 'critical')} ${s.critical.map((k) => tx(compByKey[k].name)).join('、')}${s.skills.length ? ` · ${L('关键技能', 'key skills')} ${s.skills.map((k) => skillLabel(k, lang())).join('、')}` : ''}${s.custom ? '' : L('（默认）', ' (default)')}</span><button class="btn btn-sm btn-ghost" type="button" data-spec="${p.plan.id}">${icon('edit')}</button></div>
      <div class="section-title">${L(`有效继任候选（${p.eligibleCount} 人）`, `Eligible successors (${p.eligibleCount})`)}</div>
      ${p.preferred ? '' : callout('danger', html`<strong>${L('未找到合适的继任者。', 'No suitable successor identified.')}</strong> ${sorted.length ? L('已提名人选均未通过资格检查或未达适任标准。', 'No nominee passes the checks and the suitability bar.') : L('尚无提名。', 'No nominations yet.')}${p.suggestions.length ? L(` 系统建议可考虑：${p.suggestions.slice(0, 2).map((x) => personName(x.employee)).join('、')}。`, ` Consider: ${p.suggestions.slice(0, 2).map((x) => personName(x.employee)).join(', ')}.`) : L(' 建议启动外部人才储备。', ' Start an external pipeline.')}`)}
      ${sorted.filter((n) => ['preferred', 'eligible'].includes(n.status)).map((n) => html`<div class="cand-row status-${n.status}">
        <span class="candidate-priority" aria-label="${L(`继任优先级 ${n.priority}`, `Priority ${n.priority}`)}">${n.priority}</span>
        <div class="grow">${personLink(n.employee, `${loc(n.employee, 'title')} · ${n.employee.level || ''}`)}
          <div class="small">${statusBadge(n.status)}${n.readiness && n.components && !n.status.startsWith('excluded') ? html` <span class="badge" data-tip="${L('按职级差估算，不重复使用能力数据', 'Estimated from level distance only (competency data is not reused)')}">${tx(READINESS[n.readiness].name)}</span>` : ''}${n.nominatedReadiness ? html` <span class="muted">${L('提名判断：', 'Nominator: ')}${tx(READINESS[n.nominatedReadiness]?.name || ['—', '—'])}</span>` : ''}
            ${conc(n.employee.id) && (conc(n.employee.id).preferred.length >= 2 || conc(n.employee.id).nominated.length >= CONCENTRATION_NOMINATIONS) ? html` <span class="badge badge-warn" data-tip="${L('一人只能接任一个岗位；过多提名会高估覆盖', 'One person can fill only one role; many nominations overstate coverage')}">${icon('alert')}${L(`集中：${conc(n.employee.id).nominated.length} 个计划`, `Concentration: ${conc(n.employee.id).nominated.length} plans`)}</span>` : ''}</div>
          ${n.reasons?.length ? html`<div class="small reason">${n.reasons.map((x) => html`<div>${tx(x)}</div>`)}</div>` : ''}
          ${n.checks?.function?.kind === 'justified' ? html`<div class="small muted">${L('跨职能依据：', 'Cross-functional evidence: ')}${n.checks.function.evidence}</div>` : n.checks?.function?.kind === 'skills' ? html`<div class="small muted">${L('跨职能依据（技能）：', 'Cross-functional evidence (skills): ')}${n.checks.function.skills.map((k) => skillLabel(k, lang())).join('、')}</div>` : ''}
          ${n.nomination?.note ? html`<div class="small muted">${n.nomination.note}</div>` : ''}
        </div>
        <div class="cand-score">${scoreBar(n)}<div class="small muted">${L('匹配', 'Fit')} ${n.fit}% · ${L('绩效', 'Perf')} ${n.employee.performance}/5</div><div class="small">${L('流失风险', 'Flight risk')} ${n.risk ? badge(tx(RISK_LEVEL[n.risk.level][0]), RISK_LEVEL[n.risk.level][1]) : '—'}</div></div>
        <button class="icon-btn" type="button" data-remove="${p.plan.id}:${n.index}" aria-label="${L('移除提名', 'Remove nomination')}">${icon('x')}</button>
      </div>`)}
      ${sorted.some((n) => !['preferred', 'eligible'].includes(n.status)) ? html`<details class="excluded-nominations small"><summary>${L(`未纳入名单的历史提名（${sorted.filter((n) => !['preferred', 'eligible'].includes(n.status)).length}）`, `Excluded or unqualified nominations (${sorted.filter((n) => !['preferred', 'eligible'].includes(n.status)).length})`)}</summary>${sorted.filter((n) => !['preferred', 'eligible'].includes(n.status)).map((n) => html`<div class="cand-row status-${n.status}"><div class="grow">${personLink(n.employee)}<div>${statusBadge(n.status)} ${L('不参与排名与覆盖计算', 'Not ranked or counted as coverage')}</div><div class="reason">${n.reasons.map((r) => html`<div>${tx(r)}</div>`)}</div></div><button class="icon-btn" type="button" data-remove="${p.plan.id}:${n.index}" aria-label="${L('移除提名', 'Remove nomination')}">${icon('x')}</button></div>`)}</details>` : ''}
      ${p.suggestions.length ? html`<details class="small" style="margin-top:8px"><summary>${L(`系统建议（${p.suggestions.length} 人，通过全部资格检查）`, `Suggestions (${p.suggestions.length}, pass every check)`)}</summary>
        ${p.suggestions.map((x) => html`<div class="cand-row"><div class="grow">${personLink(x.employee, `${loc(x.employee, 'title')} · ${x.employee.level} · ${tx(READINESS[x.readiness].name)}`)}</div><div class="cand-score">${scoreBar(x)}</div><button class="btn btn-sm" type="button" data-nominate="${p.plan.id}" data-emp="${x.employee.id}">${L('提名', 'Nominate')}</button></div>`)}</details>` : ''}
      ${p.heldBack.length ? html`<p class="small muted" style="margin-top:6px">${icon('alert')} ${L('因高流失风险未推荐：', 'Not suggested because of high flight risk: ')}${p.heldBack.map((x) => html`<a href="#/talent/risk?focus=${x.employee.id}">${personName(x.employee)}</a> `)}</p>` : ''}
      <button class="btn btn-sm" type="button" data-nominate="${p.plan.id}" style="margin-top:10px">${icon('plus')}${L('提名继任者', 'Nominate')}</button>
    </section>`;
  };

  setHTML(el, html`
    ${ctx.query.emp ? html`<div class="row-between" style="margin-bottom:12px"><h2>${focusEmp ? personName(focusEmp) : L('员工不存在或已离职', 'Employee unavailable')} · ${L('对应继任者', 'Successors for this role')}</h2><a class="btn btn-sm" href="#/talent/succession">${L('查看全部继任计划', 'All succession plans')}</a></div>` : ''}
    ${focusEmp && !plans.length ? successorPreview(focusEmp, d) : ''}
    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="card kpi"><span class="label">${L('关键岗位', 'Key roles')}</span><span class="value">${ev.plans.length}</span><span class="sub">${L(`有效覆盖 ${ev.summary.strong + ev.summary.moderate} 个`, `${ev.summary.strong + ev.summary.moderate} effectively covered`)}</span></div>
      ${Object.entries(COVERAGE).map(([k, c]) => html`<div class="card kpi"><span class="label">${badge(tx(c.name), c.tone)}</span><span class="value">${ev.summary[k]}</span><span class="sub">${tx(c.desc)}</span></div>`)}
    </div>
    ${ev.warnings.length ? html`<div class="callouts" style="margin-bottom:12px">${ev.warnings.map((w) => {
      const e = d.employees.find((x) => x.id === w.employeeId);
      return callout('warn', L(`依赖集中：${personName(e)} 是 ${w.nominated.length} 个继任计划的有效候选${w.preferred.length ? `，并在 ${w.preferred.length} 个计划中为首选` : ''}。一人只能接任一个岗位，这些计划的覆盖并不相互独立。`, `Concentration: ${personName(e)} is an eligible candidate in ${w.nominated.length} plans${w.preferred.length ? ` and preferred in ${w.preferred.length}` : ''}. One person can fill only one role, so these plans are not independently covered.`));
    })}</div>` : ''}
    <div class="row-between" style="margin-bottom:12px">
      <div class="row"><span class="small muted">${L('排序：', 'Order: ')}</span><div class="seg"><button type="button" class="${order === 'risk' ? 'on' : ''}" data-order="risk">${L('继任风险从高到低', 'Succession risk, highest first')}</button><button type="button" class="${order === 'dept' ? 'on' : ''}" data-order="dept">${L('按部门', 'By department')}</button></div></div>
      <button class="btn btn-primary" type="button" data-new>${icon('plus')}${L('评估新的关键岗位', 'Assess a new key role')}</button></div>
    <p class="small muted">${order === 'risk' ? L('按岗位继任紧急程度排序：关键程度 × 覆盖缺口 + 现任流失风险 + 空缺风险，分数越高越优先处理。卡片代表关键岗位，同一部门可以有多个岗位。', 'Roles are ordered by succession urgency: criticality × coverage gap + incumbent flight risk + vacancy risk. Higher scores need attention first. Each card is a role; a department may have several.') : L('按组织部门顺序分组，同部门内按继任紧急程度排序。', 'Grouped in organization department order, then by succession urgency within each department.')}</p>
    <details class="card small" style="margin-bottom:12px"><summary><strong>${L('评估规则', 'How candidates are evaluated')}</strong></summary>
      <ol style="margin:8px 0 0;padding-left:18px">
        <li>${L('资格检查：与目标岗位同职能（跨职能需书面依据或具备岗位关键技能）；职级不高于岗位一级以上、低于岗位不超过', 'Checks: same function as the role (cross-functional needs written evidence or the role\'s key skills); level no more than one step above and at most')} ${MAX_LEVEL_DISTANCE} ${L('级；最近绩效 ≥ 3；能力评估完整；流失风险不为“高”。部门相同不作为合格依据。', 'steps below the role; latest rating ≥ 3; complete competency assessment; flight risk not high. Being in the same department is not evidence.')}</li>
        <li>${L('综合分（满分 100）：', 'Score (out of 100): ')}${Object.entries(WEIGHTS).map(([k, w]) => `${tx(COMPONENT_NAMES[k])} ${w}`).join(' · ')}${L('。能力匹配对照岗位的职级标准，关键能力权重加倍；职级就绪只看职级差，不重复使用能力数据。', '. Fit is measured against the role\'s level standard with critical competencies doubled; level readiness uses only the level distance, so competency data is not counted twice.')}</li>
        <li>${L(`适任标准：能力匹配 ≥ ${SUITABILITY.minFit}% 且综合分 ≥ ${SUITABILITY.minScore}。只有提名人中达标且排名第一者为“首选继任者”；没人达标时显示“未找到合适的继任者”。`, `Suitability bar: fit ≥ ${SUITABILITY.minFit}% and score ≥ ${SUITABILITY.minScore}. Only the top nominee who clears it becomes the preferred successor; otherwise "No suitable successor identified".`)}</li>
        <li>${L('覆盖：只计算合格候选。禁止新增高流失风险提名；既有高风险及不合格提名保留在历史记录中，不进入有效名单。', 'Coverage counts only eligible candidates. New high-flight-risk nominations are blocked; existing high-risk or unqualified nominations are kept in history outside the eligible list.')}</li>
        <li>${L(`排序：关键程度权重 × 覆盖缺口权重，加上现任者流失风险与空缺风险。依赖集中提示：同一人是 ${CONCENTRATION_NOMINATIONS} 个及以上计划的有效候选，或在 2 个及以上计划中为首选（该阈值为经验值，可调整）。`, `Order: criticality weight × coverage-gap weight, plus incumbent flight and vacancy risk. Concentration warning: eligible in ${CONCENTRATION_NOMINATIONS}+ plans or preferred in 2+ (an adjustable rule of thumb).`)}</li>
      </ol></details>
    <div class="grid cols-2">${plans.map((p, i) => card(p, i + 1))}</div>`);

  if (ctx.query.plan) {
    const target = el.querySelector(`#plan-${CSS.escape(ctx.query.plan)}`);
    if (target) {
      target.classList.add('highlight');
      setTimeout(() => target.scrollIntoView({ block: 'center' }), 50);
    }
  }
  on(el, 'click', '[data-order]', (e, b) => { const query = new URLSearchParams(); if (b.dataset.order === 'dept') query.set('order', 'dept'); if (ctx.query.emp) query.set('emp', ctx.query.emp); location.hash = `#/talent/succession${query.size ? `?${query}` : ''}`; });
  on(el, 'click', '[data-remove]', async (e, b) => {
    const [id, idx] = b.dataset.remove.split(':');
    const plan = d.succession.find((x) => x.id === id);
    const successors = plan.successors.filter((_, i) => i !== Number(idx));
    await act(b, () => api.put(`/api/succession/${id}`, { successors }), L('已移除提名', 'Nomination removed'));
    ctx.rerender();
  });
  on(el, 'click', '[data-spec]', (e, b) => specForm(ev.plans.find((x) => x.plan.id === b.dataset.spec), d, () => ctx.rerender()));
  on(el, 'click', '[data-nominate]', (e, b) => nominateForm(ev.plans.find((x) => x.plan.id === b.dataset.nominate), d, () => ctx.rerender(), b.dataset.emp));
  on(el, 'click', '[data-new]', () => keyRoleForm(d, (doc) => { location.hash = `#/talent/succession?plan=${doc.id}`; }));
  on(el, 'click', '[data-keyrole]', (e, b) => keyRoleForm(d, (doc) => { location.hash = `#/talent/succession?plan=${doc.id}`; }, b.dataset.keyrole));
}

// ------------------------------------------------------------------ flight risk
async function riskView(el, ctx, d) {
  const filter = ctx.query.f || 'all';
  const all = d.active.map((e) => ({ e, r: flightRisk(e, d.today) })).filter((x) => x.r).sort((a, b) => b.r.score - a.r.score);
  const rows = all.filter((x) => filter === 'all' || (filter === 'high' && x.r.level === 'high') || (filter === 'regret' && x.r.regrettable && x.r.level !== 'low'));
  const byDept = d.departments.map((dep) => {
    const xs = all.filter((x) => x.e.deptId === dep.id);
    return { label: loc(dep), value: xs.filter((x) => x.r.level === 'high').length, tip: `${loc(dep)}: ${xs.filter((x) => x.r.level === 'high').length} ${L('人高风险', 'high risk')} / ${xs.length}` };
  }).filter((x) => x.value).sort((a, b) => b.value - a.value);
  const lvl = (k) => all.filter((x) => x.r.level === k).length;

  const linkCell = (e, r) => {
    const { own, asCandidate } = successionLinks(e.id, d.evaluation);
    const parts = [];
    if ((r.level === 'high' && r.regrettable) || own.length) parts.push(html`<a class="btn btn-sm btn-primary" href="#/talent/succession?emp=${e.id}">${icon('shield')}${L('对应继任者', 'View successors')}</a>`);
    for (const p of own) parts.push(html`<div><a href="#/talent/succession?plan=${p.plan.id}">${icon('shield')}${L('本岗位继任计划', 'Successors for this role')}</a> <span class="badge badge-${COVERAGE[p.coverage].tone}">${tx(COVERAGE[p.coverage].name)}</span>${p.preferred ? html` <span class="muted">${L('首选：', 'Preferred: ')}${personName(p.preferred.employee)}</span>` : ''}</div>`);
    for (const { ev, n } of asCandidate) parts.push(html`<div><a href="#/talent/succession?plan=${ev.plan.id}">${L('候选：', 'Candidate for: ')}${loc(ev.plan, 'title')}</a> <span class="badge badge-${STATUS[n.status].tone}">${tx(STATUS[n.status].name)}</span></div>`);
    if (!own.length && r.regrettable) parts.push(html`<div class="muted">${L('尚无正式计划，可查看本岗位候选预览。', 'No formal plan yet; view the candidate preview for this role.')}${r.level !== 'high' ? html` <a href="#/talent/succession?emp=${e.id}">${L('对应继任者', 'View successors')}</a>` : ''}</div>`);
    return parts.length ? html`${parts}` : html`<span class="muted">—</span>`;
  };
  const actionsCell = (e) => {
    const ins = personalInsight(e, d.insightCtx);
    const acts = retentionActions(ins, 2);
    return html`${acts.length ? html`<ul class="tight">${acts.map((a) => html`<li>${tx(a.text)}</li>`)}</ul>` : html`<span class="muted">—</span>`}<a class="small" href="#/talent/ninebox?emp=${e.id}">${L('完整解读 →', 'Full insight →')}</a>`;
  };

  setHTML(el, html`
    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="card kpi"><span class="label">${badge(L('高风险', 'High'), 'danger')}</span><span class="value">${lvl('high')}</span><span class="sub">${L('其中核心人才', 'Key talent among them')} ${all.filter((x) => x.r.level === 'high' && x.r.regrettable).length}</span></div>
      <div class="card kpi"><span class="label">${badge(L('中风险', 'Medium'), 'warn')}</span><span class="value">${lvl('medium')}</span></div>
      <div class="card kpi"><span class="label">${badge(L('低风险', 'Low'), 'ok')}</span><span class="value">${lvl('low')}</span></div>
      <div class="card"><div class="small muted" style="margin-bottom:6px">${L('高风险人数（按部门）', 'High risk by department')}</div>${byDept.length ? hbars(byDept, { table: false }) : html`<span class="muted small">—</span>`}</div>
    </div>
    <div class="row-between" style="margin-bottom:12px">
      <div class="seg">${[['all', L('全部', 'All')], ['high', L('仅高风险', 'High only')], ['regret', L('核心人才', 'Key talent')]].map(([k, n]) => html`<button type="button" class="${filter === k ? 'on' : ''}" data-f="${k}">${n}</button>`)}</div>
      <span class="small muted">${L('风险分 = 司龄、晋升间隔、薪酬竞争力、敬业度、绩效与潜力等因素加总', 'Score adds up tenure, time since promotion, pay position, engagement, performance and potential')}</span>
    </div>
    <section class="card card-flush"><div class="table-wrap"><table class="table risk-table">
      <thead><tr><th>${L('员工', 'Employee')}</th><th>${L('风险分', 'Score')}</th><th>${L('主要因素', 'Main factors')}</th><th>${L('继任关联', 'Succession links')}</th><th>${L('个性化建议（基于本人数据）', 'Personal actions (from their data)')}</th></tr></thead>
      <tbody>${rows.map(({ e, r }) => html`<tr id="risk-${e.id}" class="${ctx.query.focus === e.id ? 'highlight' : ''}">
        <td>${personLink(e, `${loc(e, 'title')} · ${loc(d.departments.find((x) => x.id === e.deptId))}`)}<div style="margin-top:4px">${badge(tx(RISK_LEVEL[r.level][0]), RISK_LEVEL[r.level][1])}${r.regrettable ? html` ${badge(L('核心', 'Key'), 'info')}` : ''}</div></td>
        <td style="min-width:110px"><div class="row" style="flex-wrap:nowrap"><span class="num" style="width:26px">${r.score}</span><div style="flex:1">${meter(r.score, 100, r.level === 'high' ? 'danger' : r.level === 'medium' ? 'warn' : 'ok')}</div></div></td>
        <td class="small">${r.factors.slice(0, 3).map((f) => html`<div>${tx(f.text)} <span class="muted">+${f.points}</span></div>`)}</td>
        <td class="small">${linkCell(e, r)}</td>
        <td class="small">${r.level === 'low' ? html`<span class="muted">—</span>` : actionsCell(e)}</td></tr>`)}</tbody></table></div></section>
    <div style="margin-top:12px">${method(L('使用提示：', 'Note:'), L('所有高风险人员都应在两周内由直属上级完成一对一保留沟通；表中只列出与其本人主要风险因素对应的行动。风险分是对话的起点而非结论。“本岗位继任计划”回答“他离开后谁来接”，“候选”表示他在别人的继任计划中——高风险人员不会被推荐或计入覆盖。', 'Every high-risk person should get a retention one-to-one with their manager within two weeks; the table lists only actions tied to their own main risk factors. The score starts a conversation; it is not a verdict. "Successors for this role" answers who steps in if they leave; "Candidate for" means they appear in someone else\'s plan, where high-risk people are never recommended or counted as coverage.'))}</div>`);
  if (ctx.query.focus) setTimeout(() => el.querySelector(`#risk-${CSS.escape(ctx.query.focus)}`)?.scrollIntoView({ block: 'center' }), 50);
  on(el, 'click', '[data-f]', (e, b) => { location.hash = `#/talent/risk?f=${b.dataset.f}`; });
  on(el, 'click', '[data-keyrole]', (e, b) => keyRoleForm(d, (doc) => { location.hash = `#/talent/succession?plan=${doc.id}`; }, b.dataset.keyrole));
}

