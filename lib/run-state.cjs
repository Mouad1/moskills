'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

class RunStateEngine {
  constructor(projectDir) {
    this.projectDir = path.resolve(projectDir);
    this.moskillsDir = path.join(this.projectDir, '.moskills');
    this.runsDir = path.join(this.moskillsDir, 'runs');
  }

  _getRunDir(runId) {
    return path.join(this.runsDir, runId);
  }

  _hashFile(filePath) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.projectDir, filePath);
    if (!fs.existsSync(fullPath)) return null;
    const content = fs.readFileSync(fullPath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  _hashFiles(fileList = []) {
    const hashes = {};
    for (const f of fileList) {
      hashes[f] = this._hashFile(f);
    }
    return hashes;
  }

  _atomicWriteJson(filePath, data) {
    const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  _appendEvent(runId, eventType, data = {}, actor = 'coordinator') {
    const runDir = this._getRunDir(runId);
    fs.mkdirSync(runDir, { recursive: true });
    const eventFile = path.join(runDir, 'events.ndjson');
    const event = {
      timestamp: new Date().toISOString(),
      type: eventType,
      actor,
      data
    };
    fs.appendFileSync(eventFile, JSON.stringify(event) + '\n', 'utf8');
    return event;
  }

  withLock(runId, fn) {
    const runDir = this._getRunDir(runId);
    fs.mkdirSync(runDir, { recursive: true });
    const lockFile = path.join(runDir, 'run.lock');
    let fd = null;
    try {
      fd = fs.openSync(lockFile, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, time: new Date().toISOString() }));
    } catch (err) {
      if (err.code === 'EEXIST') {
        throw new Error(`Conflict: lock already held for run ${runId}`);
      }
      throw err;
    }

    try {
      return fn();
    } finally {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch {}
        try { fs.unlinkSync(lockFile); } catch {}
      }
    }
  }

  initRun({ runId, goal, scope = [], brief = '', tasks = [] }) {
    return this.withLock(runId, () => {
      const runDir = this._getRunDir(runId);
      fs.mkdirSync(path.join(runDir, 'evidence'), { recursive: true });

      const runData = {
        id: runId,
        goal,
        scope,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          prerequisites: t.prerequisites || [],
          status: 'unfinished',
          stale: false,
          requiredCheckIds: t.requiredCheckIds || []
        })),
        humanAcceptance: {
          status: 'pending',
          acceptedBy: null,
          acceptedAt: null,
          notes: null,
          scopedHashes: null
        }
      };

      if (brief) {
        fs.writeFileSync(path.join(runDir, 'brief.md'), brief, 'utf8');
      }

      this._atomicWriteJson(path.join(runDir, 'run.json'), runData);
      this._appendEvent(runId, 'RUN_INITIALIZED', { goal, scope, taskCount: tasks.length });

      return runData;
    });
  }

  getRun(runId) {
    const runFile = path.join(this._getRunDir(runId), 'run.json');
    if (!fs.existsSync(runFile)) {
      throw new Error(`Run ${runId} not found`);
    }
    return JSON.parse(fs.readFileSync(runFile, 'utf8'));
  }

  updateRun(runId, updater, actor = 'coordinator') {
    return this.withLock(runId, () => {
      const current = this.getRun(runId);
      const updated = updater(current) || current;
      updated.updatedAt = new Date().toISOString();
      this._atomicWriteJson(path.join(this._getRunDir(runId), 'run.json'), updated);
      this._appendEvent(runId, 'RUN_UPDATED', { updatedKeys: Object.keys(updated) }, actor);
      return updated;
    });
  }

  executeCheck({ runId, checkId, command, cwd, relevantFiles = [], env = {} }) {
    return this.withLock(runId, () => {
      const workingDir = cwd ? path.resolve(cwd) : this.projectDir;
      const startTime = Date.now();

      const res = spawnSync('sh', ['-c', command], {
        cwd: workingDir,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      });

      const durationMs = Date.now() - startTime;
      const fileHashes = this._hashFiles(relevantFiles);

      const evidence = {
        checkId,
        runId,
        command,
        cwd: workingDir,
        relevantFiles,
        fileHashes,
        exitCode: res.status !== null ? res.status : 1,
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        executedAt: new Date().toISOString(),
        durationMs
      };

      const evidenceDir = path.join(this._getRunDir(runId), 'evidence');
      fs.mkdirSync(evidenceDir, { recursive: true });
      this._atomicWriteJson(path.join(evidenceDir, `${checkId}.json`), evidence);

      this._appendEvent(runId, 'CHECK_EXECUTED', {
        checkId,
        exitCode: evidence.exitCode,
        durationMs
      });

      return evidence;
    });
  }

  verifyEvidence({ runId, checkId }) {
    const evidencePath = path.join(this._getRunDir(runId), 'evidence', `${checkId}.json`);
    if (!fs.existsSync(evidencePath)) {
      return { valid: false, missing: true, stale: false };
    }

    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    if (evidence.exitCode !== 0) {
      return { valid: false, failed: true, stale: false, evidence };
    }

    const currentHashes = this._hashFiles(evidence.relevantFiles || []);
    let stale = false;
    for (const [file, recordedHash] of Object.entries(evidence.fileHashes || {})) {
      if (currentHashes[file] !== recordedHash) {
        stale = true;
        break;
      }
    }

    return {
      valid: !stale,
      stale,
      failed: false,
      currentHashes,
      recordedHashes: evidence.fileHashes,
      evidence
    };
  }

  completeTask({ runId, taskId, requiredCheckIds = [] }) {
    return this.withLock(runId, () => {
      const run = this.getRun(runId);
      const task = run.tasks.find(t => t.id === taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);

      if (requiredCheckIds.length === 0) {
        throw new Error(`Cannot complete task ${taskId}: missing required evidence checks`);
      }

      for (const checkId of requiredCheckIds) {
        const verify = this.verifyEvidence({ runId, checkId });
        if (verify.missing) {
          throw new Error(`Cannot complete task ${taskId}: missing required evidence for ${checkId}`);
        }
        if (verify.failed || verify.evidence.exitCode !== 0) {
          throw new Error(`Cannot complete task ${taskId}: check did not pass for ${checkId}`);
        }
        if (verify.stale) {
          throw new Error(`Cannot complete task ${taskId}: evidence is stale for ${checkId}`);
        }
      }

      task.status = 'finished';
      task.stale = false;
      task.requiredCheckIds = requiredCheckIds;
      task.finishedAt = new Date().toISOString();

      run.updatedAt = new Date().toISOString();
      this._atomicWriteJson(path.join(this._getRunDir(runId), 'run.json'), run);
      this._appendEvent(runId, 'TASK_COMPLETED', { taskId, requiredCheckIds });

      return task;
    });
  }

  resumeRun(runId) {
    return this.withLock(runId, () => {
      const run = this.getRun(runId);

      // Check evidence staleness for all tasks that have required checks
      for (const task of run.tasks) {
        if (task.status === 'finished' && task.requiredCheckIds && task.requiredCheckIds.length > 0) {
          for (const checkId of task.requiredCheckIds) {
            const verify = this.verifyEvidence({ runId, checkId });
            if (verify.stale || verify.missing) {
              task.status = 'unfinished';
              task.stale = true;
              this._appendEvent(runId, 'TASK_INVALIDATED', { taskId: task.id, checkId, reason: 'stale evidence' });
              break;
            }
          }
        }
      }

      this.verifyHumanAcceptance({ runId, run });

      run.updatedAt = new Date().toISOString();
      this._atomicWriteJson(path.join(this._getRunDir(runId), 'run.json'), run);

      const finishedTasks = run.tasks.filter(t => t.status === 'finished');
      const unfinishedTasks = run.tasks.filter(t => t.status !== 'finished');

      const finishedIds = new Set(finishedTasks.map(t => t.id));
      const nextReadyTask = unfinishedTasks.find(t =>
        (t.prerequisites || []).every(pre => finishedIds.has(pre))
      ) || null;

      this._appendEvent(runId, 'RUN_RESUMED', {
        finishedCount: finishedTasks.length,
        unfinishedCount: unfinishedTasks.length,
        nextReadyTaskId: nextReadyTask ? nextReadyTask.id : null
      });

      return {
        runId,
        goal: run.goal,
        tasks: run.tasks,
        finishedTasks,
        unfinishedTasks,
        nextReadyTask,
        humanAcceptance: run.humanAcceptance
      };
    });
  }

  recordHumanAcceptance({ runId, acceptedBy, notes = '' }) {
    return this.withLock(runId, () => {
      const run = this.getRun(runId);
      const scopedHashes = this._hashFiles(run.scope || []);

      run.humanAcceptance = {
        status: 'accepted',
        acceptedBy,
        acceptedAt: new Date().toISOString(),
        notes,
        scopedHashes
      };

      run.updatedAt = new Date().toISOString();
      this._atomicWriteJson(path.join(this._getRunDir(runId), 'run.json'), run);
      this._appendEvent(runId, 'HUMAN_ACCEPTANCE_RECORDED', { acceptedBy, notes, scopedHashes });

      return run.humanAcceptance;
    });
  }

  verifyHumanAcceptance({ runId, run = null }) {
    const currentRun = run || this.getRun(runId);
    if (!currentRun.humanAcceptance || currentRun.humanAcceptance.status !== 'accepted') {
      return { status: 'pending', invalidated: false };
    }

    const recorded = currentRun.humanAcceptance.scopedHashes || {};
    const current = this._hashFiles(currentRun.scope || []);

    let changed = false;
    for (const [file, hash] of Object.entries(recorded)) {
      if (current[file] !== hash) {
        changed = true;
        break;
      }
    }

    if (changed) {
      currentRun.humanAcceptance.status = 'pending';
      currentRun.humanAcceptance.invalidatedAt = new Date().toISOString();
      this._atomicWriteJson(path.join(this._getRunDir(runId), 'run.json'), currentRun);
      this._appendEvent(runId, 'HUMAN_ACCEPTANCE_INVALIDATED', { reason: 'scope files changed' });
      return { status: 'pending', invalidated: true };
    }

    return { status: 'accepted', invalidated: false };
  }
}

module.exports = { RunStateEngine };
