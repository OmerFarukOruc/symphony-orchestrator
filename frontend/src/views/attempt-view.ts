import { api } from "../api";
import { createEmptyState } from "../components/empty-state";
import { router } from "../router";
import { skeletonBlock, skeletonCard } from "../ui/skeleton";
import { statusChip } from "../ui/status-chip";
import { computeDurationSeconds, formatCompactNumber, formatDuration, formatTimestamp } from "../utils/format";
import { registerPageCleanup } from "../utils/page";
import type { AttemptRecord, IssueDetail } from "../types";
import { resolveIssueIdentifier } from "./attempt-utils";

function createValueLink(label: string, href: string): HTMLElement {
  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.className = "attempt-external-link text-mono";
  link.textContent = label;
  return link;
}

function createMetaItem(label: string, value: string | HTMLElement, mono = false): HTMLElement {
  const item = document.createElement("div");
  item.className = "attempt-meta-item";
  const name = document.createElement("span");
  name.className = "text-secondary";
  name.textContent = label;
  const body = document.createElement("strong");
  if (mono) {
    body.classList.add("text-mono");
  }
  if (typeof value === "string") {
    body.textContent = value;
  } else {
    body.replaceChildren(value);
  }
  item.append(name, body);
  return item;
}

function createSection(title: string, className = "attempt-section mc-panel"): HTMLElement {
  const section = document.createElement("section");
  section.className = className;
  const heading = document.createElement("h2");
  heading.textContent = title;
  section.append(heading);
  return section;
}

function renderLoading(): HTMLElement {
  const shell = document.createElement("div");
  shell.className = "page attempt-page fade-in";
  shell.append(skeletonBlock("72px"), skeletonCard(), skeletonBlock("120px"), skeletonBlock("120px"));
  return shell;
}

function createLinkButton(label: string, path: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mc-button mc-button-ghost";
  button.textContent = label;
  button.addEventListener("click", () => router.navigate(path));
  return button;
}

function renderAttemptPage(attempt: AttemptRecord, issue: IssueDetail | null): HTMLElement {
  const issueIdentifier = resolveIssueIdentifier(attempt, issue) ?? "Unknown issue";
  const issueTitle = attempt.title ?? issue?.title ?? "Archived attempt";
  const page = document.createElement("div");
  page.className = "page attempt-page fade-in";

  const header = document.createElement("section");
  header.className = "attempt-header mc-strip";
  const text = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "issue-identifier";
  eyebrow.textContent = issueIdentifier;
  const title = document.createElement("h1");
  title.className = "page-title";
  title.textContent = `${issueTitle} · Run #${attempt.attemptNumber}`;
  const subtitle = document.createElement("p");
  subtitle.className = "page-subtitle";
  subtitle.textContent = "Archived attempt metadata, routing, and workspace context for one complete run.";
  text.append(eyebrow, title, subtitle);
  const actions = document.createElement("div");
  actions.className = "mc-actions";
  if (resolveIssueIdentifier(attempt, issue)) {
    actions.append(createLinkButton(`Back to ${issueIdentifier}`, `/issues/${issueIdentifier}`));
  }
  header.append(text, actions);

  const summary = createSection("Summary strip", "attempt-summary-strip mc-panel");
  summary.append(
    createMetaItem("Status", statusChip(attempt.status)),
    createMetaItem("Duration", formatDuration(computeDurationSeconds(attempt.startedAt, attempt.endedAt)), true),
    createMetaItem("Started", formatTimestamp(attempt.startedAt), true),
    createMetaItem("Ended", formatTimestamp(attempt.endedAt), true),
    createMetaItem("Model", attempt.model ?? "—", true),
    createMetaItem(
      "Tokens",
      attempt.tokenUsage
        ? `${formatCompactNumber(attempt.tokenUsage.totalTokens)} total · ${formatCompactNumber(attempt.tokenUsage.inputTokens)} in · ${formatCompactNumber(attempt.tokenUsage.outputTokens)} out`
        : "—",
      true,
    ),
  );

  const workspace = createSection("Workspace / git");
  const workspaceGrid = document.createElement("div");
  workspaceGrid.className = "attempt-meta-grid";
  workspaceGrid.append(
    createMetaItem("Workspace path", attempt.workspacePath ?? "Not archived", true),
    createMetaItem("Workspace key", attempt.workspaceKey ?? "—", true),
    createMetaItem("Branch", issue?.branch_name ?? "—", true),
    createMetaItem(
      "Pull request",
      issue?.pull_request_url ? createValueLink(issue.pull_request_url, issue.pull_request_url) : "—",
      !issue?.pull_request_url,
    ),
  );
  workspace.append(workspaceGrid);

  const routing = createSection("Model routing");
  const routingGrid = document.createElement("div");
  routingGrid.className = "attempt-meta-grid";
  routingGrid.append(
    createMetaItem("Model", attempt.model ?? "—", true),
    createMetaItem("Reasoning effort", attempt.reasoningEffort ?? "—", true),
    createMetaItem("Model source", attempt.modelSource ?? issue?.modelSource ?? "archive", true),
  );
  routing.append(routingGrid);

  const ids = createSection("Thread + turn IDs");
  const idsGrid = document.createElement("div");
  idsGrid.className = "attempt-meta-grid";
  idsGrid.append(
    createMetaItem("Turn count", String(attempt.turnCount ?? 0), true),
    createMetaItem("Thread ID", attempt.threadId ?? "—", true),
    createMetaItem("Turn ID", attempt.turnId ?? "—", true),
  );
  ids.append(idsGrid);

  page.append(header, summary, workspace, routing, ids);
  if (attempt.errorMessage || attempt.errorCode) {
    const error = createSection("Error");
    const body = document.createElement("p");
    body.className = "attempt-error-copy";
    body.textContent = attempt.errorMessage ?? attempt.errorCode ?? "Unknown error";
    error.append(body);
    page.append(error);
  }
  return page;
}

export function createAttemptPage(attemptId: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "attempt-page-root";
  root.replaceChildren(renderLoading());
  let disposed = false;

  async function load(): Promise<void> {
    try {
      const attempt = await api.getAttemptDetail(attemptId);
      const issueIdentifier = resolveIssueIdentifier(attempt, null);
      const issue = issueIdentifier ? await api.getIssue(issueIdentifier).catch(() => null) : null;
      if (!disposed) {
        root.replaceChildren(renderAttemptPage(attempt, issue));
      }
    } catch (error) {
      if (!disposed) {
        root.replaceChildren(
          createEmptyState(
            "Attempt detail unavailable",
            error instanceof Error ? error.message : "Failed to load archived attempt detail.",
          ),
        );
      }
    }
  }

  void load();
  registerPageCleanup(root, () => {
    disposed = true;
  });
  return root;
}
