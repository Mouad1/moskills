'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills status '));
const env = { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1',
  npm_config_cache: path.join(scratch, 'cache'), npm_config_userconfig: path.join(scratch, 'npmrc'),
  npm_config_globalconfig: path.join(scratch, 'global-npmrc'), npm_config_audit: 'false', npm_config_fund: 'false' };
fs.writeFileSync(env.npm_config_userconfig, '');
fs.writeFileSync(env.npm_config_globalconfig, '');
function project(name, manifest = true) {
  const dir = path.join(scratch, name); fs.mkdirSync(dir);
  if (manifest) fs.writeFileSync(path.join(dir, '.moskills.json'), '{}');
  return dir;
}
function write(dir, file, text) {
  const dest = path.join(dir, file); fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, text);
}
function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: 120000 });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.stderr, ''); return result.stdout;
}
function status(dir, args = []) { return run('sh', [path.join(root, 'moskills'), 'status', ...args], dir); }
const unknown = 'Goal: unknown\nFinished (recorded): unknown\nStill not done: unknown\nBlocker: unknown\nNext: unknown\n';
const populated = '# STATE\n\n## Current run\n- **Request / agreed outcome:** Build quote tool\n- **Next action / blocker:** Review prices\n\n## Finished\n- [x] Draft calculator\n- Tests passed (recorded claim)\n\n## Still not done\n- [ ] Customer review\n\n## Blocker\n- Pricing approval\n';
const expected = 'Goal: Build quote tool\nFinished (recorded): Draft calculator; Tests passed (recorded claim)\nStill not done: Customer review\nBlocker: Pricing approval\nNext: Review prices\n';
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
test('initialized project without notes prints five unknown lines', () => {
  assert.equal(status(project('absent')), unknown);
});
test('seeded templates retain unknown placeholders', () => {
  const dir = project('template');
  for (const file of ['STATE.md', 'tasks/todo.md']) write(dir, file === 'STATE.md' ? '.claude/STATE.md' : file,
    fs.readFileSync(path.join(root, 'templates/project', file), 'utf8'));
  assert.equal(status(dir), unknown);
});
test('populated notes print raw advisory claims without gating', () => {
  const dir = project('populated'); write(dir, '.claude/STATE.md', populated);
  assert.equal(status(dir), expected);
});
test('saved notes identify project without manifest', () => {
  const dir = project('notes-only', false); write(dir, '.claude/STATE.md', populated);
  assert.equal(status(dir), expected);
});
test('root STATE is legacy fallback while .claude STATE wins', () => {
  const dir = project('legacy'); write(dir, 'STATE.md', populated);
  assert.equal(status(dir), expected);
  write(dir, '.claude/STATE.md', '## Goal\nPreferred note\n');
  assert.equal(status(dir), unknown.replace('Goal: unknown', 'Goal: Preferred note'));
});
test('todo supplies missing fields; state stays preferred', () => {
  const dir = project('fallback'); write(dir, '.claude/STATE.md', '## Goal\nBuild quote tool\n## Finished\nState draft\n');
  write(dir, 'tasks/todo.md', '## Agreed scope\n- Request / outcome: Build quote tool\n## Finished\nTodo draft\n## Still not done\n- [ ] Customer review\n## Blocker\n- Pricing approval\n## Next\nReview prices\n');
  assert.equal(status(dir), expected.replace('Draft calculator; Tests passed (recorded claim)', 'State draft'));
});
test('conflicting goals refuse to combine task records', () => {
  const dir = project('conflict'); write(dir, '.claude/STATE.md', populated);
  write(dir, 'tasks/todo.md', '## Goal\nDifferent task\n');
  assert.equal(status(dir), unknown.replace('Next: unknown', 'Next: Reconcile conflicting saved goals'));
});
test('duplicate recognized headings invalidate affected field', () => {
  const dir = project('duplicate'); write(dir, '.claude/STATE.md', populated + '\n## Finished\nOld task\n');
  write(dir, 'tasks/todo.md', '## Finished\nFallback must not hide ambiguity\n');
  assert.equal(status(dir), expected.replace('Draft calculator; Tests passed (recorded claim)', 'unknown'));
});
test('duplicate current run cannot select old goal or next action', () => {
  const dir = project('duplicate run'); write(dir, '.claude/STATE.md', populated + '\n## Current run\n- Goal: Old task\n- Next: Old action\n');
  assert.equal(status(dir), unknown);
});
test('ambiguous todo goal cannot fill fields for a different current task', () => {
  const dir = project('ambiguous fallback');
  write(dir, '.claude/STATE.md', '## Goal\nCurrent pricing task\n');
  write(dir, 'tasks/todo.md', '## Goal\nOld website task\n## Goal\nOlder login task\n## Finished\nWebsite deployed\n## Next\nDeploy login\n');
  assert.equal(status(dir), unknown.replace('Goal: unknown', 'Goal: Current pricing task'));
});
test('ambiguous primary goal cannot present finished work or next action', () => {
  const dir = project('ambiguous primary');
  write(dir, '.claude/STATE.md', populated + '\n## Goal\nAnother task\n');
  write(dir, 'tasks/todo.md', '## Goal\nBuild quote tool\n## Finished\nFallback task\n');
  assert.equal(status(dir), unknown);
});
test('duplicate fields and todo history remain ambiguous', () => {
  const dir = project('duplicate labels'); write(dir, 'tasks/todo.md', '## Agreed scope\n- Request / outcome: One\n- Request / outcome: Two\n## Finished\nOld\n## Historical task\n### Finished\nNew\n');
  assert.equal(status(dir), unknown);
});
test('combined legacy next/blocker does not assert no blocker', () => {
  const dir = project('legacy combined'); write(dir, '.claude/STATE.md', populated.replace('## Blocker\n- Pricing approval\n', ''));
  assert.equal(status(dir), expected.replace('Blocker: Pricing approval', 'Blocker: unknown'));
});
test('unrecognized headings and checkpoints do not leak unrelated text', () => {
  const dir = project('boundaries'); write(dir, '.claude/STATE.md', '## Goal\nBuild tool\n## Validation History\n- passed\n## Checkpoints\n### Yesterday\n- Next action / exact resume step: old\n');
  assert.equal(status(dir), unknown.replace('Goal: unknown', 'Goal: Build tool'));
});
test('target supports spaces and verbose preserves installation details', () => {
  const dir = project('target with spaces'); write(dir, '.claude/STATE.md', populated);
  assert.equal(status(scratch, ['--target', dir]), expected);
  const output = status(scratch, ['--target', dir, '--verbose']);
  assert.ok(output.startsWith(expected)); assert.ok(output.includes('Version: ' + version + '\nInstalled in:'));
  assert.match(output, /Daily update:/);
});
test('outside projects preserves original installation status', () => {
  const dir = project('outside', false); const output = status(dir);
  assert.ok(output.startsWith('Version: ' + version + '\nInstalled in:')); assert.doesNotMatch(output, /^Goal:/m);
});
test('summary bounds long values, removes controls, leaves files unchanged', () => {
  const dir = project('read-only'); const text = '## Goal\n' + 'x'.repeat(1200) + '\u001b[31m\u0007\n## Next\nResume\n';
  write(dir, '.claude/STATE.md', text); const before = fs.statSync(path.join(dir, '.claude/STATE.md'));
  const entries = fs.readdirSync(dir); const output = status(dir);
  assert.equal(output.trimEnd().split('\n').length, 5);
  for (const line of output.trimEnd().split('\n')) assert.ok(line.length <= 270, line.length);
  assert.doesNotMatch(output, /[\u0000-\u0009\u000b-\u001f\u007f]/);
  assert.equal(fs.readFileSync(path.join(dir, '.claude/STATE.md'), 'utf8'), text);
  assert.equal(fs.statSync(path.join(dir, '.claude/STATE.md')).mtimeMs, before.mtimeMs);
  assert.deepEqual(fs.readdirSync(dir), entries);
});
test('actual packed npm CLI ships parser and forwards status verbose', () => {
  const data = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', scratch], root))[0];
  assert.ok(data.files.some(file => file.path === 'lib/status-summary.awk'));
  const prefix = path.join(scratch, 'prefix');
  run('npm', ['install', '--global', '--offline', '--ignore-scripts', '--prefix', prefix, path.join(scratch, data.filename)], root);
  const dir = project('packed target with spaces'); write(dir, '.claude/STATE.md', populated);
  const cli = path.join(prefix, 'bin/moskills');
  assert.equal(run(cli, ['status', '--target', dir], scratch), expected);
  assert.ok(run(cli, ['status', '--target', dir, '--verbose'], scratch).startsWith(expected + 'Version: ' + version + '\n'));
});
