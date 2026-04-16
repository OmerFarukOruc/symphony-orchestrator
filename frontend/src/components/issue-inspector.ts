import { api } from "../api";
import type { IssueDetail } from "../types";
import { router } from "../router";
import { statusChip } from "../ui/status-chip";
import { toast } from "../ui/toast";
import { skeletonCard } from "../ui/skeleton";
import { flashDiff, setTextWithDiff } from "../utils/diff";
import {
  formatCompactNumber,
  computeDurationSeconds,
  formatCostUsd,
  formatDuration,
  formatTimestamp,
} from "../utils/format";
import { createEmptyState } from "./empty-state";
import { createMetric, createSummaryStat } from "./issue-inspector-common.js";
import { buildRetrySection } from "./issue-inspector-retry-section.js";
import {
  buildActivitySection,
  buildAttemptsSection,
  buildDescriptionSection,
  buildModelSection,
  buildSteerSection,
  buildWorkspaceSection,
} from "./issue-inspector-sections";
import { createIssueAbortAction } from "./issue-inspector-abort";
import { createLiveLog } from "./live-log.js";
import { getRuntimeClient } from "../state/runtime-client.js";

interface IssueInspectorOptions {
  mode: "page" | "drawer";
  initialId?: string;
  onClose?: () => void;
}

function buildLiveLogSection(logEl: HTMLElement, isLive: boolean): HTMLElement {
  const section = document.createElement("section");
  const surface = isLive ? "mc-live-panel" : "mc-panel";
  section.className = `issue-section ${surface} issue-live-log-section expand-in${isLive ? " is-live" : ""}`;
  const title = Object.assign(document.createElement("h2"), {
    textContent: isLive ? "Live log" : "Latest log",
  });
  section.append(title, logEl);
  return section;
}

function composeModelSummary(detail: IssueDetail): string {
  const model = detail.model ?? "—";
  const reasoning = detail.reasoningEffort ?? null;
  if (!reasoning || reasoning === "none" || reasoning === "—") {
    return model;
  }
  return `${model} · ${reasoning}`;
}

function computeTotalCostUsd(detail: IssueDetail): number | null {
  return detail.attempts.reduce<number | null>((acc, attempt) => {
    if (attempt.costUsd === null || attempt.costUsd === undefined) return acc;
    return (acc ?? 0) + attempt.costUsd;
  }, null);
}

