import type { PlannedIssue, PlanningPriority } from "../planning/skill.js";
import { resolvePlanTarget } from "./plan-target.js";
import { asBooleanOrNull, asRecord, asStringOrNull } from "../utils/type-guards.js";
import { normalizeIssue } from "./issue-parser.js";
import type { Issue, ServiceConfig, SymphonyLogger } from "../core/types.js";
import {
  PAGE_SIZE,
  buildCandidateIssuesQuery,
  buildIssuesByIdsQuery,
  buildIssuesByStatesQuery,
  buildProjectLookupQuery,
  buildTeamLookupQuery,
  buildLabelLookupQuery,
  buildIssueCreateMutation,
} from "./queries.js";
import { fetchCandidateIssues, fetchIssueStatesByIds, fetchIssuesByStates } from "./issue-pagination.js";

interface GraphQLResponse {
  data?: Record<string, unknown>;
  errors?: unknown[];
}

interface LinearCreatedIssue {
  id: string;
  identifier: string;
  url: string | null;
}

type LinearErrorCode =
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

const asString = asStringOrNull;
const asBoolean = asBooleanOrNull;

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

export class LinearClient {
  constructor(
    private readonly getConfig: () => ServiceConfig,
    private readonly logger: SymphonyLogger,
  ) {}

  async fetchCandidateIssues(): Promise<Issue[]> {
    return fetchCandidateIssues(
      {
        runGraphQL: (query, variables) => this.runGraphQL(query, variables),
        getConfig: () => this.getConfig(),
      },
      (hasProjectSlug) => buildCandidateIssuesQuery(hasProjectSlug),
      normalizeIssue,
    );
  }

  async fetchIssueStatesByIds(ids: string[]): Promise<Issue[]> {
    return fetchIssueStatesByIds(
      {
        runGraphQL: (query, variables) => this.runGraphQL(query, variables),
        getConfig: () => this.getConfig(),
      },
      ids,
      PAGE_SIZE,
      buildIssuesByIdsQuery,
      normalizeIssue,
    );
  }

  async fetchIssuesByStates(states: string[]): Promise<Issue[]> {
    return fetchIssuesByStates(
      {
        runGraphQL: (query, variables) => this.runGraphQL(query, variables),
        getConfig: () => this.getConfig(),
      },
      states,
      buildIssuesByStatesQuery,
      normalizeIssue,
    );
  }

  async createIssuesFromPlan(issues: PlannedIssue[]): Promise<LinearCreatedIssue[]> {
    if (issues.length === 0) {
      return [];
    }

    const target = await resolvePlanTarget({
      issues,
      config: this.getConfig(),
      runGraphQL: (query, variables) => this.runGraphQL(query, variables),
      buildProjectLookupQuery,
      buildTeamLookupQuery,
      buildLabelLookupQuery,
    });
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

    if (Object.hasOwn(payload, "data") === false || typeof payload.data !== "object" || payload.data === null) {
      throw new LinearClientError("linear_unknown_payload", "linear graphql response missing data object");
    }

    return payload;
  }
}
