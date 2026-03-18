export function dashboardStyles(): string {
  return `${baseStyles()}${layoutStyles()}${cardStyles()}${detailPanelStyles()}${utilityStyles()}`;
}

function baseStyles(): string {
  return `
    :root {
      --primary: #bb4a31;
      --background: #fdfbf8;
      --panel: #ffffff;
      --border: #e4d6d3;
      --text: #0f172a;
      --muted: #64748b;
      --success: #16a34a;
      --warning: #d97706;
      --danger: #dc2626;
      --mono: ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }

    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; }
    body {
      background: var(--background); color: var(--text);
      font-family: var(--sans); display: flex; overflow: hidden;
    }
    .icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 1.25em; line-height: 1; font-style: normal;
    }`;
}

function layoutStyles(): string {
  return `
    aside {
      width: 4rem; border-right: 1px solid var(--border); background: var(--panel);
      padding: 1rem 0.5rem; display: flex; flex-direction: column; align-items: center;
      gap: 0.75rem; z-index: 10;
    }
    aside nav { display: flex; flex-direction: column; gap: 0.75rem; align-items: center; flex: 1; }
    aside button {
      border: 0; border-radius: 0.5rem; background: transparent;
      color: #64748b; cursor: pointer; padding: 0.35rem;
    }
    aside button:hover { color: var(--primary); background: #f5ece8; }
    main { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
    header {
      height: 4rem; padding: 0 1.25rem; border-bottom: 1px solid var(--border);
      background: rgba(255,255,255,0.9); backdrop-filter: blur(10px);
      display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-shrink: 0;
    }
    #filterNav { display: flex; gap: 0.25rem; background: #f1f5f9; padding: 0.2rem; border-radius: 0.5rem; }
    #filterNav .filter-button {
      border: 0; border-radius: 0.4rem; background: transparent; color: #64748b;
      font-size: 0.82rem; padding: 0.45rem 0.8rem; cursor: pointer; font-weight: 600;
    }
    #filterNav .filter-button.is-active {
      background: #ffffff; color: #0f172a; box-shadow: 0 1px 2px rgba(15,23,42,0.12);
    }
    #searchWrap { position: relative; }
    #searchWrap .icon { position: absolute; top: 50%; left: 0.65rem; transform: translateY(-50%); color: #94a3b8; }
    #searchInput {
      width: 16rem; border: 1px solid var(--border); border-radius: 0.5rem;
      background: #f8fafc; padding: 0.55rem 0.75rem 0.55rem 2rem; font-size: 0.84rem; outline: none;
    }
    #searchInput:focus { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(187,74,49,0.18); }
    #refreshButton {
      border: 0; border-radius: 0.5rem; background: var(--primary); color: #fff;
      padding: 0.55rem 0.9rem; font-size: 0.84rem; font-weight: 700; cursor: pointer;
      display: inline-flex; align-items: center; gap: 0.35rem;
    }
    #refreshButton:hover { filter: brightness(0.95); }
    section {
      height: 3.5rem; border-bottom: 1px solid var(--border); background: var(--panel);
      padding: 0 1.25rem; display: flex; align-items: center; justify-content: space-between;
      gap: 1rem; flex-shrink: 0; font-family: var(--mono); font-size: 0.81rem;
      color: var(--muted); white-space: nowrap; overflow-x: auto;
    }
    #boardScroll { flex: 1; overflow: auto; display: flex; align-items: flex-start; gap: 1rem; padding: 1rem; }
    .dot-grid { background-image: radial-gradient(#e4d6d3 0.5px, transparent 0.5px); background-size: 20px 20px; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #e4d6d3; border-radius: 10px; }
    .kanban-column { min-width: 320px; max-width: 320px; display: flex; flex-direction: column; gap: 0.75rem; }
    #queuedColumn, #runningColumn, #retryingColumn, #completedColumn {
      display: flex; flex-direction: column; gap: 0.75rem;
    }`;
}

