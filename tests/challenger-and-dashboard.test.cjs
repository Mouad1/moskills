'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

const root = path.resolve(__dirname, '..');
const { RunStateEngine } = require('../lib/run-state.cjs');
const { startDashboardServer } = require('../lib/run-state-dashboard.cjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills-challenger-test-'));

function createTestProject(name) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.moskills.json'), JSON.stringify({ version: '0.8.2' }));
  return dir;
}

test.after(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

test('Track A: Challenger review pass allows progression', () => {
  const dir = createTestProject('challenger-pass');
  const engine = new RunStateEngine(dir);

  engine.initRun({
    runId: 'run-chal-1',
    goal: 'Test review gate',
    tasks: [{ id: 'task-1', title: 'Implement feature', reviewBudget: 2 }]
  });

  // Execute passing check
  engine.executeCheck({
    runId: 'run-chal-1',
    checkId: 'chk-1',
    command: 'node -e "process.exit(0)"',
    cwd: dir
  });

  // Record passing challenger review
  const review = engine.recordReview({
    runId: 'run-chal-1',
    taskId: 'task-1',
    reviewer: 'challenger-agent',
    passed: true,
    findings: ['Edge cases covered', 'Decimals handled correctly']
  });

  assert.equal(review.passed, true);
  assert.equal(review.cycle, 1);
  assert.equal(review.remainingBudget, 1);

  // Task completes
  const completed = engine.completeTask({
    runId: 'run-chal-1',
    taskId: 'task-1',
    requiredCheckIds: ['chk-1']
  });
  assert.equal(completed.status, 'finished');
});

test('Track A: Challenger review failure consumes budget; exhausts after max cycles', () => {
  const dir = createTestProject('challenger-exhaust');
  const engine = new RunStateEngine(dir);

  engine.initRun({
    runId: 'run-chal-2',
    goal: 'Test budget exhaustion',
    tasks: [{ id: 'task-1', title: 'Complex pricing algorithm', reviewBudget: 2 }]
  });

  // Review pass 1 (fail)
  const r1 = engine.recordReview({
    runId: 'run-chal-2',
    taskId: 'task-1',
    reviewer: 'challenger-agent',
    passed: false,
    findings: ['Zero quantity leads to division by zero']
  });
  assert.equal(r1.passed, false);
  assert.equal(r1.cycle, 1);
  assert.equal(r1.remainingBudget, 1);
  assert.equal(r1.status, 'needs_fix');

  let state = engine.getRun('run-chal-2');
  assert.equal(state.tasks[0].status, 'needs_fix');

  // Review pass 2 (fail again -> budget exhausted!)
  const r2 = engine.recordReview({
    runId: 'run-chal-2',
    taskId: 'task-1',
    reviewer: 'challenger-agent',
    passed: false,
    findings: ['Negative discounts not handled']
  });
  assert.equal(r2.passed, false);
  assert.equal(r2.cycle, 2);
  assert.equal(r2.remainingBudget, 0);
  assert.equal(r2.status, 'blocked_review_exhausted');

  state = engine.getRun('run-chal-2');
  assert.equal(state.tasks[0].status, 'blocked_review_exhausted');

  // Attempting another review after exhaustion throws or requires human override
  assert.throws(() => {
    engine.recordReview({
      runId: 'run-chal-2',
      taskId: 'task-1',
      reviewer: 'challenger-agent',
      passed: true
    });
  }, /review budget exhausted/i);

  // Human grants additional budget
  engine.grantReviewBudget({ runId: 'run-chal-2', taskId: 'task-1', additionalCycles: 1 });
  state = engine.getRun('run-chal-2');
  assert.equal(state.tasks[0].reviewBudget, 3);
  assert.equal(state.tasks[0].status, 'needs_fix');
});

test('Track C: Interactive dashboard server serves HTML and JSON APIs', async () => {
  const dir = createTestProject('dashboard-server');
  const engine = new RunStateEngine(dir);

  engine.initRun({
    runId: 'run-dash-1',
    goal: 'Test web dashboard',
    brief: '# Test Brief\nGoal is testing the dashboard.',
    scope: ['app.js'],
    tasks: [{ id: 't1', title: 'Task 1' }]
  });

  const { server, port } = await startDashboardServer({
    targetDir: dir,
    runId: 'run-dash-1',
    port: 0 // allocate free ephemeral port
  });

  try {
    // 1. GET / -> serves HTML with dashboard components
    const htmlRes = await fetch(`http://localhost:${port}/`);
    assert.equal(htmlRes.status, 200);
    const htmlText = await htmlRes.text();
    assert.ok(htmlText.includes('moskills Run-State Dashboard'));
    assert.ok(htmlText.includes('id="tab-brief"'));
    assert.ok(htmlText.includes('id="tab-progress"'));
    assert.ok(htmlText.includes('id="tab-review"'));

    // 2. GET /api/run -> returns run JSON
    const runRes = await fetch(`http://localhost:${port}/api/run`);
    assert.equal(runRes.status, 200);
    const runData = await runRes.json();
    assert.equal(runData.id, 'run-dash-1');
    assert.equal(runData.goal, 'Test web dashboard');

    // 3. GET /api/events -> returns event history
    const eventsRes = await fetch(`http://localhost:${port}/api/events`);
    assert.equal(eventsRes.status, 200);
    const events = await eventsRes.json();
    assert.ok(Array.isArray(events));
    assert.ok(events.length >= 1);

    // 4. POST /api/accept -> records human acceptance
    const acceptRes = await fetch(`http://localhost:${port}/api/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acceptedBy: 'Tester', notes: 'UI verified' })
    });
    assert.equal(acceptRes.status, 200);
    const acceptData = await acceptRes.json();
    assert.equal(acceptData.status, 'accepted');
    assert.equal(acceptData.acceptedBy, 'Tester');

    // Re-check run data
    const updatedRun = engine.getRun('run-dash-1');
    assert.equal(updatedRun.humanAcceptance.status, 'accepted');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
