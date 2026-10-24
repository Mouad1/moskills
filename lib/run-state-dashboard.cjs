'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { RunStateEngine } = require('./run-state.cjs');
const { checkLocalRequest, checkLocalWrite } = require('./local-http-guard.cjs');

function getDashboardHtml(runId) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>moskills Run-State Dashboard</title>
  <style>
    :root {
      --bg: #0d1117;
      --card: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --text-muted: #8b949e;
      --accent: #58a6ff;
      --green: #3fb950;
      --red: #f85149;
      --yellow: #d29922;
      --purple: #bc8cff;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font);
      line-height: 1.5;
      padding: 24px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      font-size: 12px;
      border-radius: 12px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-finished, .badge-accepted { background: rgba(63, 185, 80, 0.2); color: var(--green); border: 1px solid var(--green); }
    .badge-unfinished { background: rgba(88, 166, 255, 0.2); color: var(--accent); border: 1px solid var(--accent); }
    .badge-stale, .badge-needs_fix { background: rgba(210, 153, 34, 0.2); color: var(--yellow); border: 1px solid var(--yellow); }
    .badge-blocked, .badge-blocked_review_exhausted { background: rgba(248, 81, 73, 0.2); color: var(--red); border: 1px solid var(--red); }
    .badge-pending { background: rgba(139, 148, 158, 0.2); color: var(--text-muted); border: 1px solid var(--text-muted); }

    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
    }
    .tab-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 14px;
      font-weight: 500;
      padding: 8px 16px;
      cursor: pointer;
      border-radius: 6px;
      transition: all 0.15s ease;
    }
    .tab-btn:hover { color: var(--text); background: rgba(255,255,255,0.05); }
    .tab-btn.active { color: var(--accent); background: rgba(88, 166, 255, 0.1); border-bottom: 2px solid var(--accent); }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .card h2 {
      font-size: 16px;
      margin-bottom: 12px;
      color: var(--text);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .task-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      margin-bottom: 8px;
      background: rgba(255,255,255,0.02);
    }
    .task-info { display: flex; flex-direction: column; gap: 4px; }
    .task-title { font-weight: 500; font-size: 14px; }
    .task-meta { font-size: 12px; color: var(--text-muted); }

    .btn {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-green { background: var(--green); }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
    .btn-outline:hover { background: rgba(255,255,255,0.05); }

    pre {
      background: #000;
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 12px;
      color: #7ee787;
      margin-top: 8px;
    }
    .log-item {
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 12px;
      font-family: monospace;
    }
    .log-time { color: var(--text-muted); margin-right: 8px; }
    .log-type { color: var(--purple); font-weight: 600; margin-right: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>
      <span>moskills Run-State Dashboard</span>
      <span id="header-run-id" class="badge badge-unfinished">Loading...</span>
    </h1>
    <div>
      <span id="acceptance-badge" class="badge badge-pending">Human Acceptance: Pending</span>
    </div>
  </div>

  <div class="tabs">
    <button id="tab-brief" class="tab-btn active" onclick="switchTab('brief')">Brief & Goal</button>
    <button id="tab-progress" class="tab-btn" onclick="switchTab('progress')">Progress & Tasks</button>
    <button id="tab-agents" class="tab-btn" onclick="switchTab('agents')">Agents & Leases</button>
    <button id="tab-diff" class="tab-btn" onclick="switchTab('diff')">Diff & Impact</button>
    <button id="tab-review" class="tab-btn" onclick="switchTab('review')">Review, Evidence & Acceptance</button>
  </div>

  <!-- Brief Tab -->
  <div id="content-brief" class="tab-content active">
    <div class="card">
      <h2>Goal & Agreed Scope</h2>
      <p id="run-goal" style="font-size: 16px; font-weight: 500; margin-bottom: 8px;">Loading goal...</p>
      <div id="run-scope" style="font-size: 13px; color: var(--text-muted);">Scoped files: none</div>
    </div>
    <div class="card">
      <h2>Brief</h2>
      <div id="run-brief-text" style="font-size: 14px; white-space: pre-wrap;">No brief provided.</div>
    </div>
  </div>

  <!-- Progress Tab -->
  <div id="content-progress" class="tab-content">
    <div class="card">
      <h2>Tasks & Quality Gate Status</h2>
      <div id="tasks-container">Loading tasks...</div>
    </div>
    <div class="card">
      <h2>Next Recommended Action</h2>
      <div id="next-action" style="font-size: 14px; color: var(--accent); font-weight: 500;">Analyzing ready tasks...</div>
    </div>
  </div>

  <!-- Diff & Impact Tab -->
  <div id="content-diff" class="tab-content tab-diff">
    <div class="card">
      <h2>Workspace Changes & Impact</h2>
      <div id="diff-summary" style="margin-bottom: 12px; font-size: 14px; color: var(--text-muted);">Analyzing git changes and dependency impact...</div>
      <div id="diff-impact-tasks" style="margin-bottom: 16px; display: flex; gap: 8px; flex-wrap: wrap;"></div>
      <pre id="diff-content" style="background: #090d13; border: 1px solid var(--border); border-radius: 6px; padding: 12px; font-family: monospace; font-size: 13px; max-height: 450px; overflow-y: auto; white-space: pre-wrap; color: var(--text);">No git changes detected.</pre>
    </div>
  </div>

  <!-- Review Tab -->
  <div id="content-review" class="tab-content">
    <div class="card">
      <h2>Human Acceptance Gate</h2>
      <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">
        Acceptance cryptographically binds to the SHA-256 hashes of all scoped files. Modifying any checked file automatically reopens acceptance.
      </p>
      <div style="display: flex; gap: 10px; align-items: center;">
        <button id="btn-accept-run" class="btn btn-green" onclick="recordAcceptance()">Accept Finished Result</button>
        <span id="acceptance-status-text" style="font-size: 13px;"></span>
      </div>
    </div>
    <div class="card">
      <h2>Challenger Reviews & Remaining Budget</h2>
      <div id="reviews-container">No challenger reviews recorded yet.</div>
    </div>
    <div class="card">
      <h2>Live Append-Only Event Stream</h2>
      <div id="events-container" style="max-height: 250px; overflow-y: auto;">Loading events...</div>
    </div>
  </div>

  <!-- Agents & Leases Tab -->
  <div id="content-agents" class="tab-content">
    <div class="card">
      <h2>Active Multi-Agent Leases & Concurrency</h2>
      <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">
        Tracks concurrent worker agents, active task reservations, and lease TTL heartbeats.
      </p>
      <div id="agents-container">Loading agent leases...</div>
    </div>
  </div>

  <script>
    const runId = '${runId}';

    function switchTab(tab) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById('tab-' + tab).classList.add('active');
      document.getElementById('content-' + tab).classList.add('active');
      if (tab === 'diff') {
        loadDiff();
      }
    }

    function renderData(run, events) {
      if (!run) return;
      events = events || [];

      // Header & Brief
      document.getElementById('header-run-id').textContent = 'Run: ' + run.id;
      document.getElementById('run-goal').textContent = run.goal || 'No goal set';
      document.getElementById('run-scope').textContent = 'Scoped files: ' + ((run.scope && run.scope.length) ? run.scope.join(', ') : 'none');

      // Human Acceptance
      const accBadge = document.getElementById('acceptance-badge');
      const accStatus = (run.humanAcceptance && run.humanAcceptance.status) || 'pending';
      accBadge.textContent = 'Human Acceptance: ' + accStatus.toUpperCase();
      accBadge.className = 'badge badge-' + accStatus;

      // Tasks
      const tasksContainer = document.getElementById('tasks-container');
      if (!run.tasks || !run.tasks.length) {
        tasksContainer.innerHTML = '<div style="color:var(--text-muted);">No tasks defined.</div>';
      } else {
        tasksContainer.innerHTML = run.tasks.map(t => {
          const badgeClass = 'badge badge-' + (t.status || 'unfinished');
          const checks = t.requiredCheckIds && t.requiredCheckIds.length ? 'Checks: ' + t.requiredCheckIds.join(', ') : 'No checks';
          const budget = t.reviewBudget !== undefined ? ('Budget: ' + (t.reviewBudget - (t.reviewCycles || 0)) + '/' + t.reviewBudget) : '';
          const leaseBadge = t.lease
            ? '<span class="badge" style="background:rgba(88,166,255,0.15);color:var(--accent);border:1px solid var(--accent);margin-left:6px;">Leased: ' + t.lease.agentId + '</span>'
            : '';
          return '<div class="task-item">' +
            '<div class="task-info">' +
              '<span class="task-title">' + t.id + ': ' + t.title + leaseBadge + '</span>' +
              '<span class="task-meta">' + checks + (budget ? ' | ' + budget : '') + '</span>' +
            '</div>' +
            '<span class="' + badgeClass + '">' + t.status + (t.stale ? ' (stale)' : '') + '</span>' +
          '</div>';
        }).join('');
      }

      // Agents & Leases
      const agentsContainer = document.getElementById('agents-container');
      if (agentsContainer) {
        const now = Date.now();
        const leases = (run.tasks || [])
          .filter(t => t.lease)
          .map(t => {
            const expiresAtTime = new Date(t.lease.expiresAt).getTime();
            const isExpired = expiresAtTime <= now;
            return {
              taskId: t.id,
              taskTitle: t.title,
              agentId: t.lease.agentId,
              leaseId: t.lease.leaseId,
              acquiredAt: t.lease.acquiredAt,
              expiresAt: t.lease.expiresAt,
              isExpired
            };
          });
        if (!leases.length) {
          agentsContainer.innerHTML = '<div style="color:var(--text-muted); font-size:13px;">No active agent leases held. All ready tasks available for dispatch.</div>';
        } else {
          agentsContainer.innerHTML = leases.map(l => {
            const statusBadge = l.isExpired
              ? '<span class="badge badge-needs_fix">EXPIRED</span>'
              : '<span class="badge badge-finished">ACTIVE LEASE</span>';
            return '<div style="padding:10px; border:1px solid var(--border); border-radius:6px; margin-bottom:8px;">' +
              '<div style="display:flex; justify-content:space-between; margin-bottom:4px;">' +
                '<strong>Agent: ' + l.agentId + ' &rarr; ' + l.taskId + ' (' + l.taskTitle + ')</strong>' +
                statusBadge +
              '</div>' +
              '<div style="font-size:12px; color:var(--text-muted);">' +
                'Lease ID: ' + l.leaseId + ' | Expires: ' + l.expiresAt +
              '</div>' +
            '</div>';
          }).join('');
        }
      }

      // Reviews
      const reviewsContainer = document.getElementById('reviews-container');
      const allReviews = [];
      (run.tasks || []).forEach(t => {
        if (t.reviews && t.reviews.length) allReviews.push(...t.reviews);
      });
      if (!allReviews.length) {
        reviewsContainer.innerHTML = '<div style="color:var(--text-muted); font-size:13px;">No challenger reviews recorded.</div>';
      } else {
        reviewsContainer.innerHTML = allReviews.map(r => {
          return '<div style="padding:10px; border:1px solid var(--border); border-radius:6px; margin-bottom:8px;">' +
            '<div style="display:flex; justify-content:space-between; margin-bottom:4px;">' +
              '<strong>' + r.reviewId + ' (' + r.reviewer + ')</strong>' +
              '<span class="badge badge-' + (r.passed ? 'finished' : 'blocked') + '">' + (r.passed ? 'PASSED' : 'NEEDS FIX') + '</span>' +
            '</div>' +
            '<div style="font-size:12px; color:var(--text-muted);">' +
              'Remaining Budget: ' + r.remainingBudget + ' | Findings: ' + (r.findings && r.findings.length ? r.findings.join('; ') : 'None') +
            '</div>' +
          '</div>';
        }).join('');
      }

      // Events
      const eventsContainer = document.getElementById('events-container');
      eventsContainer.innerHTML = events.slice(-30).reverse().map(e => {
        return '<div class="log-item">' +
          '<span class="log-time">' + (e.timestamp ? e.timestamp.slice(11, 19) : '') + '</span>' +
          '<span class="log-type">[' + e.type + ']</span>' +
          '<span>' + JSON.stringify(e.data || {}) + '</span>' +
        '</div>';
      }).join('');
    }

    async function loadDiff() {
      try {
        const res = await fetch('/api/diff?runId=' + encodeURIComponent(runId));
        if (!res.ok) return;
        const data = await res.json();
        const summary = document.getElementById('diff-summary');
        const tasksDiv = document.getElementById('diff-impact-tasks');
        const diffPre = document.getElementById('diff-content');

        if (summary) {
          const fileCount = (data.changedFiles && data.changedFiles.length) || 0;
          const taskCount = (data.impactedTaskIds && data.impactedTaskIds.length) || 0;
          summary.textContent = fileCount + ' modified file(s) in workspace. ' + taskCount + ' task(s) impacted.';
        }

        if (tasksDiv) {
          if (!data.impactedTaskIds || !data.impactedTaskIds.length) {
            tasksDiv.innerHTML = '<span class="badge badge-finished">All tasks safe from changes</span>';
          } else {
            tasksDiv.innerHTML = data.impactedTaskIds.map(tid => 
              '<span class="badge badge-needs_fix">Impacted Task: ' + tid + '</span>'
            ).join('');
          }
        }

        if (diffPre) {
          diffPre.textContent = data.diff || '(No git diff detected)';
        }
      } catch (err) {
        console.error('Failed to load diff:', err);
      }
    }

    async function loadData() {
      try {
        const [runRes, eventsRes] = await Promise.all([
          fetch('/api/run'),
          fetch('/api/events')
        ]);
        if (!runRes.ok) return;
        const run = await runRes.json();
        const events = await eventsRes.json();
        renderData(run, events);
        loadDiff();
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }
    }

    function initSSE() {
      if (!window.EventSource) {
        loadData();
        setInterval(loadData, 2500);
        return;
      }
      try {
        const source = new EventSource('/api/stream');
        source.addEventListener('snapshot', (e) => {
          try {
            const data = JSON.parse(e.data);
            renderData(data.run, data.events);
            loadDiff();
          } catch (err) { console.error(err); }
        });
        source.addEventListener('update', (e) => {
          try {
            const data = JSON.parse(e.data);
            renderData(data.run, data.events);
            loadDiff();
          } catch (err) { console.error(err); }
        });
        source.onerror = () => {
          loadData();
        };
      } catch (err) {
        loadData();
        setInterval(loadData, 2500);
      }
    }

    async function recordAcceptance() {
      const btn = document.getElementById('btn-accept-run');
      btn.disabled = true;
      btn.textContent = 'Recording...';
      try {
        const res = await fetch('/api/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acceptedBy: 'Maintainer', notes: 'Dashboard verification signoff' })
        });
        if (res.ok) {
          loadData();
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Accept Finished Result';
      }
    }

    initSSE();
  </script>
</body>
</html>`;
}

function startDashboardServer({ targetDir, runId = 'default', port = 4040, host = '127.0.0.1' }) {
  const engine = new RunStateEngine(targetDir);
  const sseClients = new Set();

  function readRunAndEvents() {
    let run = null;
    try {
      run = engine.getRun(runId);
    } catch {}
    let events = [];
    try {
      const runDir = engine._getRunDir(runId);
      const eventFile = path.join(runDir, 'events.ndjson');
      if (fs.existsSync(eventFile)) {
        events = fs.readFileSync(eventFile, 'utf8')
          .trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      }
    } catch {}
    return { run, events };
  }

  function broadcastUpdate() {
    if (sseClients.size === 0) return;
    const data = readRunAndEvents();
    const payload = `event: update\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  let watcher = null;
  let debounceTimer = null;
  const runDir = engine._getRunDir(runId);
  try {
    if (fs.existsSync(runDir)) {
      watcher = fs.watch(runDir, { recursive: true }, () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(broadcastUpdate, 75);
      });
    }
  } catch {}

  const pollInterval = setInterval(broadcastUpdate, 1500);
  if (typeof pollInterval.unref === 'function') {
    pollInterval.unref();
  }

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // Local tool: loopback Host only, no cross-origin access (no CORS headers on purpose).
    if (!checkLocalRequest(req, res)) return;

    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getDashboardHtml(runId));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }

      const initialData = readRunAndEvents();
      res.write(`event: snapshot\ndata: ${JSON.stringify(initialData)}\n\n`);
      sseClients.add(res);

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/run') {
      try {
        const run = engine.getRun(runId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(run));
      } catch (err) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/agents') {
      try {
        const run = engine.getRun(runId);
        const now = Date.now();
        const leases = (run.tasks || [])
          .filter(t => t.lease)
          .map(t => {
            const expiresAtTime = new Date(t.lease.expiresAt).getTime();
            const isExpired = expiresAtTime <= now;
            return {
              taskId: t.id,
              taskTitle: t.title,
              agentId: t.lease.agentId,
              leaseId: t.lease.leaseId,
              acquiredAt: t.lease.acquiredAt,
              expiresAt: t.lease.expiresAt,
              ttlMs: t.lease.ttlMs,
              isExpired
            };
          });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          runId,
          leases,
          agentCount: new Set(leases.filter(l => !l.isExpired).map(l => l.agentId)).size
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/events') {
      try {
        const events = readRunAndEvents().events;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(events));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/diff') {
      try {
        const queryRunId = parsedUrl.searchParams.get('runId') || runId;
        const rootDir = engine.projectDir || process.cwd();
        
        let diffOutput = '';
        let changedFiles = [];
        try {
          const { spawnSync } = require('node:child_process');
          const diffProc = spawnSync('git', ['diff', 'HEAD'], { cwd: rootDir, encoding: 'utf8' });
          if (diffProc.status === 0) {
            diffOutput = diffProc.stdout || '';
          }
          const statusProc = spawnSync('git', ['status', '--porcelain'], { cwd: rootDir, encoding: 'utf8' });
          if (statusProc.status === 0 && statusProc.stdout) {
            changedFiles = statusProc.stdout
              .split('\n')
              .filter(line => line.trim().length > 0)
              .map(line => line.slice(3).trim());
          }
        } catch {}

        const impact = engine.getImpactedTasks(queryRunId, changedFiles);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          diff: diffOutput,
          changedFiles,
          impactedCheckIds: impact.impactedCheckIds,
          impactedTaskIds: impact.impactedTaskIds
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/accept') {
      if (!checkLocalWrite(req, res)) return;
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const acceptance = engine.recordHumanAcceptance({
            runId,
            acceptedBy: data.acceptedBy || 'user',
            notes: data.notes || ''
          });
          broadcastUpdate();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(acceptance));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  function cleanupResources() {
    clearInterval(pollInterval);
    clearTimeout(debounceTimer);
    if (watcher) {
      try { watcher.close(); } catch {}
    }
    for (const client of sseClients) {
      try { client.end(); } catch {}
    }
    sseClients.clear();
  }

  server.on('close', cleanupResources);

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : port;
      resolve({
        server,
        port: actualPort,
        broadcastUpdate,
        close: () => {
          cleanupResources();
          return new Promise(resClose => server.close(resClose));
        }
      });
    });
    server.on('error', reject);
  });
}

module.exports = { startDashboardServer, getDashboardHtml };
