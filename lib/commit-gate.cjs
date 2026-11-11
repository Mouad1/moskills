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
const { RunStateEngine, normalizeRepoPath } = require('./run-state.cjs');

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

// Script passed to `bash -c` / `sh -c` (including `bash -lc`), or null.
function shellScript(words) {
  let i = 0;
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
  const bin = words[i];
  if (!bin) return null;
  const base = String(bin).split(/[/\\]/).pop();
  if (base !== 'bash' && base !== 'sh' && base !== 'dash') return null;
  for (let j = i + 1; j < words.length; j++) {
    const w = words[j];
    if (w === '-c' || /^-[a-zA-Z]*c[a-zA-Z]*$/.test(w)) return words[j + 1] || null;
    if (w.startsWith('-')) continue;
    return null;
  }
  return null;
}

function commandWords(line, depth = 0) {
  const out = [];
  if (!line || depth > 4) return out;
  for (const words of segments(line)) {
    out.push(words);
    const script = shellScript(words);
    if (script) out.push(...commandWords(script, depth + 1));
  }
  return out;
}

function parseGit(words, cwd) {
  let i = 0;
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
  if (words[i] !== 'git') return null;
  let dir = cwd;
  for (i++; i < words.length; i++) {
    const w = words[i];
    if (w === '-C' && i + 1 < words.length) dir = path.resolve(dir, words[++i]);
    else if (w === '-c' && i + 1 < words.length) i++;
    else if (w.startsWith('-')) continue;
    else break;
  }
  if (!words[i]) return null;
  return { dir, sub: words[i], args: words.slice(i + 1) };
}

// Directory a `git commit` in this command runs in, or null when there is none.
// `bash -c 'git commit …'` counts; the script is the commit, not the shell.
function commitDir(command, cwd) {
  for (const words of commandWords(command)) {
    const g = parseGit(words, cwd);
    if (g && g.sub === 'commit') return g.dir;
  }
  return null;
}

// `git commit -a`, `-am`, or `--all` stages tracked modifications before the hook runs.
function commitWantsTracked(args) {
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    if (w === '--') break;
    if (w === '--all' || w === '-a') return true;
    if (w.startsWith('--')) continue;
    if (w.startsWith('-') && w.slice(1).includes('a')) return true;
  }
  return false;
}

function classifyAdd(args) {
  let all = false;
  let update = false;
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    if (w === '--') {
      paths.push(...args.slice(i + 1));
      break;
    }
    if (w === '-A' || w === '--all') { all = true; continue; }
    if (w === '-u' || w === '--update') { update = true; continue; }
    if (w === '.' || w === './') { all = true; continue; }
    if (w.startsWith('-')) {
      if (w.includes('A')) all = true;
      else if (w.includes('u')) update = true;
      continue;
    }
    paths.push(w);
  }
  return { all, update, paths };
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

function listedFiles(top, project, args) {
  const list = git(top, args);
  const files = [];
  for (const f of (list || '').split('\n')) {
    if (!f) continue;
    const rel = path.relative(project, path.join(top, f));
    if (!rel || rel.startsWith('..') || rel === '.moskills' || rel.startsWith('.moskills' + path.sep)) continue;
    files.push(rel);
  }
  return files;
}

// Staged paths only. A git hook runs after the index is updated.
function stagedFiles(top, project) {
  return listedFiles(top, project, ['diff', '--name-only', '--cached']);
}

// Tracked modifications `git commit -a` would stage. Untracked files stay out.
function trackedDirty(top, project) {
  return listedFiles(top, project, ['diff', '--name-only']);
}

// Everything `git add -A` would stage, relative to `project`.
function changedFiles(top, project) {
  const files = new Set(stagedFiles(top, project));
  for (const f of trackedDirty(top, project)) files.add(f);
  for (const f of listedFiles(top, project, ['ls-files', '--others', '--exclude-standard'])) files.add(f);
  return [...files];
}

