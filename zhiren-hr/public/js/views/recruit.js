// Intelligent recruitment: requisitions, pipeline, candidate evaluation,
// batch resume screening, structured interview kits and the JD builder.
import {
  html, setHTML, load, api, byId, icon, fmt, today, daysBetween, personName, personLink, avatar, badge, callout, pageHead, tabs, empty,
  modal, confirmDialog, toast, act, nowStamp, field, input, textarea, select, wireChips, likert, list, on, getActor, scoreRing, meter, method, copyText, download,
} from '../core.js';
import { L, tx, loc, lang, STAGES, STAGE_ORDER, SOURCES, REJECT_REASONS, POSITION_STATUS, PRIORITY, LOCATIONS } from '../i18n.js';
import { SKILLS, SKILL_FAMILIES, skillLabel } from '../engine/skills.js';
import { parseResume, matchCandidate, TIERS, EDUCATION, WEIGHTS } from '../engine/resume.js';
import { generateJD, checkInclusive, detectFamily, FAMILIES } from '../engine/jd.js';
import { planInterview, STAR_PROBES, ROUNDS, RECOMMENDATIONS, aggregateScorecards, DECISIONS } from '../engine/interview.js';
import { compByKey, LEVELS, targetProfile } from '../engine/competency.js';
import { buildChecklist } from '../engine/service.js';
import { mountReport } from '../ai.js';
import { md } from '../md.js';
import { hbars } from '../charts.js';

const SUBS = [
  ['positions', ['职位需求', 'Job requisitions']],
  ['pipeline', ['候选人看板', 'Pipeline']],
  ['screen', ['简历智能筛选', 'Resume screening']],
  ['interview', ['结构化面试', 'Interview kit']],
  ['jd', ['JD 生成器', 'JD builder']],
];

export default async function recruit(el, ctx) {
  const sub = SUBS.some(([k]) => k === ctx.sub) ? ctx.sub : 'positions';
  const d = await load('positions', 'candidates', 'departments', 'employees');
  const head = html`${pageHead(L('智能招聘', 'Recruitment'), L('从职位需求、简历筛选、结构化面试到录用入职的全流程工具，评分逻辑透明可追溯。', 'End-to-end hiring tools, from requisition and screening to structured interviews and onboarding, with transparent scoring.'))}
    ${tabs(SUBS.map(([k, n]) => [k, tx(n), k === 'pipeline' ? d.candidates.filter((c) => !['hired', 'rejected'].includes(c.stage)).length : k === 'positions' ? d.positions.filter((p) => p.status === 'open').length : 0]), sub, (k) => `#/recruit/${k}`)}`;
  const body = document.createElement('div');
  setHTML(el, head);
  el.appendChild(body);
  const views = { positions: positionsView, pipeline: pipelineView, screen: screenView, interview: interviewView, jd: jdView };
  await views[sub](body, ctx, d);
}

// ------------------------------------------------------------------ shared helpers
const tierTone = (score) => TIERS[Object.entries(TIERS).find(([, t]) => score >= t.min)[0]].tone;
const stageBadge = (s) => badge(tx(STAGES[s] || [s, s]), { applied: '', screen: 'info', interview: 'info', offer: 'warn', hired: 'ok', rejected: '' }[s]);
const statusBadge = (s) => badge(tx(POSITION_STATUS[s][0]), POSITION_STATUS[s][1]);
const deptName = (d, id) => loc(d.departments.find((x) => x.id === id));
const analyze = (c, pos) => {
  const parsed = parseResume(c.resume || '');
  return { parsed, match: matchCandidate(parsed, pos || {}, lang()) };
};

function skillPicker(name, selected = []) {
  const set = new Set(selected);
  const groups = Object.keys(SKILL_FAMILIES).map((fam) => [fam, SKILLS.filter((s) => s.family === fam)]);
  return html`<div class="chips-input" data-chips="${name}" style="flex-direction:column;gap:4px"><input type="hidden" name="${name}" value="${[...set].join(',')}">
    ${groups.map(([fam, skills]) => html`<details ${skills.some((s) => set.has(s.key)) ? 'open' : ''}><summary class="small muted" style="cursor:pointer">${tx(SKILL_FAMILIES[fam])}${skills.filter((s) => set.has(s.key)).length ? ` · ${skills.filter((s) => set.has(s.key)).length}` : ''}</summary>
      <div class="chips-input" style="padding:6px 0">${skills.map((s) => html`<button type="button" class="chip-toggle ${set.has(s.key) ? 'on' : ''}" data-v="${s.key}" aria-pressed="${set.has(s.key) ? 'true' : 'false'}">${tx(s.label)}</button>`)}</div></details>`)}
  </div>`;
}

function positionForm(p, d, onSaved) {
  const isNew = !p.id;
  const managers = d.employees.filter((e) => e.status !== 'left' && (e.level.startsWith('M') || Number(e.level.slice(1)) >= 6));
  modal({
    title: isNew ? L('新建职位需求', 'New job requisition') : L('编辑职位需求', 'Edit job requisition'),
    wide: true,
    body: html`<div class="form-grid cols-3">
      ${field(L('职位名称', 'Job title'), input('title', { value: p.title, required: true, placeholder: L('如：高级前端工程师', 'e.g. Senior Frontend Engineer') }))}
      ${field(L('英文名称（可选）', 'English title (optional)'), input('titleEn', { value: p.titleEn }))}
      ${field(L('所属部门', 'Department'), select('deptId', d.departments.map((x) => [x.id, loc(x)]), { value: p.deptId, required: true }))}
      ${field(L('职级', 'Level'), select('level', LEVELS.map((l) => [l, l]), { value: p.level || 'P5' }))}
      ${field(L('招聘人数', 'Headcount'), input('headcount', { type: 'number', min: 1, max: 50, value: p.headcount || 1 }))}
      ${field(L('优先级', 'Priority'), select('priority', Object.entries(PRIORITY).map(([k, v]) => [k, tx(v[0])]), { value: p.priority || 'medium' }))}
      ${field(L('最低工作年限', 'Minimum years'), input('minYears', { type: 'number', min: 0, max: 30, value: p.minYears ?? 3 }))}
      ${field(L('最低学历', 'Minimum education'), select('education', EDUCATION.map((e) => [e.level, e.level ? tx(e.name) : L('不限', 'Any')]), { value: p.education ?? 3 }))}
      ${field(L('工作地点', 'Location'), select('location', Object.entries(LOCATIONS).map(([k, v]) => [k, tx(v)]), { value: p.location || 'sh' }))}
      ${field(L('月薪下限（千元）', 'Monthly pay min (k RMB)'), input('salaryMin', { type: 'number', min: 0, value: p.salaryMin }))}
      ${field(L('月薪上限（千元）', 'Monthly pay max (k RMB)'), input('salaryMax', { type: 'number', min: 0, value: p.salaryMax }))}
      ${field(L('用人经理', 'Hiring manager'), select('hiringManagerId', managers.map((e) => [e.id, `${personName(e)} · ${loc(e, 'title')}`]), { value: p.hiringManagerId }))}
      ${field(L('必备技能', 'Required skills'), skillPicker('skills', p.skills), { span: true, group: true, hint: L('用于简历匹配的核心技能（权重 45%）', 'Core skills used for resume matching (45% weight)') })}
      ${field(L('加分技能', 'Nice-to-have skills'), skillPicker('niceSkills', p.niceSkills), { span: true, group: true })}
      ${field(L('状态', 'Status'), select('status', Object.entries(POSITION_STATUS).map(([k, v]) => [k, tx(v[0])]), { value: p.status || 'open' }))}
    </div>`,
    onSubmit: async (v) => {
      if (!v.title.trim()) throw new Error(L('请填写职位名称', 'Job title is required'));
      const doc = {
        title: v.title.trim(), titleEn: v.titleEn.trim() || v.title.trim(), deptId: v.deptId, level: v.level, headcount: Number(v.headcount) || 1,
        priority: v.priority, minYears: Number(v.minYears) || 0, maxYears: (Number(v.minYears) || 0) + 6, education: Number(v.education) || 0,
        location: v.location, salaryMin: Number(v.salaryMin) || null, salaryMax: Number(v.salaryMax) || null, hiringManagerId: v.hiringManagerId,
        skills: list(v.skills), niceSkills: list(v.niceSkills), status: v.status,
      };
      if (isNew) doc.openedAt = today();
      if (v.status === 'closed' && p.status !== 'closed') doc.closedAt = today();
      const saved = isNew ? await api.post('/api/positions', doc) : await api.put(`/api/positions/${p.id}`, doc);
      toast(L('职位已保存', 'Job saved'));
      onSaved(saved);
    },
  });
}

