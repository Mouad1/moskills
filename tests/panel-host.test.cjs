'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { startPanelHost, loadPanels } = require('../lib/panel-host.cjs');

function writePanel(root, folder, manifest, file, code) {
  const dir = path.join(root, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'panel.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
  if (file) fs.writeFileSync(path.join(dir, file), code);
  return dir;
}

function makeFixtures() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills-panels-'));
  writePanel(root, 'alpha', { id: 'alpha', title: 'Alpha', zone: 'left', order: 1, refreshMs: 2000, entry: 'panel.mjs' }, 'panel.mjs', `
    export async function render(ctx) { return { html: '<p>' + ctx.escape('<b>hi</b> & bye') + '</p>' }; }
    export const actions = { echo: async (ctx, body) => ({ ok: true, got: body.text, target: ctx.targetDir }) };
  `);
  writePanel(root, 'beta', { id: 'beta', title: 'Beta', zone: 'center', entry: 'panel.cjs' }, 'panel.cjs', `
    module.exports = { render: async () => ({ html: '<p>beta</p>' }) };
  `);
  writePanel(root, 'boom', { id: 'boom', title: 'Boom', zone: 'right', entry: 'panel.mjs' }, 'panel.mjs', `
    export async function render() { throw new Error('kaboom <script>'); }
  `);
  writePanel(root, 'badzone', { id: 'badzone', title: 'Bad', zone: 'middle', entry: 'panel.mjs' }, 'panel.mjs', 'export async function render(){return {html:""}}');
  writePanel(root, 'escape', { id: 'escape', title: 'Esc', zone: 'left', entry: '../alpha/panel.mjs' });
  writePanel(root, 'dup', { id: 'alpha', title: 'Dup', zone: 'left', entry: 'panel.mjs' }, 'panel.mjs', 'export async function render(){return {html:"dup"}}');
  writePanel(root, 'broken-json', '{ not json');
  return root;
}

function request(port, { method = 'GET', pathname = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { Host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data, json: () => JSON.parse(data) }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

test('loadPanels keeps valid panels and explains every skipped one', async () => {
  const root = makeFixtures();
  const { panels, skipped } = await loadPanels([root]);
  assert.deepEqual(panels.map((p) => p.id).sort(), ['alpha', 'beta', 'boom']);
  const reasons = Object.fromEntries(skipped.map((s) => [path.basename(s.dir), s.reason]));
  assert.match(reasons.badzone, /zone/);
  assert.match(reasons.escape, /entry/);
  assert.match(reasons.dup, /duplicate id "alpha"/);
  assert.match(reasons['broken-json'], /panel\.json/);
  assert.equal(panels.find((p) => p.id === 'beta').refreshMs, 10000, 'default refresh');
});

test('panel host: shell, manifest, isolated renders, guarded actions, loopback only', async (t) => {
  const root = makeFixtures();
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills-target-'));
  const host = await startPanelHost({ targetDir, panelDirs: [root], port: 0 });
  t.after(() => host.close());

  await t.test('binds 127.0.0.1', () => assert.equal(host.server.address().address, '127.0.0.1'));

  await t.test('GET / serves the shell with its zones', async () => {
    const r = await request(host.port);
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /text\/html/);
    for (const zone of ['top', 'left', 'center', 'right']) assert.match(r.body, new RegExp(`data-zone="${zone}"`));
    assert.match(r.headers['content-security-policy'] || '', /default-src 'self'/);
  });

  await t.test('GET /api/panels lists panels (ordered) and skipped ones', async () => {
    const m = (await request(host.port, { pathname: '/api/panels' })).json();
    assert.deepEqual(m.panels.map((p) => p.id), ['alpha', 'beta', 'boom']);
    assert.equal(m.panels[0].refreshMs, 2000);
    assert.equal(m.skipped.length, 4);
    assert.ok(!('entry' in m.panels[0]), 'file paths are not exposed');
  });

  await t.test('render returns escaped HTML; a throwing panel fails alone', async () => {
    const a = (await request(host.port, { pathname: '/api/panels/alpha' })).json();
    assert.equal(a.html, '<p>&lt;b&gt;hi&lt;/b&gt; &amp; bye</p>');
    const boom = await request(host.port, { pathname: '/api/panels/boom' });
    assert.equal(boom.status, 500);
    assert.match(boom.json().error, /kaboom &lt;script&gt;/);
    const b = (await request(host.port, { pathname: '/api/panels/beta' })).json();
    assert.equal(b.html, '<p>beta</p>');
    assert.equal((await request(host.port, { pathname: '/api/panels/nope' })).status, 404);
  });

  await t.test('actions: JSON + action header round trip; everything else refused', async () => {
    const ok = await request(host.port, {
      method: 'POST', pathname: '/api/panels/alpha/actions/echo',
      headers: { 'Content-Type': 'application/json', 'X-Moskills-Action': '1' }, body: { text: 'yo' },
    });
    assert.equal(ok.status, 200, ok.body);
    assert.deepEqual(ok.json(), { ok: true, got: 'yo', target: targetDir });
    const noHeader = await request(host.port, {
      method: 'POST', pathname: '/api/panels/alpha/actions/echo', headers: { 'Content-Type': 'application/json' }, body: {},
    });
    assert.equal(noHeader.status, 403);
    const form = await request(host.port, {
      method: 'POST', pathname: '/api/panels/alpha/actions/echo',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Moskills-Action': '1' }, body: 'text=yo',
    });
    assert.equal(form.status, 415);
    const evil = await request(host.port, {
      method: 'POST', pathname: '/api/panels/alpha/actions/echo',
      headers: { 'Content-Type': 'application/json', 'X-Moskills-Action': '1', Origin: 'https://evil.example' }, body: {},
    });
    assert.equal(evil.status, 403);
    const missing = await request(host.port, {
      method: 'POST', pathname: '/api/panels/alpha/actions/nope',
      headers: { 'Content-Type': 'application/json', 'X-Moskills-Action': '1' }, body: {},
    });
    assert.equal(missing.status, 404);
  });

  await t.test('foreign Host header is refused', async () => {
    const r = await request(host.port, { pathname: '/api/panels', headers: { Host: 'evil.example' } });
    assert.equal(r.status, 403);
  });
});

test('removing a panel folder leaves the host working with the rest', async (t) => {
  const root = makeFixtures();
  fs.rmSync(path.join(root, 'alpha'), { recursive: true });
  const host = await startPanelHost({ targetDir: root, panelDirs: [root], port: 0 });
  t.after(() => host.close());
  const m = (await request(host.port, { pathname: '/api/panels' })).json();
  // Without the original "alpha", the former duplicate (title "Dup") is the only "alpha" left.
  assert.deepEqual(m.panels.map((p) => `${p.id}:${p.title}`), ['alpha:Dup', 'beta:Beta', 'boom:Boom']);
  assert.equal((await request(host.port, { pathname: '/api/panels/beta' })).status, 200);
});
