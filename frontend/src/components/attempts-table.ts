import type { AttemptSummary } from "../types";
import {
  applyTableRowInteraction,
  createMonoTableCell,
  createTableCell,
  createTableEmptyRow,
  createTableHead,
  setTableCellLabel,
} from "../ui/table";
import { formatDuration, formatShortTime, formatTokenUsage } from "../utils/format";

function durationForAttempt(attempt: AttemptSummary): string {
  if (!attempt.startedAt || !attempt.endedAt) {
    return "—";
  }
  const seconds = (Date.parse(attempt.endedAt) - Date.parse(attempt.startedAt)) / 1000;
  return formatDuration(seconds);
}

function createErrorCell(attempt: AttemptSummary): HTMLTableCellElement {
  const full = attempt.errorMessage ?? attempt.errorCode ?? "—";
  const cell = createTableCell(full.length > 60 ? `${full.slice(0, 60)}…` : full);
  if (full !== "—") cell.title = full;
  return cell;
}

export function createAttemptsTable(attempts: AttemptSummary[], onOpen: (attemptId: string) => void): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "attempts-table-wrap";
  const table = document.createElement("table");
  table.className = "attempts-table";
  const head = createTableHead(["Run#", "Status", "Start", "End", "Duration", "Model", "Tokens", "Error"]);
  const body = document.createElement("tbody");

  if (attempts.length === 0) {
    body.append(createTableEmptyRow("No runs recorded yet.", 8));
  }

  attempts.forEach((attempt) => {
    const row = document.createElement("tr");
    const runCell = setTableCellLabel(
      createTableCell(attempt.attemptNumber != null ? String(attempt.attemptNumber) : "—"),
      "Run",
    );
    const statusCell = setTableCellLabel(createTableCell(attempt.status), "Status");
    const startCell = setTableCellLabel(createMonoTableCell(formatShortTime(attempt.startedAt)), "Start");
    const endCell = setTableCellLabel(createMonoTableCell(formatShortTime(attempt.endedAt)), "End");
    const durationCell = setTableCellLabel(createMonoTableCell(durationForAttempt(attempt)), "Duration");
    const modelCell = setTableCellLabel(createMonoTableCell(attempt.model ?? "—"), "Model");
    const tokensCell = setTableCellLabel(
      createMonoTableCell(formatTokenUsage(attempt.tokenUsage?.totalTokens ?? null)),
      "Tokens",
    );
    const errorCell = setTableCellLabel(createErrorCell(attempt), "Error");
    row.append(runCell, statusCell, startCell, endCell, durationCell, modelCell, tokensCell, errorCell);
    applyTableRowInteraction(row, () => onOpen(attempt.attemptId), { keyboard: "enter" });
    body.append(row);
  });

  table.append(head, body);
  wrap.append(table);
  return wrap;
}
