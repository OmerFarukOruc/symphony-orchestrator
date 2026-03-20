import { asArray, asRecord, asStringOrNull } from "../utils/type-guards.js";
import type { Issue, IssueBlockerRef } from "../core/types.js";

const asString = asStringOrNull;

function normalizeLabels(raw: unknown): string[] {
  return asArray(raw)
    .map((item) => asRecord(item))
    .map((item) => asString(item.name))
    .filter((value): value is string => value !== null)
    .map((value) => value.toLowerCase());
}

/** Determines blocker direction: if issue.id matches, the related issue is the blocker. */
function normalizeBlockers(raw: unknown, issueId: string): IssueBlockerRef[] {
  return asArray(raw).map((item) => {
    const relation = asRecord(item);
    const issue = asRecord(relation.issue);
    const relatedIssue = asRecord(relation.relatedIssue);
    const blocker = asString(issue.id) === issueId && Object.keys(relatedIssue).length > 0 ? relatedIssue : issue;
    const state = asRecord(blocker.state);
    return {
      id: asString(blocker.id),
      identifier: asString(blocker.identifier),
      state: asString(state.name),
    };
  });
}

export function normalizeIssue(raw: unknown): Issue {
  const issue = asRecord(raw);
  const state = asRecord(issue.state);
  const labels = asRecord(issue.labels);
  const inverseRelations = asRecord(issue.inverseRelations);

  return {
    id: asString(issue.id) ?? "",
    identifier: asString(issue.identifier) ?? "",
    title: asString(issue.title) ?? "",
    description: asString(issue.description),
    priority: typeof issue.priority === "number" && Number.isInteger(issue.priority) ? issue.priority : null,
    state: asString(state.name) ?? "unknown",
    branchName: asString(issue.branchName),
    url: asString(issue.url),
    labels: normalizeLabels(labels.nodes),
    blockedBy: normalizeBlockers(inverseRelations.nodes, asString(issue.id) ?? ""),
    createdAt: asString(issue.createdAt),
    updatedAt: asString(issue.updatedAt),
  };
}
