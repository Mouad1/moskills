'use strict';
// Shell page for the panel host: layout zones, theme tokens and the small client script.
// Panels provide HTML fragments; the shell only places, refreshes and wires their forms.

function shellHtml(title) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="/assets/shell.css">
  <script src="/assets/shell.js" defer></script>
</head>
<body>
  <header class="topbar">
    <div class="brand"><span class="brand-mark" aria-hidden="true"></span><h1 class="brand-name">${title}</h1></div>
    <div class="zone zone-top" data-zone="top" aria-label="Status"></div>
    <button class="theme-toggle" type="button" id="theme-toggle">Change theme</button>
  </header>
  <main class="layout">
    <section class="zone zone-left" data-zone="left" aria-label="Today"></section>
    <section class="zone zone-center" data-zone="center" aria-label="Work"></section>
    <section class="zone zone-right" data-zone="right" aria-label="Actions"></section>
  </main>
  <div class="notice" id="skipped" hidden></div>
  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
</body>
</html>`;
}

const SHELL_CSS = `
:root {
  --bg: #f7f7f8; --surface: #ffffff; --surface-2: #f1f1f3; --border: #e4e4e8; --control-border: #85858e;
  --text: #17171a; --muted: #6b6b73; --accent: #c2410c; --accent-ink: #ffffff;
  --ok: #047857; --warn: #b45309; --err: #b91c1c;
  --radius: 10px; --gap: 16px;
  --font: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0c0c0e; --surface: #141418; --surface-2: #1b1b20; --border: #232329; --control-border: #6e6e78;
    --text: #f4f4f6; --muted: #8e8e98; --accent: #f97316; --accent-ink: #0c0c0e;
    --ok: #10b981; --warn: #f59e0b; --err: #ef4444; color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #0c0c0e; --surface: #141418; --surface-2: #1b1b20; --border: #232329; --control-border: #6e6e78;
  --text: #f4f4f6; --muted: #8e8e98; --accent: #f97316; --accent-ink: #0c0c0e;
  --ok: #10b981; --warn: #f59e0b; --err: #ef4444; color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 var(--font); }
a { color: var(--accent); }
code, pre, .mono { font-family: var(--mono); font-size: 0.85rem; }

.topbar {
  position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: var(--gap);
  min-height: 48px; padding: 6px 16px; background: var(--surface); border-bottom: 1px solid var(--border);
}
.brand { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.brand-name { margin: 0; font-size: 1rem; font-weight: 600; letter-spacing: -0.02em; }
.brand-mark { width: 10px; height: 10px; border-radius: 3px; background: var(--accent); }
.zone-top { flex: 1; display: flex; gap: 8px; overflow-x: auto; }
.zone-top .card { border: 0; background: transparent; padding: 0; }
.zone-top .card-head { display: none; }
.theme-toggle {
  border: 1px solid var(--control-border); background: var(--surface-2); color: var(--text);
  border-radius: 999px; min-height: 32px; padding: 4px 12px; font: inherit; cursor: pointer;
}
.theme-toggle:hover { background: var(--border); }

.layout {
  display: grid; gap: var(--gap); padding: var(--gap);
  grid-template-columns: minmax(0, 24fr) minmax(0, 50fr) minmax(0, 26fr); align-items: start;
}
.zone { display: flex; flex-direction: column; gap: var(--gap); min-width: 0; }
@media (max-width: 1100px) {
  .layout { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
  .zone-right { grid-column: 1 / -1; }
}
@media (max-width: 720px) {
  .layout { grid-template-columns: minmax(0, 1fr); padding: 12px 16px; }
  .zone-center { order: -1; }
  .topbar { flex-wrap: wrap; }
  .zone-top { order: 3; flex-basis: 100%; }
}

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; min-width: 0; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.card-title { margin: 0; font-size: 0.95rem; font-weight: 600; letter-spacing: -0.01em; }
.card-meta { color: var(--muted); font-size: 0.75rem; white-space: nowrap; }
.card-body { overflow-wrap: anywhere; }
.card-body table { width: 100%; border-collapse: collapse; }
.card-body th, .card-body td { text-align: left; padding: 6px 4px; border-bottom: 1px solid var(--border); vertical-align: top; }
.card-body th { color: var(--muted); font-weight: 500; font-size: 0.8rem; }
.card.is-error { border-color: var(--err); }
.card-error { color: var(--err); }
.card.is-loading .card-body { opacity: 0.6; }

.pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 999px;
  background: var(--surface-2); border: 1px solid var(--border); font-size: 0.8rem; white-space: nowrap; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.ok .dot, .dot.ok { background: var(--ok); } .warn .dot, .dot.warn { background: var(--warn); } .err .dot, .dot.err { background: var(--err); }
.muted { color: var(--muted); }

form { display: grid; gap: 8px; }
input, select, textarea { font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--control-border);
  border-radius: 8px; padding: 8px 10px; width: 100%; min-height: 36px; }
::placeholder { color: var(--muted); opacity: 1; }
textarea { min-height: 84px; resize: vertical; }
button.primary, .card-body button { font: inherit; border: 0; border-radius: 8px; padding: 8px 14px; cursor: pointer;
  background: var(--accent); color: var(--accent-ink); font-weight: 600; }
button.primary:hover, .card-body button:hover { filter: brightness(1.08); }
button:disabled { opacity: 0.6; cursor: progress; }
@media (pointer: coarse) {
  .theme-toggle, input, select, button.primary, .card-body button { min-height: 44px; }
}
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.notice { margin: 0 16px 16px; padding: 10px 14px; border: 1px dashed var(--warn); border-radius: var(--radius); color: var(--muted); font-size: 0.85rem; }
.toast { position: fixed; right: 16px; bottom: 16px; max-width: min(420px, calc(100vw - 32px)); padding: 10px 14px;
  border-radius: var(--radius); background: var(--text); color: var(--bg); box-shadow: 0 6px 24px rgba(0,0,0,.25); }
@media (prefers-reduced-motion: no-preference) { .card { transition: border-color .2s; } }
`;

const SHELL_JS = `
'use strict';
(function () {
  const root = document.documentElement;
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const saved = store.get('moskills-theme');
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
  const toggle = document.getElementById('theme-toggle');
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  const label = () => { toggle.textContent = isDark() ? 'Use light theme' : 'Use dark theme'; };
  label();
  toggle.addEventListener('click', () => {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    store.set('moskills-theme', root.dataset.theme);
    label();
  });

  const toastEl = document.getElementById('toast');
  let toastTimer;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 5000);
  }

  const cards = new Map();

  function makeCard(p) {
    const card = document.createElement('article');
    card.className = 'card is-loading';
    card.dataset.panel = p.id;
    const head = document.createElement('div');
    head.className = 'card-head';
    const h = document.createElement('h2');
    h.className = 'card-title';
    h.textContent = p.title;
    const meta = document.createElement('span');
    meta.className = 'card-meta';
    meta.textContent = 'loading…';
    head.append(h, meta);
    const body = document.createElement('div');
    body.className = 'card-body';
    card.append(head, body);
    return { card, body, meta };
  }

  async function refresh(p) {
    const c = cards.get(p.id);
    if (!c) return;
    const active = document.activeElement;
    if (active && c.card.contains(active) && active.closest('form')) return; // don't wipe what the user is typing
    try {
      const res = await fetch('/api/panels/' + encodeURIComponent(p.id), { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.html !== c.lastHtml) {
        c.body.innerHTML = data.html; // panel HTML comes from local panel code; data inside is escaped by the panel
        c.lastHtml = data.html;
      }
      c.card.classList.remove('is-error');
      c.meta.textContent = new Date(data.renderedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (err) {
      c.card.classList.add('is-error');
      c.lastHtml = null;
      c.body.replaceChildren(Object.assign(document.createElement('p'), { className: 'card-error', textContent: 'This panel failed: ' + err.message }));
      c.meta.textContent = 'error';
    } finally {
      c.card.classList.remove('is-loading');
    }
  }

  async function runAction(panelId, name, payload, button) {
    if (button) button.disabled = true;
    try {
      const res = await fetch('/api/panels/' + encodeURIComponent(panelId) + '/actions/' + encodeURIComponent(name), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Moskills-Action': '1' },
        body: JSON.stringify(payload || {}),
      });
      const data = await res.json().catch(() => ({}));
      toast(data.message || data.error || (res.ok ? 'Done' : 'Failed: ' + res.status));
      return res.ok;
    } finally {
      if (button) button.disabled = false;
    }
  }

  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-action]');
    if (!form) return;
    e.preventDefault();
    const card = form.closest('[data-panel]');
    const payload = Object.fromEntries(new FormData(form).entries());
    const ok = await runAction(card.dataset.panel, form.dataset.action, payload, form.querySelector('button[type="submit"], button:not([type])'));
    if (ok && form.dataset.reset !== 'false') form.reset();
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    const p = panels.find((x) => x.id === card.dataset.panel);
    if (p) refresh(p);
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]:not([type="submit"])');
    if (!btn || btn.closest('form[data-action]')) return;
    const card = btn.closest('[data-panel]');
    let payload = {};
    try { payload = btn.dataset.payload ? JSON.parse(btn.dataset.payload) : {}; } catch {}
    await runAction(card.dataset.panel, btn.dataset.action, payload, btn);
    const p = panels.find((x) => x.id === card.dataset.panel);
    if (p) refresh(p);
  });

  let panels = [];
  fetch('/api/panels', { cache: 'no-store' }).then((r) => r.json()).then((m) => {
    panels = m.panels;
    for (const p of panels) {
      const zone = document.querySelector('[data-zone="' + p.zone + '"]');
      if (!zone) continue;
      const c = makeCard(p);
      cards.set(p.id, c);
      zone.append(c.card);
      refresh(p);
      if (p.refreshMs > 0) setInterval(() => { if (!document.hidden) refresh(p); }, p.refreshMs);
    }
    if (m.skipped && m.skipped.length) {
      const n = document.getElementById('skipped');
      n.hidden = false;
      n.textContent = m.skipped.length + ' panel(s) not loaded: ' + m.skipped.map((s) => s.panel + ' (' + s.reason + ')').join(' · ');
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) panels.forEach(refresh); });
  }).catch((err) => toast('Could not load panels: ' + err.message));
})();
`;

module.exports = { shellHtml, SHELL_CSS, SHELL_JS };
