import { asArray, asRecord, asStringOrNull } from "../utils/type-guards.js";
import type { Issue, IssueBlockerRef } from "../core/types.js";

const asString = asStringOrNull;

/**
 * Normalizes an array of label objects from Linear's GraphQL API into a sorted array of lowercase label names.
 *
 * @param raw - The raw labels data from Linear's GraphQL response (typically labels.nodes)
 * @returns An array of lowercase label names
 */
function normalizeLabels(raw: unknown): string[] {
  return asArray(raw)
    .map((item) => asRecord(item))
    .map((item) => asString(item.name))
    .filter((value): value is string => value !== null)
    .map((value) => value.toLowerCase());
}

/**
 * Normalizes blocker relations from Linear's GraphQL API into a structured array of blocker references.
 *
 * @param raw - The raw blocker relations data from Linear's GraphQL response (typically inverseRelations.nodes)
 * @param issueId - The ID of the issue being normalized, used to determine blocker direction
 * @returns An array of IssueBlockerRef objects with id, identifier, and state
 */
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

/**
 * Normalizes a raw Linear issue object from Linear's GraphQL API into a structured Issue type.
 *
 * @param raw - The raw issue data from Linear's GraphQL response
 * @returns A normalized Issue object with all required fields
 */
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
