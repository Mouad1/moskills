'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { RunStateEngine } = require('../lib/run-state.cjs');

test('Step 3: Transparent Command Evidence Interceptor (wrap)', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills-wrap-test-'));

  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  const srcFile = path.join(tmpDir, 'service.js');
  fs.writeFileSync(srcFile, 'module.exports = { port: 8080 };\n', 'utf8');

  const engine = new RunStateEngine(tmpDir);
  const runId = 'wrap-run-1';

  engine.initRun({
    runId,
    goal: 'Test transparent command wrapping',
    scope: ['service.js'],
    tasks: [
      { id: 'task-srv', title: 'Service setup', requiredCheckIds: ['check-srv'] }
    ]
  });

  await t.test('wrapCheck captures command, hashes, exit code, and emits event', () => {
    const result = engine.wrapCheck({
      runId,
      checkId: 'check-srv',
      command: 'node -e "console.log(\\"All good\\"); process.exit(0);"',
      cwd: tmpDir,
      taskId: 'task-srv',
      autoComplete: true
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.taskCompleted, true);
    assert.equal(result.completedTask.status, 'finished');
    assert.ok(result.evidence.fileHashes['service.js']);

    // Check evidence file
    const evidencePath = path.join(tmpDir, '.moskills', 'runs', runId, 'evidence', 'check-srv.json');
    assert.equal(fs.existsSync(evidencePath), true);
    const saved = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    assert.equal(saved.exitCode, 0);
    assert.match(saved.stdout, /All good/);

    // Check event stream
    const eventsPath = path.join(tmpDir, '.moskills', 'runs', runId, 'events.ndjson');
    const events = fs.readFileSync(eventsPath, 'utf8').trim().split('\n').map(JSON.parse);
    const wrappedEvent = events.find(e => e.type === 'CHECK_WRAPPED');
    assert.ok(wrappedEvent);
    assert.equal(wrappedEvent.data.checkId, 'check-srv');
    assert.equal(wrappedEvent.data.exitCode, 0);
  });

  await t.test('wrapCheck preserves failure exit code and prevents task completion', () => {
    const result = engine.wrapCheck({
      runId,
      checkId: 'check-fail',
      command: 'sh -c "echo \\"test assertion failed\\" >&2; exit 42"',
      cwd: tmpDir,
      taskId: 'task-srv',
      autoComplete: true
    });

    assert.equal(result.exitCode, 42);
    assert.equal(result.taskCompleted, false);
    assert.match(result.evidence.stderr, /test assertion failed/);
  });

  await t.test('CLI integration: moskills run-state wrap forward command and exit codes', () => {
    const cliPath = path.resolve(__dirname, '../lib/run-state-cli.cjs');
    const runIdCli = 'cli-wrap-run';

    // Init run
    spawnSync('node', [
      cliPath, 'init',
      '--id', runIdCli,
      '--target', tmpDir,
      '--goal', 'CLI Wrap Test',
      '--scope', 'service.js',
      '--tasks', 'Run Tests'
    ]);

    // Successful wrap with --
    const successRes = spawnSync('node', [
      cliPath, 'wrap',
      '--id', runIdCli,
      '--target', tmpDir,
      '--task', 'task-1',
      '--check', 'c-ok',
      '--auto-complete',
      '--',
      'node', '-e', 'console.log("CLI test output"); process.exit(0);'
    ], { encoding: 'utf8' });

    assert.equal(successRes.status, 0);
    assert.match(successRes.stdout, /CLI test output/);
    assert.match(successRes.stdout, /Evidence recorded for check c-ok/);
    assert.match(successRes.stdout, /\[Task task-1 completed\]/);

    // Failing wrap forwards exact non-zero exit code
    const failRes = spawnSync('node', [
      cliPath, 'wrap',
      '--id', runIdCli,
      '--target', tmpDir,
      '--task', 'task-1',
      '--check', 'c-bad',
      '--',
      'sh', '-c', 'echo "something crashed" >&2; exit 7'
    ], { encoding: 'utf8' });

    assert.equal(failRes.status, 7);
    assert.match(failRes.stderr, /something crashed/);
  });
});
