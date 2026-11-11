'use strict';
// Proof paths are relative to the project root. A copy of the project (a clone
// or a move) keeps current proof when the file bytes are unchanged, including
// records written with an absolute cwd or absolute file paths. Those records
// are rewritten to relative paths when the hashes still match. Changed bytes
// stay stale and keep the old absolute record.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { RunStateEngine } = require('../lib/run-state.cjs');

const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills-portable-proof-'));
const env = { ...process.env, MOSKILLS_NO_NOTES: '1', MOSKILLS_NO_UPDATE_CHECK: '1' };

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function project(name) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.moskills.json'), '{}');
  fs.writeFileSync(path.join(dir, 'price.cjs'), 'console.log("price ok");\n');
  return dir;
}

function runState(dir, args) {
  return spawnSync(process.execPath, [path.join(root, 'lib/run-state-cli.cjs'), ...args], {
    cwd: dir, env, encoding: 'utf8', timeout: 60000
  });
}

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// Plant a finished run in the shape 0.9.2 wrote: absolute cwd and, when asked,
// absolute file keys. Returns the file hash.
function plantOldProof(dir, shape) {
  const file = path.join(dir, 'price.cjs');
  const hash = sha(file);
  const built = shape(hash, file);
  const runDir = path.join(dir, '.moskills', 'runs', 'default');
  fs.mkdirSync(path.join(runDir, 'evidence'), { recursive: true });
  const acceptance = built.acceptance || {
    status: 'pending', acceptedBy: null, acceptedAt: null, notes: null, scopedHashes: null
  };
  const run = {
    id: 'default',
    runId: 'default',
    goal: 'Ship quotes',
    scope: built.scope || ['price.cjs'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tasks: [{
      id: 'task-1', title: 'price', prerequisites: [], status: 'finished', stale: false,
      lease: null, requiredCheckIds: ['check-price'], rules: [], reviewBudget: 2,
      reviewCycles: 0, reviews: []
    }],
    humanAcceptance: acceptance
  };
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(run, null, 2));
  fs.writeFileSync(path.join(runDir, 'evidence', 'check-price.json'), JSON.stringify({
    checkId: 'check-price',
    runId: 'default',
    taskId: 'task-1',
    command: 'node price.cjs',
    exitCode: 0,
    stdout: 'price ok\n',
    stderr: '',
    executedAt: '2026-01-01T00:00:00.000Z',
    durationMs: 1,
    ...built.evidence
  }, null, 2));
  return hash;
}

test('new proof stores the working directory and file paths relative to the project', () => {
  const dir = project('fresh');
  const engine = new RunStateEngine(dir);
  engine.initRun({
    runId: 'default', goal: 'g', scope: ['price.cjs'],
    tasks: [{ id: 'task-1', title: 'price' }]
  });
  const evidence = engine.executeCheck({
    runId: 'default', checkId: 'check-price', command: 'node price.cjs',
    cwd: dir, relevantFiles: ['price.cjs']
  });
  assert.equal(evidence.cwd, '.');
  assert.deepEqual(Object.keys(evidence.fileHashes), ['price.cjs']);
  for (const file of evidence.relevantFiles) assert.equal(path.isAbsolute(file), false, file);
  const saved = fs.readFileSync(path.join(dir, '.moskills/runs/default/evidence/check-price.json'), 'utf8');
  assert.equal(saved.includes(dir), false);
});

test('a check run in a subdirectory records that directory relative to the project', () => {
  const dir = project('subdir');
  const sub = path.join(dir, 'pkg');
  fs.mkdirSync(sub);
  fs.writeFileSync(path.join(sub, 'price.cjs'), 'console.log("price ok");\n');
  const engine = new RunStateEngine(dir);
  engine.initRun({ runId: 'default', goal: 'g', tasks: [{ id: 'task-1', title: 'price' }] });
  const evidence = engine.executeCheck({
    runId: 'default', checkId: 'check-price', command: 'node price.cjs',
    cwd: sub, relevantFiles: ['price.cjs']
  });
  assert.equal(evidence.cwd, 'pkg');
  assert.equal(evidence.fileHashes['pkg/price.cjs'] != null, true);
  assert.equal(Object.keys(evidence.fileHashes).some(key => path.isAbsolute(key)), false);
  assert.equal(JSON.stringify(evidence).includes(dir), false);
});

