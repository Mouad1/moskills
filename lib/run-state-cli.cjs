'use strict';
const path = require('node:path');
const { RunStateEngine } = require('./run-state.cjs');

function parseArgs(args) {
  const parsed = { _: [], rawCommand: [] };
  const doubleDashIdx = args.indexOf('--');
  let flagArgs = args;
  if (doubleDashIdx !== -1) {
    flagArgs = args.slice(0, doubleDashIdx);
    parsed.rawCommand = args.slice(doubleDashIdx + 1);
  }
  for (let i = 0; i < flagArgs.length; i++) {
    const arg = flagArgs[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < flagArgs.length && !flagArgs[i + 1].startsWith('--')) {
        parsed[key] = flagArgs[++i];
      } else {
        parsed[key] = true;
      }
    } else {
      parsed._.push(arg);
    }
  }
  return parsed;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const command = args._[0];
  const targetDir = (args.target || args['base-dir']) ? path.resolve(args.target || args['base-dir']) : process.cwd();
  const engine = new RunStateEngine(targetDir);

  if (!command || ['help', '--help', '-h'].includes(command)) {
    process.stdout.write(`moskills run-state: verifiable run progress and proof\n
Commands:
  init          Initialize a new run with goal, scope, and tasks
  check         Execute an agreed check command and capture verifiable evidence
  wrap          Transparently execute a command, stream output, and record proof
  complete      Verify evidence and mark a task finished
  resume        Inspect files, invalidate stale proof, and find next ready task
  status        Show run state, proof, finished, and unfinished tasks
  impact        Inspect and report tasks/checks affected by changed files
  accept        Record human acceptance tied to current scope hashes
  review        Record a manual review finding or verdict
  auto-review   Dispatch an autonomous challenger check command and record verdict
  grant-budget  Grant additional review budget cycles to an exhausted or blocked task
  lease         Acquire an exclusive time-bounded lease on a task
  heartbeat     Renew an active task lease to prevent expiration
  release       Explicitly release a held task lease
  next-tasks    List all tasks eligible for parallel execution
  claim-task    Atomically claim the next ready task for an agent
  ingest-evidence Ingest external CI/test verification evidence and proof
  dashboard     Launch the interactive web dashboard

Options:
  --id <runId>          Run identifier (default: current)
  --target <path>       Target project directory
  --goal <text>         Goal description
  --scope <f1,f2>       Comma-separated scoped files
  --cmd <command>       Command string to execute
  --check <checkId>     Check identifier
  --task <taskId>       Task identifier
  --source <name>       Source of external evidence
  --status <state>      Status of check (passed or failed)
  --code <exitCode>     Process exit code
  --output <text>       Test runner output or summary
  --agent <agentId>     Agent identifier
  --lease <leaseId>     Lease identifier
  --ttl <number>        Time-to-live in milliseconds (default: 30000)
  --by <name>           Reviewer / user name
  --count <number>      Number of cycles to grant
  --auto-complete       Auto-complete task when check passes
  --silent              Suppress command output streaming in wrap
  --json                Output raw JSON
`);
    process.exit(0);
  }

  const runId = args.id || args.run || 'default';

  try {
    if (command === 'init') {
      const scope = args.scope ? args.scope.split(',').map(s => s.trim()) : [];
      let tasks = [];
      if (args.tasks) {
        tasks = args.tasks.split(',').map((t, idx) => ({ id: `task-${idx + 1}`, title: t.trim() }));
      }
      const run = engine.initRun({
        runId,
        goal: args.goal || 'General task',
        scope,
        brief: args.brief || '',
        tasks
      });
      if (args.json) {
        process.stdout.write(JSON.stringify(run, null, 2) + '\n');
      } else {
        process.stdout.write(`Run ${run.id} initialized. Goal: ${run.goal}\n`);
      }
    } else if (command === 'check') {
      if (!args.cmd || !args.check) {
        process.stderr.write('Error: --cmd and --check are required for check execution\n');
        process.exit(1);
      }
      const relevantFiles = args.files ? args.files.split(',').map(s => s.trim()) : [];
      const evidence = engine.executeCheck({
        runId,
        checkId: args.check,
        command: args.cmd,
        cwd: targetDir,
        relevantFiles
      });
      if (args.json) {
        process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
      } else {
        process.stdout.write(`Check ${evidence.checkId} finished with exit code ${evidence.exitCode} (${evidence.durationMs}ms)\n`);
      }
      if (evidence.exitCode !== 0) {
        process.exit(evidence.exitCode);
      }
    } else if (command === 'wrap') {
      const taskId = args.task || (args._[1] && !args._[1].startsWith('--') ? args._[1] : null);
      const checkId = args.check || (args._[2] && !args._[2].startsWith('--') ? args._[2] : (taskId ? `check-${taskId}` : `check-${Date.now()}`));

      function quoteShellArg(arg) {
        if (/^[a-zA-Z0-9_\.\-\/=]+$/.test(arg)) return arg;
        return "'" + arg.replace(/'/g, "'\\''") + "'";
      }

      const cmdToRun = args.cmd || (args.rawCommand && args.rawCommand.length > 0 ? args.rawCommand.map(quoteShellArg).join(' ') : null);

      if (!cmdToRun) {
        process.stderr.write('Error: wrap requires a command to run after -- or via --cmd\n');
        process.exit(1);
      }

      const relevantFiles = args.files ? args.files.split(',').map(s => s.trim()) : [];
      const streamOutput = !args.silent && !args.json;
      const autoComplete = args['auto-complete'] === true || args.autoComplete === true;

      const result = engine.wrapCheck({
        runId,
        checkId,
        command: cmdToRun,
        cwd: targetDir,
        relevantFiles,
        streamOutput,
        taskId,
        autoComplete
      });

      if (args.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        process.stdout.write(`Evidence recorded for check ${checkId} (exit: ${result.exitCode}, ${result.durationMs}ms)${result.taskCompleted ? ' [Task ' + taskId + ' completed]' : ''}\n`);
      }

      process.exit(result.exitCode);
    } else if (command === 'complete') {
      if (!args.task) {
        process.stderr.write('Error: --task is required for complete\n');
        process.exit(1);
      }
      const requiredCheckIds = args.checks ? args.checks.split(',').map(s => s.trim()) : [];
      const task = engine.completeTask({ runId, taskId: args.task, requiredCheckIds });
      process.stdout.write(`Task ${task.id} finished with verified evidence.\n`);
    } else if (command === 'resume') {
      const result = engine.resumeRun(runId);
      if (args.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        process.stdout.write(`Goal: ${result.goal}\n`);
        process.stdout.write(`Finished: ${result.finishedTasks.map(t => t.id).join(', ') || 'none'}\n`);
        process.stdout.write(`Still not done: ${result.unfinishedTasks.map(t => t.id).join(', ') || 'none'}\n`);
        process.stdout.write(`Next: ${result.nextReadyTask ? result.nextReadyTask.id + ' (' + result.nextReadyTask.title + ')' : 'none'}\n`);
      }
    } else if (command === 'status') {
      const run = engine.getRun(runId);
      if (args.json) {
        process.stdout.write(JSON.stringify(run, null, 2) + '\n');
      } else {
        process.stdout.write(`Run: ${run.id}\nGoal: ${run.goal}\nUpdated: ${run.updatedAt}\n`);
        process.stdout.write(`Tasks: ${run.tasks.map(t => `${t.id} [${t.status}${t.stale ? ' (stale)' : ''}]`).join(', ')}\n`);
        process.stdout.write(`Human Acceptance: ${run.humanAcceptance.status}\n`);
      }
    } else if (command === 'accept') {
      const acceptance = engine.recordHumanAcceptance({
        runId,
        acceptedBy: args.by || 'user',
        notes: args.notes || ''
      });
      process.stdout.write(`Human acceptance recorded for run ${runId} by ${acceptance.acceptedBy}.\n`);
    } else if (command === 'review') {
      if (!args.task) {
        process.stderr.write('Error: --task is required for review\n');
        process.exit(1);
      }
      const findings = args.findings ? args.findings.split(',').map(s => s.trim()) : [];
      const passed = args.passed === 'true' || args.passed === true;
      const review = engine.recordReview({
        runId,
        taskId: args.task,
        reviewer: args.by || 'challenger',
        passed,
        findings
      });
      process.stdout.write(`Review recorded for task ${review.taskId}: ${review.passed ? 'PASSED' : 'NEEDS FIX'} (Remaining budget: ${review.remainingBudget})\n`);
    } else if (command === 'auto-review' || command === 'dispatch-challenger') {
      if (!args.task || !args.cmd) {
        process.stderr.write('Error: --task and --cmd are required for auto-review\n');
        process.exit(1);
      }
      const dispatch = engine.dispatchChallengerReview({
        runId,
        taskId: args.task,
        command: args.cmd,
        cwd: targetDir,
        reviewer: args.by || 'challenger'
      });
      if (args.json) {
        process.stdout.write(JSON.stringify(dispatch, null, 2) + '\n');
      } else {
        if (dispatch.passed) {
          process.stdout.write(`Autonomous Challenger review PASSED for task ${dispatch.taskId} (${dispatch.durationMs}ms)\n`);
        } else {
          process.stderr.write(`Autonomous Challenger review FAILED for task ${dispatch.taskId}: status=${dispatch.status} (Remaining budget: ${dispatch.remainingBudget})\nFindings: ${dispatch.findings.join('; ')}\n`);
        }
      }
      if (!dispatch.passed) {
        process.exit(dispatch.status === 'blocked_review_exhausted' ? 2 : 1);
      }
    } else if (command === 'grant-budget') {
      if (!args.task) {
        process.stderr.write('Error: --task is required for grant-budget\n');
        process.exit(1);
      }
      const count = args.count ? parseInt(args.count, 10) : 1;
      const task = engine.grantReviewBudget({
        runId,
        taskId: args.task,
        additionalCycles: count,
        grantedBy: args.by || 'user'
      });
      process.stdout.write(`Granted ${count} additional review cycle(s) to task ${task.id}. New budget: ${task.reviewBudget}, status: ${task.status}\n`);
    } else if (command === 'impact') {
      const filesRaw = args.files || args._[1] || '';
      const files = filesRaw.split(',').map(s => s.trim()).filter(Boolean);
      const impact = engine.getImpactedTasks(runId, files);
      if (args.json !== false) {
        process.stdout.write(JSON.stringify(impact, null, 2) + '\n');
      } else {
        process.stdout.write(`Impact analysis for run ${runId}:\n`);
        process.stdout.write(`  Impacted checks: ${impact.impactedCheckIds.join(', ') || 'none'}\n`);
        process.stdout.write(`  Impacted tasks:  ${impact.impactedTaskIds.join(', ') || 'none'}\n`);
      }
    } else if (command === 'lease') {
      if (!args.task || !args.agent) {
        process.stderr.write('Error: --task and --agent are required for lease\n');
        process.exit(1);
      }
      const ttlMs = args.ttl ? parseInt(args.ttl, 10) : 30000;
      const lease = engine.acquireTaskLease({
        runId,
        taskId: args.task,
        agentId: args.agent,
        ttlMs
      });
      if (args.json) {
        process.stdout.write(JSON.stringify(lease, null, 2) + '\n');
      } else {
        process.stdout.write(`Lease acquired for task ${args.task} by ${args.agent} (leaseId: ${lease.leaseId}, expires: ${lease.expiresAt})\n`);
      }
    } else if (command === 'heartbeat') {
      if (!args.task || !args.agent || !args.lease) {
        process.stderr.write('Error: --task, --agent, and --lease are required for heartbeat\n');
        process.exit(1);
      }
      const ttlMs = args.ttl ? parseInt(args.ttl, 10) : 30000;
      const lease = engine.renewTaskLease({
        runId,
        taskId: args.task,
        agentId: args.agent,
        leaseId: args.lease,
        ttlMs
      });
      if (args.json) {
        process.stdout.write(JSON.stringify(lease, null, 2) + '\n');
      } else {
        process.stdout.write(`Lease renewed for task ${args.task} by ${args.agent} (expires: ${lease.expiresAt})\n`);
      }
    } else if (command === 'release') {
      if (!args.task || !args.agent || !args.lease) {
        process.stderr.write('Error: --task, --agent, and --lease are required for release\n');
        process.exit(1);
      }
      const res = engine.releaseTaskLease({
        runId,
        taskId: args.task,
        agentId: args.agent,
        leaseId: args.lease
      });
      if (args.json) {
        process.stdout.write(JSON.stringify(res, null, 2) + '\n');
      } else {
        process.stdout.write(`Lease ${args.lease} released for task ${args.task} by ${args.agent}\n`);
      }
    } else if (command === 'next-tasks') {
      const readyTasks = engine.getParallelReadyTasks({ runId });
      if (args.json) {
        process.stdout.write(JSON.stringify(readyTasks, null, 2) + '\n');
      } else {
        process.stdout.write(`Ready tasks for run ${runId} (${readyTasks.length}):\n`);
        for (const t of readyTasks) {
          process.stdout.write(`  [${t.id}] ${t.title} (prerequisites: ${(t.prerequisites || []).join(', ') || 'none'})\n`);
        }
      }
    } else if (command === 'claim-task') {
      if (!args.agent) {
        process.stderr.write('Error: --agent is required for claim-task\n');
        process.exit(1);
      }
      const ttlMs = args.ttl ? parseInt(args.ttl, 10) : 30000;
      const claimed = engine.claimNextReadyTask({
        runId,
        agentId: args.agent,
        ttlMs,
        taskId: args.task || null
      });
      if (!claimed) {
        if (args.json) {
          process.stdout.write(JSON.stringify({ claimed: false, message: 'No ready tasks available' }, null, 2) + '\n');
        } else {
          process.stdout.write(`No ready tasks available to claim for run ${runId}\n`);
        }
        process.exit(1);
      }
      if (args.json) {
        process.stdout.write(JSON.stringify(claimed, null, 2) + '\n');
      } else {
        process.stdout.write(`Claimed task ${claimed.task.id} (${claimed.task.title}) by ${args.agent} (leaseId: ${claimed.lease.leaseId}, expires: ${claimed.lease.expiresAt})\n`);
      }
    } else if (command === 'ingest-evidence') {
      if (!args.check || !args.source) {
        process.stderr.write('Error: --check and --source are required for ingest-evidence\n');
        process.exit(1);
      }
      const relevantFiles = args.files ? args.files.split(',').map(s => s.trim()) : [];
      const exitCode = args.code !== undefined ? parseInt(args.code, 10) : undefined;
      const status = args.status || (exitCode === 0 ? 'passed' : (exitCode !== undefined ? 'failed' : 'passed'));
      const evidence = engine.recordExternalEvidence({
        runId,
        checkId: args.check,
        source: args.source,
        status,
        exitCode,
        output: args.output || '',
        metadata: args.meta ? JSON.parse(args.meta) : {},
        relevantFiles
      });
      if (args.json) {
        process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
      } else {
        process.stdout.write(`External evidence ingested for check ${evidence.checkId} from ${evidence.source}: status=${evidence.status} (exitCode=${evidence.exitCode})\n`);
      }
    } else if (command === 'dashboard') {
      const { startDashboardServer } = require('./run-state-dashboard.cjs');
      const port = args.port ? parseInt(args.port, 10) : 4040;
      startDashboardServer({ targetDir, runId, port }).then(({ port }) => {
        process.stdout.write(`moskills Run-State Dashboard live at http://localhost:${port}/ (Run: ${runId})\n`);
      }).catch(err => {
        process.stderr.write(`Dashboard server error: ${err.message}\n`);
        process.exit(1);
      });
    } else {
      process.stderr.write(`Unknown command '${command}'. Run with --help.\n`);
      process.exit(1);
    }
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, parseArgs };
