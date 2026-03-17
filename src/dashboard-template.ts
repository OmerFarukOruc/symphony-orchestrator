export function renderDashboardTemplate(): string {
  return `<!DOCTYPE html>
<html class="light" lang="en">
<head>
  <meta charset="utf-8"/>
  <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
  <title>Symphony | AI Agent Orchestration</title>
  <style>
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

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      height: 100%;
    }

    body {
      background: var(--background);
      color: var(--text);
      font-family: var(--sans);
      display: flex;
      overflow: hidden;
    }

    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.25em;
      line-height: 1;
      font-style: normal;
    }

    aside {
      width: 4rem;
      border-right: 1px solid var(--border);
      background: var(--panel);
      padding: 1rem 0.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      z-index: 10;
    }

    aside nav {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      align-items: center;
      flex: 1;
    }

    aside button {
      border: 0;
      border-radius: 0.5rem;
      background: transparent;
      color: #64748b;
      cursor: pointer;
      padding: 0.35rem;
    }

    aside button:hover {
      color: var(--primary);
      background: #f5ece8;
    }

    main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    header {
      height: 4rem;
      padding: 0 1.25rem;
      border-bottom: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-shrink: 0;
    }

    #filterNav {
      display: flex;
      gap: 0.25rem;
      background: #f1f5f9;
      padding: 0.2rem;
      border-radius: 0.5rem;
    }

    #filterNav .filter-button {
      border: 0;
      border-radius: 0.4rem;
      background: transparent;
      color: #64748b;
      font-size: 0.82rem;
      padding: 0.45rem 0.8rem;
      cursor: pointer;
      font-weight: 600;
    }

    #filterNav .filter-button.is-active {
      background: #ffffff;
      color: #0f172a;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
    }

    #searchWrap {
      position: relative;
    }

    #searchWrap .icon {
      position: absolute;
      top: 50%;
      left: 0.65rem;
      transform: translateY(-50%);
      color: #94a3b8;
    }

    #searchInput {
      width: 16rem;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      background: #f8fafc;
      padding: 0.55rem 0.75rem 0.55rem 2rem;
      font-size: 0.84rem;
      outline: none;
    }

    #searchInput:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(187, 74, 49, 0.18);
    }

    #refreshButton {
      border: 0;
      border-radius: 0.5rem;
      background: var(--primary);
      color: #fff;
      padding: 0.55rem 0.9rem;
      font-size: 0.84rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    #refreshButton:hover {
      filter: brightness(0.95);
    }

    section {
      height: 3.5rem;
      border-bottom: 1px solid var(--border);
      background: var(--panel);
      padding: 0 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-shrink: 0;
      font-family: var(--mono);
      font-size: 0.81rem;
      color: var(--muted);
      white-space: nowrap;
      overflow-x: auto;
    }

    #boardScroll {
      flex: 1;
      overflow: auto;
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      padding: 1rem;
    }

    .dot-grid {
      background-image: radial-gradient(#e4d6d3 0.5px, transparent 0.5px);
      background-size: 20px 20px;
    }

    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background: #e4d6d3;
      border-radius: 10px;
    }

    .kanban-column {
      min-width: 320px;
      max-width: 320px;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    #queuedColumn,
    #runningColumn,
    #retryingColumn,
    #completedColumn {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .issue-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 0.75rem;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(2, 6, 23, 0.06);
    }

    .issue-card:hover {
      box-shadow: 0 8px 20px rgba(2, 6, 23, 0.08);
    }

    .issue-card-running {
      border-color: rgba(187, 74, 49, 0.35);
      box-shadow: 0 1px 6px rgba(187, 74, 49, 0.15);
    }

    .issue-card-retrying {
      border-color: rgba(217, 119, 6, 0.35);
    }

    .issue-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 0.4rem;
    }

    .issue-id {
      font-family: var(--mono);
      font-size: 0.7rem;
      font-weight: 700;
      color: #475569;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 999px;
      padding: 0.15rem 0.45rem;
    }

    .issue-priority {
      font-size: 0.64rem;
      font-weight: 700;
      border-radius: 999px;
      text-transform: uppercase;
      padding: 0.15rem 0.45rem;
    }

    .issue-priority-high {
      color: #b91c1c;
      background: #fee2e2;
    }

    .issue-priority-medium {
      color: #b45309;
      background: #fef3c7;
    }

    .issue-priority-low {
      color: #475569;
      background: #e2e8f0;
    }

    .issue-title {
      margin: 0;
      font-size: 0.88rem;
      line-height: 1.3;
      font-weight: 700;
      color: #0f172a;
    }

    .issue-labels {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin-top: 0.45rem;
      margin-bottom: 0.45rem;
    }

    .issue-label {
      font-size: 0.64rem;
      color: #475569;
      background: #f1f5f9;
      border-radius: 0.35rem;
      padding: 0.1rem 0.35rem;
      text-transform: lowercase;
    }

    .issue-meta {
      margin-top: 0.45rem;
      font-size: 0.72rem;
      color: #475569;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }

    .issue-meta-note {
      font-style: italic;
      color: #64748b;
    }

    .issue-warning {
      color: var(--warning);
      font-size: 0.9rem;
      font-weight: 700;
    }

    .empty-card {
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
      border-radius: 0.5rem;
      color: #64748b;
      padding: 1rem;
      text-align: center;
      font-size: 0.88rem;
    }

    .detail-panel-hidden {
      transform: translateX(100%);
      pointer-events: none;
    }

    .detail-panel-visible {
      transform: translateX(0);
    }

    #detailPanel {
      position: fixed;
      right: 0;
      top: 0;
      bottom: 0;
      width: min(30rem, 100vw);
      background: #ffffff;
      border-left: 1px solid var(--border);
      box-shadow: -8px 0 24px rgba(15, 23, 42, 0.18);
      transition: transform 0.3s ease;
      display: flex;
      flex-direction: column;
      z-index: 40;
    }

    #detailPanel input,
    #detailPanel select {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      background: #f8fafc;
      padding: 0.45rem 0.55rem;
      font-size: 0.85rem;
    }

    #detailPanel pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    #detailAttemptTabs {
      display: flex;
      gap: 0.45rem;
      padding: 0.5rem 1rem;
      background: #fff;
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
    }

    .attempt-tab {
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #475569;
      border-radius: 0.5rem;
      font-family: var(--mono);
      font-size: 0.75rem;
      padding: 0.38rem 0.65rem;
      cursor: pointer;
    }

    .attempt-tab.is-active {
      border-color: var(--primary);
      background: var(--primary);
      color: #fff;
    }

    .detail-badge {
      border-radius: 999px;
      padding: 0.22rem 0.58rem;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .detail-priority-high {
      background: #fee2e2;
      color: #b91c1c;
    }

    .detail-priority-medium {
      background: #fef3c7;
      color: #b45309;
    }

    .detail-priority-normal {
      background: #e2e8f0;
      color: #334155;
    }

    .detail-status-running {
      background: #dcfce7;
      color: #166534;
    }

    .detail-status-retrying {
      background: #fef3c7;
      color: #92400e;
    }

    .detail-status-completed {
      background: #e2e8f0;
      color: #334155;
    }

    .detail-status-error {
      background: #fee2e2;
      color: #991b1b;
    }

    .detail-status-default {
      background: #dbeafe;
      color: #1d4ed8;
    }

    .detail-model {
      background: #f5ece8;
      color: var(--primary);
    }

    .detail-pending {
      background: #fef3c7;
      color: #92400e;
    }

    .detail-label {
      font-size: 0.75rem;
      background: #f8fafc;
      color: #475569;
      border: 1px solid #e2e8f0;
      border-radius: 0.4rem;
      padding: 0.2rem 0.42rem;
      text-transform: lowercase;
    }

    @media (max-width: 900px) {
      #searchInput {
        width: 11.5rem;
      }
    }

    .line-clamp-1 {
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .line-clamp-2 {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  </style>
</head>
<body class="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 antialiased overflow-hidden h-screen flex">
  <aside class="w-16 flex flex-col items-center py-6 border-r border-border-light bg-panel-light dark:bg-background-dark z-50">
    <div class="mb-8">
      <div class="size-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
        <span class="icon text-2xl">✦</span>
      </div>
    </div>
    <nav class="flex flex-col gap-6 flex-1">
      <button class="text-primary hover:bg-primary/10 p-2 rounded-lg transition-colors">
        <span class="icon text-2xl">⌂</span>
      </button>
      <button class="text-slate-400 hover:text-primary p-2 rounded-lg transition-colors">
        <span class="icon text-2xl">▦</span>
      </button>
      <button class="text-slate-400 hover:text-primary p-2 rounded-lg transition-colors">
        <span class="icon text-2xl">◴</span>
      </button>
      <div class="h-px w-8 bg-border-light mx-auto"></div>
      <button class="text-slate-400 hover:text-primary p-2 rounded-lg transition-colors">
        <span class="icon text-2xl">⚙</span>
      </button>
    </nav>
    <div class="mt-auto">
      <div class="relative">
        <span class="icon text-green-500 text-2xl">●</span>
        <span class="absolute top-0 right-0 block h-2 w-2 rounded-full bg-green-500 ring-2 ring-white animate-pulse"></span>
      </div>
    </div>
  </aside>

  <main class="flex-1 flex flex-col h-full dot-grid overflow-hidden">
    <header class="h-16 border-b border-border-light bg-panel-light/80 backdrop-blur-md px-6 flex items-center justify-between z-40 shrink-0">
      <div class="flex items-center gap-8">
        <h1 class="text-xl font-bold tracking-tight text-slate-900">Symphony</h1>
        <nav class="flex gap-1 bg-slate-100 p-1 rounded-lg" id="filterNav">
          <button class="filter-button is-active" data-filter="all">All</button>
          <button class="filter-button" data-filter="running">Running</button>
          <button class="filter-button" data-filter="retrying">Retrying</button>
          <button class="filter-button" data-filter="completed">Completed</button>
        </nav>
      </div>
      <div class="flex items-center gap-4">
        <div class="relative" id="searchWrap">
          <span class="icon absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">⌕</span>
          <input class="pl-10 pr-4 py-2 w-64 border-border-light rounded-lg bg-slate-50 focus:ring-primary focus:border-primary text-sm" id="searchInput" placeholder="Search agents..." type="text"/>
        </div>
        <button class="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20" id="refreshButton">
          <span class="icon text-lg">↻</span>
          Refresh
        </button>
      </div>
    </header>

    <section class="h-14 border-b border-border-light bg-white px-6 flex items-center justify-between text-[13px] font-mono whitespace-nowrap overflow-x-auto gap-8 shrink-0">
      <div class="flex items-center gap-6">
        <div class="flex gap-4">
          <span class="text-slate-500">Status:
            <span class="text-blue-600 font-bold" id="queuedCount">0Q</span> /
            <span class="text-green-600 font-bold" id="runningCount">0R</span> /
            <span class="text-amber-600 font-bold" id="retryingCount">0E</span> /
            <span class="text-slate-900 font-bold" id="completedCount">0C</span>
          </span>
        </div>
        <div class="w-px h-4 bg-border-light"></div>
        <div class="flex gap-4">
          <span class="text-slate-500">Tokens:
            <span class="text-slate-900" id="inputTokensBar">IN 0</span>
            <span class="text-slate-400">|</span>
            <span class="text-slate-900" id="outputTokensBar">OUT 0</span>
            <span class="text-slate-400">|</span>
            <span class="text-primary font-bold" id="totalTokensBar">TTL 0</span>
          </span>
        </div>
      </div>
      <div class="flex items-center gap-6">
        <div class="flex gap-4">
          <span class="text-slate-500">Uptime: <span class="text-slate-900 font-medium" id="uptimeValue">0s</span></span>
          <span class="text-slate-500">Rate Limit: <span class="text-green-600 font-bold" id="rateLimitValue">N/A</span></span>
        </div>
        <div class="w-px h-4 bg-border-light"></div>
        <div class="flex items-center gap-2 text-primary font-bold">
          <span class="icon text-lg">⏱</span>
          <span id="generatedAtCompact">00:00</span>
        </div>
      </div>
    </section>

    <div class="flex-1 overflow-auto p-6 flex gap-6 items-start" id="boardScroll">
      <div class="kanban-column flex flex-col gap-4">
        <div class="flex items-center justify-between px-2">
          <div class="flex items-center gap-2">
            <span class="size-2 rounded-full bg-blue-500"></span>
            <h3 class="font-bold text-sm uppercase tracking-wider text-slate-500" id="queuedHeading">Queued (0)</h3>
          </div>
          <button class="text-slate-400 hover:text-slate-600"><span class="icon">⋯</span></button>
        </div>
        <div class="flex flex-col gap-3" id="queuedColumn"></div>
      </div>

      <div class="kanban-column flex flex-col gap-4">
        <div class="flex items-center justify-between px-2">
          <div class="flex items-center gap-2">
            <span class="size-2 rounded-full bg-green-500 animate-pulse"></span>
            <h3 class="font-bold text-sm uppercase tracking-wider text-slate-500" id="runningHeading">Running (0)</h3>
          </div>
          <button class="text-slate-400 hover:text-slate-600"><span class="icon">⋯</span></button>
        </div>
        <div class="flex flex-col gap-3" id="runningColumn"></div>
      </div>

      <div class="kanban-column flex flex-col gap-4">
        <div class="flex items-center justify-between px-2">
          <div class="flex items-center gap-2">
            <span class="size-2 rounded-full bg-amber-500"></span>
            <h3 class="font-bold text-sm uppercase tracking-wider text-slate-500" id="retryingHeading">Retrying (0)</h3>
          </div>
          <button class="text-slate-400 hover:text-slate-600"><span class="icon">⋯</span></button>
        </div>
        <div class="flex flex-col gap-3" id="retryingColumn"></div>
      </div>

      <div class="kanban-column flex flex-col gap-4">
        <div class="flex items-center justify-between px-2">
          <div class="flex items-center gap-2">
            <span class="size-2 rounded-full bg-slate-400"></span>
            <h3 class="font-bold text-sm uppercase tracking-wider text-slate-500" id="completedHeading">Completed (0)</h3>
          </div>
          <button class="text-slate-400 hover:text-slate-600"><span class="icon">⋯</span></button>
        </div>
        <div class="flex flex-col gap-3 opacity-80 hover:opacity-100 transition-opacity" id="completedColumn"></div>
      </div>
    </div>

    <aside class="fixed inset-y-0 right-0 w-[480px] bg-panel-light border-l border-border-light shadow-2xl z-50 transition-transform duration-300 detail-panel-hidden flex flex-col" id="detailPanel">
      <div class="h-16 border-b border-border-light flex items-center justify-between px-6 bg-slate-50 shrink-0">
        <div class="flex items-center gap-3">
          <span class="font-mono font-bold text-slate-900" id="detailIdentifier">Issue</span>
          <a class="text-blue-500 hover:text-blue-700" href="#" id="detailExternalLink" target="_blank" rel="noreferrer">
            <span class="icon text-lg">↗</span>
          </a>
        </div>
        <button class="text-slate-400 hover:text-slate-900" id="closeDetailButton">
          <span class="icon">×</span>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto p-8">
        <div class="mb-8">
          <div class="flex gap-2 mb-4" id="detailBadges"></div>
          <h2 class="text-2xl font-bold text-slate-900 leading-tight mb-4" id="detailTitle">Select an issue</h2>
          <div class="grid grid-cols-2 gap-y-4 text-sm">
            <div>
              <p class="text-slate-400 text-xs uppercase font-bold tracking-widest mb-1">Creator</p>
              <div class="flex items-center gap-2">
                <div class="size-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">LN</div>
                <span class="font-medium" id="detailCreator">Linear</span>
              </div>
            </div>
            <div>
              <p class="text-slate-400 text-xs uppercase font-bold tracking-widest mb-1">Assigned Agent</p>
              <div class="flex items-center gap-2">
                <div class="size-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <span class="icon text-sm text-primary">◉</span>
                </div>
                <span class="font-medium" id="detailAgent">Symphony Worker</span>
              </div>
            </div>
          </div>
        </div>

        <div class="mb-8">
          <p class="text-slate-400 text-xs uppercase font-bold tracking-widest mb-3">Workspace</p>
          <div class="font-mono text-xs bg-slate-100 p-3 rounded-lg border border-slate-200 text-slate-600 truncate mb-3" id="detailWorkspace">No workspace yet</div>
          <div class="flex flex-wrap gap-2" id="detailLabels"></div>
        </div>

        <div class="mb-8">
          <div class="flex items-center justify-between mb-4">
            <p class="text-slate-400 text-xs uppercase font-bold tracking-widest">Model Routing</p>
            <span class="text-[11px] font-mono text-slate-500" id="detailModelSource">default</span>
          </div>
          <div class="space-y-3">
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2" for="detailModelInput">Model</label>
              <input class="w-full border-border-light rounded-lg bg-slate-50 focus:ring-primary focus:border-primary text-sm font-mono" id="detailModelInput" type="text" value="gpt-5.4"/>
            </div>
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2" for="detailReasoningSelect">Reasoning</label>
              <select class="w-full border-border-light rounded-lg bg-slate-50 focus:ring-primary focus:border-primary text-sm" id="detailReasoningSelect">
                <option value="">inherit</option>
                <option value="none">none</option>
                <option value="minimal">minimal</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="xhigh">xhigh</option>
              </select>
            </div>
            <p class="text-[11px] text-slate-500" id="detailModelHelp">Saved model settings apply on the next run. The active worker keeps its current model.</p>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-4 mb-8">
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
            <p class="text-slate-400 text-[10px] uppercase font-bold mb-1">Turns</p>
            <p class="font-mono text-lg font-bold text-slate-900" id="detailTurns">0</p>
          </div>
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
            <p class="text-slate-400 text-[10px] uppercase font-bold mb-1">Tokens</p>
            <p class="font-mono text-lg font-bold text-slate-900" id="detailTokens">0</p>
          </div>
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
            <p class="text-slate-400 text-[10px] uppercase font-bold mb-1">Duration</p>
            <p class="font-mono text-lg font-bold text-slate-900" id="detailDuration">0s</p>
          </div>
        </div>

        <div class="mb-8">
          <div class="flex items-center justify-between mb-4">
            <p class="text-slate-400 text-xs uppercase font-bold tracking-widest">Agent Activity</p>
            <a class="text-primary text-xs font-bold hover:underline" id="focusLogsButton" target="_blank" rel="noreferrer" href="#">View Logs ↗</a>
          </div>
          <div class="space-y-4 font-mono text-xs" id="detailActivity"></div>
        </div>

        <div class="border-t border-border-light pt-6">
          <p class="text-slate-400 text-xs uppercase font-bold tracking-widest mb-4">Retry History</p>
          <div class="text-sm text-slate-500" id="detailRetryHistory">No previous attempts for this session.</div>
        </div>
      </div>
      <div class="h-20 border-t border-border-light bg-slate-50 p-6 flex items-center justify-end gap-3 shrink-0">
        <button class="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors" id="pauseButton" type="button">Save Model</button>
        <button class="px-6 py-2 text-sm font-bold bg-primary text-white rounded-lg shadow-lg shadow-primary/20 hover:bg-primary/90" id="refreshDetailButton" type="button">Refresh Detail</button>
      </div>
    </aside>
  </main>

  <script>
    const state = {
      selectedIssue: null,
      selectedAttemptId: null,
      currentFilter: "all",
      search: "",
      snapshot: null,
    };

    const els = {
      filterNav: document.getElementById("filterNav"),
      searchInput: document.getElementById("searchInput"),
      refreshButton: document.getElementById("refreshButton"),
      queuedCount: document.getElementById("queuedCount"),
      runningCount: document.getElementById("runningCount"),
      retryingCount: document.getElementById("retryingCount"),
      completedCount: document.getElementById("completedCount"),
      inputTokensBar: document.getElementById("inputTokensBar"),
      outputTokensBar: document.getElementById("outputTokensBar"),
      totalTokensBar: document.getElementById("totalTokensBar"),
      uptimeValue: document.getElementById("uptimeValue"),
      rateLimitValue: document.getElementById("rateLimitValue"),
      generatedAtCompact: document.getElementById("generatedAtCompact"),
      queuedHeading: document.getElementById("queuedHeading"),
      runningHeading: document.getElementById("runningHeading"),
      retryingHeading: document.getElementById("retryingHeading"),
      completedHeading: document.getElementById("completedHeading"),
      queuedColumn: document.getElementById("queuedColumn"),
      runningColumn: document.getElementById("runningColumn"),
      retryingColumn: document.getElementById("retryingColumn"),
      completedColumn: document.getElementById("completedColumn"),
      detailPanel: document.getElementById("detailPanel"),
      detailIdentifier: document.getElementById("detailIdentifier"),
      detailExternalLink: document.getElementById("detailExternalLink"),
      closeDetailButton: document.getElementById("closeDetailButton"),
      detailBadges: document.getElementById("detailBadges"),
      detailAttemptTabs: null,
      detailTitle: document.getElementById("detailTitle"),
      detailCreator: document.getElementById("detailCreator"),
      detailAgent: document.getElementById("detailAgent"),
      detailWorkspace: document.getElementById("detailWorkspace"),
      detailLabels: document.getElementById("detailLabels"),
      detailModelInput: document.getElementById("detailModelInput"),
      detailReasoningSelect: document.getElementById("detailReasoningSelect"),
      detailModelSource: document.getElementById("detailModelSource"),
      detailModelHelp: document.getElementById("detailModelHelp"),
      detailTurns: document.getElementById("detailTurns"),
      detailTokens: document.getElementById("detailTokens"),
      detailDuration: document.getElementById("detailDuration"),
      detailActivity: document.getElementById("detailActivity"),
      detailRetryHistory: document.getElementById("detailRetryHistory"),
      focusLogsButton: document.getElementById("focusLogsButton"),
      refreshDetailButton: document.getElementById("refreshDetailButton"),
      pauseButton: document.getElementById("pauseButton"),
    };

    function formatNumber(value) {
      return new Intl.NumberFormat("en-US").format(Number(value || 0));
    }

    function formatCompactNumber(value) {
      const number = Number(value || 0);
      if (number >= 1000000) return (number / 1000000).toFixed(2).replace(/\\.00$/, "") + "M";
      if (number >= 1000) return (number / 1000).toFixed(1).replace(/\\.0$/, "") + "K";
      return String(number);
    }

    function formatDuration(secondsRunning) {
      const seconds = Math.max(0, Math.round(Number(secondsRunning || 0)));
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const remainingSeconds = seconds % 60;
      if (hours > 0) return hours + "h " + minutes + "m " + remainingSeconds + "s";
      if (minutes > 0) return minutes + "m " + remainingSeconds + "s";
      return remainingSeconds + "s";
    }

    function relativeTime(isoString) {
      if (!isoString) return "unknown";
      const diff = Date.now() - new Date(isoString).getTime();
      const seconds = Math.max(0, Math.round(diff / 1000));
      if (seconds < 60) return seconds + "s ago";
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return minutes + "m ago";
      const hours = Math.round(minutes / 60);
      return hours + "h ago";
    }

    function formatRateLimit(rateLimits) {
      if (!rateLimits || typeof rateLimits !== "object") return "N/A";
      const limit = Number(rateLimits.limit ?? rateLimits.total ?? 0);
      const remaining = Number(rateLimits.remaining ?? 0);
      if (!limit) return "N/A";
      return ((remaining / limit) * 100).toFixed(1) + "%";
    }

    function priorityLabel(priority) {
      if (priority === 1) return { label: "high", className: "issue-priority-high" };
      if (priority === 2) return { label: "medium", className: "issue-priority-medium" };
      if (priority === 3) return { label: "low", className: "issue-priority-low" };
      return { label: "none", className: "issue-priority-low" };
    }

    function statusBadge(status) {
      const normalized = String(status || "").toLowerCase();
      if (normalized.includes("running")) return "detail-status-running";
      if (normalized.includes("retry")) return "detail-status-retrying";
      if (normalized.includes("complete")) return "detail-status-completed";
      if (normalized.includes("fail") || normalized.includes("time")) return "detail-status-error";
      return "detail-status-default";
    }

    function cardForItem(item, column) {
      const priority = priorityLabel(item.priority);
      const tokenText = item.tokenUsage ? \`\${formatCompactNumber(item.tokenUsage.inputTokens)} / \${formatCompactNumber(item.tokenUsage.outputTokens)}\` : null;
      const wrapper = document.createElement("div");
      wrapper.className = "issue-card " + (column === "running" ? "issue-card-running" : column === "retrying" ? "issue-card-retrying" : "issue-card-default");

      const body = [];
      if (column === "retrying") {
        body.push('<div class="issue-meta"><span class="issue-warning">⚠</span><span class="issue-meta-note">retry pending</span></div>');
      }

      body.push(
        '<div class="issue-head">' +
          '<span class="issue-id">' + (item.identifier || "UNKNOWN") + '</span>' +
          '<span class="issue-priority ' + priority.className + '">' + priority.label + '</span>' +
        '</div>'
      );
      body.push('<h4 class="issue-title line-clamp-2">' + (item.title || item.identifier || "Untitled issue") + '</h4>');
      if (Array.isArray(item.labels) && item.labels.length > 0) {
        body.push('<div class="issue-labels">' + item.labels.slice(0, 3).map((label) => '<span class="issue-label">' + label + '</span>').join("") + '</div>');
      }
      if (column === "running") {
        body.push(
          '<div class="issue-meta">' +
            '<span>Attempt ' + String(item.attempt ?? 0) + '</span>' +
            '<span>' + (tokenText ? tokenText : "live") + '</span>' +
          '</div>' +
          '<div class="issue-meta-note line-clamp-1">' + (item.message || "Worker is actively processing this issue.") + '</div>' +
          '<div class="issue-meta">' +
            '<span>Worker live</span>' +
            '<span>' + relativeTime(item.updatedAt) + '</span>' +
          '</div>'
        );
      }
      if (column === "retrying") {
        body.push(
          '<div class="issue-meta">' +
            '<span>Attempt ' + String(item.attempt ?? 0) + '</span>' +
            '<span>' + relativeTime(item.updatedAt) + '</span>' +
          '</div>' +
          '<div class="issue-meta-note line-clamp-1">Reason: ' + (item.error || item.message || "Retry queued") + '</div>' +
          '<div class="issue-meta">' +
            '<span>Retry queued</span>' +
            '<span>' + (item.status || "retrying") + '</span>' +
          '</div>'
        );
      }
      if (column === "completed") {
        body.push('<div class="issue-meta"><span>' + (item.status || "completed") + '</span><span>' + relativeTime(item.updatedAt) + '</span></div>');
      } else {
        body.push(
          '<div class="issue-meta">' +
            '<span>' + (column === "running" ? "Worker live" : column === "retrying" ? "Retry queued" : "Tracker issue") + '</span>' +
            '<span>' + relativeTime(item.updatedAt) + '</span>' +
          '</div>'
        );
      }

      wrapper.innerHTML = body.join("");
      wrapper.addEventListener("click", () => openIssueDetail(item.identifier));
      return wrapper;
    }

    function emptyCard(message) {
      const div = document.createElement("div");
      div.className = "empty-card";
      div.textContent = message;
      return div;
    }

    function renderEventRow(event, index, container) {
      const row = document.createElement("div");
      row.className = "relative pl-6 border-l-2 border-slate-100 pb-4";
      
      const pin = document.createElement("span");
      pin.className = "absolute -left-[9px] top-0 size-4 rounded-full flex items-center justify-center border-2 border-white " + (index === 0 ? "bg-primary" : "bg-slate-200");
      row.appendChild(pin);
      
      const header = document.createElement("div");
      header.className = "flex justify-between text-slate-400 mb-1";
      
      const timeSpan = document.createElement("span");
      timeSpan.textContent = new Date(event.at).toISOString().slice(11, 19);
      header.appendChild(timeSpan);
      
      const eventBadge = document.createElement("span");
      eventBadge.className = "bg-slate-100 text-slate-700 px-1 rounded text-xs px-2 py-0.5";
      eventBadge.textContent = event.event;
      header.appendChild(eventBadge);
      
      row.appendChild(header);
      
      const msg = document.createElement("p");
      msg.className = "text-slate-700 " + (index === 0 ? "font-bold" : "");
      msg.textContent = event.message;
      row.appendChild(msg);
      
      if (event.content) {
        const contentBlock = document.createElement("div");
        contentBlock.className = "mt-2 relative";
        
        // Pick border color based on event type
        let borderColor = "border-slate-200";
        if (event.event.includes("agentMessage")) borderColor = "border-green-300";
        else if (event.event.includes("commandExecution")) borderColor = "border-blue-300";
        else if (event.event.includes("reasoning")) borderColor = "border-amber-300";
        else if (event.event.includes("dynamicToolCall")) borderColor = "border-purple-300";
        
        const pre = document.createElement("pre");
        pre.className = "text-xs text-slate-600 bg-slate-50 p-2 rounded border-l-4 " + borderColor + " overflow-x-auto whitespace-pre-wrap font-mono";
        
        // Collapse by default for older events
        if (index > 2) {
          pre.classList.add("max-h-32", "overflow-hidden", "relative", "cursor-pointer", "hover:bg-slate-100", "transition-colors");
          pre.title = "Click to expand full content";
          
          const gradient = document.createElement("div");
          gradient.className = "absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none";
          contentBlock.appendChild(gradient);
          
          pre.addEventListener("click", () => {
             pre.classList.remove("max-h-32", "overflow-hidden", "cursor-pointer", "hover:bg-slate-100");
             contentBlock.removeChild(gradient);
          });
        }
        
        pre.textContent = event.content;
        contentBlock.appendChild(pre);
        row.appendChild(contentBlock);
      }
      
      container.appendChild(row);
    }

    function filteredItems(items, column) {
      return (items || []).filter((item) => {
        if (state.currentFilter !== "all" && state.currentFilter !== column) return false;
        if (!state.search) return true;
        const haystack = [item.identifier, item.title, item.message, item.error, ...(item.labels || [])].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(state.search.toLowerCase());
      });
    }

    function renderColumn(container, heading, label, items, column) {
      const filtered = filteredItems(items, column);
      heading.textContent = label + " (" + String(items.length) + ")";
      container.innerHTML = "";
      if (filtered.length === 0) {
        container.appendChild(emptyCard("No " + label.toLowerCase() + " items."));
        return;
      }
      filtered.forEach((item) => container.appendChild(cardForItem(item, column)));
    }

    function renderSnapshot(snapshot) {
      state.snapshot = snapshot;
      els.queuedCount.textContent = String((snapshot.queued || []).length) + "Q";
      els.runningCount.textContent = String(snapshot.counts.running || 0) + "R";
      els.retryingCount.textContent = String(snapshot.counts.retrying || 0) + "E";
      els.completedCount.textContent = String((snapshot.completed || []).length) + "C";
      els.inputTokensBar.textContent = "IN " + formatCompactNumber(snapshot.codex_totals.input_tokens);
      els.outputTokensBar.textContent = "OUT " + formatCompactNumber(snapshot.codex_totals.output_tokens);
      els.totalTokensBar.textContent = "TTL " + formatCompactNumber(snapshot.codex_totals.total_tokens);
      els.uptimeValue.textContent = formatDuration(snapshot.codex_totals.seconds_running);
      els.rateLimitValue.textContent = formatRateLimit(snapshot.rate_limits);
      els.generatedAtCompact.textContent = new Date(snapshot.generated_at).toISOString().slice(11, 16);

      renderColumn(els.queuedColumn, els.queuedHeading, "Queued", snapshot.queued || [], "queued");
      renderColumn(els.runningColumn, els.runningHeading, "Running", snapshot.running || [], "running");
      renderColumn(els.retryingColumn, els.retryingHeading, "Retrying", snapshot.retrying || [], "retrying");
      renderColumn(els.completedColumn, els.completedHeading, "Completed", snapshot.completed || [], "completed");
    }

    function openDetailPanel() {
      els.detailPanel.classList.remove("detail-panel-hidden");
      els.detailPanel.classList.add("detail-panel-visible");
    }

    function closeDetailPanel() {
      els.detailPanel.classList.add("detail-panel-hidden");
      els.detailPanel.classList.remove("detail-panel-visible");
    }

    function ensureAttemptTabs() {
      if (els.detailAttemptTabs) return els.detailAttemptTabs;
      const container = document.createElement("div");
      container.id = "detailAttemptTabs";
      container.className = "attempt-tabs";
      const header = els.detailPanel.querySelector(".h-16.border-b");
      header.insertAdjacentElement("afterend", container);
      els.detailAttemptTabs = container;
      return container;
    }

    function renderAttemptTabs(detail) {
      const container = ensureAttemptTabs();
      const attempts = Array.isArray(detail.attempts) ? detail.attempts : [];
      container.innerHTML = "";

      const liveAttemptId = detail.currentAttemptId || null;
      if (liveAttemptId) {
        const live = document.createElement("button");
        live.className = "attempt-tab " + ((state.selectedAttemptId === null || state.selectedAttemptId === liveAttemptId) ? "is-active" : "");
        live.textContent = "Live";
        live.addEventListener("click", async () => {
          state.selectedAttemptId = null;
          await loadIssueDetail(state.selectedIssue);
        });
        container.appendChild(live);
      }

      attempts.slice(0, 8).forEach((attempt, index) => {
        const tab = document.createElement("button");
        const selected = state.selectedAttemptId === attempt.attemptId;
        tab.className = "attempt-tab " + (selected ? "is-active" : "");
        tab.textContent = "Run " + String(index + 1);
        tab.addEventListener("click", async () => {
          state.selectedAttemptId = attempt.attemptId;
          await loadAttemptDetail(attempt.attemptId);
        });
        container.appendChild(tab);
      });
    }

    function renderDetail(detail) {
      openDetailPanel();
      renderAttemptTabs(detail);
      state.selectedAttemptId = null;
      els.detailIdentifier.textContent = detail.identifier || "Issue";
      els.detailExternalLink.href = "#";
      els.detailTitle.textContent = detail.title || detail.identifier || "Issue detail";
      els.detailCreator.textContent = "Linear";
      els.detailAgent.textContent = detail.status || "Symphony Worker";
      els.detailWorkspace.textContent = detail.workspacePath || detail.workspaceKey || "No workspace yet";
      els.detailModelInput.value = detail.configuredModel || detail.model || "gpt-5.4";
      els.detailReasoningSelect.value = detail.configuredReasoningEffort || detail.reasoningEffort || "";
      els.detailModelSource.textContent = (detail.configuredModelSource || detail.modelSource || "default").toUpperCase();
      els.detailModelHelp.textContent =
        detail.modelChangePending
          ? "A new model setting is saved and will apply after the current worker finishes."
          : "Saved model settings apply on the next run. The active worker keeps its current model.";
      els.detailBadges.innerHTML = "";
      const badges = [
        { text: detail.priority === 1 ? "high priority" : detail.priority === 2 ? "medium priority" : "normal priority", className: detail.priority === 1 ? "detail-priority-high" : detail.priority === 2 ? "detail-priority-medium" : "detail-priority-normal" },
        { text: detail.status || detail.state || "unknown", className: statusBadge(detail.status || detail.state) },
        { text: (detail.model || "gpt-5.4") + (detail.reasoningEffort ? " / " + detail.reasoningEffort : ""), className: "detail-model" },
        detail.modelChangePending
          ? { text: "next run pending", className: "detail-pending" }
          : null,
      ];
      badges.filter(Boolean).forEach((badge) => {
        const span = document.createElement("span");
        span.className = "detail-badge " + badge.className;
        span.textContent = badge.text;
        els.detailBadges.appendChild(span);
      });

      els.detailLabels.innerHTML = "";
      const labels = Array.isArray(detail.labels) && detail.labels.length > 0 ? detail.labels : ["#linear", "#codex", "#symphony"];
      labels.forEach((label) => {
        const span = document.createElement("span");
        span.className = "detail-label";
        span.textContent = label.startsWith("#") ? label : "#" + label;
        els.detailLabels.appendChild(span);
      });

      const recentEvents = Array.isArray(detail.recentEvents) ? detail.recentEvents : [];
      els.detailTurns.textContent = String(detail.attempt ?? recentEvents.filter((event) => String(event.event).includes("turn")).length);
      els.detailTokens.textContent = detail.tokenUsage ? formatCompactNumber(detail.tokenUsage.totalTokens) : formatCompactNumber(state.snapshot?.codex_totals?.total_tokens || 0);
      const durationSeconds = detail.startedAt ? Math.max(0, Math.round((Date.now() - new Date(detail.startedAt).getTime()) / 1000)) : 0;
      els.detailDuration.textContent = formatDuration(durationSeconds);

      els.detailActivity.innerHTML = "";
      const NOISE = new Set(["codex/event/agent_message_delta","codex/event/agent_message_content_delta","item/agentMessage/delta","codex/event/token_count","account/rateLimits/updated","item/reasoning/textDelta","item/reasoning/summaryTextDelta","item/reasoning/summaryPartAdded","codex/event/reasoning_delta","thread/status/changed","codex/event/task_complete"]);
      const keyEvents = recentEvents.filter((e) => {
        if (e.event === "other_message" && !String(e.message || "").includes("error")) return false;
        return !NOISE.has(e.message);
      });
      if (keyEvents.length === 0) {
        els.detailActivity.appendChild(emptyCard("No streamed activity yet."));
      } else {
        keyEvents.slice(0, 30).forEach((event, index) => {
          renderEventRow(event, index, els.detailActivity);
        });
      }
      els.focusLogsButton.href = "/logs/" + encodeURIComponent(detail.identifier || "");

      els.detailRetryHistory.textContent =
        detail.error ? "Last error: " + detail.error : "No previous attempts for this session.";
    }

    function renderAttemptDetail(attempt) {
      openDetailPanel();
      state.selectedAttemptId = attempt.attemptId;
      els.detailIdentifier.textContent = attempt.issueIdentifier || "Attempt";
      els.detailExternalLink.href = "#";
      els.detailTitle.textContent = attempt.title || attempt.issueIdentifier || "Archived run";
      els.detailCreator.textContent = "Archived run";
      els.detailAgent.textContent = attempt.status || "attempt";
      els.detailWorkspace.textContent = attempt.workspacePath || attempt.workspaceKey || "No workspace";
      els.detailModelInput.value = attempt.model || "gpt-5.4";
      els.detailReasoningSelect.value = attempt.reasoningEffort || "";
      els.detailModelSource.textContent = (attempt.modelSource || "archive").toUpperCase();
      els.detailModelHelp.textContent = "You are viewing an archived run. Saving a model here updates the issue setting for the next run only.";
      els.detailBadges.innerHTML = "";
      [
        { text: attempt.status || "attempt", className: statusBadge(attempt.status) },
        { text: (attempt.model || "gpt-5.4") + (attempt.reasoningEffort ? " / " + attempt.reasoningEffort : ""), className: "detail-model" },
      ].forEach((badge) => {
        const span = document.createElement("span");
        span.className = "detail-badge " + badge.className;
        span.textContent = badge.text;
        els.detailBadges.appendChild(span);
      });

      els.detailLabels.innerHTML = "";
      ["#archive", "#run"].forEach((label) => {
        const span = document.createElement("span");
        span.className = "detail-label";
        span.textContent = label;
        els.detailLabels.appendChild(span);
      });

      const events = Array.isArray(attempt.events) ? attempt.events : [];
      els.detailTurns.textContent = String(attempt.turnCount ?? 0);
      els.detailTokens.textContent = attempt.tokenUsage ? formatCompactNumber(attempt.tokenUsage.totalTokens) : "0";
      const durationSeconds =
        attempt.startedAt && attempt.endedAt
          ? Math.max(0, Math.round((new Date(attempt.endedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000))
          : 0;
      els.detailDuration.textContent = formatDuration(durationSeconds);

      els.detailActivity.innerHTML = "";
      if (events.length === 0) {
        els.detailActivity.appendChild(emptyCard("No archived events for this run."));
      } else {
        events.slice(0, 50).forEach((event, index) => {
          renderEventRow(event, index, els.detailActivity);
        });
      }

      els.detailRetryHistory.textContent =
        attempt.errorMessage ? "Last error: " + attempt.errorMessage : "Run completed without a recorded error.";
    }

    async function loadState() {
      const response = await fetch("/api/v1/state");
      const snapshot = await response.json();
      renderSnapshot(snapshot);
      if (state.selectedIssue) {
        if (state.selectedAttemptId) {
          await loadAttemptDetail(state.selectedAttemptId);
        } else {
          await loadIssueDetail(state.selectedIssue);
        }
      }
    }

    async function loadIssueDetail(identifier) {
      const response = await fetch("/api/v1/" + encodeURIComponent(identifier));
      if (!response.ok) return;
      const detail = await response.json();
      renderDetail(detail);
    }

    async function loadAttemptDetail(attemptId) {
      const response = await fetch("/api/v1/attempts/" + encodeURIComponent(attemptId));
      if (!response.ok) return;
      const attempt = await response.json();
      renderAttemptDetail(attempt);
    }

    async function openIssueDetail(identifier) {
      state.selectedIssue = identifier;
      state.selectedAttemptId = null;
      await loadIssueDetail(identifier);
    }

    async function applyModelSelection() {
      if (!state.selectedIssue) return;
      const response = await fetch("/api/v1/" + encodeURIComponent(state.selectedIssue) + "/model", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: els.detailModelInput.value,
          reasoning_effort: els.detailReasoningSelect.value || null,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error?.message || "Failed to update model");
      }
      const result = await response.json();
      els.detailModelSource.textContent = (result?.selection?.source || "override").toUpperCase();
      els.detailModelHelp.textContent = result?.applies_next_attempt
        ? "Saved. This model will apply after the current run ends."
        : "Saved. This model will be used the next time the worker starts.";
      await loadState();
      if (state.selectedIssue) {
        if (state.selectedAttemptId) {
          await loadAttemptDetail(state.selectedAttemptId);
        } else {
          await loadIssueDetail(state.selectedIssue);
        }
      }
    }

    els.refreshButton.addEventListener("click", async () => {
      await fetch("/api/v1/refresh", { method: "POST" });
      await loadState();
    });

    els.refreshDetailButton.addEventListener("click", async () => {
      if (state.selectedAttemptId) {
        await loadAttemptDetail(state.selectedAttemptId);
      } else if (state.selectedIssue) {
        await loadIssueDetail(state.selectedIssue);
      }
    });
    els.detailModelInput.addEventListener("change", () => {
      els.detailModelSource.textContent = "PENDING";
    });
    els.detailReasoningSelect.addEventListener("change", () => {
      els.detailModelSource.textContent = "PENDING";
    });

    els.closeDetailButton.addEventListener("click", closeDetailPanel);
    els.pauseButton.addEventListener("click", () => {
      applyModelSelection().catch((error) => console.error(error));
    });
    // View Logs link is set dynamically via href in renderDetail

    els.searchInput.addEventListener("input", (event) => {
      state.search = event.target.value;
      if (state.snapshot) renderSnapshot(state.snapshot);
    });

    els.filterNav.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.currentFilter = button.dataset.filter;
        els.filterNav.querySelectorAll("[data-filter]").forEach((candidate) => {
          candidate.classList.remove("is-active");
        });
        button.classList.add("is-active");
        if (state.snapshot) renderSnapshot(state.snapshot);
      });
    });

    loadState().catch((error) => console.error(error));
    setInterval(() => {
      loadState().catch((error) => console.error(error));
    }, 5000);
  </script>
</body>
</html>`;
}
