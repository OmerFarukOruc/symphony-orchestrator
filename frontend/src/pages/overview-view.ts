import { api } from "../api";
import { router } from "../router";
import { store } from "../state/store";
import type { AppState } from "../state/store";
import type { RuntimeIssueView } from "../types";
import { skeletonCard } from "../ui/skeleton";
import { createEventRow } from "../components/event-row";
import { createEmptyState } from "../components/empty-state";
import { createStatCardHeader, createStatCardShell } from "../components/metric-card";
import { createPageHeader } from "../components/page-header";
import { buildAttentionList, latestTerminalIssues } from "../utils/issues";
import { formatCompactNumber, formatDuration, formatRateLimitHeadroom, formatRelativeTime } from "../utils/format";
import { flashDiff, setTextWithDiff } from "../utils/diff";
import { registerPageCleanup } from "../utils/page";

function stat(label: string): { root: HTMLElement; value: HTMLElement } {
  const root = document.createElement("div");
  root.className = "overview-kpi";
  const value = document.createElement("strong");
  const caption = document.createElement("span");
  caption.textContent = label;
  root.append(value, caption);
  return { root, value };
}

function createOverviewSection(title: string, kicker: string, className = "mc-stat-card"): HTMLElement {
  const card = createStatCardShell({ className });
  card.append(createStatCardHeader({ title, kicker, headerClassName: "overview-row-meta" }));
  return card;
}

function issueRow(issue: RuntimeIssueView, target: "queue" | "attention"): HTMLButtonElement {
  const row = document.createElement("button");
  row.type = "button";
  row.className = target === "attention" ? "overview-attention-item" : "overview-terminal-item";
  row.dataset.status = issue.status;
  const meta = document.createElement("div");
  meta.className = "overview-row-meta";
  const ident = document.createElement("strong");
  ident.className = "text-mono";
  ident.textContent = issue.identifier;
  const time = document.createElement("span");
  time.className = "overview-small";
  time.textContent = formatRelativeTime(issue.updatedAt);
  meta.append(ident, time);
  const titleDiv = document.createElement("div");
  titleDiv.textContent = issue.title;
  row.append(meta, titleDiv);
  row.addEventListener("click", () => router.navigate(`/queue/${issue.identifier}`));
  return row;
}

function fillList(container: HTMLElement, next: HTMLElement[]): void {
  container.replaceChildren(...next);
  next.forEach((item) => flashDiff(item));
}

