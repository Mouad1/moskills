'use strict';
// /preview owns the idea-to-spec stage when no other brainstorming skill runs.
// It must trigger confidently, size the work, keep questions one at a time,
// and have the spec read by an independent builder before the user sees it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'templates/claude/skills/preview');
const skill = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
const description = (skill.match(/^description: "(.*)"$/m) || [])[1] || '';
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills preview '));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function section(heading) {
  const start = skill.indexOf(`## ${heading}\n`);
  assert.notEqual(start, -1, `missing section: ${heading}`);
  const next = skill.indexOf('\n## ', start + 1);
  return skill.slice(start, next === -1 ? undefined : next);
}

test('description triggers confidently and yields to a running brainstorming skill', () => {
  assert.match(description, /^Use when:/);
  assert.doesNotMatch(description, /Do not trigger/);
  assert.match(description, /new feature, app or project/);
  assert.match(description, /another brainstorming skill is already running/);
});

test('work is sized before any spec is written', () => {
  const size = section('Size the work');
  for (const row of ['Quick, clear task', 'Small change', 'Project']) {
    assert.match(size, new RegExp(`\\| ${row} \\|`), `missing size row: ${row}`);
  }
});

test('conversation asks one question per message and plays understanding back', () => {
  const talk = section('Conversation');
  assert.match(talk, /one question per message/i);
  assert.match(talk, /play back/i);
  assert.match(talk, /mark guesses/i);
});

test('an independent builder reads the spec before the user does', () => {
  const steps = section('Steps');
  assert.match(steps, /builder-check\.md/);
  const prompt = fs.readFileSync(path.join(dir, 'builder-check.md'), 'utf8');
  for (const pile of ['Already answered', 'Builder can decide', 'Only the user can decide']) {
    assert.match(prompt, new RegExp(pile), `missing pile: ${pile}`);
  }
  assert.match(steps, /without a subagent/i, 'fallback when no subagent tool exists');
});

test('init ships the builder-check prompt with the skill', () => {
  const project = path.join(scratch, 'project');
  fs.mkdirSync(project);
  const env = { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1', MOSKILLS_CLAUDE: '/nonexistent/claude' };
  const r = spawnSync('sh', [path.join(root, 'moskills'), 'init', '--target', project],
    { env, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(project, '.claude/skills/preview/builder-check.md')));
});
