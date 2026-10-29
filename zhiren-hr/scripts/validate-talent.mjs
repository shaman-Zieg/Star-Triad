// Validates the talent-review rules on a COPY of the live database and prints a
// Markdown report. The live database is never written; the one synthetic example
// (an employee with no competency ratings) exists only in the temporary copy.
//   node --disable-warning=ExperimentalWarning scripts/validate-talent.mjs [today]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const live = path.join(root, 'data', 'zhiren.db');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zhiren-validate-'));
for (const ext of ['', '-wal', '-shm']) if (fs.existsSync(live + ext)) fs.copyFileSync(live + ext, path.join(tmp, `zhiren.db${ext}`));
process.env.ZHIREN_DB_PATH = path.join(tmp, 'zhiren.db');

const db = await import('../server/db.js');
const { evaluateAll, evaluateCandidate, successionLinks, STATUS, COVERAGE } = await import('../public/js/engine/succession.js');
const { personalInsight, retentionActions } = await import('../public/js/engine/insight.js');
const { assessCompetencies, targetProfile, ladderInfo } = await import('../public/js/engine/competency.js');
const { buildIDP } = await import('../public/js/engine/learning.js');
const { flightRisk, BOXES, boxKey } = await import('../public/js/engine/talent.js');

const today = process.argv[2] || db.stamp().slice(0, 10);
db.open();
const zh = (pair) => (Array.isArray(pair) ? pair[0] : pair);
const out = [];
const line = (s = '') => out.push(s);

const employees = db.list('employees');
const departments = db.list('departments');
const plans = db.list('succession');
const ev = evaluateAll(plans, employees, { today, departments });
const ctx = { today, evaluation: ev, idps: db.list('idps'), enrollments: db.list('enrollments'), courses: db.list('courses') };
const byName = (n) => employees.find((e) => e.name === n);

line(`# 人才盘点规则验证（数据日期 ${today}，在数据库副本上运行）`);
line();
line(`数据：${employees.filter((e) => e.status !== 'left').length} 名在职员工，${plans.length} 个关键岗位。`);
line();

line('## 1. 郑洋与跨职能提名');
const zy = byName('郑洋');
if (zy) {
  const { asCandidate } = successionLinks(zy.id, ev);
  line(`郑洋（${zy.title}，${zy.level}，流失风险 ${flightRisk(zy, today).score}）出现在 ${asCandidate.length} 个继任计划中：`);
  for (const { ev: p, n } of asCandidate) line(`- ${p.plan.title}：${zh(STATUS[n.status].name)}——${n.reasons.map(zh).join('；')}`);
}
const cross = ev.plans.flatMap((p) => p.nominations.filter((n) => n.checks?.function && !n.checks.function.ok).map((n) => `${n.employee.name}→${p.plan.title}`));
line(`- 因职能不匹配且无依据被排除的提名共 ${cross.length} 条：${cross.join('、') || '无'}`);
line(`- 依赖集中提示：${ev.warnings.map((w) => `${employees.find((e) => e.id === w.employeeId).name}（被提名 ${w.nominated.length} 个，首选 ${w.preferred.length} 个）`).join('；') || '无'}`);
line();

line('## 2. 杨晓东：岗位覆盖与候选资格的区分');
const yxd = byName('杨晓东');
if (yxd) {
  const r = flightRisk(yxd, today);
  const { own, asCandidate } = successionLinks(yxd.id, ev);
  line(`- 流失风险 ${r.score}（${r.level}），核心人才：${r.regrettable ? '是' : '否'}`);
  line(`- 本岗位（${yxd.title}）是否列为关键岗位：${own.length ? own.map((p) => p.plan.title).join('、') : '否（未自动列入；可在流失风险页人工评估）'}`);
  line(`- 作为候选人出现在：${asCandidate.length ? asCandidate.map(({ ev: p, n }) => `${p.plan.title}（${zh(STATUS[n.status].name)}）`).join('、') : '无提名'}`);
  const held = ev.plans.filter((p) => p.heldBack.some((x) => x.employee.id === yxd.id)).map((p) => p.plan.title);
  line(`- 因高流失风险未被自动推荐的计划：${held.join('、') || '无'}`);
  line(`- 流失风险页的个性化行动：${retentionActions(personalInsight(yxd, ctx)).map((a) => zh(a.text)).join(' / ')}`);
}
line();

