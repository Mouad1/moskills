'use strict';
// The commit gate denies `git commit` while a run-state task covering the
// changed files has missing, failed, or stale proof. Claude Code gets deny
// JSON and exit 2. The git pre-commit hook exits non-zero. Bad input does
// not fail open. MOSKILLS_NO_COMMIT_GATE=1 is the only skip.
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
function gate(dir, command, extraEnv = {}, expectStatus = 0) {
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: dir, tool_input: { command } });
  const r = spawnSync('sh', [cli, 'commit-gate'], { cwd: dir, input, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, expectStatus, `exit ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
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
  const reason = denied(gate(dir, 'git add a.js && git commit -m "build"', {}, 2));
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
  assert.equal(r.status, 2, r.stderr);
  denied(r.stdout.trim());
});

test('MOSKILLS_NO_COMMIT_GATE=1 turns it off', () => {
  const dir = repo('optout');
  provenRun(dir);
  fs.writeFileSync(path.join(dir, 'a.js'), 'changed after proof\n');
  assert.equal(gate(dir, 'git commit -am x', { MOSKILLS_NO_COMMIT_GATE: '1' }), '');
});

test('a failed check names the file', () => {
  const dir = repo('failed');
  provenRun(dir);
  const wrap = spawnSync('node', [path.join(root, 'lib/run-state-cli.cjs'), 'wrap', '--task', 'task-1', '--silent', '--', 'false'], {
    cwd: dir, env, encoding: 'utf8', timeout: 60000
  });
  assert.equal(wrap.status, 1, wrap.stderr);
  const reason = denied(gate(dir, 'git commit -am "build"', {}, 2));
  assert.match(reason, /task-1/);
  assert.match(reason, /a\.js/);
  assert.match(reason, /failed/);
  assert.match(reason, /run-state wrap/);
});

test('bad input does not fail open', () => {
  for (const input of ['not json', '']) {
    const r = spawnSync('sh', [cli, 'commit-gate'], { cwd: scratch, input, env, encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 2, r.stderr);
    assert.notEqual(r.stdout.trim(), '');
    const o = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(o.hookEventName, 'PreToolUse');
    assert.equal(o.permissionDecision, 'deny');
    assert.match(r.stderr, /commit gate/);
  }
});

test('plugin commit gate blocks on failure and does not swallow errors', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(root, 'hooks/hooks.json'), 'utf8')).hooks;
  const bash = (hooks.PreToolUse || []).filter(e => e.matcher === 'Bash');
  const gateHook = bash.flatMap(e => e.hooks).find(h => h.command.includes('commit-gate'));
  assert.ok(gateHook, 'PreToolUse Bash hook must call commit-gate');
  assert.equal(gateHook.onFailure, 'block');
  assert.doesNotMatch(gateHook.command, /\|\| true/);
  assert.doesNotMatch(gateHook.command, /2>\/dev\/null/);
  const visual = (hooks.PostToolUse || []).flatMap(e => e.hooks).find(h => h.command.includes('visual-flag'));
  assert.ok(visual);
  assert.doesNotMatch(visual.command, /\|\| true/);
  assert.doesNotMatch(visual.command, /2>\/dev\/null/);
});

test('npm bin exposes commit-gate and visual-flag', () => {
  const bin = path.join(root, 'bin/moskills.cjs');
  const help = spawnSync(process.execPath, [bin, 'commit-gate', '--help'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(help.status, 0, help.stderr);
  assert.doesNotMatch(help.stdout + help.stderr, /unknown command/);
  assert.match(help.stdout, /commit-gate|proof/);
  const visual = spawnSync(process.execPath, [bin, 'visual-flag', '--help'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(visual.status, 0, visual.stderr);
  assert.doesNotMatch(visual.stdout + visual.stderr, /unknown command/);
  const dir = repo('npm-bin');
  provenRun(dir);
  fs.writeFileSync(path.join(dir, 'a.js'), 'changed after proof\n');
  const input = JSON.stringify({ cwd: dir, tool_input: { command: 'git commit -am x' } });
  const stale = spawnSync(process.execPath, [bin, 'commit-gate'], { input, encoding: 'utf8', timeout: 60000 });
  assert.doesNotMatch(stale.stdout + stale.stderr, /unknown command/);
  assert.equal(stale.status, 2, stale.stderr + stale.stdout);
  assert.match(stale.stdout, /"permissionDecision":"deny"/);
  assert.match(stale.stdout, /task-1/);
  const garbage = spawnSync(process.execPath, [bin, 'commit-gate'], { input: 'not json', encoding: 'utf8', timeout: 30000 });
  assert.notEqual(garbage.status, 0);
  assert.notEqual((garbage.stdout + garbage.stderr).trim(), '');
  assert.doesNotMatch(garbage.stdout + garbage.stderr, /unknown command/);
});

// Installed project: moskills init, a passing wrap, then a real git commit.
function installed(name) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir);
  sh(dir, 'git', ['init', '-q']);
  sh(dir, 'git', ['config', 'user.email', 't@t']);
  sh(dir, 'git', ['config', 'user.name', 't']);
  sh(dir, 'git', ['config', 'commit.gpgsign', 'false']);
  sh(dir, 'sh', [cli, 'init', '--target', dir]);
  return dir;
}
function gitCommit(dir, args) {
  return spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', ...args], {
    cwd: dir, env, encoding: 'utf8', timeout: 60000
  });
}

test('git commit of a stale proven file exits non-zero and names the task', () => {
  const dir = installed('git-stale');
  const rs = path.join(root, 'lib/run-state-cli.cjs');
  fs.writeFileSync(path.join(dir, 'price.cjs'), 'module.exports = 800;\n');
  sh(dir, 'node', [rs, 'init', '--goal', 'g', '--scope', 'price.cjs', '--tasks', 'prove discount']);
  sh(dir, 'node', [rs, 'wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
  fs.writeFileSync(path.join(dir, 'price.cjs'), 'module.exports = 800;\n// stale-proof check\n');
  sh(dir, 'git', ['add', 'price.cjs']);
  const commit = gitCommit(dir, ['-m', 'lab edit after proof']);
  assert.notEqual(commit.status, 0, `git commit exited ${commit.status}\nstdout: ${commit.stdout}\nstderr: ${commit.stderr}`);
  assert.match(commit.stderr, /task-1/);
  assert.match(commit.stderr, /price\.cjs/);
  assert.match(commit.stderr, /run-state wrap/);
  const landed = spawnSync('git', ['rev-list', '--all'], { cwd: dir, env, encoding: 'utf8', timeout: 60000 });
  assert.equal(landed.stdout.trim(), '', 'a refused commit must not land');
});

test('git commit is allowed when the staged proof is current', () => {
  const dir = installed('git-current');
  const rs = path.join(root, 'lib/run-state-cli.cjs');
  fs.writeFileSync(path.join(dir, 'price.cjs'), 'module.exports = 800;\n');
  sh(dir, 'node', [rs, 'init', '--goal', 'g', '--scope', 'price.cjs', '--tasks', 'prove discount']);
  sh(dir, 'node', [rs, 'wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
  sh(dir, 'git', ['add', 'price.cjs']);
  const commit = gitCommit(dir, ['-m', 'proven']);
  assert.equal(commit.status, 0, commit.stdout + commit.stderr);
  assert.match(sh(dir, 'git', ['log', '--oneline']), /proven/);
});

test('git commit of a failed proof exits non-zero and names the file', () => {
  const dir = installed('git-failed');
  const rs = path.join(root, 'lib/run-state-cli.cjs');
  fs.writeFileSync(path.join(dir, 'price.cjs'), 'module.exports = 800;\n');
  sh(dir, 'node', [rs, 'init', '--goal', 'g', '--scope', 'price.cjs', '--tasks', 'prove discount']);
  sh(dir, 'node', [rs, 'wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
  const wrap = spawnSync('node', [rs, 'wrap', '--task', 'task-1', '--silent', '--', 'false'], {
    cwd: dir, env, encoding: 'utf8', timeout: 60000
  });
  assert.equal(wrap.status, 1, wrap.stderr);
  sh(dir, 'git', ['add', 'price.cjs']);
  const commit = gitCommit(dir, ['-m', 'after a failed check']);
  assert.notEqual(commit.status, 0, commit.stdout + commit.stderr);
  assert.match(commit.stderr, /task-1/);
  assert.match(commit.stderr, /price\.cjs/);
  assert.match(commit.stderr, /failed/);
  assert.match(commit.stderr, /run-state wrap/);
});

test('MOSKILLS_NO_COMMIT_GATE=1 is the only way through a stale git commit', () => {
  const dir = installed('git-optout');
  const rs = path.join(root, 'lib/run-state-cli.cjs');
  fs.writeFileSync(path.join(dir, 'price.cjs'), 'module.exports = 800;\n');
  sh(dir, 'node', [rs, 'init', '--goal', 'g', '--scope', 'price.cjs', '--tasks', 'prove discount']);
  sh(dir, 'node', [rs, 'wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
  fs.writeFileSync(path.join(dir, 'price.cjs'), 'module.exports = 800;\n// stale\n');
  sh(dir, 'git', ['add', 'price.cjs']);
  const commit = spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-m', 'override'], {
    cwd: dir, env: { ...env, MOSKILLS_NO_COMMIT_GATE: '1' }, encoding: 'utf8', timeout: 60000
  });
  assert.equal(commit.status, 0, commit.stdout + commit.stderr);
});

test('git commit that deletes a proven file exits non-zero', () => {
  const dir = installed('git-delete');
  const rs = path.join(root, 'lib/run-state-cli.cjs');
  fs.writeFileSync(path.join(dir, 'price.cjs'), 'module.exports = 800;\n');
  sh(dir, 'node', [rs, 'init', '--goal', 'g', '--scope', 'price.cjs', '--tasks', 'prove discount']);
  sh(dir, 'node', [rs, 'wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
  sh(dir, 'git', ['add', 'price.cjs']);
  const first = gitCommit(dir, ['-m', 'proven']);
  assert.equal(first.status, 0, first.stdout + first.stderr);
  sh(dir, 'git', ['rm', '-q', 'price.cjs']);
  const commit = gitCommit(dir, ['-m', 'drop the proven file']);
  assert.notEqual(commit.status, 0, commit.stdout + commit.stderr);
  assert.match(commit.stderr, /task-1/);
  assert.match(commit.stderr, /price\.cjs/);
  assert.match(commit.stderr, /run-state wrap/);
});

test('TODO: implement later still exits 1', () => {
  const dir = installed('git-placeholder');
  fs.writeFileSync(path.join(dir, 'note.txt'), 'TODO: implement later\n');
  sh(dir, 'git', ['add', 'note.txt']);
  const commit = gitCommit(dir, ['-m', 'placeholder']);
  assert.equal(commit.status, 1, commit.stdout + commit.stderr);
  assert.match(commit.stdout + commit.stderr, /blocked placeholder phrase/);
  assert.match(commit.stdout + commit.stderr, /note\.txt/);
});