test('a project copied to a new path keeps absolute-cwd proof and rewrites it relative', () => {
  const dir = project('abs-cwd');
  const hash = plantOldProof(dir, () => ({
    evidence: { cwd: dir, relevantFiles: ['price.cjs'], fileHashes: { 'price.cjs': sha(path.join(dir, 'price.cjs')) } }
  }));
  const copy = path.join(scratch, 'abs-cwd-copy');
  fs.cpSync(dir, copy, { recursive: true });
  // The old directory is a different tree now. Proof has to follow the copy.
  fs.writeFileSync(path.join(dir, 'price.cjs'), 'console.log("original moved on");\n');
  const status = runState(copy, ['status']);
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /task-1 \[finished\]/);
  assert.doesNotMatch(status.stdout, /task-1 \[stale\]/);
  assert.match(status.stdout, /do not re-run/);
  assert.doesNotMatch(status.stdout, new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const saved = JSON.parse(fs.readFileSync(path.join(copy, '.moskills/runs/default/evidence/check-price.json'), 'utf8'));
  assert.equal(saved.cwd, '.');
  assert.equal(saved.fileHashes['price.cjs'], hash);
  assert.equal(JSON.stringify(saved).includes(dir), false);
  const resume = runState(copy, ['resume']);
  assert.equal(resume.status, 0, resume.stderr);
  assert.match(resume.stdout, /Finished: task-1/);
  assert.doesNotMatch(resume.stdout, /Still not done: task-1/);
  const run = JSON.parse(fs.readFileSync(path.join(copy, '.moskills/runs/default/run.json'), 'utf8'));
  assert.equal(run.tasks[0].status, 'finished');
  assert.equal(run.tasks[0].stale, false);
});

test('a project copied to a new path keeps absolute file paths when the bytes match', () => {
  const dir = project('abs-files');
  const file = path.join(dir, 'price.cjs');
  const hash = sha(file);
  plantOldProof(dir, () => ({
    scope: [file],
    evidence: { cwd: dir, relevantFiles: [file], fileHashes: { [file]: hash } },
    acceptance: {
      status: 'accepted', acceptedBy: 'Mouad', acceptedAt: '2026-01-01T00:00:00.000Z',
      notes: '', scopedHashes: { [file]: hash }
    }
  }));
  const copy = path.join(scratch, 'abs-files-copy');
  fs.cpSync(dir, copy, { recursive: true });
  // The recorded absolute path still exists, but its bytes are no longer the proof.
  fs.writeFileSync(file, 'console.log("original moved on");\n');
  const status = runState(copy, ['status']);
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /task-1 \[finished\]/);
  assert.doesNotMatch(status.stdout, /task-1 \[stale\]/);
  assert.match(status.stdout, /accepted by Mouad/);
  assert.doesNotMatch(status.stdout, /scope changed/);
  assert.match(status.stdout, /do not re-run/);
  const saved = JSON.parse(fs.readFileSync(path.join(copy, '.moskills/runs/default/evidence/check-price.json'), 'utf8'));
  assert.equal(saved.cwd, '.');
  assert.equal(saved.fileHashes['price.cjs'], hash);
  assert.equal(Object.keys(saved.fileHashes).some(key => path.isAbsolute(key)), false);
  assert.equal((saved.relevantFiles || []).some(key => path.isAbsolute(key)), false);
  const done = runState(copy, ['done']);
  assert.equal(done.status, 0, done.stdout + done.stderr);
  const resume = runState(copy, ['resume']);
  assert.equal(resume.status, 0, resume.stderr);
  const run = JSON.parse(fs.readFileSync(path.join(copy, '.moskills/runs/default/run.json'), 'utf8'));
  assert.equal(run.tasks[0].status, 'finished');
  assert.equal(run.humanAcceptance.status, 'accepted');
  assert.deepEqual(Object.keys(run.humanAcceptance.scopedHashes), ['price.cjs']);
  assert.deepEqual(run.scope, ['price.cjs']);

  const dirtyDir = project('abs-files-dirty-src');
  const dirtyFile = path.join(dirtyDir, 'price.cjs');
  plantOldProof(dirtyDir, () => ({
    scope: [dirtyFile],
    evidence: {
      cwd: dirtyDir,
      relevantFiles: [dirtyFile],
      fileHashes: { [dirtyFile]: sha(dirtyFile) }
    }
  }));
  const dirty = path.join(scratch, 'abs-files-dirty');
  fs.cpSync(dirtyDir, dirty, { recursive: true });
  fs.writeFileSync(path.join(dirty, 'price.cjs'), 'console.log("changed");\n');
  const stale = runState(dirty, ['status']);
  assert.match(stale.stdout, /task-1 \[stale\]/);
  const left = JSON.parse(fs.readFileSync(path.join(dirty, '.moskills/runs/default/evidence/check-price.json'), 'utf8'));
  assert.equal(left.cwd, dirtyDir);
  assert.equal(path.isAbsolute(Object.keys(left.fileHashes)[0]), true);
});
