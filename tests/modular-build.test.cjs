'use strict';
// /modular-build runs one module per run. These tests cover the engine pieces it
// relies on: `run-state done` (is a module finished and accepted?), `init --after`
// (no switching to the next module before that), and `run-state list`.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills modular '));
const env = { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1', MOSKILLS_NO_NOTES: '1' };
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function project(name) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1;\n');
  return dir;
}
function rs(dir, args) {
  return spawnSync('node', [path.join(root, 'lib/run-state-cli.cjs'), ...args],
    { cwd: dir, env, encoding: 'utf8', timeout: 60000 });
}
function finishModule(dir, id) {
  assert.equal(rs(dir, ['init', '--id', id, '--goal', id, '--scope', 'a.js', '--tasks', 'build']).status, 0);
  assert.equal(rs(dir, ['wrap', '--id', id, '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']).status, 0);
}

test('done fails until every task has current proof and the user accepted', () => {
  const dir = project('done');
  rs(dir, ['init', '--id', 'module-a', '--goal', 'A', '--scope', 'a.js', '--tasks', 'build,style']);
  let r = rs(dir, ['done', '--id', 'module-a']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /module-a: not done/);
  assert.match(r.stdout, /task-1 \(build\): no passing proof/);
  assert.match(r.stdout, /human acceptance: pending/);

  rs(dir, ['wrap', '--id', 'module-a', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
  rs(dir, ['wrap', '--id', 'module-a', '--task', 'task-2', '--auto-complete', '--silent', '--', 'true']);
  r = rs(dir, ['done', '--id', 'module-a']);
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stdout, /no passing proof/);
  assert.match(r.stdout, /human acceptance: pending/);

  rs(dir, ['accept', '--id', 'module-a', '--by', 'mouad']);
  r = rs(dir, ['done', '--id', 'module-a']);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /module-a: done \(2\/2 tasks, accepted by mouad\)/);
});

test('done turns false again when a checked file changes', () => {
  const dir = project('done-stale');
  finishModule(dir, 'module-a');
  rs(dir, ['accept', '--id', 'module-a', '--by', 'u']);
  assert.equal(rs(dir, ['done', '--id', 'module-a']).status, 0);
  fs.appendFileSync(path.join(dir, 'a.js'), '// edit\n');
  const r = rs(dir, ['done', '--id', 'module-a']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /task-1 \(build\): proof is stale/);
  assert.match(r.stdout, /scope changed since acceptance/);
});

test('done with --json reports the reasons', () => {
  const dir = project('done-json');
  rs(dir, ['init', '--id', 'm', '--goal', 'g', '--tasks', 'x']);
  const out = JSON.parse(rs(dir, ['done', '--id', 'm', '--json']).stdout);
  assert.equal(out.done, false);
  assert.equal(out.runId, 'm');
  assert.ok(out.reasons.length >= 2);
});

test('a run with no tasks is never done', () => {
  const dir = project('done-empty');
  rs(dir, ['init', '--id', 'm', '--goal', 'g']);
  rs(dir, ['accept', '--id', 'm', '--by', 'u']);
  const r = rs(dir, ['done', '--id', 'm']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no tasks/);
});

test('init --after refuses to start the next module before the previous one is done', () => {
  const dir = project('after');
  finishModule(dir, 'module-a');
  let r = rs(dir, ['init', '--id', 'module-b', '--after', 'module-a', '--goal', 'B', '--tasks', 'x']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /module-a is not done/);
  assert.match(r.stderr, /human acceptance: pending/);
  assert.ok(!fs.existsSync(path.join(dir, '.moskills/runs/module-b')));

  rs(dir, ['accept', '--id', 'module-a', '--by', 'u']);
  r = rs(dir, ['init', '--id', 'module-b', '--after', 'module-a', '--goal', 'B', '--tasks', 'x']);
  assert.equal(r.status, 0, r.stderr);
  const run = JSON.parse(fs.readFileSync(path.join(dir, '.moskills/runs/module-b/run.json'), 'utf8'));
  assert.equal(run.after, 'module-a');
});

test('init --after a missing run is refused', () => {
  const dir = project('after-missing');
  const r = rs(dir, ['init', '--id', 'module-b', '--after', 'nope', '--goal', 'B']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /nope/);
});

test('list shows every run with its progress and done state', () => {
  const dir = project('list');
  finishModule(dir, 'module-a');
  rs(dir, ['accept', '--id', 'module-a', '--by', 'u']);
  rs(dir, ['init', '--id', 'module-b', '--after', 'module-a', '--goal', 'Second', '--tasks', 'x,y']);
  const r = rs(dir, ['list']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /module-a\s+done\s+1\/1\s+module-a\n/);
  assert.match(r.stdout, /module-b\s+not done\s+0\/2\s+Second \(after module-a\)/);
  const json = JSON.parse(rs(dir, ['list', '--json']).stdout);
  assert.deepEqual(json.map(x => [x.id, x.done]), [['module-a', true], ['module-b', false]]);
});

test('list in a project without runs says so', () => {
  const r = rs(project('list-empty'), ['list']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No runs/);
});

test('modular-build skill and command ship and reuse the existing gates', () => {
  const skill = fs.readFileSync(path.join(root, 'templates/claude/skills/modular-build/SKILL.md'), 'utf8');
  assert.match(skill, /^name: modular-build$/m);
  assert.match(skill, /Primary goal: Build one module at a time/);
  for (const needle of ['run-state init --id module-', '--after', 'run-state done', 'gatekeeper', 'run-state accept'])
    assert.ok(skill.includes(needle), needle);
  const cmd = fs.readFileSync(path.join(root, 'templates/claude/commands/modular-build.md'), 'utf8');
  assert.match(cmd, /`modular-build` skill/);
});
