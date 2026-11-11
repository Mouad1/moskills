'use strict';
// gatekeeper and handoff must answer from one run-state command. That command
// prints a proof brief. A check is re-run only when the brief marks it stale,
// failing, or missing. The 0.9.2 triggering descriptions stay as they are.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills-skill-brief-'));
const env = { ...process.env, MOSKILLS_NO_NOTES: '1', MOSKILLS_NO_UPDATE_CHECK: '1' };

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function description(rel) {
  const skill = fs.readFileSync(path.join(root, rel), 'utf8');
  const found = skill.match(/^description: "(.*)"$/m);
  assert.ok(found, `${rel} needs a one-line double-quoted description`);
  return found[1].replace(/\\"/g, '"');
}

function skill(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function project(name) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.moskills.json'), '{}');
  fs.writeFileSync(path.join(dir, 'price.cjs'), 'console.log("price ok");\n');
  fs.writeFileSync(path.join(dir, 'tax.cjs'), 'console.log("tax ok");\n');
  return dir;
}

function runState(dir, args) {
  return spawnSync(process.execPath, [path.join(root, 'lib/run-state-cli.cjs'), ...args], {
    cwd: dir, env, encoding: 'utf8', timeout: 60000
  });
}

const GATEKEEPER_DESCRIPTION = 'Audits agreed scope before work is called done: runs the required checks, separates passed, failed, unknown, and not-applicable results, and reports Finished or Still not done with evidence. Use when the user asks "Is the module done?", "is X done?", "can we ship?", "is this finished?", or "ready to ship?". Use this skill whenever the user asks whether a module, feature, task, or change is done or shippable, even if they do not say gatekeeper or name a check.';
const HANDOFF_DESCRIPTION = 'Writes a handoff into .claude/STATE.md so the next session can continue: branch and changed files, decisions, blockers, verification, and the exact next step. Use when the user says "resume", "pick up where we left off", "continue from last session", "pause", or "hand this off". Use this skill whenever the user wants to resume, continue, or pick up earlier work, even if they do not say handoff.';

test('gatekeeper starts from run-state done and does not re-run current proof', () => {
  const text = skill('templates/claude/skills/gatekeeper/SKILL.md');
  assert.equal(description('templates/claude/skills/gatekeeper/SKILL.md'), GATEKEEPER_DESCRIPTION);
  assert.match(text, /start from one command: `run-state done`/);
  assert.match(text, /proof brief/);
  assert.match(text, /stale, failing, or missing/);
  assert.match(text, /do not re-run/);
  assert.match(text, /do not open `\.moskills\/runs`, `run\.json`, or evidence JSON/);
  assert.match(text, /run-state wrap --task <id> --auto-complete/);
  assert.match(text, /only after the user explicitly approves/);
  assert.doesNotMatch(text, /Execute each required automated check/);
  assert.doesNotMatch(text, /run-state resume/);
  assert.doesNotMatch(text, /run-state rules/);
});

test('handoff starts from run-state resume and does not re-run current proof', () => {
  const text = skill('templates/claude/skills/handoff/SKILL.md');
  assert.equal(description('templates/claude/skills/handoff/SKILL.md'), HANDOFF_DESCRIPTION);
  assert.match(text, /start from one command: `run-state resume`/);
  assert.match(text, /proof brief/);
  assert.match(text, /stale, failing, or missing/);
  assert.match(text, /do not re-run/);
  assert.match(text, /do not open `\.moskills\/runs`, `run\.json`, or evidence JSON/);
  assert.match(text, /do not run it while writing the handoff/);
});

test('status, done, and resume each print a proof brief for current and missing checks', () => {
  const dir = project('current');
  assert.equal(runState(dir, ['init', '--goal', 'Ship quotes', '--scope', 'price.cjs', '--tasks', 'price,tax']).status, 0);
  const wrapped = runState(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'node', 'price.cjs']);
  assert.equal(wrapped.status, 0, wrapped.stderr);
  for (const cmd of ['status', 'resume', 'done']) {
    const r = runState(dir, [cmd]);
    const out = r.stdout;
    assert.match(out, /Proof brief:/, cmd);
    assert.match(out, /^Run: default$/m, cmd);
    assert.match(out, /^Goal: Ship quotes$/m, cmd);
    assert.match(out, /^Scope: price\.cjs$/m, cmd);
    assert.match(out, /^Rules: none$/m, cmd);
    assert.match(out, /^Next: task-2 \(tax\)$/m, cmd);
    assert.match(out, /task-1 price: check-task-1 current \(exit 0\); command: node price\.cjs; do not re-run/, cmd);
    assert.match(out, /task-2 tax: missing; re-run: moskills run-state wrap --id default --task task-2 --auto-complete -- <check command>/, cmd);
    assert.match(out, /^Re-run: task-2$/m, cmd);
    assert.doesNotMatch(out, /Re-run: check-task-1/, cmd + ' must not re-run current proof');
  }
});

