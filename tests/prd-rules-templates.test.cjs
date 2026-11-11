'use strict';
// Every project gets two reference files: docs/prd.md (why, who, measurable
// goals) and docs/rules.md (one measurable business rule per row, with the
// check that proves it). The skills feed them; init seeds them once.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills prd '));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const env = { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1', MOSKILLS_CLAUDE: '/nonexistent/claude' };

function init(dir) {
  const r = spawnSync('sh', [path.join(root, 'moskills'), 'init', '--target', dir],
    { env, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
}

test('PRD template is one page with measurable goals and a change log', () => {
  const prd = read('templates/project/docs/prd.md');
  for (const h of ['Problem', 'Users', 'Goals', 'Non-goals', 'Core journeys', 'Constraints', 'Open questions', 'Change log']) {
    assert.match(prd, new RegExp(`^## ${h}`, 'm'), `missing section: ${h}`);
  }
  assert.match(prd, /NEEDS CLARIFICATION/);
  assert.match(prd, /docs\/rules\.md/);
  assert.ok(prd.split('\n').length <= 60, 'PRD template stays one page');
});

test('rules template has the register columns, states and EARS guidance', () => {
  const rules = read('templates/project/docs/rules.md');
  assert.match(rules, /^\| ID \| Rule \| Expected \(measurable\) \| Proof \| State \| Source \|$/m);
  for (const s of ['draft', 'accepted', 'retired']) assert.match(rules, new RegExp(`\`${s}\``));
  for (const p of ['When ', 'While ', 'If ', 'Where ']) assert.match(rules, new RegExp(p));
  assert.match(rules, /moskills:rules:begin/);
});

test('init seeds both files once and keeps edits', () => {
  const dir = path.join(scratch, 'project');
  fs.mkdirSync(dir);
  init(dir);
  for (const f of ['docs/prd.md', 'docs/rules.md']) assert.ok(fs.existsSync(path.join(dir, f)), `${f} seeded`);
  fs.writeFileSync(path.join(dir, 'docs/rules.md'), 'mine\n');
  init(dir);
  assert.equal(fs.readFileSync(path.join(dir, 'docs/rules.md'), 'utf8'), 'mine\n');
});

test('skills and the stage table feed and check the files', () => {
  const preview = read('templates/claude/skills/preview/SKILL.md');
  assert.match(preview, /docs\/prd\.md/);
  assert.match(preview, /docs\/rules\.md/);
  assert.match(read('templates/claude/skills/preview/builder-check.md'), /measurable/i);
  assert.match(read('templates/claude/skills/align-intent/SKILL.md'), /--rules/);
  assert.match(read('templates/claude/skills/gatekeeper/SKILL.md'), /proof brief is the whole audit:[\s\S]*\brules/);
  const base = read('templates/managed/base.md');
  assert.match(base, /docs\/rules\.md/);
  assert.match(base, /never (silently )?edit an accepted rule/i);
});
