'use strict';
// Derived views of a run: per-task proof (live, read-only) and the generated
// "Run proof" block in .claude/STATE.md. The run record stays the source of truth.
const fs = require('node:fs');
const path = require('node:path');
const { RunStateEngine } = require('./run-state.cjs');

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
    const stale = task.stale || (task.status === 'finished' && checks.some(c => c.state !== 'passed'));
    const lease = task.lease && Date.parse(task.lease.expiresAt) > now ? task.lease : null;
    return { task, checks, stale, finished: task.status === 'finished' && !stale, lease };
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

function renderBlock(engine, run) {
  const rows = taskProofs(engine, run);
  const done = rows.filter(r => r.finished).length;
  const acceptance = acceptanceStatus(engine, run);
  const lines = [
    BEGIN,
    `### Run proof: ${oneLine(run.id)} - ${oneLine(run.goal)}`,
    '',
    `${done}/${rows.length} tasks finished with current proof. Human acceptance: ${acceptance}.`,
    '',
    '| Task | Status | Proof |',
    '| --- | --- | --- |',
  ];
  for (const r of rows) {
    const status = r.finished ? 'finished' : r.stale ? 'still not done (proof stale)' : 'still not done';
    const proof = r.checks.length
      ? r.checks.map(c => `${oneLine(c.id, 60)}: ${c.state}${c.exitCode !== undefined ? ` (exit ${c.exitCode})` : ''}${c.at ? `, ${String(c.at).slice(0, 16).replace('T', ' ')}` : ''}`).join('; ')
      : 'none yet';
    lines.push(`| ${oneLine(r.task.id, 40)} ${oneLine(r.task.title, 80)} | ${status} | ${proof} |`);
  }
  lines.push(END);
  return lines.join('\n');
}

// Rewrite the block in .claude/STATE.md. Does nothing when the file is absent.
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

module.exports = { taskProofs, acceptanceStatus, renderBlock, writeNotes, BEGIN, END };
