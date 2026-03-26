import { router } from "../router";
import { store } from "../state/store";
import type { AppState } from "../state/store";
import type { RuntimeIssueView } from "../types";
import { createSystemHealthBadge } from "../components/system-health-badge";
import { createStallEventsTable } from "../components/stall-events-table";
import { buildAttentionList } from "../utils/issues";
import { formatRelativeTime } from "../utils/format";
import { registerPageCleanup } from "../utils/page";
import {
  renderLoadingState,
  renderKpis,
  renderLists,
  renderGettingStarted,
  renderEmptyStates,
  type OverviewDomRefs,
} from "./overview-renderers";

const EMPTY_STATE_DISMISSED_KEY = "symphony-empty-state-dismissed";

function isGettingStartedDismissed(): boolean {
  return localStorage.getItem(EMPTY_STATE_DISMISSED_KEY) === "true";
}

function dismissGettingStarted(): void {
  localStorage.setItem(EMPTY_STATE_DISMISSED_KEY, "true");
}

function createLiveMetric(label: string): { root: HTMLElement; value: HTMLElement } {
  const root = document.createElement("div");
  root.className = "overview-live-metric";
  const value = document.createElement("strong");
  value.className = "overview-live-value";
  const caption = document.createElement("span");
  caption.className = "overview-live-label";
  caption.textContent = label;
  root.append(value, caption);
  return { root, value };
}

function createHeroMetricsBand(): {
  band: HTMLElement;
  metrics: {
    running: HTMLElement;
    queued: HTMLElement;
    headroom: HTMLElement;
    attention: HTMLElement;
  };
} {
  const band = document.createElement("section");
  band.className = "overview-hero-band";

  const label = document.createElement("span");
  label.className = "overview-hero-label";
  label.textContent = "Now";

  const metricsContainer = document.createElement("div");
  metricsContainer.className = "overview-hero-metrics";

  const running = createLiveMetric("Running");
  const queued = createLiveMetric("Queue");
  const headroom = createLiveMetric("Rate limit");
  const attention = createLiveMetric("Attention");

  metricsContainer.append(running.root, queued.root, headroom.root, attention.root);
  band.append(label, metricsContainer);

  return {
    band,
    metrics: {
      running: running.value,
      queued: queued.value,
      headroom: headroom.value,
      attention: attention.value,
    },
  };
}

function createSectionHeader(title: string, kicker?: string): HTMLElement {
  const header = document.createElement("div");
  header.className = "overview-section-header";

  const titleEl = document.createElement("h2");
  titleEl.className = "overview-section-title";
  titleEl.textContent = title;
  header.append(titleEl);

  if (kicker) {
    const kickerEl = document.createElement("span");
    kickerEl.className = "mc-badge";
    kickerEl.textContent = kicker;
    header.append(kickerEl);
  }

  return header;
}

