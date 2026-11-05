'use strict';
// Claude Code PostToolUse hook on Edit/Write/MultiEdit: when the agent edits a
// UI file in a project with a run-state run, flag the newest run's current task
// with require-visual, so `run-state done` needs visual proof or acceptance.
// Reads the hook JSON on stdin. Never fails: any error means no output.
const fs = require('node:fs');
const path = require('node:path');
const { RunStateEngine } = require('./run-state.cjs');

const UI_FILE = /\.(tsx|jsx|vue|svelte|css|scss|sass|less|html)$/i;
const SKIP_DIR = /(^|[\\/])(\.moskills|node_modules|\.git)([\\/]|$)/;

// Nearest directory at or above `dir` that holds runs.
function projectWithRuns(dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.moskills', 'runs'))) return d;
    if (path.dirname(d) === d) return null;
  }
}

// The run touched last is the one being worked on.
function newestRun(engine) {
  let best = null;
  for (const id of fs.readdirSync(engine.runsDir)) {
    let run;
    try { run = engine.getRun(id); } catch { continue; }
    if (!best || String(run.updatedAt) > String(best.updatedAt)) best = run;
  }
  return best;
}

function main(raw) {
  if (process.env.MOSKILLS_NO_VISUAL_GATE === '1') return '';
  const input = JSON.parse(raw);
  const file = input && input.tool_input && input.tool_input.file_path;
  if (typeof file !== 'string' || !UI_FILE.test(file)) return '';
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const abs = path.resolve(cwd, file);
  if (!fs.existsSync(abs)) return '';
  const real = fs.realpathSync(abs);
  const project = projectWithRuns(path.dirname(real));
  if (!project) return '';
  const rel = path.relative(project, real);
  if (SKIP_DIR.test(rel)) return '';
  const engine = new RunStateEngine(project);
  const run = newestRun(engine);
  if (!run || !(run.tasks || []).length) return '';
  const r = engine.requireVisual({ runId: run.id, files: [rel] });
  if (!r.added.length) return '';
  const note = `moskills: ${rel} is a UI file, so task ${r.taskId} in run ${run.id} now needs visual proof ` +
    `before the run is done. Look at the change (screenshot or the running app), then record it: ` +
    `run-state ingest-evidence --id ${run.id} --check visual-${r.taskId} --source screenshot --files ${r.files.join(',')}. ` +
    `Or the user looks and runs accept.`;
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: note } });
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { raw += d; });
  process.stdin.on('end', () => {
    let out = '';
    try { out = main(raw); } catch { out = ''; }
    if (out) process.stdout.write(out + '\n');
  });
}

module.exports = { UI_FILE };
