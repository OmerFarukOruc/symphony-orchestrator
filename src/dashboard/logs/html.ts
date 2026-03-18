export function logsHtml(escaped: string): string {
  return `${headerHtml(escaped)}${filtersHtml()}${containerHtml()}`;
}

function headerHtml(escaped: string): string {
  return `
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
  </div>`;
}

function filtersHtml(): string {
  return `
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
  </div>`;
}

function containerHtml(): string {
  return `
  <div class="log-container" id="logContainer"></div>
  <div class="scroll-anchor" id="scrollAnchor"></div>
  <button class="auto-scroll-btn" id="scrollToBottom" onclick="scrollToBottom()">
    <span class="icon" style="font-size:16px">⇣</span>
    Scroll to bottom
  </button>`;
}
