import { randomInt } from "node:crypto";
import { asArray, asRecord, asStringOrNull, toErrorString } from "../utils/type-guards.js";
import { normalizeIssue } from "./issue-parser.js";
import type { Issue, ServiceConfig, SymphonyLogger } from "../core/types.js";
import {
  PAGE_SIZE,
  buildCandidateIssuesQuery,
  buildCandidateIssuesByStateIdsQuery,
  buildIssuesByIdsQuery,
  buildIssuesByStatesQuery,
  buildProjectLookupQuery,
  buildWebhooksQuery,
  buildWebhookCreateMutation,
  buildWebhookUpdateMutation,
  buildWebhookDeleteMutation,
} from "./queries.js";
import { fetchCandidateIssues, fetchIssueStatesByIds, fetchIssuesByStates } from "./issue-pagination.js";
import { LinearClientError } from "./errors.js";
import { buildIssueTransitionMutation, buildIssueCommentMutation } from "./transition-query.js";

export { LinearClientError } from "./errors.js";

interface GraphQLResponse {
  data?: Record<string, unknown>;
  errors?: unknown[];
}

interface ResolvedWorkflowStates {
  stateIds: string[];
  teamId: string | null;
  unresolvedStates: string[];
}

function buildWorkflowStateLookupQuery(includeTeamFilter: boolean): string {
  return `
    query SymphonyWorkflowStates${includeTeamFilter ? "($teamId: ID)" : ""} {
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

  /**
   * Resolve the Linear state ID for a given state name (case-insensitive).
   * Uses team-filtered lookup when a project slug is configured, so that
   * the correct team's state is selected in multi-team workspaces.
   * Returns null if the state name cannot be matched.
   */
  async resolveStateId(stateName: string): Promise<string | null> {
    const config = this.getConfig();
    const teamId = await this.resolveWorkflowTeamId(config);
    const payload = await this.runGraphQL(buildWorkflowStateLookupQuery(Boolean(teamId)), teamId ? { teamId } : {});
    const nodes = asArray(asRecord(asRecord(payload.data).workflowStates).nodes).map((n) => asRecord(n));
    const target = stateName.trim().toLowerCase();
    for (const node of nodes) {
      const id = asStringOrNull(node.id);
      const name = asStringOrNull(node.name)?.trim().toLowerCase();
      if (id && name === target) return id;
    }
    return null;
  }

  /**
   * List all webhooks registered in the Linear workspace.
   */
  async listWebhooks(): Promise<
    Array<{
      id: string;
      url: string;
      enabled: boolean;
      label: string | null;
      secret: string | null;
      resourceTypes: string[];
      teamId: string | null;
    }>
  > {
    const payload = await this.runGraphQL(buildWebhooksQuery());
    const nodes = asArray(asRecord(asRecord(payload.data).webhooks).nodes);
    return nodes.map((node) => {
      const n = asRecord(node);
      return {
        id: asStringOrNull(n.id) ?? "",
        url: asStringOrNull(n.url) ?? "",
        enabled: n.enabled === true,
        label: asStringOrNull(n.label),
        secret: asStringOrNull(n.secret),
        resourceTypes: asArray(n.resourceTypes).map((rt) => String(rt)),
        teamId: asStringOrNull(n.teamId),
      };
    });
  }

  /**
   * Create a new webhook in the Linear workspace.
   * Retries up to 3 times with exponential backoff.
   */
  async createWebhook(input: {
    url: string;
    teamId?: string;
    resourceTypes: string[];
    label?: string;
    secret?: string;
  }): Promise<{ id: string; secret: string | null }> {
    const payload = await this.withRetryReturn("createWebhook", async () => {
      return this.runGraphQL(buildWebhookCreateMutation(), {
        url: input.url,
        teamId: input.teamId ?? null,
        resourceTypes: input.resourceTypes,
        label: input.label ?? null,
        secret: input.secret ?? null,
      });
    });
    const webhook = asRecord(asRecord(asRecord(payload.data).webhookCreate).webhook);
    return {
      id: asStringOrNull(webhook.id) ?? "",
      secret: asStringOrNull(webhook.secret),
    };
  }

  /**
   * Update an existing webhook (e.g. re-enable, change URL or resource types).
   * Retries up to 3 times with exponential backoff.
   */
  async updateWebhook(
    id: string,
    input: {
      enabled?: boolean;
      url?: string;
      label?: string;
      resourceTypes?: string[];
      secret?: string;
    },
  ): Promise<void> {
    await this.withRetry("updateWebhook", async () => {
      await this.runGraphQL(buildWebhookUpdateMutation(), { id, ...input });
    });
  }

  /**
   * Delete a webhook by ID.
   * Retries up to 3 times with exponential backoff.
   */
  async deleteWebhook(id: string): Promise<void> {
    await this.withRetry("deleteWebhook", async () => {
      await this.runGraphQL(buildWebhookDeleteMutation(), { id });
    });
  }

  /**
   * Transition a Linear issue to the given state ID.
   * Retries up to 3 times with exponential backoff. Non-blocking on failure.
   */
  async updateIssueState(issueId: string, stateId: string): Promise<void> {
    await this.withRetry("updateIssueState", async () => {
      await this.runGraphQL(buildIssueTransitionMutation(), { issueId, stateId });
    });
  }

  /**
   * Post a comment on a Linear issue.
   * Retries up to 3 times with exponential backoff. Non-blocking on failure.
   */
  async createComment(issueId: string, body: string): Promise<void> {
    await this.withRetry("createComment", async () => {
      await this.runGraphQL(buildIssueCommentMutation(), { issueId, body });
    });
  }

  private async withRetry(operation: string, fn: () => Promise<void>): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await fn();
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          this.logger.warn(
            { operation, attempt, error: toErrorString(error) },
            "linear write-back failed after max retries (non-fatal)",
          );
          return;
        }
        const delayMs = 1000 * 2 ** (attempt - 1) * (randomInt(500, 1000) / 1000);
        this.logger.warn({ operation, attempt, delayMs, error: toErrorString(error) }, "linear write-back retry");
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  private async withRetryReturn<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        const delayMs = 1000 * 2 ** (attempt - 1) * (randomInt(500, 1000) / 1000);
        this.logger.warn({ operation, attempt, delayMs, error: toErrorString(error) }, "linear write-back retry");
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    /* c8 ignore next -- unreachable: loop always returns or throws */
    throw new LinearClientError("linear_unknown_payload", `${operation} exhausted retries without result`);
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
      this.logger.error({ error: toErrorString(error) }, "linear graphql transport failed");
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
