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
const { RunStateEngine } = require('../lib/run-state.cjs');
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

test('git add is seen when the cwd is a symlink to the repo', () => {
  const dir = repo('symlink-real');
  provenRun(dir);
  fs.writeFileSync(path.join(dir, 'a.js'), 'changed after proof\n');
  const link = path.join(scratch, 'symlink-cwd');
  fs.symlinkSync(dir, link);
  const reason = denied(gate(link, 'git add a.js && git commit -m build', {}, 2));
  assert.match(reason, /a\.js/);
  assert.match(reason, /task-1/);
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
  sh(dir, 'git', ['add', 'a.js']);
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

test('git commit checks the staged content, not the working tree', () => {
  const rs = path.join(root, 'lib/run-state-cli.cjs');
  const proven = 'module.exports = 800;\n';
  const setup = name => {
    const dir = installed(name);
    fs.writeFileSync(path.join(dir, 'price.cjs'), proven);
    sh(dir, 'node', [rs, 'init', '--goal', 'g', '--scope', 'price.cjs', '--tasks', 'prove discount']);
    sh(dir, 'node', [rs, 'wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
    return dir;
  };
  // Stale bytes staged, proven bytes back on disk: the commit would carry the stale file.
  const stale = setup('git-staged-stale');
  fs.writeFileSync(path.join(stale, 'price.cjs'), 'module.exports = 1;\n');
  sh(stale, 'git', ['add', 'price.cjs']);
  fs.writeFileSync(path.join(stale, 'price.cjs'), proven);
  const refused = gitCommit(stale, ['-m', 'stale blob']);
  assert.notEqual(refused.status, 0, `stale staged blob committed\n${refused.stdout}${refused.stderr}`);
  assert.match(refused.stderr, /task-1/);
  assert.match(refused.stderr, /price\.cjs/);
  // Proven bytes staged, unproven edit only on disk: the commit carries the proven file.
  const current = setup('git-staged-current');
  sh(current, 'git', ['add', 'price.cjs']);
  fs.writeFileSync(path.join(current, 'price.cjs'), 'module.exports = 2; // not staged\n');
  const allowed = gitCommit(current, ['-m', 'proven blob']);
  assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);
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

function runState(dir, args) {
  sh(dir, 'node', [path.join(root, 'lib/run-state-cli.cjs'), ...args]);
}

// A scoped file that has never been checked is "missing" proof. Both gates
// must refuse it and name the wrap command.
test('a staged in-scope file with no proof blocks the commit', () => {
  const dir = installed('missing-proof');
  runState(dir, ['init', '--id', 'r2', '--goal', 'tax', '--scope', 'tax.cjs', '--tasks', 'tax']);
  fs.writeFileSync(path.join(dir, 'tax.cjs'), 'module.exports = 1;\n');
  const engine = new RunStateEngine(dir);
  assert.ok(engine.getImpactedTasks('r2', ['tax.cjs']).impactedTaskIds.includes('task-1'));
  assert.deepEqual(engine.getImpactedTasks('r2', ['note.txt']).impactedTaskIds, []);

  fs.writeFileSync(path.join(dir, 'note.txt'), 'outside the run scope\n');
  sh(dir, 'git', ['add', 'note.txt']);
  const outside = gitCommit(dir, ['-m', 'note']);
  assert.equal(outside.status, 0, outside.stdout + outside.stderr);

  sh(dir, 'git', ['add', 'tax.cjs']);
  const commit = gitCommit(dir, ['-m', 'tax']);
  assert.notEqual(commit.status, 0, commit.stdout + commit.stderr);
  const text = commit.stderr;
  assert.match(text, /missing/);
  assert.match(text, /no proof recorded/);
  assert.match(text, /tax\.cjs/);
  assert.match(text, /task-1/);
  assert.match(text, /run r2/);
  assert.match(text, /moskills run-state wrap --id r2 --task task-1 --auto-complete --/);
  assert.match(text, /git pre-commit hook/);
  assert.match(text, /will not bypass/);

  const reason = denied(gate(dir, 'git commit -m tax', {}, 2));
  assert.match(reason, /missing/);
  assert.match(reason, /no proof recorded/);
  assert.match(reason, /tax\.cjs/);
  assert.match(reason, /moskills run-state wrap --id r2 --task task-1 --auto-complete --/);
  assert.match(reason, /git pre-commit hook/);
  assert.match(reason, /will not bypass/);
});

// The git hook and PreToolUse must judge the files the commit would contain.
// An unstaged edit of a proven file does not deny a commit of something else.
// `git commit -a` / `-am` would include that tracked edit, so those deny.
test('unstaged edits do not deny a commit that leaves them out', () => {
  const dir = installed('same-files');
  fs.writeFileSync(path.join(dir, 'price.cjs'), 'module.exports = 800;\n');
  runState(dir, ['init', '--goal', 'g', '--scope', 'price.cjs', '--tasks', 'prove discount']);
  runState(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
  sh(dir, 'git', ['add', 'price.cjs']);
  const proven = gitCommit(dir, ['-m', 'proven']);
  assert.equal(proven.status, 0, proven.stdout + proven.stderr);

  fs.writeFileSync(path.join(dir, 'price.cjs'), 'module.exports = 800;\n// stale\n');
  fs.writeFileSync(path.join(dir, 'other.txt'), 'unrelated\n');
  sh(dir, 'git', ['add', 'other.txt']);

  assert.equal(gate(dir, 'git commit -m other'), '');
  assert.equal(gate(dir, 'git add other.txt && git commit -m other'), '');
  const commit = gitCommit(dir, ['-m', 'other']);
  assert.equal(commit.status, 0, commit.stdout + commit.stderr);
  assert.match(sh(dir, 'git', ['log', '--oneline']), /other/);

  for (const command of ['git commit -am x', 'git commit -a -m x', 'git commit --all -m x']) {
    const reason = denied(gate(dir, command, {}, 2));
    assert.match(reason, /price\.cjs/);
    assert.match(reason, /task-1/);
    assert.match(reason, /git pre-commit hook/);
    assert.match(reason, /moskills run-state wrap --id default --task task-1 --auto-complete --/);
  }
});

test('bash -c and sh -c commits are judged like a direct git commit', () => {
  const dir = installed('shell-c');
  fs.writeFileSync(path.join(dir, 'price.cjs'), 'module.exports = 800;\n');
  runState(dir, ['init', '--goal', 'g', '--scope', 'price.cjs', '--tasks', 'prove discount']);
  runState(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
  sh(dir, 'git', ['add', 'price.cjs']);
  const proven = gitCommit(dir, ['-m', 'proven']);
  assert.equal(proven.status, 0, proven.stdout + proven.stderr);
  fs.writeFileSync(path.join(dir, 'price.cjs'), 'module.exports = 800;\n// stale\n');

  assert.equal(gate(dir, "bash -c 'git status'"), '');
  assert.equal(gate(dir, 'sh -c "git status"'), '');
  for (const command of [
    "bash -c 'git commit -am x'",
    'sh -c "git commit -am x"',
    "bash -lc 'git commit -a -m x'"
  ]) {
    const reason = denied(gate(dir, command, {}, 2));
    assert.match(reason, /price\.cjs/);
    assert.match(reason, /git pre-commit hook/);
    assert.match(reason, /moskills run-state wrap --id default --task task-1 --auto-complete -- true/);
  }
});

// A task can have a passing check and still leave a scoped file with no
// proof. That staged file is missing, same as a task that has no checks.
test('a staged in-scope file the check does not cover is missing proof', () => {
  const dir = installed('partial-scope');
  fs.writeFileSync(path.join(dir, 'price.cjs'), 'module.exports = 800;\n');
  fs.writeFileSync(path.join(dir, 'price.test.cjs'), 'ok\n');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'price.cjs'), 'module.exports = 1;\n');
  runState(dir, ['init', '--id', 'default', '--scope', 'price.cjs,price.test.cjs,src/price.cjs', '--tasks', 'price total']);
  runState(dir, ['wrap', '--id', 'default', '--task', 'task-1', '--files', 'price.cjs,price.test.cjs', '--auto-complete', '--silent', '--', 'true']);

  sh(dir, 'git', ['add', 'price.cjs', 'price.test.cjs']);
  const covered = gitCommit(dir, ['-m', 'covered']);
  assert.equal(covered.status, 0, covered.stdout + covered.stderr);

  fs.writeFileSync(path.join(dir, 'src', 'price.cjs'), 'x\n');
  fs.writeFileSync(path.join(dir, 'note.txt'), 'outside the run scope\n');
  sh(dir, 'git', ['add', 'note.txt']);
  assert.equal(gate(dir, 'git commit -m note'), '');
  const outside = gitCommit(dir, ['-m', 'note']);
  assert.equal(outside.status, 0, outside.stdout + outside.stderr);

  sh(dir, 'git', ['add', 'src/price.cjs']);
  const commit = gitCommit(dir, ['-m', 'x']);
  assert.notEqual(commit.status, 0, commit.stdout + commit.stderr);
  assert.match(commit.stderr, /src\/price\.cjs/);
  assert.match(commit.stderr, /missing/);
  assert.match(commit.stderr, /no proof recorded/);
  assert.match(commit.stderr, /task-1/);
  assert.match(commit.stderr, /moskills run-state wrap --id default --task task-1 --auto-complete --/);
  const landed = spawnSync('git', ['log', '--oneline'], { cwd: dir, env, encoding: 'utf8', timeout: 60000 });
  assert.doesNotMatch(landed.stdout, /^x\b/m);

  const reason = denied(gate(dir, 'git commit -m x', {}, 2));
  assert.match(reason, /src\/price\.cjs/);
  assert.match(reason, /missing/);
  assert.match(reason, /no proof recorded/);
  assert.match(reason, /moskills run-state wrap --id default --task task-1 --auto-complete --/);
});

test('src/price.cjs does not match proof recorded for price.cjs', () => {
  const dir = installed('exact-path');
  fs.writeFileSync(path.join(dir, 'price.cjs'), 'module.exports = 800;\n');
  runState(dir, ['init', '--goal', 'g', '--scope', 'price.cjs', '--tasks', 'prove discount']);
  runState(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
  sh(dir, 'git', ['add', 'price.cjs']);
  const proven = gitCommit(dir, ['-m', 'proven']);
  assert.equal(proven.status, 0, proven.stdout + proven.stderr);

  const engine = new RunStateEngine(dir);
  assert.ok(engine.getImpactedTasks('default', ['price.cjs']).impactedTaskIds.includes('task-1'));
  assert.ok(engine.getImpactedTasks('default', ['./price.cjs']).impactedTaskIds.includes('task-1'));
  assert.deepEqual(engine.getImpactedTasks('default', ['src/price.cjs']).impactedTaskIds, []);

  fs.writeFileSync(path.join(dir, 'price.cjs'), 'module.exports = 800;\n// stale\n');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'price.cjs'), 'module.exports = 2;\n');
  sh(dir, 'git', ['add', 'src/price.cjs']);
  assert.equal(gate(dir, 'git commit -m src'), '');
  const commit = gitCommit(dir, ['-m', 'src only']);
  assert.equal(commit.status, 0, commit.stdout + commit.stderr);
});

test('init gitignores .moskills/runs and a fresh commit does not warn about checkpoints', () => {
  const dir = installed('gitignore-runs');
  const gi = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
  assert.match(gi, /(^|\n)\.moskills\/runs\/(\n|$)/);
  const repoGi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(repoGi, /(^|\n)\.moskills\/runs\/(\n|$)/);

  fs.writeFileSync(path.join(dir, 'note.txt'), 'hello\n');
  sh(dir, 'git', ['add', 'note.txt']);
  const commit = gitCommit(dir, ['-m', 'note']);
  assert.equal(commit.status, 0, commit.stdout + commit.stderr);
  assert.doesNotMatch(commit.stdout + commit.stderr, /no checkpoint/);
});
