/* eslint-disable max-lines -- HTML template is a single visual layout concern. */
export function dashboardHtml(): string {
  return `${sidebarHtml()}${mainContentHtml()}`;
}

function sidebarHtml(): string {
  return `
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
  </aside>`;
}

function mainContentHtml(): string {
  return `
  <main class="flex-1 flex flex-col h-full dot-grid overflow-hidden">
    ${headerHtml()}
    ${statusBarHtml()}
    ${boardHtml()}
    ${detailPanelHtml()}
  </main>`;
}

function headerHtml(): string {
  return `
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
    </header>`;
}

function statusBarHtml(): string {
  return `
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
    </section>`;
}

function boardHtml(): string {
  return `
    <div class="flex-1 overflow-auto p-6 flex gap-6 items-start" id="boardScroll">
      ${kanbanColumnHtml("blue", "queuedHeading", "Queued (0)", "queuedColumn", "")}
      ${kanbanColumnHtml("green", "runningHeading", "Running (0)", "runningColumn", " animate-pulse")}
      ${kanbanColumnHtml("amber", "retryingHeading", "Retrying (0)", "retryingColumn", "")}
      ${kanbanColumnHtml("slate", "completedHeading", "Completed (0)", "completedColumn", "", " opacity-80 hover:opacity-100 transition-opacity")}
    </div>`;
}

function kanbanColumnHtml(
  color: string,
  headingId: string,
  headingText: string,
  columnId: string,
  dotExtra: string,
  bodyExtra = "",
): string {
  return `
      <div class="kanban-column flex flex-col gap-4">
        <div class="flex items-center justify-between px-2">
          <div class="flex items-center gap-2">
            <span class="size-2 rounded-full bg-${color}-500${dotExtra}"></span>
            <h3 class="font-bold text-sm uppercase tracking-wider text-slate-500" id="${headingId}">${headingText}</h3>
          </div>
          <button class="text-slate-400 hover:text-slate-600"><span class="icon">⋯</span></button>
        </div>
        <div class="flex flex-col gap-3${bodyExtra}" id="${columnId}"></div>
      </div>`;
}

function detailPanelHtml(): string {
  return `
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
        ${detailContentHtml()}
      </div>
      <div class="h-20 border-t border-border-light bg-slate-50 p-6 flex items-center justify-end gap-3 shrink-0">
        <button class="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors" id="pauseButton" type="button">Save Model</button>
        <button class="px-6 py-2 text-sm font-bold bg-primary text-white rounded-lg shadow-lg shadow-primary/20 hover:bg-primary/90" id="refreshDetailButton" type="button">Refresh Detail</button>
      </div>
    </aside>`;
}

function detailContentHtml(): string {
  return `
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
        </div>`;
}
