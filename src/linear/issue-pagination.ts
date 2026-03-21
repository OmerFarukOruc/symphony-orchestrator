import type { Issue, ServiceConfig } from "../core/types.js";
import { LinearClientError } from "./errors.js";

interface GraphQLResponse {
  data?: Record<string, unknown>;
  errors?: unknown[];
}

interface IssuesConnection {
  nodes: unknown[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

interface PaginationDependencies {
  runGraphQL: (query: string, variables: Record<string, unknown>) => Promise<GraphQLResponse>;
  getConfig: () => ServiceConfig;
}

function extractIssuesConnection(payload: GraphQLResponse): IssuesConnection {
  if (Object.hasOwn(payload, "data") === false || typeof payload.data !== "object" || payload.data === null) {
    throw new LinearClientError("linear_unknown_payload", "linear graphql response missing data object");
  }
  const root = payload.data;
  const issues = root.issues;
  if (typeof issues !== "object" || issues === null || Array.isArray(issues)) {
    throw new LinearClientError("linear_unknown_payload", "linear graphql response missing issues connection");
  }
  const nodes = (issues as Record<string, unknown>).nodes;
  if (Array.isArray(nodes) === false) {
    throw new LinearClientError("linear_unknown_payload", "linear graphql response missing issues.nodes array");
  }
  const pageInfo = (issues as Record<string, unknown>).pageInfo;
  if (typeof pageInfo !== "object" || pageInfo === null || Array.isArray(pageInfo)) {
    throw new LinearClientError("linear_unknown_payload", "linear graphql response missing pageInfo object");
  }
  const hasNextPage = (pageInfo as Record<string, unknown>).hasNextPage;
  if (typeof hasNextPage !== "boolean") {
    throw new LinearClientError(
      "linear_unknown_payload",
      "linear graphql response missing boolean pageInfo.hasNextPage",
    );
  }
  const endCursorRaw = (pageInfo as Record<string, unknown>).endCursor;
  if (endCursorRaw !== null && typeof endCursorRaw !== "string") {
    throw new LinearClientError("linear_unknown_payload", "linear graphql response has invalid pageInfo.endCursor");
  }

  return {
    nodes,
    pageInfo: {
      hasNextPage,
      endCursor: endCursorRaw,
    },
  };
}

function ensurePaginationCursor(
  pageInfo: { hasNextPage: boolean; endCursor: string | null },
  issueCount: number,
): void {
  if (pageInfo.hasNextPage && !pageInfo.endCursor) {
    throw new LinearClientError(
      "linear_missing_end_cursor",
      `pagination returned hasNextPage=true with null endCursor after ${issueCount} issues`,
    );
  }
}

async function paginateQuery(
  deps: PaginationDependencies,
  query: string,
  baseVariables: Record<string, unknown>,
  normalizeIssue: (node: unknown) => Issue,
): Promise<Issue[]> {
  const issues: Issue[] = [];
  let after: string | null = null;
  do {
    const payload = await deps.runGraphQL(query, { ...baseVariables, after });
    const connection = extractIssuesConnection(payload);
    issues.push(...connection.nodes.map(normalizeIssue));
    const pageInfo = connection.pageInfo;
    ensurePaginationCursor(pageInfo, issues.length);
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (after);
  return issues;
}

function buildCandidateIssueVariables(config: ServiceConfig, key: "activeStates" | "stateIds", values: string[]) {
  return {
    [key]: values,
    ...(config.tracker.projectSlug ? { projectSlug: config.tracker.projectSlug } : {}),
  };
}

export async function fetchCandidateIssues(
  deps: PaginationDependencies,
  buildCandidateIssuesQuery: (hasProjectSlug: boolean) => string,
  normalizeIssue: (node: unknown) => Issue,
): Promise<Issue[]> {
  const config = deps.getConfig();
  const query = buildCandidateIssuesQuery(Boolean(config.tracker.projectSlug));
  const allStates = [...config.tracker.activeStates, ...config.tracker.terminalStates];
  return paginateQuery(deps, query, buildCandidateIssueVariables(config, "activeStates", allStates), normalizeIssue);
}

export async function fetchCandidateIssuesByStateIds(
  deps: PaginationDependencies,
  stateIds: string[],
  buildCandidateIssuesByStateIdsQuery: (hasProjectSlug: boolean) => string,
  normalizeIssue: (node: unknown) => Issue,
): Promise<Issue[]> {
  if (stateIds.length === 0) {
    return [];
  }
  const config = deps.getConfig();
  const query = buildCandidateIssuesByStateIdsQuery(Boolean(config.tracker.projectSlug));
  return paginateQuery(deps, query, buildCandidateIssueVariables(config, "stateIds", stateIds), normalizeIssue);
}

export async function fetchIssueStatesByIds(
  deps: PaginationDependencies,
  ids: string[],
  pageSize: number,
  buildIssuesByIdsQuery: () => string,
  normalizeIssue: (node: unknown) => Issue,
): Promise<Issue[]> {
  if (ids.length === 0) {
    return [];
  }
  const query = buildIssuesByIdsQuery();
  const results: Issue[][] = [];
  for (let index = 0; index < ids.length; index += pageSize) {
    const chunk = ids.slice(index, index + pageSize);
    results.push(await paginateQuery(deps, query, { ids: chunk }, normalizeIssue));
  }
  return results.flat();
}

export async function fetchIssuesByStates(
  deps: PaginationDependencies,
  states: string[],
  buildIssuesByStatesQuery: () => string,
  normalizeIssue: (node: unknown) => Issue,
): Promise<Issue[]> {
  if (states.length === 0) {
    return [];
  }
  return paginateQuery(deps, buildIssuesByStatesQuery(), { states }, normalizeIssue);
}