// ------------------------------------------------------------------ positions
async function positionsView(el, ctx, d) {
  if (ctx.id) return positionDetail(el, ctx, d);
  const filter = ctx.query.status || 'open';
  const rows = d.positions.filter((p) => filter === 'all' || p.status === filter);
  const count = (p, stages) => d.candidates.filter((c) => c.positionId === p.id && stages.includes(c.stage)).length;
  setHTML(el, html`
    <div class="row-between" style="margin-bottom:12px">
      <div class="seg" role="group">${[['open', L('招聘中', 'Open')], ['paused', L('暂停', 'Paused')], ['closed', L('已关闭', 'Closed')], ['all', L('全部', 'All')]].map(([k, n]) => html`<button type="button" class="${filter === k ? 'on' : ''}" data-filter="${k}">${n}</button>`)}</div>
      <button class="btn btn-primary" type="button" data-new>${icon('plus')}${L('新建职位', 'New job')}</button>
    </div>
    <section class="card card-flush">
      ${rows.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>${L('职位', 'Job')}</th><th>${L('部门', 'Department')}</th><th>${L('优先级', 'Priority')}</th><th class="num">${L('人数', 'Hires')}</th><th>${L('管道（投递/面试/Offer）', 'Pipeline (applied/interview/offer)')}</th><th class="num">${L('已开放', 'Open for')}</th><th>${L('用人经理', 'Hiring manager')}</th><th>${L('状态', 'Status')}</th></tr></thead>
        <tbody>${rows.map((p) => {
          const hired = count(p, ['hired']);
          return html`<tr class="clickable" data-href="#/recruit/positions/${p.id}">
            <td><a href="#/recruit/positions/${p.id}"><strong>${loc(p, 'title')}</strong></a><div class="small muted">${p.level} · ${tx(LOCATIONS[p.location] || [p.location, p.location])}${p.salaryMin ? ` · ${p.salaryMin}-${p.salaryMax}k` : ''}</div></td>
            <td>${deptName(d, p.deptId)}</td>
            <td>${badge(tx(PRIORITY[p.priority][0]), PRIORITY[p.priority][1])}</td>
            <td class="num">${hired}/${p.headcount}</td>
            <td><span class="num">${count(p, ['applied', 'screen'])} / ${count(p, ['interview'])} / ${count(p, ['offer'])}</span></td>
            <td class="num">${p.status === 'closed' ? '—' : L(`${daysBetween(p.openedAt || p.createdAt, today())} 天`, `${daysBetween(p.openedAt || p.createdAt, today())} d`)}</td>
            <td>${personName(d.employees.find((e) => e.id === p.hiringManagerId))}</td>
            <td>${statusBadge(p.status)}</td></tr>`;
        })}</tbody></table></div>` : empty(L('没有符合条件的职位', 'No jobs here'), '', 'briefcase')}
    </section>`);
  on(el, 'click', '[data-filter]', (e, b) => { location.hash = `#/recruit/positions?status=${b.dataset.filter}`; });
  on(el, 'click', 'tr[data-href]', (e, tr) => { if (!e.target.closest('a')) location.hash = tr.dataset.href; });
  on(el, 'click', '[data-new]', () => positionForm({}, d, (saved) => { location.hash = `#/recruit/positions/${saved.id}`; }));
}

async function positionDetail(el, ctx, d) {
  const p = d.positions.find((x) => x.id === ctx.id);
  if (!p) return setHTML(el, empty(L('职位不存在', 'Job not found'), '', 'alert'));
  const cands = d.candidates.filter((c) => c.positionId === p.id).map((c) => ({ c, ...analyze(c, p) })).sort((a, b) => b.match.score - a.match.score);
  const active = cands.filter((x) => !['rejected', 'hired'].includes(x.c.stage));
  const funnel = ['applied', 'screen', 'interview', 'offer', 'hired'].map((s, i) => ({ label: tx(STAGES[s]), value: cands.filter((x) => ['applied', 'screen', 'interview', 'offer', 'hired'].indexOf(x.c.stage) >= i || (i === 0 && x.c.stage === 'rejected')).length, cls: `seq-${i + 1}` }));
  const mgr = d.employees.find((e) => e.id === p.hiringManagerId);
  const jdText = p.jd || generateJD({ ...p, title: loc(p, 'title'), dept: deptName(d, p.deptId), location: tx(LOCATIONS[p.location] || ['', '']) }, lang());
  setHTML(el, html`
    <div class="row-between" style="margin-bottom:12px">
      <div><a href="#/recruit/positions" class="small">← ${L('全部职位', 'All jobs')}</a><h2 style="font-size:19px;margin-top:4px">${loc(p, 'title')} ${statusBadge(p.status)}</h2>
        <div class="muted small">${deptName(d, p.deptId)} · ${p.level} · ${tx(LOCATIONS[p.location] || ['', ''])} · ${L(`招聘 ${p.headcount} 人`, `${p.headcount} hire(s)`)}${p.salaryMin ? ` · ${p.salaryMin}-${p.salaryMax}k/${L('月', 'mo')}` : ''}</div></div>
      <div class="row"><a class="btn" href="#/recruit/interview?pos=${p.id}">${icon('message')}${L('面试工具包', 'Interview kit')}</a><a class="btn" href="#/recruit/jd?pos=${p.id}">${icon('file')}${L('编辑 JD', 'Edit JD')}</a><button class="btn" type="button" data-edit>${icon('edit')}${L('编辑', 'Edit')}</button><button class="btn btn-primary" type="button" data-add>${icon('plus')}${L('添加候选人', 'Add candidate')}</button></div>
    </div>
    <div class="split">
      <div class="stack">
        <section class="card card-flush">
          <div class="card-head"><div><h2>${L('候选人排名', 'Ranked candidates')}</h2><p>${L('按简历匹配度排序；点击查看完整评估', 'Sorted by resume fit; click for the full assessment')}</p></div></div>
          ${cands.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>${L('候选人', 'Candidate')}</th><th class="num">${L('匹配度', 'Fit')}</th><th>${L('匹配技能', 'Matched skills')}</th><th>${L('阶段', 'Stage')}</th><th>${L('来源', 'Source')}</th></tr></thead>
            <tbody>${cands.map(({ c, match, parsed }) => html`<tr class="clickable" data-href="#/recruit/pipeline/${c.id}"><td><a href="#/recruit/pipeline/${c.id}"><strong>${personName(c)}</strong></a><div class="small muted">${L(`${parsed.years} 年经验`, `${parsed.years} yrs`)} · ${tx(EDUCATION[parsed.education].name)}</div></td>
              <td class="num"><span class="score ${tierTone(match.score)}">${match.score}</span></td>
              <td>${match.matched.slice(0, 4).map((k) => html`<span class="tag tag-ok">${skillLabel(k, lang())}</span>`)}${match.missing.slice(0, 2).map((k) => html`<span class="tag tag-miss">${skillLabel(k, lang())}</span>`)}</td>
              <td>${stageBadge(c.stage)}</td><td class="small">${tx(SOURCES[c.source] || [c.source, c.source])}</td></tr>`)}</tbody></table></div>` : empty(L('还没有候选人', 'No candidates yet'), L('添加候选人或使用简历筛选工具批量导入。', 'Add candidates or bulk-import with resume screening.'), 'user')}
        </section>
        <section class="card"><div class="card-head"><h2>${L('职位描述', 'Job description')}</h2><span class="badge">${p.jd ? L('已保存', 'Saved') : L('自动生成预览', 'Auto-generated preview')}</span></div>${md(jdText)}</section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-head"><h2>${L('招聘漏斗', 'Funnel')}</h2></div>${hbars(funnel, { head: [L('阶段', 'Stage'), L('人数', 'People')] })}
          <dl class="kv" style="margin-top:12px"><dt>${L('进行中', 'In process')}</dt><dd>${active.length}</dd><dt>${L('已开放', 'Open for')}</dt><dd>${L(`${daysBetween(p.openedAt || p.createdAt, today())} 天`, `${daysBetween(p.openedAt || p.createdAt, today())} days`)}</dd><dt>${L('用人经理', 'Hiring manager')}</dt><dd>${personName(mgr)}</dd></dl></section>
        <section class="card"><div class="card-head"><h2>${L('岗位要求', 'Requirements')}</h2></div>
          <div class="section-title">${L('必备技能', 'Required')}</div><div>${(p.skills || []).map((k) => html`<span class="tag">${skillLabel(k, lang())}</span>`)}</div>
          <div class="section-title">${L('加分技能', 'Nice to have')}</div><div>${(p.niceSkills || []).map((k) => html`<span class="tag">${skillLabel(k, lang())}</span>`)}</div>
          <dl class="kv" style="margin-top:12px"><dt>${L('经验', 'Experience')}</dt><dd>${L(`${p.minYears} 年以上`, `${p.minYears}+ years`)}</dd><dt>${L('学历', 'Education')}</dt><dd>${tx(EDUCATION[p.education || 0].name)}</dd></dl>
        </section>
      </div>
    </div>`);
  on(el, 'click', 'tr[data-href]', (e, tr) => { if (!e.target.closest('a')) location.hash = tr.dataset.href; });
  on(el, 'click', '[data-edit]', () => positionForm(p, d, () => ctx.rerender()));
  on(el, 'click', '[data-add]', () => addCandidate(d, p.id, (c) => { location.hash = `#/recruit/pipeline/${c.id}`; }));
}

