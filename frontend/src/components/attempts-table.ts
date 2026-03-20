import type { AttemptSummary } from "../types";
import {
  applyTableRowInteraction,
  createMonoTableCell,
  createTableCell,
  createTableEmptyRow,
  createTableHead,
} from "../ui/table";
import { formatDuration, formatShortTime, formatTokenUsage } from "../utils/format";

function durationForAttempt(attempt: AttemptSummary): string {
  if (!attempt.startedAt || !attempt.endedAt) {
    return "—";
  }
  const seconds = (Date.parse(attempt.endedAt) - Date.parse(attempt.startedAt)) / 1000;
  return formatDuration(seconds);
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
    row.append(
      createTableCell(String(attempt.attemptNumber)),
      createTableCell(attempt.status),
      createMonoTableCell(formatShortTime(attempt.startedAt)),
      createMonoTableCell(formatShortTime(attempt.endedAt)),
      createMonoTableCell(durationForAttempt(attempt)),
      createMonoTableCell(attempt.model ?? "—"),
      createMonoTableCell(formatTokenUsage(attempt.tokenUsage?.totalTokens ?? null)),
      createTableCell(attempt.errorMessage ?? attempt.errorCode ?? "—"),
    );
    applyTableRowInteraction(row, () => onOpen(attempt.attemptId), { keyboard: "enter" });
    body.append(row);
  });

  table.append(head, body);
  wrap.append(table);
  return wrap;
}
