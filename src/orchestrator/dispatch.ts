import { isTerminalState } from "../state-policy.js";
import type { Issue, ServiceConfig } from "../types.js";

function sortableCreatedAt(createdAt: string | null): number {
  if (!createdAt) {
    return Number.MAX_SAFE_INTEGER;
  }
  const parsed = Date.parse(createdAt);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function sortIssuesForDispatch(issues: Issue[]): Issue[] {
  return [...issues].sort((left, right) => {
    const leftPriority = left.priority ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = right.priority ?? Number.MAX_SAFE_INTEGER;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const leftCreatedAt = sortableCreatedAt(left.createdAt);
    const rightCreatedAt = sortableCreatedAt(right.createdAt);
    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt;
    }

    return left.identifier.localeCompare(right.identifier);
  });
}

export function isBlockedByNonTerminal(issue: Issue, config: ServiceConfig): boolean {
  return issue.blockedBy.some((blocker) => blocker.state === null || !isTerminalState(blocker.state, config));
}
