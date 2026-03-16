import type { Issue, IssueBlockerRef, ServiceConfig, SymphonyLogger } from "./types.js";

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";
const PAGE_SIZE = 50;

interface GraphQLResponse {
  data?: Record<string, unknown>;
  errors?: unknown[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeLabels(raw: unknown): string[] {
  return asArray(raw)
    .map((item) => asRecord(item))
    .map((item) => asString(item.name))
    .filter((value): value is string => value !== null)
    .map((value) => value.toLowerCase());
}

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

function normalizeIssue(raw: unknown): Issue {
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

function extractIssues(payload: GraphQLResponse): Issue[] {
  const root = asRecord(payload.data);
  const issues = asRecord(root.issues);
  return asArray(issues.nodes).map(normalizeIssue);
}

function extractPageInfo(payload: GraphQLResponse): { hasNextPage: boolean; endCursor: string | null } {
  const root = asRecord(payload.data);
  const issues = asRecord(root.issues);
  const pageInfo = asRecord(issues.pageInfo);
  return {
    hasNextPage: Boolean(pageInfo.hasNextPage),
    endCursor: asString(pageInfo.endCursor),
  };
}

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

function buildCandidateIssuesQuery(includeProjectFilter: boolean): string {
  const projectFilter = includeProjectFilter ? "project: { slugId: { eq: $projectSlug } }" : "";
  return `
    query SymphonyCandidateIssues($after: String${includeProjectFilter ? ", $projectSlug: String!" : ""}) {
      issues(first: ${PAGE_SIZE}, after: $after, filter: {
        state: { type: { nin: ["completed", "canceled"] } }
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

function buildIssuesByIdsQuery(): string {
  return `
    query SymphonyIssuesByIds($ids: [ID!]) {
      issues(first: ${PAGE_SIZE}, filter: { id: { in: $ids } }) {
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

function buildIssuesByStatesQuery(): string {
  return `
    query SymphonyIssuesByStates($states: [String!]) {
      issues(first: ${PAGE_SIZE}, filter: { state: { name: { in: $states } } }) {
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

async function readJsonResponse(response: Response): Promise<GraphQLResponse> {
  const payload = (await response.json()) as GraphQLResponse;
  return payload;
}

export class LinearClient {
  constructor(
    private readonly getConfig: () => ServiceConfig,
    private readonly logger: SymphonyLogger,
  ) {}

  async fetchCandidateIssues(): Promise<Issue[]> {
    const config = this.getConfig();
    const issues: Issue[] = [];
    let after: string | null = null;
    const query = buildCandidateIssuesQuery(Boolean(config.tracker.projectSlug));

    do {
      const payload = await this.runGraphQL(query, {
        after,
        ...(config.tracker.projectSlug ? { projectSlug: config.tracker.projectSlug } : {}),
      });
      issues.push(...extractIssues(payload));
      const pageInfo = extractPageInfo(payload);
      after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
    } while (after);

    return issues;
  }

  async fetchIssueStatesByIds(ids: string[]): Promise<Issue[]> {
    if (ids.length === 0) {
      return [];
    }

    const payload = await this.runGraphQL(buildIssuesByIdsQuery(), { ids });
    return extractIssues(payload);
  }

  async fetchIssuesByStates(states: string[]): Promise<Issue[]> {
    if (states.length === 0) {
      return [];
    }

    const payload = await this.runGraphQL(buildIssuesByStatesQuery(), { states });
    return extractIssues(payload);
  }

  async runGraphQL(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<{ data?: Record<string, unknown>; errors?: unknown[] }> {
    const config = this.getConfig();
    const response = await fetch(LINEAR_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: config.tracker.apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });

    const payload = await readJsonResponse(response);
    if (!response.ok) {
      this.logger.error(
        {
          status: response.status,
          statusText: response.statusText,
          errors: payload.errors ?? null,
        },
        "linear graphql request failed",
      );
      throw new Error(`linear graphql request failed with status ${response.status}`);
    }

    return payload;
  }
}
