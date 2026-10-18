'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { RunStateEngine } = require('../lib/run-state.cjs');

test('Step 1: Autonomous Challenger Dispatcher', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills-auto-challenger-'));

  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  const engine = new RunStateEngine(tmpDir);
  const runId = 'auto-challenger-run';

  engine.initRun({
    runId,
    goal: 'Test autonomous challenger dispatching',
    scope: ['src/app.js'],
    tasks: [
      { id: 'task-1', title: 'Implement feature A', reviewBudget: 2 }
    ]
  });

  await t.test('passing adversarial check command records review evidence and marks passed', () => {
    const dispatch = engine.dispatchChallengerReview({
      runId,
      taskId: 'task-1',
      command: 'node -e "process.exit(0);"',
      reviewer: 'surveyor-bot'
    });

    assert.equal(dispatch.passed, true);
    assert.equal(dispatch.cycle, 1);
    assert.equal(dispatch.remainingBudget, 1);
    assert.equal(dispatch.reviewer, 'surveyor-bot');
    assert.equal(dispatch.exitCode, 0);

    // Verify stored evidence
    const evidencePath = path.join(tmpDir, '.moskills', 'runs', runId, 'evidence', `${dispatch.reviewEvidence.reviewId}.json`);
    assert.equal(fs.existsSync(evidencePath), true);
    const saved = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    assert.equal(saved.passed, true);
    assert.equal(saved.exitCode, 0);

    // Verify event stream
    const eventsPath = path.join(tmpDir, '.moskills', 'runs', runId, 'events.ndjson');
    const events = fs.readFileSync(eventsPath, 'utf8').trim().split('\n').map(JSON.parse);
    const lastEvent = events[events.length - 1];
    assert.equal(lastEvent.type, 'CHALLENGER_DISPATCHED');
    assert.equal(lastEvent.data.passed, true);
  });

  await t.test('failing adversarial check transitions to needs_fix, then exhausts budget', () => {
    const runId2 = 'auto-challenger-fail-run';
    engine.initRun({
      runId: runId2,
      goal: 'Test failure and budget exhaustion',
      scope: ['src/app.js'],
      tasks: [
        { id: 'task-auth', title: 'Auth rotation', reviewBudget: 2 }
      ]
    });

    // Cycle 1: Failure
    const dispatch1 = engine.dispatchChallengerReview({
      runId: runId2,
      taskId: 'task-auth',
      command: 'sh -c "echo \\"race condition detected\\" >&2; exit 1"',
      reviewer: 'surveyor-adversary'
    });

    assert.equal(dispatch1.passed, false);
    assert.equal(dispatch1.cycle, 1);
    assert.equal(dispatch1.status, 'needs_fix');
    assert.equal(dispatch1.remainingBudget, 1);
    assert.match(dispatch1.findings[0], /race condition detected/);

    // Cycle 2: Failure -> Exhausts budget
    const dispatch2 = engine.dispatchChallengerReview({
      runId: runId2,
      taskId: 'task-auth',
      command: 'sh -c "echo \\"mock evasion\\" >&2; exit 1"',
      reviewer: 'surveyor-adversary'
    });

    assert.equal(dispatch2.passed, false);
    assert.equal(dispatch2.cycle, 2);
    assert.equal(dispatch2.status, 'blocked_review_exhausted');
    assert.equal(dispatch2.remainingBudget, 0);

    // Grant budget to recover
    const granted = engine.grantReviewBudget({
      runId: runId2,
      taskId: 'task-auth',
      additionalCycles: 1,
      grantedBy: 'human-lead'
    });
    assert.equal(granted.reviewBudget, 3);
    assert.equal(granted.status, 'needs_fix');

    // Cycle 3: Fixed -> Passed
    const dispatch3 = engine.dispatchChallengerReview({
      runId: runId2,
      taskId: 'task-auth',
      command: 'node -e "console.log(\\"All edge cases clean\\"); process.exit(0);"',
      reviewer: 'surveyor-adversary'
    });
    assert.equal(dispatch3.passed, true);
    assert.equal(dispatch3.cycle, 3);
  });

  await t.test('CLI integration: auto-review and grant-budget subcommands', () => {
    const cliPath = path.resolve(__dirname, '../lib/run-state-cli.cjs');
    const runIdCli = 'cli-auto-review-run';

    // Init
    const initRes = spawnSync('node', [
      cliPath, 'init',
      '--id', runIdCli,
      '--target', tmpDir,
      '--goal', 'CLI Test',
      '--tasks', 'Build API'
    ], { encoding: 'utf8' });
    assert.equal(initRes.status, 0);

    // Auto-review passing command
    const passRes = spawnSync('node', [
      cliPath, 'auto-review',
      '--id', runIdCli,
      '--target', tmpDir,
      '--task', 'task-1',
      '--cmd', 'node -e "process.exit(0)"',
      '--by', 'auto-challenger'
    ], { encoding: 'utf8' });
    assert.equal(passRes.status, 0);
    assert.match(passRes.stdout, /Autonomous Challenger review PASSED for task task-1/);

    // Auto-review failing command
    const failRes = spawnSync('node', [
      cliPath, 'auto-review',
      '--id', runIdCli,
      '--target', tmpDir,
      '--task', 'task-1',
      '--cmd', 'sh -c "echo \\"contract breach\\" >&2; exit 1"',
      '--by', 'auto-challenger'
    ], { encoding: 'utf8' });
    assert.equal(failRes.status, 2); // Budget was 2, now 2 used -> blocked_review_exhausted -> exit code 2
    assert.match(failRes.stderr, /status=blocked_review_exhausted/);
    assert.match(failRes.stderr, /contract breach/);

    // Grant budget via CLI
    const grantRes = spawnSync('node', [
      cliPath, 'grant-budget',
      '--id', runIdCli,
      '--target', tmpDir,
      '--task', 'task-1',
      '--count', '2'
    ], { encoding: 'utf8' });
    assert.equal(grantRes.status, 0);
    assert.match(grantRes.stdout, /Granted 2 additional review cycle\(s\) to task task-1/);
  });
});
