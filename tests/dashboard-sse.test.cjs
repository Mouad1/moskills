'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { RunStateEngine } = require('../lib/run-state.cjs');
const { startDashboardServer } = require('../lib/run-state-dashboard.cjs');

test('Step 2: Live Server-Sent Events (SSE) for Dashboard', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills-sse-test-'));

  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  const engine = new RunStateEngine(tmpDir);
  const runId = 'sse-run-1';

  engine.initRun({
    runId,
    goal: 'Test live dashboard SSE stream',
    scope: ['lib/auth.js'],
    tasks: [{ id: 'task-1', title: 'Implement SSE', reviewBudget: 2 }]
  });

  const { server, port, close, broadcastUpdate } = await startDashboardServer({
    targetDir: tmpDir,
    runId,
    port: 0
  });

  t.after(async () => {
    if (close) {
      await close();
    } else {
      server.close();
    }
  });

  await t.test('GET /api/stream establishes SSE stream and delivers snapshot & update events', async () => {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${port}/api/stream`, (res) => {
        assert.equal(res.statusCode, 200);
        assert.match(res.headers['content-type'], /text\/event-stream/);
        assert.match(res.headers['cache-control'], /no-cache/);

        let buffer = '';
        let receivedSnapshot = false;
        let receivedUpdate = false;

        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8');

          if (!receivedSnapshot && buffer.includes('event: snapshot')) {
            receivedSnapshot = true;
            assert.match(buffer, /Test live dashboard SSE stream/);

            // Now trigger an engine event to verify live push
            engine.recordReview({
              runId,
              taskId: 'task-1',
              reviewer: 'sse-tester',
              passed: true,
              findings: []
            });
            broadcastUpdate();
          }

          if (receivedSnapshot && buffer.includes('event: update')) {
            receivedUpdate = true;
            assert.match(buffer, /sse-tester/);
            req.destroy();
            resolve();
          }
        });

        res.on('error', reject);
      });

      req.on('error', (err) => {
        if (receivedUpdate) {
          resolve();
        } else {
          reject(err);
        }
      });
    });
  });
});
