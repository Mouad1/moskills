'use strict';
// Read-only summary of the active run, for the agent's context.
// Usage: node run-summary.cjs <projectDir> <cliCommand>
// Prints nothing when the project has no run. Never writes run.json or locks.
// The active run is the one init or resume recorded (.moskills/runs/.active,
// gitignored with the runs). With none recorded, the newest run is the fallback.
// The STATE.md Run proof block is the same taskProofs view, rewritten by the
// context command (writeLatestNotes) for that same run.
const fs = require('node:fs');
const path = require('node:path');

function runsDirOf(projectDir) {
  return path.join(projectDir, '.moskills', 'runs');
}

function isRunId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 200 &&
    !id.startsWith('.') && !/[\u0000-\u001f/\\]/.test(id);
}

function newestRun(projectDir) {
  const runsDir = runsDirOf(projectDir);
  let best = null;
  let entries = [];
  try { entries = fs.readdirSync(runsDir); } catch { return null; }
  for (const id of entries) {
    try {
      const run = JSON.parse(fs.readFileSync(path.join(runsDir, id, 'run.json'), 'utf8'));
      const at = Date.parse(run.updatedAt || run.createdAt || 0) || 0;
      if (!best || at > best.at || (at === best.at && String(run.id) < String(best.run.id))) best = { run, at };
    } catch { /* skip unreadable runs and the .active pointer */ }
  }
  return best && best.run;
}

// Newest run by updatedAt. Kept for callers that want "last touched", not the
// block's stable selection.
function latestRun(projectDir) {
  return newestRun(projectDir);
}

function activePath(projectDir) {
  return path.join(runsDirOf(projectDir), '.active');
}

// Record the run init or resume just opened. No-op when that run is absent.
function recordActiveRun(projectDir, runId) {
  if (!isRunId(runId)) return false;
  const runFile = path.join(runsDirOf(projectDir), runId, 'run.json');
  if (!fs.existsSync(runFile)) return false;
  const dest = activePath(projectDir);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${runId}\n`, 'utf8');
  fs.renameSync(tmp, dest);
  return true;
}

function readActiveRunId(projectDir) {
  let id;
  try { id = fs.readFileSync(activePath(projectDir), 'utf8').trim(); } catch { return null; }
  if (!isRunId(id)) return null;
  if (!fs.existsSync(path.join(runsDirOf(projectDir), id, 'run.json'))) return null;
  return id;
}

// The run the STATE.md block and the plan reminder agree on.
function selectRun(projectDir) {
  const id = readActiveRunId(projectDir);
  if (id) {
    try {
      return JSON.parse(fs.readFileSync(path.join(runsDirOf(projectDir), id, 'run.json'), 'utf8'));
    } catch { /* fall back */ }
  }
  return newestRun(projectDir);
}

function oneLine(text) {
  return String(text == null ? '' : text).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 160);
}

function summary(projectDir, cli) {
  const run = selectRun(projectDir);
  if (!run) return [];
  // Live, read-only proof check: stale proof shows on the next prompt.
  const { RunStateEngine } = require('./run-state.cjs');
  const { taskProofs, acceptanceStatus } = require('./run-notes.cjs');
  const engine = new RunStateEngine(projectDir);
  const rows = taskProofs(engine, run);
  const done = new Set(rows.filter(r => r.finished).map(r => r.task.id));
  const failing = rows.filter(r => r.failing).map(r => r.task.id);
  const stale = rows.filter(r => r.stale).map(r => r.task.id);
  const held = rows.filter(r => r.lease).map(r => `${oneLine(r.task.id)} by ${oneLine(r.lease.agentId)}`);
  const next = rows.map(r => r.task).find(t => !done.has(t.id) && (t.prerequisites || []).every(p => done.has(p)));
  const id = oneLine(run.id);
  const lines = [
    `Active run: ${id} - ${oneLine(run.goal)}`,
    `Run tasks: ${done.size}/${rows.length} finished` +
      (failing.length ? `; failing: ${failing.map(oneLine).join(', ')}` : '') +
      (stale.length ? `; stale proof: ${stale.map(oneLine).join(', ')} (run resume)` : '') +
      `; next ready: ${next ? `${oneLine(next.id)} (${oneLine(next.title)})` : 'none'}` +
      (held.length ? `; held: ${held.join(', ')}` : ''),
    `Human acceptance: ${oneLine(acceptanceStatus(engine, run))}`,
  ];
  if (cli) {
    lines.push(`Record proof: ${cli} run-state wrap --id ${id} --task <task> --auto-complete -- <check command>`);
  }
  return lines;
}

if (require.main === module) {
  const lines = summary(path.resolve(process.argv[2] || '.'), process.argv[3] || '');
  if (lines.length) process.stdout.write(lines.join('\n') + '\n');
}

module.exports = { summary, latestRun, selectRun, recordActiveRun };
