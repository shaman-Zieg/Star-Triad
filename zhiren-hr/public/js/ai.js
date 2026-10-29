// AI assistance in the UI. Every report starts from the rule engine's result;
// when the server has Claude configured, "AI analysis" streams a deeper version.
import { html, icon, setHTML, getActor, copyText, toast } from './core.js';
import { L, lang } from './i18n.js';
import { md, mdToHtml } from './md.js';

let meta = { ai: { enabled: false, reason: 'unknown' } };
export const setMeta = (m) => { meta = m; };
export const getMeta = () => meta;
export const aiEnabled = () => Boolean(meta?.ai?.enabled);

export function aiHint() {
  const r = meta?.ai?.reason;
  if (r === 'no-sdk') return L('未安装 AI 组件：在项目目录运行 npm install，并设置 ANTHROPIC_API_KEY 后重启。', 'AI package not installed: run npm install in the project folder, set ANTHROPIC_API_KEY and restart.');
  if (r === 'no-key') return L('未配置 API Key：设置环境变量 ANTHROPIC_API_KEY 后重启服务即可启用。', 'No API key: set ANTHROPIC_API_KEY and restart the server to enable AI.');
  if (r === 'disabled') return L('AI 已被管理员关闭（ZHIREN_AI=0）。', 'AI is turned off (ZHIREN_AI=0).');
  return L('AI 未启用，当前使用内置规则引擎。', 'AI is off; using the built-in rule engine.');
}

export async function streamAI(task, input, onText) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' };
  if (getActor()) headers['X-Actor'] = getActor();
  const res = await fetch(`/api/ai/${task}`, { method: 'POST', headers, body: JSON.stringify({ input, lang: lang() }) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `${L('AI 请求失败', 'AI request failed')} (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let text = '';
  let note = null;
  let model = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev.t === 'text') text += ev.v;
      else if (ev.t === 'reset') text = '';
      else if (ev.t === 'note') note = ev.v;
      else if (ev.t === 'error') throw new Error(ev.v);
      else if (ev.t === 'done') model = ev.model;
      onText(text);
    }
  }
  return { text, note, model };
}

// Renders a report card into `container`: rule-based Markdown first, with an
// optional AI button that streams a richer analysis built from `input()`.
export function mountReport(container, { title, ruleMd, task, input, aiLabel }) {
  let mode = 'rule';
  let aiText = '';
  const render = () => {
    const body = mode === 'rule' ? ruleMd : aiText;
    setHTML(container, html`<div class="ai-box">
      <div class="ai-head">
        <strong>${icon(mode === 'ai' ? 'sparkle' : 'file')}${title}<span class="badge ${mode === 'ai' ? 'badge-info' : ''}">${mode === 'ai' ? L('AI 生成', 'AI generated') : L('规则引擎', 'Rule engine')}</span></strong>
        <div class="row no-print">
          ${mode === 'ai' ? html`<button type="button" class="btn btn-sm" data-r="rule">${L('查看规则版', 'Rule-based version')}</button>` : ''}
          ${task && aiEnabled() ? html`<button type="button" class="btn btn-sm btn-ai" data-r="ai" data-tip="${L('由 Claude 基于相同数据生成更深入的分析（可选的第三方模型，需如实披露）', 'Claude writes a deeper analysis from the same data (optional third-party model; disclose if used)')}">${icon('sparkle')}${aiLabel || L('AI 深度分析', 'AI analysis')}</button>` : ''}
          <button type="button" class="btn btn-sm btn-ghost" data-r="copy" aria-label="${L('复制', 'Copy')}" data-tip="${L('复制 Markdown', 'Copy Markdown')}">${icon('copy')}</button>
        </div>
      </div>
      <div class="ai-body">${md(body)}</div>
    </div>`);
  };
  container.onclick = async (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    if (b.dataset.r === 'copy') return copyText(mode === 'rule' ? ruleMd : aiText);
    if (b.dataset.r === 'rule') {
      mode = 'rule';
      return render();
    }
    if (b.dataset.r === 'ai') {
      mode = 'ai';
      aiText = '';
      render();
      const bodyEl = container.querySelector('.ai-body');
      container.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      bodyEl.innerHTML = `<div class="md ai-cursor">${L('正在分析…', 'Analyzing…')}</div>`;
      try {
        const result = await streamAI(task, input(), (t) => {
          aiText = t;
          bodyEl.innerHTML = `<div class="md ai-cursor">${mdToHtml(t)}</div>`;
        });
        aiText = result.text;
        if (result.note === 'refusal') aiText += `\n\n*${L('AI 拒绝了此请求，请查看规则版报告。', 'The AI declined this request; see the rule-based report.')}*`;
        if (result.note === 'truncated') aiText += `\n\n*${L('（内容过长已截断）', '(output truncated)')}*`;
        render();
      } catch (err) {
        toast(err.message, 'error');
        mode = 'rule';
        render();
      }
    }
  };
  render();
}
