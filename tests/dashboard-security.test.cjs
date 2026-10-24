'use strict';
// The run dashboard is a local tool: it must only listen on loopback, refuse foreign Host headers
// (DNS rebinding) and never allow cross-site requests to its state-changing POST endpoint.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { RunStateEngine } = require('../lib/run-state.cjs');
const { startDashboardServer } = require('../lib/run-state-dashboard.cjs');

function request(port, { method = 'GET', pathname = '/api/run', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: pathname, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('run dashboard: loopback only, Host check, no wildcard CORS, guarded POST', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills-dash-sec-'));
  const engine = new RunStateEngine(tmpDir);
  engine.initRun({ runId: 'sec', goal: 'security', scope: [], tasks: [{ id: 't1', title: 'x', reviewBudget: 1 }] });
  const handle = await startDashboardServer({ targetDir: tmpDir, runId: 'sec', port: 0 });
  t.after(async () => {
    await handle.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await t.test('listens on 127.0.0.1 by default', () => {
    assert.equal(handle.server.address().address, '127.0.0.1');
  });

  await t.test('normal local request works and has no wildcard CORS header', async () => {
    const r = await request(handle.port, { headers: { Host: `localhost:${handle.port}` } });
    assert.equal(r.status, 200);
    assert.equal(r.headers['access-control-allow-origin'], undefined);
  });

  await t.test('foreign Host header is refused (DNS rebinding)', async () => {
    const r = await request(handle.port, { headers: { Host: 'evil.example:4040' } });
    assert.equal(r.status, 403);
  });

  await t.test('cross-site POST /api/accept is refused; same-origin JSON POST works', async () => {
    const evil = await request(handle.port, {
      method: 'POST',
      pathname: '/api/accept',
      headers: { Host: `127.0.0.1:${handle.port}`, Origin: 'https://evil.example', 'Content-Type': 'text/plain' },
      body: '{}',
    });
    assert.equal(evil.status, 403);
    const plain = await request(handle.port, {
      method: 'POST',
      pathname: '/api/accept',
      headers: { Host: `127.0.0.1:${handle.port}`, 'Content-Type': 'text/plain' },
      body: '{}',
    });
    assert.equal(plain.status, 415, 'non-JSON body refused (blocks simple cross-site form posts)');
    const ok = await request(handle.port, {
      method: 'POST',
      pathname: '/api/accept',
      headers: { Host: `127.0.0.1:${handle.port}`, Origin: `http://127.0.0.1:${handle.port}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ acceptedBy: 'tester' }),
    });
    assert.equal(ok.status, 200, ok.body);
  });
});
