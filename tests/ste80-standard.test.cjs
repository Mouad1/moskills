'use strict';
// STE80 writing rules and the output ladder live in the managed standard, so every
// skill reads them with no extra file (proposal v2, 2026-11-24). docs/ste80.md
// holds the rationale and scope; the standard keeps only the rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const base = fs.readFileSync(path.join(root, 'templates/managed/base.md'), 'utf8');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills ste80 '));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function section(text, heading) {
  const start = text.indexOf(`## ${heading}\n`);
  assert.notEqual(start, -1, `missing section: ${heading}`);
  const next = text.indexOf('\n## ', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}
const { lintText } = require('../lib/ste-lint.cjs');

test('base.md has a short Writing section with rules S1 to S8', () => {
  const writing = section(base, 'Writing (STE80)');
  for (let i = 1; i <= 8; i++) assert.match(writing, new RegExp(`\\bS${i}\\b`), `missing rule S${i}`);
  assert.match(writing, /20 words or fewer/);
  assert.match(writing, /25 words or fewer/);
  assert.match(writing, /6 sentences or fewer/);
  assert.match(writing, /Avoid Saying/);
  const body = writing.split('\n').slice(1).filter((l) => l.trim());
  assert.ok(body.length <= 12, `Writing section has ${body.length} lines; keep it to 12`);
});

test('the Writing section names its scope and its exemptions', () => {
  const writing = section(base, 'Writing (STE80)');
  for (const scope of ['skill steps', 'reports', 'plans', 'PR descriptions']) assert.match(writing, new RegExp(scope));
  for (const exempt of ['frontmatter descriptions', 'rationale', 'chat replies', 'non-English text', 'code']) {
    assert.match(writing, new RegExp(exempt), `missing exemption: ${exempt}`);
  }
  assert.match(writing, /docs\/ste80\.md/);
});

test('the output ladder starts at text and climbs one rung per named trigger', () => {
  const writing = section(base, 'Writing (STE80)');
  assert.match(writing, /start with text/i);
  assert.match(writing, /one rung only for a named trigger/);
  assert.match(writing, /lower rung when two apply/);
  for (const rung of ['Mermaid diagram', 'static HTML page', 'animation']) assert.match(writing, new RegExp(rung));
  assert.match(writing, /diagram rule in Rules still applies/, 'the ladder must not weaken the documentation diagram rule');
});

test('the Writing section passes the STE80 lint with no errors', () => {
  const writing = section(base, 'Writing (STE80)');
  assert.deepEqual(lintText(writing).filter((x) => x.level === 'error'), []);
});

test('docs/ste80.md explains the rules, the ladder and the scope, and ships in the npm package', () => {
  const doc = fs.readFileSync(path.join(root, 'docs/ste80.md'), 'utf8');
  for (let i = 1; i <= 8; i++) assert.match(doc, new RegExp(`\\| S${i} \\|`), `missing rule row S${i}`);
  for (const heading of ['Where STE80 applies', 'Where STE80 does not apply', 'The output ladder', 'Why']) {
    assert.match(doc, new RegExp(`## ${heading}`), `missing heading: ${heading}`);
  }
  assert.match(doc, /```mermaid/, 'documentation rule: the doc needs a diagram');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.files.includes('docs/ste80.md'), 'package.json files must list docs/ste80.md');
});

test('init ships the Writing section into the project standard', () => {
  const dir = path.join(scratch, 'project');
  fs.mkdirSync(dir);
  const env = { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1', MOSKILLS_CLAUDE: '/nonexistent/claude' };
  const r = spawnSync('sh', [path.join(root, 'moskills'), 'init', '--target', dir],
    { env, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  const shipped = fs.readFileSync(path.join(dir, '.claude/standard/base.md'), 'utf8');
  assert.match(shipped, /## Writing \(STE80\)\n/);
});

test('project-dna writes its replay prompt in STE80 with the project terms', () => {
  const skill = fs.readFileSync(path.join(root, 'templates/claude/skills/project-dna/SKILL.md'), 'utf8');
  const step = skill.slice(skill.indexOf('## Step 5'), skill.indexOf('## Step 6'));
  assert.match(step, /STE80/);
  assert.match(step, /one action/);
  assert.match(step, /Avoid Saying/);
  assert.match(step, /moskills ste-lint --glossary/);
  const tpl = fs.readFileSync(path.join(root, 'templates/claude/skills/project-dna/references/templates.md'), 'utf8');
  const replay = tpl.slice(tpl.indexOf('### 🔁 Replay Prompt'));
  assert.match(replay, /one action/);
  for (const text of [step, replay]) assert.deepEqual(lintText(text).filter((x) => x.level === 'error'), []);
});
