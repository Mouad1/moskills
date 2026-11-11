'use strict';
// The git pre-commit hook is the hard lock: with no AI host running, a real
// `git commit` must fail while a run task covering a staged file has missing,
// failed or stale proof. Proof is checked against the staged content, and the
// hook fails closed when runs exist but no moskills CLI can be found.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'moskills');
const rs = path.join(root, 'lib/run-state-cli.cjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills git gate '));
const env = { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1', MOSKILLS_NO_NOTES: '1', MOSKILLS_BIN: cli,
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
delete env.MOSKILLS_NO_COMMIT_GATE;
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function run(dir, cmd, args, extra = {}) {
  return spawnSync(cmd, args, { cwd: dir, env: { ...env, ...extra }, encoding: 'utf8', timeout: 120000 });
}
function ok(r) { assert.equal(r.status, 0, r.stdout + r.stderr); return r.stdout; }
// A git repo with moskills installed (pre-commit hook included) and a.js proven.
function project(name) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir);
  ok(run(dir, 'git', ['init', '-q']));
  ok(run(dir, 'sh', [cli, 'init']));
  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(dir, 'b.js'), 'module.exports = 2;\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.moskills/\n');
  ok(run(dir, 'git', ['add', '.']));
  ok(run(dir, 'git', ['commit', '-qm', 'init']));
  ok(run(dir, 'node', [rs, 'init', '--goal', 'g', '--scope', 'a.js', '--tasks', 'build']));
  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 10;\n');
  ok(run(dir, 'node', [rs, 'wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']));
  return dir;
}
const commit = (dir, extra) => run(dir, 'git', ['commit', '-m', 'work'], extra);

test('a commit whose staged proof is current goes through', () => {
  const dir = project('current');
  ok(run(dir, 'git', ['add', 'a.js']));
  ok(commit(dir));
});

test('a real git commit of a stale proven file fails, naming the task', () => {
  const dir = project('stale');
  fs.writeFileSync(path.join(dir, 'a.js'), 'changed after proof\n');
  ok(run(dir, 'git', ['add', 'a.js']));
  const r = commit(dir);
  assert.notEqual(r.status, 0, 'commit should be refused');
  const out = r.stdout + r.stderr;
  assert.match(out, /task-1/);
  assert.match(out, /a\.js/);
  assert.match(out, /run-state wrap/);
  assert.match(run(dir, 'git', ['log', '--oneline']).stdout.trim(), /^[0-9a-f]+ init$/);
});

test('files outside every proven check commit freely', () => {
  const dir = project('outside');
  fs.writeFileSync(path.join(dir, 'b.js'), 'unrelated\n');
  ok(run(dir, 'git', ['add', 'b.js']));
  ok(commit(dir));
});

test('the staged content is checked, not the working tree', () => {
  // Stale content staged, proven content back on disk: refused.
  const dir = project('partial-stale');
  const proven = fs.readFileSync(path.join(dir, 'a.js'));
  fs.writeFileSync(path.join(dir, 'a.js'), 'changed after proof\n');
  ok(run(dir, 'git', ['add', 'a.js']));
  fs.writeFileSync(path.join(dir, 'a.js'), proven);
  assert.notEqual(commit(dir).status, 0, 'stale staged blob must be refused');

  // Proven content staged, unproven edit only on disk: allowed.
  const dir2 = project('partial-current');
  ok(run(dir2, 'git', ['add', 'a.js']));
  fs.writeFileSync(path.join(dir2, 'a.js'), 'work in progress, not staged\n');
  ok(commit(dir2));
});

test('runs exist but no moskills CLI can be found: the hook fails closed', () => {
  const dir = project('no-cli');
  ok(run(dir, 'git', ['add', 'a.js']));
  const bin = path.join(scratch, 'bare-bin');
  fs.mkdirSync(bin, { recursive: true });
  for (const tool of ['git', 'node']) {
    const real = spawnSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).stdout.trim();
    if (!fs.existsSync(path.join(bin, tool))) fs.symlinkSync(real, path.join(bin, tool));
  }
  const r = commit(dir, { MOSKILLS_BIN: '', PATH: `${bin}:/usr/bin:/bin` });
  assert.notEqual(r.status, 0, 'commit should be refused without a CLI');
  assert.match(r.stdout + r.stderr, /moskills CLI/i);
  assert.match(r.stdout + r.stderr, /MOSKILLS_BIN/);
});

test('a project without runs commits without any CLI', () => {
  const dir = path.join(scratch, 'no-runs');
  fs.mkdirSync(dir);
  ok(run(dir, 'git', ['init', '-q']));
  ok(run(dir, 'sh', [cli, 'init']));
  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1;\n');
  ok(run(dir, 'git', ['add', '.']));
  ok(commit(dir, { MOSKILLS_BIN: '', PATH: '/usr/bin:/bin' }));
});

test('hook mode stays fail-open for host adapters', () => {
  const r = run(scratch, 'sh', [cli, 'commit-gate'], {});
  assert.equal(r.status, 0);
});
