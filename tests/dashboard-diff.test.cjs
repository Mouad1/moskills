const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { RunStateEngine } = require('../lib/run-state.cjs');
const { startDashboardServer, getDashboardHtml } = require('../lib/run-state-dashboard.cjs');

test('Step 3: Interactive Diff & Impact Tree in Dashboard', async (t) => {
  await t.test('GET / returns HTML containing Diff & Impact tab', () => {
    const html = getDashboardHtml('run-diff-test');
    assert.ok(html.includes('Diff &amp; Impact') || html.includes('Diff & Impact'), 'Dashboard must have Diff & Impact tab button');
    assert.ok(html.includes('tab-diff'), 'Dashboard must have tab-diff section');
  });

  await t.test('GET /api/diff serves git diff and calculated impact analysis', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-diff-'));
    let dashboardHandle = null;

    try {
      // Initialize a real git repo in tmpDir for git diff testing
      spawnSync('git', ['init'], { cwd: tmpDir });
      spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir });
      spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir });

      const fileEntry = path.join(tmpDir, 'calculator.cjs');
      const fileDep = path.join(tmpDir, 'math-utils.cjs');
      fs.writeFileSync(fileDep, 'module.exports = { add: (a, b) => a + b };\n');
      fs.writeFileSync(fileEntry, 'const { add } = require("./math-utils.cjs");\nmodule.exports = add;\n');

      spawnSync('git', ['add', '.'], { cwd: tmpDir });
      spawnSync('git', ['commit', '-m', 'initial commit'], { cwd: tmpDir });

      const engine = new RunStateEngine(tmpDir);
      const run = engine.initRun({
        runId: 'run-diff-1',
        goal: 'Test diff and impact dashboard API',
        tasks: [{ id: 'task-calc', title: 'Calculator Task', requiredCheckIds: ['check-calc'] }]
      });

      engine.wrapCheck({
        runId: run.id,
        checkId: 'check-calc',
        command: 'node -e "require(\'./calculator.cjs\')"',
        cwd: tmpDir,
        relevantFiles: ['calculator.cjs'],
        autoComplete: 'task-calc'
      });

      // Now modify the dependency file (math-utils.cjs)
      fs.writeFileSync(fileDep, 'module.exports = { add: (a, b) => a + b + 0 };\n');

      // Start dashboard server on ephemeral port (0)
      dashboardHandle = await startDashboardServer({
        targetDir: tmpDir,
        runId: run.id,
        port: 0
      });

      const port = dashboardHandle.port;

      // Request /api/diff
      const data = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/api/diff?runId=${run.id}`, (res) => {
          assert.equal(res.statusCode, 200);
          assert.ok(res.headers['content-type'].includes('application/json'));
          let raw = '';
          res.on('data', chunk => { raw += chunk; });
          res.on('end', () => {
            try {
              resolve(JSON.parse(raw));
            } catch (err) {
              reject(err);
            }
          });
        }).on('error', reject);
      });

      assert.ok(data.hasOwnProperty('diff'), 'Response must have diff property');
      assert.ok(Array.isArray(data.changedFiles), 'Response must have changedFiles array');
      assert.ok(data.changedFiles.some(f => f.includes('math-utils.cjs')), 'changedFiles must include math-utils.cjs');
      assert.ok(data.diff.includes('math-utils.cjs'), 'diff output must mention math-utils.cjs');

      // Impacted tasks must include task-calc because math-utils.cjs is a dependency!
      assert.ok(data.impactedTaskIds.includes('task-calc'), 'task-calc must be marked impacted');
      assert.ok(data.impactedCheckIds.includes('check-calc'), 'check-calc must be marked impacted');
    } finally {
      if (dashboardHandle) {
        await dashboardHandle.close();
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