test('a stale check is the only re-run when its sibling is current', () => {
  const dir = project('stale');
  assert.equal(runState(dir, ['init', '--goal', 'g', '--tasks', 'price,tax']).status, 0);
  assert.equal(runState(dir, ['wrap', '--task', 'task-1', '--files', 'price.cjs', '--auto-complete', '--silent', '--', 'node', 'price.cjs']).status, 0);
  assert.equal(runState(dir, ['wrap', '--task', 'task-2', '--files', 'tax.cjs', '--auto-complete', '--silent', '--', 'node', 'tax.cjs']).status, 0);
  fs.writeFileSync(path.join(dir, 'price.cjs'), 'console.log("changed");\n');
  const r = runState(dir, ['status']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /task-1 price: check-task-1 stale \(exit 0\); command: node price\.cjs; re-run: moskills run-state wrap --id default --task task-1 --check check-task-1 --auto-complete -- node price\.cjs/);
  assert.match(r.stdout, /task-2 tax: check-task-2 current \(exit 0\); command: node tax\.cjs; do not re-run/);
  assert.match(r.stdout, /^Re-run: check-task-1$/m);
  assert.match(r.stdout, /task-1 \[stale\]/);
});

test('a failing check is re-run and a current check is not', () => {
  const dir = project('failing');
  assert.equal(runState(dir, ['init', '--goal', 'g', '--tasks', 'price,tax']).status, 0);
  assert.equal(runState(dir, ['wrap', '--task', 'task-1', '--files', 'price.cjs', '--auto-complete', '--silent', '--', 'node', 'price.cjs']).status, 0);
  assert.notEqual(runState(dir, ['wrap', '--task', 'task-2', '--files', 'tax.cjs', '--auto-complete', '--silent', '--', 'false']).status, 0);
  const r = runState(dir, ['done']);
  assert.match(r.stdout, /task-1 price: check-task-1 current \(exit 0\); command: node price\.cjs; do not re-run/);
  assert.match(r.stdout, /task-2 tax: check-task-2 failing \(exit 1\); command: false; re-run: moskills run-state wrap --id default --task task-2 --check check-task-2 --auto-complete -- false/);
  assert.match(r.stdout, /^Re-run: check-task-2$/m);
});

test('pending acceptance does not request a re-run of current proof', () => {
  const dir = project('pending');
  assert.equal(runState(dir, ['init', '--goal', 'Ship quotes', '--scope', 'price.cjs', '--tasks', 'price']).status, 0);
  assert.equal(runState(dir, ['wrap', '--task', 'task-1', '--auto-complete', '--silent', '--', 'node', 'price.cjs']).status, 0);
  const r = runState(dir, ['done']);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /task-1 price: check-task-1 current \(exit 0\); command: node price\.cjs; do not re-run/);
  assert.match(r.stdout, /^Done: no$/m);
  assert.match(r.stdout, /^Re-run: none$/m);
  assert.match(r.stdout, /^Because: human acceptance: pending$/m);
  assert.match(r.stdout, /^Human acceptance: pending$/m);
});
