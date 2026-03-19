import type { AttemptSummary } from "../types";
import { formatDuration, formatShortTime, formatTokenUsage } from "../utils/format";

function durationForAttempt(attempt: AttemptSummary): string {
  if (!attempt.startedAt || !attempt.endedAt) {
    return "—";
  }
  const seconds = (Date.parse(attempt.endedAt) - Date.parse(attempt.startedAt)) / 1000;
  return formatDuration(seconds);
}

export function createAttemptsTable(attempts: AttemptSummary[], onOpen: (attemptId: string) => void): HTMLElement {
  const table = document.createElement("table");
  table.className = "attempts-table";
  table.innerHTML =
    "<thead><tr><th>Run#</th><th>Status</th><th>Start</th><th>End</th><th>Duration</th><th>Model</th><th>Tokens</th><th>Error</th></tr></thead>";
  const body = document.createElement("tbody");

  if (attempts.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="8" class="table-empty">No runs recorded yet.</td>';
    body.append(row);
  }

  attempts.forEach((attempt) => {
    const row = document.createElement("tr");
    row.tabIndex = 0;
    function td(text: string, mono = false): HTMLTableCellElement {
      const cell = document.createElement("td");
      if (mono) cell.className = "text-mono";
      cell.textContent = text;
      return cell;
    }
    row.append(
      td(String(attempt.attemptNumber)),
      td(attempt.status),
      td(formatShortTime(attempt.startedAt), true),
      td(formatShortTime(attempt.endedAt), true),
      td(durationForAttempt(attempt), true),
      td(attempt.model ?? "—", true),
      td(formatTokenUsage(attempt.tokenUsage?.totalTokens ?? null), true),
      td(attempt.errorMessage ?? attempt.errorCode ?? "—"),
    );
    row.addEventListener("click", () => onOpen(attempt.attemptId));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        onOpen(attempt.attemptId);
      }
    });
    body.append(row);
  });

  table.append(body);
  return table;
}
