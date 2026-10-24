'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'moskills');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills context '));
const env = { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1' };
delete env.MOSKILLS_NO_CONTEXT;
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function project(name, files = {}) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, '.moskills.json'), '{}');
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  return dir;
}
function context(dir, args = [], extraEnv = {}) {
  const r = spawnSync('sh', [cli, 'context', '--target', dir, ...args],
    { env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 60000 });
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  return r.stdout;
}
const seededState = fs.readFileSync(path.join(root, 'templates/project/STATE.md'), 'utf8');
const seededTodo = fs.readFileSync(path.join(root, 'templates/project/tasks/todo.md'), 'utf8');
const filled = '## Current run\n- **Request / agreed outcome:** Ship the "context" hook \\ safely\n' +
  '- **Next action / blocker:** Write tests\n\n## Findings\n- Hooks run with sh\n';

test('silent outside a project', () => {
  const dir = path.join(scratch, 'not-a-project');
  fs.mkdirSync(dir);
  assert.equal(context(dir, ['--event', 'UserPromptSubmit']), '');
});

test('silent when the seeded notes record nothing', () => {
  const dir = project('seeded', { '.claude/STATE.md': seededState, 'tasks/todo.md': seededTodo });
  assert.equal(context(dir, ['--event', 'UserPromptSubmit']), '');
  assert.equal(context(dir), '');
});

test('plain mode prints the five status lines when notes exist', () => {
  const dir = project('plain', { '.claude/STATE.md': filled });
  const lines = context(dir).trimEnd().split('\n');
  assert.equal(lines.length, 5);
  assert.equal(lines[0], 'Goal: Ship the "context" hook \\ safely');
  assert.equal(lines[4], 'Next: Write tests');
});

test('hook mode emits valid JSON with the five lines for each event', () => {
  const dir = project('hook', { '.claude/STATE.md': filled });
  for (const event of ['UserPromptSubmit', 'SessionStart']) {
    const out = JSON.parse(context(dir, ['--event', event]));
    assert.equal(out.hookSpecificOutput.hookEventName, event);
    const lines = out.hookSpecificOutput.additionalContext.split('\n');
    assert.match(lines[0], /^moskills saved plan/);
    assert.deepEqual(lines.slice(1).map(l => l.split(':')[0]),
      ['Goal', 'Finished (recorded)', 'Still not done', 'Blocker', 'Next']);
    assert.equal(lines[1], 'Goal: Ship the "context" hook \\ safely');
  }
});

test('Findings section does not leak into the status lines', () => {
  const dir = project('findings', { '.claude/STATE.md': filled });
  assert.doesNotMatch(context(dir), /Hooks run with sh/);
});

test('MOSKILLS_NO_CONTEXT=1 turns it off', () => {
  const dir = project('optout', { '.claude/STATE.md': filled });
  assert.equal(context(dir, ['--event', 'UserPromptSubmit'], { MOSKILLS_NO_CONTEXT: '1' }), '');
});

test('plugin registers the prompt and compaction hooks', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(root, 'hooks/hooks.json'), 'utf8')).hooks;
  const cmds = entries => entries.flatMap(e => e.hooks.map(h => h.command));
  assert.ok(cmds(hooks.UserPromptSubmit).some(c => c.includes('context --event UserPromptSubmit')));
  const compact = hooks.SessionStart.find(e => e.matcher === 'compact');
  assert.ok(compact && cmds([compact]).some(c => c.includes('context --event SessionStart')));
});

test('seeded STATE templates carry a Findings section', () => {
  for (const file of ['templates/project/STATE.md', 'templates/claude/STATE.md'])
    assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /^## Findings$/m, file);
});
