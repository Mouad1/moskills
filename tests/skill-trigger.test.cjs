'use strict';
// Skill descriptions are what Claude Code matches. gatekeeper and handoff must
// say what they do and when to use them (third person, concrete phrases, a bit
// pushy), and the managed standard must send those phrases to the skill.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function description(rel) {
  const skill = fs.readFileSync(path.join(root, rel), 'utf8');
  const found = skill.match(/^description: "(.*)"$/m);
  assert.ok(found, `${rel} needs a one-line double-quoted description`);
  return found[1].replace(/\\"/g, '"');
}

function assertTrigger(rel, phrases) {
  const text = description(rel);
  assert.ok(text.length <= 1024, `${rel} description is ${text.length} chars`);
  assert.doesNotMatch(text, /^Use when\b/, `${rel} must lead with what it does, in third person`);
  assert.doesNotMatch(text, /\b(I|you|your)\b/i, `${rel} description must stay in third person`);
  assert.match(text, /Use when/);
  assert.match(text, /even if/);
  for (const phrase of phrases) assert.match(text, new RegExp(phrase.replace(/[?]/g, '\\?')));
}

test('gatekeeper description triggers on done and ship questions', () => {
  assertTrigger('templates/claude/skills/gatekeeper/SKILL.md', [
    'Is the module done\\?', 'is X done', 'can we ship'
  ]);
  assert.match(description('templates/claude/skills/gatekeeper/SKILL.md'), /passed, failed, unknown/);
});

test('handoff description triggers on resume and continue phrases', () => {
  assertTrigger('templates/claude/skills/handoff/SKILL.md', [
    'resume', 'pick up where we left off', 'continue from last session'
  ]);
  assert.match(description('templates/claude/skills/handoff/SKILL.md'), /next step/);
});

test('managed sections send done and resume phrases to the skills', () => {
  const base = fs.readFileSync(path.join(root, 'templates/managed/base.md'), 'utf8');
  const protocol = fs.readFileSync(path.join(root, 'templates/managed/session-protocol.md'), 'utf8');
  const hook = fs.readFileSync(path.join(root, 'moskills'), 'utf8');
  for (const phrase of ['Is the module done?', 'is X done', 'can we ship',
    'pick up where we left off', 'continue from last session']) {
    assert.match(base, new RegExp(phrase.replace(/[?]/g, '\\?')));
    assert.match(protocol, new RegExp(phrase.replace(/[?]/g, '\\?')));
  }
  assert.match(base, /Gatekeeper skill/);
  assert.match(base, /do not answer from the Run proof block or run-state alone/);
  assert.match(base, /Handoff skill/);
  assert.match(base, /not the reply/);
  assert.match(protocol, /invoke the handoff skill/i);
  assert.match(protocol, /invoke the gatekeeper skill/i);
  assert.match(protocol, /run-state resume/);
  assert.match(hook, /gatekeeper skill/);
  assert.match(hook, /handoff skill/);
});