function addCandidate(d, positionId, onSaved, preset = {}) {
  modal({
    title: L('添加候选人', 'Add candidate'),
    wide: true,
    body: html`<div class="form-grid">
      ${field(L('姓名', 'Name'), input('name', { value: preset.name, required: true }))}
      ${field(L('应聘职位', 'Job'), select('positionId', d.positions.filter((p) => p.status !== 'closed').map((p) => [p.id, loc(p, 'title')]), { value: positionId }))}
      ${field(L('来源渠道', 'Source'), select('source', Object.entries(SOURCES).map(([k, v]) => [k, tx(v)]), { value: preset.source || 'jobboard' }))}
      ${field(L('邮箱', 'Email'), input('email', { type: 'email', value: preset.email }))}
      ${field(L('简历文本', 'Resume text'), textarea('resume', { rows: 12, value: preset.resume, placeholder: L('粘贴简历全文，系统会自动解析技能、经验与学历', 'Paste the full resume; skills, experience and education are extracted automatically') }), { span: true })}
    </div>`,
    submitLabel: L('添加', 'Add'),
    onSubmit: async (v) => {
      if (!v.name.trim()) throw new Error(L('请填写姓名', 'Name is required'));
      const parsed = parseResume(v.resume);
      const c = await api.post('/api/candidates', {
        name: v.name.trim(), positionId: v.positionId, source: v.source, email: v.email || parsed.email, phone: parsed.phone,
        resume: v.resume, stage: 'applied', appliedAt: today(), stageChangedAt: today(), interviews: [], notes: [],
      });
      toast(L('候选人已添加', 'Candidate added'));
      onSaved(c);
    },
  });
}

// ------------------------------------------------------------------ pipeline (kanban)
async function pipelineView(el, ctx, d) {
  if (ctx.id) return candidateDetail(el, ctx, d);
  const pos = byId(d.positions);
  const posFilter = ctx.query.pos || '';
  const q = (ctx.query.q || '').toLowerCase();
  const cands = d.candidates.filter((c) => (!posFilter || c.positionId === posFilter) && (!q || `${c.name} ${c.nameEn || ''}`.toLowerCase().includes(q)))
    .map((c) => ({ c, match: analyze(c, pos[c.positionId]).match }));
  const card = ({ c, match }) => {
    const ivs = (c.interviews || []).filter((i) => Object.keys(i.scores || {}).length);
    const agg = aggregateScorecards(c.interviews || []);
    const waiting = (c.interviews || []).some((i) => !Object.keys(i.scores || {}).length);
    return html`<article class="cand" draggable="true" data-id="${c.id}" tabindex="0">
      <div class="name"><a href="#/recruit/pipeline/${c.id}">${personName(c)}</a><span class="score ${tierTone(match.score)}" data-tip="${L('简历匹配度', 'Resume fit')}">${match.score}</span></div>
      <div class="sub">${loc(pos[c.positionId], 'title')}</div>
      <div class="foot"><span>${tx(SOURCES[c.source] || [c.source, c.source])} · ${fmt.rel(c.stageChangedAt || c.appliedAt)}</span>
        <span>${ivs.length ? html`<span data-tip="${L('面试平均分', 'Interview average')}">★ ${agg.overall}</span>` : ''}${waiting ? html` <span class="badge badge-warn">${L('待评分', 'Scorecard due')}</span>` : ''}</span></div>
    </article>`;
  };
  setHTML(el, html`
    <div class="row-between" style="margin-bottom:12px">
      <div class="row">
        <select class="input" id="pos-filter" style="width:auto" aria-label="${L('按职位筛选', 'Filter by job')}"><option value="">${L('全部职位', 'All jobs')}</option>${d.positions.filter((p) => p.status !== 'closed').map((p) => html`<option value="${p.id}" ${p.id === posFilter ? 'selected' : ''}>${loc(p, 'title')}</option>`)}</select>
        <input class="input" type="search" id="cand-q" placeholder="${L('搜索候选人', 'Search candidates')}" value="${ctx.query.q || ''}" style="width:200px">
      </div>
      <div class="row"><span class="small muted">${L('拖拽卡片即可推进阶段', 'Drag cards to move stages')}</span><button class="btn btn-primary" type="button" data-add>${icon('plus')}${L('添加候选人', 'Add candidate')}</button></div>
    </div>
    <div class="kanban">${STAGE_ORDER.map((s) => {
      const items = cands.filter((x) => x.c.stage === s).sort((a, b) => b.match.score - a.match.score);
      return html`<section class="lane" data-stage="${s}" aria-label="${tx(STAGES[s])}"><div class="lane-head"><span>${tx(STAGES[s])}</span><span class="badge">${items.length}</span></div>${items.map(card)}</section>`;
    })}</div>`);

  const go = (patch) => {
    const qs = new URLSearchParams({ ...(posFilter && { pos: posFilter }), ...(ctx.query.q && { q: ctx.query.q }), ...patch });
    for (const [k, v] of [...qs]) if (!v) qs.delete(k);
    location.hash = `#/recruit/pipeline${qs.toString() ? `?${qs}` : ''}`;
  };
  el.querySelector('#pos-filter').addEventListener('change', (e) => go({ pos: e.target.value }));
  let t;
  el.querySelector('#cand-q').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => go({ q: e.target.value }), 350);
  });
  on(el, 'click', '[data-add]', () => addCandidate(d, posFilter || d.positions.find((p) => p.status === 'open')?.id, () => ctx.rerender()));
  on(el, 'keydown', '.cand', (e, c) => { if (e.key === 'Enter') location.hash = `#/recruit/pipeline/${c.dataset.id}`; });
  on(el, 'click', '.cand', (e, c) => { if (!e.target.closest('a')) location.hash = `#/recruit/pipeline/${c.dataset.id}`; });
  el.querySelectorAll('.cand').forEach((c) => {
    c.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', c.dataset.id);
      c.classList.add('dragging');
    });
    c.addEventListener('dragend', () => c.classList.remove('dragging'));
  });
  el.querySelectorAll('.lane').forEach((lane) => {
    lane.addEventListener('dragover', (e) => {
      e.preventDefault();
      lane.classList.add('over');
    });
    lane.addEventListener('dragleave', () => lane.classList.remove('over'));
    lane.addEventListener('drop', async (e) => {
      e.preventDefault();
      lane.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      const c = d.candidates.find((x) => x.id === id);
      if (!c || c.stage === lane.dataset.stage) return;
      if (await moveStage(c, lane.dataset.stage, d)) ctx.rerender();
    });
  });
}

