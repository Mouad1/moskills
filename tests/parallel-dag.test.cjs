const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { RunStateEngine } = require('../lib/run-state.cjs');

test('Phase 3 Step 2: Parallel DAG Task Dispatcher & Race-Condition Safe Claiming', async (t) => {
  await t.test('dispatches independent parallel branches of a DAG concurrently', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-dispatch-'));
    try {
      const engine = new RunStateEngine(tmpDir);
      // DAG Structure:
      //         root
      //        /    \
      //   branch-a  branch-b
      //        \    /
      //         join
      const run = engine.initRun({
        goal: 'Test Parallel DAG execution',
        tasks: [
          { id: 'root', title: 'Root Setup Task' },
          { id: 'branch-a', title: 'Worker A Task', prerequisites: ['root'] },
          { id: 'branch-b', title: 'Worker B Task', prerequisites: ['root'] },
          { id: 'join', title: 'Convergence Join Task', prerequisites: ['branch-a', 'branch-b'] }
        ]
      });

      // Initially only 'root' is ready
      let ready = engine.getParallelReadyTasks({ runId: run.id });
      assert.equal(ready.length, 1);
      assert.equal(ready[0].id, 'root');

      // Claim root task with agent-1
      const claimRoot = engine.claimNextReadyTask({
        runId: run.id,
        agentId: 'agent-1',
        ttlMs: 5000
      });
      assert.ok(claimRoot);
      assert.equal(claimRoot.task.id, 'root');
      assert.equal(claimRoot.lease.agentId, 'agent-1');

      // Now no tasks are ready (root is currently leased)
      ready = engine.getParallelReadyTasks({ runId: run.id });
      assert.equal(ready.length, 0);

      // Complete root check and task
      const checkRoot = engine.executeCheck({
        runId: run.id,
        checkId: 'check-root',
        command: 'echo "root ok"'
      });
      engine.completeTask({
        runId: run.id,
        taskId: 'root',
        requiredCheckIds: ['check-root']
      });

      // Once root is completed, BOTH branch-a and branch-b become ready concurrently!
      ready = engine.getParallelReadyTasks({ runId: run.id });
      assert.equal(ready.length, 2);
      const readyIds = ready.map(t => t.id).sort();
      assert.deepEqual(readyIds, ['branch-a', 'branch-b']);

      // Worker 1 claims a task -> gets branch-a
      const claim1 = engine.claimNextReadyTask({
        runId: run.id,
        agentId: 'worker-1',
        ttlMs: 10000
      });
      assert.ok(claim1);
      assert.equal(claim1.task.id, 'branch-a');

      // Worker 2 claims a task -> gets branch-b without conflict
      const claim2 = engine.claimNextReadyTask({
        runId: run.id,
        agentId: 'worker-2',
        ttlMs: 10000
      });
      assert.ok(claim2);
      assert.equal(claim2.task.id, 'branch-b');

      // Worker 3 attempts to claim -> returns null (all eligible tasks are leased)
      const claim3 = engine.claimNextReadyTask({
        runId: run.id,
        agentId: 'worker-3',
        ttlMs: 10000
      });
      assert.equal(claim3, null);

      // Finish branch-a only
      engine.executeCheck({ runId: run.id, checkId: 'check-a', command: 'echo "a ok"' });
      engine.completeTask({ runId: run.id, taskId: 'branch-a', requiredCheckIds: ['check-a'] });

      // 'join' requires both branch-a AND branch-b, so join is NOT ready yet
      ready = engine.getParallelReadyTasks({ runId: run.id });
      assert.equal(ready.length, 0);

      // Finish branch-b
      engine.executeCheck({ runId: run.id, checkId: 'check-b', command: 'echo "b ok"' });
      engine.completeTask({ runId: run.id, taskId: 'branch-b', requiredCheckIds: ['check-b'] });

      // Now 'join' is ready!
      ready = engine.getParallelReadyTasks({ runId: run.id });
      assert.equal(ready.length, 1);
      assert.equal(ready[0].id, 'join');

      const claimJoin = engine.claimNextReadyTask({
        runId: run.id,
        agentId: 'worker-1',
        ttlMs: 10000
      });
      assert.ok(claimJoin);
      assert.equal(claimJoin.task.id, 'join');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('automatically re-dispatches abandoned task when lease expires', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-expire-'));
    try {
      const engine = new RunStateEngine(tmpDir);
      const run = engine.initRun({
        goal: 'Test abandoned task re-dispatch',
        tasks: [
          { id: 'task-flaky', title: 'Flaky Worker Task' }
        ]
      });

      // Claim with negative TTL so it immediately expires
      engine.claimNextReadyTask({
        runId: run.id,
        agentId: 'flaky-worker',
        ttlMs: -1000
      });

      // The task lease is expired, so getParallelReadyTasks includes it
      const ready = engine.getParallelReadyTasks({ runId: run.id });
      assert.equal(ready.length, 1);
      assert.equal(ready[0].id, 'task-flaky');

      // A new worker can claim it immediately
      const newClaim = engine.claimNextReadyTask({
        runId: run.id,
        agentId: 'reliable-worker',
        ttlMs: 5000
      });
      assert.ok(newClaim);
      assert.equal(newClaim.task.id, 'task-flaky');
      assert.equal(newClaim.lease.agentId, 'reliable-worker');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('CLI integration: next-tasks and claim-task subcommands', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-cli-'));
    try {
      const cliPath = path.resolve(__dirname, '../lib/run-state-cli.cjs');
      const engine = new RunStateEngine(tmpDir);
      const run = engine.initRun({
        goal: 'CLI DAG test',
        tasks: [
          { id: 'task-1', title: 'Task 1' },
          { id: 'task-2', title: 'Task 2' }
        ]
      });

      // 1. moskills run-state next-tasks --json
      const procNext = spawnSync('node', [
        cliPath,
        'next-tasks',
        '--run', run.id,
        '--target', tmpDir,
        '--json'
      ], { encoding: 'utf8' });

      assert.equal(procNext.status, 0, `CLI next-tasks failed: ${procNext.stderr}`);
      const nextTasks = JSON.parse(procNext.stdout);
      assert.equal(nextTasks.length, 2);

      // 2. moskills run-state claim-task --agent worker-cli --ttl 10000 --json
      const procClaim = spawnSync('node', [
        cliPath,
        'claim-task',
        '--run', run.id,
        '--agent', 'worker-cli',
        '--ttl', '10000',
        '--target', tmpDir,
        '--json'
      ], { encoding: 'utf8' });

      assert.equal(procClaim.status, 0, `CLI claim-task failed: ${procClaim.stderr}`);
      const claimResult = JSON.parse(procClaim.stdout);
      assert.equal(claimResult.task.id, 'task-1');
      assert.equal(claimResult.lease.agentId, 'worker-cli');

      // 3. moskills run-state next-tasks again -> only task-2 remains
      const procNextAfter = spawnSync('node', [
        cliPath,
        'next-tasks',
        '--run', run.id,
        '--target', tmpDir,
        '--json'
      ], { encoding: 'utf8' });

      assert.equal(procNextAfter.status, 0);
      const remainingTasks = JSON.parse(procNextAfter.stdout);
      assert.equal(remainingTasks.length, 1);
      assert.equal(remainingTasks[0].id, 'task-2');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
