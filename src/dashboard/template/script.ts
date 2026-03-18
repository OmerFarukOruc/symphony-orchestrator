/* eslint-disable max-lines -- Client-side JS template is a single runtime concern. */
export function dashboardScript(): string {
  return `${stateAndElements()}${utilityFunctions()}${renderFunctions()}${detailFunctions()}${apiAndEventHandlers()}`;
}

function stateAndElements(): string {
  return `
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
      boardScroll: document.getElementById("boardScroll"),
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
    };`;
}

function utilityFunctions(): string {
  return `
    function formatNumber(value) {
      return new Intl.NumberFormat("en-US").format(Number(value || 0));
    }

    function formatCompactNumber(value) {
      const number = Number(value || 0);
      if (number >= 1000000) return (number / 1000000).toFixed(2).replace(/\\\\.00$/, "") + "M";
      if (number >= 1000) return (number / 1000).toFixed(1).replace(/\\\\.0$/, "") + "K";
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

    function itemStatusKey(item) {
      const normalized = String(item?.status || "").toLowerCase();
      if (normalized.includes("running")) return "running";
      if (normalized.includes("retry")) return "retrying";
      if (normalized.includes("complete")) return "completed";
      return "queued";
    }`;
}

function renderFunctions(): string {
  return `
    function cardForItem(item, column) {
      const priority = priorityLabel(item.priority);
      const tokenText = item.tokenUsage ? \\\`\\\${formatCompactNumber(item.tokenUsage.inputTokens)} / \\\${formatCompactNumber(item.tokenUsage.outputTokens)}\\\` : null;
      const statusKey = itemStatusKey(item);
      const wrapper = document.createElement("div");
      wrapper.className =
        "issue-card " +
        (statusKey === "running"
          ? "issue-card-running"
          : statusKey === "retrying"
            ? "issue-card-retrying"
            : "issue-card-default");

      const body = [];
      if (statusKey === "retrying") {
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
      if (statusKey === "running") {
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
      if (statusKey === "retrying") {
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
      if (statusKey === "completed") {
        body.push('<div class="issue-meta"><span>' + (item.status || "completed") + '</span><span>' + relativeTime(item.updatedAt) + '</span></div>');
      } else {
        body.push(
          '<div class="issue-meta">' +
            '<span>' + (statusKey === "running" ? "Worker live" : statusKey === "retrying" ? "Retry queued" : "Tracker issue") + '</span>' +
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
        let borderColor = "border-slate-200";
        if (event.event.includes("agentMessage")) borderColor = "border-green-300";
        else if (event.event.includes("commandExecution")) borderColor = "border-blue-300";
        else if (event.event.includes("reasoning")) borderColor = "border-amber-300";
        else if (event.event.includes("dynamicToolCall")) borderColor = "border-purple-300";
        const pre = document.createElement("pre");
        pre.className = "text-xs text-slate-600 bg-slate-50 p-2 rounded border-l-4 " + borderColor + " overflow-x-auto whitespace-pre-wrap font-mono";
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
        if (state.currentFilter !== "all" && state.currentFilter !== itemStatusKey(item)) return false;
        if (!state.search) return true;
        const haystack = [item.identifier, item.title, item.message, item.error, ...(item.labels || [])].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(state.search.toLowerCase());
      });
    }

    function legacyWorkflowColumns(snapshot) {
      return [
        { key: "queued", label: "Queued", kind: "todo", issues: snapshot.queued || [] },
        { key: "running", label: "Running", kind: "active", issues: snapshot.running || [] },
        { key: "retrying", label: "Retrying", kind: "active", issues: snapshot.retrying || [] },
        { key: "completed", label: "Completed", kind: "terminal", issues: snapshot.completed || [] },
      ];
    }

    function columnDotColor(kind) {
      if (kind === "terminal") return "#94a3b8";
      if (kind === "todo") return "#3b82f6";
      if (kind === "backlog") return "#64748b";
      if (kind === "other") return "#a855f7";
      return "#22c55e";
    }

    function renderWorkflowColumns(columns) {
      els.boardScroll.innerHTML = "";
      (columns || []).forEach((column) => {
        const items = Array.isArray(column.issues) ? column.issues : [];
        const filtered = filteredItems(items, column.key);
        const wrapper = document.createElement("div");
        wrapper.className = "kanban-column flex flex-col gap-4";
        const header = document.createElement("div");
        header.className = "flex items-center justify-between px-2";
        header.innerHTML =
          '<div class="flex items-center gap-2">' +
            '<span class="size-2 rounded-full" style="background:' + columnDotColor(column.kind) + ';"></span>' +
            '<h3 class="font-bold text-sm uppercase tracking-wider text-slate-500">' +
              String(column.label || column.key || "Stage") + " (" + String(items.length) + ")" +
            '</h3>' +
          '</div>' +
          '<button class="text-slate-400 hover:text-slate-600"><span class="icon">⋯</span></button>';
        wrapper.appendChild(header);
        const body = document.createElement("div");
        body.className = "flex flex-col gap-3";
        if (filtered.length === 0) {
          body.appendChild(emptyCard("No " + String(column.label || column.key || "stage").toLowerCase() + " items."));
        } else {
          filtered.forEach((item) => body.appendChild(cardForItem(item, column.key)));
        }
        wrapper.appendChild(body);
        els.boardScroll.appendChild(wrapper);
      });
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
      renderWorkflowColumns(
        Array.isArray(snapshot.workflow_columns) && snapshot.workflow_columns.length > 0
          ? snapshot.workflow_columns
          : legacyWorkflowColumns(snapshot),
      );
    }`;
}

