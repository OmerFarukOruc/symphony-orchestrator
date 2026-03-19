import type { AttemptRecord, IssueDetail } from "../types";

export function resolveIssueIdentifier(attempt: AttemptRecord, issue: IssueDetail | null): string | null {
  const eventIssueIdentifier = attempt.events?.find(
    (event) => typeof event.issue_identifier === "string" && event.issue_identifier.length > 0,
  )?.issue_identifier;
  return attempt.issueIdentifier ?? issue?.identifier ?? eventIssueIdentifier ?? null;
}
