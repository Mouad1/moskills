const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { RunStateEngine } = require('../lib/run-state.cjs');

test('Phase 3 Step 1: Agent Session Leases & TTL Heartbeat Expiry', async (t) => {
  await t.test('agent can acquire a lease on an unfinished task', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-lease-'));
    try {
      const engine = new RunStateEngine(tmpDir);
      const run = engine.initRun({
        goal: 'Test agent lease acquisition',
        tasks: [{ id: 'task-1', title: 'Task 1' }]
      });

      const lease = engine.acquireTaskLease({
        runId: run.id,
        taskId: 'task-1',
        agentId: 'builder-agent-1',
        ttlMs: 5000
      });

      assert.ok(lease.leaseId, 'Lease must have an ID');
      assert.equal(lease.agentId, 'builder-agent-1');
      assert.ok(new Date(lease.expiresAt).getTime() > Date.now(), 'Expiration must be in the future');

      const currentRun = engine.getRun(run.id);
      const task = currentRun.tasks.find(tk => tk.id === 'task-1');
      assert.equal(task.lease.agentId, 'builder-agent-1');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('rejects competing agent while active lease is unexpired', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-lease-conflict-'));
    try {
      const engine = new RunStateEngine(tmpDir);
      const run = engine.initRun({
        goal: 'Test lease collision',
        tasks: [{ id: 'task-1', title: 'Task 1' }]
      });

      engine.acquireTaskLease({
        runId: run.id,
        taskId: 'task-1',
        agentId: 'builder-agent-1',
        ttlMs: 10000
      });

      // Competing agent attempts to acquire lease on same task
      assert.throws(() => {
        engine.acquireTaskLease({
          runId: run.id,
          taskId: 'task-1',
          agentId: 'challenger-agent-2',
          ttlMs: 5000
        });
      }, /Conflict: Task task-1 is currently leased/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('auto-reclaims lease when existing lease has expired', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-lease-expire-'));
    try {
      const engine = new RunStateEngine(tmpDir);
      const run = engine.initRun({
        goal: 'Test lease expiration reclamation',
        tasks: [{ id: 'task-1', title: 'Task 1' }]
      });

      // Acquire with negative TTL so it is immediately expired
      engine.acquireTaskLease({
        runId: run.id,
        taskId: 'task-1',
        agentId: 'stale-agent',
        ttlMs: -1000
      });

      // New agent acquires lease -> should succeed by reclaiming
      const newLease = engine.acquireTaskLease({
        runId: run.id,
        taskId: 'task-1',
        agentId: 'fresh-agent',
        ttlMs: 5000
      });

      assert.equal(newLease.agentId, 'fresh-agent');
      const currentRun = engine.getRun(run.id);
      const task = currentRun.tasks.find(tk => tk.id === 'task-1');
      assert.equal(task.lease.agentId, 'fresh-agent');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('renew and release task lease', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-lease-renew-'));
    try {
      const engine = new RunStateEngine(tmpDir);
      const run = engine.initRun({
        goal: 'Test renew and release',
        tasks: [{ id: 'task-1', title: 'Task 1' }]
      });

      const lease = engine.acquireTaskLease({
        runId: run.id,
        taskId: 'task-1',
        agentId: 'builder-1',
        ttlMs: 2000
      });

      // Renew
      const renewed = engine.renewTaskLease({
        runId: run.id,
        taskId: 'task-1',
        agentId: 'builder-1',
        leaseId: lease.leaseId,
        ttlMs: 8000
      });

      assert.ok(new Date(renewed.expiresAt).getTime() > new Date(lease.expiresAt).getTime());

      // Release
      const res = engine.releaseTaskLease({
        runId: run.id,
        taskId: 'task-1',
        agentId: 'builder-1',
        leaseId: lease.leaseId
      });
      assert.equal(res.released, true);

      const currentRun = engine.getRun(run.id);
      const task = currentRun.tasks.find(tk => tk.id === 'task-1');
      assert.equal(task.lease, null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('CLI integration: lease, heartbeat, release', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-lease-cli-'));
    try {
      const cliPath = path.resolve(__dirname, '../lib/run-state-cli.cjs');
      const engine = new RunStateEngine(tmpDir);
      const run = engine.initRun({
        goal: 'CLI lease test',
        tasks: [{ id: 'task-cli', title: 'CLI Task' }]
      });

      // moskills run-state lease --task task-cli --agent agent-cli --ttl 10000 --target <tmpDir> --json
      const procLease = spawnSync('node', [
        cliPath,
        'lease',
        '--run', run.id,
        '--task', 'task-cli',
        '--agent', 'agent-cli',
        '--ttl', '10000',
        '--target', tmpDir,
        '--json'
      ], { encoding: 'utf8' });

      assert.equal(procLease.status, 0, `CLI lease failed: ${procLease.stderr}`);
      const leaseData = JSON.parse(procLease.stdout);
      assert.equal(leaseData.agentId, 'agent-cli');
      const leaseId = leaseData.leaseId;

      // moskills run-state heartbeat --task task-cli --agent agent-cli --lease <leaseId> --target <tmpDir> --json
      const procHeartbeat = spawnSync('node', [
        cliPath,
        'heartbeat',
        '--run', run.id,
        '--task', 'task-cli',
        '--agent', 'agent-cli',
        '--lease', leaseId,
        '--ttl', '15000',
        '--target', tmpDir,
        '--json'
      ], { encoding: 'utf8' });

      assert.equal(procHeartbeat.status, 0, `CLI heartbeat failed: ${procHeartbeat.stderr}`);
      const hbData = JSON.parse(procHeartbeat.stdout);
      assert.equal(hbData.leaseId, leaseId);

      // moskills run-state release --task task-cli --agent agent-cli --lease <leaseId> --target <tmpDir> --json
      const procRelease = spawnSync('node', [
        cliPath,
        'release',
        '--run', run.id,
        '--task', 'task-cli',
        '--agent', 'agent-cli',
        '--lease', leaseId,
        '--target', tmpDir,
        '--json'
      ], { encoding: 'utf8' });

      assert.equal(procRelease.status, 0, `CLI release failed: ${procRelease.stderr}`);
      const relData = JSON.parse(procRelease.stdout);
      assert.equal(relData.released, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
