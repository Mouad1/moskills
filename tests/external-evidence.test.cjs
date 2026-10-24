const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { RunStateEngine } = require('../lib/run-state.cjs');
const { startDashboardServer } = require('../lib/run-state-dashboard.cjs');

test('Phase 3 Step 3: External Evidence & CI Status Ingestion & Multi-Agent Dashboard View', async (t) => {
  await t.test('records external CI evidence and allows completing dependent task', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-evidence-'));
    try {
      const engine = new RunStateEngine(tmpDir);
      const run = engine.initRun({
        goal: 'Test external evidence ingestion',
        tasks: [
          { id: 'task-ci', title: 'Task requiring CI checks', requiredCheckIds: ['gh-actions-smoke'] }
        ]
      });

      // Record external evidence from GitHub Actions CI
      const evidence = engine.recordExternalEvidence({
        runId: run.id,
        checkId: 'gh-actions-smoke',
        source: 'github-actions',
        status: 'passed',
        exitCode: 0,
        output: 'All 42 remote integration tests passed in 12.3s',
        metadata: { runUrl: 'https://github.com/Mouad1/moskills/actions/runs/1234567' }
      });

      assert.equal(evidence.checkId, 'gh-actions-smoke');
      assert.equal(evidence.source, 'github-actions');
      assert.equal(evidence.external, true);
      assert.equal(evidence.exitCode, 0);

      // Verify the task can now be completed using the external evidence
      const completedTask = engine.completeTask({
        runId: run.id,
        taskId: 'task-ci',
        requiredCheckIds: ['gh-actions-smoke']
      });

      assert.equal(completedTask.status, 'finished');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('rejects completing task when external CI evidence fails', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-evidence-fail-'));
    try {
      const engine = new RunStateEngine(tmpDir);
      const run = engine.initRun({
        goal: 'Test failing external evidence',
        tasks: [
          { id: 'task-ci-fail', title: 'Task with failing CI', requiredCheckIds: ['remote-e2e'] }
        ]
      });

      engine.recordExternalEvidence({
        runId: run.id,
        checkId: 'remote-e2e',
        source: 'github-actions',
        status: 'failed',
        exitCode: 1,
        output: 'E2E failed on browser checkout flow'
      });

      assert.throws(() => {
        engine.completeTask({
          runId: run.id,
          taskId: 'task-ci-fail',
          requiredCheckIds: ['remote-e2e']
        });
      }, /check did not pass for remote-e2e/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('CLI integration: ingest-evidence subcommand', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-cli-'));
    try {
      const cliPath = path.resolve(__dirname, '../lib/run-state-cli.cjs');
      const engine = new RunStateEngine(tmpDir);
      const run = engine.initRun({
        goal: 'CLI external evidence test',
        tasks: [
          { id: 'task-cli', title: 'CLI Task', requiredCheckIds: ['ci-check'] }
        ]
      });

      // Ingest evidence via CLI
      const proc = spawnSync('node', [
        cliPath,
        'ingest-evidence',
        '--run', run.id,
        '--check', 'ci-check',
        '--source', 'circleci',
        '--status', 'passed',
        '--output', 'CircleCI build #420 passed',
        '--target', tmpDir,
        '--json'
      ], { encoding: 'utf8' });

      assert.equal(proc.status, 0, `CLI ingest-evidence failed: ${proc.stderr}`);
      const evData = JSON.parse(proc.stdout);
      assert.equal(evData.checkId, 'ci-check');
      assert.equal(evData.source, 'circleci');
      assert.equal(evData.external, true);
      assert.equal(evData.exitCode, 0);

      // Verify task completion
      const completed = engine.completeTask({
        runId: run.id,
        taskId: 'task-cli',
        requiredCheckIds: ['ci-check']
      });
      assert.equal(completed.status, 'finished');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('Dashboard server exposes GET /api/agents and renders multi-agent leases', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-dash-'));
    let serverObj = null;
    try {
      const engine = new RunStateEngine(tmpDir);
      const run = engine.initRun({
        goal: 'Dashboard agents & leases test',
        tasks: [
          { id: 'task-agent-1', title: 'Task leased by Worker 1' },
          { id: 'task-agent-2', title: 'Task leased by Worker 2' }
        ]
      });

      // Worker 1 and Worker 2 acquire leases
      engine.acquireTaskLease({
        runId: run.id,
        taskId: 'task-agent-1',
        agentId: 'worker-1',
        ttlMs: 20000
      });
      engine.acquireTaskLease({
        runId: run.id,
        taskId: 'task-agent-2',
        agentId: 'worker-2',
        ttlMs: 20000
      });

      serverObj = await startDashboardServer({
        targetDir: tmpDir,
        runId: run.id,
        port: 0
      });

      const port = serverObj.port;

      // 1. Check GET / returns HTML with Agents & Leases tab
      const htmlRes = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/`, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        }).on('error', reject);
      });

      assert.equal(htmlRes.statusCode, 200);
      assert.ok(htmlRes.data.includes('Agents & Leases'));
      assert.ok(htmlRes.data.includes('content-agents'));

      // 2. Check GET /api/agents returns active leases and agent count
      const apiRes = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/api/agents`, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => resolve({ statusCode: res.statusCode, data: JSON.parse(data) }));
        }).on('error', reject);
      });

      assert.equal(apiRes.statusCode, 200);
      assert.equal(apiRes.data.runId, run.id);
      assert.equal(apiRes.data.leases.length, 2);
      assert.equal(apiRes.data.agentCount, 2);
      const agents = apiRes.data.leases.map(l => l.agentId).sort();
      assert.deepEqual(agents, ['worker-1', 'worker-2']);
    } finally {
      if (serverObj && serverObj.server) {
        await new Promise(r => serverObj.server.close(r));
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
