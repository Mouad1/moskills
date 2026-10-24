'use strict';
// Read-only summary of the most recently updated run, for the agent's context.
// Usage: node run-summary.cjs <projectDir> <cliCommand>
// Prints nothing when the project has no run. Never writes or locks anything.
const fs = require('node:fs');
const path = require('node:path');

function latestRun(projectDir) {
  const runsDir = path.join(projectDir, '.moskills', 'runs');
  let best = null;
  let entries = [];
  try { entries = fs.readdirSync(runsDir); } catch { return null; }
  for (const id of entries) {
    try {
      const run = JSON.parse(fs.readFileSync(path.join(runsDir, id, 'run.json'), 'utf8'));
      const at = Date.parse(run.updatedAt || run.createdAt || 0) || 0;
      if (!best || at > best.at) best = { run, at };
    } catch { /* skip unreadable runs */ }
  }
  return best && best.run;
}

function oneLine(text) {
  return String(text == null ? '' : text).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 160);
}

function summary(projectDir, cli) {
  const run = latestRun(projectDir);
  if (!run) return [];
  const tasks = Array.isArray(run.tasks) ? run.tasks : [];
  const done = new Set(tasks.filter(t => t.status === 'finished').map(t => t.id));
  const stale = tasks.filter(t => t.stale).map(t => t.id);
  const next = tasks.find(t => !done.has(t.id) && (t.prerequisites || []).every(p => done.has(p)));
  const id = oneLine(run.id);
  const lines = [
    `Active run: ${id} - ${oneLine(run.goal)}`,
    `Run tasks: ${done.size}/${tasks.length} finished` +
      (stale.length ? `; stale proof: ${stale.map(oneLine).join(', ')}` : '') +
      `; next ready: ${next ? `${oneLine(next.id)} (${oneLine(next.title)})` : 'none'}`,
    `Human acceptance: ${oneLine((run.humanAcceptance && run.humanAcceptance.status) || 'pending')}`,
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

module.exports = { summary, latestRun };
