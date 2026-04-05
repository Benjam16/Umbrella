/** Self-contained dashboard (no build step). Chaos feed polls `/api/chaos-logs`. */
export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Umbrella — Chaos Dashboard</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #0f0f12; color: #e8e6e3; min-height: 100vh; }
    header { padding: 1.25rem 1.5rem; border-bottom: 1px solid #2a2a32; }
    h1 { margin: 0; font-size: 1.15rem; font-weight: 600; }
    .sub { margin: 0.35rem 0 0; font-size: 0.8rem; opacity: 0.75; }
    main { padding: 1.25rem 1.5rem; max-width: 52rem; }
    .chaos-feed {
      margin-top: 1rem;
      padding: 1rem 1.1rem;
      border-radius: 0.5rem;
      border: 1px solid rgba(239, 68, 68, 0.45);
      background: rgba(127, 29, 29, 0.18);
    }
    .chaos-feed h2 {
      margin: 0 0 0.75rem;
      font-size: 0.95rem;
      color: #fca5a5;
    }
    .event {
      font-size: 0.72rem;
      line-height: 1.45;
      margin: 0.45rem 0 0;
      padding: 0.5rem 0.6rem;
      background: rgba(0,0,0,0.25);
      border-radius: 0.35rem;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .empty { opacity: 0.6; font-size: 0.8rem; margin-top: 0.5rem; }
    .status { font-size: 0.75rem; margin-top: 0.75rem; opacity: 0.65; }
    .last-run {
      margin-top: 1.5rem;
      padding: 1rem 1.1rem;
      border-radius: 0.5rem;
      border: 1px solid rgba(34, 197, 94, 0.35);
      background: rgba(22, 101, 52, 0.15);
    }
    .last-run h2 {
      margin: 0 0 0.5rem;
      font-size: 0.95rem;
      color: #86efac;
    }
    .last-run pre {
      margin: 0;
      font-size: 0.72rem;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .goals-panel {
      margin-top: 1.5rem;
      padding: 1rem 1.1rem;
      border-radius: 0.5rem;
      border: 1px solid rgba(96, 165, 250, 0.4);
      background: rgba(30, 58, 138, 0.2);
    }
    .goals-panel h2 {
      margin: 0 0 0.35rem;
      font-size: 0.95rem;
      color: #93c5fd;
    }
    .goals-panel .hint {
      font-size: 0.72rem;
      opacity: 0.8;
      margin: 0 0 0.5rem;
      line-height: 1.4;
    }
    .goals-panel label.lbl {
      font-size: 0.72rem;
      opacity: 0.85;
      display: block;
      margin-top: 0.35rem;
    }
    .goals-panel input[type="password"] {
      width: 100%;
      max-width: 22rem;
      margin: 0.25rem 0 0.5rem;
      padding: 0.4rem 0.5rem;
      background: #141418;
      border: 1px solid #2a2a32;
      border-radius: 0.35rem;
      color: inherit;
      font-size: 0.8rem;
    }
    .btn-row { display: flex; flex-wrap: wrap; gap: 0.45rem; margin: 0.35rem 0 0.65rem; }
    .btn-row button {
      font-size: 0.72rem;
      padding: 0.35rem 0.65rem;
      border-radius: 0.35rem;
      border: 1px solid #3b82f6;
      background: rgba(59, 130, 246, 0.2);
      color: #e8e6e3;
      cursor: pointer;
    }
    .btn-row button:hover { background: rgba(59, 130, 246, 0.35); }
    .goals-panel pre {
      margin: 0.35rem 0 0;
      font-size: 0.72rem;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <header>
    <h1>Umbrella Chaos Dashboard</h1>
    <p class="sub">Live feed: recovery attempts, plans, and steps (memory type <code>chaos_event</code>)</p>
  </header>
  <main>
    <section class="goals-panel" id="goals-root">
      <h2>Goals &amp; background control</h2>
      <p class="hint">Long-term <strong>core</strong> runs when idle; <strong>foreground</strong> interrupts until cleared or verify passes (<code>UMBRELLA_FOREGROUND_CLEAR_ON_VERIFY=0</code> keeps it until <code>/api/foreground/clear</code> or Telegram <code>/umb done</code>). Paste the same secret as <code>UMBRELLA_INBOUND_SECRET</code> (stored in session only).</p>
      <label class="lbl" for="inbound-token">Inbound secret</label>
      <input type="password" id="inbound-token" name="inbound-token" placeholder="Bearer secret" autocomplete="off" />
      <div class="btn-row">
        <button type="button" id="btn-pause">Pause background</button>
        <button type="button" id="btn-resume">Resume background</button>
        <button type="button" id="btn-clear-fg">Clear foreground</button>
      </div>
      <pre id="goals-body">Loading…</pre>
      <p class="status" id="goals-status"></p>
    </section>
    <section class="last-run" id="last-run-root">
      <h2>Last heartbeat</h2>
      <pre id="last-run-body">Loading…</pre>
      <p class="status" id="last-run-status"></p>
    </section>
    <section class="last-run" id="run-score-root" style="border-color: rgba(168, 85, 247, 0.35); background: rgba(88, 28, 135, 0.15);">
      <h2 style="color: #d8b4fe;">Run scorecard</h2>
      <p class="hint" style="font-size: 0.72rem; opacity: 0.85; margin: 0 0 0.5rem;">Recent rows from <code>run-log.jsonl</code> via <code>GET /api/run-log?limit=40</code></p>
      <pre id="run-score-body">Loading…</pre>
      <p class="status" id="run-score-status"></p>
    </section>
    <section class="chaos-feed" id="chaos-root">
      <h2>Live Chaos Feed</h2>
      <div id="chaos-events"></div>
      <p class="status" id="chaos-status">Loading…</p>
    </section>
  </main>
  <script>
    function renderEvents(rows) {
      const el = document.getElementById('chaos-events');
      const status = document.getElementById('chaos-status');
      if (!rows || rows.length === 0) {
        el.innerHTML = '<p class="empty">No chaos events yet. Trigger a failing shell command to see recovery.</p>';
        status.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
        return;
      }
      el.innerHTML = rows.map(function (r) {
        var line = (r.timestamp || '') + ' — ' + (r.content || '');
        return '<p class="event">' + escapeHtml(line) + '</p>';
      }).join('');
      status.textContent = 'Last updated: ' + new Date().toLocaleTimeString() + ' — ' + rows.length + ' events';
    }
    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
    async function poll() {
      try {
        const r = await fetch('/api/chaos-logs');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        renderEvents(data);
      } catch (e) {
        document.getElementById('chaos-status').textContent = 'Poll error: ' + e;
      }
    }
    poll();
    setInterval(poll, 4000);

    async function pollLastRun() {
      var pre = document.getElementById('last-run-body');
      var st = document.getElementById('last-run-status');
      try {
        var r = await fetch('/api/last-run');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var data = await r.json();
        if (data.empty) {
          pre.textContent = 'No run recorded yet.';
          st.textContent = '';
          return;
        }
        pre.textContent = JSON.stringify(data, null, 2);
        st.textContent = 'Updated: ' + (data.t || '') + ' — source: ' + String(data.goalSource || '—') + ' — verify: ' + String(data.verifyOk);
      } catch (e) {
        pre.textContent = 'Error: ' + e;
      }
    }
    pollLastRun();
    setInterval(pollLastRun, 5000);

    async function pollRunScore() {
      var pre = document.getElementById('run-score-body');
      var st = document.getElementById('run-score-status');
      try {
        var r = await fetch('/api/run-log?limit=40');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var data = await r.json();
        var sc = data.scorecard || {};
        pre.textContent = JSON.stringify(data.runs || [], null, 2);
        st.textContent = 'Scorecard: ' + (sc.total || 0) + ' runs — verify OK: ' + (sc.verifyOk || 0) +
          ', failed: ' + (sc.verifyFailed || 0) + ', other: ' + (sc.skippedOrPending || 0);
      } catch (e) {
        pre.textContent = 'Error: ' + e;
      }
    }
    pollRunScore();
    setInterval(pollRunScore, 12000);

    function inboundToken() {
      var inp = document.getElementById('inbound-token');
      var v = inp && inp.value ? inp.value.trim() : '';
      if (v) sessionStorage.setItem('umbrella_inbound_secret', v);
      return v || sessionStorage.getItem('umbrella_inbound_secret') || '';
    }
    async function pollGoals() {
      var pre = document.getElementById('goals-body');
      var st = document.getElementById('goals-status');
      try {
        var r = await fetch('/api/agent-state');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var data = await r.json();
        pre.textContent = JSON.stringify(data, null, 2);
        st.textContent = 'Polled: ' + new Date().toLocaleTimeString();
      } catch (e) {
        pre.textContent = 'Error: ' + e;
      }
    }
    async function postAgentState(body) {
      var t = inboundToken();
      if (!t) {
        alert('Set inbound secret first (same as UMBRELLA_INBOUND_SECRET).');
        return;
      }
      var r = await fetch('/api/agent-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + t
        },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        var err = await r.text();
        alert('Request failed: ' + r.status + ' ' + err);
        return;
      }
      pollGoals();
    }
    (function wireGoals() {
      var inp = document.getElementById('inbound-token');
      if (inp && !inp.value) inp.value = sessionStorage.getItem('umbrella_inbound_secret') || '';
      var bp = document.getElementById('btn-pause');
      var br = document.getElementById('btn-resume');
      var bc = document.getElementById('btn-clear-fg');
      if (bp) bp.onclick = function() { postAgentState({ backgroundPaused: true }); };
      if (br) br.onclick = function() { postAgentState({ backgroundPaused: false }); };
      if (bc) bc.onclick = function() { postAgentState({ clearForeground: true }); };
    })();
    pollGoals();
    setInterval(pollGoals, 8000);
  </script>
</body>
</html>
`;
