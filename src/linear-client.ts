import type { PlannedIssue, PlanningPriority } from "./planning-skill.js";
import type { Issue, IssueBlockerRef, ServiceConfig, SymphonyLogger } from "./types.js";

const PAGE_SIZE = 50;

interface GraphQLResponse {
  data?: Record<string, unknown>;
  errors?: unknown[];
}

interface LinearPlanTarget {
  teamId: string;
  projectId: string | null;
  labelIdsByName: Map<string, string>;
}

interface LinearCreatedIssue {
  id: string;
  identifier: string;
  url: string | null;
}

export type LinearErrorCode =
  | "linear_transport_error"
  | "linear_http_error"
  | "linear_graphql_error"
  | "linear_unknown_payload"
  | "linear_missing_end_cursor";

export class LinearClientError extends Error {
  constructor(
    readonly code: LinearErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LinearClientError";
  }
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

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
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

interface IssuesConnection {
  nodes: unknown[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

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

function buildIssuesByIdsQuery(): string {
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

function buildIssuesByStatesQuery(): string {
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

function buildProjectLookupQuery(): string {
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

function buildTeamLookupQuery(): string {
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

function buildLabelLookupQuery(): string {
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

function buildIssueCreateMutation(): string {
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

function extractNodesConnection(
  payload: GraphQLResponse,
  fieldName: string,
): { nodes: Record<string, unknown>[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } | null } {
  if (
    Object.prototype.hasOwnProperty.call(payload, "data") === false ||
    typeof payload.data !== "object" ||
    payload.data === null
  ) {
    throw new LinearClientError("linear_unknown_payload", "linear graphql response missing data object");
  }
  const root = payload.data as Record<string, unknown>;
  const connection = asRecord(root[fieldName]);
  const nodes = asArray(connection.nodes).map((node) => asRecord(node));
  const pageInfoRecord = asRecord(connection.pageInfo);
  const hasNextPage = asBoolean(pageInfoRecord.hasNextPage);
  const endCursor = asString(pageInfoRecord.endCursor);

  return {
    nodes,
    pageInfo:
      hasNextPage === null
        ? null
        : {
            hasNextPage,
            endCursor,
          },
  };
}

function normalizePlanningPriority(priority: PlanningPriority): number {
  if (priority === "high") {
    return 1;
  }
  if (priority === "medium") {
    return 2;
  }
  return 3;
}

function buildPlannedIssueDescription(
  issue: PlannedIssue,
  createdByPlanId: ReadonlyMap<string, LinearCreatedIssue>,
): string {
  const sections: string[] = [];
  if (issue.summary.trim()) {
    sections.push(issue.summary.trim());
  }

  if (issue.acceptanceCriteria.length > 0) {
    sections.push(
      ["Acceptance criteria:", ...issue.acceptanceCriteria.map((criterion) => `- ${criterion}`)].join("\n"),
    );
  }

  if (issue.dependencies.length > 0) {
    sections.push(
      [
        "Dependencies:",
        ...issue.dependencies.map((dependency) => {
          const created = createdByPlanId.get(dependency);
          return `- ${created?.identifier ?? dependency}`;
        }),
      ].join("\n"),
    );
  }

  sections.push(`Plan item: ${issue.id}`);
  return sections.filter(Boolean).join("\n\n");
}

async function readJsonResponse(response: Response): Promise<GraphQLResponse> {
  try {
    return (await response.json()) as GraphQLResponse;
  } catch (error) {
    throw new LinearClientError("linear_unknown_payload", "linear graphql response body is not valid json", {
      cause: error,
    });
  }
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

  async fetchIssueStatesByIds(ids: string[]): Promise<Issue[]> {
    if (ids.length === 0) {
      return [];
    }
    const issues: Issue[] = [];
    for (let index = 0; index < ids.length; index += PAGE_SIZE) {
      const chunk = ids.slice(index, index + PAGE_SIZE);
      let after: string | null = null;
      do {
        const payload = await this.runGraphQL(buildIssuesByIdsQuery(), { ids: chunk, after });
        const connection = extractIssuesConnection(payload);
        issues.push(...connection.nodes.map(normalizeIssue));
        const pageInfo = connection.pageInfo;
        ensurePaginationCursor(pageInfo, issues.length);
        after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
      } while (after);
    }
    return issues;
  }

  async fetchIssuesByStates(states: string[]): Promise<Issue[]> {
    if (states.length === 0) {
      return [];
    }
    const issues: Issue[] = [];
    let after: string | null = null;
    do {
      const payload = await this.runGraphQL(buildIssuesByStatesQuery(), { states, after });
      const connection = extractIssuesConnection(payload);
      issues.push(...connection.nodes.map(normalizeIssue));
      const pageInfo = connection.pageInfo;
      ensurePaginationCursor(pageInfo, issues.length);
      after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
    } while (after);
    return issues;
  }

  async createIssuesFromPlan(issues: PlannedIssue[]): Promise<LinearCreatedIssue[]> {
    if (issues.length === 0) {
      return [];
    }

    const target = await this.resolvePlanTarget(issues);
    const createdByPlanId = new Map<string, LinearCreatedIssue>();
    const created: LinearCreatedIssue[] = [];

    for (const issue of issues) {
      const payload = await this.runGraphQL(buildIssueCreateMutation(), {
        input: {
          title: issue.title,
          description: buildPlannedIssueDescription(issue, createdByPlanId),
          priority: normalizePlanningPriority(issue.priority),
          teamId: target.teamId,
          ...(target.projectId ? { projectId: target.projectId } : {}),
          ...(issue.labels.length > 0
            ? {
                labelIds: issue.labels
                  .map((label) => target.labelIdsByName.get(label.trim().toLowerCase()) ?? null)
                  .filter((labelId): labelId is string => Boolean(labelId)),
              }
            : {}),
        },
      });

      const issueCreate = asRecord(asRecord(payload.data).issueCreate);
      const success = asBoolean(issueCreate.success);
      const createdIssue = asRecord(issueCreate.issue);
      const id = asString(createdIssue.id);
      const identifier = asString(createdIssue.identifier);
      const url = asString(createdIssue.url);

      if (!success || !id || !identifier) {
        throw new LinearClientError("linear_unknown_payload", "linear issueCreate response missing created issue");
      }

      const nextIssue = { id, identifier, url };
      createdByPlanId.set(issue.id, nextIssue);
      created.push(nextIssue);
    }

    return created;
  }

  async runGraphQL(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<{ data?: Record<string, unknown>; errors?: unknown[] }> {
    const config = this.getConfig();
    let response: Response;
    try {
      response = await fetch(config.tracker.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: config.tracker.apiKey,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (error) {
      this.logger.error({ error: String(error) }, "linear graphql transport failed");
      throw new LinearClientError("linear_transport_error", "linear graphql request failed during transport", {
        cause: error,
      });
    }

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
      throw new LinearClientError("linear_http_error", `linear graphql request failed with status ${response.status}`);
    }

    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      this.logger.error({ errors: payload.errors }, "linear graphql response contained errors");
      throw new LinearClientError("linear_graphql_error", "linear graphql response contained errors");
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, "data") === false ||
      typeof payload.data !== "object" ||
      payload.data === null
    ) {
      throw new LinearClientError("linear_unknown_payload", "linear graphql response missing data object");
    }

    return payload;
  }

  private async resolvePlanTarget(issues: PlannedIssue[]): Promise<LinearPlanTarget> {
    const config = this.getConfig();
    let teamId: string;
    let projectId: string | null;

    if (config.tracker.projectSlug) {
      const payload = await this.runGraphQL(buildProjectLookupQuery(), {
        projectSlug: config.tracker.projectSlug,
      });
      const { nodes } = extractNodesConnection(payload, "projects");
      const project = nodes[0];
      const teams = asArray(asRecord(asRecord(project).teams).nodes).map((team) => asRecord(team));
      const firstTeam = teams[0];
      const resolvedProjectId = asString(project?.id);
      const resolvedTeamId = asString(firstTeam?.id);

      if (!resolvedProjectId || !resolvedTeamId) {
        throw new Error(`unable to resolve Linear project for slug ${config.tracker.projectSlug}`);
      }
      projectId = resolvedProjectId;
      teamId = resolvedTeamId;
    } else {
      projectId = null;
      const payload = await this.runGraphQL(buildTeamLookupQuery());
      const { nodes } = extractNodesConnection(payload, "teams");
      if (nodes.length !== 1) {
        throw new Error(
          `unable to resolve a unique Linear team without tracker.project_slug; found ${nodes.length} teams`,
        );
      }
      const resolvedTeamId = asString(nodes[0]?.id);
      if (!resolvedTeamId) {
        throw new Error("unable to resolve Linear team id");
      }
      teamId = resolvedTeamId;
    }

    const labelNames = [...new Set(issues.flatMap((issue) => issue.labels.map((label) => label.trim().toLowerCase())))];
    if (labelNames.length === 0) {
      return {
        teamId,
        projectId,
        labelIdsByName: new Map(),
      };
    }

    const payload = await this.runGraphQL(buildLabelLookupQuery(), {
      teamId,
      names: labelNames,
    });
    const { nodes } = extractNodesConnection(payload, "issueLabels");
    const labelIdsByName = new Map<string, string>();
    for (const label of nodes) {
      const id = asString(label.id);
      const name = asString(label.name)?.trim().toLowerCase();
      if (!id || !name) {
        continue;
      }
      labelIdsByName.set(name, id);
    }

    return {
      teamId,
      projectId,
      labelIdsByName,
    };
  }
}
