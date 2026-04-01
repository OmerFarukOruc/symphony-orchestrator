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

function describeCurrentMoment(
  snapshot: NonNullable<AppState["snapshot"]>,
  attentionCount: number,
): {
  state: string;
  detail: string;
} {
  const queued = (snapshot.queued ?? []).length;
  const running = snapshot.counts.running;
  const completed = (snapshot.completed ?? []).length;

  if (attentionCount > 0) {
    return {
      state: attentionCount === 1 ? "1 issue needs intervention" : `${attentionCount} issues need intervention`,
      detail: "Blocked, retrying, and waiting work is collected here first so the next decision is always obvious.",
    };
  }

  if (running > 0) {
    return {
      state: running === 1 ? "1 issue is in flight" : `${running} issues are in flight`,
      detail:
        queued > 0
          ? `${queued} more ${queued === 1 ? "issue is" : "issues are"} queued behind the active work.`
          : "Active work is progressing cleanly without intervention right now.",
    };
  }

  if (queued > 0) {
    return {
      state: queued === 1 ? "1 issue is queued" : `${queued} issues are queued`,
      detail: "The queue is ready and waiting for the next poll cycle to pick it up.",
    };
  }

  if (completed > 0) {
    return {
      state: "Queue is clear",
      detail: "Everything is handled. Review the latest outcomes and recent activity below.",
    };
  }

  return {
    state: "Ready for the first issue",
    detail: "Create an issue in Linear and move it to In Progress \u2014 Risoluto will take it from there.",
  };
}

function describeAttentionZone(attentionCount: number): string {
  if (attentionCount === 0) {
    return "Nothing needs your attention right now. When an issue blocks, retries, or needs a decision, it will surface here.";
  }

  if (attentionCount === 1) {
    return "One issue is waiting on a recovery, unblock, or decision. Resolve it here before scanning the rest of the system.";
  }

  return `${attentionCount} issues are competing for attention. Start with the oldest or most blocked item and work downward.`;
}

/**
 * Creates the hero metrics band - a strong top strip showing "Now" metrics.
 * Running, Queue Depth, Rate-limit, Attention count inline.
 */
function createHeroMetricsBand(): {
  band: HTMLElement;
  state: HTMLElement;
  detail: HTMLElement;
  metrics: {
    running: HTMLElement;
    queued: HTMLElement;
    headroom: HTMLElement;
    attention: HTMLElement;
  };
} {
  const band = document.createElement("section");
  band.className = "overview-hero-band";

  const intro = document.createElement("div");
  intro.className = "overview-hero-intro";

  const label = document.createElement("span");
  label.className = "overview-hero-label";
  label.textContent = "Overview";

  const title = document.createElement("h1");
  title.className = "overview-hero-title";
  title.textContent = "Calm control of the queue";

  const detail = document.createElement("p");
  detail.className = "overview-hero-detail";

  const state = document.createElement("div");
  state.className = "overview-hero-state";

  intro.append(label, title, detail, state);

  const metricsContainer = document.createElement("div");
  metricsContainer.className = "overview-hero-metrics";

  const running = createLiveMetric("Running");
  const queued = createLiveMetric("Queue");
  const headroom = createLiveMetric("Rate limit");
  const attention = createLiveMetric("Attention");

  metricsContainer.append(running.root, queued.root, headroom.root, attention.root);
  band.append(intro, metricsContainer);

  return {
    band,
    state,
    detail,
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
    kickerEl.className = "overview-section-kicker";
    kickerEl.textContent = kicker;
    header.append(kickerEl);
  }

  return header;
}

const COLLAPSED_KEY = "risoluto-overview-collapsed";

/**
 * Reads the set of collapsed section IDs from localStorage.
 */
function readCollapsedSections(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore corrupted data */
  }
  return new Set<string>();
}

/**
 * Persists the set of collapsed section IDs to localStorage.
 */
function saveCollapsedSections(ids: Set<string>): void {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]));
}

/**
 * Creates a collapsible section wrapper with a summary line.
 * The section header acts as the disclosure toggle.
 * `summaryEl` is a lightweight element shown next to the header when collapsed.
 */
