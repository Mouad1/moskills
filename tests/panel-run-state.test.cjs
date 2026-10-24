'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { RunStateEngine } = require('../lib/run-state.cjs');
const { loadPanels, escapeHtml } = require('../lib/panel-host.cjs');

async function renderCore(targetDir) {
  const { panels, skipped } = await loadPanels([path.join(__dirname, '..', 'lib', 'panels')]);
  assert.deepEqual(skipped, []);
  const panel = panels.find((p) => p.id === 'run-state');
  assert.ok(panel, 'core run-state panel is loaded');
  return (await panel.render({ targetDir, config: {}, escape: escapeHtml, panelDir: panel.dir })).html;
}

test('run-state panel: empty state explains how runs appear', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills-rs-empty-'));
  const html = await renderCore(dir);
  assert.match(html, /No runs yet/);
});

test('run-state panel: lists runs newest first with progress, escaping run data', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills-rs-'));
  const engine = new RunStateEngine(dir);
  engine.initRun({ runId: 'old', goal: 'Old goal', scope: [], tasks: [{ id: 'a', title: 'A', reviewBudget: 1 }] });
  engine.initRun({
    runId: 'new',
    goal: 'Ship <script>alert(1)</script> safely',
    scope: [],
    tasks: [{ id: 'a', title: 'A', reviewBudget: 1 }, { id: 'b', title: 'B', reviewBudget: 1 }],
  });
  const runFile = path.join(dir, '.moskills', 'runs', 'new', 'run.json');
  const run = JSON.parse(fs.readFileSync(runFile, 'utf8'));
  run.tasks[0].status = 'finished';
  run.updatedAt = new Date(Date.now() + 1000).toISOString();
  fs.writeFileSync(runFile, JSON.stringify(run));

  const html = await renderCore(dir);
  assert.ok(html.indexOf('Ship') < html.indexOf('Old goal'), 'newest first');
  assert.match(html, /Ship &lt;script&gt;alert\(1\)&lt;\/script&gt; safely/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /1\s*\/\s*2/);
  assert.match(html, /moskills run-state dashboard --run new/);
});
