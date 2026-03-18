export function logsStyles(): string {
  return `${baseVars()}${headerStyles()}${logEntryStyles()}${scrollStyles()}`;
}

function baseVars(): string {
  return `
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
    a:hover { text-decoration: underline; }`;
}

function headerStyles(): string {
  return `
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
    .back-link { font-size: 13px; color: var(--text-dim); display: flex; align-items: center; gap: 4px; }
    .back-link:hover { color: var(--primary); }`;
}

function logEntryStyles(): string {
  return `
    .log-container { padding: 8px 0; max-width: 100%; }
    .log-entry { padding: 10px 24px; border-bottom: 1px solid var(--border); transition: background 0.15s; }
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
    .turn-divider::before, .turn-divider::after { content: ""; flex: 1; height: 1px; background: var(--border); }
    .turn-divider span {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      color: var(--text-dim); letter-spacing: 1px; white-space: nowrap;
    }
    .empty-state { text-align: center; padding: 80px 24px; color: var(--text-dim); }
    .empty-icon { font-size: 48px; margin-bottom: 16px; display: block; }`;
}

function scrollStyles(): string {
  return `
    .scroll-anchor { height: 1px; }
    .auto-scroll-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 100;
      background: var(--primary); color: #fff; border: none; padding: 8px 16px;
      border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: none; align-items: center; gap: 6px;
    }
    .auto-scroll-btn.visible { display: flex; }`;
}
