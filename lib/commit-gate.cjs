'use strict';
// Proof gate for `git commit`. Read-only: it never changes the run.
// Two callers share problems():
// - Claude Code PreToolUse (hook JSON on stdin): one deny JSON object on
//   stdout and exit 2. Unreadable input exits 2 as well. Exit 1 would let
//   the tool call through unless the hook sets onFailure "block".
// - Git pre-commit (--git-hook): the same problems on staged paths, the
//   reason on stderr, exit 1. Git only honors a non-zero status.
// MOSKILLS_NO_COMMIT_GATE=1 is the only skip.
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

// Files a person can find in the reason. Stale proof names what changed.
// A failed or missing check names the files the check covered.
function filesFor(v) {
  if (v && v.changedFiles && v.changedFiles.length) return v.changedFiles;
  const ev = v && v.evidence;
  if (!ev) return [];
  const hashed = Object.keys(ev.fileHashes || {});
  if (hashed.length) return hashed;
  return ev.relevantFiles || [];
}

function problems(project, changed) {
  const engine = new RunStateEngine(project);
  const found = [];
  let runIds = [];
  try { runIds = fs.readdirSync(engine.runsDir); } catch { return found; }
  for (const runId of runIds) {
    let run;
    try { run = engine.getRun(runId); } catch { continue; }
    const impacted = engine.getImpactedTasks(runId, changed).impactedTaskIds;
    for (const task of run.tasks || []) {
      if (!impacted.includes(task.id)) continue;
      for (const checkId of task.requiredCheckIds || []) {
        const v = engine.verifyEvidence({ runId, checkId });
        if (v.valid) continue;
        const listed = filesFor(v).join(', ') || 'its files';
        const why = v.missing ? `${listed}: no proof recorded`
          : v.failed ? `${listed}: its check failed`
          : `${listed} changed since its check passed`;
        const cmd = v.evidence && v.evidence.command ? v.evidence.command : '<check command>';
        found.push(`task ${task.id} in run ${runId}: ${why}. Re-run: moskills run-state wrap --id ${runId} --task ${task.id} --auto-complete -- ${cmd}`);
        break;
      }
    }
  }
  return found;
}

// Staged paths only: a git hook runs after the index is updated, and a
// commit should be judged by what it contains.
function stagedFiles(top, project) {
  const list = git(top, ['diff', '--name-only', '--cached']);
  const files = [];
  for (const f of (list || '').split('\n')) {
    if (!f) continue;
    const rel = path.relative(project, path.join(top, f));
    if (!rel || rel.startsWith('..') || rel === '.moskills' || rel.startsWith('.moskills' + path.sep)) continue;
    files.push(rel);
  }
  return files;
}

function gitHookReport(cwd) {
  if (process.env.MOSKILLS_NO_COMMIT_GATE === '1') return '';
  const top = (git(cwd, ['rev-parse', '--show-toplevel']) || '').trim();
  if (!top) return '';
  let project = null;
  try { project = projectWithRuns(fs.realpathSync(cwd), fs.realpathSync(top)); } catch { return ''; }
  if (!project) return '';
  const found = problems(project, stagedFiles(fs.realpathSync(top), project));
  if (!found.length) return '';
  return 'moskills commit gate: proof is not current for the files in this commit.\n- ' +
    found.join('\n- ') + '\nRe-run those checks, then commit again.';
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

function writeAndExit(code, stdout, stderr) {
  if (stdout) process.stdout.write(stdout.endsWith('\n') ? stdout : stdout + '\n');
  if (stderr) process.stderr.write(stderr.endsWith('\n') ? stderr : stderr + '\n');
  process.exit(code);
}

function denyBody(reason) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  });
}

const HELP = `moskills commit-gate
  Claude Code PreToolUse hook. Reads hook JSON on stdin.
  Denies git commit while a run task covering the changed files has
  missing, failed, or stale proof. Prints deny JSON and exits 2.
  Exit 2 when the input is not JSON.
  Git pre-commit runs: node lib/commit-gate.cjs --git-hook
  Off with MOSKILLS_NO_COMMIT_GATE=1.
`;

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h') || argv.includes('help')) {
    writeAndExit(0, HELP, '');
  } else if (argv.includes('--git-hook')) {
    try {
      const text = gitHookReport(process.cwd());
      writeAndExit(text ? 1 : 0, '', text);
    } catch (err) {
      writeAndExit(1, '', `moskills commit gate: ${err && err.message ? err.message : 'proof check failed'}`);
    }
  } else {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => { raw += d; });
    process.stdin.on('end', () => {
      try {
        const out = main(raw);
        if (!out) writeAndExit(0, '', '');
        let reason = '';
        try { reason = JSON.parse(out).hookSpecificOutput.permissionDecisionReason || ''; } catch { reason = ''; }
        // Exit 2 blocks PreToolUse even if a host ignores the JSON.
        // The JSON still carries permissionDecision deny for hosts that read it.
        writeAndExit(2, out, reason);
      } catch (err) {
        const reason = `moskills commit gate: could not read the hook input${err && err.message ? ` (${err.message})` : ''}`;
        writeAndExit(2, denyBody(reason), reason);
      }
    });
  }
}

module.exports = { commitDir, segments, problems };
