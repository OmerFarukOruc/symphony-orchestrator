import type { AppState } from "../state/store";
import type { RuntimeIssueView, SystemHealth, StallEventView } from "../types";
import { createEventRow } from "../components/event-row";
import { latestTerminalIssues } from "../utils/issues";
import { formatCompactNumber, formatDuration, formatRateLimitHeadroom } from "../utils/format";
import { setTextWithDiff, flashDiff } from "../utils/diff";
import { router } from "../router";

interface OverviewDomRefs {
  heroMetrics: {
    running: HTMLElement;
    queued: HTMLElement;
    headroom: HTMLElement;
    attention: HTMLElement;
  };
  tokenMetrics: {
    input: HTMLElement;
    output: HTMLElement;
    total: HTMLElement;
    runtime: HTMLElement;
  };
  attentionList: HTMLElement;
  recentList: HTMLElement;
  terminalList: HTMLElement;
  loadingSections: HTMLElement[];
  updateHealthBadge: (health: SystemHealth | undefined) => void;
  updateStallEvents: (events: StallEventView[] | undefined) => void;
  showGettingStarted: () => void;
  hideGettingStarted: () => void;
}

export type { OverviewDomRefs };

/**
 * Fills a container with new child elements and applies a flash animation.
 */
function fillList(container: HTMLElement, items: HTMLElement[]): void {
  container.replaceChildren(...items);
  for (const item of items) {
    flashDiff(item);
  }
}

/**
 * Show skeleton placeholders in each section that hasn't loaded yet.
 */
export function renderLoadingState(refs: OverviewDomRefs): void {
  for (const section of refs.loadingSections) {
    if (section.childElementCount <= 1) {
      const skeleton = document.createElement("div");
      skeleton.className = "overview-skeleton";
      section.append(skeleton);
    }
  }
}

/**
 * Update the hero band and token burn KPIs from the latest snapshot.
 */
export function renderKpis(
  refs: OverviewDomRefs,
  snapshot: NonNullable<AppState["snapshot"]>,
  attentionCount: number,
): void {
  setTextWithDiff(refs.heroMetrics.running, String(snapshot.counts.running));
  setTextWithDiff(refs.heroMetrics.queued, String(snapshot.queued.length));
  setTextWithDiff(refs.heroMetrics.headroom, formatRateLimitHeadroom(snapshot.rate_limits));
  setTextWithDiff(refs.heroMetrics.attention, String(attentionCount));

  setTextWithDiff(refs.tokenMetrics.input, formatCompactNumber(snapshot.codex_totals.input_tokens));
  setTextWithDiff(refs.tokenMetrics.output, formatCompactNumber(snapshot.codex_totals.output_tokens));
  setTextWithDiff(refs.tokenMetrics.total, formatCompactNumber(snapshot.codex_totals.total_tokens));
  setTextWithDiff(refs.tokenMetrics.runtime, formatDuration(snapshot.codex_totals.seconds_running));
}

/**
 * Populate the attention, recent events, and terminal issues lists.
 */
export function renderLists(
  refs: OverviewDomRefs,
  snapshot: NonNullable<AppState["snapshot"]>,
  attentionIssues: RuntimeIssueView[],
  issueRowFn: (issue: RuntimeIssueView, target: "attention" | "terminal") => HTMLButtonElement,
): void {
  fillList(
    refs.attentionList,
    attentionIssues.map((issue) => issueRowFn(issue, "attention")),
  );

  fillList(
    refs.recentList,
    snapshot.recent_events.slice(-5).map((event) => createEventRow(event, true)),
  );

  fillList(
    refs.terminalList,
    latestTerminalIssues(snapshot.completed).map((issue) => issueRowFn(issue, "terminal")),
  );
}

/**
 * Show or hide the getting-started card based on dashboard emptiness.
 */
export function renderGettingStarted(
  refs: OverviewDomRefs,
  snapshot: NonNullable<AppState["snapshot"]>,
  attentionCount: number,
): void {
  const isEmpty =
    snapshot.counts.running === 0 &&
    snapshot.counts.retrying === 0 &&
    snapshot.queued.length === 0 &&
    snapshot.completed.length === 0 &&
    attentionCount === 0;
  if (isEmpty) {
    refs.showGettingStarted();
  } else {
    refs.hideGettingStarted();
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

/**
 * Insert teaching empty states for lists that have no content.
 */
export function renderEmptyStates(refs: OverviewDomRefs): void {
  if (refs.attentionList.childElementCount === 0) {
    refs.attentionList.replaceChildren(
      createTeachingEmptyState(
        "All clear",
        "No issues need attention right now. Blocked, retrying, or pending issues will appear here.",
        "Open queue",
        () => router.navigate("/queue"),
      ),
    );
  }

  if (refs.recentList.childElementCount === 0) {
    refs.recentList.replaceChildren(
      createTeachingEmptyState(
        "Awaiting activity",
        "Workflow events will appear here as the orchestrator processes issues.",
      ),
    );
  }

  if (refs.terminalList.childElementCount === 0) {
    refs.terminalList.replaceChildren(
      createTeachingEmptyState("No completed work yet", "Finished and failed issues will collect here for review."),
    );
  }
}
