'use strict';
// Panel host: a generic, zero-dependency local dashboard that shows plug-in panels.
// A panel is a folder with panel.json + a module exporting `render(ctx) → { html }`
// and optionally `actions = { name: async (ctx, body) → json }`. See docs/panel-host.md.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { checkLocalRequest, isLocalOrigin } = require('./local-http-guard.cjs');
const { shellHtml, SHELL_JS, SHELL_CSS } = require('./panel-host-shell.cjs');

const ZONES = ['top', 'left', 'center', 'right'];
const ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
const ENTRY_EXT = new Set(['.mjs', '.cjs', '.js', '.ts']);
const RENDER_TIMEOUT_MS = 10000;
const MAX_BODY = 64 * 1024;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Validates a parsed panel.json; returns a normalized manifest or an error string. */
function validateManifest(m, dir) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return 'panel.json must be an object';
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) return 'invalid id (lowercase letters, digits, dashes)';
  if (typeof m.title !== 'string' || !m.title.trim() || m.title.length > 60) return 'invalid title (1–60 characters)';
  if (!ZONES.includes(m.zone)) return `invalid zone "${m.zone}" (use ${ZONES.join(', ')})`;
  if (typeof m.entry !== 'string') return 'missing entry';
  const entry = path.resolve(dir, m.entry);
  const rel = path.relative(dir, entry);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return 'entry must stay inside the panel folder';
  if (!ENTRY_EXT.has(path.extname(entry))) return 'entry must be a .mjs, .cjs, .js or .ts file';
  if (!fs.existsSync(entry)) return `entry not found: ${m.entry}`;
  const order = Number.isFinite(m.order) ? m.order : 100;
  const refreshMs = m.refreshMs === undefined ? 10000 : Number(m.refreshMs);
  if (!Number.isFinite(refreshMs) || (refreshMs !== 0 && refreshMs < 1000)) return 'refreshMs must be 0 (never) or ≥ 1000';
  return { id: m.id, title: m.title.trim(), zone: m.zone, order, refreshMs, entry, dir };
}

/** Folders that contain a panel.json: the given dir itself, or its direct subfolders. */
function panelFolders(root) {
  if (fs.existsSync(path.join(root, 'panel.json'))) return [root];
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, e.name, 'panel.json')))
    .map((e) => path.join(root, e.name))
    .sort();
}

/** Loads every panel under the given roots. Invalid ones are skipped with a reason, never fatal. */
async function loadPanels(panelDirs) {
  const panels = [];
  const skipped = [];
  const seen = new Set();
  for (const root of panelDirs) {
    for (const dir of panelFolders(path.resolve(root))) {
      let manifest;
      try {
        manifest = JSON.parse(fs.readFileSync(path.join(dir, 'panel.json'), 'utf8'));
      } catch (err) {
        skipped.push({ dir, reason: `panel.json is not valid JSON: ${err.message}` });
        continue;
      }
      const v = validateManifest(manifest, dir);
      if (typeof v === 'string') {
        skipped.push({ dir, reason: v });
        continue;
      }
      if (seen.has(v.id)) {
        skipped.push({ dir, reason: `duplicate id "${v.id}"` });
        continue;
      }
      let mod;
      try {
        mod = await import(pathToFileURL(v.entry).href);
      } catch (err) {
        skipped.push({ dir, reason: `could not load ${path.basename(v.entry)}: ${err.message}` });
        continue;
      }
      const render = mod.render || (mod.default && mod.default.render);
      const actions = mod.actions || (mod.default && mod.default.actions) || {};
      if (typeof render !== 'function') {
        skipped.push({ dir, reason: 'module does not export render(ctx)' });
        continue;
      }
      seen.add(v.id);
      panels.push({ ...v, render, actions });
    }
  }
  panels.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return { panels, skipped };
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    }),
  ]);
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let data = '';
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      try {
        const value = data ? JSON.parse(data) : {};
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('body must be a JSON object');
        resolve(value);
      } catch (err) {
        reject(Object.assign(err, { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

async function startPanelHost({ targetDir = process.cwd(), panelDirs = [], port = 4040, host = '127.0.0.1', config = {}, title = 'Dashboard' } = {}) {
  const { panels, skipped } = await loadPanels(panelDirs);
  const byId = new Map(panels.map((p) => [p.id, p]));
  const ctxFor = (p) => ({ targetDir, config, escape: escapeHtml, panelDir: p.dir });

  const manifest = {
    title,
    panels: panels.map(({ id, title: t, zone, order, refreshMs }) => ({ id, title: t, zone, order, refreshMs })),
    skipped: skipped.map((s) => ({ panel: path.basename(s.dir), reason: s.reason })),
  };

  const server = http.createServer(async (req, res) => {
    if (!checkLocalRequest(req, res)) return;
    const { pathname } = new URL(req.url, 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');

    try {
      if (req.method === 'GET' && pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP, 'Cache-Control': 'no-store' });
        res.end(shellHtml(escapeHtml(title)));
        return;
      }
      if (req.method === 'GET' && pathname === '/assets/shell.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(SHELL_JS);
        return;
      }
      if (req.method === 'GET' && pathname === '/assets/shell.css') {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(SHELL_CSS);
        return;
      }
      if (req.method === 'GET' && pathname === '/api/panels') return sendJson(res, 200, manifest);

      const renderMatch = /^\/api\/panels\/([a-z0-9-]+)$/.exec(pathname);
      if (req.method === 'GET' && renderMatch) {
        const panel = byId.get(renderMatch[1]);
        if (!panel) return sendJson(res, 404, { error: 'unknown panel' });
        try {
          const out = await withTimeout(Promise.resolve(panel.render(ctxFor(panel))), RENDER_TIMEOUT_MS, `panel ${panel.id}`);
          if (!out || typeof out.html !== 'string') throw new Error('render() must return { html: string }');
          return sendJson(res, 200, { html: out.html, renderedAt: new Date().toISOString() });
        } catch (err) {
          return sendJson(res, 500, { error: escapeHtml(err && err.message ? err.message : String(err)) });
        }
      }

      const actionMatch = /^\/api\/panels\/([a-z0-9-]+)\/actions\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (req.method === 'POST' && actionMatch) {
        if (!isLocalOrigin(req.headers.origin)) return sendJson(res, 403, { error: 'Forbidden origin' });
        if (req.headers['x-moskills-action'] !== '1') return sendJson(res, 403, { error: 'Missing X-Moskills-Action header' });
        const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (type !== 'application/json') return sendJson(res, 415, { error: 'Content-Type must be application/json' });
        const panel = byId.get(actionMatch[1]);
        const action = panel && Object.prototype.hasOwnProperty.call(panel.actions, actionMatch[2]) ? panel.actions[actionMatch[2]] : null;
        if (typeof action !== 'function') return sendJson(res, 404, { error: 'unknown action' });
        let body;
        try {
          body = await readJsonBody(req);
        } catch (err) {
          return sendJson(res, err.status || 400, { error: err.message });
        }
        try {
          const result = await action(ctxFor(panel), body);
          return sendJson(res, 200, result === undefined ? { ok: true } : result);
        } catch (err) {
          return sendJson(res, 500, { error: escapeHtml(err && err.message ? err.message : String(err)) });
        }
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      if (!res.headersSent) sendJson(res, 500, { error: 'Internal error' });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  return {
    server,
    port: typeof address === 'object' && address ? address.port : port,
    panels: manifest.panels,
    skipped: manifest.skipped,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

module.exports = { startPanelHost, loadPanels, validateManifest, escapeHtml, ZONES };
