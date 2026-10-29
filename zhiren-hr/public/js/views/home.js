// Dashboard: headline metrics, what needs attention, charts and recent activity.
import { html, setHTML, load, api, byId, icon, fmt, today, daysBetween, personName, badge, callout, pageHead, getActor } from '../core.js';
import { L, tx, loc, STAGES } from '../i18n.js';
import { hbars, columns } from '../charts.js';
import { flightRisk, boxKey } from '../engine/talent.js';
import { evaluateAll } from '../engine/succession.js';
import { isOverdue } from '../engine/service.js';
import { learningStats } from '../engine/learning.js';
import { scoreSurvey } from '../engine/diagnosis.js';
import { parseYmd } from '../engine/text.js';

const COL_NAMES = {
  candidates: ['候选人', 'candidate'], positions: ['职位', 'job'], employees: ['员工档案', 'employee record'], tickets: ['服务申请', 'request'],
  surveys: ['诊断调研', 'survey'], responses: ['问卷回复', 'survey response'], idps: ['发展计划', 'development plan'], succession: ['继任计划', 'succession plan'],
  courses: ['课程', 'course'], enrollments: ['学习记录', 'enrollment'], kb: ['制度文章', 'policy article'], onboarding: ['入职计划', 'onboarding plan'], raci: ['协作矩阵', 'RACI matrix'], departments: ['部门', 'department'],
};
const VERBS = { create: ['新建了', 'created'], update: ['更新了', 'updated'], delete: ['删除了', 'deleted'] };
const STATUS_WORD = { open: ['待处理', 'open'], in_progress: ['处理中', 'in progress'], resolved: ['已解决', 'resolved'], closed: ['已关闭', 'closed'], paused: ['暂停', 'paused'] };

export function activityLine(a) {
  const who = a.actor ? (L(a.actor.name, a.actor.nameEn || a.actor.name)) : L('匿名', 'Someone');
  const what = tx(COL_NAMES[a.col] || [a.col, a.col]);
  const label = a.col === 'responses' ? '' : L(a.label || '', a.labelEn || a.label || '');
  let detail = '';
  if (a.detail?.field === 'stage') detail = L(`：${tx(STAGES[a.detail.from] || [a.detail.from])} → ${tx(STAGES[a.detail.to] || [a.detail.to])}`, `: ${tx(STAGES[a.detail.from] || [a.detail.from, a.detail.from])} → ${tx(STAGES[a.detail.to] || [a.detail.to, a.detail.to])}`);
  else if (a.detail?.field === 'status') detail = ` → ${tx(STATUS_WORD[a.detail.to] || [a.detail.to, a.detail.to])}`;
  if (a.col === 'responses') return L(`${who}提交了一份匿名问卷`, `${who} submitted an anonymous survey response`);
  return L(`${who} ${tx(VERBS[a.action])}${what}「${label}」${detail}`, `${who} ${tx(VERBS[a.action])} ${what} "${label}"${detail}`);
}

