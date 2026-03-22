/** GraphQL query builders for Linear API interactions. */

export const PAGE_SIZE = 50;

/** Whitespace matters for query caching — do not modify formatting. */
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

export function buildCandidateIssuesByStateIdsQuery(includeProjectFilter: boolean): string {
  const projectFilter = includeProjectFilter ? "project: { slugId: { eq: $projectSlug } }" : "";
  return `
    query SymphonyCandidateIssuesByStateIds($after: String, $stateIds: [ID!]${includeProjectFilter ? ", $projectSlug: String!" : ""}) {
      issues(first: ${PAGE_SIZE}, after: $after, filter: {
        state: { id: { in: $stateIds } }
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