line('## 3. 没有合适继任者的岗位');
for (const p of ev.plans.filter((x) => x.coverage === 'weak')) {
  line(`- ${p.plan.title}（${zh(COVERAGE[p.coverage].name)}，排序分 ${p.urgency}）：提名 ${p.nominations.length} 人，合格 ${p.eligibleCount} 人；系统建议 ${p.suggestions.map((x) => `${x.employee.name}(${x.score})`).join('、') || '无'}`);
}
line();

line('## 4. 人工提名的高流失风险候选人');
const manualRisk = ev.plans.flatMap((p) => p.nominations.filter((n) => n.status === 'excluded_risk').map((n) => ({ p, n })));
for (const { p, n } of manualRisk) line(`- ${p.plan.title}：${n.employee.name} → ${zh(STATUS[n.status].name)}；是否首选：${p.preferred?.employee.id === n.employee.id ? '是' : '否'}；计入合格人数：否（合格 ${p.eligibleCount} 人）`);
if (!manualRisk.length) line('- 当前数据中没有此类提名');
line();

line('## 5. 缺失能力数据（合成示例，仅存在于数据库副本）');
const sample = db.insert('employees', {
  name: '【示例】未评估员工', nameEn: '[Sample] Unassessed employee', status: 'active', deptId: 'd06', title: '大客户经理', titleEn: 'Key Account Manager',
  level: 'P5', hireDate: '2025-03-01', lastPromotion: '2025-03-01', compaRatio: 1, engagement: 4, performance: 4, potential: 2, competencies: null, skills: ['b2b_sales'],
});
const salesPlan = ev.plans.find((p) => p.spec.family === 'sales');
const a = assessCompetencies(sample.competencies, targetProfile(sample.level));
line(`- 能力评估状态：${a.status}；胜任度：${a.fit ?? '不计算'}；结论：${a.verdict}`);
if (salesPlan) line(`- 作为「${salesPlan.plan.title}」候选：${zh(STATUS[evaluateCandidate(sample, { spec: salesPlan.spec, today, departments: Object.fromEntries(departments.map((x) => [x.id, x])) }).status].name)}`);
line(`- 发展计划：${buildIDP(sample).mode}`);
line(`- 个人解读第一条行动：${zh(personalInsight(sample, { ...ctx, evaluation: null }).actions[0].text)}`);
line();

line('## 6. 共用能力标准的职级与最高职级');
for (const lv of ['P6', 'P7', 'P8', 'M1', 'M2', 'M4']) {
  const l = ladderInfo(lv);
  line(`- ${lv}：${zh(l.bandName)}段，共用 ${l.sharedLevels.join('/')}；下一职级 ${l.nextStep || '无'}${l.nextStepSharesStandard ? '（同一标准）' : ''}；更高一档标准 ${l.nextLevel || '无（本通道最高）'}`);
}
const fits = employees.filter((e) => e.status !== 'left').map((e) => assessCompetencies(e.competencies, targetProfile(e.level)));
line(`- 胜任度 100 的人数：${fits.filter((x) => x.fit === 100).length}；未完成评估：${fits.filter((x) => x.status !== 'complete').length}`);
line();

line('## 7. 个性化程度');
const active = employees.filter((e) => e.status !== 'left' && e.id !== sample.id);
const sets = new Map();
const boxSets = new Map();
for (const e of active) {
  const k = personalInsight(e, ctx).actions.map((x) => zh(x.text)).join('|');
  sets.set(k, (sets.get(k) || 0) + 1);
  const b = boxKey(e.performance, e.potential);
  boxSets.set(b, BOXES[b].actions.map(zh).join('|'));
}
const risky = active.filter((e) => flightRisk(e, today).level !== 'low');
const pairs = new Map();
for (const e of risky) {
  const k = retentionActions(personalInsight(e, ctx)).map((x) => zh(x.text)).join('|');
  pairs.set(k, (pairs.get(k) || 0) + 1);
}
line(`- 九宫格个人解读：${active.length} 人有 ${sets.size} 种不同的行动组合（同一组合最多 ${Math.max(...sets.values())} 人）；仅按格子给建议时只有 ${boxSets.size} 种`);
line(`- 流失风险页：${risky.length} 名中/高风险员工有 ${pairs.size} 种不同的两条行动组合（同一组合最多 ${Math.max(...pairs.values())} 人）`);
line();
line(`继任覆盖汇总：覆盖充分 ${ev.summary.strong}，基本覆盖 ${ev.summary.moderate}，继任缺口 ${ev.summary.weak}`);

db.close();
fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
console.log(out.join('\n'));
