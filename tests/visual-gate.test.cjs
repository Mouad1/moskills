'use strict';
// Visual gate: once a task changes a UI file, `run-state done` refuses until
// visual proof covers those files or the user's acceptance does. A plugin
// PostToolUse hook flags the task when the agent edits a UI file.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'moskills');
const rs = path.join(root, 'lib/run-state-cli.cjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills visual '));
const env = { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1', MOSKILLS_NO_NOTES: '1' };
delete env.MOSKILLS_NO_VISUAL_GATE;
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function run(dir, args, expectStatus = 0) {
  const r = spawnSync('node', [rs, ...args], { cwd: dir, env, encoding: 'utf8', timeout: 60000 });
  if (expectStatus !== null) assert.equal(r.status, expectStatus, `run-state ${args.join(' ')}: ${r.stdout}${r.stderr}`);
  return r;
}
// A run whose only task is proven and accepted: `done` passes before any UI work.
function project(name) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/logic.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(dir, 'src/App.tsx'), 'export const App = () => null;\n');
  run(dir, ['init', '--goal', 'g', '--scope', 'src/logic.js', '--tasks', 'build']);
  run(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'true']);
  run(dir, ['accept', '--by', 'user']);
  run(dir, ['done']);
  return dir;
}
function hook(dir, filePath, tool = 'Edit', extraEnv = {}) {
  const input = JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: tool, cwd: dir, tool_input: { file_path: filePath } });
  const r = spawnSync('sh', [cli, 'visual-flag'], { cwd: dir, input, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test('require-visual blocks done until visual proof covers the UI files', () => {
  const dir = project('proof');
  run(dir, ['require-visual', '--task', 'task-1', '--files', 'src/App.tsx']);
  const blocked = run(dir, ['done'], 1);
  assert.match(blocked.stdout, /task-1.*visual/i);
  assert.match(blocked.stdout, /src\/App\.tsx/);
  assert.match(blocked.stdout, /ingest-evidence --check visual-task-1/);
  run(dir, ['ingest-evidence', '--check', 'visual-task-1', '--source', 'screenshot', '--files', 'src/App.tsx']);
  run(dir, ['done']);
});

test('visual proof goes stale when the UI file changes again', () => {
  const dir = project('stale');
  run(dir, ['require-visual', '--task', 'task-1', '--files', 'src/App.tsx']);
  run(dir, ['ingest-evidence', '--check', 'visual-task-1', '--source', 'screenshot', '--files', 'src/App.tsx']);
  run(dir, ['done']);
  fs.writeFileSync(path.join(dir, 'src/App.tsx'), 'export const App = () => "changed";\n');
  assert.match(run(dir, ['done'], 1).stdout, /visual/i);
});

test('user acceptance recorded after the UI change clears the gate', () => {
  const dir = project('accept');
  run(dir, ['require-visual', '--task', 'task-1', '--files', 'src/App.tsx']);
  run(dir, ['done'], 1);
  run(dir, ['accept', '--by', 'user']);
  run(dir, ['done']);
  fs.writeFileSync(path.join(dir, 'src/App.tsx'), 'export const App = () => "again";\n');
  run(dir, ['done'], 1);
});

test('hook flags the task when the agent edits a UI file', () => {
  const dir = project('hook');
  const out = hook(dir, path.join(dir, 'src/App.tsx'));
  const ctx = JSON.parse(out).hookSpecificOutput;
  assert.equal(ctx.hookEventName, 'PostToolUse');
  assert.match(ctx.additionalContext, /src\/App\.tsx/);
  assert.match(ctx.additionalContext, /visual/i);
  assert.match(run(dir, ['done'], 1).stdout, /src\/App\.tsx/);
  assert.equal(hook(dir, path.join(dir, 'src/App.tsx')), '', 'no repeat note for a file already flagged');
});

test('npm launcher runs the hook with the hook JSON on stdin', () => {
  const dir = project('npm-launcher');
  const input = JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit', cwd: dir, tool_input: { file_path: path.join(dir, 'src/App.tsx') } });
  const r = spawnSync('node', [path.join(root, 'bin/moskills.cjs'), 'visual-flag'], { cwd: dir, input, env, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /src\/App\.tsx/);
});

test('hook ignores non-UI files, missing runs and the opt-out', () => {
  const dir = project('ignore');
  assert.equal(hook(dir, path.join(dir, 'src/logic.js')), '');
  assert.equal(hook(dir, path.join(dir, 'src/App.tsx'), 'Edit', { MOSKILLS_NO_VISUAL_GATE: '1' }), '');
  run(dir, ['done']);
  const bare = path.join(scratch, 'no-run');
  fs.mkdirSync(bare);
  fs.writeFileSync(path.join(bare, 'page.html'), '<p>x</p>\n');
  assert.equal(hook(bare, path.join(bare, 'page.html'), 'Write'), '');
  const bad = spawnSync('sh', [cli, 'visual-flag'], { cwd: scratch, input: 'not json', env, encoding: 'utf8', timeout: 60000 });
  assert.equal(bad.status, 0);
  assert.equal(bad.stdout.trim(), '');
});

test('plugin registers the hook on Edit and Write', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(root, 'hooks/hooks.json'), 'utf8')).hooks;
  const entries = (hooks.PostToolUse || []).filter(e => e.hooks.some(h => h.command.includes('visual-flag')));
  assert.equal(entries.length, 1);
  for (const tool of ['Edit', 'Write', 'MultiEdit']) assert.match(entries[0].matcher, new RegExp(`\\b${tool}\\b`));
});
