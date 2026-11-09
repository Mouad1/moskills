'use strict';
// Business rules in docs/rules.md are linked to run-state tasks. A rule's proof
// status is computed from its tasks' proof; `done` refuses while a rule the run
// must prove is unknown, draft, retired, or proven by no task.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const rs = path.join(root, 'lib/run-state-cli.cjs');
const { readRules } = require('../lib/rules-file.cjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills rules '));
const env = { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1', MOSKILLS_NO_NOTES: '1' };
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const BEGIN = '<!-- moskills:rules:begin -->';
const END = '<!-- moskills:rules:end -->';
function rulesFile(rows) {
  return ['# Business rules', '', '## Rules', '',
    '| ID | Rule | Expected (measurable) | Proof | State | Source |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map(([id, state]) => `| ${id} | When x, the system shall y | 100% | npm test | ${state} | prd |`),
    '', '## Proof status', '', BEGIN, END, ''].join('\n');
}
function run(dir, args, expect = 0) {
  const r = spawnSync('node', [rs, ...args], { cwd: dir, env, encoding: 'utf8', timeout: 60000 });
  if (expect !== null) assert.equal(r.status, expect, `run-state ${args.join(' ')}: ${r.stdout}${r.stderr}`);
  return r;
}
function project(name, rows) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1;\n');
  if (rows) fs.writeFileSync(path.join(dir, 'docs/rules.md'), rulesFile(rows));
  return dir;
}
const prove = dir => {
  run(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--files', 'a.js', '--', 'true']);
  run(dir, ['accept', '--by', 'user']);
};

test('parses rule rows by header, ignoring other tables', () => {
  const dir = project('parse', [['BR-001', 'accepted'], ['BR-002', 'Draft']]);
  const rules = readRules(dir);
  assert.deepEqual(rules.map(r => [r.id, r.state]), [['BR-001', 'accepted'], ['BR-002', 'draft']]);
  assert.equal(rules[0].proof, 'npm test');
  assert.equal(readRules(project('none')), null);
});

test('done refuses until every declared rule is accepted and proven by a task', () => {
  const dir = project('done', [['BR-001', 'accepted'], ['BR-002', 'draft']]);
  run(dir, ['init', '--goal', 'g', '--scope', 'a.js', '--tasks', 'build', '--rules', 'BR-001,BR-002,BR-009']);
  run(dir, ['link', '--task', 'task-1', '--rules', 'BR-001']);
  prove(dir);
  const out = run(dir, ['done'], 1).stdout;
  assert.match(out, /BR-002: still draft/);
  assert.match(out, /BR-002: declared for this run but no task proves it/);
  assert.match(out, /BR-009: not in docs\/rules\.md/);
  assert.doesNotMatch(out, /BR-001/);
  fs.writeFileSync(path.join(dir, 'docs/rules.md'), rulesFile([['BR-001', 'accepted'], ['BR-002', 'accepted']]));
  run(dir, ['init', '--force', '--goal', 'g', '--scope', 'a.js', '--tasks', 'build', '--rules', 'BR-001,BR-002']);
  run(dir, ['link', '--task', 'task-1', '--rules', 'BR-001,BR-002']);
  prove(dir);
  run(dir, ['done']);
});

test('a retired rule still linked blocks done', () => {
  const dir = project('retired', [['BR-001', 'retired']]);
  run(dir, ['init', '--goal', 'g', '--scope', 'a.js', '--tasks', 'build']);
  run(dir, ['link', '--task', 'task-1', '--rules', 'BR-001']);
  prove(dir);
  assert.match(run(dir, ['done'], 1).stdout, /BR-001: retired but still linked/);
});

test('rules matrix: proven, stale after a change, unproven, draft; block rewritten idempotently', () => {
  const dir = project('matrix', [['BR-001', 'accepted'], ['BR-002', 'accepted'], ['BR-003', 'draft']]);
  run(dir, ['init', '--goal', 'g', '--scope', 'a.js', '--tasks', 'build']);
  run(dir, ['link', '--task', 'task-1', '--rules', 'BR-001']);
  prove(dir);
  const status = () => Object.fromEntries(JSON.parse(run(dir, ['rules', '--json']).stdout).map(r => [r.id, r.status]));
  assert.deepEqual(status(), { 'BR-001': 'proven', 'BR-002': 'unproven', 'BR-003': 'draft' });
  const file = () => fs.readFileSync(path.join(dir, 'docs/rules.md'), 'utf8');
  run(dir, ['rules']);
  const once = file();
  assert.match(once.slice(once.indexOf(BEGIN), once.indexOf(END)), /BR-001 \| accepted \| proven/);
  run(dir, ['rules']);
  assert.equal(file(), once, 'rewriting the block twice changes nothing');
  assert.match(once, /\| BR-001 \| When x/, 'the human table is untouched');
  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 2;\n');
  assert.equal(status()['BR-001'], 'stale');
});

test('without docs/rules.md, runs work as before and rules is a no-op', () => {
  const dir = project('plain');
  run(dir, ['init', '--goal', 'g', '--scope', 'a.js', '--tasks', 'build']);
  prove(dir);
  run(dir, ['done']);
  assert.match(run(dir, ['rules']).stdout, /No docs\/rules\.md/);
});

test('link refuses an unknown task', () => {
  const dir = project('badlink', [['BR-001', 'accepted']]);
  run(dir, ['init', '--goal', 'g', '--tasks', 'build']);
  assert.match(run(dir, ['link', '--task', 'task-9', '--rules', 'BR-001'], 1).stderr, /task-9/);
});
