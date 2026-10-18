'use strict';
const path = require('node:path');
const { RunStateEngine } = require('./run-state.cjs');

function parseArgs(args) {
  const parsed = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        parsed[key] = args[++i];
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
  const targetDir = args.target ? path.resolve(args.target) : process.cwd();
  const engine = new RunStateEngine(targetDir);

  if (!command || ['help', '--help', '-h'].includes(command)) {
    process.stdout.write(`moskills run-state: verifiable run progress and proof\n
Commands:
  init       Initialize a new run with goal, scope, and tasks
  check      Execute an agreed check command and capture verifiable evidence
  complete   Verify evidence and mark a task finished
  resume     Inspect files, invalidate stale proof, and find next ready task
  status     Show run state, proof, finished, and unfinished tasks
  accept     Record human acceptance tied to current scope hashes

Options:
  --id <runId>          Run identifier (default: current)
  --target <path>       Target project directory
  --goal <text>         Goal description
  --scope <f1,f2>       Comma-separated scoped files
  --cmd <command>       Command string to execute
  --check <checkId>     Check identifier
  --task <taskId>       Task identifier
  --by <name>           Accepting user name
  --json                Output raw JSON
`);
    process.exit(0);
  }

  const runId = args.id || 'default';

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
