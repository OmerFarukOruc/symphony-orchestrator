import type { IssueDetail } from "../types";
import { formatCountdown, formatRelativeTime, formatTimestamp } from "../utils/format";
import { applyStagger, createSummaryStat, kv } from "./issue-inspector-common.js";

function retryDueAt(detail: IssueDetail): string | null {
  return detail.nextRetryDueAt ?? detail.next_retry_due_at ?? null;
}

function retryError(detail: IssueDetail): string {
  const value = detail.error?.trim();
  return value ? value : "—";
}

function retryAttempt(detail: IssueDetail): string {
  return detail.attempt == null ? "—" : `Attempt ${detail.attempt}`;
}

function retryCountdownLabel(nextRetryDueAt: string | null): string {
  if (!nextRetryDueAt) {
    return "Retry timing unavailable";
  }
  const countdown = formatCountdown(nextRetryDueAt);
  if (countdown === "—") {
    return "Retry timing unavailable";
  }
  if (countdown === "now") {
    return "Retry due now";
  }
  return countdown.startsWith("in ") ? `Retry ${countdown}` : `Retry was due ${countdown}`;
}

function retryScheduleLabel(nextRetryDueAt: string | null): string {
  if (!nextRetryDueAt) {
    return "—";
  }
  return `${formatTimestamp(nextRetryDueAt)} (${formatRelativeTime(nextRetryDueAt)})`;
}

export function buildRetrySection(detail: IssueDetail): HTMLElement | null {
  if (detail.status !== "retrying") {
    return null;
  }

  const nextRetryDueAt = retryDueAt(detail);
  const section = document.createElement("section");
  section.className = "issue-section mc-panel expand-in";
  section.append(Object.assign(document.createElement("h2"), { textContent: "Retry schedule" }));

  const summary = document.createElement("div");
  summary.className = "issue-summary-strip issue-retry-strip";
  const countdown = createSummaryStat("Countdown");
  countdown.update(retryCountdownLabel(nextRetryDueAt));
  const schedule = createSummaryStat("Due at");
  schedule.update(retryScheduleLabel(nextRetryDueAt));
  const attempt = createSummaryStat("Attempt");
  attempt.update(retryAttempt(detail));
  applyStagger([countdown.element, schedule.element, attempt.element]);
  summary.append(countdown.element, schedule.element, attempt.element);

  const nextRetryItem = kv("Next retry", retryScheduleLabel(nextRetryDueAt));
  const errorItem = kv("Error reason", retryError(detail));
  const attemptItem = kv("Attempt", retryAttempt(detail));
  const lastUpdateItem = kv("Last update", formatTimestamp(detail.updated_at ?? detail.updatedAt));
  applyStagger([nextRetryItem, errorItem, attemptItem, lastUpdateItem]);

  const grid = document.createElement("div");
  grid.className = "issue-meta-grid";
  grid.append(nextRetryItem, errorItem, attemptItem, lastUpdateItem);

  section.append(summary, grid);
  return section;
}
