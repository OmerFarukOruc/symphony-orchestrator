import { api } from "../api";
import type { IssueDetail } from "../types";
import { router } from "../router";
import { statusChip } from "../ui/status-chip";
import { skeletonCard } from "../ui/skeleton";
import { flashDiff, setTextWithDiff } from "../utils/diff";
import { formatCompactNumber, computeDurationSeconds, formatDuration, formatTimestamp } from "../utils/format";
import {
  buildActivitySection,
  buildAttemptsSection,
  createSummaryStat,
  buildDescriptionSection,
  buildModelSection,
  buildWorkspaceSection,
} from "./issue-inspector-sections";

interface IssueInspectorOptions {
  mode: "page" | "drawer";
  initialId?: string;
  onClose?: () => void;
}

function mergeDetail(
  detail: IssueDetail,
  attempts: { attempts: IssueDetail["attempts"]; current_attempt_id: string | null },
): IssueDetail {
  return { ...detail, attempts: attempts.attempts, currentAttemptId: attempts.current_attempt_id };
}

export function createIssueInspector(options: IssueInspectorOptions): {
  element: HTMLElement;
  load: (id: string) => Promise<void>;
  destroy: () => void;
} {
  const root = document.createElement("div");
  root.className = options.mode === "drawer" ? "issue-inspector queue-drawer drawer" : "issue-page";
  const header = document.createElement("section");
  header.className = "issue-section mc-panel";
  const summary = document.createElement("section");
  summary.className = "issue-section mc-panel issue-summary-strip";
  const content = document.createElement("div");
  content.className = "issue-inspector";
  root.append(header, summary, content);

  const identifier = Object.assign(document.createElement("div"), {
    className: "issue-identifier",
  });
  const title = Object.assign(document.createElement("h1"), { className: "issue-title" });
  const headerMeta = document.createElement("div");
  headerMeta.className = "issue-header-meta";
  const statusSlot = document.createElement("div");
  const updatedAt = document.createElement("span");
  updatedAt.className = "text-secondary";

  // Primary actions row
  const headerActions = document.createElement("div");
  headerActions.className = "issue-header-actions";
  const logsLink = Object.assign(document.createElement("a"), {
    className: "mc-button mc-button-primary",
    textContent: "View Logs",
  });
  const linearLink = Object.assign(document.createElement("a"), {
    className: "mc-button mc-button-ghost",
    target: "_blank",
    rel: "noreferrer",
    textContent: "Linear",
  });
  headerActions.append(logsLink, linearLink);

  headerMeta.append(statusSlot, updatedAt);

  let currentId = options.initialId ?? "";

  if (options.mode === "drawer") {
    const fullPageButton = document.createElement("button");
    fullPageButton.type = "button";
    fullPageButton.className = "mc-button mc-button-ghost";
    fullPageButton.textContent = "Full Page";
    fullPageButton.addEventListener("click", () => {
      if (currentId) {
        router.navigate(`/issues/${currentId}`);
      }
    });
    headerActions.append(fullPageButton);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "mc-button mc-button-ghost drawer-close-btn";
    closeBtn.setAttribute("aria-label", "Close panel");
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", () => options.onClose?.());
    header.append(identifier, title, headerMeta, headerActions, closeBtn);
  } else {
    header.append(identifier, title, headerMeta, headerActions);
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

  function renderLoading(): void {
    content.replaceChildren(skeletonCard(), skeletonCard(), skeletonCard());
  }

  function render(detail: IssueDetail): void {
    const previousTitle = title.textContent ?? "";
    setTextWithDiff(identifier, detail.identifier);
    setTextWithDiff(title, detail.title);
    setTextWithDiff(updatedAt, formatTimestamp(detail.updated_at ?? detail.updatedAt));
    const nextStatus = statusChip(detail.status);
    statusSlot.replaceChildren(nextStatus);
    logsLink.href = `/issues/${detail.identifier}/logs`;
    linearLink.href = detail.url ?? "#";
    linearLink.hidden = !detail.url;

    summaryStats.priority.update(String(detail.priority ?? "—"));
    summaryStats.model.update(detail.model ?? "—");
    summaryStats.tokens.update(formatCompactNumber(detail.tokenUsage?.totalTokens ?? null));
    summaryStats.duration.update(formatDuration(computeDurationSeconds(detail.startedAt, detail.updated_at ?? detail.updatedAt)));

    // Section order: Description → Activity → Workspace/Git → Model Override → Attempts
    const sections = [
      buildDescriptionSection(detail),
      buildActivitySection(detail),
      buildWorkspaceSection(detail),
      buildModelSection(detail),
      buildAttemptsSection(detail),
    ];
    if (content.children.length > 0) {
      sections.forEach((s) => s.classList.remove("expand-in"));
    }
    content.replaceChildren(...sections);
    Array.from(content.children).forEach((section, index) => {
      if (section instanceof HTMLElement) {
        section.style.setProperty("--stagger-index", String(index));
      }
    });
    if (previousTitle && previousTitle !== detail.title) {
      flashDiff(header);
    }
  }

  async function refresh(): Promise<void> {
    if (!currentId) {
      return;
    }
    if (!hydrated) {
      renderLoading();
    }
    const [detail, attempts] = await Promise.all([api.getIssue(currentId), api.getAttempts(currentId)]);
    hydrated = true;
    render(mergeDetail(detail, attempts));
  }

  async function load(id: string): Promise<void> {
    currentId = id;
    hydrated = false;
    content.replaceChildren();
    await refresh();
    window.clearInterval(poll);
    poll = window.setInterval(() => {
      void refresh();
    }, 10_000);
  }

  function destroy(): void {
    window.clearInterval(poll);
  }

  if (currentId) {
    void load(currentId);
  } else {
    header.textContent = "Select an issue";
  }
  return { element: root, load, destroy };
}