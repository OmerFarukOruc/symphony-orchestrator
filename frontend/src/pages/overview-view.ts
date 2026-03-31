import { router } from "../router";
import { store } from "../state/store";
import type { AppState } from "../state/store";
import type { RuntimeIssueView, WebhookHealth } from "../types";
import { createEventRow } from "../components/event-row";
import { createSystemHealthBadge } from "../components/system-health-badge";
import { createWebhookHealthPanel } from "../components/webhook-health-panel";
import { createStallEventsTable } from "../components/stall-events-table";
import { buildAttentionList, latestTerminalIssues } from "../utils/issues";
import {
  formatCompactNumber,
  formatCostUsd,
  formatDuration,
  formatRateLimitHeadroom,
  formatRelativeTime,
} from "../utils/format";
import { flashDiff, setTextWithDiff } from "../utils/diff";
import { registerPageCleanup } from "../utils/page";

const EMPTY_STATE_DISMISSED_KEY = "risoluto-empty-state-dismissed";

function isGettingStartedDismissed(): boolean {
  return localStorage.getItem(EMPTY_STATE_DISMISSED_KEY) === "true";
}

function dismissGettingStarted(): void {
  localStorage.setItem(EMPTY_STATE_DISMISSED_KEY, "true");
}

/**
 * Creates a live metric pill for the hero band.
 * Small, inline stat with value and label.
 */
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

/**
 * Creates the hero metrics band - a strong top strip showing "Now" metrics.
 * Running, Queue Depth, Rate-limit, Attention count inline.
 */
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

/**
 * Creates a section header with title and optional kicker.
 */
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

/**
 * Creates an issue row for the attention or terminal list.
 */
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

/**
 * Fills a container with new items, applying flash diff animation.
 */
function fillList(container: HTMLElement, items: HTMLElement[]): void {
  container.replaceChildren(...items);
  for (const item of items) {
    flashDiff(item);
  }
}

function createTeachingEmptyState(
  title: string,
  detail: string,
  actionLabel?: string,
  onAction?: () => void,
): HTMLElement {
  const box = document.createElement("div");
  box.className = "overview-teaching-empty";

  const heading = document.createElement("h3");
  heading.className = "overview-teaching-empty-title";
  heading.textContent = title;

  const text = document.createElement("p");
  text.className = "overview-teaching-empty-detail";
  text.textContent = detail;

  box.append(heading, text);

  if (actionLabel && onAction) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mc-button";
    button.textContent = actionLabel;
    button.addEventListener("click", onAction);
    box.append(button);
  }

  return box;
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
    "Risoluto is polling your Linear project every 30 seconds. Create an issue and move it to In Progress to get started.";

  const steps = document.createElement("div");
  steps.className = "overview-getting-started-steps";

  const stepItems = [
    { n: "1", text: "Create an issue in Linear" },
    { n: "2", text: "Move it to In Progress" },
    { n: "3", text: "Risoluto picks it up within 30 seconds" },
  ];

  for (const s of stepItems) {
    const step = document.createElement("div");
    step.className = "overview-getting-started-step";
    const dot = document.createElement("span");
    dot.className = "overview-getting-started-step-n";
    dot.textContent = s.n;
    const label = document.createElement("span");
    label.textContent = s.text;
    step.append(dot, label);
    steps.append(step);
  }

  card.append(dismiss, heading, desc, steps);
  return card;
}