export function createIssueInspector(options: IssueInspectorOptions): {
  element: HTMLElement;
  load: (id: string) => Promise<void>;
  destroy: () => void;
} {
  const runtimeClient = getRuntimeClient();
  const isPage = options.mode === "page";
  const root = document.createElement("div");
  root.className = isPage
    ? "issue-page issue-inspector-shell"
    : "issue-inspector issue-inspector-shell queue-drawer drawer";

  const identifier = Object.assign(document.createElement("div"), {
    className: "issue-identifier",
  });
  const title = Object.assign(document.createElement("h1"), {
    className: isPage ? "issue-title heading-display" : "issue-title",
  });
  const updatedAt = document.createElement("span");
  updatedAt.className = "issue-updated text-tertiary";
  const statusSlot = document.createElement("div");
  statusSlot.className = "issue-status-slot";

  const logsLink = Object.assign(document.createElement("a"), {
    className: "mc-button is-primary",
    textContent: "Open logs",
  });
  logsLink.setAttribute("aria-label", "Open issue logs");
  const trackerLink = Object.assign(document.createElement("a"), {
    className: "mc-button is-ghost",
    target: "_blank",
    rel: "noreferrer",
    textContent: "Open tracker",
  });
  trackerLink.setAttribute("aria-label", "Open issue in tracker");
  const abortAction = createIssueAbortAction({ requestRefresh: refresh });

  const drawerHeader = document.createElement("section");
  const drawerSummary = document.createElement("section");
  const drawerContent = document.createElement("div");
  const workLane = document.createElement("div");
  const briefLane = document.createElement("div");

  const summaryStats = {
    priority: createSummaryStat("Priority"),
    model: createSummaryStat("Model"),
    tokens: createSummaryStat("Tokens"),
    duration: createSummaryStat("Duration"),
  };

  const metrics = {
    priority: createMetric("Priority"),
    model: createMetric("Model"),
    reasoning: createMetric("Reasoning"),
    tokens: createMetric("Tokens"),
    duration: createMetric("Duration"),
    cost: createMetric("Cost"),
    lastEvent: createMetric("Last event"),
  };

  let currentId = options.initialId ?? "";

  if (isPage) {
    const command = document.createElement("section");
    command.className = "issue-command mc-command";

    const commandHead = document.createElement("div");
    commandHead.className = "issue-command-head";

    const identity = document.createElement("div");
    identity.className = "issue-command-identity";
    const eyebrow = document.createElement("div");
    eyebrow.className = "issue-eyebrow";
    eyebrow.append(identifier);
    identity.append(eyebrow, title);

    const commandActions = document.createElement("div");
    commandActions.className = "issue-command-actions";
    commandActions.append(abortAction.button, logsLink, trackerLink);

    commandHead.append(identity, commandActions);

    const statusLine = document.createElement("div");
    statusLine.className = "issue-status-line";
    statusLine.append(statusSlot, updatedAt);

    const metricsList = document.createElement("dl");
    metricsList.className = "issue-metrics";
    metricsList.append(
      metrics.priority.element,
      metrics.model.element,
      metrics.reasoning.element,
      metrics.tokens.element,
      metrics.duration.element,
      metrics.cost.element,
      metrics.lastEvent.element,
    );

    command.append(commandHead, statusLine, metricsList);

    const body = document.createElement("div");
    body.className = "issue-body mc-layout is-split";
    workLane.className = "issue-lane issue-lane-work mc-lane is-primary";
    briefLane.className = "issue-lane issue-lane-brief mc-lane is-sidebar";
    body.append(workLane, briefLane);

    root.append(command, body);
  } else {
    drawerHeader.className = "issue-header issue-section mc-panel";
    drawerSummary.className = "issue-section mc-panel issue-summary-strip";
    drawerContent.className = "issue-inspector issue-inspector-body";

    const headerTop = document.createElement("div");
    headerTop.className = "issue-header-top";
    const titleBlock = document.createElement("div");
    titleBlock.className = "issue-header-title-block";
    const headerMeta = document.createElement("div");
    headerMeta.className = "issue-header-meta";
    titleBlock.append(identifier, title);
    headerTop.append(titleBlock);

    const headerActions = document.createElement("div");
    headerActions.className = "issue-header-actions";
    headerActions.append(abortAction.button, logsLink, trackerLink);

    headerMeta.append(statusSlot, updatedAt);

    const fullPageButton = document.createElement("button");
    fullPageButton.type = "button";
    fullPageButton.className = "mc-button is-ghost";
    fullPageButton.textContent = "Open full issue";
    fullPageButton.setAttribute("aria-label", "Open full issue page");
    fullPageButton.addEventListener("click", () => {
      if (currentId) {
        router.navigate(`/issues/${currentId}`);
      }
    });
    headerActions.append(fullPageButton);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "mc-button is-ghost drawer-close-btn";
    closeBtn.setAttribute("aria-label", "Close panel");
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", () => options.onClose?.());
    drawerHeader.append(headerTop, headerMeta, headerActions, closeBtn);

    drawerSummary.replaceChildren(
      summaryStats.priority.element,
      summaryStats.model.element,
      summaryStats.tokens.element,
      summaryStats.duration.element,
    );

    root.append(drawerHeader, drawerSummary, drawerContent);
  }

  let hydrated = false;
  const liveLog = createLiveLog();
  let unsubscribeEvents: (() => void) | null = null;
  let unsubscribeLifecycle: (() => void) | null = null;

  function renderLoading(): void {
    if (isPage) {
      workLane.replaceChildren(skeletonCard(), skeletonCard(), skeletonCard());
      briefLane.replaceChildren(skeletonCard(), skeletonCard());
    } else {
      drawerContent.replaceChildren(skeletonCard(), skeletonCard(), skeletonCard());
    }
  }

  function renderError(message: string): void {
    const classified = classifyFetchError(message);
    const emptyState = createEmptyState(
      classified.title,
      classified.detail,
      classified.action,
      () => {
        if (classified.action === "Open board") {
          router.navigate("/queue");
        } else {
          void refresh();
        }
      },
      classified.variant,
    );
    if (isPage) {
      const command = root.querySelector(".issue-command");
      const body = root.querySelector(".issue-body");
      if (command instanceof HTMLElement) command.hidden = true;
      if (body instanceof HTMLElement) body.hidden = true;
      root.append(emptyState);
    } else {
      drawerHeader.hidden = true;
      drawerSummary.hidden = true;
      drawerContent.replaceChildren(emptyState);
    }
  }

  function classifyFetchError(message: string): {
    title: string;
    detail: string;
    action: string;
    variant: "notFound" | "serverError" | "timeout" | "error";
  } {
    const lower = (message ?? "").toLowerCase();
    if (lower.includes("404") || lower.includes("not found")) {
      return {
        title: "Issue not found",
        detail: "Check the identifier or return to the board. The issue may have been removed or deduped.",
        action: "Open board",
        variant: "notFound",
      };
    }
    if (lower.includes("timeout") || lower.includes("timed out")) {
      return {
        title: "Request timed out",
        detail: "The backend did not respond in time. Retry, or check Observability if this keeps happening.",
        action: "Retry",
        variant: "timeout",
      };
    }
    if (lower.includes("500") || lower.includes("server error") || lower.includes("internal")) {
      return {
        title: "Server error",
        detail: "The API returned an error. Retry once — if it persists, check Observability for degraded components.",
        action: "Retry",
        variant: "serverError",
      };
    }
    return {
      title: "Issue unavailable",
      detail:
        message || "This issue could not be loaded. It may have been removed, or the identifier may be incorrect.",
      action: "Retry",
      variant: "error",
    };
  }

  function setStaggerIndex(container: HTMLElement, startIndex = 0): void {
    Array.from(container.children).forEach((child, index) => {
      if (child instanceof HTMLElement) {
        child.style.setProperty("--stagger-index", String(startIndex + index));
      }
    });
  }

  function render(detail: IssueDetail, preserveScroll = false): void {
    const scrollTarget = isPage ? root.parentElement : drawerContent;
    const bodyScrollTop = preserveScroll && scrollTarget ? scrollTarget.scrollTop : 0;
    const previousTitle = title.textContent ?? "";

    setTextWithDiff(identifier, detail.identifier);
    setTextWithDiff(title, detail.title);
    setTextWithDiff(updatedAt, `Updated ${formatTimestamp(detail.updatedAt)}`);

    const nextStatus = statusChip(detail.status);
    if (isPage) {
      nextStatus.classList.add("is-lg");
    }
    statusSlot.replaceChildren(nextStatus);

    logsLink.href = `/issues/${detail.identifier}/logs`;
    trackerLink.href = detail.url ?? "#";
    trackerLink.hidden = !detail.url;
    abortAction.sync(detail);

    if (isPage) {
      const command = root.querySelector(".issue-command");
      const body = root.querySelector(".issue-body");
      if (command instanceof HTMLElement) command.hidden = false;
      if (body instanceof HTMLElement) body.hidden = false;
      const emptyState = root.querySelector(":scope > .mc-empty-state");
      if (emptyState) emptyState.remove();
      const durationSeconds = computeDurationSeconds(detail.startedAt, detail.updatedAt);
      metrics.priority.update(String(detail.priority ?? "—"));
      metrics.model.update(detail.model ?? "—");
      metrics.reasoning.update(detail.reasoningEffort ?? "—");
      metrics.tokens.update(formatCompactNumber(detail.tokenUsage?.totalTokens ?? null));
      metrics.duration.update(formatDuration(durationSeconds));
      metrics.cost.update(formatCostUsd(computeTotalCostUsd(detail)));
      metrics.lastEvent.update(formatTimestamp(detail.lastEventAt ?? detail.updatedAt));
    } else {
      drawerHeader.hidden = false;
      drawerSummary.hidden = false;
      summaryStats.priority.update(String(detail.priority ?? "—"));
      summaryStats.model.update(composeModelSummary(detail));
      summaryStats.tokens.update(formatCompactNumber(detail.tokenUsage?.totalTokens ?? null));
      summaryStats.duration.update(formatDuration(computeDurationSeconds(detail.startedAt, detail.updatedAt)));
    }

    const isActive = detail.status === "running" || detail.status === "retrying";
    const liveLogSection = isActive ? buildLiveLogSection(liveLog.el, detail.status === "running") : null;

    if (isPage) {
      const workSections = [
        buildDescriptionSection(detail),
        buildRetrySection(detail),
        buildSteerSection(detail),
        liveLogSection,
        buildActivitySection(detail),
        buildAttemptsSection(detail),
      ].filter((section): section is HTMLElement => section instanceof HTMLElement);
      const briefSections = [buildWorkspaceSection(detail), buildModelSection(detail)].filter(
        (section): section is HTMLElement => section instanceof HTMLElement,
      );
      const hadWork = workLane.children.length > 0;
      const hadBrief = briefLane.children.length > 0;
      if (hadWork) workSections.forEach((section) => section.classList.remove("expand-in"));
      if (hadBrief) briefSections.forEach((section) => section.classList.remove("expand-in"));
      workLane.replaceChildren(...workSections);
      briefLane.replaceChildren(...briefSections);
      setStaggerIndex(workLane);
      setStaggerIndex(briefLane, workSections.length);
      if (preserveScroll && scrollTarget) {
        scrollTarget.scrollTop = bodyScrollTop;
      }
    } else {
      const sections = [
        buildDescriptionSection(detail),
        buildRetrySection(detail),
        buildSteerSection(detail),
        liveLogSection,
        buildActivitySection(detail),
        buildWorkspaceSection(detail),
        buildModelSection(detail),
        buildAttemptsSection(detail),
      ].filter((section): section is HTMLElement => section instanceof HTMLElement);
      if (drawerContent.children.length > 0) {
        sections.forEach((section) => section.classList.remove("expand-in"));
      }
      drawerContent.replaceChildren(...sections);
      setStaggerIndex(drawerContent);
      if (preserveScroll) {
        drawerContent.scrollTop = bodyScrollTop;
      }
    }

    if (previousTitle && previousTitle !== detail.title) {
      const flashTarget = isPage ? root.querySelector(".issue-command") : drawerHeader;
      if (flashTarget instanceof HTMLElement) flashDiff(flashTarget);
    }
  }

  async function refresh(): Promise<void> {
    if (!currentId) {
      return;
    }
    const preserveScroll = hydrated;
    const lane = isPage ? workLane : drawerContent;
    if (!hydrated && lane.children.length === 0) {
      renderLoading();
    }
    try {
      const [detail, attempts] = await Promise.all([api.getIssue(currentId), api.getAttempts(currentId)]);
      hydrated = true;
      render({ ...detail, attempts: attempts.attempts, currentAttemptId: attempts.current_attempt_id }, preserveScroll);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load issue details.";
      if (hydrated) {
        toast(message, "error");
      } else {
        renderError(message);
      }
    }
  }

  async function load(id: string): Promise<void> {
    currentId = id;
    hydrated = false;
    abortAction.sync(null);
    if (isPage) {
      workLane.replaceChildren();
      briefLane.replaceChildren();
    } else {
      drawerContent.replaceChildren();
      drawerContent.scrollTop = 0;
    }
    liveLog.clear();
    unsubscribeEvents?.();
    unsubscribeEvents = runtimeClient.subscribeIssueEvents(id, (entry) => liveLog.append(entry));
    unsubscribeLifecycle?.();
    unsubscribeLifecycle = runtimeClient.subscribeIssueLifecycle(id, () => void refresh());
    await refresh();
  }

  function destroy(): void {
    unsubscribeEvents?.();
    unsubscribeEvents = null;
    unsubscribeLifecycle?.();
    unsubscribeLifecycle = null;
  }

  if (currentId) {
    void load(currentId);
  } else {
    identifier.textContent = "Inspector";
    title.textContent = "Select an issue to inspect";
    updatedAt.textContent = "Choose a card from the board.";
    if (!isPage) {
      drawerSummary.hidden = true;
    }
  }
  return { element: root, load, destroy };
}
