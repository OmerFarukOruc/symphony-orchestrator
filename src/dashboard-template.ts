export function renderDashboardTemplate(): string {
  return `<!DOCTYPE html>
<html class="light" lang="en">
<head>
  <meta charset="utf-8"/>
  <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
  <title>Symphony | AI Agent Orchestration</title>
  <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
  <script>
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          colors: {
            primary: "#bb4a31",
            "background-light": "#fdfbf8",
            "background-dark": "#1f1513",
            "panel-light": "#ffffff",
            "border-light": "#e4d6d3",
          },
          fontFamily: {
            display: ["Inter", "sans-serif"],
            mono: ["JetBrains Mono", "monospace"],
          },
          borderRadius: {
            DEFAULT: "0.25rem",
            lg: "0.5rem",
            xl: "0.75rem",
            full: "9999px",
          },
        },
      },
    };
  </script>
  <style>
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
    }

    .detail-panel-hidden {
      transform: translateX(100%);
      pointer-events: none;
    }

    .detail-panel-visible {
      transform: translateX(0);
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
        <span class="material-symbols-outlined text-2xl">auto_awesome</span>
      </div>
    </div>
    <nav class="flex flex-col gap-6 flex-1">
      <button class="text-primary hover:bg-primary/10 p-2 rounded-lg transition-colors">
        <span class="material-symbols-outlined text-2xl">home</span>
      </button>
      <button class="text-slate-400 hover:text-primary p-2 rounded-lg transition-colors">
        <span class="material-symbols-outlined text-2xl">grid_view</span>
      </button>
      <button class="text-slate-400 hover:text-primary p-2 rounded-lg transition-colors">
        <span class="material-symbols-outlined text-2xl">analytics</span>
      </button>
      <div class="h-px w-8 bg-border-light mx-auto"></div>
      <button class="text-slate-400 hover:text-primary p-2 rounded-lg transition-colors">
        <span class="material-symbols-outlined text-2xl">settings</span>
      </button>
    </nav>
    <div class="mt-auto">
      <div class="relative">
        <span class="material-symbols-outlined text-green-500 text-2xl">sensors</span>
        <span class="absolute top-0 right-0 block h-2 w-2 rounded-full bg-green-500 ring-2 ring-white animate-pulse"></span>
      </div>
    </div>
  </aside>

  <main class="flex-1 flex flex-col h-full dot-grid overflow-hidden">
    <header class="h-16 border-b border-border-light bg-panel-light/80 backdrop-blur-md px-6 flex items-center justify-between z-40 shrink-0">
      <div class="flex items-center gap-8">
        <h1 class="text-xl font-bold tracking-tight text-slate-900">Symphony</h1>
        <nav class="flex gap-1 bg-slate-100 p-1 rounded-lg" id="filterNav">
          <button class="px-4 py-1.5 text-sm font-medium rounded-md bg-white shadow-sm text-slate-900" data-filter="all">All</button>
          <button class="px-4 py-1.5 text-sm font-medium rounded-md text-slate-500 hover:text-slate-900" data-filter="running">Running</button>
          <button class="px-4 py-1.5 text-sm font-medium rounded-md text-slate-500 hover:text-slate-900" data-filter="retrying">Retrying</button>
          <button class="px-4 py-1.5 text-sm font-medium rounded-md text-slate-500 hover:text-slate-900" data-filter="completed">Completed</button>
        </nav>
      </div>
      <div class="flex items-center gap-4">
        <div class="relative">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
          <input class="pl-10 pr-4 py-2 w-64 border-border-light rounded-lg bg-slate-50 focus:ring-primary focus:border-primary text-sm" id="searchInput" placeholder="Search agents..." type="text"/>
        </div>
        <button class="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20" id="refreshButton">
          <span class="material-symbols-outlined text-lg">refresh</span>
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
          <span class="material-symbols-outlined text-lg">timer</span>
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
          <button class="text-slate-400 hover:text-slate-600"><span class="material-symbols-outlined">more_horiz</span></button>
        </div>
        <div class="flex flex-col gap-3" id="queuedColumn"></div>
      </div>

      <div class="kanban-column flex flex-col gap-4">
        <div class="flex items-center justify-between px-2">
          <div class="flex items-center gap-2">
            <span class="size-2 rounded-full bg-green-500 animate-pulse"></span>
            <h3 class="font-bold text-sm uppercase tracking-wider text-slate-500" id="runningHeading">Running (0)</h3>
          </div>
          <button class="text-slate-400 hover:text-slate-600"><span class="material-symbols-outlined">more_horiz</span></button>
        </div>
        <div class="flex flex-col gap-3" id="runningColumn"></div>
      </div>

      <div class="kanban-column flex flex-col gap-4">
        <div class="flex items-center justify-between px-2">
          <div class="flex items-center gap-2">
            <span class="size-2 rounded-full bg-amber-500"></span>
            <h3 class="font-bold text-sm uppercase tracking-wider text-slate-500" id="retryingHeading">Retrying (0)</h3>
          </div>
          <button class="text-slate-400 hover:text-slate-600"><span class="material-symbols-outlined">more_horiz</span></button>
        </div>
        <div class="flex flex-col gap-3" id="retryingColumn"></div>
      </div>

      <div class="kanban-column flex flex-col gap-4">
        <div class="flex items-center justify-between px-2">
          <div class="flex items-center gap-2">
            <span class="size-2 rounded-full bg-slate-400"></span>
            <h3 class="font-bold text-sm uppercase tracking-wider text-slate-500" id="completedHeading">Completed (0)</h3>
          </div>
          <button class="text-slate-400 hover:text-slate-600"><span class="material-symbols-outlined">more_horiz</span></button>
        </div>
        <div class="flex flex-col gap-3 opacity-80 hover:opacity-100 transition-opacity" id="completedColumn"></div>
      </div>
    </div>

    <aside class="fixed inset-y-0 right-0 w-[480px] bg-panel-light border-l border-border-light shadow-2xl z-50 transition-transform duration-300 detail-panel-hidden flex flex-col" id="detailPanel">
      <div class="h-16 border-b border-border-light flex items-center justify-between px-6 bg-slate-50 shrink-0">
        <div class="flex items-center gap-3">
          <span class="font-mono font-bold text-slate-900" id="detailIdentifier">Issue</span>
          <a class="text-blue-500 hover:text-blue-700" href="#" id="detailExternalLink" target="_blank" rel="noreferrer">
            <span class="material-symbols-outlined text-lg">open_in_new</span>
          </a>
        </div>
        <button class="text-slate-400 hover:text-slate-900" id="closeDetailButton">
          <span class="material-symbols-outlined">close</span>
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
                  <span class="material-symbols-outlined text-sm text-primary">smart_toy</span>
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
      if (priority === 1) return { label: "high", className: "bg-red-100 text-red-600" };
      if (priority === 2) return { label: "medium", className: "bg-amber-100 text-amber-600" };
      if (priority === 3) return { label: "low", className: "bg-slate-100 text-slate-500" };
      return { label: "none", className: "bg-slate-100 text-slate-500" };
    }

    function statusBadge(status) {
      const normalized = String(status || "").toLowerCase();
      if (normalized.includes("running")) return "bg-green-100 text-green-700";
      if (normalized.includes("retry")) return "bg-amber-100 text-amber-700";
      if (normalized.includes("complete")) return "bg-slate-200 text-slate-700";
      if (normalized.includes("fail") || normalized.includes("time")) return "bg-red-100 text-red-700";
      return "bg-blue-100 text-blue-700";
    }

    function cardForItem(item, column) {
      const priority = priorityLabel(item.priority);
      const tokenText = item.tokenUsage ? \`\${formatCompactNumber(item.tokenUsage.inputTokens)} / \${formatCompactNumber(item.tokenUsage.outputTokens)}\` : null;
      const wrapper = document.createElement("div");
      wrapper.className =
        column === "running"
          ? "bg-white border-2 border-primary/20 p-4 rounded-xl shadow-lg ring-1 ring-primary/5 cursor-pointer"
          : column === "retrying"
            ? "bg-white border border-amber-200 p-4 rounded-xl shadow-sm cursor-pointer relative overflow-hidden"
            : "bg-white border border-border-light p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer";

      const body = [];
      if (column === "retrying") {
        body.push('<div class="absolute top-0 right-0 p-1"><span class="material-symbols-outlined text-amber-500 text-lg">warning</span></div>');
      }

      body.push(
        '<div class="flex justify-between items-start mb-2">' +
          '<span class="font-mono text-[11px] font-bold ' + (column === "running" ? 'text-primary bg-primary/5 border-primary/10' : 'text-slate-400 bg-slate-50 border-slate-100') + ' px-2 py-0.5 rounded border">' + (item.identifier || "UNKNOWN") + '</span>' +
          '<span class="text-[10px] font-bold uppercase ' + priority.className + ' px-2 py-0.5 rounded-full">' + priority.label + '</span>' +
        '</div>'
      );
      body.push('<h4 class="text-sm ' + (column === "running" ? 'font-bold text-slate-900' : 'font-semibold text-slate-800') + ' leading-snug line-clamp-2 mb-2">' + (item.title || item.identifier || "Untitled issue") + '</h4>');
      if (Array.isArray(item.labels) && item.labels.length > 0) {
        body.push('<div class="flex flex-wrap gap-1 mb-3">' + item.labels.slice(0, 3).map((label) => '<span class="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded lowercase">' + label + '</span>').join("") + '</div>');
      }
      if (column === "running") {
        body.push(
          '<div class="bg-slate-50 rounded-lg p-3 mb-3 border border-slate-100">' +
            '<div class="flex justify-between text-[11px] font-mono mb-1">' +
              '<span class="text-slate-500">Attempt ' + String(item.attempt ?? 0) + '</span>' +
              '<span class="text-green-600 font-bold">' + (tokenText ? tokenText : "live") + '</span>' +
            '</div>' +
            '<p class="text-[11px] text-slate-600 line-clamp-1 italic">' + (item.message || "Worker is actively processing this issue.") + '</p>' +
          '</div>'
        );
      }
      if (column === "retrying") {
        body.push(
          '<div class="bg-amber-50/50 rounded-lg p-2 mb-3 border border-amber-100 text-[11px]">' +
            '<p class="text-amber-800 font-bold mb-0.5">Attempt ' + String(item.attempt ?? 0) + '</p>' +
            '<p class="text-amber-600 line-clamp-1 italic">Reason: ' + (item.error || item.message || "Retry queued") + '</p>' +
          '</div>'
        );
      }
      if (column === "completed") {
        body.push('<div class="flex justify-between items-center text-[11px] text-slate-400"><span>' + (item.status || "completed") + '</span><span>' + relativeTime(item.updatedAt) + '</span></div>');
      } else {
        body.push(
          '<div class="flex items-center justify-between">' +
            '<div class="flex items-center gap-2">' +
              '<div class="size-7 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">' + column.charAt(0).toUpperCase() + '</div>' +
              '<span class="text-[11px] font-bold text-slate-700">' + (column === "running" ? "Worker live" : column === "retrying" ? "Retry queued" : "Tracker issue") + '</span>' +
            '</div>' +
            '<span class="text-[11px] text-slate-400 italic">' + relativeTime(item.updatedAt) + '</span>' +
          '</div>'
        );
      }

      wrapper.innerHTML = body.join("");
      wrapper.addEventListener("click", () => openIssueDetail(item.identifier));
      return wrapper;
    }

    function emptyCard(message) {
      const div = document.createElement("div");
      div.className = "p-8 text-center bg-slate-50 border border-slate-200 rounded-lg text-slate-500";
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
      container.className = "border-b border-border-light px-6 py-2 bg-white flex gap-2 overflow-x-auto shrink-0";
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
        live.className =
          "px-3 py-1.5 rounded-lg text-xs font-mono border " +
          ((state.selectedAttemptId === null || state.selectedAttemptId === liveAttemptId)
            ? "bg-primary text-white border-primary"
            : "bg-slate-50 text-slate-600 border-slate-200");
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
        tab.className =
          "px-3 py-1.5 rounded-lg text-xs font-mono border " +
          (selected ? "bg-primary text-white border-primary" : "bg-slate-50 text-slate-600 border-slate-200");
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
        { text: detail.priority === 1 ? "high priority" : detail.priority === 2 ? "medium priority" : "normal priority", className: detail.priority === 1 ? "bg-red-100 text-red-700" : detail.priority === 2 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700" },
        { text: detail.status || detail.state || "unknown", className: statusBadge(detail.status || detail.state) },
        { text: (detail.model || "gpt-5.4") + (detail.reasoningEffort ? " / " + detail.reasoningEffort : ""), className: "bg-primary/10 text-primary" },
        detail.modelChangePending
          ? { text: "next run pending", className: "bg-amber-100 text-amber-700" }
          : null,
      ];
      badges.filter(Boolean).forEach((badge) => {
        const span = document.createElement("span");
        span.className = badge.className + " px-3 py-1 rounded-full text-xs font-bold uppercase tracking-tight";
        span.textContent = badge.text;
        els.detailBadges.appendChild(span);
      });

      els.detailLabels.innerHTML = "";
      const labels = Array.isArray(detail.labels) && detail.labels.length > 0 ? detail.labels : ["#linear", "#codex", "#symphony"];
      labels.forEach((label) => {
        const span = document.createElement("span");
        span.className = "text-xs bg-slate-50 text-slate-600 border border-slate-200 px-2 py-1 rounded lowercase";
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
        { text: (attempt.model || "gpt-5.4") + (attempt.reasoningEffort ? " / " + attempt.reasoningEffort : ""), className: "bg-primary/10 text-primary" },
      ].forEach((badge) => {
        const span = document.createElement("span");
        span.className = badge.className + " px-3 py-1 rounded-full text-xs font-bold uppercase tracking-tight";
        span.textContent = badge.text;
        els.detailBadges.appendChild(span);
      });

      els.detailLabels.innerHTML = "";
      ["#archive", "#run"].forEach((label) => {
        const span = document.createElement("span");
        span.className = "text-xs bg-slate-50 text-slate-600 border border-slate-200 px-2 py-1 rounded lowercase";
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
          candidate.className = "px-4 py-1.5 text-sm font-medium rounded-md text-slate-500 hover:text-slate-900";
        });
        button.className = "px-4 py-1.5 text-sm font-medium rounded-md bg-white shadow-sm text-slate-900";
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
