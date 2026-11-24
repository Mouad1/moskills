#!/usr/bin/env node
'use strict';
// Replays evals/triggers/*/case.yaml with plain `claude -p` under a chosen HOME,
// so the session sees exactly the plugins installed there (moskills alone, or
// moskills next to superpowers). `claude plugin eval` loads only the plugin under
// test, so it cannot measure collisions with other installed plugins.
//
// Usage: node evals/env-triggers.cjs --home DIR [--runs 3] [--tag T] [--case GLOB]
//                                    [--max-cost-usd 10] [--out FILE.json]
// No dependencies. Needs `claude` on PATH and a credential in the environment.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function args(argv) {
  const o = { runs: 3, tags: [], maxCost: Infinity, cases: path.join(__dirname, 'triggers') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--home') { o.home = v; i++; }
    else if (a === '--runs') { o.runs = Number(v); i++; }
    else if (a === '--tag') { o.tags.push(v); i++; }
    else if (a === '--case') { o.glob = v; i++; }
    else if (a === '--max-cost-usd') { o.maxCost = Number(v); i++; }
    else if (a === '--out') { o.out = v; i++; }
    else if (a === '--cases-dir') { o.cases = v; i++; }
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!o.home) throw new Error('--home DIR is required');
  return o;
}

// Reads the small subset of YAML the trigger cases use.
function readCase(file) {
  const text = fs.readFileSync(file, 'utf8');
  const scalar = (key, from = text) => {
    const m = from.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'));
    if (!m) return undefined;
    let v = m[1].trim();
    if (v.startsWith('"')) return JSON.parse(v);
    if (v.startsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
    return v;
  };
  const tags = (text.match(/^tags:\s*\[(.*)\]$/m) || [, ''])[1].split(',').map((t) => t.trim()).filter(Boolean);
  const graderText = text.split(/^graders:\s*$/m)[1] || '';
  const min = scalar('min', graderText), max = scalar('max', graderText);
  return {
    name: scalar('name'),
    tags,
    prompt: scalar('prompt'),
    maxTurns: Number(scalar('max_turns') || 6),
    tools: (text.match(/allowed_tools:\s*\[(.*)\]/) || [, 'Read, Glob, Grep, Skill'])[1].split(',').map((t) => t.trim()),
    match: scalar('input_match', graderText),
    min: min === undefined ? 1 : Number(min),
    max: max === undefined ? Infinity : Number(max)
  };
}

function runOnce(c, home) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'env-trigger-'));
  const res = spawnSync('claude', [
    '-p', '--output-format', 'stream-json', '--verbose',
    '--max-turns', String(c.maxTurns), '--allowed-tools', c.tools.join(',')
  ], { cwd, input: c.prompt, encoding: 'utf8', timeout: 300000, env: { ...process.env, HOME: home } });
  fs.rmSync(cwd, { recursive: true, force: true });
  const out = { skills: [], cost: 0, plugins: null, error: null };
  for (const line of (res.stdout || '').split('\n')) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.type === 'system' && e.subtype === 'init') out.plugins = (e.plugins || []).map((p) => p.name);
    if (e.type === 'assistant') {
      for (const b of e.message?.content || []) {
        if (b.type === 'tool_use' && b.name === 'Skill') out.skills.push(String(b.input?.skill || ''));
      }
    }
    if (e.type === 'result') {
      out.cost = e.total_cost_usd || 0;
      // Running out of turns is a normal end (the case is graded on the skills called so far).
      if (e.terminal_reason === 'api_error') out.error = `api error: ${String(e.result || e.terminal_reason).slice(0, 200)}`;
      if (e.terminal_reason === 'max_turns') out.maxTurns = true;
    }
  }
  if (!out.error && (res.error || (res.status !== 0 && !out.plugins))) out.error = String(res.error || res.stderr).slice(0, 300);
  return out;
}

function grade(c, skills) {
  // Only moskills skills count: another plugin's skill of the same name firing
  // (superpowers:writing-skills) is recorded in the report but never passes a case.
  const ours = skills.filter((s) => s.startsWith('moskills:'));
  const re = c.match ? new RegExp(c.match) : null;
  const n = re ? ours.filter((s) => re.test(JSON.stringify({ skill: s }))).length : ours.length;
  return n >= c.min && n <= c.max;
}

function main() {
  const o = args(process.argv.slice(2));
  const glob = o.glob && new RegExp(`^${o.glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  const cases = fs.readdirSync(o.cases).sort()
    .map((d) => path.join(o.cases, d, 'case.yaml')).filter((f) => fs.existsSync(f)).map(readCase)
    .filter((c) => o.tags.every((t) => c.tags.includes(t)) && (!glob || glob.test(c.name)));
  const report = { home: o.home, startedAt: new Date().toISOString(), plugins: null, cost: 0, partial: false, cases: [] };
  for (const c of cases) {
    const row = { name: c.name, prompt: c.prompt, passed: 0, runs: [] };
    for (let i = 0; i < o.runs; i++) {
      if (report.cost >= o.maxCost) { report.partial = true; break; }
      const r = runOnce(c, o.home);
      report.plugins = report.plugins || r.plugins;
      report.cost += r.cost;
      const ok = !r.error && grade(c, r.skills);
      row.passed += ok ? 1 : 0;
      row.runs.push({ passed: ok, skills: r.skills, cost: r.cost, error: r.error, maxTurns: !!r.maxTurns });
      process.stderr.write(`${c.name} ${i + 1}/${o.runs}: ${ok ? 'pass' : 'FAIL'} [${r.skills.join(', ') || 'no skill'}]${r.maxTurns ? ' (max turns)' : ''}${r.error ? ' ERROR ' + r.error : ''}\n`);
    }
    report.cases.push(row);
    if (report.partial) break;
  }
  const lines = [`plugins: ${(report.plugins || []).join(', ')}`, '', '| Case | Passed | Skills fired |', '|---|---|---|'];
  for (const r of report.cases) {
    const fired = {};
    for (const run of r.runs) for (const s of run.skills.length ? run.skills : ['(none)']) fired[s] = (fired[s] || 0) + 1;
    lines.push(`| ${r.name} | ${r.passed} / ${r.runs.length} | ${Object.entries(fired).map(([s, n]) => `${s} ×${n}`).join(', ')} |`);
  }
  const total = report.cases.reduce((a, r) => a + r.passed, 0), runs = report.cases.reduce((a, r) => a + r.runs.length, 0);
  lines.push('', `${total} / ${runs} runs passed, $${report.cost.toFixed(2)}${report.partial ? ' (stopped at --max-cost-usd)' : ''}`);
  console.log(lines.join('\n'));
  if (o.out) fs.writeFileSync(o.out, JSON.stringify(report, null, 2));
  process.exitCode = total === runs && !report.partial ? 0 : 1;
}

main();