function detailFunctions(): string {
  return `
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
        detail.modelChangePending ? { text: "next run pending", className: "detail-pending" } : null,
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
        keyEvents.slice(0, 30).forEach((event, index) => { renderEventRow(event, index, els.detailActivity); });
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
        events.slice(0, 50).forEach((event, index) => { renderEventRow(event, index, els.detailActivity); });
      }
      els.detailRetryHistory.textContent =
        attempt.errorMessage ? "Last error: " + attempt.errorMessage : "Run completed without a recorded error.";
    }`;
}

function apiAndEventHandlers(): string {
  return `
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
        headers: { "Content-Type": "application/json" },
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
        if (state.selectedAttemptId) { await loadAttemptDetail(state.selectedAttemptId); }
        else { await loadIssueDetail(state.selectedIssue); }
      }
    }

    els.refreshButton.addEventListener("click", async () => {
      await fetch("/api/v1/refresh", { method: "POST" });
      await loadState();
    });
    els.refreshDetailButton.addEventListener("click", async () => {
      if (state.selectedAttemptId) { await loadAttemptDetail(state.selectedAttemptId); }
      else if (state.selectedIssue) { await loadIssueDetail(state.selectedIssue); }
    });
    els.detailModelInput.addEventListener("change", () => { els.detailModelSource.textContent = "PENDING"; });
    els.detailReasoningSelect.addEventListener("change", () => { els.detailModelSource.textContent = "PENDING"; });
    els.closeDetailButton.addEventListener("click", closeDetailPanel);
    els.pauseButton.addEventListener("click", () => { applyModelSelection().catch((error) => console.error(error)); });
    els.searchInput.addEventListener("input", (event) => {
      state.search = event.target.value;
      if (state.snapshot) renderSnapshot(state.snapshot);
    });
    els.filterNav.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.currentFilter = button.dataset.filter;
        els.filterNav.querySelectorAll("[data-filter]").forEach((candidate) => { candidate.classList.remove("is-active"); });
        button.classList.add("is-active");
        if (state.snapshot) renderSnapshot(state.snapshot);
      });
    });

    loadState().catch((error) => console.error(error));
    setInterval(() => { loadState().catch((error) => console.error(error)); }, 5000);`;
}