function createCollapsibleSection(
  id: string,
  title: string,
  kicker: string,
  collapsed: Set<string>,
): {
  section: HTMLElement;
  body: HTMLElement;
  summary: HTMLElement;
  setExpanded: (expanded: boolean) => void;
} {
  const section = document.createElement("div");
  section.className = "overview-collapsible-section";
  section.dataset.sectionId = id;

  const header = document.createElement("button");
  header.type = "button";
  header.className = "overview-collapsible-header";
  header.setAttribute("aria-expanded", String(!collapsed.has(id)));

  const titleEl = document.createElement("h2");
  titleEl.className = "overview-section-title";
  titleEl.textContent = title;

  const kickerEl = document.createElement("span");
  kickerEl.className = "overview-section-kicker";
  kickerEl.textContent = kicker;

  const chevron = document.createElement("span");
  chevron.className = "overview-collapsible-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "\u25B8"; // right-pointing triangle

  const summary = document.createElement("span");
  summary.className = "overview-collapsible-summary";

  header.append(chevron, titleEl, kickerEl, summary);

  const body = document.createElement("div");
  body.className = "overview-collapsible-body";

  section.append(header, body);

  function setExpanded(expanded: boolean): void {
    header.setAttribute("aria-expanded", String(expanded));
    section.classList.toggle("is-collapsed", !expanded);
    body.hidden = !expanded;
    summary.hidden = expanded;
    if (expanded) {
      collapsed.delete(id);
    } else {
      collapsed.add(id);
    }
    saveCollapsedSections(collapsed);
  }

  header.addEventListener("click", () => {
    const isExpanded = header.getAttribute("aria-expanded") === "true";
    setExpanded(!isExpanded);
  });

  // Apply initial collapsed state
  const isCollapsed = collapsed.has(id);
  section.classList.toggle("is-collapsed", isCollapsed);
  body.hidden = isCollapsed;
  summary.hidden = !isCollapsed;

  return { section, body, summary, setExpanded };
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
const listFingerprints = new WeakMap<HTMLElement, string>();

function fillList(container: HTMLElement, items: HTMLElement[]): void {
  const fingerprint = items.map((el) => el.textContent ?? "").join("\0");
  if (listFingerprints.get(container) === fingerprint) return;
  listFingerprints.set(container, fingerprint);
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
  dismiss.setAttribute("aria-label", "Dismiss tip");
  dismiss.addEventListener("click", () => {
    dismissGettingStarted();
    onDismiss();
  });

  const heading = document.createElement("h2");
  heading.className = "overview-getting-started-title";
  heading.textContent = "Ready when you are";

  const desc = document.createElement("p");
  desc.className = "overview-getting-started-desc";
  desc.textContent =
    "Create an issue in Linear, move it into progress, and Risoluto picks it up on the next poll. This page becomes your live control room the moment work begins.";

  const steps = document.createElement("div");
  steps.className = "overview-getting-started-steps";

  const stepItems = [
    { n: "1", text: "Create an issue in Linear" },
    { n: "2", text: "Move it to In Progress" },
    { n: "3", text: "Watch the first run land here" },
  ];

  for (const s of stepItems) {
    const step = document.createElement("div");
    step.className = "overview-getting-started-step delight-stagger";
    step.style.setProperty("--step-index", s.n);
    const dot = document.createElement("span");
    dot.className = "overview-getting-started-step-n";
    dot.textContent = s.n;
    const label = document.createElement("span");
    label.textContent = s.text;
    step.append(dot, label);
    steps.append(step);
  }

  const cta = document.createElement("div");
  cta.className = "overview-getting-started-actions";

  const setupBtn = document.createElement("button");
  setupBtn.className = "mc-button is-ghost is-sm";
  setupBtn.type = "button";
  setupBtn.textContent = "Review setup";
  setupBtn.addEventListener("click", () => {
    router.navigate("/setup");
  });

  cta.append(setupBtn);

  card.append(dismiss, heading, desc, steps, cta);
  return card;
}

export function createOverviewPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "page overview-page fade-in";

  // Hero metrics band - the strong top "Now" strip
  const { band: heroBand, state: heroState, detail: heroDetail, metrics: heroMetrics } = createHeroMetricsBand();
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
  const attentionHeader = createSectionHeader("Needs action", "Focus now");
  const attentionCount = document.createElement("span");
  attentionCount.className = "overview-attention-count";
  attentionCount.hidden = true;
  attentionHeader.append(attentionCount);
  attentionZone.append(attentionHeader);

  const attentionContext = document.createElement("p");
  attentionContext.className = "overview-attention-context";
  attentionZone.append(attentionContext);

  const attentionList = document.createElement("div");
  attentionList.className = "overview-attention-list";
  attentionZone.append(attentionList);

  const secondary = document.createElement("aside");
  secondary.className = "overview-secondary";

  // Read persisted collapse state once
  const collapsedSections = readCollapsedSections();

  // System health section — collapsible
  const healthCollapsible = createCollapsibleSection("health", "System health", "Watchdog", collapsedSections);
  healthCollapsible.section.classList.add("overview-health-section");
  const { root: healthBadge, update: updateHealthBadge } = createSystemHealthBadge();
  const { root: webhookPanel, update: updateWebhookPanel } = createWebhookHealthPanel();
  healthCollapsible.body.append(healthBadge, webhookPanel);
  secondary.append(healthCollapsible.section);

  // Token burn section — collapsible
  const tokenCollapsible = createCollapsibleSection("tokens", "Token burn", "This session", collapsedSections);
  tokenCollapsible.section.classList.add("overview-token-section");

  const tokenGrid = document.createElement("div");
  tokenGrid.className = "overview-token-grid";

  const inputTokens = createLiveMetric("Input");
  const outputTokens = createLiveMetric("Output");
  const totalTokens = createLiveMetric("Total");
  const runtime = createLiveMetric("Runtime");
  const cost = createLiveMetric("Cost");

  tokenGrid.append(inputTokens.root, outputTokens.root, totalTokens.root, runtime.root, cost.root);
  tokenCollapsible.body.append(tokenGrid);
  secondary.append(tokenCollapsible.section);

  // Stall events section — collapsible
  const stallCollapsible = createCollapsibleSection("stalls", "Recovered stalls", "Watchdog", collapsedSections);
  stallCollapsible.section.classList.add("overview-stall-section");
  const { root: stallList, update: updateStallEvents } = createStallEventsTable();
  stallCollapsible.body.append(stallList);
  secondary.append(stallCollapsible.section);

  // Recent events section — collapsible
  const recentCollapsible = createCollapsibleSection("recent", "Latest activity", "Events", collapsedSections);
  recentCollapsible.section.classList.add("overview-recent-section");

  const recentList = document.createElement("div");
  recentList.className = "overview-events";
  recentCollapsible.body.append(recentList);

  // Terminal issues section — collapsible
  const terminalCollapsible = createCollapsibleSection("terminal", "Recently finished", "Outcomes", collapsedSections);
  terminalCollapsible.section.classList.add("overview-terminal-section");

  const terminalList = document.createElement("div");
  terminalList.className = "overview-list";
  terminalCollapsible.body.append(terminalList);

  // Assemble main grid
  mainGrid.append(attentionZone, secondary);
  page.append(mainGrid);

  const lowerGrid = document.createElement("section");
  lowerGrid.className = "overview-lower-grid";
  lowerGrid.append(recentCollapsible.section, terminalCollapsible.section);
  page.append(lowerGrid);

  // Loading state
  const loadingSections = [
    attentionZone,
    tokenCollapsible.section,
    recentCollapsible.section,
    terminalCollapsible.section,
    healthCollapsible.section,
    stallCollapsible.section,
  ];
  for (const section of loadingSections) {
    section.setAttribute("aria-busy", "true");
  }

  /** Updates the one-line summary text on each collapsible section header. */
  function updateCollapsibleSummaries(snapshot: NonNullable<AppState["snapshot"]>, terminalCount?: number): void {
    healthCollapsible.summary.textContent = snapshot.system_health ? snapshot.system_health.status : "healthy";

    const totalCost = formatCostUsd(snapshot.codex_totals.cost_usd);
    const totalRuntime = formatDuration(snapshot.codex_totals.seconds_running);
    tokenCollapsible.summary.textContent =
      snapshot.codex_totals.cost_usd > 0 ? `${totalCost} \u00B7 ${totalRuntime}` : "no usage";

    const stallCount = snapshot.stall_events?.length ?? 0;
    stallCollapsible.summary.textContent =
      stallCount > 0 ? `${stallCount} event${stallCount === 1 ? "" : "s"}` : "none";

    const eventCount = (snapshot.recent_events ?? []).length;
    recentCollapsible.summary.textContent = eventCount > 0 ? `${eventCount} recent` : "none";

    const tc = terminalCount ?? latestTerminalIssues(snapshot.completed ?? []).length;
    terminalCollapsible.summary.textContent = tc > 0 ? `${tc} issue${tc === 1 ? "" : "s"}` : "none";
  }

  /** Fills empty list containers with teaching empty-state cards. */
  function renderEmptyStates(): void {
    if (attentionList.childElementCount === 0) {
      attentionList.replaceChildren(
        createTeachingEmptyState(
          "All clear",
          "Blocked, retrying, or stalled work will appear here the moment it needs your attention.",
          "Open queue",
          () => router.navigate("/queue"),
        ),
      );
    }

    if (recentList.childElementCount === 0) {
      recentList.replaceChildren(
        createTeachingEmptyState(
          "No activity yet",
          "Workflow events will stream in here once Risoluto starts processing issues.",
        ),
      );
    }

    if (terminalList.childElementCount === 0) {
      terminalList.replaceChildren(
        createTeachingEmptyState(
          "No finished issues yet",
          "Completed and failed issues will appear here after the first run finishes.",
        ),
      );
    }
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
    const currentMoment = describeCurrentMoment(snapshot, attentionIssues.length);
    setTextWithDiff(heroState, currentMoment.state);
    setTextWithDiff(heroDetail, currentMoment.detail);
    setTextWithDiff(heroMetrics.attention, String(attentionIssues.length));
    setTextWithDiff(attentionContext, describeAttentionZone(attentionIssues.length));
    if (attentionIssues.length === 0) {
      attentionCount.hidden = true;
      attentionCount.textContent = "";
    } else {
      attentionCount.hidden = false;
      setTextWithDiff(attentionCount, `${attentionIssues.length} live`);
    }

    // Token burn metrics
    setTextWithDiff(inputTokens.value, formatCompactNumber(snapshot.codex_totals.input_tokens));
    setTextWithDiff(outputTokens.value, formatCompactNumber(snapshot.codex_totals.output_tokens));
    setTextWithDiff(totalTokens.value, formatCompactNumber(snapshot.codex_totals.total_tokens));
    setTextWithDiff(runtime.value, formatDuration(snapshot.codex_totals.seconds_running));
    setTextWithDiff(cost.value, formatCostUsd(snapshot.codex_totals.cost_usd));

    // Attention list - primary zone
    attentionZone.classList.toggle("is-all-clear", attentionIssues.length === 0);
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
      (snapshot.recent_events ?? []).slice(-4).map((event) => createEventRow(event, true)),
    );

    // Terminal issues — compute once, reuse for summary + rows
    const terminalIssues = latestTerminalIssues(snapshot.completed ?? []);
    const terminalRows = terminalIssues.slice(0, 4).map((issue) => {
      const row = issueRow(issue, "terminal");
      if (issue.status === "completed" || issue.status === "closed") {
        row.classList.add("delight-entered");
      }
      return row;
    });
    fillList(terminalList, terminalRows);

    // System health badge
    updateHealthBadge(snapshot.system_health);

    // Webhook health panel
    updateWebhookPanel(snapshot.webhook_health);

    // Stall events table
    updateStallEvents(snapshot.stall_events);

    // Update collapsible summaries and empty states
    updateCollapsibleSummaries(snapshot, terminalIssues.length);
    renderEmptyStates();
  }

  const handler = (event: Event): void => renderSnapshot((event as CustomEvent<AppState>).detail);
  globalThis.addEventListener("state:update", handler);

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
  globalThis.addEventListener("risoluto:webhook-health-changed", webhookHealthHandler);
  globalThis.addEventListener("risoluto:webhook-received", webhookReceivedHandler);

  renderSnapshot(store.getState());
  registerPageCleanup(page, () => {
    globalThis.removeEventListener("state:update", handler);
    globalThis.removeEventListener("risoluto:webhook-health-changed", webhookHealthHandler);
    globalThis.removeEventListener("risoluto:webhook-received", webhookReceivedHandler);
  });

  return page;
}
