'use strict';
// moskills version-check: shows the local, remote and published versions, so a
// plan or a release never starts from a stale checkout (lesson 2026-11-24).
// Offline by design: a local bare repo stands in for origin, a fake npm for the registry.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'moskills');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills version check '));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const fakeNpm = path.join(scratch, 'fake-npm');
fs.writeFileSync(fakeNpm, '#!/bin/sh\n[ -n "${FAKE_NPM_FAIL:-}" ] && exit 1\n' +
  '[ "$1 $2 $3" = "view demo-pkg version" ] || exit 2\nprintf \'%s\\n\' "$FAKE_NPM_VERSION"\n');
fs.chmodSync(fakeNpm, 0o755);
const baseEnv = { ...process.env, MOSKILLS_NPM: fakeNpm, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t.test', '-c', 'commit.gpgsign=false',
    '-c', 'tag.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
function commitVersion(dir, version) {
  fs.writeFileSync(path.join(dir, 'VERSION'), version + '\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', `v${version}`);
}
// origin (bare) + a clone at `version`; returns the clone path
function repo(name, version = '1.0.0') {
  const base = path.join(scratch, name);
  const origin = path.join(base, 'origin.git');
  const work = path.join(base, 'work');
  fs.mkdirSync(base);
  git(base, 'init', '-q', '--bare', '-b', 'main', origin);
  git(base, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '-b', 'main');
  fs.writeFileSync(path.join(work, 'package.json'), '{ "name": "demo-pkg" }\n');
  commitVersion(work, version);
  git(work, 'push', '-q', '-u', 'origin', 'main');
  git(work, 'remote', 'set-head', 'origin', 'main');
  return work;
}
// another clone pushes a new version, so `work` falls behind
function pushFromElsewhere(work, version) {
  const origin = git(work, 'remote', 'get-url', 'origin');
  const other = path.join(path.dirname(work), 'other');
  git(path.dirname(work), 'clone', '-q', origin, other);
  commitVersion(other, version);
  git(other, 'push', '-q', 'origin', 'main');
}
function check(dir, args = [], env = {}) {
  const r = spawnSync('sh', [cli, 'version-check', '--target', dir, ...args],
    { env: { ...baseEnv, ...env }, encoding: 'utf8', timeout: 60000 });
  assert.ifError(r.error);
  return r;
}

test('in sync: one line with local, remote, behind count and latest tag', () => {
  const dir = repo('in-sync');
  git(dir, 'tag', 'v1.0.0');
  git(dir, 'push', '-q', 'origin', 'v1.0.0');
  const r = check(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'version-check: local 1.0.0, origin/main 1.0.0, behind 0, latest tag v1.0.0\n');
});

test('behind: shows the remote version and says to pull, never fails', () => {
  const dir = repo('behind');
  pushFromElsewhere(dir, '1.1.0');
  const r = check(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /local 1\.0\.0, origin\/main 1\.1\.0, behind 1/);
  assert.match(r.stdout, /git pull --ff-only/);
  assert.equal(r.stdout.trim().split('\n').length, 1);
});

test('offline: says so and keeps the local version, never fails', () => {
  const dir = repo('offline');
  git(dir, 'remote', 'set-url', 'origin', path.join(scratch, 'no-such-origin.git'));
  const r = check(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^version-check: offline \(git fetch failed\), local 1\.0\.0/);
});

test('silent outside a repo with a VERSION file', () => {
  const dir = path.join(scratch, 'plain');
  fs.mkdirSync(dir);
  const r = check(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});

test('--hook prints SessionStart JSON with the same line as context', () => {
  const dir = repo('hook');
  pushFromElsewhere(dir, '1.1.0');
  const r = check(dir, ['--hook']);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /origin\/main 1\.1\.0, behind 1/);
  assert.match(out.systemMessage, /behind 1/);
  assert.match(out.hookSpecificOutput.additionalContext, /release\. Use these versions/);
});

test('--release passes when the target is new, untagged, and the checkout is current', () => {
  const dir = repo('release-ok');
  const r = check(dir, ['--release', '1.1.0'], { FAKE_NPM_VERSION: '1.0.0' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, 'version-check: release 1.1.0: ok (published 1.0.0, origin/main 1.0.0, behind 0)\n');
});

test('--release fails when the target is not higher than the published version', () => {
  const dir = repo('release-not-higher');
  const r = check(dir, ['--release', '1.0.0'], { FAKE_NPM_VERSION: '1.0.1' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /1\.0\.0 is not higher than the published version 1\.0\.1/);
});

test('--release fails when the tag already exists on origin', () => {
  const dir = repo('release-tagged');
  git(dir, 'tag', 'v1.1.0');
  git(dir, 'push', '-q', 'origin', 'v1.1.0');
  git(dir, 'tag', '-d', 'v1.1.0');
  const r = check(dir, ['--release', '1.1.0'], { FAKE_NPM_VERSION: '1.0.0' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /tag v1\.1\.0 exists/);
});

test('--release fails when the checkout is behind origin', () => {
  const dir = repo('release-behind');
  pushFromElsewhere(dir, '1.0.1');
  const r = check(dir, ['--release', '1.1.0'], { FAKE_NPM_VERSION: '1.0.0' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /behind origin\/main by 1 commit/);
});

test('--release fails when the published version cannot be read', () => {
  const dir = repo('release-no-npm');
  const r = check(dir, ['--release', '1.1.0'], { FAKE_NPM_FAIL: '1' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read the published version of demo-pkg/);
});

test('--release fails when git fetch fails', () => {
  const dir = repo('release-offline');
  git(dir, 'remote', 'set-url', 'origin', path.join(scratch, 'no-such-origin.git'));
  const r = check(dir, ['--release', '1.1.0'], { FAKE_NPM_VERSION: '1.0.0' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /git fetch failed/);
});

test('--release rejects a malformed version', () => {
  const dir = repo('release-bad');
  const r = check(dir, ['--release', 'v1.1'], { FAKE_NPM_VERSION: '1.0.0' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /x\.y\.z/);
});