export function createOverviewPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "page overview-page fade-in";

  // Hero metrics band - the strong top "Now" strip
  const { band: heroBand, metrics: heroMetrics } = createHeroMetricsBand();
  page.append(heroBand);

  // Getting started card (shown when dashboard is empty)
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

  // Main content grid: Primary attention zone + secondary sidebar
  const mainGrid = document.createElement("section");
  mainGrid.className = "overview-main-grid";

  // Primary attention zone - dominant area
  const attentionZone = document.createElement("article");
  attentionZone.className = "overview-attention-zone";
  const attentionHeader = createSectionHeader("Attention", "Intervention queue");
  const attentionCount = document.createElement("span");
  attentionCount.className = "mc-badge is-sm overview-attention-count";
  attentionCount.hidden = true;
  attentionHeader.append(attentionCount);
  attentionZone.append(attentionHeader);

  const attentionList = document.createElement("div");
  attentionList.className = "overview-attention-list";
  attentionZone.append(attentionList);

  const secondary = document.createElement("aside");
  secondary.className = "overview-secondary";

  // Token burn section
  const tokenSection = document.createElement("div");
  tokenSection.className = "overview-token-section";
  tokenSection.append(createSectionHeader("Token burn", "Session totals"));

  const tokenGrid = document.createElement("div");
  tokenGrid.className = "overview-token-grid";

  const inputTokens = createLiveMetric("Input");
  const outputTokens = createLiveMetric("Output");
  const totalTokens = createLiveMetric("Total");
  const runtime = createLiveMetric("Runtime");
  const cost = createLiveMetric("Cost");

  tokenGrid.append(inputTokens.root, outputTokens.root, totalTokens.root, runtime.root, cost.root);
  tokenSection.append(tokenGrid);
  secondary.append(tokenSection);

  // Recent events section
  const recentSection = document.createElement("div");
  recentSection.className = "overview-recent-section";
  recentSection.append(createSectionHeader("Recent events"));

  const recentList = document.createElement("div");
  recentList.className = "overview-events";
  recentSection.append(recentList);

  // Terminal issues section (lower priority)
  const terminalSection = document.createElement("div");
  terminalSection.className = "overview-terminal-section";
  terminalSection.append(createSectionHeader("Latest completed / failed"));

  const terminalList = document.createElement("div");
  terminalList.className = "overview-list";
  terminalSection.append(terminalList);

  // System health section
  const healthSection = document.createElement("div");
  healthSection.className = "overview-health-section";
  healthSection.append(createSectionHeader("System health", "Watchdog"));
  const { root: healthBadge, update: updateHealthBadge } = createSystemHealthBadge();
  const { root: webhookPanel, update: updateWebhookPanel } = createWebhookHealthPanel();
  healthSection.append(healthBadge, webhookPanel);

  // Stall events section
  const stallSection = document.createElement("div");
  stallSection.className = "overview-stall-section";
  stallSection.append(createSectionHeader("Stall events"));
  const { root: stallList, update: updateStallEvents } = createStallEventsTable();
  stallSection.append(stallList);

  // Assemble main grid
  mainGrid.append(attentionZone, secondary);
  page.append(mainGrid);

  const lowerGrid = document.createElement("section");
  lowerGrid.className = "overview-lower-grid";
  lowerGrid.append(recentSection, healthSection, terminalSection, stallSection);
  page.append(lowerGrid);

  // Loading state
  const loadingSections = [attentionZone, tokenSection, recentSection, terminalSection, healthSection, stallSection];
  for (const section of loadingSections) {
    section.setAttribute("aria-busy", "true");
  }

  function renderSnapshot(state: AppState): void {
    const snapshot = state.snapshot;
    if (!snapshot) {
      // Show skeletons while loading
      for (const section of loadingSections) {
        if (section.childElementCount <= 1) {
          const skeleton = document.createElement("div");
          skeleton.className = "overview-skeleton";
          section.append(skeleton);
        }
      }
      return;
    }

    // Clear loading state
    for (const section of loadingSections) {
      section.setAttribute("aria-busy", "false");
    }

    // Hero metrics - the "Now" band
    setTextWithDiff(heroMetrics.running, String(snapshot.counts.running));
    setTextWithDiff(heroMetrics.queued, String((snapshot.queued ?? []).length));
    setTextWithDiff(heroMetrics.headroom, formatRateLimitHeadroom(snapshot.rate_limits));

    // Attention count for hero
    const attentionIssues = buildAttentionList(snapshot.workflow_columns ?? []);
    setTextWithDiff(heroMetrics.attention, String(attentionIssues.length));
    if (attentionIssues.length === 0) {
      attentionCount.hidden = true;
      attentionCount.textContent = "";
    } else {
      attentionCount.hidden = false;
      setTextWithDiff(attentionCount, `${attentionIssues.length} in queue`);
    }

    // Token burn metrics
    setTextWithDiff(inputTokens.value, formatCompactNumber(snapshot.codex_totals.input_tokens));
    setTextWithDiff(outputTokens.value, formatCompactNumber(snapshot.codex_totals.output_tokens));
    setTextWithDiff(totalTokens.value, formatCompactNumber(snapshot.codex_totals.total_tokens));
    setTextWithDiff(runtime.value, formatDuration(snapshot.codex_totals.seconds_running));
    setTextWithDiff(cost.value, formatCostUsd(snapshot.codex_totals.cost_usd));

    // Attention list - primary zone
    fillList(
      attentionList,
      attentionIssues.map((issue) => issueRow(issue, "attention")),
    );

    // Getting started card — show when dashboard is completely empty
    const isEmpty =
      snapshot.counts.running === 0 &&
      snapshot.counts.retrying === 0 &&
      (snapshot.queued ?? []).length === 0 &&
      (snapshot.completed ?? []).length === 0 &&
      attentionIssues.length === 0;
    if (isEmpty) {
      showGettingStarted();
    } else {
      hideGettingStarted();
    }

    // Recent events
    fillList(
      recentList,
      (snapshot.recent_events ?? []).slice(-5).map((event) => createEventRow(event, true)),
    );

    // Terminal issues
    fillList(
      terminalList,
      latestTerminalIssues(snapshot.completed ?? []).map((issue) => issueRow(issue, "terminal")),
    );

    // System health badge
    updateHealthBadge(snapshot.system_health);

    // Webhook health panel
    updateWebhookPanel(snapshot.webhook_health);

    // Stall events table
    updateStallEvents(snapshot.stall_events);

    if (attentionList.childElementCount === 0) {
      attentionList.replaceChildren(
        createTeachingEmptyState(
          "All clear",
          "No issues need attention. Blocked, retrying, or pending work will show up here.",
          "Open queue",
          () => router.navigate("/queue"),
        ),
      );
    }

    if (recentList.childElementCount === 0) {
      recentList.replaceChildren(
        createTeachingEmptyState(
          "Awaiting activity",
          "Workflow events will appear here as the orchestrator processes issues.",
        ),
      );
    }

    if (terminalList.childElementCount === 0) {
      terminalList.replaceChildren(
        createTeachingEmptyState("No completed work yet", "Finished and failed issues will collect here for review."),
      );
    }
  }

  const handler = (event: Event): void => renderSnapshot((event as CustomEvent<AppState>).detail);
  window.addEventListener("state:update", handler);

  // SSE webhook events — trigger immediate panel re-render
  const webhookHealthHandler = (event: Event): void => {
    const health = (event as CustomEvent).detail as Record<string, unknown> | undefined;
    if (health && typeof health.status === "string") {
      updateWebhookPanel(health as unknown as WebhookHealth);
    }
  };
  const webhookReceivedHandler = (): void => {
    // Re-render from current store state to pick up any timestamp changes
    renderSnapshot(store.getState());
  };
  window.addEventListener("risoluto:webhook-health-changed", webhookHealthHandler);
  window.addEventListener("risoluto:webhook-received", webhookReceivedHandler);

  renderSnapshot(store.getState());
  registerPageCleanup(page, () => {
    window.removeEventListener("state:update", handler);
    window.removeEventListener("risoluto:webhook-health-changed", webhookHealthHandler);
    window.removeEventListener("risoluto:webhook-received", webhookReceivedHandler);
  });

  return page;
}
