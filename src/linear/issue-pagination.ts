import type { Issue, ServiceConfig } from "../core/types.js";
import { LinearClientError } from "./client.js";

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

/**
 * Validates and extracts the issues connection from a GraphQL response.
 *
 * Checks that the response contains a valid `data` object with an `issues`
 * connection that has `nodes` array and `pageInfo` object with required fields.
 *
 * @param payload - The GraphQL response payload to extract from
 * @returns The extracted issues connection with nodes and pagination info
 * @throws {LinearClientError} If the payload structure is invalid
 */
function extractIssuesConnection(payload: GraphQLResponse): IssuesConnection {
  if (
    Object.prototype.hasOwnProperty.call(payload, "data") === false ||
    typeof payload.data !== "object" ||
    payload.data === null
  ) {
    throw new LinearClientError("linear_unknown_payload", "linear graphql response missing data object");
  }
  const root = payload.data as Record<string, unknown>;
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

/**
 * Validates pagination cursor consistency.
 *
 * Ensures that when `hasNextPage` is true, a valid `endCursor` is present.
 * This invariant must hold for pagination to continue safely.
 *
 * @param pageInfo - The pagination info object with hasNextPage and endCursor
 * @param issueCount - The current count of issues fetched (used in error message)
 * @throws {LinearClientError} If hasNextPage is true but endCursor is null
 */
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

/**
 * Fetches candidate issues with full pagination support.
 *
 * Repeatedly queries the GraphQL API until all pages are consumed,
 * extracting and normalizing issues from each page.
 *
 * @param deps - Dependencies for GraphQL execution and config access
 * @param buildCandidateIssuesQuery - Function to build the GraphQL query string
 * @param normalizeIssue - Function to normalize a GraphQL node into an Issue
 * @returns Array of all fetched issues across all pages
 */
export async function fetchCandidateIssues(
  deps: PaginationDependencies,
  buildCandidateIssuesQuery: (hasProjectSlug: boolean) => string,
  normalizeIssue: (node: unknown) => Issue,
): Promise<Issue[]> {
  const config = deps.getConfig();
  const issues: Issue[] = [];
  let after: string | null = null;
  const query = buildCandidateIssuesQuery(Boolean(config.tracker.projectSlug));

  do {
    const payload = await deps.runGraphQL(query, {
      after,
      activeStates: config.tracker.activeStates,
      ...(config.tracker.projectSlug ? { projectSlug: config.tracker.projectSlug } : {}),
    });
    const connection = extractIssuesConnection(payload);
    issues.push(...connection.nodes.map(normalizeIssue));
    const pageInfo = connection.pageInfo;
    ensurePaginationCursor(pageInfo, issues.length);
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (after);

  return issues;
}

/**
 * Fetches issues by ID with chunking and pagination.
 *
 * Splits the ID list into pages (PAGE_SIZE chunks) and fetches each chunk
 * with full pagination support. Each chunk may itself span multiple pages.
 *
 * @param deps - Dependencies for GraphQL execution and config access
 * @param ids - Array of issue IDs to fetch
 * @param pageSize - Number of IDs per chunk (typically PAGE_SIZE constant)
 * @param buildIssuesByIdsQuery - Function to build the GraphQL query string
 * @param normalizeIssue - Function to normalize a GraphQL node into an Issue
 * @returns Array of all fetched issues across all chunks and pages
 */
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
  const issues: Issue[] = [];
  for (let index = 0; index < ids.length; index += pageSize) {
    const chunk = ids.slice(index, index + pageSize);
    let after: string | null = null;
    do {
      const payload = await deps.runGraphQL(buildIssuesByIdsQuery(), { ids: chunk, after });
      const connection = extractIssuesConnection(payload);
      issues.push(...connection.nodes.map(normalizeIssue));
      const pageInfo = connection.pageInfo;
      ensurePaginationCursor(pageInfo, issues.length);
      after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
    } while (after);
  }
  return issues;
}

/**
 * Fetches issues by state with pagination.
 *
 * Fetches all issues matching the provided state names, consuming all pages
 * until no more results are available.
 *
 * @param deps - Dependencies for GraphQL execution and config access
 * @param states - Array of state names to filter by
 * @param buildIssuesByStatesQuery - Function to build the GraphQL query string
 * @param normalizeIssue - Function to normalize a GraphQL node into an Issue
 * @returns Array of all fetched issues matching the specified states
 */
export async function fetchIssuesByStates(
  deps: PaginationDependencies,
  states: string[],
  buildIssuesByStatesQuery: () => string,
  normalizeIssue: (node: unknown) => Issue,
): Promise<Issue[]> {
  if (states.length === 0) {
    return [];
  }
  const issues: Issue[] = [];
  let after: string | null = null;
  do {
    const payload = await deps.runGraphQL(buildIssuesByStatesQuery(), { states, after });
    const connection = extractIssuesConnection(payload);
    issues.push(...connection.nodes.map(normalizeIssue));
    const pageInfo = connection.pageInfo;
    ensurePaginationCursor(pageInfo, issues.length);
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (after);
  return issues;
}
