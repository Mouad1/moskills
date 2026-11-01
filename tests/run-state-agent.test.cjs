'use strict';
// The pieces agents rely on to drive a run: safe init, and the run lines in
// the plan reminder (moskills context).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills run agent '));
const env = { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1' };
delete env.MOSKILLS_NO_CONTEXT;
delete env.MOSKILLS_DISTRIBUTION;
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function project(name) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, '.moskills.json'), '{}');
  return dir;
}
function runState(dir, args) {
  return spawnSync('node', [path.join(root, 'lib/run-state-cli.cjs'), ...args],
    { cwd: dir, env, encoding: 'utf8', timeout: 60000 });
}
function context(dir, args = []) {
  const r = spawnSync('sh', [path.join(root, 'moskills'), 'context', '--target', dir, ...args],
    { env, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test('init refuses to replace an existing run unless --force', () => {
  const dir = project('init-guard');
  assert.equal(runState(dir, ['init', '--goal', 'first', '--tasks', 'a']).status, 0);
  const again = runState(dir, ['init', '--goal', 'second']);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /already exists/);
  const run = JSON.parse(fs.readFileSync(path.join(dir, '.moskills/runs/default/run.json'), 'utf8'));
  assert.equal(run.goal, 'first');
  assert.equal(runState(dir, ['init', '--goal', 'third', '--force']).status, 0);
});

test('context shows the active run and the exact proof command', () => {
  const dir = project('context-run');
  runState(dir, ['init', '--goal', 'Ship "quotes"', '--tasks', 'write tests,implement']);
  const lines = context(dir).trimEnd().split('\n');
  assert.equal(lines[0], 'Active run: default - Ship "quotes"');
  assert.equal(lines[1], 'Run tasks: 0/2 finished; next ready: task-1 (write tests)');
  assert.equal(lines[2], 'Human acceptance: pending');
  assert.match(lines[3], /^Record proof: sh '.*moskills' run-state wrap --id default --task <task> --auto-complete -- <check command>$/);
});

test('context follows the run as proof is recorded', () => {
  const dir = project('context-progress');
  runState(dir, ['init', '--goal', 'g', '--tasks', 'one,two']);
  assert.equal(runState(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']).status, 0);
  assert.match(context(dir), /Run tasks: 1\/2 finished; next ready: task-2 \(two\)/);
  assert.notEqual(runState(dir, ['wrap', '--task', 'task-2', '--auto-complete', '--silent', '--', 'false']).status, 0);
  assert.match(context(dir), /Run tasks: 1\/2 finished/);
});

test('hook JSON carries the run lines even without saved notes', () => {
  const dir = project('context-hook-run');
  runState(dir, ['init', '--goal', 'g', '--tasks', 'x']);
  const out = JSON.parse(context(dir, ['--event', 'UserPromptSubmit']));
  assert.match(out.hookSpecificOutput.additionalContext, /Active run: default - g\nRun tasks: 0\/1 finished/);
});

test('npm installs show the bare moskills command', () => {
  const dir = project('context-npm');
  runState(dir, ['init', '--goal', 'g', '--tasks', 'x']);
  const r = spawnSync('sh', [path.join(root, 'moskills'), 'context', '--target', dir],
    { env: { ...env, MOSKILLS_DISTRIBUTION: 'npm' }, encoding: 'utf8' });
  assert.match(r.stdout, /Record proof: moskills run-state wrap/);
});

test('standard and skills route checks through the run when one exists', () => {
  const read = f => fs.readFileSync(path.join(root, f), 'utf8');
  assert.match(read('templates/managed/base.md'), /## Run state/);
  assert.doesNotMatch(read('templates/managed/base.md'), /not a runtime workflow engine/);
  assert.match(read('templates/managed/session-protocol.md'), /run-state resume/);
  assert.match(read('templates/claude/skills/gatekeeper/SKILL.md'), /run-state wrap --task <id> --auto-complete/);
  assert.match(read('templates/claude/skills/gatekeeper/SKILL.md'), /only after the user explicitly approves/);
  assert.match(read('templates/claude/skills/checkpoint/SKILL.md'), /run-state resume/);
  assert.match(read('templates/claude/skills/handoff/SKILL.md'), /run-state resume/);
  assert.match(read('templates/claude/skills/align-intent/SKILL.md'), /run-state init/);
});

function seeded(name) {
  const dir = project(name);
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.copyFileSync(path.join(root, 'templates/project/STATE.md'), path.join(dir, '.claude/STATE.md'));
  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1;\n');
  return dir;
}
const block = dir => {
  const s = fs.readFileSync(path.join(dir, '.claude/STATE.md'), 'utf8');
  return s.slice(s.indexOf('<!-- moskills:run:begin'), s.indexOf('<!-- moskills:run:end -->'));
};

test('commands that change the run rewrite one Run proof block in STATE.md', () => {
  const dir = seeded('notes-block');
  runState(dir, ['init', '--goal', 'g', '--scope', 'a.js', '--tasks', 'one,two']);
  runState(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
  assert.notEqual(runState(dir, ['wrap', '--task', 'task-2', '--auto-complete', '--silent', '--', 'false']).status, 0);
  const b = block(dir);
  assert.match(b, /1\/2 tasks finished with current proof/);
  assert.match(b, /\| task-1 one \| finished \| check-task-1: passed \(exit 0\)/);
  assert.match(b, /\| task-2 two \| still not done \| check-task-2: failed \(exit 1\)/);
  const text = fs.readFileSync(path.join(dir, '.claude/STATE.md'), 'utf8');
  assert.equal(text.split('moskills:run:begin').length, 2, 'exactly one block');
  assert.ok(text.indexOf('moskills:run:begin') < text.indexOf('## Finished'), 'block sits before Finished');
});

test('status keeps the five note lines and adds the run lines', () => {
  const dir = seeded('notes-status');
  runState(dir, ['init', '--goal', 'g', '--tasks', 'one']);
  const r = spawnSync('sh', [path.join(root, 'moskills'), 'status', '--target', dir], { env, encoding: 'utf8' });
  assert.equal(r.stdout, 'Goal: unknown\nFinished (recorded): unknown\nStill not done: unknown\nBlocker: unknown\nNext: unknown\n' +
    'Active run: default - g\nRun tasks: 0/1 finished; next ready: task-1 (one)\nHuman acceptance: pending\n');
});

test('stale proof shows in the reminder before anyone runs resume', () => {
  const dir = seeded('live-stale');
  runState(dir, ['init', '--goal', 'g', '--scope', 'a.js', '--tasks', 'one']);
  runState(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
  assert.match(context(dir), /Run tasks: 1\/1 finished/);
  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 2;\n');
  assert.match(context(dir), /Run tasks: 0\/1 finished; stale proof: task-1 \(run resume\)/);
  assert.match(runState(dir, ['notes', '--print']).stdout, /still not done \(proof stale\)/);
  const run = JSON.parse(fs.readFileSync(path.join(dir, '.moskills/runs/default/run.json'), 'utf8'));
  assert.equal(run.tasks[0].status, 'finished', 'views never write the run');
});

test('the reminder names tasks held by another agent', () => {
  const dir = seeded('held');
  runState(dir, ['init', '--goal', 'g', '--tasks', 'one,two']);
  assert.equal(runState(dir, ['lease', '--task', 'task-1', '--agent', 'agent-b', '--ttl', '600000']).status, 0);
  assert.match(context(dir), /held: task-1 by agent-b/);
});

test('doctor reports run-state readiness without failing', () => {
  const dir = seeded('doctor');
  runState(dir, ['init', '--goal', 'g', '--tasks', 'one']);
  const r = spawnSync('sh', [path.join(root, 'moskills'), 'doctor', '--target', dir], { env, encoding: 'utf8' });
  assert.match(r.stdout, /run-state: ready \(node v\d+[^)]*\), 1 run\(s\)/);
});
