/**
 * GraphQL query builders and field fragments for Linear API interactions.
 *
 * This module centralizes all GraphQL query construction to keep the Linear client
 * focused on HTTP transport, response normalization, and error handling.
 *
 * @module linear-queries
 */

export const PAGE_SIZE = 50;

/**
 * Common issue fields fragment used across multiple queries.
 *
 * This fragment defines the standard set of fields fetched for Issue objects.
 * Keep this in sync with the Issue interface in types.ts.
 *
 * Whitespace matters for query caching — do not modify formatting.
 */
const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  priority
  branchName
  url
  createdAt
  updatedAt
  state {
    name
  }
  labels {
    nodes {
      name
    }
  }
  inverseRelations {
    nodes {
      id
      type
      issue {
        id
        identifier
        state {
          name
        }
      }
      relatedIssue {
        id
        identifier
        state {
          name
        }
      }
    }
  }
`;

/**
 * Builds a GraphQL query for fetching candidate issues for Symphony dispatch.
 *
 * This query supports optional project filtering via the `includeProjectFilter` flag.
 * When enabled, the query expects a `$projectSlug` variable to filter issues by project.
 *
 * @param includeProjectFilter - Whether to include project-based filtering in the query
 * @returns A GraphQL query string for fetching candidate issues
 *
 * @example
 * ```typescript
 * const queryWithProject = buildCandidateIssuesQuery(true);
 * const queryWithoutProject = buildCandidateIssuesQuery(false);
 * ```
 */
export function buildCandidateIssuesQuery(includeProjectFilter: boolean): string {
  const projectFilter = includeProjectFilter ? "project: { slugId: { eq: $projectSlug } }" : "";
  return `
    query SymphonyCandidateIssues($after: String, $activeStates: [String!]${includeProjectFilter ? ", $projectSlug: String!" : ""}) {
      issues(first: ${PAGE_SIZE}, after: $after, filter: {
        state: { name: { in: $activeStates } }
        ${projectFilter}
      }) {
        nodes {
          ${ISSUE_FIELDS}
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
}

/**
 * Builds a GraphQL query for fetching issues by their IDs.
 *
 * This query retrieves a batch of issues matching the provided ID list.
 * Pagination is supported via the `$after` cursor variable.
 *
 * @returns A GraphQL query string for fetching issues by IDs
 *
 * @example
 * ```typescript
 * const query = buildIssuesByIdsQuery();
 * const variables = { ids: ["issue-1", "issue-2"], after: null };
 * ```
 */
export function buildIssuesByIdsQuery(): string {
  return `
    query SymphonyIssuesByIds($ids: [ID!], $after: String) {
      issues(first: ${PAGE_SIZE}, after: $after, filter: { id: { in: $ids } }) {
        nodes {
          ${ISSUE_FIELDS}
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
}

/**
 * Builds a GraphQL query for fetching issues by their state names.
 *
 * This query retrieves issues matching any of the provided state names.
 * Pagination is supported via the `$after` cursor variable.
 *
 * @returns A GraphQL query string for fetching issues by states
 *
 * @example
 * ```typescript
 * const query = buildIssuesByStatesQuery();
 * const variables = { states: ["In Progress", "Todo"], after: null };
 * ```
 */
export function buildIssuesByStatesQuery(): string {
  return `
    query SymphonyIssuesByStates($states: [String!], $after: String) {
      issues(first: ${PAGE_SIZE}, after: $after, filter: { state: { name: { in: $states } } }) {
        nodes {
          ${ISSUE_FIELDS}
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
}

/**
 * Builds a GraphQL query for looking up project metadata by slug ID.
 *
 * This query fetches project details including the associated team information.
 * Used during plan resolution to determine the target team for issue creation.
 *
 * @returns A GraphQL query string for project lookup
 *
 * @example
 * ```typescript
 * const query = buildProjectLookupQuery();
 * const variables = { projectSlug: "my-project-slug" };
 * ```
 */
export function buildProjectLookupQuery(): string {
  return `
    query SymphonyPlanProject($projectSlug: String!) {
      projects(first: 1, filter: { slugId: { eq: $projectSlug } }) {
        nodes {
          id
          name
          slugId
          teams(first: 1) {
            nodes {
              id
              name
              key
            }
          }
        }
      }
    }
  `;
}

/**
 * Builds a GraphQL query for fetching team metadata.
 *
 * This query retrieves up to 2 teams with their basic metadata.
 * Used as a fallback when project-based team resolution is not available.
 *
 * @returns A GraphQL query string for team lookup
 *
 * @example
 * ```typescript
 * const query = buildTeamLookupQuery();
 * ```
 */
export function buildTeamLookupQuery(): string {
  return `
    query SymphonyPlanTeams {
      teams(first: 2) {
        nodes {
          id
          name
          key
        }
      }
    }
  `;
}

/**
 * Builds a GraphQL query for looking up issue labels by name within a team.
 *
 * This query fetches label IDs for the provided label names, scoped to a specific team.
 * Used during issue creation to resolve label names to IDs.
 *
 * @returns A GraphQL query string for label lookup
 *
 * @example
 * ```typescript
 * const query = buildLabelLookupQuery();
 * const variables = { teamId: "team-123", names: ["bug", "feature"] };
 * ```
 */
export function buildLabelLookupQuery(): string {
  return `
    query SymphonyPlanLabels($teamId: String!, $names: [String!]) {
      issueLabels(first: 250, filter: { team: { id: { eq: $teamId } }, name: { in: $names } }) {
        nodes {
          id
          name
        }
      }
    }
  `;
}

/**
 * Builds a GraphQL mutation for creating a new Linear issue.
 *
 * This mutation accepts an IssueCreateInput and returns the created issue's metadata.
 * Used by the planning API to materialize planned issues into Linear.
 *
 * @returns A GraphQL mutation string for issue creation
 *
 * @example
 * ```typescript
 * const mutation = buildIssueCreateMutation();
 * const variables = {
 *   input: {
 *     title: "Implement feature X",
 *     description: "Detailed description",
 *     teamId: "team-123",
 *     priority: 2
 *   }
 * };
 * ```
 */
export function buildIssueCreateMutation(): string {
  return `
    mutation SymphonyCreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          url
        }
      }
    }
  `;
}
