'use strict';
// Claude Code PreToolUse hook on Bash: deny `git commit` while a run-state task
// that covers changed files has missing, failed or stale proof.
// Reads the hook JSON on stdin. Read-only: it never changes the run.
// Never blocks on its own errors: anything unexpected allows the command.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { RunStateEngine } = require('./run-state.cjs');

// Split a command line into segments (&&, ||, ;, |, newline) of shell words.
// Good enough for spotting `git ... commit`; quotes are honoured, expansions are not.
function segments(line) {
  const out = [];
  let words = [];
  let word = null;
  const end = () => { if (word !== null) { words.push(word); word = null; } };
  const cut = () => { end(); if (words.length) out.push(words); words = []; };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" || c === '"') {
      const close = line.indexOf(c, i + 1);
      const stop = close === -1 ? line.length : close;
      word = (word || '') + line.slice(i + 1, stop);
      i = stop;
    } else if (c === '\\' && i + 1 < line.length) {
      word = (word || '') + line[++i];
    } else if (/\s/.test(c)) {
      if (c === '\n') cut(); else end();
    } else if (c === ';' || c === '|' || c === '&') {
      cut();
      if (line[i + 1] === c) i++;
    } else {
      word = (word || '') + c;
    }
  }
  cut();
  return out;
}

// Directory a `git commit` in this command runs in, or null when there is none.
function commitDir(command, cwd) {
  for (const words of segments(command)) {
    let i = 0;
    while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
    if (words[i] !== 'git') continue;
    let dir = cwd;
    for (i++; i < words.length; i++) {
      const w = words[i];
      if (w === '-C' && i + 1 < words.length) dir = path.resolve(dir, words[++i]);
      else if (w === '-c' && i + 1 < words.length) i++;
      else if (w.startsWith('-')) continue;
      else break;
    }
    if (words[i] === 'commit') return dir;
  }
  return null;
}

function git(dir, args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout : null;
}

// Nearest directory at or above `dir` (within the repository) that holds runs.
function projectWithRuns(dir, top) {
  let d = dir;
  for (;;) {
    if (fs.existsSync(path.join(d, '.moskills', 'runs'))) return d;
    if (d === top || path.dirname(d) === d) return null;
    d = path.dirname(d);
  }
}

// Tracked changes (staged or not) and untracked files, relative to `project`.
function changedFiles(top, project) {
  const lists = [
    git(top, ['diff', '--name-only', '--cached']),
    git(top, ['diff', '--name-only']),
    git(top, ['ls-files', '--others', '--exclude-standard'])
  ];
  const files = new Set();
  for (const list of lists) {
    for (const f of (list || '').split('\n')) {
      if (!f) continue;
      const rel = path.relative(project, path.join(top, f));
      if (!rel.startsWith('..') && !rel.startsWith('.moskills' + path.sep)) files.add(rel);
    }
  }
  return [...files];
}

function problems(project, changed) {
  const engine = new RunStateEngine(project);
  const found = [];
  for (const runId of fs.readdirSync(engine.runsDir)) {
    let run;
    try { run = engine.getRun(runId); } catch { continue; }
    const impacted = engine.getImpactedTasks(runId, changed).impactedTaskIds;
    for (const task of run.tasks || []) {
      if (!impacted.includes(task.id)) continue;
      for (const checkId of task.requiredCheckIds || []) {
        const v = engine.verifyEvidence({ runId, checkId });
        if (v.valid) continue;
        const why = v.missing ? 'no proof recorded'
          : v.failed ? 'its check failed'
          : `${v.changedFiles.join(', ')} changed since its check passed`;
        const cmd = v.evidence && v.evidence.command ? v.evidence.command : '<check command>';
        found.push(`task ${task.id} in run ${runId}: ${why}. Re-run: run-state wrap --id ${runId} --task ${task.id} --auto-complete -- ${cmd}`);
        break;
      }
    }
  }
  return found;
}

function main(raw) {
  if (process.env.MOSKILLS_NO_COMMIT_GATE === '1') return '';
  const input = JSON.parse(raw);
  const command = input && input.tool_input && input.tool_input.command;
  if (typeof command !== 'string') return '';
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const dir = commitDir(command, cwd);
  if (!dir) return '';
  const top = (git(dir, ['rev-parse', '--show-toplevel']) || '').trim();
  if (!top) return '';
  const project = projectWithRuns(fs.realpathSync(dir), fs.realpathSync(top));
  if (!project) return '';
  const found = problems(project, changedFiles(fs.realpathSync(top), project));
  if (!found.length) return '';
  const reason = 'moskills commit gate: proof is not current for the files in this commit.\n- ' +
    found.join('\n- ') + '\nRe-run those checks, then commit again.';
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason }
  });
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

module.exports = { commitDir, segments };