// macOS runners keep the checkout behind a symlink (/var -> /private/var).
// Compare the real paths, and keep a not-yet-created file's real parent.
function canonical(p) {
  const abs = path.resolve(p);
  try { return fs.realpathSync(abs); } catch { /* the leaf may not exist yet */ }
  try { return path.join(fs.realpathSync(path.dirname(abs)), path.basename(abs)); } catch { return abs; }
}

function projectRel(top, project, abs) {
  const topReal = canonical(top);
  const fromTop = path.relative(topReal, canonical(abs));
  if (!fromTop || fromTop.startsWith('..') || path.isAbsolute(fromTop)) return null;
  const rel = path.relative(canonical(project), path.join(topReal, fromTop));
  if (!rel || rel.startsWith('..') || rel === '.moskills' || rel.startsWith('.moskills' + path.sep)) return null;
  return rel;
}

// Files this command would commit: the index, plus paths `git add` names,
// plus tracked edits when the commit uses -a/--all. Unrelated unstaged edits
// are not included.
function filesForCommand(command, cwd, top, project) {
  const files = new Set(stagedFiles(top, project));
  let tracked = false;
  let everything = false;
  const extra = [];
  for (const words of commandWords(command)) {
    const g = parseGit(words, cwd);
    if (!g) continue;
    const gtop = (git(g.dir, ['rev-parse', '--show-toplevel']) || '').trim();
    if (!gtop || canonical(gtop) !== canonical(top)) continue;
    if (g.sub === 'commit' && commitWantsTracked(g.args)) tracked = true;
    if (g.sub === 'add') {
      const spec = classifyAdd(g.args);
      if (spec.paths.length) {
        for (const p of spec.paths) {
          const rel = projectRel(top, project, path.resolve(g.dir, p));
          if (rel) extra.push(rel);
        }
      } else if (spec.all) everything = true;
      else if (spec.update) tracked = true;
    }
  }
  if (everything) {
    for (const f of changedFiles(top, project)) files.add(f);
  } else if (tracked) {
    for (const f of trackedDirty(top, project)) files.add(f);
  }
  for (const f of extra) files.add(f);
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

function scopeOf(run, task) {
  if (task.scope && task.scope.length) return task.scope;
  return run.scope || [];
}

function problems(project, changed) {
  const engine = new RunStateEngine(project);
  const found = [];
  const changedNorm = new Set(
    (changed || []).map(f => normalizeRepoPath(project, f)).filter(f => f && !f.startsWith('..'))
  );
  let runIds = [];
  try { runIds = fs.readdirSync(engine.runsDir); } catch { return found; }
  for (const runId of runIds) {
    let run;
    try { run = engine.getRun(runId); } catch { continue; }
    const impacted = engine.getImpactedTasks(runId, changed).impactedTaskIds;
    for (const task of run.tasks || []) {
      if (!impacted.includes(task.id)) continue;
      const ids = task.requiredCheckIds || [];
      if (!ids.length) {
        const names = scopeOf(run, task)
          .map(f => normalizeRepoPath(project, f))
          .filter(f => changedNorm.has(f));
        const listed = names.join(', ') || 'its files';
        found.push(`task ${task.id} in run ${runId}: ${listed}: missing, no proof recorded. Re-run: moskills run-state wrap --id ${runId} --task ${task.id} --auto-complete -- <check command>`);
        continue;
      }
      for (const checkId of ids) {
        const v = engine.verifyEvidence({ runId, checkId });
        if (v.valid) continue;
        const listed = filesFor(v).join(', ') || 'its files';
        const why = v.missing ? `${listed}: missing, no proof recorded`
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

function reasonText(found) {
  return 'moskills commit gate: proof is not current for the files in this commit.\n- ' +
    found.join('\n- ') +
    '\nThe git pre-commit hook enforces the same rule, so a terminal git commit will not bypass it.\n' +
    'Re-run those checks, then commit again.';
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
  return reasonText(found);
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
  const found = problems(project, filesForCommand(command, cwd, fs.realpathSync(top), project));
  if (!found.length) return '';
  const reason = reasonText(found);
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
