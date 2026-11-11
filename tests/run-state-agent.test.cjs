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
  const written = block(dir);
  assert.match(written, /stale/);
  assert.doesNotMatch(written, /finished with current proof/);
  const run = JSON.parse(fs.readFileSync(path.join(dir, '.moskills/runs/default/run.json'), 'utf8'));
  assert.equal(run.tasks[0].status, 'finished', 'views never write the run');
});

// Accepted rule linked to the task, so `rules` has a proof status to agree with the block.
function withRule(dir) {
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/rules.md'), [
    '# Business rules', '', '## Rules', '',
    '| ID | Rule | Expected (measurable) | Proof | State | Source |',
    '| --- | --- | --- | --- | --- | --- |',
    '| BR-001 | When a.js loads, the system shall export 1 | exports 1 | true | accepted | prd |',
    ''
  ].join('\n'));
}
function ruleStatus(stdout) {
  const line = stdout.split('\n').find(l => l.startsWith('BR-001'));
  assert.ok(line, stdout);
  return line.trim().split(/\s+/)[2];
}
function readRun(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.moskills/runs/default/run.json'), 'utf8'));
}
function provenProject(name) {
  const dir = seeded(name);
  withRule(dir);
  assert.equal(runState(dir, ['init', '--goal', 'g', '--scope', 'a.js', '--tasks', 'one', '--rules', 'BR-001']).status, 0);
  assert.equal(runState(dir, ['link', '--task', 'task-1', '--rules', 'BR-001']).status, 0);
  assert.equal(runState(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']).status, 0);
  return dir;
}

test('run-state status reports stale proof and refreshes the STATE.md block', () => {
  const dir = seeded('status-live');
  assert.equal(runState(dir, ['init', '--goal', 'g', '--scope', 'a.js', '--tasks', 'one']).status, 0);
  assert.equal(runState(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']).status, 0);
  assert.match(block(dir), /1\/1 tasks finished with current proof/);

  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 2;\n');
  const r = runState(dir, ['status']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /task-1 \[stale\]/);
  assert.doesNotMatch(r.stdout, /task-1 \[finished\]/);
  const written = block(dir);
  assert.match(written, /stale proof/);
  assert.match(written, /still not done \(proof stale\)/);
  assert.doesNotMatch(written, /finished with current proof/);
  assert.equal(readRun(dir).tasks[0].status, 'finished', 'status does not rewrite the run');
});

test('an unchanged proof refresh does not rewrite STATE.md', () => {
  const dir = seeded('notes-noop');
  assert.equal(runState(dir, ['init', '--goal', 'g', '--scope', 'a.js', '--tasks', 'one']).status, 0);
  assert.equal(runState(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']).status, 0);
  const file = path.join(dir, '.claude/STATE.md');
  const before = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(block(dir), /\d{4}-\d{2}-\d{2}/, 'the generated block has no clock timestamp');
  const mtime = fs.statSync(file).mtimeMs;
  context(dir);
  assert.equal(runState(dir, ['notes']).status, 0);
  context(dir, ['--event', 'UserPromptSubmit']);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(fs.statSync(file).mtimeMs, mtime);
});

test('an edited proven file is stale in STATE.md and rules before resume', () => {
  const dir = provenProject('story-stale');
  const finished = block(dir);
  assert.match(finished, /1\/1 tasks finished with current proof/);
  assert.match(finished, /\| task-1 one \| finished \|/);
  assert.equal(ruleStatus(runState(dir, ['rules']).stdout), 'proven');

  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 2;\n');
  const rulesOut = runState(dir, ['rules']).stdout;
  const status = ruleStatus(rulesOut);
  assert.equal(status, 'stale');
  const written = block(dir);
  assert.match(written, /stale/);
  assert.doesNotMatch(written, /finished with current proof/);
  assert.match(written, new RegExp(status));
  assert.match(context(dir), /stale proof: task-1/);
  assert.equal(readRun(dir).tasks[0].status, 'finished', 'rules and context do not rewrite the run');
});

test('a failing re-wrap is failing in STATE.md, rules, and run.json, then a green re-wrap is finished', () => {
  const dir = provenProject('story-failing');
  const original = fs.readFileSync(path.join(dir, 'a.js'), 'utf8');
  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 2;\n');
  assert.notEqual(runState(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'false']).status, 0);

  const written = block(dir);
  assert.match(written, /failing/);
  assert.doesNotMatch(written, /stale/);
  assert.doesNotMatch(written, /\bfailed\b/);
  assert.doesNotMatch(written, /finished with current proof/);
  assert.equal(ruleStatus(runState(dir, ['rules']).stdout), 'failing');
  assert.equal(readRun(dir).tasks[0].status, 'failing');

  fs.writeFileSync(path.join(dir, 'a.js'), original);
  assert.equal(runState(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']).status, 0);
  const restored = block(dir);
  assert.match(restored, /1\/1 tasks finished with current proof/);
  assert.match(restored, /\| task-1 one \| finished \|/);
  assert.equal(ruleStatus(runState(dir, ['rules']).stdout), 'proven');
  assert.equal(readRun(dir).tasks[0].status, 'finished');
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