export default async function home(el) {
  const [d, activity] = await Promise.all([
    load('employees', 'departments', 'positions', 'candidates', 'tickets', 'surveys', 'enrollments', 'courses', 'succession'),
    api.get('/api/activity?limit=12'),
  ]);
  const T = today();
  const emp = byId(d.employees);
  const active = d.employees.filter((e) => e.status !== 'left');
  const me = emp[getActor()];

  // Turnover over the trailing 12 months.
  const yearAgo = `${parseYmd(T).getFullYear() - 1}${T.slice(4)}`;
  const leavers = d.employees.filter((e) => e.status === 'left' && e.leaveDate >= yearAgo);
  const hires12 = d.employees.filter((e) => e.hireDate >= yearAgo).length;
  const startHC = active.length - hires12 + leavers.length;
  const turnover = leavers.length / ((startHC + active.length) / 2 || 1);
  const newThisMonth = active.filter((e) => e.hireDate.slice(0, 7) === T.slice(0, 7)).length;

  const open = d.positions.filter((p) => p.status === 'open');
  const toHire = open.reduce((a, p) => a + (Number(p.headcount) || 0), 0);
  const inFlight = d.candidates.filter((c) => ['applied', 'screen', 'interview', 'offer'].includes(c.stage));
  const hiredOnes = d.candidates.filter((c) => c.stage === 'hired' && c.offer?.startDate);
  const timeToHire = hiredOnes.length ? Math.round(hiredOnes.reduce((a, c) => a + daysBetween(c.appliedAt, c.stageChangedAt || c.offer.startDate), 0) / hiredOnes.length) : null;

  const ls = learningStats(d.enrollments, d.employees, d.courses);
  const hipo = active.filter((e) => e.potential === 3).length;
  const overdue = d.tickets.filter((t) => isOverdue(t, T));
  const openTickets = d.tickets.filter((t) => t.status !== 'resolved');

  const pulse = d.surveys.filter((s) => s.model === 'engagement').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  let enps = null;
  if (pulse) {
    const rs = await api.get(`/api/responses?surveyId=${pulse.id}`);
    enps = scoreSurvey('engagement', rs).enps;
  }

  // Things that need someone's attention.
  const alerts = [];
  const succ = evaluateAll(d.succession, d.employees, { today: T, departments: d.departments });
  const weak = succ.plans.filter((ev) => ev.coverage === 'weak').map((ev) => ev.plan);
  if (weak.length) alerts.push({ tone: 'danger', href: '#/talent/succession', text: L(`${weak.length} 个关键岗位未找到合适继任者：${weak.map((s) => s.title).join('、')}`, `${weak.length} key role(s) with no suitable successor: ${weak.map((s) => s.titleEn).join(', ')}`) });
  const risky = active.map((e) => ({ e, r: flightRisk(e, T) })).filter((x) => x.r && x.r.level === 'high' && x.r.regrettable);
  if (risky.length) alerts.push({ tone: 'warn', href: '#/talent/risk', text: L(`${risky.length} 名核心人才流失风险高，建议本月完成保留沟通`, `${risky.length} key people at high flight risk; hold retention conversations this month`) });
  if (overdue.length) alerts.push({ tone: 'warn', href: '#/service/requests', text: L(`${overdue.length} 个员工服务申请已超过 SLA`, `${overdue.length} employee request(s) past their SLA`) });
  const awaiting = d.candidates.flatMap((c) => (c.interviews || []).filter((i) => !Object.keys(i.scores || {}).length && i.date < T).map((i) => ({ c, i })));
  if (awaiting.length) alerts.push({ tone: 'info', href: '#/recruit/pipeline', text: L(`${awaiting.length} 场面试已结束但未提交评分表`, `${awaiting.length} interview(s) finished without a scorecard`) });
  const stale = d.candidates.filter((c) => c.stage === 'applied' && daysBetween(c.appliedAt, T) > 5);
  if (stale.length) alerts.push({ tone: 'info', href: '#/recruit/pipeline', text: L(`${stale.length} 位候选人投递超过 5 天未筛选`, `${stale.length} applicant(s) waiting more than 5 days for screening`) });
  if (pulse?.status === 'open') alerts.push({ tone: 'brand', href: `#/org/diagnosis/${pulse.id}`, text: L(`「${pulse.title}」进行中，已回收 ${enps?.n ?? 0} 份`, `"${pulse.titleEn}" is open with ${enps?.n ?? 0} responses`) });

  // Charts.
  const stageCounts = ['applied', 'screen', 'interview', 'offer', 'hired'].map((s, i) => ({ label: tx(STAGES[s]), value: d.candidates.filter((c) => (['applied', 'screen', 'interview', 'offer', 'hired'].indexOf(c.stage) >= i) || (c.stage === 'rejected' && i === 0)).length, cls: `seq-${i + 1}` }));
  const byDept = d.departments.map((dep) => ({ label: loc(dep), value: active.filter((e) => e.deptId === dep.id).length })).sort((a, b) => b.value - a.value);
  const months = Array.from({ length: 6 }, (_, i) => {
    const dt = parseYmd(T);
    dt.setDate(1);
    dt.setMonth(dt.getMonth() - (5 - i));
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  });
  const flow = months.map((m) => ({
    label: L(`${Number(m.slice(5))}月`, new Date(`${m}-01T00:00:00`).toLocaleString('en-US', { month: 'short' })),
    tip: m,
    values: [d.employees.filter((e) => e.hireDate.slice(0, 7) === m).length, d.employees.filter((e) => e.leaveDate?.slice(0, 7) === m).length],
  }));
  const boxes = { star: 0, core: 0, risk: 0 };
  for (const e of active) {
    const k = boxKey(e.performance, e.potential);
    if (k === 22 || k === 21 || k === 12) boxes.star += 1;
    else if (k === 0 || k === 10 || k === 20) boxes.risk += 1;
    else boxes.core += 1;
  }

  const kpi = (label, value, sub, href, ic) => html`<a class="card kpi tool-card" href="${href}"><span class="label">${icon(ic)}${label}</span><span class="value">${value}</span><span class="sub">${sub}</span></a>`;

  setHTML(el, html`
    ${pageHead(L(`你好，${me ? personName(me) : ''}`, `Hello, ${me ? personName(me) : ''}`), L('这是今天的组织与人才概览。所有指标都可点击进入对应工具。', 'Here is today\'s view of your people and organization. Every tile opens the matching tool.'))}
    <div class="grid cols-4">
      ${kpi(L('在职人数', 'Headcount'), active.length, L(`本月新入职 ${newThisMonth} 人 · ${d.departments.length} 个部门`, `${newThisMonth} joined this month · ${d.departments.length} departments`), '#/org/structure', 'users')}
      ${kpi(L('招聘需求', 'Open roles'), html`${open.length}<small>${L(`个职位 / ${toHire} 人`, `jobs / ${toHire} hires`)}</small>`, L(`管道中 ${inFlight.length} 位候选人${timeToHire ? ` · 平均招聘周期 ${timeToHire} 天` : ''}`, `${inFlight.length} candidates in process${timeToHire ? ` · ${timeToHire} days to hire` : ''}`), '#/recruit/positions', 'briefcase')}
      ${kpi(L('年化离职率', 'Annual turnover'), fmt.pct(turnover, 1), L(`近 12 个月离职 ${leavers.length} 人，主动离职 ${leavers.filter((e) => e.leaveType === 'voluntary').length} 人`, `${leavers.length} leavers in 12 months, ${leavers.filter((e) => e.leaveType === 'voluntary').length} voluntary`), '#/org/structure', 'route')}
      ${kpi(L('员工净推荐值', 'eNPS'), enps ? (enps.score > 0 ? `+${enps.score}` : enps.score) : '—', pulse ? L(`来自「${pulse.title}」· ${enps?.n ?? 0} 份`, `From "${pulse.titleEn}" · ${enps?.n ?? 0} responses`) : L('尚无敬业度调研', 'No engagement survey yet'), pulse ? `#/org/diagnosis/${pulse.id}` : '#/org/diagnosis', 'heart')}
      ${kpi(L('高潜人才占比', 'High potentials'), fmt.pct(hipo / (active.length || 1), 0), L(`${hipo} 人 · 核心人才 ${boxes.star} 人 · 需关注 ${boxes.risk} 人`, `${hipo} people · ${boxes.star} key talent · ${boxes.risk} need attention`), '#/talent/ninebox', 'star')}
      ${kpi(L('培训完成率', 'Training completion'), fmt.pct(ls.completionRate, 0), L(`人均学时 ${ls.hoursPerHead} 小时 · 满意度 ${ls.satisfaction ?? '—'}`, `${ls.hoursPerHead} hours per head · satisfaction ${ls.satisfaction ?? '—'}`), '#/learning/courses', 'book')}
      ${kpi(L('待处理服务申请', 'Open requests'), openTickets.length, overdue.length ? L(`${overdue.length} 个已超时`, `${overdue.length} past SLA`) : L('均在时效内', 'All within SLA'), '#/service/requests', 'inbox')}
      ${kpi(L('关键岗位继任覆盖', 'Succession coverage'), fmt.pct((succ.plans.length - weak.length) / (succ.plans.length || 1), 0), L(`${succ.plans.length} 个关键岗位 · ${weak.length} 个无合适继任者`, `${succ.plans.length} key roles · ${weak.length} with no suitable successor`), '#/talent/succession', 'shield')}
    </div>
    <div class="grid cols-3" style="margin-top:16px">
      <section class="card span-2">
        <div class="card-head"><div><h2>${L('需要关注', 'Needs attention')}</h2><p>${L('由规则引擎根据实时数据自动识别', 'Detected automatically from live data')}</p></div></div>
        ${alerts.length ? html`<div class="callouts">${alerts.map((a) => html`<a href="${a.href}" style="color:inherit;text-decoration:none">${callout(a.tone, a.text)}</a>`)}</div>` : callout('ok', L('一切正常，暂无需要处理的事项。', 'All clear. Nothing needs attention right now.'))}
      </section>
      <section class="card">
        <div class="card-head"><h2>${L('最近动态', 'Recent activity')}</h2></div>
        <div class="timeline">${activity.length ? activity.slice(0, 7).map((a) => html`<div class="timeline-item"><time>${fmt.rel(a.at)}</time><span>${activityLine(a)}</span></div>`) : html`<p class="muted">${L('暂无动态', 'No activity yet')}</p>`}</div>
      </section>
    </div>
    <div class="grid cols-3" style="margin-top:16px">
      <section class="card">
        <div class="card-head"><div><h2>${L('招聘漏斗', 'Hiring funnel')}</h2><p>${L('所有职位累计到达各阶段的人数', 'Candidates who reached each stage, all jobs')}</p></div></div>
        ${hbars(stageCounts, { head: [L('阶段', 'Stage'), L('人数', 'People')] })}
      </section>
      <section class="card">
        <div class="card-head"><div><h2>${L('各部门人数', 'Headcount by department')}</h2><p>${L('在职员工', 'Active employees')}</p></div></div>
        ${hbars(byDept, { head: [L('部门', 'Department'), L('人数', 'People')] })}
      </section>
      <section class="card">
        <div class="card-head"><div><h2>${L('入职与离职', 'Joiners and leavers')}</h2><p>${L('近 6 个月', 'Last 6 months')}</p></div></div>
        ${columns(flow, [{ name: L('入职', 'Joined'), cls: 's1' }, { name: L('离职', 'Left'), cls: 's2' }])}
      </section>
    </div>
    <section class="card" style="margin-top:16px">
      <div class="card-head"><div><h2>${L('常用工具', 'Popular tools')}</h2><p>${L('把 HR 管理经验沉淀为可复用的工具', 'HR know-how turned into reusable tools')}</p></div><a class="btn btn-sm" href="#/toolkit">${L('全部工具', 'All tools')}</a></div>
      <div class="grid cols-4">
        ${[
          ['#/recruit/screen', 'file', L('简历智能筛选', 'Resume screening'), L('解析简历并与岗位匹配打分', 'Parse resumes and score fit')],
          ['#/recruit/jd', 'edit', L('JD 生成与合规检查', 'JD builder & check'), L('生成职位描述，识别歧视性用语', 'Draft JDs and flag biased wording')],
          ['#/recruit/interview', 'message', L('结构化面试工具', 'Structured interview kit'), L('STAR 题库、面试计划与评分表', 'STAR questions, plans and scorecards')],
          ['#/talent/ninebox', 'grid', L('人才九宫格', '9-box talent grid'), L('拖拽校准，自动给出发展建议', 'Drag to calibrate; get actions per box')],
          ['#/learning/idp', 'target', L('个人发展计划', 'Development plans'), L('按 70-20-10 自动生成 IDP', 'Generate 70-20-10 IDPs')],
          ['#/org/diagnosis', 'pulse', L('组织诊断', 'Organizational diagnosis'), L('六盒、7S、敬业度、团队效能', 'Six-Box, 7S, engagement, team health')],
          ['#/org/raci', 'layers', L('RACI 协作矩阵', 'RACI matrix'), L('理清跨部门分工并自动检查', 'Clarify cross-team roles, auto-checked')],
          ['#/service/assistant', 'sparkle', L('HR 智能助手', 'HR assistant'), L('基于制度百科回答员工问题', 'Answers from the policy library')],
        ].map(([href, ic, t, p]) => html`<a class="card tool-card" href="${href}"><span class="ico">${icon(ic)}</span><strong>${t}</strong><p>${p}</p></a>`)}
      </div>
    </section>
  `);
}
