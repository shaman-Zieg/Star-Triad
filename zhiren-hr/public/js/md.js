// Minimal, safe Markdown renderer for reports (rule-based and AI-generated).
// Text is escaped first; only a small set of block and inline forms is supported.
import { esc, raw } from './core.js';

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

export function mdToHtml(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    let m;
    if (!t) {
      flushPara();
      flushList();
    } else if ((m = t.match(/^(#{1,4})\s+(.*)$/))) {
      flushPara();
      flushList();
      const level = Math.min(3, m[1].length);
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
    } else if (/^(-{3,}|\*{3,})$/.test(t)) {
      flushPara();
      flushList();
      out.push('<hr>');
    } else if ((m = t.match(/^[-*·]\s+(.*)$/))) {
      flushPara();
      if (list?.type !== 'ul') flushList();
      list ||= { type: 'ul', items: [] };
      list.items.push(m[1]);
    } else if ((m = t.match(/^\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (list?.type !== 'ol') flushList();
      list ||= { type: 'ol', items: [] };
      list.items.push(m[1]);
    } else if (t.startsWith('|') && lines[i + 1]?.trim().match(/^\|?\s*:?-{2,}/)) {
      flushPara();
      flushList();
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(t);
      const body = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) body.push(cells(lines[i++]));
      i -= 1;
      out.push(`<table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    } else {
      flushList();
      para.push(t);
    }
  }
  flushPara();
  flushList();
  return out.join('\n');
}

export const md = (src) => raw(`<div class="md">${mdToHtml(src)}</div>`);
