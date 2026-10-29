// Applies the saved theme before first paint (kept as a file because the CSP blocks inline scripts).
try {
  const t = localStorage.getItem('zr-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) { /* storage unavailable */ }
