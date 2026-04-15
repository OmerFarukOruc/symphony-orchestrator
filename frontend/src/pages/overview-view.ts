import { router } from "../router";
import { getRuntimeClient } from "../state/runtime-client";
import type { AppState } from "../state/store";
import type { WebhookHealth } from "../types/runtime.js";
import { createEventRow } from "../components/event-row";
import { createSystemHealthBadge } from "../components/system-health-badge";
import { createWebhookHealthPanel } from "../components/webhook-health-panel";
import { createStallEventsTable } from "../components/stall-events-table";
import { buildAttentionList, latestTerminalIssues } from "../utils/issues";
import { formatCompactNumber, formatCostUsd, formatDuration, formatRateLimitHeadroom } from "../utils/format";
import { setTextWithDiff } from "../utils/diff";
import { registerPageCleanup } from "../utils/page";
import { describeCurrentMoment } from "./overview-descriptions.js";
import { createHeroMetricsBand, createLiveMetric } from "./overview-hero.js";
import { readCollapsedSections, createSectionHeader, createCollapsibleSection } from "./overview-sections.js";
import { issueRow, fillList } from "./overview-rows.js";
import { isGettingStartedDismissed, createTeachingEmptyState, createGettingStartedCard } from "./overview-empty.js";

export function createOverviewPage(): HTMLElement {
  const runtimeClient = getRuntimeClient();
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
  const attentionHeader = createSectionHeader("Needs review", "Review first");
  const attentionCount = document.createElement("span");
  attentionCount.className = "overview-attention-count";
  attentionCount.hidden = true;
  attentionHeader.append(attentionCount);
  attentionZone.append(attentionHeader);

  const attentionList = document.createElement("div");
  attentionList.className = "overview-attention-list";
  attentionZone.append(attentionList);

  const secondary = document.createElement("aside");
  secondary.className = "overview-secondary";

  // Read persisted collapse state once
  const collapsedSections = readCollapsedSections();

  // System health section — collapsible
  const healthCollapsible = createCollapsibleSection("health", "System health", "Live checks", collapsedSections);
  healthCollapsible.section.classList.add("overview-health-section");
  const { root: healthBadge, update: updateHealthBadge } = createSystemHealthBadge();
  const { root: webhookPanel, update: updateWebhookPanel } = createWebhookHealthPanel();
  healthCollapsible.body.append(healthBadge, webhookPanel);
  secondary.append(healthCollapsible.section);

  // Token burn section — collapsible
  const tokenCollapsible = createCollapsibleSection("tokens", "Session usage", "This session", collapsedSections);
  tokenCollapsible.section.classList.add("overview-token-section");

  const tokenGrid = document.createElement("div");
  tokenGrid.className = "overview-token-grid";

  const inputTokens = createLiveMetric("Input");
  const outputTokens = createLiveMetric("Output");
  const runtime = createLiveMetric("Runtime");
  const cost = createLiveMetric("Cost");

  tokenGrid.append(inputTokens.root, outputTokens.root, runtime.root, cost.root);
  tokenCollapsible.body.append(tokenGrid);
  secondary.append(tokenCollapsible.section);

  // Stall events section — collapsible
  const stallCollapsible = createCollapsibleSection("stalls", "Recovered stalls", "Recovery log", collapsedSections);
  stallCollapsible.section.classList.add("overview-stall-section");
  const { root: stallList, update: updateStallEvents } = createStallEventsTable();
  stallCollapsible.body.append(stallList);
  secondary.append(stallCollapsible.section);

  // Recent events section — collapsible
  const recentCollapsible = createCollapsibleSection("recent", "Latest activity", "Live feed", collapsedSections);
  recentCollapsible.section.classList.add("overview-recent-section");

  const recentList = document.createElement("div");
  recentList.className = "overview-events";
  recentList.tabIndex = 0;
  recentList.setAttribute("role", "log");
  recentList.setAttribute("aria-label", "Latest activity events");
  recentCollapsible.body.append(recentList);

  // Terminal issues section — collapsible
  const terminalCollapsible = createCollapsibleSection("terminal", "Finished recently", "Last runs", collapsedSections);
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
    const healthStatus = snapshot.system_health ? snapshot.system_health.status : "healthy";
    healthCollapsible.summary.textContent = healthStatus;

    const totalCost = formatCostUsd(snapshot.codex_totals.cost_usd);
    const totalRuntime = formatDuration(snapshot.codex_totals.seconds_running);
    tokenCollapsible.summary.textContent =
      (snapshot.codex_totals.cost_usd ?? 0) > 0 ? `${totalCost} \u00B7 ${totalRuntime}` : "no usage";

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
          "Blocked, retrying, or decision-ready work will appear here the moment it needs review.",
          "Open board",
          () => router.navigate("/queue"),
        ),
      );
    }

    if (recentList.childElementCount === 0) {
      recentList.replaceChildren(
        createTeachingEmptyState(
          "No activity yet",
          "Workflow events will stream in here once Risoluto starts processing work.",
        ),
      );
    }

    if (terminalList.childElementCount === 0) {
      terminalList.replaceChildren(
        createTeachingEmptyState(
          "No finished runs yet",
          "Completed and failed runs will appear here after the first issue finishes.",
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

    const attentionIssues = buildAttentionList(snapshot.workflow_columns ?? []);
    const currentMoment = describeCurrentMoment(snapshot, attentionIssues.length);
    setTextWithDiff(heroState, currentMoment.state);
    setTextWithDiff(heroDetail, currentMoment.detail);
    if (attentionIssues.length === 0) {
      attentionCount.hidden = true;
      attentionCount.textContent = "";
    } else {
      attentionCount.hidden = false;
      setTextWithDiff(attentionCount, `${attentionIssues.length} waiting`);
    }

    // Token burn metrics
    setTextWithDiff(inputTokens.value, formatCompactNumber(snapshot.codex_totals.input_tokens));
    setTextWithDiff(outputTokens.value, formatCompactNumber(snapshot.codex_totals.output_tokens));
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

  const onState = (state: AppState): void => renderSnapshot(state);
  const unsubscribeState = runtimeClient.subscribeState(onState);

  const unsubscribeWebhookHealth = runtimeClient.subscribeWebhookHealth((health) => {
    if (health && typeof health.status === "string") {
      updateWebhookPanel(health as WebhookHealth);
    }
  });
  const unsubscribeWebhookReceived = runtimeClient.subscribeWebhookReceived(() => {
    renderSnapshot(runtimeClient.getAppState());
  });

  renderSnapshot(runtimeClient.getAppState());
  registerPageCleanup(page, () => {
    unsubscribeState();
    unsubscribeWebhookHealth();
    unsubscribeWebhookReceived();
  });

  return page;
}
