import type { AttemptSummary } from "../types";
import { statusChip } from "../ui/status-chip";
import {
  computeDurationSeconds,
  formatCompactNumber,
  formatDuration,
  formatRelativeTime,
  formatTimestamp,
} from "../utils/format";

export interface RunsTableOptions {
  attempts: AttemptSummary[];
  activeAttemptId: string | null;
  compareAttemptIds: string[];
  onSelect: (attemptId: string) => void;
  onToggleCompare: (attemptId: string) => void;
}

function createHeaderCell(label: string): HTMLTableCellElement {
  const cell = document.createElement("th");
  cell.scope = "col";
  cell.textContent = label;
  return cell;
}

function tokenBreakdown(attempt: AttemptSummary): string {
  if (!attempt.tokenUsage) {
    return "—";
  }
  return `${formatCompactNumber(attempt.tokenUsage.totalTokens)} · ${formatCompactNumber(attempt.tokenUsage.inputTokens)}/${formatCompactNumber(attempt.tokenUsage.outputTokens)}`;
}

function durationLabel(attempt: AttemptSummary): string {
  return formatDuration(computeDurationSeconds(attempt.startedAt, attempt.endedAt));
}

function createTimeCell(value: string | null): HTMLTableCellElement {
  const cell = document.createElement("td");
  const wrap = document.createElement("div");
  wrap.className = "runs-time-cell";
  const primary = document.createElement("span");
  primary.textContent = formatRelativeTime(value);
  primary.title = formatTimestamp(value);
  const secondary = document.createElement("span");
  secondary.className = "text-secondary text-mono";
  secondary.textContent = formatTimestamp(value);
  wrap.append(primary, secondary);
  cell.append(wrap);
  return cell;
}

function createErrorCell(attempt: AttemptSummary): HTMLTableCellElement {
  const cell = document.createElement("td");
  const text = attempt.errorMessage ?? attempt.errorCode ?? "—";
  cell.className = "runs-error-cell";
  if (attempt.errorMessage || attempt.errorCode) {
    cell.classList.add("is-error");
  }
  cell.title = text;
  cell.textContent = text;
  return cell;
}

function createModelCell(value: string | null): HTMLTableCellElement {
  const cell = document.createElement("td");
  cell.className = "text-mono";
  cell.textContent = value ?? "—";
  return cell;
}

export function createRunsTable(options: RunsTableOptions): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "runs-table-wrap mc-panel";
  const table = document.createElement("table");
  table.className = "attempts-table runs-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["", "Run", "Status", "Start", "End", "Duration", "Model", "Reasoning", "Tokens", "Error"].forEach((label) => {
    headRow.append(createHeaderCell(label));
  });
  head.append(headRow);

  const body = document.createElement("tbody");
  options.attempts.forEach((attempt) => {
    const row = document.createElement("tr");
    const isActive = options.activeAttemptId === attempt.attemptId;
    const isCompared = options.compareAttemptIds.includes(attempt.attemptId);
    row.className = "runs-row";
    if (isActive) {
      row.classList.add("is-active");
    }
    if (isCompared) {
      row.classList.add("is-compared");
    }
    if (attempt.endedAt === null) {
      row.classList.add("is-live");
    }
    row.tabIndex = 0;
    row.setAttribute("aria-selected", String(isActive));
    row.addEventListener("click", () => options.onSelect(attempt.attemptId));

    const compareCell = document.createElement("td");
    compareCell.className = "runs-compare-cell";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isCompared;
    checkbox.setAttribute("aria-label", `Compare run ${attempt.attemptNumber}`);
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => options.onToggleCompare(attempt.attemptId));
    compareCell.append(checkbox);

    const runCell = document.createElement("td");
    const runWrap = document.createElement("div");
    runWrap.className = "runs-run-cell";
    const runNumber = document.createElement("strong");
    runNumber.className = "text-mono";
    runNumber.textContent = `#${attempt.attemptNumber}`;
    runWrap.append(runNumber);
    if (attempt.endedAt === null) {
      const livePill = document.createElement("span");
      livePill.className = "mc-badge runs-live-pill";
      livePill.textContent = "Current live run";
      runWrap.append(livePill);
    }
    runCell.append(runWrap);

    const statusCell = document.createElement("td");
    statusCell.append(statusChip(attempt.status));

    const durationCell = document.createElement("td");
    durationCell.className = "text-mono";
    durationCell.textContent = durationLabel(attempt);

    const reasoningCell = document.createElement("td");
    reasoningCell.className = "text-mono";
    reasoningCell.textContent = attempt.reasoningEffort ?? "—";

    const tokenCell = document.createElement("td");
    tokenCell.className = "text-mono";
    tokenCell.textContent = tokenBreakdown(attempt);

    row.append(
      compareCell,
      runCell,
      statusCell,
      createTimeCell(attempt.startedAt),
      createTimeCell(attempt.endedAt),
      durationCell,
      createModelCell(attempt.model),
      reasoningCell,
      tokenCell,
      createErrorCell(attempt),
    );
    body.append(row);
  });

  table.append(head, body);
  wrap.append(table);
  return wrap;
}
