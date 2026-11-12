'use strict';
// doctor reports, per gate, whether it holds with no AI host (hard: git hook
// or CI), only inside a host (soft: Claude Code plugin hook), or not at all
// (missing). A project with runs whose commit gate is not hard is a problem.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'moskills');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills locks '));
const env = { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1', MOSKILLS_NO_NOTES: '1' };
delete env.MOSKILLS_ROOT;
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

// Plugin install: the CLI ships hooks/hooks.json. npm install: no host hooks.
const PLUGIN = {};
const NPM = { MOSKILLS_DISTRIBUTION: 'npm' };

function run(dir, args, extra = {}) {
  return spawnSync('sh', [cli, ...args], { cwd: dir, env: { ...env, ...extra }, encoding: 'utf8', timeout: 60000 });
}
function project(name, { git = true, hooks = true } = {}) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir);
  if (git) assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir }).status, 0);
  const r = run(dir, ['init', '--target', dir, ...(hooks ? [] : ['--no-hooks'])]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return dir;
}
function addRun(dir) {
  const rs = path.join(root, 'lib/run-state-cli.cjs');
  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1;\n');
  const r = spawnSync('node', [rs, 'init', '--goal', 'g', '--scope', 'a.js', '--tasks', 'build'], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
}
function lock(out, gate) {
  const m = out.match(new RegExp(`lock ${gate}: (hard|soft|missing)(?: \\(([^)]*)\\))?`));
  assert.ok(m, `no "lock ${gate}:" line in:\n${out}`);
  return { level: m[1], why: m[2] || '' };
}

test('installed git project: commit proof is a hard lock', () => {
  const dir = project('hard');
  const r = run(dir, ['doctor', '--target', dir], NPM);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const c = lock(r.stdout, 'commit-proof');
  assert.equal(c.level, 'hard');
  assert.match(c.why, /pre-commit/);
});

test('no pre-commit hook: missing without a host, soft with the plugin', () => {
  const dir = project('no-hooks', { hooks: false });
  const npm = run(dir, ['doctor', '--target', dir], NPM);
  assert.equal(npm.status, 0, 'no runs yet: informational only\n' + npm.stdout);
  assert.equal(lock(npm.stdout, 'commit-proof').level, 'missing');
  assert.match(lock(npm.stdout, 'commit-proof').why, /moskills sync|init/);
  assert.equal(lock(run(dir, ['doctor', '--target', dir], PLUGIN).stdout, 'commit-proof').level, 'soft');
});

test('runs exist and the commit gate is not hard: doctor fails', () => {
  const dir = project('runs-no-hook', { hooks: false });
  addRun(dir);
  const r = run(dir, ['doctor', '--target', dir], PLUGIN);
  assert.notEqual(r.status, 0, r.stdout);
  assert.equal(lock(r.stdout, 'commit-proof').level, 'soft');
  assert.doesNotMatch(r.stdout, /\bOK\s+v/);
});

test('hook cannot find the proof check: missing', () => {
  const dir = project('lost-root');
  fs.writeFileSync(path.join(dir, '.claude/hooks/moskills-root'), path.join(scratch, 'nowhere') + '\n');
  const r = run(dir, ['doctor', '--target', dir], { ...NPM, PATH: '/usr/bin:/bin:' + path.dirname(process.execPath) });
  const c = lock(r.stdout, 'commit-proof');
  assert.equal(c.level, 'missing');
  assert.match(c.why, /proof check|MOSKILLS_ROOT/);
});

test('not a git repository: commit proof is missing', () => {
  const dir = project('no-git', { git: false });
  const r = run(dir, ['doctor', '--target', dir], NPM);
  assert.equal(r.status, 0, r.stdout);
  assert.match(lock(r.stdout, 'commit-proof').why, /git/);
});

test('CI proof is hard only when a workflow runs run-state done', () => {
  const dir = project('ci');
  assert.equal(lock(run(dir, ['doctor', '--target', dir], NPM).stdout, 'ci-proof').level, 'missing');
  fs.mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.github/workflows/proof.yml'), 'jobs:\n  proof:\n    steps:\n      - run: npx moskills run-state done\n');
  const c = lock(run(dir, ['doctor', '--target', dir], NPM).stdout, 'ci-proof');
  assert.equal(c.level, 'hard');
  assert.match(c.why, /proof\.yml/);
});

test('visual flag is soft with the plugin and missing without a host', () => {
  const dir = project('visual');
  assert.equal(lock(run(dir, ['doctor', '--target', dir], PLUGIN).stdout, 'visual-flag').level, 'soft');
  assert.equal(lock(run(dir, ['doctor', '--target', dir], NPM).stdout, 'visual-flag').level, 'missing');
});
