import type { AttemptSummary } from "../types";
import { statusChip } from "../ui/status-chip";
import { computeDurationSeconds, formatCompactNumber, formatDuration } from "../utils/format";

function tokenLabel(attempt: AttemptSummary): string {
  if (!attempt.tokenUsage) {
    return "—";
  }
  return `${formatCompactNumber(attempt.tokenUsage.totalTokens)} total · ${formatCompactNumber(attempt.tokenUsage.inputTokens)} in · ${formatCompactNumber(attempt.tokenUsage.outputTokens)} out`;
}

function durationLabel(attempt: AttemptSummary): string {
  return formatDuration(computeDurationSeconds(attempt.startedAt, attempt.endedAt));
}

function compareMetric(label: string, leftValue: string, rightValue: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "runs-compare-metric";
  const changed = leftValue !== rightValue;
  const name = document.createElement("span");
  name.className = "text-secondary";
  name.textContent = label;
  const left = document.createElement("strong");
  left.textContent = leftValue;
  const right = document.createElement("strong");
  right.textContent = rightValue;
  if (changed) {
    left.className = "runs-diff-value";
    right.className = "runs-diff-value";
  }
  row.append(name, left, right);
  return row;
}

function compareCard(attempt: AttemptSummary): HTMLElement {
  const card = document.createElement("section");
  card.className = "mc-panel runs-compare-card";
  const title = document.createElement("div");
  title.className = "runs-compare-card-header";
  const heading = document.createElement("h3");
  heading.textContent = `Run #${attempt.attemptNumber}`;
  title.append(heading, statusChip(attempt.status));

  const list = document.createElement("dl");
  list.className = "runs-compare-card-list";
  [
    ["Model", attempt.model ?? "—"],
    ["Reasoning", attempt.reasoningEffort ?? "—"],
    ["Duration", durationLabel(attempt)],
    ["Tokens", tokenLabel(attempt)],
    ["Error", attempt.errorMessage ?? attempt.errorCode ?? "No error"],
  ].forEach(([label, value]) => {
    const name = document.createElement("dt");
    name.className = "text-secondary";
    name.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    list.append(name, description);
  });
  card.append(title, list);
  return card;
}

export function createRunsCompare(
  leftAttempt: AttemptSummary,
  rightAttempt: AttemptSummary,
  onClear: () => void,
): HTMLElement {
  const wrap = document.createElement("section");
  wrap.className = "runs-compare-panel";

  const header = document.createElement("div");
  header.className = "runs-detail-header";
  const text = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = `Run #${leftAttempt.attemptNumber} vs Run #${rightAttempt.attemptNumber}`;
  const subtitle = document.createElement("p");
  subtitle.className = "page-subtitle";
  subtitle.textContent = "Changed values are highlighted for quick side-by-side inspection.";
  text.append(title, subtitle);
  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "mc-button mc-button-ghost";
  clearButton.textContent = "Clear selection";
  clearButton.addEventListener("click", onClear);
  header.append(text, clearButton);

  const diffGrid = document.createElement("div");
  diffGrid.className = "mc-panel runs-compare-grid";
  diffGrid.append(
    compareMetric("Duration", durationLabel(leftAttempt), durationLabel(rightAttempt)),
    compareMetric("Tokens", tokenLabel(leftAttempt), tokenLabel(rightAttempt)),
    compareMetric("Model", leftAttempt.model ?? "—", rightAttempt.model ?? "—"),
    compareMetric("Reasoning", leftAttempt.reasoningEffort ?? "—", rightAttempt.reasoningEffort ?? "—"),
    compareMetric(
      "Error",
      leftAttempt.errorMessage ?? leftAttempt.errorCode ?? "No error",
      rightAttempt.errorMessage ?? rightAttempt.errorCode ?? "No error",
    ),
  );

  const cards = document.createElement("div");
  cards.className = "runs-compare-cards";
  cards.append(compareCard(leftAttempt), compareCard(rightAttempt));

  wrap.append(header, diffGrid, cards);
  return wrap;
}