export function createOverviewPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "page overview-page fade-in";
  const actions = document.createElement("div");
  actions.className = "mc-actions";
  const staleBadge = document.createElement("span");
  staleBadge.className = "mc-badge";
  staleBadge.hidden = true;
  staleBadge.textContent = "Feed stale";
  const envBadge = document.createElement("span");
  envBadge.className = "mc-badge";
  envBadge.textContent = "Local environment";
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "mc-button mc-button-ghost";
  refresh.textContent = "Refresh";
  refresh.addEventListener("click", async () => {
    refresh.disabled = true;
    await api.postRefresh().catch(() => undefined);
    window.setTimeout(() => {
      refresh.disabled = false;
    }, 500);
  });
  actions.append(envBadge, staleBadge, refresh);
  const top = createPageHeader(
    "Mission Control",
    "Operational view across queue pressure, token burn, intervention risk, and event flow.",
    {
      actions,
      titleTagName: "div",
    },
  );

  const grid = document.createElement("section");
  grid.className = "overview-grid";
  const nowCard = createOverviewSection("Now", "Live");
  const tokenCard = createOverviewSection("Token burn", "Session totals");
  const attentionCard = createOverviewSection("Attention", "Intervention queue");
  const recentCard = createOverviewSection("Recent changes", "Last 5 events");
  grid.append(nowCard, tokenCard, attentionCard, recentCard);

  const lower = document.createElement("section");
  lower.className = "overview-lower";
  const terminal = createOverviewSection("Latest completed / failed", "Terminal columns", "mc-panel overview-scroll");
  const events = createOverviewSection("Live event stream", "Recent events", "mc-panel overview-scroll");
  lower.append(terminal, events);
  page.append(top, grid, lower);

  const loadingSections = [nowCard, tokenCard, attentionCard, recentCard, terminal, events];
  loadingSections.forEach((section) => section.setAttribute("aria-busy", "true"));

  const running = stat("Running agents");
  const retrying = stat("Retry pressure");
  const queued = stat("Queue depth");
  const headroom = stat("Rate-limit headroom");
  const inputTokens = stat("Input");
  const outputTokens = stat("Output");
  const totalTokens = stat("Total");
  const runtime = stat("Runtime");
  const attentionList = document.createElement("div");
  attentionList.className = "overview-stack";
  const recentList = document.createElement("div");
  recentList.className = "overview-events";
  const terminalList = document.createElement("div");
  terminalList.className = "overview-list";
  const eventList = document.createElement("div");
  eventList.className = "overview-events";

  const nowGrid = document.createElement("div");
  nowGrid.className = "overview-kpi-grid";
  nowGrid.append(running.root, retrying.root, queued.root, headroom.root);
  nowCard.append(nowGrid);
  const tokenGrid = document.createElement("div");
  tokenGrid.className = "overview-kpi-grid";
  tokenGrid.append(inputTokens.root, outputTokens.root, totalTokens.root, runtime.root);
  tokenCard.append(tokenGrid);
  attentionCard.append(attentionList);
  recentCard.append(recentList);
  terminal.append(terminalList);
  events.append(eventList);

  function renderSnapshot(state: AppState): void {
    staleBadge.hidden = state.staleCount < 3;
    const snapshot = state.snapshot;
    if (!snapshot) {
      [nowCard, tokenCard, attentionCard, recentCard, terminal, events].forEach((section) => {
        if (section.childElementCount <= 1) {
          section.append(skeletonCard());
        }
      });
      return;
    }
    setTextWithDiff(running.value, String(snapshot.counts.running));
    loadingSections.forEach((section) => section.setAttribute("aria-busy", "false"));
    setTextWithDiff(retrying.value, String(snapshot.counts.retrying));
    setTextWithDiff(queued.value, String(snapshot.queued.length));
    setTextWithDiff(headroom.value, formatRateLimitHeadroom(snapshot.rate_limits));
    setTextWithDiff(inputTokens.value, formatCompactNumber(snapshot.codex_totals.input_tokens));
    setTextWithDiff(outputTokens.value, formatCompactNumber(snapshot.codex_totals.output_tokens));
    setTextWithDiff(totalTokens.value, formatCompactNumber(snapshot.codex_totals.total_tokens));
    setTextWithDiff(runtime.value, formatDuration(snapshot.codex_totals.seconds_running));
    fillList(
      attentionList,
      buildAttentionList(snapshot.workflow_columns).map((issue) => issueRow(issue, "attention")),
    );
    fillList(
      recentList,
      snapshot.recent_events.slice(0, 5).map((event) => createEventRow(event, true)),
    );
    fillList(
      terminalList,
      latestTerminalIssues(snapshot.workflow_columns).map((issue) => issueRow(issue, "queue")),
    );
    fillList(
      eventList,
      snapshot.recent_events.map((event) => createEventRow(event)),
    );
    if (attentionList.childElementCount === 0) {
      attentionList.replaceChildren(
        createEmptyState(
          "No intervention queue",
          "Blocked, retrying, and pending override issues will surface here.",
          "View queue",
          () => router.navigate("/queue"),
          "attention",
        ),
      );
    }
    if (recentList.childElementCount === 0) {
      recentList.replaceChildren(
        createEmptyState(
          "No recent changes",
          "Workflow state changes and agent events will appear here as they occur.",
          "Refresh",
          async () => {
            await api.postRefresh().catch(() => undefined);
          },
          "events",
        ),
      );
    }
    if (terminalList.childElementCount === 0) {
      terminalList.replaceChildren(
        createEmptyState(
          "No terminal issues yet",
          "Completed and failed work will collect here. Run agents from the Queue to populate.",
          "Go to Queue",
          () => router.navigate("/queue"),
          "terminal",
        ),
      );
    }
    if (eventList.childElementCount === 0) {
      eventList.replaceChildren(
        createEmptyState(
          "Waiting for agent activity",
          "Recent orchestration events will stream into this panel as agents execute workflows.",
          "Refresh",
          async () => {
            await api.postRefresh().catch(() => undefined);
          },
          "events",
        ),
      );
    }
  }

  const handler = (event: Event): void => renderSnapshot((event as CustomEvent<AppState>).detail);
  window.addEventListener("state:update", handler);
  renderSnapshot(store.getState());
  registerPageCleanup(page, () => window.removeEventListener("state:update", handler));
  return page;
}
