import type { PlannedIssue } from "../planning/skill.js";
import { normalizePlanningPriority, buildPlannedIssueDescription } from "./plan-helpers.js";
import { resolvePlanTarget } from "./plan-target.js";
import { asArray, asBooleanOrNull, asRecord, asStringOrNull } from "../utils/type-guards.js";
import { normalizeIssue } from "./issue-parser.js";
import type { Issue, ServiceConfig, SymphonyLogger } from "../core/types.js";
import {
  PAGE_SIZE,
  buildCandidateIssuesQuery,
  buildCandidateIssuesByStateIdsQuery,
  buildIssuesByIdsQuery,
  buildIssuesByStatesQuery,
  buildProjectLookupQuery,
  buildTeamLookupQuery,
  buildLabelLookupQuery,
  buildIssueCreateMutation,
} from "./queries.js";
import { fetchCandidateIssues, fetchIssueStatesByIds, fetchIssuesByStates } from "./issue-pagination.js";
import { LinearClientError } from "./errors.js";

export { LinearClientError } from "./errors.js";

interface GraphQLResponse {
  data?: Record<string, unknown>;
  errors?: unknown[];
}

interface LinearCreatedIssue {
  id: string;
  identifier: string;
  url: string | null;
}

interface ResolvedWorkflowStates {
  stateIds: string[];
  teamId: string | null;
  unresolvedStates: string[];
}

function buildWorkflowStateLookupQuery(includeTeamFilter: boolean): string {
  return `
    query SymphonyWorkflowStates${includeTeamFilter ? "($teamId: String!)" : ""} {
      workflowStates(first: 250${includeTeamFilter ? ", filter: { team: { id: { eq: $teamId } } }" : ""}) {
        nodes {
          id
          name
        }
      }
    }
  `;
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
    const config = this.getConfig();
    const issues = await fetchCandidateIssues(
      {
        runGraphQL: (query, variables) => this.runGraphQL(query, variables),
        getConfig: () => config,
      },
      (hasProjectSlug) => buildCandidateIssuesQuery(hasProjectSlug),
      normalizeIssue,
    );
    if (issues.length > 0) {
      return issues;
    }

    const resolvedStates = await this.resolveWorkflowStateIds();
    if (resolvedStates.stateIds.length === 0) {
      this.logger.warn(
        {
          activeStates: config.tracker.activeStates,
          projectSlug: config.tracker.projectSlug,
          teamId: resolvedStates.teamId,
          unresolvedStates: resolvedStates.unresolvedStates,
        },
        "linear candidate issue fallback could not resolve workflow states",
      );
      return [];
    }

    return this.fetchCandidateIssuesByStateIds(config, resolvedStates.stateIds);
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
      const success = asBooleanOrNull(issueCreate.success);
      const createdIssue = asRecord(issueCreate.issue);
      const id = asStringOrNull(createdIssue.id);
      const identifier = asStringOrNull(createdIssue.identifier);
      const url = asStringOrNull(createdIssue.url);

      if (!success || !id || !identifier) {
        throw new LinearClientError("linear_unknown_payload", "linear issueCreate response missing created issue");
      }

      const nextIssue = { id, identifier, url };
      createdByPlanId.set(issue.id, nextIssue);
      created.push(nextIssue);
    }

    return created;
  }

  private async resolveWorkflowStateIds(): Promise<ResolvedWorkflowStates> {
    const config = this.getConfig();
    const teamId = await this.resolveWorkflowTeamId(config);
    const payload = await this.runGraphQL(buildWorkflowStateLookupQuery(Boolean(teamId)), teamId ? { teamId } : {});
    const nodes = asArray(asRecord(asRecord(payload.data).workflowStates).nodes).map((node) => asRecord(node));
    const stateIdsByName = new Map<string, string[]>();

    for (const node of nodes) {
      const id = asStringOrNull(node.id);
      const name = asStringOrNull(node.name)?.trim().toLowerCase();
      if (!id || !name) {
        continue;
      }
      stateIdsByName.set(name, [...(stateIdsByName.get(name) ?? []), id]);
    }

    const stateIds: string[] = [];
    const unresolvedStates: string[] = [];
    for (const configuredState of config.tracker.activeStates) {
      const resolvedIds = stateIdsByName.get(configuredState.trim().toLowerCase());
      if (!resolvedIds || resolvedIds.length === 0) {
        unresolvedStates.push(configuredState);
        continue;
      }
      stateIds.push(...resolvedIds);
    }

    return {
      stateIds: [...new Set(stateIds)],
      teamId,
      unresolvedStates,
    };
  }

  private async resolveWorkflowTeamId(config: ServiceConfig): Promise<string | null> {
    if (!config.tracker.projectSlug) {
      return null;
    }
    const payload = await this.runGraphQL(buildProjectLookupQuery(), { projectSlug: config.tracker.projectSlug });
    const projects = asRecord(asRecord(payload.data).projects);
    const project = asRecord(asArray(projects.nodes).at(0));
    return asStringOrNull(asRecord(asArray(asRecord(project.teams).nodes).at(0)).id);
  }

  private async fetchCandidateIssuesByStateIds(config: ServiceConfig, stateIds: string[]): Promise<Issue[]> {
    return fetchCandidateIssues(
      {
        runGraphQL: (query, variables) => {
          const { activeStates: _activeStates, ...rest } = variables;
          return this.runGraphQL(query, { ...rest, stateIds });
        },
        getConfig: () => ({ ...config, tracker: { ...config.tracker, activeStates: stateIds } }),
      },
      (hasProjectSlug) => buildCandidateIssuesByStateIdsQuery(hasProjectSlug),
      normalizeIssue,
    );
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
