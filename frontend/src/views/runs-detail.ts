import { router } from "../router";
import type { AttemptRecord, AttemptSummary } from "../types";
import { skeletonBlock, skeletonCard, skeletonLine } from "../ui/skeleton";
import { statusChip } from "../ui/status-chip";
import {
  computeDurationSeconds,
  formatCompactNumber,
  formatDuration,
  formatRelativeTime,
  formatTimestamp,
} from "../utils/format";

export function renderRunsLoadingPanel(): HTMLElement {
  const shell = document.createElement("div");
  shell.className = "runs-detail-panel";
  shell.append(skeletonLine("44%"), skeletonCard(), skeletonBlock("140px"));
  return shell;
}

export function renderRunsSummary(attempt: AttemptSummary, detail: AttemptRecord | null): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "runs-detail-panel";

  const header = document.createElement("div");
  header.className = "runs-detail-header";
  const titleWrap = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = `Run #${attempt.attemptNumber}`;
  const subtitle = document.createElement("p");
  subtitle.className = "page-subtitle";
  subtitle.textContent =
    attempt.endedAt === null ? "Current live run pinned at the top of history." : "Archived run summary.";
  titleWrap.append(title, subtitle);

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "mc-button mc-button-ghost";
  openButton.textContent = "Open attempt detail";
  openButton.addEventListener("click", () => router.navigate(`/attempts/${attempt.attemptId}`));
  header.append(titleWrap, openButton);

  const strip = document.createElement("div");
  strip.className = "runs-summary-strip mc-panel";
  const facts: Array<[string, string | HTMLElement]> = [
    ["Status", statusChip(attempt.status)],
    ["Started", `${formatRelativeTime(attempt.startedAt)} · ${formatTimestamp(attempt.startedAt)}`],
    ["Ended", `${formatRelativeTime(attempt.endedAt)} · ${formatTimestamp(attempt.endedAt)}`],
    ["Duration", formatDuration(computeDurationSeconds(attempt.startedAt, attempt.endedAt))],
    ["Model", attempt.model ?? "—"],
    ["Reasoning", attempt.reasoningEffort ?? "—"],
    [
      "Tokens",
      attempt.tokenUsage
        ? `${formatCompactNumber(attempt.tokenUsage.totalTokens)} total · ${formatCompactNumber(attempt.tokenUsage.inputTokens)} in · ${formatCompactNumber(attempt.tokenUsage.outputTokens)} out`
        : "—",
    ],
    ["Thread / turns", `${detail?.threadId ?? "—"} · ${detail?.turnCount ?? 0} turns`],
  ];

  facts.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "runs-summary-item";
    const name = document.createElement("span");
    name.className = "text-secondary";
    name.textContent = label;
    const body = document.createElement("strong");
    if (typeof value === "string") {
      body.textContent = value;
    } else {
      body.replaceChildren(value);
    }
    item.append(name, body);
    strip.append(item);
  });

  const notes = document.createElement("section");
  notes.className = "mc-panel runs-detail-card";
  const noteTitle = document.createElement("h3");
  noteTitle.textContent = "Run notes";
  const workspace = document.createElement("p");
  workspace.className = "text-secondary";
  workspace.textContent = `Workspace: ${detail?.workspacePath ?? detail?.workspaceKey ?? "Not captured in archive"}`;
  const error = document.createElement("p");
  error.className = attempt.errorMessage || attempt.errorCode ? "runs-inline-error" : "text-secondary";
  error.textContent = attempt.errorMessage ?? attempt.errorCode ?? "No recorded error for this run.";
  notes.append(noteTitle, workspace, error);

  panel.append(header, strip, notes);
  return panel;
}