// Moves a candidate, asking for the details each stage needs. Returns true when saved.
async function moveStage(c, stage, d) {
  const pos = d.positions.find((p) => p.id === c.positionId);
  const patch = { stage, stageChangedAt: today() };
  if (stage === 'hired' && c.offer) patch.offer = { ...c.offer, status: 'accepted' };
  if (stage === 'rejected') {
    const ok = await new Promise((resolve) => {
      modal({
        title: L('标记为未通过', 'Mark as not selected'),
        body: html`${field(L('原因', 'Reason'), select('reason', Object.entries(REJECT_REASONS).map(([k, v]) => [k, tx(v)])))}
          <p class="small muted" style="margin-top:10px">${L('建议在 3 个工作日内礼貌告知候选人，并将其保留在人才库中。', 'Let the candidate know politely within 3 working days, and keep them in the talent pool.')}</p>`,
        submitLabel: L('确认', 'Confirm'),
        onSubmit: (v) => { patch.rejectReason = v.reason; resolve(true); },
        onClose: () => resolve(false),
      });
    });
    if (!ok) return false;
  }
  if (stage === 'offer') {
    const ok = await new Promise((resolve) => {
      modal({
        title: L('发放 Offer', 'Make an offer'),
        body: html`<div class="form-grid">${field(L('月薪（元）', 'Monthly salary (RMB)'), input('salary', { type: 'number', min: 0, value: pos?.salaryMin ? Math.round(((pos.salaryMin + pos.salaryMax) / 2) * 1000) : '' }), { hint: pos?.salaryMin ? L(`预算区间 ${pos.salaryMin}-${pos.salaryMax}k`, `Budget ${pos.salaryMin}-${pos.salaryMax}k`) : '' })}
          ${field(L('预计入职日期', 'Start date'), input('startDate', { type: 'date', value: today() }))}</div>`,
        submitLabel: L('确认', 'Confirm'),
        onSubmit: (v) => {
          const sal = Number(v.salary) || null;
          if (sal && pos?.salaryMax && sal > pos.salaryMax * 1000) toast(L('注意：薪资超出预算上限，需额外审批', 'Note: above the budget ceiling; extra approval needed'), 'error');
          patch.offer = { salary: sal, startDate: v.startDate, status: 'sent' };
          resolve(true);
        },
        onClose: () => resolve(false),
      });
    });
    if (!ok) return false;
  }
  await act(null, () => api.put(`/api/candidates/${c.id}`, patch), L(`已移动到「${tx(STAGES[stage])}」`, `Moved to ${tx(STAGES[stage])}`));
  if (stage === 'hired' && pos) {
    const yes = await confirmDialog(L(`是否同时为 ${personName(c)} 创建员工档案和入职计划？`, `Also create an employee record and onboarding plan for ${personName(c)}?`), { title: L('录用成功', 'Hired'), confirmLabel: L('创建', 'Create') });
    if (yes) await createEmployeeFromCandidate(c, pos);
    const hiredCount = d.candidates.filter((x) => x.positionId === pos.id && (x.stage === 'hired' || x.id === c.id)).length;
    if (hiredCount >= pos.headcount && pos.status === 'open' && await confirmDialog(L('该职位招聘人数已满，是否关闭职位？', 'All openings are filled. Close the job?'), { confirmLabel: L('关闭职位', 'Close job') })) {
      await api.put(`/api/positions/${pos.id}`, { status: 'closed', closedAt: today() });
    }
  }
  return true;
}

async function createEmployeeFromCandidate(c, pos) {
  const parsed = parseResume(c.resume || '');
  const start = c.offer?.startDate || today();
  const emp = await api.post('/api/employees', {
    name: c.name, nameEn: c.nameEn || c.name, email: c.email || '', deptId: pos.deptId, title: pos.title, titleEn: pos.titleEn, level: pos.level,
    managerId: pos.hiringManagerId, location: pos.location, hireDate: start, status: 'active', skills: parsed.skills.slice(0, 8),
    // No ratings yet: competencies stay unassessed until the manager assesses them.
    performance: 3, potential: 2, perfHistory: [], competencies: null,
    lastPromotion: start, compaRatio: c.offer?.salary && pos.salaryMin ? Math.round((c.offer.salary / (((pos.salaryMin + pos.salaryMax) / 2) * 1000)) * 100) / 100 : 1, engagement: 4, fromCandidateId: c.id,
  });
  await api.post('/api/onboarding', { employeeId: emp.id, startDate: start, tasks: buildChecklist(start, { manager: pos.level.startsWith('M') }) });
  toast(L('已创建员工档案与入职计划', 'Employee record and onboarding plan created'));
}

