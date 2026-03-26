import { api } from "../api";
import type { IssueDetail } from "../types";
import { router } from "../router";
import { statusChip } from "../ui/status-chip";
import { skeletonCard } from "../ui/skeleton";
import { flashDiff, setTextWithDiff } from "../utils/diff";
import { formatCompactNumber, computeDurationSeconds, formatDuration, formatTimestamp } from "../utils/format";
import { createSummaryStat } from "./issue-inspector-common.js";
import { buildRetrySection } from "./issue-inspector-retry-section.js";
import {
  buildActivitySection,
  buildAttemptsSection,
  buildDescriptionSection,
  buildModelSection,
  buildWorkspaceSection,
} from "./issue-inspector-sections";
import { createIssueAbortAction } from "./issue-inspector-abort";
import { createLiveLog } from "./live-log.js";
import { subscribeIssueEvents } from "../state/event-source.js";

interface IssueInspectorOptions {
  mode: "page" | "drawer";
  initialId?: string;
  onClose?: () => void;
}

function buildLiveLogSection(logEl: HTMLElement): HTMLElement {
  const section = document.createElement("section");
  section.className = "issue-section mc-panel expand-in";
  section.append(Object.assign(document.createElement("h2"), { textContent: "Live log" }));
  section.appendChild(logEl);
  return section;
}

export function createIssueInspector(options: IssueInspectorOptions): {
  element: HTMLElement;
  load: (id: string) => Promise<void>;
  destroy: () => void;
} {
  const root = document.createElement("div");
  root.className =
    options.mode === "drawer"
      ? "issue-inspector issue-inspector-shell queue-drawer drawer"
      : "issue-page issue-inspector-shell";
  const header = document.createElement("section");
  header.className = "issue-header issue-section mc-panel";
  const summary = document.createElement("section");
  summary.className = "issue-section mc-panel issue-summary-strip";
  const content = document.createElement("div");
  content.className = "issue-inspector issue-inspector-body";
  root.append(header, summary, content);

  const headerTop = document.createElement("div");
  headerTop.className = "issue-header-top";
  const titleBlock = document.createElement("div");
  titleBlock.className = "issue-header-title-block";
  const identifier = Object.assign(document.createElement("div"), {
    className: "issue-identifier",
  });
  const title = Object.assign(document.createElement("h1"), { className: "issue-title" });
  const headerMeta = document.createElement("div");
  headerMeta.className = "issue-header-meta";
  const statusSlot = document.createElement("div");
  const updatedAt = document.createElement("span");
  updatedAt.className = "text-secondary issue-updated-at";
  titleBlock.append(identifier, title);
  headerTop.append(titleBlock);

  // Primary actions row
  const headerActions = document.createElement("div");
  headerActions.className = "issue-header-actions";
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
  headerActions.append(abortAction.button, logsLink, trackerLink);

  headerMeta.append(statusSlot, updatedAt);

  let currentId = options.initialId ?? "";

  if (options.mode === "drawer") {
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
    header.append(headerTop, headerMeta, headerActions, closeBtn);
  } else {
    header.append(headerTop, headerMeta, headerActions);
  }

  const summaryStats = {
    priority: createSummaryStat("Priority"),
    model: createSummaryStat("Model"),
    tokens: createSummaryStat("Tokens"),
    duration: createSummaryStat("Duration"),
  };
  summary.replaceChildren(
    summaryStats.priority.element,
    summaryStats.model.element,
    summaryStats.tokens.element,
    summaryStats.duration.element,
  );

  let poll = 0;
  let hydrated = false;
  const liveLog = createLiveLog();
  let unsubscribeEvents: (() => void) | null = null;

  function renderLoading(): void {
    content.replaceChildren(skeletonCard(), skeletonCard(), skeletonCard());
  }

  function render(detail: IssueDetail, preserveScroll = false): void {
    const bodyScrollTop = preserveScroll ? content.scrollTop : 0;
    const previousTitle = title.textContent ?? "";
    setTextWithDiff(identifier, detail.identifier);
    setTextWithDiff(title, detail.title);
    setTextWithDiff(updatedAt, `Updated ${formatTimestamp(detail.updated_at ?? detail.updatedAt)}`);
    const nextStatus = statusChip(detail.status);
    statusSlot.replaceChildren(nextStatus);
    logsLink.href = `/issues/${detail.identifier}/logs`;
    trackerLink.href = detail.url ?? "#";
    trackerLink.hidden = !detail.url;
    abortAction.sync(detail);
    headerActions.hidden = false;
    summary.hidden = false;

    summaryStats.priority.update(String(detail.priority ?? "—"));
    summaryStats.model.update(detail.model ?? "—");
    summaryStats.tokens.update(formatCompactNumber(detail.tokenUsage?.totalTokens ?? null));
    summaryStats.duration.update(
      formatDuration(computeDurationSeconds(detail.startedAt, detail.updated_at ?? detail.updatedAt)),
    );

    const isActive = detail.status === "running" || detail.status === "retrying";
    const liveLogSection = isActive ? buildLiveLogSection(liveLog.el) : null;

    const sections = [
      buildDescriptionSection(detail),
      buildRetrySection(detail),
      liveLogSection,
      buildActivitySection(detail),
      buildWorkspaceSection(detail),
      buildModelSection(detail),
      buildAttemptsSection(detail),
    ].filter((section): section is HTMLElement => section instanceof HTMLElement);
    if (content.children.length > 0) {
      sections.forEach((section) => {
        section.classList.remove("expand-in");
      });
    }
    content.replaceChildren(...sections);
    Array.from(content.children).forEach((section, index) => {
      if (section instanceof HTMLElement) {
        section.style.setProperty("--stagger-index", String(index));
      }
    });
    if (preserveScroll) {
      content.scrollTop = bodyScrollTop;
    }
    if (previousTitle && previousTitle !== detail.title) {
      flashDiff(header);
    }
  }

  async function refresh(): Promise<void> {
    if (!currentId) {
      return;
    }
    const preserveScroll = hydrated;
    if (!hydrated) {
      renderLoading();
    }
    const [detail, attempts] = await Promise.all([api.getIssue(currentId), api.getAttempts(currentId)]);
    hydrated = true;
    render({ ...detail, attempts: attempts.attempts, currentAttemptId: attempts.current_attempt_id }, preserveScroll);
  }

  async function load(id: string): Promise<void> {
    currentId = id;
    hydrated = false;
    abortAction.sync(null);
    content.replaceChildren();
    content.scrollTop = 0;
    liveLog.clear();
    unsubscribeEvents?.();
    unsubscribeEvents = subscribeIssueEvents(id, (entry) => liveLog.append(entry));
    await refresh();
    window.clearInterval(poll);
    poll = window.setInterval(() => {
      void refresh();
    }, 10_000);
  }

  function destroy(): void {
    window.clearInterval(poll);
    unsubscribeEvents?.();
    unsubscribeEvents = null;
  }

  if (currentId) {
    void load(currentId);
  } else {
    identifier.textContent = "Inspector";
    title.textContent = "Select an issue to inspect";
    updatedAt.textContent = "Choose a card from the board.";
    headerActions.hidden = true;
    summary.hidden = true;
  }
  return { element: root, load, destroy };
}
