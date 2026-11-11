'use strict';
// Derived views of a run: per-task proof (live, read-only) and the generated
// "Run proof" block in .claude/STATE.md. The run record stays the source of truth.
const fs = require('node:fs');
const path = require('node:path');
const { RunStateEngine } = require('./run-state.cjs');
const { readRules } = require('./rules-file.cjs');

const BEGIN = '<!-- moskills:run:begin (generated from the run by moskills run-state; edit the run, not this block) -->';
const END = '<!-- moskills:run:end -->';

function readEvidence(engine, runId) {
  const dir = path.join(engine.runsDir, runId, 'evidence');
  const byId = {};
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return byId; }
  for (const f of files) {
    if (!f.endsWith('.json') || f.startsWith('review-')) continue;
    try {
      const ev = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (ev && ev.checkId) byId[ev.checkId] = ev;
    } catch { /* skip unreadable evidence */ }
  }
  return byId;
}

// One status for a task's live checks. A failed check is `failing` even when
// an older stale flag is set. A task that was never finished keeps a plain
// failed check (`still not done`); only proof that had already passed is
// `failing`. Hash drift with a passing exit is `stale`, not failing.
function classifyTask(task, checks) {
  const checkFailed = checks.some(c => c.state === 'failed');
  const previouslyProven = task.status === 'finished' || task.status === 'failing' || task.stale === true;
  const failing = checkFailed && previouslyProven;
  const drifted = Boolean(task.stale)
    || checks.some(c => c.state === 'stale' || c.state === 'missing')
    || (task.status === 'finished' && checks.some(c => c.state !== 'passed'));
  return {
    failing,
    stale: !checkFailed && drifted,
    finished: task.status === 'finished' && !checkFailed && !drifted
  };
}

// One row per task. Staleness is computed now from file hashes, without
// changing the run, so the views show stale proof before anyone runs resume.
function taskProofs(engine, run) {
  const evidence = readEvidence(engine, run.id);
  const now = Date.now();
  return (run.tasks || []).map(task => {
    let ids = task.requiredCheckIds && task.requiredCheckIds.length ? task.requiredCheckIds : [];
    if (!ids.length) {
      ids = Object.values(evidence).filter(e => e.taskId === task.id)
        .sort((a, b) => String(a.executedAt).localeCompare(String(b.executedAt)))
        .slice(-1).map(e => e.checkId);
    }
    const checks = ids.map(id => {
      const v = engine.verifyEvidence({ runId: run.id, checkId: id });
      const state = v.missing ? 'missing' : v.failed ? 'failed' : v.stale ? 'stale' : 'passed';
      const ev = v.evidence || {};
      return { id, state, exitCode: ev.exitCode, at: ev.executedAt || ev.ingestedAt || null, changedFiles: v.changedFiles || [] };
    });
    const lease = task.lease && Date.parse(task.lease.expiresAt) > now ? task.lease : null;
    return { task, checks, lease, ...classifyTask(task, checks) };
  });
}

// Same rule as RunStateEngine.verifyHumanAcceptance, without writing the run.
function acceptanceStatus(engine, run) {
  const h = run.humanAcceptance || {};
  if (h.status !== 'accepted') return 'pending';
  const current = engine._hashFiles(Object.keys(h.scopedHashes || {}));
  const changed = Object.entries(h.scopedHashes || {}).some(([f, hash]) => current[f] !== hash);
  return changed ? 'pending (scope changed since acceptance)' : `accepted by ${oneLine(h.acceptedBy, 60)}`;
}

function oneLine(text, max = 160) {
  return String(text == null ? '' : text).replace(/[\u0000-\u001f\u007f|]+/g, ' ').trim().slice(0, max);
}

// A task flagged by require-visual passes when its visual-<taskId> proof is
// current and covers every flagged file, or when acceptance still holds and was
// recorded over those files. Null when the task changed no UI.
function visualStatus(engine, run, task, acceptance) {
  if (!task.visual || !task.visual.required) return null;
  const files = task.visual.files || [];
  const checkId = `visual-${task.id}`;
  const v = engine.verifyEvidence({ runId: run.id, checkId });
  const proven = v.valid && files.every(f => (v.evidence.relevantFiles || []).includes(f));
  const hashed = (run.humanAcceptance && run.humanAcceptance.scopedHashes) || {};
  const accepted = acceptance.startsWith('accepted') && files.every(f => f in hashed);
  return { ok: proven || accepted, files, checkId };
}