async function candidateDetail(el, ctx, d) {
  const c = d.candidates.find((x) => x.id === ctx.id);
  if (!c) return setHTML(el, empty(L('候选人不存在', 'Candidate not found'), '', 'alert'));
  const pos = d.positions.find((p) => p.id === c.positionId) || {};
  const emp = byId(d.employees);
  const { parsed, match } = analyze(c, pos);
  const plan = planInterview(pos);
  const agg = aggregateScorecards(c.interviews || []);
  const nextStages = STAGE_ORDER.filter((s) => s !== c.stage);
  const partName = { required: L('必备技能', 'Required skills'), nice: L('加分技能', 'Nice-to-have'), experience: L('工作经验', 'Experience'), education: L('学历', 'Education'), bonus: L('附加项', 'Bonus evidence') };

  setHTML(el, html`
    <div class="row-between" style="margin-bottom:12px">
      <div class="row">${avatar(c, 'md')}<div><a href="#/recruit/pipeline${pos.id ? `?pos=${pos.id}` : ''}" class="small">← ${L('候选人看板', 'Pipeline')}</a>
        <h2 style="font-size:19px">${personName(c)} ${stageBadge(c.stage)}</h2>
        <div class="small muted">${L('应聘', 'Applying for')} <a href="#/recruit/positions/${pos.id}">${loc(pos, 'title')}</a> · ${tx(SOURCES[c.source] || [c.source, c.source])} · ${L('投递于', 'Applied')} ${fmt.date(c.appliedAt)}${c.email ? ` · ${c.email}` : ''}${c.phone ? ` · ${c.phone}` : ''}</div></div></div>
      <div class="row"><label class="small muted" for="move">${L('移动到', 'Move to')}</label><select class="input" id="move" style="width:auto"><option value="">—</option>${nextStages.map((s) => html`<option value="${s}">${tx(STAGES[s])}</option>`)}</select>
        <button class="btn btn-primary" type="button" data-score>${icon('star')}${L('填写面试评分', 'Add scorecard')}</button></div>
    </div>
    ${c.stage === 'rejected' && c.rejectReason ? callout('info', L(`未通过原因：${tx(REJECT_REASONS[c.rejectReason] || [c.rejectReason])}`, `Reason: ${tx(REJECT_REASONS[c.rejectReason] || [c.rejectReason, c.rejectReason])}`)) : ''}
    ${c.offer ? callout('brand', L(`Offer：月薪 ${fmt.money(c.offer.salary)}，入职日期 ${fmt.date(c.offer.startDate)}`, `Offer: ${fmt.money(c.offer.salary)} per month, starting ${fmt.date(c.offer.startDate)}`)) : ''}
    <div class="split" style="margin-top:12px">
      <div class="stack">
        <section class="card">
          <div class="card-head"><div><h2>${L('简历匹配分析', 'Resume fit analysis')}</h2><p>${L('每一分都可追溯到简历证据；年龄、性别、院校背景不计分', 'Every point traces to resume evidence; age, gender and school prestige never score')}</p></div>${badge(tx(TIERS[match.tier].name), TIERS[match.tier].tone)}</div>
          <div class="row" style="gap:20px;align-items:flex-start">
            ${scoreRing(match.score, TIERS[match.tier].tone === 'danger' ? 'danger' : TIERS[match.tier].tone === 'warn' ? 'warn' : TIERS[match.tier].tone === 'ok' ? 'ok' : 'brand')}
            <div style="flex:1;min-width:220px">${Object.entries(match.parts).map(([k, v]) => html`<div class="hbar-row"><span class="hbar-label">${partName[k]}</span><span class="hbar-track"><span style="flex:1">${meter(v, WEIGHTS[k], v / WEIGHTS[k] >= 0.8 ? 'ok' : v / WEIGHTS[k] >= 0.5 ? 'info' : 'warn')}</span><span class="hbar-value">${Math.round(v)}/${WEIGHTS[k]}</span></span></div>`)}</div>
          </div>
          <div class="section-title">${L('技能匹配', 'Skills')}</div>
          <div>${match.matched.map((k) => html`<span class="tag tag-ok">✓ ${skillLabel(k, lang())}</span>`)}${match.missing.map((k) => html`<span class="tag tag-miss">${skillLabel(k, lang())}</span>`)}${match.niceMatched.map((k) => html`<span class="tag">+ ${skillLabel(k, lang())}</span>`)}</div>
          <div class="grid cols-2" style="margin-top:12px">
            <div><div class="section-title">${L('亮点', 'Highlights')}</div>${match.highlights.length ? html`<ul style="margin:0;padding-left:18px">${match.highlights.map((h) => html`<li>${h}</li>`)}</ul>` : html`<p class="muted">—</p>`}</div>
            <div><div class="section-title">${L('风险与待核实', 'Risks to verify')}</div>${match.risks.length ? html`<ul style="margin:0;padding-left:18px">${match.risks.map((r) => html`<li>${badge(r.level === 'high' ? L('高', 'High') : r.level === 'medium' ? L('中', 'Med') : L('低', 'Low'), r.level === 'high' ? 'danger' : r.level === 'medium' ? 'warn' : '')} ${r.text}</li>`)}</ul>` : html`<p class="muted">—</p>`}</div>
          </div>
          <div class="section-title">${L('建议追问', 'Suggested interview probes')}</div>
          <ol style="margin:0;padding-left:20px">${match.probes.map((p) => html`<li>${p}</li>`)}</ol>
        </section>
        <div id="ai-resume"></div>
        <section class="card">
          <div class="card-head"><div><h2>${L('面试评估汇总', 'Interview evaluation')}</h2><p>${L('多位面试官独立评分后自动汇总，分歧大的能力需校准讨论', 'Independent scorecards combined; competencies with wide disagreement need calibration')}</p></div>
            ${agg.decision ? badge(tx(DECISIONS[agg.decision].name), DECISIONS[agg.decision].tone) : ''}</div>
          ${(c.interviews || []).length ? html`
            <div class="table-wrap"><table class="table table-compact"><thead><tr><th>${L('能力', 'Competency')}</th>${c.interviews.map((i) => html`<th class="num">${tx(ROUNDS.find((r) => r.key === i.round)?.name || [i.round, i.round])}<div class="small muted">${personName(emp[i.interviewerId])}</div></th>`)}<th class="num">${L('均分', 'Mean')}</th></tr></thead>
              <tbody>${Object.entries(agg.comps).map(([k, s]) => html`<tr><td>${tx(compByKey[k].name)}${agg.disagreements.includes(k) ? html` <span class="badge badge-warn">${L('分歧大', 'Split')}</span>` : ''}</td>${c.interviews.map((i) => html`<td class="num">${i.scores?.[k] ?? '—'}</td>`)}<td class="num"><strong>${s.mean}</strong></td></tr>`)}
                <tr><td>${L('录用建议', 'Recommendation')}</td>${c.interviews.map((i) => html`<td class="num">${i.recommendation ? badge(tx(RECOMMENDATIONS[i.recommendation].name), RECOMMENDATIONS[i.recommendation].tone) : html`<span class="badge badge-warn">${L('待提交', 'Pending')}</span>`}</td>`)}<td class="num"><strong>${agg.overall ?? '—'}</strong></td></tr></tbody></table></div>
            ${c.interviews.filter((i) => i.notes).map((i) => html`<p class="small" style="margin-top:8px"><strong>${personName(emp[i.interviewerId])}：</strong>${i.notes}</p>`)}`
            : empty(L('还没有面试评分', 'No scorecards yet'), L('建议按面试计划安排 2-3 轮结构化面试。', 'Plan 2-3 structured interview rounds.'), 'star')}
        </section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-head"><h2>${L('解析结果', 'Parsed profile')}</h2></div>
          <dl class="kv"><dt>${L('工作年限', 'Experience')}</dt><dd>${L(`约 ${parsed.years} 年`, `~${parsed.years} years`)}${parsed.jobs ? L(`（${parsed.jobs} 段经历）`, ` (${parsed.jobs} roles)`) : ''}</dd>
            <dt>${L('学历', 'Education')}</dt><dd>${tx(EDUCATION[parsed.education].name)}</dd>
            <dt>${L('证书', 'Certificates')}</dt><dd>${parsed.certs.join('、') || '—'}</dd>
            <dt>${L('管理经验', 'Management')}</dt><dd>${parsed.management ? L(`有${parsed.teamSize ? `（${parsed.teamSize} 人）` : ''}`, `Yes${parsed.teamSize ? ` (${parsed.teamSize})` : ''}`) : L('未体现', 'Not shown')}</dd></dl>
          <div class="section-title">${L('简历原文', 'Resume')}</div><div class="resume-box">${c.resume || L('（无简历文本）', '(no resume text)')}</div></section>
        <section class="card"><div class="card-head"><h2>${L('协作备注', 'Team notes')}</h2></div>
          <div class="timeline">${(c.notes || []).map((n) => html`<div class="timeline-item">${avatar(emp[n.by] || { name: '?' }, 'xs')}<div><strong>${personName(emp[n.by])}</strong> <time>${fmt.stamp(n.at)}</time><div>${n.text}</div></div></div>`)}</div>
          <form id="note-form" class="row" style="margin-top:8px"><input class="input" name="text" placeholder="${L('写下你的观察，团队成员都能看到', 'Share an observation with the hiring team')}" style="flex:1" maxlength="500"><button class="btn" type="submit">${icon('send')}</button></form></section>
        <section class="card"><div class="card-head"><h2>${L('面试计划', 'Interview plan')}</h2><a class="btn btn-sm" href="#/recruit/interview?pos=${pos.id}">${L('完整题库', 'Full guide')}</a></div>
          ${ROUNDS.map((r) => html`<div class="list-item"><div class="grow"><div class="title">${tx(r.name)}</div><div class="meta">${plan.byRound[r.key].map((k) => tx(compByKey[k].name)).join(' · ') || '—'}</div></div>${(c.interviews || []).some((i) => i.round === r.key && Object.keys(i.scores || {}).length) ? badge(L('已完成', 'Done'), 'ok') : ''}</div>`)}</section>
      </div>
    </div>`);

  mountReport(el.querySelector('#ai-resume'), {
    title: L('候选人评估报告', 'Candidate assessment'),
    ruleMd: [
      `**${L('结论', 'Verdict')}：** ${tx(TIERS[match.tier].name)}（${match.score}/100）— ${tx(TIERS[match.tier].next)}`,
      '',
      `**${L('亮点', 'Highlights')}**`, ...match.highlights.map((h) => `- ${h}`),
      '',
      `**${L('风险', 'Risks')}**`, ...(match.risks.length ? match.risks.map((r) => `- ${r.text}`) : ['- —']),
      '',
      `**${L('面试重点', 'Interview focus')}**`, ...match.probes.map((p, i) => `${i + 1}. ${p}`),
    ].join('\n'),
    task: 'resume',
    input: () => ({ position: { title: pos.title, level: pos.level, skills: (pos.skills || []).map((k) => skillLabel(k, 'en')), niceSkills: (pos.niceSkills || []).map((k) => skillLabel(k, 'en')), minYears: pos.minYears }, analysis: { score: match.score, tier: match.tier, matched: match.matched, missing: match.missing, risks: match.risks.map((r) => r.text), years: parsed.years }, resume: c.resume }),
  });

  el.querySelector('#move').addEventListener('change', async (e) => {
    const s = e.target.value;
    if (!s) return;
    if (await moveStage(c, s, d)) ctx.rerender();
    else e.target.value = '';
  });
  el.querySelector('#note-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = e.target.text.value.trim();
    if (!text) return;
    const notes = [...(c.notes || []), { by: getActor(), at: nowStamp(), text }];
    await act(null, () => api.put(`/api/candidates/${c.id}`, { notes }), L('备注已添加', 'Note added'));
    ctx.rerender();
  });
  on(el, 'click', '[data-score]', () => scorecardForm(c, pos, plan, d, () => ctx.rerender()));
}

