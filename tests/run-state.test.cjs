'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const { RunStateEngine } = require('../lib/run-state.cjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills-run-state-test-'));

function createTestProject(name) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.moskills.json'), JSON.stringify({ version: '0.8.1' }));
  return dir;
}

test.after(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

test('1. Record one run: saves goal, scope, tasks, prerequisites atomically with event history', () => {
  const dir = createTestProject('record-run');
  const engine = new RunStateEngine(dir);

  const run = engine.initRun({
    runId: 'run-001',
    goal: 'Build pricing calculator',
    scope: ['price.cjs', 'price.test.cjs'],
    brief: '# Brief\nBuild pricing calculator with discounts.',
    tasks: [
      { id: 'task-1', title: 'Implement base price', prerequisites: [] },
      { id: 'task-2', title: 'Implement discount logic', prerequisites: ['task-1'] }
    ]
  });

  assert.equal(run.id, 'run-001');
  assert.equal(run.goal, 'Build pricing calculator');
  assert.equal(run.tasks.length, 2);

  // Check filesystem structure: .moskills/runs/run-001/
  const runDir = path.join(dir, '.moskills', 'runs', 'run-001');
  assert.ok(fs.existsSync(path.join(runDir, 'run.json')));
  assert.ok(fs.existsSync(path.join(runDir, 'brief.md')));
  assert.ok(fs.existsSync(path.join(runDir, 'events.ndjson')));
  assert.ok(fs.existsSync(path.join(runDir, 'evidence')));

  // Check event history
  const events = fs.readFileSync(path.join(runDir, 'events.ndjson'), 'utf8')
    .trim().split('\n').map(line => JSON.parse(line));
  assert.ok(events.length >= 1);
  assert.equal(events[0].type, 'RUN_INITIALIZED');
});

test('2. Capture one real check: local runner records output, exit code, time, working directory, and file hashes', () => {
  const dir = createTestProject('capture-check');
  const engine = new RunStateEngine(dir);

  engine.initRun({
    runId: 'run-002',
    goal: 'Test command runner',
    tasks: [{ id: 'task-1', title: 'Test pricing script' }]
  });

  const priceFile = path.join(dir, 'price.cjs');
  fs.writeFileSync(priceFile, 'console.log("price ok");');

  const evidence = engine.executeCheck({
    runId: 'run-002',
    checkId: 'check-price',
    command: 'node price.cjs',
    cwd: dir,
    relevantFiles: ['price.cjs']
  });

  assert.equal(evidence.exitCode, 0);
  assert.ok(evidence.stdout.includes('price ok'));
  assert.ok(evidence.durationMs >= 0);
  assert.equal(evidence.cwd, dir);
  assert.ok(evidence.fileHashes['price.cjs']);

  // Evidence saved under evidence/
  const evidenceFile = path.join(dir, '.moskills', 'runs', 'run-002', 'evidence', 'check-price.json');
  assert.ok(fs.existsSync(evidenceFile));
  const saved = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
  assert.equal(saved.exitCode, 0);
});

test('3. Reject unsupported completion: text claims without evidence or failed exit are rejected', () => {
  const dir = createTestProject('reject-unsupported');
  const engine = new RunStateEngine(dir);

  engine.initRun({
    runId: 'run-003',
    goal: 'Verification gating',
    tasks: [{ id: 'task-1', title: 'Run failing test' }]
  });

  // Attempt to complete task-1 without running any check -> must fail
  assert.throws(() => {
    engine.completeTask({
      runId: 'run-003',
      taskId: 'task-1',
      requiredCheckIds: ['check-missing']
    });
  }, /missing required evidence/i);

  // Run a failing check (exit 1)
  const failingCheck = engine.executeCheck({
    runId: 'run-003',
    checkId: 'check-failing',
    command: 'node -e "process.exit(1)"',
    cwd: dir
  });
  assert.equal(failingCheck.exitCode, 1);

  // Attempt to complete task-1 with failing check -> must fail
  assert.throws(() => {
    engine.completeTask({
      runId: 'run-003',
      taskId: 'task-1',
      requiredCheckIds: ['check-failing']
    });
  }, /check did not pass/i);
});

test('4. Invalidate affected proof: editing checked file marks evidence stale and reopens task', () => {
  const dir = createTestProject('invalidate-proof');
  const engine = new RunStateEngine(dir);

  const priceFile = path.join(dir, 'pricing.js');
  fs.writeFileSync(priceFile, 'module.exports = 100;');

  engine.initRun({
    runId: 'run-004',
    goal: 'Staleness test',
    tasks: [{ id: 'task-pricing', title: 'Pricing check' }]
  });

  // Check passes
  engine.executeCheck({
    runId: 'run-004',
    checkId: 'check-pricing',
    command: 'node -e "require(\'./pricing.js\')"',
    cwd: dir,
    relevantFiles: ['pricing.js']
  });

  engine.completeTask({
    runId: 'run-004',
    taskId: 'task-pricing',
    requiredCheckIds: ['check-pricing']
  });

  let state = engine.getRun('run-004');
  assert.equal(state.tasks[0].status, 'finished');

  // Now modify the file
  fs.writeFileSync(priceFile, 'module.exports = 200;');

  // Resume or verify evidence -> must detect staleness
  const verification = engine.verifyEvidence({ runId: 'run-004', checkId: 'check-pricing' });
  assert.equal(verification.stale, true);

  // Resuming the run updates task status to stale / unfinished
  state = engine.resumeRun('run-004');
  assert.equal(state.tasks[0].status, 'unfinished');
  assert.equal(state.tasks[0].stale, true);
});

test('5. Resume safely: selects earliest unfinished task whose prerequisites pass, with locking', () => {
  const dir = createTestProject('resume-safely');
  const engine = new RunStateEngine(dir);

  engine.initRun({
    runId: 'run-005',
    goal: 'Resume sequence',
    tasks: [
      { id: 't1', title: 'Foundation', prerequisites: [] },
      { id: 't2', title: 'Feature', prerequisites: ['t1'] },
      { id: 't3', title: 'Polish', prerequisites: ['t2'] }
    ]
  });

  // Complete t1
  engine.executeCheck({
    runId: 'run-005',
    checkId: 'chk-1',
    command: 'node -e "process.exit(0)"',
    cwd: dir
  });
  engine.completeTask({ runId: 'run-005', taskId: 't1', requiredCheckIds: ['chk-1'] });

  const resume = engine.resumeRun('run-005');
  assert.equal(resume.finishedTasks.length, 1);
  assert.equal(resume.finishedTasks[0].id, 't1');
  assert.equal(resume.nextReadyTask.id, 't2'); // t1 is done, so t2 is ready
});

test('6. Two writers update the run: conflict detected via lock', () => {
  const dir = createTestProject('concurrent-writers');
  const engine = new RunStateEngine(dir);

  engine.initRun({ runId: 'run-006', goal: 'Lock test', tasks: [] });

  let locked = false;
  engine.withLock('run-006', () => {
    locked = true;
    // Attempting a second lock simultaneously throws conflict error
    assert.throws(() => {
      engine.withLock('run-006', () => {});
    }, /lock already held|conflict/i);
  });
  assert.equal(locked, true);
});

test('7. Bind acceptance to a result: file changes reopen human acceptance', () => {
  const dir = createTestProject('human-acceptance');
  const engine = new RunStateEngine(dir);

  const fileA = path.join(dir, 'a.txt');
  fs.writeFileSync(fileA, 'hello');

  engine.initRun({
    runId: 'run-007',
    goal: 'Human signoff',
    scope: ['a.txt'],
    tasks: []
  });

  engine.recordHumanAcceptance({
    runId: 'run-007',
    acceptedBy: 'Mouad',
    notes: 'Looks good'
  });

  let state = engine.getRun('run-007');
  assert.equal(state.humanAcceptance.status, 'accepted');

  // Change file
  fs.writeFileSync(fileA, 'hello world modified');

  const check = engine.verifyHumanAcceptance({ runId: 'run-007' });
  assert.equal(check.status, 'pending'); // Reverted to pending!
  assert.equal(check.invalidated, true);
});

test('8. CLI integration: moskills run-state init, check, complete, resume, and status work end-to-end', () => {
  const dir = createTestProject('cli-e2e');
  const fileA = path.join(dir, 'app.js');
  fs.writeFileSync(fileA, 'console.log("running e2e");');

  // init
  let res = spawnSync('node', [
    path.join(root, 'bin/moskills.cjs'), 'run-state', 'init',
    '--target', dir, '--id', 'run-cli', '--goal', 'CLI Test', '--tasks', 'Task A,Task B'
  ], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.stdout.includes('Run run-cli initialized'));

  // check
  res = spawnSync('node', [
    path.join(root, 'bin/moskills.cjs'), 'run-state', 'check',
    '--target', dir, '--id', 'run-cli', '--check', 'chk-app', '--cmd', 'node app.js', '--files', 'app.js'
  ], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.stdout.includes('Check chk-app finished with exit code 0'));

  // complete
  res = spawnSync('node', [
    path.join(root, 'bin/moskills.cjs'), 'run-state', 'complete',
    '--target', dir, '--id', 'run-cli', '--task', 'task-1', '--checks', 'chk-app'
  ], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.stdout.includes('Task task-1 finished with verified evidence'));

  // resume
  res = spawnSync('node', [
    path.join(root, 'bin/moskills.cjs'), 'run-state', 'resume',
    '--target', dir, '--id', 'run-cli'
  ], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.stdout.includes('Finished: task-1'));
  assert.ok(res.stdout.includes('Still not done: task-2'));

  // status
  res = spawnSync('node', [
    path.join(root, 'bin/moskills.cjs'), 'run-state', 'status',
    '--target', dir, '--id', 'run-cli'
  ], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.stdout.includes('Run: run-cli'));
  assert.ok(res.stdout.includes('task-1 [finished]'));
});

