/**
 * Full-page log viewer for a specific issue.
 * Shows filtered events with agent messages, reasoning, commands, and tool calls.
 */
export function renderLogsTemplate(issueIdentifier: string): string {
  const escaped = issueIdentifier.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Logs — ${escaped} — Symphony</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0d1117; --surface: #161b22; --surface2: #1c2129;
      --border: #30363d; --text: #c9d1d9; --text-dim: #8b949e; --text-bright: #f0f6fc;
      --green: #3fb950; --green-bg: rgba(63,185,80,0.1);
      --blue: #58a6ff; --blue-bg: rgba(88,166,255,0.1);
      --amber: #d29922; --amber-bg: rgba(210,153,34,0.1);
      --red: #f85149; --red-bg: rgba(248,81,73,0.1);
      --purple: #bc8cff; --purple-bg: rgba(188,140,255,0.1);
      --cyan: #39d2c0; --cyan-bg: rgba(57,210,192,0.1);
      --primary: #58a6ff;
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      --mono: ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    body { font-family: var(--sans); background: var(--bg); color: var(--text); min-height: 100vh; }
    .mono { font-family: var(--mono); }
    .icon { display: inline-flex; width: 1.25em; line-height: 1; align-items: center; justify-content: center; }
    a { color: var(--primary); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .header {
      position: sticky; top: 0; z-index: 50;
      background: var(--surface); border-bottom: 1px solid var(--border);
      padding: 12px 24px; display: flex; align-items: center; justify-content: space-between;
      backdrop-filter: blur(12px);
    }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .header-left h1 { font-size: 16px; font-weight: 700; color: var(--text-bright); }
    .header-left .badge {
      font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .badge-live { background: var(--green-bg); color: var(--green); }
    .badge-id { background: var(--blue-bg); color: var(--blue); font-family: var(--mono); }
    .header-right { display: flex; align-items: center; gap: 12px; }

    .filters {
      position: sticky; top: 49px; z-index: 40;
      background: var(--surface2); border-bottom: 1px solid var(--border);
      padding: 8px 24px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    }
    .filter-btn {
      font-size: 12px; font-weight: 600; padding: 4px 14px; border-radius: 6px;
      border: 1px solid var(--border); background: transparent; color: var(--text-dim);
      cursor: pointer; transition: all 0.15s;
    }
    .filter-btn:hover { border-color: var(--text-dim); color: var(--text); }
    .filter-btn.active { background: var(--primary); border-color: var(--primary); color: #fff; }
    .stats {
      margin-left: auto; font-size: 12px; color: var(--text-dim); font-family: var(--mono);
      display: flex; gap: 16px;
    }
    .stats span { color: var(--text); font-weight: 600; }

    .log-container { padding: 8px 0; max-width: 100%; }
    .log-entry {
      padding: 10px 24px; border-bottom: 1px solid var(--border);
      transition: background 0.15s;
    }
    .log-entry:hover { background: var(--surface); }
    .log-entry.highlight { animation: flash 1.5s ease-out; }
    @keyframes flash { 0% { background: rgba(88,166,255,0.15); } 100% { background: transparent; } }

    .log-header { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; flex-wrap: wrap; }
    .log-time { font-family: var(--mono); font-size: 11px; color: var(--text-dim); min-width: 70px; }
    .log-type {
      font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px;
      text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;
    }
    .type-message { background: var(--green-bg); color: var(--green); }
    .type-reasoning { background: var(--amber-bg); color: var(--amber); }
    .type-command { background: var(--blue-bg); color: var(--blue); }
    .type-tool { background: var(--purple-bg); color: var(--purple); }
    .type-file { background: var(--cyan-bg); color: var(--cyan); }
    .type-turn { background: rgba(255,255,255,0.08); color: var(--text-bright); }
    .type-error { background: var(--red-bg); color: var(--red); }
    .type-search { background: var(--cyan-bg); color: var(--cyan); }
    .type-token { background: rgba(255,255,255,0.05); color: var(--text-dim); }
    .type-user { background: rgba(255,255,255,0.08); color: var(--text-bright); }

    .log-id { font-family: var(--mono); font-size: 10px; color: var(--text-dim); }
    .log-verb { font-size: 10px; color: var(--text-dim); font-weight: 500; text-transform: uppercase; }
    .log-message { font-size: 13px; color: var(--text); line-height: 1.5; }

    .log-content {
      margin-top: 8px; font-family: var(--mono); font-size: 12px;
      line-height: 1.6; padding: 12px 16px; border-radius: 8px;
      white-space: pre-wrap; word-break: break-word; overflow-x: auto;
      border-left: 3px solid var(--border); max-height: 400px; overflow-y: auto;
    }
    .content-message { background: var(--green-bg); border-left-color: var(--green); color: var(--text); }
    .content-reasoning { background: var(--amber-bg); border-left-color: var(--amber); color: var(--text); }
    .content-command { background: var(--blue-bg); border-left-color: var(--blue); color: var(--text); }
    .content-tool { background: var(--purple-bg); border-left-color: var(--purple); color: var(--text); }
    .content-file { background: var(--cyan-bg); border-left-color: var(--cyan); color: var(--text); }
    .content-error { background: var(--red-bg); border-left-color: var(--red); color: var(--text); }
    .content-user { background: rgba(255,255,255,0.05); border-left-color: var(--text-dim); color: var(--text); }

    .turn-divider {
      padding: 12px 24px; display: flex; align-items: center; gap: 12px;
      border-bottom: 1px solid var(--border);
    }
    .turn-divider::before, .turn-divider::after {
      content: ""; flex: 1; height: 1px; background: var(--border);
    }
    .turn-divider span {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      color: var(--text-dim); letter-spacing: 1px; white-space: nowrap;
    }

    .empty-state {
      text-align: center; padding: 80px 24px; color: var(--text-dim);
    }
    .empty-icon { font-size: 48px; margin-bottom: 16px; display: block; }

    .scroll-anchor { height: 1px; }
    .auto-scroll-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 100;
      background: var(--primary); color: #fff; border: none; padding: 8px 16px;
      border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: none; align-items: center; gap: 6px;
    }
    .auto-scroll-btn.visible { display: flex; }
    .back-link {
      font-size: 13px; color: var(--text-dim); display: flex; align-items: center; gap: 4px;
    }
    .back-link:hover { color: var(--primary); }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <a class="back-link" href="/">
        <span class="icon" style="font-size:18px">←</span>
        Dashboard
      </a>
      <div style="width:1px;height:20px;background:var(--border)"></div>
      <span class="badge badge-id">${escaped}</span>
      <h1 id="issueTitle">Loading…</h1>
      <span class="badge badge-live" id="statusBadge">LIVE</span>
    </div>
    <div class="header-right">
      <label style="font-size:12px;color:var(--text-dim);display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="autoScrollToggle" checked style="accent-color:var(--primary)"/>
        Auto-scroll
      </label>
      <button id="copyLogsBtn" onclick="copyLogs()" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);padding:6px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px">
        <span class="icon" style="font-size:16px">⧉</span>
        Copy Logs
      </button>
      <button onclick="loadEvents()" style="background:var(--primary);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px">
        <span class="icon" style="font-size:16px">↻</span>
        Refresh
      </button>
    </div>
  </div>

  <div class="filters">
    <button class="filter-btn active" data-filter="all">All</button>
    <button class="filter-btn" data-filter="message">💬 Messages</button>
    <button class="filter-btn" data-filter="reasoning">🧠 Reasoning</button>
    <button class="filter-btn" data-filter="command">⚡ Commands</button>
    <button class="filter-btn" data-filter="tool">🔧 Tools</button>
    <button class="filter-btn" data-filter="file">📄 Files</button>
    <button class="filter-btn" data-filter="error">🔴 Errors</button>
    <div class="stats">
      <div>Events: <span id="eventCount">0</span></div>
      <div>Shown: <span id="shownCount">0</span></div>
    </div>
  </div>

  <div class="log-container" id="logContainer"></div>
  <div class="scroll-anchor" id="scrollAnchor"></div>

  <button class="auto-scroll-btn" id="scrollToBottom" onclick="scrollToBottom()">
    <span class="icon" style="font-size:16px">⇣</span>
    Scroll to bottom
  </button>

  <script>
    const ISSUE = "${escaped}";
    let allEvents = [];
    let currentFilter = "all";
    let autoScroll = true;
    let lastEventCount = 0;

    const NOISE_MESSAGES = new Set([
      "codex/event/agent_message_delta",
      "codex/event/agent_message_content_delta",
      "item/agentMessage/delta",
      "codex/event/token_count",
      "account/rateLimits/updated",
      "item/reasoning/textDelta",
      "item/reasoning/summaryTextDelta",
      "item/reasoning/summaryPartAdded",
      "codex/event/reasoning_delta",
      "thread/status/changed",
      "codex/event/task_complete",
    ]);

    function classifyEvent(ev) {
      const msg = ev.message || "";
      const evType = ev.event || "";
      if (msg.includes("error") || msg.includes("stream_error") || evType.includes("error")) return "error";
      if (evType === "turn_started" || evType === "turn_completed") return "turn";
      if (evType === "token_usage_updated") return "token";
      if (msg.startsWith("agentMessage") || msg.includes("agent_message")) return "message";
      if (msg.startsWith("reasoning")) return "reasoning";
      if (msg.startsWith("commandExecution") || msg.includes("exec_command")) return "command";
      if (msg.startsWith("dynamicToolCall")) return "tool";
      if (msg.startsWith("fileChange")) return "file";
      if (msg.startsWith("webSearch")) return "search";
      if (msg.startsWith("userMessage")) return "user";
      return "other";
    }

    function parseVerb(msg) {
      if (!msg) return null;
      if (msg.includes(" started")) return "started";
      if (msg.includes(" completed")) return "completed";
      return null;
    }

    function parseId(msg) {
      if (!msg) return null;
      const parts = msg.split(" ");
      return parts.length >= 2 ? parts[1] : null;
    }

    function formatTime(iso) {
      if (!iso) return "--:--:--";
      return new Date(iso).toISOString().slice(11, 19);
    }

    function shouldShow(ev) {
      const msg = ev.message || "";
      if (NOISE_MESSAGES.has(msg)) return false;
      if (ev.event === "other_message" && !msg.includes("error") && !msg.includes("stream_error")) return false;
      return true;
    }

    function matchesFilter(type) {
      if (currentFilter === "all") return true;
      if (currentFilter === "error") return type === "error";
      if (currentFilter === "message") return type === "message" || type === "user";
      if (currentFilter === "reasoning") return type === "reasoning";
      if (currentFilter === "command") return type === "command";
      if (currentFilter === "tool") return type === "tool";
      if (currentFilter === "file") return type === "file";
      return true;
    }

    function typeLabel(type) {
      const labels = {
        message: "Agent Message", reasoning: "Reasoning", command: "Command",
        tool: "Tool Call", file: "File Change", turn: "Turn", error: "Error",
        search: "Web Search", token: "Tokens", user: "User Prompt", other: "Event",
      };
      return labels[type] || "Event";
    }

    function contentClass(type) {
      const map = {
        message: "content-message", reasoning: "content-reasoning", command: "content-command",
        tool: "content-tool", file: "content-file", error: "content-error", user: "content-user",
      };
      return map[type] || "content-command";
    }

    function renderEvents() {
      const container = document.getElementById("logContainer");
      const visible = allEvents.filter(ev => shouldShow(ev));
      const filtered = visible.filter(ev => matchesFilter(classifyEvent(ev)));

      document.getElementById("eventCount").textContent = String(visible.length);
      document.getElementById("shownCount").textContent = String(filtered.length);

      container.innerHTML = "";

      if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="empty-icon">⌛</span><p>No events yet. Waiting for agent activity...</p></div>';
        return;
      }

      // Newest first
      const ordered = [...filtered].reverse();
      let lastTurn = null;
      for (const ev of ordered) {
        const type = classifyEvent(ev);
        const verb = parseVerb(ev.message);
        const id = parseId(ev.message);

        // Turn divider
        if (type === "turn") {
          const label = verb === "started" ? "Turn Started" : "Turn Completed";
          const div = document.createElement("div");
          div.className = "turn-divider";
          div.innerHTML = '<span>' + label + ' — ' + formatTime(ev.at) + '</span>';
          container.appendChild(div);
          lastTurn = ev;
          continue;
        }

        const entry = document.createElement("div");
        entry.className = "log-entry" + (ev._new ? " highlight" : "");

        let html = '<div class="log-header">';
        html += '<span class="log-time">' + formatTime(ev.at) + '</span>';
        html += '<span class="log-type type-' + type + '">' + typeLabel(type) + '</span>';
        if (verb) html += '<span class="log-verb">' + verb + '</span>';
        if (id && id.length < 60) html += '<span class="log-id">' + id.substring(0, 24) + '</span>';
        html += '</div>';

        if (ev.content) {
          html += '<div class="log-content ' + contentClass(type) + '">' + escapeHtml(ev.content) + '</div>';
        } else if (type === "token" && ev.usage) {
          html += '<div class="log-message" style="color:var(--text-dim);font-size:12px;font-family:var(--mono)">';
          html += 'IN ' + formatNumber(ev.usage.inputTokens) + ' / OUT ' + formatNumber(ev.usage.outputTokens) + ' / TTL ' + formatNumber(ev.usage.totalTokens);
          html += '</div>';
        }

        entry.innerHTML = html;
        container.appendChild(entry);
      }

      if (autoScroll) {
        document.getElementById("scrollAnchor").scrollIntoView({ behavior: "smooth" });
      }
    }

    function copyLogs() {
      const visible = allEvents.filter(ev => shouldShow(ev));
      const filtered = visible.filter(ev => matchesFilter(classifyEvent(ev)));
      const lines = filtered.map(ev => {
        const type = classifyEvent(ev);
        const time = formatTime(ev.at);
        const label = typeLabel(type).toUpperCase();
        let line = '[' + time + '] [' + label + '] ' + (ev.message || '');
        if (ev.content) line += '\n' + ev.content;
        return line;
      });
      const header = '=== Symphony Logs: ' + ISSUE + ' (' + new Date().toISOString() + ') ===';
      const text = header + '\n' + lines.join('\n---\n') + '\n=== End of Logs ===';
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copyLogsBtn');
        btn.innerHTML = '<span class="icon" style="font-size:16px">✓</span> Copied!';
        setTimeout(() => { btn.innerHTML = '<span class="icon" style="font-size:16px">⧉</span> Copy Logs'; }, 2000);
      });
    }

    function escapeHtml(str) {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    }

    function formatNumber(n) {
      return new Intl.NumberFormat("en-US").format(Number(n || 0));
    }

    function scrollToBottom() {
      document.getElementById("scrollAnchor").scrollIntoView({ behavior: "smooth" });
      autoScroll = true;
      document.getElementById("autoScrollToggle").checked = true;
    }

    async function loadEvents() {
      try {
        const resp = await fetch("/api/v1/" + encodeURIComponent(ISSUE));
        if (!resp.ok) return;
        const detail = await resp.json();

        document.getElementById("issueTitle").textContent = detail.title || ISSUE;
        const badge = document.getElementById("statusBadge");
        badge.textContent = (detail.status || "unknown").toUpperCase();
        badge.className = "badge " + (detail.status === "running" ? "badge-live" : "badge-id");

        const events = Array.isArray(detail.recentEvents) ? [...detail.recentEvents].reverse() : [];
        const isNew = events.length > lastEventCount;
        if (isNew) {
          for (let i = lastEventCount; i < events.length; i++) {
            events[i]._new = true;
          }
        }
        lastEventCount = events.length;
        allEvents = events;
        renderEvents();
      } catch (e) {
        console.error("Failed to load events:", e);
      }
    }

    // Filter buttons
    document.querySelectorAll("[data-filter]").forEach(btn => {
      btn.addEventListener("click", () => {
        currentFilter = btn.dataset.filter;
        document.querySelectorAll("[data-filter]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderEvents();
      });
    });

    // Auto-scroll toggle
    document.getElementById("autoScrollToggle").addEventListener("change", (e) => {
      autoScroll = e.target.checked;
    });

    // Show scroll-to-bottom when not at the bottom
    window.addEventListener("scroll", () => {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 100;
      document.getElementById("scrollToBottom").classList.toggle("visible", !nearBottom && allEvents.length > 10);
      if (nearBottom) autoScroll = true;
    });

    // Initial load + polling
    loadEvents();
    setInterval(loadEvents, 3000);
  </script>
</body>
</html>`;
}
