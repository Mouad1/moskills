'use strict';
// Core panel: the moskills runs recorded in <target>/.moskills/runs/, newest first.
const fs = require('node:fs');
const path = require('node:path');

const MAX_RUNS = 8;

function readRuns(targetDir) {
  const runsDir = path.join(targetDir, '.moskills', 'runs');
  let ids = [];
  try {
    ids = fs.readdirSync(runsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  const runs = [];
  for (const id of ids) {
    try {
      runs.push({ id, ...JSON.parse(fs.readFileSync(path.join(runsDir, id, 'run.json'), 'utf8')) });
    } catch {
      // unreadable run: skip it, the detailed view reports it
    }
  }
  return runs.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

async function render(ctx) {
  const e = ctx.escape;
  const runs = readRuns(ctx.targetDir);
  if (runs.length === 0) {
    return { html: '<p class="muted">No runs yet. Runs appear here when work is tracked with <code>moskills run-state init</code>.</p>' };
  }
  const rows = runs.slice(0, MAX_RUNS).map((r) => {
    const tasks = Array.isArray(r.tasks) ? r.tasks : [];
    const done = tasks.filter((t) => t.status === 'finished').length;
    const state = tasks.length > 0 && done === tasks.length ? 'ok' : done > 0 ? 'warn' : '';
    const when = r.updatedAt
      ? new Date(r.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    return `<tr>
      <td><span class="pill ${state}"><span class="dot"></span>${done} / ${tasks.length}</span></td>
      <td>${e(r.goal || r.id)}<div class="muted mono">moskills run-state dashboard --run ${e(r.id)}</div></td>
      <td class="muted" style="white-space: nowrap">${e(when)}</td>
    </tr>`;
  });
  const more = runs.length > MAX_RUNS ? `<p class="muted">${runs.length - MAX_RUNS} older run(s) not shown.</p>` : '';
  return { html: `<table><thead><tr><th>Done</th><th>Goal</th><th>Updated</th></tr></thead><tbody>${rows.join('')}</tbody></table>${more}` };
}

module.exports = { render };
