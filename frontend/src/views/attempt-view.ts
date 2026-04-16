import { api } from "../api";
import { createEmptyState } from "../components/empty-state";
import { createPageHeader } from "../components/page-header";
import { router } from "../router";
import { skeletonBlock, skeletonCard } from "../ui/skeleton";
import { statusChip } from "../ui/status-chip";
import { formatCompactNumber, formatCostUsd, formatRunDuration, formatTimestamp } from "../utils/format";
import { registerPageCleanup } from "../utils/page";
import type { AttemptAppServer, AttemptCheckpointRecord, AttemptRecord, IssueDetail } from "../types";
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

function formatListValue(values: string[] | null | undefined): string {
  if (!values || values.length === 0) {
    return "—";
  }
  return values.join(", ");
}

function formatJsonValue(value: Record<string, unknown> | null | undefined): string {
  if (!value) {
    return "{}";
  }
  return JSON.stringify(value, null, 2);
}

function createJsonBlock(label: string, value: Record<string, unknown>): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "attempt-json-block-wrap";

  const title = document.createElement("strong");
  title.className = "attempt-json-block-title";
  title.textContent = label;

  const block = document.createElement("pre");
  block.className = "attempt-json-block";
  block.textContent = formatJsonValue(value);

  wrapper.append(title, block);
  return wrapper;
}

function humanizeTrigger(trigger: string): string {
  return trigger
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => (part === "pr" ? "PR" : part[0]?.toUpperCase() + part.slice(1)))
    .join(" ");
}

function createSummaryContent(summary: string): HTMLElement {
  const lines = summary
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const bulletLines = lines.filter((line) => line.startsWith("- ") || line.startsWith("* "));
  if (lines.length > 0 && bulletLines.length === lines.length) {
    const list = document.createElement("ul");
    list.className = "attempt-pr-summary-list";
    for (const line of bulletLines) {
      const item = document.createElement("li");
      item.textContent = line.slice(2).trim();
      list.append(item);
    }
    return list;
  }
  const block = document.createElement("pre");
  block.className = "attempt-pr-summary-markdown";
  block.textContent = summary;
  return block;
}

function buildPrSummarySection(attempt: AttemptRecord): HTMLElement | null {
  const summary = attempt.summary?.trim();
  if (!summary) {
    return null;
  }
  const section = createSection("Agent-authored PR summary");
  section.append(createSummaryContent(summary));
  return section;
}

function formatCheckpointMetadataValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null || value === undefined) {
    return "—";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createCheckpointCard(checkpoint: AttemptCheckpointRecord): HTMLElement {
  const card = document.createElement("article");
  card.className = "attempt-checkpoint-card";

  const header = document.createElement("div");
  header.className = "attempt-checkpoint-header";
  const title = document.createElement("div");
  title.className = "attempt-checkpoint-title";
  title.append(
    Object.assign(document.createElement("strong"), {
      className: "text-mono",
      textContent: `#${checkpoint.ordinal}`,
    }),
    Object.assign(document.createElement("span"), {
      className: "attempt-checkpoint-trigger",
      textContent: humanizeTrigger(checkpoint.trigger),
    }),
  );
  header.append(title, statusChip(checkpoint.status));

  const grid = document.createElement("div");
  grid.className = "attempt-meta-grid";
  grid.append(
    createMetaItem("Created", formatTimestamp(checkpoint.createdAt), true),
    createMetaItem("Turns", String(checkpoint.turnCount), true),
    createMetaItem(
      "Tokens",
      checkpoint.tokenUsage
        ? `${formatCompactNumber(checkpoint.tokenUsage.totalTokens)} total · ${formatCompactNumber(checkpoint.tokenUsage.inputTokens)} in · ${formatCompactNumber(checkpoint.tokenUsage.outputTokens)} out`
        : "—",
      true,
    ),
    createMetaItem("Event cursor", checkpoint.eventCursor === null ? "—" : String(checkpoint.eventCursor), true),
    createMetaItem("Thread ID", checkpoint.threadId ?? "—", true),
    createMetaItem("Turn ID", checkpoint.turnId ?? "—", true),
  );
  card.append(header, grid);

  const metadataEntries = Object.entries(checkpoint.metadata ?? {});
  if (metadataEntries.length > 0) {
    const metadata = document.createElement("dl");
    metadata.className = "attempt-checkpoint-metadata";
    for (const [key, value] of metadataEntries) {
      const term = document.createElement("dt");
      term.textContent = key;
      const description = document.createElement("dd");
      description.textContent = formatCheckpointMetadataValue(value);
      metadata.append(term, description);
    }
    card.append(metadata);
  }

  return card;
}

function buildCheckpointHistorySection(checkpoints: AttemptCheckpointRecord[]): HTMLElement {
  const section = createSection("Checkpoint history");
  const sorted = [...checkpoints].sort((left, right) => left.ordinal - right.ordinal);
  if (sorted.length === 0) {
    section.append(
      Object.assign(document.createElement("p"), {
        className: "text-secondary",
        textContent: "No checkpoint history was recorded for this run.",
      }),
    );
    return section;
  }

  const latest = sorted.at(-1) ?? null;
  const strip = document.createElement("div");
  strip.className = "attempt-summary-strip attempt-checkpoint-strip";
  strip.append(
    createMetaItem("Checkpoints", String(sorted.length), true),
    createMetaItem("Latest trigger", latest ? humanizeTrigger(latest.trigger) : "—"),
    createMetaItem("Latest write", latest ? formatTimestamp(latest.createdAt) : "—", true),
  );

  const list = document.createElement("div");
  list.className = "attempt-checkpoint-list";
  for (const checkpoint of sorted) {
    list.append(createCheckpointCard(checkpoint));
  }

  section.append(strip, list);
  return section;
}

function buildAppServerSection(appServer: AttemptAppServer | undefined): HTMLElement {
  const section = createSection("Codex app-server session");
  const intro = document.createElement("p");
  intro.className = "text-secondary";
  intro.textContent =
    "Latest archived app-server config, thread status, and runtime requirements captured for this run.";
  section.append(intro);

  if (!appServer) {
    section.append(
      Object.assign(document.createElement("p"), {
        className: "text-secondary",
        textContent: "This attempt was archived before app-server introspection was recorded.",
      }),
    );
    return section;
  }

  const grid = document.createElement("div");
  grid.className = "attempt-meta-grid";
  grid.append(
    createMetaItem("Provider", appServer.effectiveProvider ?? "—", true),
    createMetaItem("Effective model", appServer.effectiveModel ?? "—", true),
    createMetaItem("Reasoning effort", appServer.reasoningEffort ?? "—", true),
    createMetaItem("Approval policy", appServer.approvalPolicy ?? "—", true),
    createMetaItem("Thread name", appServer.threadName ?? "—"),
    createMetaItem("Thread status", appServer.threadStatus ?? "—", true),
    createMetaItem("Allowed approval policies", formatListValue(appServer.allowedApprovalPolicies), true),
    createMetaItem("Allowed sandbox modes", formatListValue(appServer.allowedSandboxModes), true),
  );
  section.append(grid);

  const details = document.createElement("div");
  details.className = "attempt-detail-stack";
  if (appServer.threadStatusPayload) {
    details.append(createJsonBlock("Thread status payload", appServer.threadStatusPayload));
  }
  if (appServer.networkRequirements) {
    details.append(createJsonBlock("Network requirements", appServer.networkRequirements));
  }
  if (details.childElementCount > 0) {
    section.append(details);
  }

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
  button.className = "mc-button is-ghost";
  button.textContent = label;
  button.addEventListener("click", () => router.navigate(path));
  return button;
}

function renderAttemptPage(
  attempt: AttemptRecord,
  issue: IssueDetail | null,
  checkpoints: AttemptCheckpointRecord[],
): HTMLElement {
  const issueIdentifier = resolveIssueIdentifier(attempt, issue) ?? "Unknown issue";
  const issueTitle = attempt.title ?? issue?.title ?? "Archived attempt";
  const page = document.createElement("div");
  page.className = "page attempt-page fade-in";

  const actions = document.createElement("div");
  actions.className = "mc-actions";
  if (resolveIssueIdentifier(attempt, issue)) {
    actions.append(createLinkButton(`Back to ${issueIdentifier}`, `/issues/${issueIdentifier}`));
  }
  const header = createPageHeader(
    `${issueTitle} · Run #${attempt.attemptNumber ?? "—"}`,
    "Archived attempt metadata, routing, and workspace context for one complete run.",
    {
      eyebrow: issueIdentifier,
      actions,
      className: "attempt-header",
    },
  );

  const summary = createSection("Run summary", "attempt-summary-strip mc-panel");
  summary.append(
    createMetaItem("Status", statusChip(attempt.status)),
    createMetaItem("Duration", formatRunDuration(attempt.startedAt, attempt.endedAt), true),
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
    createMetaItem("Cost", formatCostUsd(attempt.costUsd ?? null), true),
  );

  const workspace = createSection("Workspace / git");
  const workspaceGrid = document.createElement("div");
  workspaceGrid.className = "attempt-meta-grid";
  workspaceGrid.append(
    createMetaItem("Workspace path", attempt.workspacePath ?? "Not archived", true),
    createMetaItem("Workspace key", attempt.workspaceKey ?? "—", true),
    createMetaItem("Branch", issue?.branchName ?? "—", true),
    createMetaItem(
      "Pull request",
      issue?.pullRequestUrl ? createValueLink(issue.pullRequestUrl, issue.pullRequestUrl) : "—",
      !issue?.pullRequestUrl,
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

  page.append(header, summary, workspace);
  const prSummary = buildPrSummarySection(attempt);
  if (prSummary) {
    page.append(prSummary);
  }
  page.append(buildCheckpointHistorySection(checkpoints), routing, buildAppServerSection(attempt.appServer), ids);
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
      const [attempt, checkpointsResponse] = await Promise.all([
        api.getAttemptDetail(attemptId),
        api.getAttemptCheckpoints(attemptId).catch(() => ({ checkpoints: [] as AttemptCheckpointRecord[] })),
      ]);
      const issueIdentifier = resolveIssueIdentifier(attempt, null);
      const issue = issueIdentifier ? await api.getIssue(issueIdentifier).catch(() => null) : null;
      if (!disposed) {
        root.replaceChildren(renderAttemptPage(attempt, issue, checkpointsResponse.checkpoints));
      }
    } catch (error) {
      if (!disposed) {
        const message = error instanceof Error ? error.message : "Could not load the archived attempt detail.";
        root.replaceChildren(
          createEmptyState(
            "Attempt not found",
            `${message} The attempt may have been cleaned up, or the ID may be incorrect. Try navigating back to the issue or the queue board.`,
            "Open board",
            () => router.navigate("/queue"),
            "error",
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
