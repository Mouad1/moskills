const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { RunStateEngine } = require('../lib/run-state.cjs');

test('Step 2: Semantic Dependency-Aware Evidence Invalidation', async (t) => {
  await t.test('modifying a deep dependency marks evidence stale with reason', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sem-inval-'));
    try {
      const engine = new RunStateEngine({ baseDir: tmpDir });
      const run = engine.initRun({
        goal: 'Test semantic invalidation',
        tasks: [{ id: 'task-1', title: 'Task 1', requiredCheckIds: ['check-1'] }]
      });

      const entryFile = path.join(tmpDir, 'entry.cjs');
      const depFile = path.join(tmpDir, 'dep.cjs');
      const unrelatedFile = path.join(tmpDir, 'unrelated.cjs');

      fs.writeFileSync(depFile, 'module.exports = 100;\n');
      fs.writeFileSync(entryFile, 'const d = require("./dep.cjs"); module.exports = d;\n');
      fs.writeFileSync(unrelatedFile, 'module.exports = 999;\n');

      // Wrap check with only entry.cjs in relevantFiles
      engine.wrapCheck({
        runId: run.runId,
        checkId: 'check-1',
        command: 'node -e "require(\'./entry.cjs\')"',
        cwd: tmpDir,
        relevantFiles: ['entry.cjs'],
        autoComplete: 'task-1'
      });

      let verify = engine.verifyEvidence({ runId: run.runId, checkId: 'check-1' });
      assert.equal(verify.valid, true, 'Check should be valid initially');
      assert.equal(verify.stale, false);

      // Mutate unrelated file -> check must stay valid!
      fs.writeFileSync(unrelatedFile, 'module.exports = 1000;\n');
      verify = engine.verifyEvidence({ runId: run.runId, checkId: 'check-1' });
      assert.equal(verify.valid, true, 'Check must remain valid when unrelated file changes');

      // Mutate deep dependency -> check must become stale!
      fs.writeFileSync(depFile, 'module.exports = 200;\n');
      verify = engine.verifyEvidence({ runId: run.runId, checkId: 'check-1' });
      assert.equal(verify.valid, false, 'Check must become invalid');
      assert.equal(verify.stale, true, 'Check must be stale');
      assert.equal(verify.reason, 'dependency_changed');
      assert.ok(verify.changedFiles.includes('dep.cjs') || verify.changedFiles.some(f => f.endsWith('dep.cjs')));

      // Resume run -> task-1 must be reopened
      const res = engine.resumeRun(run.runId);
      const task1 = res.tasks.find(tk => tk.id === 'task-1');
      assert.equal(task1.status, 'unfinished');
      assert.equal(task1.stale, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('getImpactedTasks identifies checks and tasks affected by changed files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sem-impact-'));
    try {
      const engine = new RunStateEngine({ baseDir: tmpDir });
      const run = engine.initRun({
        goal: 'Test impact query',
        tasks: [
          { id: 'task-a', title: 'Task A', requiredCheckIds: ['check-a'] },
          { id: 'task-b', title: 'Task B', requiredCheckIds: ['check-b'] }
        ]
      });

      const fileA = path.join(tmpDir, 'a.cjs');
      const fileDep = path.join(tmpDir, 'shared-dep.cjs');
      const fileB = path.join(tmpDir, 'b.cjs');

      fs.writeFileSync(fileDep, 'module.exports = "shared";\n');
      fs.writeFileSync(fileA, 'require("./shared-dep.cjs");\n');
      fs.writeFileSync(fileB, 'module.exports = "b";\n');

      engine.wrapCheck({
        runId: run.runId,
        checkId: 'check-a',
        command: 'node -e "require(\'./a.cjs\')"',
        cwd: tmpDir,
        relevantFiles: ['a.cjs'],
        autoComplete: 'task-a'
      });

      engine.wrapCheck({
        runId: run.runId,
        checkId: 'check-b',
        command: 'node -e "require(\'./b.cjs\')"',
        cwd: tmpDir,
        relevantFiles: ['b.cjs'],
        autoComplete: 'task-b'
      });

      // If shared-dep.cjs changes: task-a and check-a are impacted, but not task-b
      const impact = engine.getImpactedTasks(run.runId, ['shared-dep.cjs']);
      assert.ok(impact.impactedCheckIds.includes('check-a'));
      assert.ok(!impact.impactedCheckIds.includes('check-b'));
      assert.ok(impact.impactedTaskIds.includes('task-a'));
      assert.ok(!impact.impactedTaskIds.includes('task-b'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('CLI integration: moskills run-state impact', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sem-cli-'));
    try {
      const cliPath = path.resolve(__dirname, '../lib/run-state-cli.cjs');
      const engine = new RunStateEngine({ baseDir: tmpDir });
      const run = engine.initRun({
        goal: 'CLI impact test',
        tasks: [{ id: 'task-cli', title: 'CLI Task', requiredCheckIds: ['check-cli'] }]
      });

      const fileEntry = path.join(tmpDir, 'entry.cjs');
      const fileDep = path.join(tmpDir, 'dep.cjs');
      fs.writeFileSync(fileDep, 'module.exports = "dep";\n');
      fs.writeFileSync(fileEntry, 'require("./dep.cjs");\n');

      engine.wrapCheck({
        runId: run.runId,
        checkId: 'check-cli',
        command: 'node -e "require(\'./entry.cjs\')"',
        cwd: tmpDir,
        relevantFiles: ['entry.cjs'],
        autoComplete: 'task-cli'
      });

      // Invoke CLI: moskills run-state impact --run <runId> --files dep.cjs
      const proc = spawnSync('node', [
        cliPath,
        'impact',
        '--run', run.runId,
        '--files', 'dep.cjs',
        '--base-dir', tmpDir
      ], { encoding: 'utf8' });

      assert.equal(proc.status, 0, `CLI failed: ${proc.stderr}`);
      const output = JSON.parse(proc.stdout);
      assert.ok(output.impactedTaskIds.includes('task-cli'));
      assert.ok(output.impactedCheckIds.includes('check-cli'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
