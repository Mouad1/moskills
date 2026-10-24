'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

function get(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: pathname, headers: { Host: `127.0.0.1:${port}` } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject);
  });
}

test('moskills dashboard: core + extra panels, prints a localhost URL', async (t) => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills-dash-cli-'));
  const extra = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills-extra-'));
  fs.mkdirSync(path.join(extra, 'hello'));
  fs.writeFileSync(path.join(extra, 'hello', 'panel.json'), JSON.stringify({ id: 'hello', title: 'Hello', zone: 'left', entry: 'p.mjs' }));
  fs.writeFileSync(path.join(extra, 'hello', 'p.mjs'), 'export async function render(){ return { html: "<p>hi</p>" }; }');

  const child = spawn('sh', [path.join(ROOT, 'moskills'), 'dashboard', '--target', target, '--panels', extra, '--port', '0'], {
    env: { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1' },
  });
  t.after(() => child.kill());
  const port = await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (c) => {
      out += c;
      const m = /http:\/\/127\.0\.0\.1:(\d+)\//.exec(out);
      if (m) resolve(Number(m[1]));
    });
    child.stderr.on('data', (c) => { out += c; });
    child.on('exit', (code) => reject(new Error(`exited ${code}: ${out}`)));
    setTimeout(() => reject(new Error(`no URL printed: ${out}`)), 10000);
  });
  const m = JSON.parse((await get(port, '/api/panels')).body);
  assert.deepEqual(m.panels.map((p) => p.id).sort(), ['hello', 'run-state']);
  assert.equal((await get(port, '/api/panels/hello')).status, 200);
});

test('moskills dashboard --help documents the options', async () => {
  const child = spawn('sh', [path.join(ROOT, 'moskills'), 'dashboard', '--help']);
  let out = '';
  child.stdout.on('data', (c) => { out += c; });
  const code = await new Promise((r) => child.on('exit', r));
  assert.equal(code, 0);
  assert.match(out, /--panels <dir>/);
  assert.match(out, /--no-core/);
});