// Is this run (one module in /modular-build) finished? Every task must have
// current, passing proof and the user's acceptance must still hold. Read-only.
function moduleStatus(engine, run) {
  const rows = taskProofs(engine, run);
  const finished = rows.filter(r => r.finished).length;
  const acceptance = acceptanceStatus(engine, run);
  const reasons = [];
  if (!rows.length) reasons.push('no tasks: add tasks to the run before it can be done');
  for (const r of rows) {
    if (r.finished) continue;
    const label = `${oneLine(r.task.id, 40)} (${oneLine(r.task.title, 80)})`;
    if (r.stale) reasons.push(`${label}: proof is stale, rerun its check`);
    else if (r.checks.some(c => c.state === 'failed')) reasons.push(`${label}: last check failed`);
    else reasons.push(`${label}: no passing proof yet`);
  }
  if (!acceptance.startsWith('accepted')) reasons.push(`human acceptance: ${acceptance}`);
  for (const task of run.tasks || []) {
    const v = visualStatus(engine, run, task, acceptance);
    if (!v || v.ok) continue;
    const files = v.files.map(f => oneLine(f, 120));
    reasons.push(`${oneLine(task.id, 40)} (${oneLine(task.title, 80)}): UI changed (${files.join(', ')}); ` +
      `needs visual proof: look at it, then run-state ingest-evidence --check ${v.checkId} --source screenshot ` +
      `--files ${files.join(',')} (or the user runs accept after looking)`);
  }
  reasons.push(...ruleReasons(engine, run));
  return { runId: run.id, goal: run.goal, after: run.after || null, done: reasons.length === 0,
    finished, total: rows.length, acceptance, reasons };
}

// Rule IDs this run names: declared with init --rules or linked to its tasks.
function runRuleIds(run) {
  const linked = (run.tasks || []).flatMap(t => t.rules || []);
  return Array.from(new Set([...(run.rules || []), ...linked]));
}

// Why the run's rules keep it from being done. Silent when the run names no
// rules. Proof itself is covered by the tasks: a linked task without current
// proof already blocks done.
function ruleReasons(engine, run) {
  const ids = runRuleIds(run);
  if (!ids.length) return [];
  const rules = readRules(engine.projectDir);
  if (!rules) return [`rules ${ids.map(i => oneLine(i, 20)).join(', ')}: docs/rules.md not found`];
  const byId = Object.fromEntries(rules.map(r => [r.id, r]));
  const linked = new Set((run.tasks || []).flatMap(t => t.rules || []));
  const reasons = [];
  for (const id of ids) {
    const label = oneLine(id, 20);
    const rule = byId[id];
    if (!rule) { reasons.push(`${label}: not in docs/rules.md`); continue; }
    if (rule.state === 'retired') reasons.push(`${label}: retired but still linked to this run; unlink or restore it`);
    if (rule.state === 'draft') reasons.push(`${label}: still draft; the user must accept it in docs/rules.md`);
    if (!linked.has(id)) reasons.push(`${label}: declared for this run but no task proves it; run-state link --task <id> --rules ${label}`);
  }
  return reasons;
}

// Proof status of every rule in docs/rules.md across all runs. Null without the file.
// proven: every linked task finished with current proof; failing: the latest
// check failed (even if an older stale flag is set); stale: a linked task's
// proof drifted; unproven: no linked task, or not yet run.
function ruleMatrix(engine) {
  const rules = readRules(engine.projectDir);
  if (!rules) return null;
  const linked = {};
  let ids = [];
  try { ids = fs.readdirSync(engine.runsDir); } catch { /* no runs yet */ }
  for (const id of ids) {
    let run;
    try { run = engine.getRun(id); } catch { continue; }
    for (const row of taskProofs(engine, run)) {
      for (const ruleId of row.task.rules || []) (linked[ruleId] = linked[ruleId] || []).push({ run: run.id, row });
    }
  }
  return rules.map(rule => {
    const links = linked[rule.id] || [];
    const rows = links.map(l => l.row);
    let status = 'unproven';
    if (rule.state === 'retired' || rule.state === 'draft') status = rule.state;
    else if (rows.length && rows.every(r => r.finished)) status = 'proven';
    else if (rows.some(r => r.failing) || rows.some(r => r.checks.some(c => c.state === 'failed'))) status = 'failing';
    else if (rows.some(r => r.stale)) status = 'stale';
    return { id: rule.id, state: rule.state, status, rule: rule.rule, proof: rule.proof,
      tasks: links.map(l => `${l.run}/${l.row.task.id}`) };
  });
}

// Markdown for the generated block in docs/rules.md (no timestamps: rewriting is idempotent).
function renderRulesBlock(matrix) {
  const proven = matrix.filter(r => r.status === 'proven').length;
  const active = matrix.filter(r => r.state === 'accepted').length;
  const lines = [`${proven}/${active} accepted rules proven.`, '', '| ID | State | Proof status | Tasks |', '| --- | --- | --- | --- |'];
  for (const r of matrix) {
    lines.push(`| ${oneLine(r.id, 20)} | ${r.state} | ${r.status} | ${r.tasks.map(t => oneLine(t, 60)).join(', ') || 'none linked'} |`);
  }
  return lines.join('\n');
}

