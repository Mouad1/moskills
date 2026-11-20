'use strict';
// `run-state scope --task <id> --files <list>` gives one task its own files.
// A check wrapped for that task then hashes only those files, so editing
// another task's file leaves its proof current (live test 6).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const rs = path.join(root, 'lib/run-state-cli.cjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills task scope '));
const env = { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1', MOSKILLS_NO_NOTES: '1' };
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function run(dir, args, expect = 0) {
  const r = spawnSync('node', [rs, ...args], { cwd: dir, env, encoding: 'utf8', timeout: 60000 });
  if (expect !== null) assert.equal(r.status, expect, `run-state ${args.join(' ')}: ${r.stdout}${r.stderr}`);
  return r;
}
function project(name) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(dir, 'b.js'), 'module.exports = 2;\n');
  run(dir, ['init', '--goal', 'two parts', '--scope', 'a.js,b.js', '--tasks', 'part A,part B']);
  return dir;
}
const runJson = dir => JSON.parse(fs.readFileSync(path.join(dir, '.moskills/runs/default/run.json'), 'utf8'));
const task = (dir, id) => runJson(dir).tasks.find(t => t.id === id);

test('scope sets the files of one task', () => {
  const dir = project('sets');
  const r = run(dir, ['scope', '--task', 'task-1', '--files', 'a.js']);
  assert.match(r.stdout, /task-1/);
  assert.match(r.stdout, /a\.js/);
  assert.deepEqual(task(dir, 'task-1').scope, ['a.js']);
  assert.equal(task(dir, 'task-2').scope, undefined);
});

test('editing another task\'s file leaves a scoped task proven', () => {
  const dir = project('isolated');
  run(dir, ['scope', '--task', 'task-1', '--files', 'a.js']);
  run(dir, ['scope', '--task', 'task-2', '--files', 'b.js']);
  run(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
  fs.writeFileSync(path.join(dir, 'b.js'), 'module.exports = 3;\n');
  run(dir, ['resume']);
  assert.equal(task(dir, 'task-1').status, 'finished');
  assert.equal(task(dir, 'task-1').stale, false);
});

test('editing a scoped task\'s own file still makes it stale', () => {
  const dir = project('own-file');
  run(dir, ['scope', '--task', 'task-1', '--files', 'a.js']);
  run(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 9;\n');
  run(dir, ['resume']);
  assert.equal(task(dir, 'task-1').status, 'unfinished');
  assert.equal(task(dir, 'task-1').stale, true);
});

test('scope on a finished task reopens it: its proof covered other files', () => {
  const dir = project('reopen');
  run(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
  assert.equal(task(dir, 'task-1').status, 'finished');
  const r = run(dir, ['scope', '--task', 'task-1', '--files', 'a.js']);
  assert.match(r.stdout, /reopen/i);
  assert.equal(task(dir, 'task-1').status, 'unfinished');
});

test('a file outside the run scope joins it and resets acceptance', () => {
  const dir = project('grow');
  fs.writeFileSync(path.join(dir, 'c.js'), 'module.exports = 4;\n');
  run(dir, ['accept', '--by', 'tester']);
  assert.equal(runJson(dir).humanAcceptance.status, 'accepted');
  run(dir, ['scope', '--task', 'task-2', '--files', 'b.js,c.js']);
  assert.deepEqual(runJson(dir).scope, ['a.js', 'b.js', 'c.js']);
  assert.equal(runJson(dir).humanAcceptance.status, 'pending');
});

test('scope refuses an unknown task or no files', () => {
  const dir = project('errors');
  assert.match(run(dir, ['scope', '--task', 'task-9', '--files', 'a.js'], 1).stderr, /task-9/);
  assert.match(run(dir, ['scope', '--task', 'task-1'], 1).stderr, /--files/);
});