function scorecardForm(c, pos, plan, d, onSaved) {
  const pending = (c.interviews || []).find((i) => !Object.keys(i.scores || {}).length && i.interviewerId === getActor());
  const interviewers = d.employees.filter((e) => e.status !== 'left');
  const comps = [...new Set([...plan.focus, 'learning', 'collaboration'])].slice(0, 6);
  modal({
    title: L(`面试评分表 · ${personName(c)}`, `Scorecard · ${personName(c)}`),
    wide: true,
    body: html`
      ${callout('brand', L('请依据候选人讲述的具体行为证据（STAR）评分，而不是整体印象。1 = 明显不足，3 = 符合岗位要求，5 = 远超要求。', 'Score on concrete behavioral evidence (STAR), not overall impressions. 1 = clearly below, 3 = meets the role, 5 = far exceeds.'))}
      <div class="form-grid cols-3" style="margin-top:12px">
        ${field(L('面试轮次', 'Round'), select('round', ROUNDS.map((r) => [r.key, tx(r.name)]), { value: pending?.round || 'r1' }))}
        ${field(L('面试官', 'Interviewer'), select('interviewerId', interviewers.map((e) => [e.id, personName(e)]), { value: getActor() }))}
        ${field(L('面试日期', 'Date'), input('date', { type: 'date', value: today() }))}
      </div>
      ${comps.map((k) => html`<div class="q-block"><p>${tx(compByKey[k].name)} <span class="small muted">— ${tx(compByKey[k].def)}</span></p>${likert(`s_${k}`)}
        <div class="small muted" style="margin-top:6px">1：${tx(compByKey[k].anchors[1])}　3：${tx(compByKey[k].anchors[3])}　5：${tx(compByKey[k].anchors[5])}</div></div>`)}
      <div class="q-block"><p>${L('录用建议', 'Recommendation')}</p><div class="row">${Object.entries(RECOMMENDATIONS).map(([k, r]) => html`<label class="check"><input type="radio" name="recommendation" value="${k}"><span>${tx(r.name)}</span></label>`)}</div></div>
      ${field(L('评语（关键证据）', 'Notes (key evidence)'), textarea('notes', { rows: 3 }), { span: true })}`,
    submitLabel: L('提交评分', 'Submit scorecard'),
    onSubmit: async (v) => {
      const scores = {};
      for (const k of comps) if (v[`s_${k}`]) scores[k] = Number(v[`s_${k}`]);
      if (Object.keys(scores).length < comps.length) throw new Error(L('请为每项能力评分', 'Please score every competency'));
      if (!v.recommendation) throw new Error(L('请选择录用建议', 'Please choose a recommendation'));
      const entry = { id: `iv${Date.now().toString(36)}`, round: v.round, interviewerId: v.interviewerId, date: v.date, scores, recommendation: v.recommendation, notes: v.notes.trim() };
      const others = (c.interviews || []).filter((i) => i !== pending);
      const patch = { interviews: [...others, entry] };
      if (c.stage === 'applied' || c.stage === 'screen') Object.assign(patch, { stage: 'interview', stageChangedAt: today() });
      await api.put(`/api/candidates/${c.id}`, patch);
      toast(L('评分已提交', 'Scorecard submitted'));
      onSaved();
    },
  });
}

