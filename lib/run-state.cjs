'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { resolveAllDependencies } = require('./dep-graph.cjs');

class RunStateEngine {
  constructor(projectDir = process.cwd()) {
    const dir = typeof projectDir === 'object' && projectDir !== null
      ? (projectDir.projectDir || projectDir.baseDir || projectDir.target || process.cwd())
      : projectDir;
    this.projectDir = path.resolve(dir || process.cwd());
    this.moskillsDir = path.join(this.projectDir, '.moskills');
    this.runsDir = path.join(this.moskillsDir, 'runs');
  }

  _expandRelevantFiles(files = [], workingDir) {
    const root = this.projectDir;
    const work = workingDir ? path.resolve(root, workingDir) : root;
    const absFiles = files.map(f => path.isAbsolute(f) ? f : path.resolve(work, f));
    const expandedAbs = resolveAllDependencies(absFiles, { rootDir: root });
    const relative = expandedAbs.map(f => path.relative(root, f));
    return Array.from(new Set([...files, ...relative]));
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
    const id = runId || ('run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6));
    return this.withLock(id, () => {
      const runDir = this._getRunDir(id);
      fs.mkdirSync(path.join(runDir, 'evidence'), { recursive: true });

      const runData = {
        id,
        runId: id,
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
          lease: null,
          requiredCheckIds: t.requiredCheckIds || [],
          reviewBudget: typeof t.reviewBudget === 'number' ? t.reviewBudget : 2,
          reviewCycles: 0,
          reviews: []
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
      this._appendEvent(id, 'RUN_INITIALIZED', { goal, scope, taskCount: tasks.length });

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
      const expandedFiles = this._expandRelevantFiles(relevantFiles, workingDir);
      const fileHashes = this._hashFiles(expandedFiles);

      const evidence = {
        checkId,
        runId,
        command,
        cwd: workingDir,
        relevantFiles: expandedFiles,
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

  wrapCheck({ runId, checkId, command, cwd, relevantFiles = [], env = {}, streamOutput = false, taskId = null, autoComplete = false }) {
    const workingDir = cwd ? path.resolve(cwd) : this.projectDir;
    const run = this.getRun(runId);

    let filesToHash = relevantFiles;
    if ((!filesToHash || filesToHash.length === 0) && taskId) {
      const task = (run.tasks || []).find(t => t.id === taskId);
      if (task && task.scope && task.scope.length > 0) {
        filesToHash = task.scope;
      } else if (run.scope && run.scope.length > 0) {
        filesToHash = run.scope;
      }
    }

    const startTime = Date.now();
    const res = spawnSync('sh', ['-c', command], {
      cwd: workingDir,
      env: { ...process.env, ...env },
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    const durationMs = Date.now() - startTime;

    if (streamOutput) {
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
    }

    const expandedFiles = this._expandRelevantFiles(filesToHash, workingDir);
    const fileHashes = this._hashFiles(expandedFiles);
    const exitCode = res.status !== null ? res.status : 1;

    const evidence = {
      checkId,
      runId,
      taskId: taskId || null,
      command,
      cwd: workingDir,
      relevantFiles: expandedFiles,
      fileHashes,
      exitCode,
      stdout: res.stdout || '',
      stderr: res.stderr || '',
      executedAt: new Date().toISOString(),
      durationMs
    };

    this.withLock(runId, () => {
      const evidenceDir = path.join(this._getRunDir(runId), 'evidence');
      fs.mkdirSync(evidenceDir, { recursive: true });
      this._atomicWriteJson(path.join(evidenceDir, `${checkId}.json`), evidence);

      this._appendEvent(runId, 'CHECK_WRAPPED', {
        checkId,
        taskId: taskId || null,
        exitCode,
        durationMs
      });
    });

    let taskCompleted = false;
    let completedTask = null;
    const targetTaskId = taskId || (typeof autoComplete === 'string' ? autoComplete : null);
    const shouldComplete = Boolean(autoComplete);
    if (shouldComplete && targetTaskId && exitCode === 0) {
      try {
        completedTask = this.completeTask({
          runId,
          taskId: targetTaskId,
          requiredCheckIds: [checkId]
        });
        taskCompleted = true;
      } catch (err) {
        taskCompleted = false;
      }
    }

    return {
      evidence,
      exitCode,
      durationMs,
      taskCompleted,
      completedTask
    };
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
    const changedFiles = [];
    for (const [file, recordedHash] of Object.entries(evidence.fileHashes || {})) {
      if (currentHashes[file] !== recordedHash) {
        stale = true;
        changedFiles.push(file);
      }
    }

    return {
      valid: !stale,
      stale,
      failed: false,
      reason: stale ? 'dependency_changed' : null,
      changedFiles,
      currentHashes,
      recordedHashes: evidence.fileHashes,
      evidence
    };
  }

  getImpactedTasks(runId, changedFiles = []) {
    const run = this.getRun(runId);
    const evidenceDir = path.join(this._getRunDir(runId), 'evidence');
    const normalizedChanged = changedFiles.map(f => {
      const abs = path.isAbsolute(f) ? f : path.resolve(this.projectDir, f);
      return path.relative(this.projectDir, abs);
    });

    const impactedCheckIds = new Set();
    const impactedTaskIds = new Set();

    if (fs.existsSync(evidenceDir)) {
      const files = fs.readdirSync(evidenceDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const ev = JSON.parse(fs.readFileSync(path.join(evidenceDir, file), 'utf8'));
          const checkFiles = Object.keys(ev.fileHashes || {});
          const hasOverlap = checkFiles.some(cf => {
            const cfNorm = path.relative(this.projectDir, path.resolve(this.projectDir, cf));
            return normalizedChanged.some(nc => cfNorm === nc || cfNorm.endsWith(nc) || nc.endsWith(cfNorm));
          });
          if (hasOverlap) {
            impactedCheckIds.add(ev.checkId || file.replace('.json', ''));
          }
        } catch {}
      }
    }

    for (const task of run.tasks || []) {
      const required = task.requiredCheckIds || [];
      if (required.some(cid => impactedCheckIds.has(cid))) {
        impactedTaskIds.add(task.id);
      }
    }

    return {
      runId,
      changedFiles: normalizedChanged,
      impactedCheckIds: Array.from(impactedCheckIds),
      impactedTaskIds: Array.from(impactedTaskIds)
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
      task.lease = null;

      run.updatedAt = new Date().toISOString();
      this._atomicWriteJson(path.join(this._getRunDir(runId), 'run.json'), run);
      this._appendEvent(runId, 'TASK_COMPLETED', { taskId, requiredCheckIds });

      return task;
    });
  }

  acquireTaskLease({ runId, taskId, agentId, ttlMs = 30000 }) {
    if (!taskId || !agentId) {
      throw new Error('taskId and agentId are required to acquire a lease');
    }
    return this.withLock(runId, () => {
      const run = this.getRun(runId);
      const task = run.tasks.find(t => t.id === taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found in run ${runId}`);
      }
      if (task.status === 'finished') {
        throw new Error(`Cannot acquire lease: Task ${taskId} is already finished`);
      }

      const now = Date.now();
      const existingLease = task.lease;
      let isReclaim = false;

      if (existingLease && new Date(existingLease.expiresAt).getTime() > now) {
        if (existingLease.agentId !== agentId) {
          throw new Error(`Conflict: Task ${taskId} is currently leased by agent ${existingLease.agentId} until ${existingLease.expiresAt}`);
        }
      } else if (existingLease) {
        isReclaim = true;
      }

      const leaseId = crypto.randomUUID();
      const acquiredAt = new Date(now).toISOString();
      const expiresAt = new Date(now + ttlMs).toISOString();

      const lease = {
        leaseId,
        agentId,
        acquiredAt,
        expiresAt,
        ttlMs
      };

      task.lease = lease;
      run.updatedAt = new Date().toISOString();
      this._atomicWriteJson(path.join(this._getRunDir(runId), 'run.json'), run);

      this._appendEvent(runId, isReclaim ? 'TASK_LEASE_RECLAIMED' : 'TASK_LEASE_ACQUIRED', {
        taskId,
        leaseId,
        agentId,
        expiresAt,
        ttlMs
      }, agentId);

      return lease;
    });
  }

  renewTaskLease({ runId, taskId, agentId, leaseId, ttlMs = 30000 }) {
    if (!taskId || !agentId || !leaseId) {
      throw new Error('taskId, agentId, and leaseId are required to renew a lease');
    }
    return this.withLock(runId, () => {
      const run = this.getRun(runId);
      const task = run.tasks.find(t => t.id === taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found in run ${runId}`);
      }
      if (!task.lease) {
        throw new Error(`Task ${taskId} has no active lease to renew`);
      }
      if (task.lease.leaseId !== leaseId || task.lease.agentId !== agentId) {
        throw new Error(`Lease mismatch for task ${taskId}: active lease ${task.lease.leaseId} belongs to ${task.lease.agentId}`);
      }

      const now = Date.now();
      task.lease.expiresAt = new Date(now + ttlMs).toISOString();
      task.lease.ttlMs = ttlMs;
      task.lease.renewedAt = new Date(now).toISOString();

      run.updatedAt = new Date().toISOString();
      this._atomicWriteJson(path.join(this._getRunDir(runId), 'run.json'), run);

      this._appendEvent(runId, 'TASK_LEASE_RENEWED', {
        taskId,
        leaseId,
        agentId,
        expiresAt: task.lease.expiresAt,
        ttlMs
      }, agentId);

      return task.lease;
    });
  }

  releaseTaskLease({ runId, taskId, agentId, leaseId }) {
    if (!taskId || !agentId || !leaseId) {
      throw new Error('taskId, agentId, and leaseId are required to release a lease');
    }
    return this.withLock(runId, () => {
      const run = this.getRun(runId);
      const task = run.tasks.find(t => t.id === taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found in run ${runId}`);
      }
      if (!task.lease) {
        return { released: true, taskId, agentId, leaseId, message: 'No active lease' };
      }
      if (task.lease.leaseId !== leaseId || task.lease.agentId !== agentId) {
        throw new Error(`Cannot release lease: active lease ${task.lease.leaseId} belongs to ${task.lease.agentId}`);
      }

      task.lease = null;
      run.updatedAt = new Date().toISOString();
      this._atomicWriteJson(path.join(this._getRunDir(runId), 'run.json'), run);

      this._appendEvent(runId, 'TASK_LEASE_RELEASED', {
        taskId,
        leaseId,
        agentId
      }, agentId);

      return { released: true, taskId, agentId, leaseId };
    });
  }

  recordReview({ runId, taskId, reviewer = 'challenger', passed = false, findings = [], blocking = false, suggestions = [] }) {
    return this.withLock(runId, () => {
      const run = this.getRun(runId);
      const task = run.tasks.find(t => t.id === taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);

      const budget = task.reviewBudget !== undefined ? task.reviewBudget : 2;
      const currentCycles = task.reviewCycles || 0;

      if (currentCycles >= budget) {
        throw new Error(`Review budget exhausted for task ${taskId} (${currentCycles}/${budget} cycles used). Requires human budget grant.`);
      }

      task.reviewCycles = currentCycles + 1;
      const cycle = task.reviewCycles;
      const remainingBudget = Math.max(0, budget - cycle);

      let status = task.status;
      if (passed) {
        if (status === 'needs_fix' || status === 'blocked_review_exhausted') {
          status = 'unfinished';
        }
      } else {
        if (remainingBudget > 0) {
          status = 'needs_fix';
        } else {
          status = 'blocked_review_exhausted';
        }
      }
      task.status = status;

      const reviewEvidence = {
        reviewId: `review-${taskId}-${cycle}`,
        taskId,
        runId,
        reviewer,
        cycle,
        remainingBudget,
        passed,
        findings,
        blocking,
        suggestions,
        status,
        reviewedAt: new Date().toISOString()
      };

      task.reviews = task.reviews || [];
      task.reviews.push(reviewEvidence);

      const evidenceDir = path.join(this._getRunDir(runId), 'evidence');
      fs.mkdirSync(evidenceDir, { recursive: true });
      this._atomicWriteJson(path.join(evidenceDir, `review-${taskId}-${cycle}.json`), reviewEvidence);

      run.updatedAt = new Date().toISOString();
      this._atomicWriteJson(path.join(this._getRunDir(runId), 'run.json'), run);

      this._appendEvent(runId, 'CHALLENGER_REVIEW_RECORDED', {
        taskId,
        cycle,
        passed,
        remainingBudget,
        status,
        findingCount: findings.length
      }, reviewer);

      return reviewEvidence;
    });
  }

  dispatchChallengerReview({ runId, taskId, command, evaluatorFn, cwd, reviewer = 'challenger', blocking = true, suggestions = [] }) {
    const run = this.getRun(runId);
    const task = run.tasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    let passed = false;
    let findings = [];
    let stdout = '';
    let stderr = '';
    let exitCode = 1;
    let durationMs = 0;

    if (command) {
      const workingDir = cwd ? path.resolve(cwd) : this.projectDir;
      const startTime = Date.now();
      const res = spawnSync('sh', ['-c', command], {
        cwd: workingDir,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      });
      durationMs = Date.now() - startTime;
      stdout = res.stdout || '';
      stderr = res.stderr || '';
      exitCode = res.status !== null ? res.status : 1;
      passed = exitCode === 0;
      if (!passed) {
        findings = [stderr.trim() || stdout.trim() || `Command failed with exit code ${exitCode}`];
      }
    } else if (typeof evaluatorFn === 'function') {
      const startTime = Date.now();
      const evalRes = evaluatorFn(task, run);
      durationMs = Date.now() - startTime;
      passed = !!evalRes.passed;
      findings = evalRes.findings || (passed ? [] : ['Evaluator reported failure']);
      stdout = evalRes.stdout || '';
      stderr = evalRes.stderr || '';
      exitCode = passed ? 0 : 1;
    } else {
      throw new Error('dispatchChallengerReview requires either command or evaluatorFn');
    }

    const reviewEvidence = this.recordReview({
      runId,
      taskId,
      reviewer,
      passed,
      findings,
      blocking,
      suggestions
    });

    // Enrich review evidence artifact with execution details
    reviewEvidence.command = command || 'evaluatorFn';
    reviewEvidence.exitCode = exitCode;
    reviewEvidence.stdout = stdout;
    reviewEvidence.stderr = stderr;
    reviewEvidence.durationMs = durationMs;

    const evidenceDir = path.join(this._getRunDir(runId), 'evidence');
    this._atomicWriteJson(path.join(evidenceDir, `${reviewEvidence.reviewId}.json`), reviewEvidence);

    this._appendEvent(runId, 'CHALLENGER_DISPATCHED', {
      taskId,
      reviewer,
      command: command || 'evaluatorFn',
      exitCode,
      passed,
      cycle: reviewEvidence.cycle,
      remainingBudget: reviewEvidence.remainingBudget,
      status: reviewEvidence.status,
      durationMs
    }, reviewer);

    return {
      dispatchId: `dispatch-${taskId}-${reviewEvidence.cycle}`,
      taskId,
      reviewer,
      command: command || 'evaluatorFn',
      exitCode,
      stdout,
      stderr,
      durationMs,
      passed,
      findings,
      status: reviewEvidence.status,
      cycle: reviewEvidence.cycle,
      remainingBudget: reviewEvidence.remainingBudget,
      reviewEvidence
    };
  }


  grantReviewBudget({ runId, taskId, additionalCycles = 1, grantedBy = 'user' }) {
    return this.withLock(runId, () => {
      const run = this.getRun(runId);
      const task = run.tasks.find(t => t.id === taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);

      task.reviewBudget = (task.reviewBudget !== undefined ? task.reviewBudget : 2) + additionalCycles;
      if (task.status === 'blocked_review_exhausted') {
        task.status = 'needs_fix';
      }

      run.updatedAt = new Date().toISOString();
      this._atomicWriteJson(path.join(this._getRunDir(runId), 'run.json'), run);

      this._appendEvent(runId, 'REVIEW_BUDGET_GRANTED', {
        taskId,
        additionalCycles,
        newBudget: task.reviewBudget,
        status: task.status
      }, grantedBy);

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
