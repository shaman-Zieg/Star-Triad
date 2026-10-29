// Bilingual content is stored as [zh, en] pairs throughout the engines.
export const pick = (pair, lang = 'zh') => {
  if (pair == null) return '';
  if (Array.isArray(pair)) return (lang === 'en' ? pair[1] : pair[0]) ?? pair[0] ?? '';
  return String(pair);
};

export const round = (n, d = 1) => {
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
};

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function sd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function parseYmd(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export const monthsBetween = (a, b) => (parseYmd(b) - parseYmd(a)) / (86400000 * 30.44);
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