// ------------------------------------------------------------------ batch resume screening
async function screenView(el, ctx, d) {
  const open = d.positions.filter((p) => p.status !== 'closed');
  let posId = ctx.query.pos || open[0]?.id;
  setHTML(el, html`
    <div class="split-wide">
      <section class="card sticky">
        <div class="card-head"><h2>${L('批量筛选简历', 'Screen resumes in bulk')}</h2></div>
        <form id="screen-form" class="stack" style="gap:12px">
          ${field(L('目标职位', 'Target job'), select('pos', open.map((p) => [p.id, loc(p, 'title')]), { value: posId }))}
          ${field(L('简历文本', 'Resume text'), textarea('text', { rows: 12, placeholder: L('粘贴一份或多份简历；多份之间用单独一行 --- 分隔', 'Paste one or more resumes; separate them with a line containing ---') }), { hint: L('也可以导入 .txt / .md 文件（可多选）', 'Or import .txt / .md files (multiple allowed)') })}
          <input type="file" id="files" accept=".txt,.md,text/plain" multiple class="small">
          <div class="row"><button class="btn btn-primary" type="submit">${icon('search')}${L('开始筛选', 'Screen')}</button><button class="btn" type="button" data-sample>${L('载入示例简历', 'Load sample resumes')}</button></div>
        </form>
        <div style="margin-top:14px">${method(L('评分方法：', 'How scoring works:'), L(`必备技能 ${WEIGHTS.required}% · 加分技能 ${WEIGHTS.nice}% · 经验 ${WEIGHTS.experience}% · 学历 ${WEIGHTS.education}% · 证书/量化成果/稳定性 ${WEIGHTS.bonus}%。院校、年龄、性别等与岗位无关的信息不计分，以减少筛选偏见。`, `Required skills ${WEIGHTS.required}% · nice-to-have ${WEIGHTS.nice}% · experience ${WEIGHTS.experience}% · education ${WEIGHTS.education}% · certificates, quantified results and stability ${WEIGHTS.bonus}%. School, age, gender and other job-irrelevant data never score, to reduce screening bias.`))}</div>
      </section>
      <section id="screen-results">${empty(L('结果将显示在这里', 'Results appear here'), L('选择职位并粘贴简历，系统将自动解析并排序。', 'Pick a job and paste resumes to parse and rank them.'), 'file')}</section>
    </div>`);
  const form = el.querySelector('#screen-form');
  const results = el.querySelector('#screen-results');
  let last = [];
  el.querySelector('#files').addEventListener('change', async (e) => {
    const texts = await Promise.all([...e.target.files].map((f) => f.text()));
    form.text.value = [form.text.value.trim(), ...texts].filter(Boolean).join('\n---\n');
  });
  on(el, 'click', '[data-sample]', () => {
    const pos = d.positions.find((p) => p.id === form.pos.value);
    const samples = d.candidates.filter((c) => c.positionId === pos?.id).slice(0, 4).map((c) => c.resume);
    form.text.value = (samples.length ? samples : d.candidates.slice(0, 3).map((c) => c.resume)).join('\n---\n');
  });
  const run = () => {
    posId = form.pos.value;
    const pos = d.positions.find((p) => p.id === posId);
    const docs = form.text.value.split(/\n\s*-{3,}\s*\n/).map((s) => s.trim()).filter((s) => s.length > 20);
    if (!docs.length) {
      toast(L('请粘贴至少一份简历', 'Paste at least one resume'), 'error');
      return;
    }
    last = docs.map((text, i) => {
      const parsed = parseResume(text);
      return { i, text, parsed, match: matchCandidate(parsed, pos, lang()) };
    }).sort((a, b) => b.match.score - a.match.score);
    setHTML(results, html`<section class="card card-flush"><div class="card-head"><div><h2>${L(`筛选结果（${last.length} 份）`, `Results (${last.length})`)}</h2><p>${loc(pos, 'title')} · ${L('按匹配度排序', 'ranked by fit')}</p></div>
        <button class="btn btn-sm" type="button" data-export>${icon('download')}${L('导出 CSV', 'Export CSV')}</button></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>${L('候选人', 'Candidate')}</th><th class="num">${L('匹配度', 'Fit')}</th><th>${L('结论', 'Verdict')}</th><th>${L('关键发现', 'Key findings')}</th><th></th></tr></thead>
      <tbody>${last.map((r, n) => html`<tr><td class="num">${n + 1}</td><td><strong>${r.parsed.name || L(`简历 ${r.i + 1}`, `Resume ${r.i + 1}`)}</strong><div class="small muted">${L(`${r.parsed.years} 年`, `${r.parsed.years} yrs`)} · ${tx(EDUCATION[r.parsed.education].name)}</div></td>
        <td class="num"><span class="score ${TIERS[r.match.tier].tone}">${r.match.score}</span></td><td>${badge(tx(TIERS[r.match.tier].name), TIERS[r.match.tier].tone)}</td>
        <td class="small">${r.match.matched.map((k) => html`<span class="tag tag-ok">${skillLabel(k, lang())}</span>`)}${r.match.missing.map((k) => html`<span class="tag tag-miss">${skillLabel(k, lang())}</span>`)}${r.match.risks.filter((x) => x.level !== 'low').slice(0, 2).map((x) => html`<div class="muted">⚠ ${x.text}</div>`)}</td>
        <td><button class="btn btn-sm" type="button" data-import="${n}">${L('加入管道', 'Add to pipeline')}</button></td></tr>`)}</tbody></table></div></section>`);
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run();
  });
  on(results, 'click', '[data-import]', (e, b) => {
    const r = last[Number(b.dataset.import)];
    addCandidate(d, posId, () => { b.disabled = true; b.textContent = L('已加入', 'Added'); }, { name: r.parsed.name || '', email: r.parsed.email || '', resume: r.text });
  });
  on(results, 'click', '[data-export]', () => {
    const rows = [[L('排名', 'Rank'), L('姓名', 'Name'), L('匹配度', 'Fit'), L('结论', 'Verdict'), L('年限', 'Years'), L('学历', 'Education'), L('匹配技能', 'Matched'), L('缺失技能', 'Missing')],
      ...last.map((r, n) => [n + 1, r.parsed.name || '', r.match.score, tx(TIERS[r.match.tier].name), r.parsed.years, tx(EDUCATION[r.parsed.education].name), r.match.matched.map((k) => skillLabel(k, lang())).join('/'), r.match.missing.map((k) => skillLabel(k, lang())).join('/')])];
    const csv = rows.map((row) => row.map((v) => {
      let s = String(v ?? '');
      if (/^[=+\-@]/.test(s)) s = `'${s}`; // guard against spreadsheet formula injection
      return `"${s.replace(/"/g, '""')}"`;
    }).join(',')).join('\n');
    download(`screening-${today()}.csv`, `﻿${csv}`, 'text/csv;charset=utf-8');
  });
}