function issueRow(issue: RuntimeIssueView, target: "attention" | "terminal"): HTMLButtonElement {
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

function createGettingStartedCard(onDismiss: () => void): HTMLElement {
  const card = document.createElement("div");
  card.className = "overview-getting-started";

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "overview-getting-started-dismiss";
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.addEventListener("click", () => {
    dismissGettingStarted();
    onDismiss();
  });

  const heading = document.createElement("h3");
  heading.className = "overview-getting-started-title";
  heading.textContent = "No issues yet";

  const desc = document.createElement("p");
  desc.className = "overview-getting-started-desc";
  desc.textContent =
    "Symphony is polling your Linear project every 30 seconds. Create an issue and move it to In Progress to get started.";

  const steps = document.createElement("div");
  steps.className = "overview-getting-started-steps";

  const stepItems = [
    { n: "1", text: "Create an issue in Linear" },
    { n: "2", text: "Move it to In Progress" },
    { n: "3", text: "Symphony picks it up within 30 seconds" },
  ];

  for (const s of stepItems) {
    const step = document.createElement("div");
    step.className = "overview-getting-started-step";
    const dot = document.createElement("span");
    dot.className = "overview-getting-started-step-n";
    dot.textContent = s.n;
    const labelEl = document.createElement("span");
    labelEl.textContent = s.text;
    step.append(dot, labelEl);
    steps.append(step);
  }

  card.append(dismiss, heading, desc, steps);
  return card;
}

export function createOverviewPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "page overview-page fade-in";

  const { band: heroBand, metrics: heroMetrics } = createHeroMetricsBand();
  page.append(heroBand);

  const gettingStartedContainer = document.createElement("div");
  let gettingStartedEl: HTMLElement | null = null;

  function showGettingStarted(): void {
    if (gettingStartedEl || isGettingStartedDismissed()) return;
    gettingStartedEl = createGettingStartedCard(() => {
      gettingStartedEl?.remove();
      gettingStartedEl = null;
    });
    gettingStartedContainer.append(gettingStartedEl);
  }

  function hideGettingStarted(): void {
    if (gettingStartedEl) {
      gettingStartedEl.remove();
      gettingStartedEl = null;
    }
  }

  page.append(gettingStartedContainer);

  const mainGrid = document.createElement("section");
  mainGrid.className = "overview-main-grid";

  const attentionZone = document.createElement("article");
  attentionZone.className = "overview-attention-zone";
  attentionZone.append(createSectionHeader("Attention", "Intervention queue"));

  const attentionList = document.createElement("div");
  attentionList.className = "overview-attention-list";
  attentionZone.append(attentionList);

  const secondary = document.createElement("aside");
  secondary.className = "overview-secondary";

  const tokenSection = document.createElement("div");
  tokenSection.className = "overview-token-section";
  tokenSection.append(createSectionHeader("Token burn", "Session totals"));

  const tokenGrid = document.createElement("div");
  tokenGrid.className = "overview-token-grid";

  const inputTokens = createLiveMetric("Input");
  const outputTokens = createLiveMetric("Output");
  const totalTokens = createLiveMetric("Total");
  const runtime = createLiveMetric("Runtime");

  tokenGrid.append(inputTokens.root, outputTokens.root, totalTokens.root, runtime.root);
  tokenSection.append(tokenGrid);
  secondary.append(tokenSection);

  const quickActions = document.createElement("div");
  quickActions.className = "overview-quick-actions";

  const quickTitle = document.createElement("h2");
  quickTitle.className = "overview-section-title";
  quickTitle.textContent = "Quick actions";
  quickActions.append(quickTitle);

  const actions = [
    { label: "View queue", path: "/queue" },
    { label: "Observability", path: "/observability" },
    { label: "Git & PRs", path: "/git" },
  ];

  for (const action of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "overview-quick-action-btn";
    btn.textContent = action.label;
    btn.addEventListener("click", () => router.navigate(action.path));
    quickActions.append(btn);
  }
  secondary.append(quickActions);

  const recentSection = document.createElement("div");
  recentSection.className = "overview-recent-section";
  recentSection.append(createSectionHeader("Recent events"));

  const recentList = document.createElement("div");
  recentList.className = "overview-events";
  recentSection.append(recentList);

  const terminalSection = document.createElement("div");
  terminalSection.className = "overview-terminal-section";
  terminalSection.append(createSectionHeader("Latest completed / failed"));

  const terminalList = document.createElement("div");
  terminalList.className = "overview-list";
  terminalSection.append(terminalList);

  const healthSection = document.createElement("div");
  healthSection.className = "overview-health-section";
  healthSection.append(createSectionHeader("System health", "Watchdog"));
  const { root: healthBadge, update: updateHealthBadge } = createSystemHealthBadge();
  healthSection.append(healthBadge);

  const stallSection = document.createElement("div");
  stallSection.className = "overview-stall-section";
  stallSection.append(createSectionHeader("Stall events"));
  const { root: stallList, update: updateStallEvents } = createStallEventsTable();
  stallSection.append(stallList);

  mainGrid.append(attentionZone, secondary);
  page.append(mainGrid);

  const lowerGrid = document.createElement("section");
  lowerGrid.className = "overview-lower-grid";
  lowerGrid.append(recentSection, healthSection, terminalSection, stallSection);
  page.append(lowerGrid);

  const loadingSections = [attentionZone, tokenSection, recentSection, terminalSection, healthSection, stallSection];
  for (const section of loadingSections) {
    section.setAttribute("aria-busy", "true");
  }

  const refs: OverviewDomRefs = {
    heroMetrics,
    tokenMetrics: {
      input: inputTokens.value,
      output: outputTokens.value,
      total: totalTokens.value,
      runtime: runtime.value,
    },
    attentionList,
    recentList,
    terminalList,
    loadingSections,
    updateHealthBadge,
    updateStallEvents,
    showGettingStarted,
    hideGettingStarted,
  };

  function renderSnapshot(state: AppState): void {
    const snapshot = state.snapshot;
    if (!snapshot) {
      renderLoadingState(refs);
      return;
    }

    for (const section of loadingSections) {
      section.setAttribute("aria-busy", "false");
    }

    const attentionIssues = buildAttentionList(snapshot.workflow_columns);
    renderKpis(refs, snapshot, attentionIssues.length);
    renderLists(refs, snapshot, attentionIssues, issueRow);
    renderGettingStarted(refs, snapshot, attentionIssues.length);
    updateHealthBadge(snapshot.system_health);
    updateStallEvents(snapshot.stall_events);
    renderEmptyStates(refs);
  }

  const handler = (event: Event): void => renderSnapshot((event as CustomEvent<AppState>).detail);
  window.addEventListener("state:update", handler);
  renderSnapshot(store.getState());
  registerPageCleanup(page, () => window.removeEventListener("state:update", handler));

  return page;
}
