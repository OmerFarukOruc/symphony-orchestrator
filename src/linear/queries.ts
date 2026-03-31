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
    query RisolutoCandidateIssues($after: String, $activeStates: [String!]${includeProjectFilter ? ", $projectSlug: String!" : ""}) {
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
    query RisolutoCandidateIssuesByStateIds($after: String, $stateIds: [ID!]${includeProjectFilter ? ", $projectSlug: String!" : ""}) {
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
    query RisolutoIssuesByIds($ids: [ID!], $after: String) {
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
    query RisolutoIssuesByStates($states: [String!], $after: String) {
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
    query RisolutoPlanProject($projectSlug: String!) {
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

export function buildTeamStatesQuery(): string {
  return `
    query RisolutoTeamStates($teamId: String!) {
      team(id: $teamId) {
        id
        name
        states {
          nodes {
            id
            name
            type
          }
        }
      }
    }
  `;
}

export function buildCreateIssueMutation(): string {
  return `
    mutation RisolutoCreateIssue($teamId: String!, $projectId: String, $title: String!, $description: String, $stateId: String) {
      issueCreate(input: { teamId: $teamId, projectId: $projectId, title: $title, description: $description, stateId: $stateId }) {
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

export function buildCreateLabelMutation(): string {
  return `
    mutation RisolutoCreateLabel($teamId: String, $name: String!, $color: String) {
      issueLabelCreate(input: { teamId: $teamId, name: $name, color: $color }) {
        success
        issueLabel {
          id
          name
        }
      }
    }
  `;
}

export function buildTeamsQuery(): string {
  return `
    query RisolutoTeams {
      teams(first: 50) {
        nodes {
          id
          name
          key
        }
      }
    }
  `;
}

export function buildCreateProjectMutation(): string {
  return `
    mutation RisolutoCreateProject($name: String!, $teamIds: [String!]!) {
      projectCreate(input: { name: $name, teamIds: $teamIds }) {
        success
        project {
          id
          name
          slugId
          url
          teams(first: 1) {
            nodes {
              key
            }
          }
        }
      }
    }
  `;
}

export function buildWebhooksQuery(): string {
  return `
    query RisolutoWebhooks {
      webhooks(first: 50) {
        nodes {
          id
          url
          enabled
          label
          teamId
          resourceTypes
          secret
          createdAt
          updatedAt
        }
      }
    }
  `;
}

export function buildWebhookCreateMutation(): string {
  return `
    mutation RisolutoWebhookCreate($url: String!, $teamId: String, $resourceTypes: [String!]!, $label: String, $secret: String) {
      webhookCreate(input: { url: $url, teamId: $teamId, resourceTypes: $resourceTypes, label: $label, secret: $secret }) {
        success
        webhook {
          id
          url
          enabled
          label
          secret
          resourceTypes
          createdAt
        }
      }
    }
  `;
}

export function buildWebhookUpdateMutation(): string {
  return `
    mutation RisolutoWebhookUpdate($id: String!, $enabled: Boolean, $url: String, $label: String, $resourceTypes: [String!], $secret: String) {
      webhookUpdate(id: $id, input: { enabled: $enabled, url: $url, label: $label, resourceTypes: $resourceTypes, secret: $secret }) {
        success
        webhook {
          id
          url
          enabled
          label
          secret
          resourceTypes
        }
      }
    }
  `;
}

export function buildWebhookDeleteMutation(): string {
  return `
    mutation RisolutoWebhookDelete($id: String!) {
      webhookDelete(id: $id) {
        success
      }
    }
  `;
}