// ------------------------------------------------------------------ interview kit
async function interviewView(el, ctx, d) {
  const open = d.positions.filter((p) => p.status !== 'closed');
  const pos = d.positions.find((p) => p.id === ctx.query.pos) || open[0];
  const plan = planInterview(pos || {});
  setHTML(el, html`
    <div class="row-between no-print" style="margin-bottom:12px">
      <div class="row"><label class="small muted" for="kit-pos">${L('职位', 'Job')}</label><select class="input" id="kit-pos" style="width:auto">${d.positions.map((p) => html`<option value="${p.id}" ${p.id === pos?.id ? 'selected' : ''}>${loc(p, 'title')}</option>`)}</select></div>
      <button class="btn" type="button" data-print>${icon('printer')}${L('打印面试指南', 'Print guide')}</button>
    </div>
    <div class="split">
      <div class="stack">
        <section class="card">
          <div class="card-head"><div><h2>${L('结构化面试指南', 'Structured interview guide')} · ${loc(pos, 'title')}</h2><p>${L(`岗位序列：${tx(FAMILIES[plan.family].name)} · 职级 ${pos?.level}`, `Job family: ${tx(FAMILIES[plan.family].name)} · Level ${pos?.level}`)}</p></div></div>
          ${plan.focus.map((k, idx) => html`<div class="q-block">
            <h3 style="font-size:15px">${idx + 1}. ${tx(compByKey[k].name)} <span class="badge">${tx(ROUNDS.find((r) => plan.byRound[r.key].includes(k)).name)}</span></h3>
            <p class="small muted" style="font-weight:400">${tx(compByKey[k].def)}</p>
            ${plan.questions[k].map((q) => html`<div style="margin:10px 0 0 4px">
              <div><strong>Q：</strong>${tx(q.q)}</div>
              <div class="small" style="margin-top:4px"><span class="badge badge-ok">${L('好的回答', 'Strong answer')}</span> ${tx(q.good)}</div>
              <div class="small" style="margin-top:4px"><span class="badge badge-danger">${L('警示信号', 'Red flag')}</span> ${tx(q.red)}</div></div>`)}
          </div>`)}
        </section>
        <div id="ai-interview"></div>
      </div>
      <div class="stack">
        <section class="card"><div class="card-head"><h2>${L('面试流程（55 分钟）', 'Agenda (55 minutes)')}</h2></div>
          ${plan.agenda.map((a) => html`<div class="list-item"><span class="badge">${a.min} min</span><div class="grow">${tx(a.text)}</div></div>`)}</section>
        <section class="card"><div class="card-head"><h2>${L('STAR 追问法', 'STAR probing')}</h2></div>${STAR_PROBES.map((p) => html`<p class="small">${tx(p)}</p>`)}
          ${method(L('原则：', 'Rule:'), L('问过去的真实行为而非假设；追问"你"做了什么而非"我们"；每题至少追问到结果。', 'Ask about real past behavior, not hypotheticals; probe for "I", not "we"; always get to the result.'))}</section>
        <section class="card"><div class="card-head"><h2>${L('轮次分工', 'Who covers what')}</h2></div>
          ${ROUNDS.map((r) => html`<div class="list-item"><div class="grow"><div class="title">${tx(r.name)}</div><div class="meta">${tx(r.who)} · ${plan.byRound[r.key].map((k) => tx(compByKey[k].name)).join('、') || '—'}</div></div></div>`)}</section>
        <section class="card"><div class="card-head"><h2>${L('评分锚点（BARS）', 'Rating anchors (BARS)')}</h2></div>
          ${plan.focus.slice(0, 3).map((k) => html`<div class="section-title">${tx(compByKey[k].name)}</div><div class="small">1 · ${tx(compByKey[k].anchors[1])}<br>3 · ${tx(compByKey[k].anchors[3])}<br>5 · ${tx(compByKey[k].anchors[5])}</div>`)}</section>
      </div>
    </div>`);
  el.querySelector('#kit-pos').addEventListener('change', (e) => { location.hash = `#/recruit/interview?pos=${e.target.value}`; });
  on(el, 'click', '[data-print]', () => window.print());
  mountReport(el.querySelector('#ai-interview'), {
    title: L('定制面试题', 'Tailored questions'),
    ruleMd: L('上方题目来自内置题库（每项能力 3 题）。点击「AI 深度分析」可基于岗位要求生成更有针对性的问题与追问。', 'The questions above come from the built-in bank (3 per competency). Use AI analysis to tailor questions and probes to this role.'),
    task: 'interview',
    aiLabel: L('AI 定制题目', 'Tailor with AI'),
    input: () => ({ title: pos?.title, level: pos?.level, skills: (pos?.skills || []).map((k) => skillLabel(k, 'en')), focusCompetencies: plan.focus.map((k) => compByKey[k].name[1]) }),
  });
}

// ------------------------------------------------------------------ JD builder
async function jdView(el, ctx, d) {
  const pos = d.positions.find((p) => p.id === ctx.query.pos);
  const init = pos || { title: L('高级数据分析师', 'Senior Data Analyst'), deptId: 'd04', level: 'P6', skills: ['sql', 'python', 'data_analysis', 'ab_test'], niceSkills: ['bi', 'ml'], minYears: 5, education: 3, location: 'sh' };
  setHTML(el, html`
    <div class="split-wide">
      <section class="card">
        <div class="card-head"><h2>${pos ? L(`编辑 JD · ${loc(pos, 'title')}`, `Edit JD · ${loc(pos, 'title')}`) : L('岗位信息', 'Role details')}</h2></div>
        <form id="jd-form" class="stack" style="gap:12px">
          ${field(L('职位名称', 'Job title'), input('title', { value: loc(init, 'title') || init.title }))}
          <div class="form-grid">
            ${field(L('部门', 'Department'), select('deptId', d.departments.map((x) => [x.id, loc(x)]), { value: init.deptId }))}
            ${field(L('职级', 'Level'), select('level', LEVELS.map((l) => [l, l]), { value: init.level }))}
            ${field(L('最低年限', 'Min years'), input('minYears', { type: 'number', min: 0, value: init.minYears }))}
            ${field(L('最低学历', 'Education'), select('education', EDUCATION.map((e) => [e.level, e.level ? tx(e.name) : L('不限', 'Any')]), { value: init.education }))}
          </div>
          ${field(L('必备技能', 'Required skills'), skillPicker('skills', init.skills), { group: true })}
          ${field(L('加分技能', 'Nice to have'), skillPicker('niceSkills', init.niceSkills), { group: true })}
          ${field(L('岗位亮点（可选）', 'Role highlights (optional)'), textarea('highlights', { rows: 3, placeholder: L('团队规模、业务阶段、为什么这个岗位重要…', 'Team size, business stage, why this role matters…') }))}
        </form>
      </section>
      <div class="stack">
        <section class="card">
          <div class="card-head"><h2>${L('JD 草稿', 'JD draft')}</h2><div class="row">
            <button class="btn btn-sm" type="button" data-copy>${icon('copy')}${L('复制', 'Copy')}</button>
            ${pos ? html`<button class="btn btn-sm btn-primary" type="button" data-save>${L('保存到职位', 'Save to job')}</button>` : ''}</div></div>
          <textarea class="input mono" id="jd-text" rows="18"></textarea>
          <div class="section-title">${L('合规与包容性检查', 'Compliance & inclusive language check')}</div>
          <div id="jd-check"></div>
        </section>
        <div id="ai-jd"></div>
      </div>
    </div>`);
  wireChips(el);
  const form = el.querySelector('#jd-form');
  const ta = el.querySelector('#jd-text');
  const values = () => {
    const v = Object.fromEntries(new FormData(form));
    return { ...v, skills: list(v.skills), niceSkills: list(v.niceSkills), dept: loc(d.departments.find((x) => x.id === v.deptId)), location: tx(LOCATIONS[init.location] || LOCATIONS.sh) };
  };
  const check = () => {
    const hits = checkInclusive(ta.value);
    setHTML(el.querySelector('#jd-check'), hits.length
      ? html`<div class="callouts">${hits.map((h) => callout(h.level === 'high' ? 'danger' : h.level === 'medium' ? 'warn' : 'info', html`<strong>${h.terms.map((t) => `「${t}」`).join('')}</strong> ${tx(h.why)}。${L('建议：', 'Fix: ')}${tx(h.fix)}`))}</div>`
      : callout('ok', L('未发现歧视性或排斥性用语。', 'No discriminatory or exclusionary wording found.')));
  };
  const regen = () => {
    ta.value = generateJD(values(), lang());
    check();
  };
  if (pos?.jd) {
    ta.value = pos.jd;
    check();
  } else regen();
  form.addEventListener('input', regen);
  form.addEventListener('change', regen);
  ta.addEventListener('input', check);
  on(el, 'click', '[data-copy]', () => copyText(ta.value));
  on(el, 'click', '[data-save]', (e, b) => act(b, () => api.put(`/api/positions/${pos.id}`, { jd: ta.value }), L('JD 已保存', 'JD saved')));
  mountReport(el.querySelector('#ai-jd'), {
    title: L('AI 撰写 JD', 'AI-written JD'),
    ruleMd: L('左侧草稿由模板引擎根据岗位序列与职级生成，可直接编辑。需要更有吸引力的文案时，可使用 AI 生成，并自动附带合规提示。', 'The draft is generated from templates by job family and level and can be edited directly. For more compelling copy, generate with AI; it adds compliance notes too.'),
    task: 'jd',
    aiLabel: L('AI 撰写', 'Write with AI'),
    input: () => {
      const v = values();
      return { title: v.title, department: v.dept, level: v.level, requiredSkills: v.skills.map((k) => skillLabel(k, 'en')), niceToHave: v.niceSkills.map((k) => skillLabel(k, 'en')), minYears: v.minYears, education: tx(EDUCATION[Number(v.education) || 0].name), highlights: v.highlights, jobFamily: detectFamily(v.title) };
    },
  });
}