// Every run in the project, oldest first (module order), with its status.
function listRuns(engine) {
  let ids = [];
  try { ids = fs.readdirSync(engine.runsDir); } catch { return []; }
  const out = [];
  for (const id of ids) {
    let run;
    try { run = JSON.parse(fs.readFileSync(path.join(engine.runsDir, id, 'run.json'), 'utf8')); } catch { continue; }
    out.push({ ...moduleStatus(engine, run), createdAt: run.createdAt || '' });
  }
  return out.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.runId.localeCompare(b.runId));
}

// " Rules: 2/3 proven." for the Run proof block, or nothing when the run names no rules.
function rulesLine(engine, run) {
  const ids = runRuleIds(run);
  const matrix = ids.length ? ruleMatrix(engine) : null;
  if (!matrix) return '';
  const proven = matrix.filter(r => ids.includes(r.id) && r.status === 'proven').length;
  return ` Rules: ${proven}/${ids.length} proven.`;
}

function proofLead(rows) {
  const done = rows.filter(r => r.finished).length;
  const names = pick => pick.map(r => oneLine(r.task.id, 40)).join(', ');
  if (rows.some(r => r.failing)) return `${done}/${rows.length} tasks; failing: ${names(rows.filter(r => r.failing))}`;
  if (rows.some(r => r.stale)) return `${done}/${rows.length} tasks; stale proof: ${names(rows.filter(r => r.stale))}`;
  return `${done}/${rows.length} tasks finished with current proof`;
}

function renderBlock(engine, run) {
  const rows = taskProofs(engine, run);
  const acceptance = acceptanceStatus(engine, run);
  const lines = [
    BEGIN,
    `### Run proof: ${oneLine(run.id)} - ${oneLine(run.goal)}`,
    '',
    `${proofLead(rows)}. Human acceptance: ${acceptance}.${rulesLine(engine, run)}`,
    '',
    '| Task | Status | Proof |',
    '| --- | --- | --- |',
  ];
  for (const r of rows) {
    const status = r.failing ? 'failing' : r.finished ? 'finished' : r.stale ? 'still not done (proof stale)' : 'still not done';
    // No clock: evidence JSON keeps executedAt. A refresh of the same proof
    // is byte-identical, so the context hook does not dirty STATE.md.
    const proof = r.checks.length
      ? r.checks.map(c => {
        const state = r.failing && c.state === 'failed' ? 'failing' : c.state;
        return `${oneLine(c.id, 60)}: ${state}${c.exitCode !== undefined ? ` (exit ${c.exitCode})` : ''}`;
      }).join('; ')
      : 'none yet';
    lines.push(`| ${oneLine(r.task.id, 40)} ${oneLine(r.task.title, 80)} | ${status} | ${proof} |`);
  }
  lines.push(END);
  return lines.join('\n');
}

// Rewrite the block in .claude/STATE.md. Does nothing when the file is absent,
// and does not write when the text is already current (no timestamp churn).
function writeNotes(projectDir, runId) {
  const stateFile = path.join(projectDir, '.claude', 'STATE.md');
  if (!fs.existsSync(stateFile)) return false;
  const engine = new RunStateEngine(projectDir);
  let run;
  try { run = engine.getRun(runId); } catch { return false; }
  const block = renderBlock(engine, run);
  const text = fs.readFileSync(stateFile, 'utf8');
  const start = text.indexOf('<!-- moskills:run:begin');
  const end = text.indexOf(END);
  let next;
  if (start !== -1 && end > start) {
    next = text.slice(0, start) + block + text.slice(end + END.length);
  } else {
    const at = text.search(/^## Finished\s*$/m);
    next = at === -1 ? `${text.replace(/\s*$/, '')}\n\n${block}\n` : `${text.slice(0, at)}${block}\n\n${text.slice(at)}`;
  }
  if (next !== text) {
    const tmp = `${stateFile}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, next, 'utf8');
    fs.renameSync(tmp, stateFile);
  }
  return true;
}

// Refresh the block for the run context prints. Does not write run.json.
function writeLatestNotes(projectDir) {
  const { latestRun } = require('./run-summary.cjs');
  const run = latestRun(projectDir);
  if (!run) return false;
  return writeNotes(projectDir, run.id);
}

module.exports = { taskProofs, acceptanceStatus, moduleStatus, ruleMatrix, renderRulesBlock, listRuns, renderBlock, writeNotes, writeLatestNotes, oneLine, BEGIN, END };
