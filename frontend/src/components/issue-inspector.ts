import { api } from "../api";
import type { IssueDetail } from "../types";
import { router } from "../router";
import { statusChip } from "../ui/status-chip";
import { skeletonCard } from "../ui/skeleton";
import { flashDiff, setTextWithDiff } from "../utils/diff";
import { formatTimestamp } from "../utils/format";
import {
  buildActivitySection,
  buildAttemptsSection,
  createSummaryStat,
  buildDescriptionSection,
  buildHeaderActions,
  buildModelSection,
  buildWorkspaceSection,
} from "./issue-inspector-sections";

interface IssueInspectorOptions {
  mode: "page" | "drawer";
  initialId?: string;
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
  root.className = options.mode === "drawer" ? "issue-inspector mc-drawer" : "issue-page";
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
  const headerTop = document.createElement("div");
  headerTop.className = "issue-header-top";
  const updatedAt = document.createElement("div");
  const statusSlot = document.createElement("div");
  const logsLink = Object.assign(document.createElement("a"), {
    className: "mc-button mc-button-ghost",
    textContent: "View Logs",
  });
  const runsLink = Object.assign(document.createElement("a"), {
    className: "mc-button mc-button-ghost",
    textContent: "View Runs",
  });
  const fullPageButton = document.createElement("button");
  fullPageButton.type = "button";
  fullPageButton.className = "mc-button mc-button-ghost";
  fullPageButton.textContent = "Full Page";
  fullPageButton.addEventListener("click", () => {
    if (currentId) {
      router.navigate(`/issues/${currentId}`);
    }
  });
  const linearLink = Object.assign(document.createElement("a"), {
    className: "mc-button mc-button-ghost",
    target: "_blank",
    rel: "noreferrer",
    textContent: "Linear",
  });
  headerTop.append(updatedAt, statusSlot, logsLink, runsLink);
  if (options.mode === "drawer") {
    headerTop.append(fullPageButton);
  }
  header.append(identifier, title, headerTop);

  const summaryStats = {
    priority: createSummaryStat("Priority"),
    workflow: createSummaryStat("Workflow"),
    model: createSummaryStat("Model"),
    reasoning: createSummaryStat("Reasoning"),
    source: createSummaryStat("Override source"),
    retry: createSummaryStat("Retry ETA"),
  };
  summary.replaceChildren(
    summaryStats.priority.element,
    summaryStats.workflow.element,
    summaryStats.model.element,
    summaryStats.reasoning.element,
    summaryStats.source.element,
    summaryStats.retry.element,
  );

  let currentId = options.initialId ?? "";
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
    runsLink.href = `/issues/${detail.identifier}/runs`;
    linearLink.href = detail.url ?? "#";
    linearLink.hidden = !detail.url;
    if (detail.url && !headerTop.contains(linearLink)) {
      headerTop.append(linearLink);
    }
    if (!detail.url && headerTop.contains(linearLink)) {
      linearLink.remove();
    }

    const actions = buildHeaderActions(detail);
    const existingActions = header.querySelector(".mc-actions");
    if (existingActions) {
      existingActions.replaceWith(actions);
    } else {
      header.append(actions);
    }

    summaryStats.priority.update(detail.priority ?? "—");
    summaryStats.workflow.update(detail.state || "—");
    summaryStats.model.update(detail.model ?? "—");
    summaryStats.reasoning.update(detail.reasoningEffort ?? "—");
    summaryStats.source.update(detail.modelSource ?? "—");
    summaryStats.retry.update(detail.next_retry_due_at ? formatTimestamp(detail.next_retry_due_at) : "—");

    content.replaceChildren(
      buildDescriptionSection(detail),
      buildWorkspaceSection(detail),
      buildModelSection(detail),
      buildActivitySection(detail),
      buildAttemptsSection(detail),
    );
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