function cardStyles(): string {
  return `
    .issue-card {
      background: #fff; border: 1px solid var(--border); border-radius: 0.75rem;
      padding: 0.75rem; cursor: pointer; box-shadow: 0 1px 3px rgba(2,6,23,0.06);
    }
    .issue-card:hover { box-shadow: 0 8px 20px rgba(2,6,23,0.08); }
    .issue-card-running { border-color: rgba(187,74,49,0.35); box-shadow: 0 1px 6px rgba(187,74,49,0.15); }
    .issue-card-retrying { border-color: rgba(217,119,6,0.35); }
    .issue-head { display: flex; justify-content: space-between; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem; }
    .issue-id {
      font-family: var(--mono); font-size: 0.7rem; font-weight: 700; color: #475569;
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 999px; padding: 0.15rem 0.45rem;
    }
    .issue-priority {
      font-size: 0.64rem; font-weight: 700; border-radius: 999px;
      text-transform: uppercase; padding: 0.15rem 0.45rem;
    }
    .issue-priority-high { color: #b91c1c; background: #fee2e2; }
    .issue-priority-medium { color: #b45309; background: #fef3c7; }
    .issue-priority-low { color: #475569; background: #e2e8f0; }
    .issue-title { margin: 0; font-size: 0.88rem; line-height: 1.3; font-weight: 700; color: #0f172a; }
    .issue-labels { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.45rem; margin-bottom: 0.45rem; }
    .issue-label {
      font-size: 0.64rem; color: #475569; background: #f1f5f9;
      border-radius: 0.35rem; padding: 0.1rem 0.35rem; text-transform: lowercase;
    }
    .issue-meta {
      margin-top: 0.45rem; font-size: 0.72rem; color: #475569;
      display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;
    }
    .issue-meta-note { font-style: italic; color: #64748b; }
    .issue-warning { color: var(--warning); font-size: 0.9rem; font-weight: 700; }
    .empty-card {
      background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 0.5rem;
      color: #64748b; padding: 1rem; text-align: center; font-size: 0.88rem;
    }`;
}

function detailPanelStyles(): string {
  return `
    .detail-panel-hidden { transform: translateX(100%); pointer-events: none; }
    .detail-panel-visible { transform: translateX(0); }
    #detailPanel {
      position: fixed; right: 0; top: 0; bottom: 0; width: min(30rem,100vw);
      background: #fff; border-left: 1px solid var(--border);
      box-shadow: -8px 0 24px rgba(15,23,42,0.18); transition: transform 0.3s ease;
      display: flex; flex-direction: column; z-index: 40;
    }
    #detailPanel input, #detailPanel select {
      width: 100%; border: 1px solid var(--border); border-radius: 0.5rem;
      background: #f8fafc; padding: 0.45rem 0.55rem; font-size: 0.85rem;
    }
    #detailPanel pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    #detailAttemptTabs {
      display: flex; gap: 0.45rem; padding: 0.5rem 1rem;
      background: #fff; border-bottom: 1px solid var(--border); overflow-x: auto;
    }
    .attempt-tab {
      border: 1px solid #cbd5e1; background: #f8fafc; color: #475569;
      border-radius: 0.5rem; font-family: var(--mono); font-size: 0.75rem;
      padding: 0.38rem 0.65rem; cursor: pointer;
    }
    .attempt-tab.is-active { border-color: var(--primary); background: var(--primary); color: #fff; }
    .detail-badge {
      border-radius: 999px; padding: 0.22rem 0.58rem; font-size: 0.68rem;
      font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em;
    }
    .detail-priority-high { background: #fee2e2; color: #b91c1c; }
    .detail-priority-medium { background: #fef3c7; color: #b45309; }
    .detail-priority-normal { background: #e2e8f0; color: #334155; }
    .detail-status-running { background: #dcfce7; color: #166534; }
    .detail-status-retrying { background: #fef3c7; color: #92400e; }
    .detail-status-completed { background: #e2e8f0; color: #334155; }
    .detail-status-error { background: #fee2e2; color: #991b1b; }
    .detail-status-default { background: #dbeafe; color: #1d4ed8; }
    .detail-model { background: #f5ece8; color: var(--primary); }
    .detail-pending { background: #fef3c7; color: #92400e; }
    .detail-label {
      font-size: 0.75rem; background: #f8fafc; color: #475569;
      border: 1px solid #e2e8f0; border-radius: 0.4rem; padding: 0.2rem 0.42rem;
      text-transform: lowercase;
    }`;
}

function utilityStyles(): string {
  return `
    @media (max-width: 900px) { #searchInput { width: 11.5rem; } }
    .line-clamp-1 { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
    .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }`;
}
