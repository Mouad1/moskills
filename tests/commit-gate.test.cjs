'use strict';
// The commit gate is a Claude Code PreToolUse hook on Bash. When a run exists,
// it denies `git commit` while a task covering changed files has missing,
// failed or stale proof. Everything else passes through untouched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'moskills');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills gate '));
const env = { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1', MOSKILLS_NO_NOTES: '1' };
delete env.MOSKILLS_NO_COMMIT_GATE;
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function sh(dir, cmd, args) {
  const r = spawnSync(cmd, args, { cwd: dir, env, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `${cmd} ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}
function repo(name) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir);
  sh(dir, 'git', ['init', '-q']);
  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(dir, 'b.js'), 'module.exports = 2;\n');
  sh(dir, 'git', ['add', '.']);
  sh(dir, 'git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init']);
  return dir;
}
function provenRun(dir) {
  const rs = path.join(root, 'lib/run-state-cli.cjs');
  sh(dir, 'node', [rs, 'init', '--goal', 'g', '--scope', 'a.js', '--tasks', 'build']);
  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 10;\n');
  sh(dir, 'node', [rs, 'wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
}
function gate(dir, command, extraEnv = {}) {
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: dir, tool_input: { command } });
  const r = spawnSync('sh', [cli, 'commit-gate'], { cwd: dir, input, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function denied(out) {
  const o = JSON.parse(out).hookSpecificOutput;
  assert.equal(o.hookEventName, 'PreToolUse');
  assert.equal(o.permissionDecision, 'deny');
  return o.permissionDecisionReason;
}

test('ignores commands that are not git commit', () => {
  const dir = repo('other');
  provenRun(dir);
  fs.writeFileSync(path.join(dir, 'a.js'), 'changed after proof\n');
  assert.equal(gate(dir, 'npm test'), '');
  assert.equal(gate(dir, 'git status && git log --oneline -3'), '');
  assert.equal(gate(dir, 'echo "git commit later"'), '');
});

test('allows commits when no run exists', () => {
  const dir = repo('no-run');
  fs.writeFileSync(path.join(dir, 'a.js'), 'changed\n');
  assert.equal(gate(dir, 'git commit -am "x"'), '');
});

test('allows a commit whose proof is current', () => {
  const dir = repo('current');
  provenRun(dir);
  assert.equal(gate(dir, 'git add a.js && git commit -m "build"'), '');
});

test('denies a commit when a changed file made the proof stale', () => {
  const dir = repo('stale');
  provenRun(dir);
  fs.writeFileSync(path.join(dir, 'a.js'), 'changed after proof\n');
  const reason = denied(gate(dir, 'git add a.js && git commit -m "build"'));
  assert.match(reason, /task-1/);
  assert.match(reason, /a\.js/);
  assert.match(reason, /run-state wrap/);
});

test('changes outside every proven check do not block', () => {
  const dir = repo('outside');
  provenRun(dir);
  fs.writeFileSync(path.join(dir, 'b.js'), 'unrelated\n');
  assert.equal(gate(dir, 'git commit -am "b"'), '');
});

test('follows git -C to the repository being committed', () => {
  const dir = repo('dash-c');
  provenRun(dir);
  fs.writeFileSync(path.join(dir, 'a.js'), 'changed after proof\n');
  const elsewhere = path.join(scratch, 'elsewhere');
  fs.mkdirSync(elsewhere, { recursive: true });
  const input = JSON.stringify({ tool_name: 'Bash', cwd: elsewhere, tool_input: { command: `git -C "${dir}" commit -m x` } });
  const r = spawnSync('sh', [cli, 'commit-gate'], { cwd: elsewhere, input, env, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  denied(r.stdout.trim());
});

test('MOSKILLS_NO_COMMIT_GATE=1 turns it off', () => {
  const dir = repo('optout');
  provenRun(dir);
  fs.writeFileSync(path.join(dir, 'a.js'), 'changed after proof\n');
  assert.equal(gate(dir, 'git commit -am x', { MOSKILLS_NO_COMMIT_GATE: '1' }), '');
});

test('bad input never blocks', () => {
  const r = spawnSync('sh', [cli, 'commit-gate'], { cwd: scratch, input: 'not json', env, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '');
});

test('plugin registers the gate as a PreToolUse hook on Bash', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(root, 'hooks/hooks.json'), 'utf8')).hooks;
  const bash = (hooks.PreToolUse || []).filter(e => e.matcher === 'Bash');
  assert.ok(bash.flatMap(e => e.hooks.map(h => h.command)).some(c => c.includes('commit-gate')));
});
