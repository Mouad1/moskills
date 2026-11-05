'use strict';
// The standard keeps control of the flow when other skill packs are installed:
// a stage table names the gate at each stage boundary, helper skills hand back
// to it, and `moskills init` ships that text into projects.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const base = fs.readFileSync(path.join(root, 'templates/managed/base.md'), 'utf8');
const protocol = fs.readFileSync(path.join(root, 'templates/managed/session-protocol.md'), 'utf8');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills routing '));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function section(text, heading) {
  const start = text.indexOf(`## ${heading}\n`);
  assert.notEqual(start, -1, `missing section: ${heading}`);
  const next = text.indexOf('\n## ', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

test('base.md has a stage table with a gate at every stage boundary', () => {
  const stages = section(base, 'Stages and gates');
  for (const stage of ['Idea to spec', 'Spec to plan', 'Build a task', 'UI change', 'Module or feature done', 'Pause']) {
    assert.match(stages, new RegExp(`\\| ${stage} \\|`), `missing stage row: ${stage}`);
  }
  assert.match(stages, /superpowers:brainstorming/);
  assert.match(stages, /\/preview/);
  assert.match(stages, /run-state init/);
  assert.match(stages, /run-state wrap/);
  assert.match(stages, /run-state accept/);
  assert.match(stages, /```mermaid/, 'documentation rule: the section needs a diagram');
});

test('helper skills hand control back to the stage table', () => {
  const stages = section(base, 'Stages and gates');
  assert.match(stages, /return to this table before invoking anything else/i);
  assert.match(stages, /never replaces? `\.claude\/STATE\.md`/);
  assert.match(stages, /Agreed scope/);
});

test('session protocol runs long commands in the background and commits on proof', () => {
  const during = section(protocol, 'During work');
  assert.match(during, /background/i);
  assert.match(during, /propose a commit as soon as/i);
});

test('init ships the stage table into the project standard', () => {
  const dir = path.join(scratch, 'project');
  fs.mkdirSync(dir);
  const env = { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1', MOSKILLS_CLAUDE: '/nonexistent/claude' };
  const r = spawnSync('sh', [path.join(root, 'moskills'), 'init', '--target', dir],
    { env, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  const shipped = fs.readFileSync(path.join(dir, '.claude/standard/base.md'), 'utf8');
  assert.match(shipped, /## Stages and gates\n/);
});
