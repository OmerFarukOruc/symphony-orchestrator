import { asArray, asBooleanOrNull, asRecord, asStringOrNull, toErrorString } from "../utils/type-guards.js";
import { withRetry, withRetryReturn } from "../utils/retry.js";
import { normalizeIssue } from "./issue-parser.js";
import type { Issue, ServiceConfig, RisolutoLogger } from "../core/types.js";
import {
  PAGE_SIZE,
  buildCandidateIssuesQuery,
  buildCandidateIssuesByStateIdsQuery,
  buildIssuesByIdsQuery,
  buildIssuesByStatesQuery,
  buildProjectLookupQuery,
  buildCreateIssueMutation,
  buildWebhooksQuery,
  buildWebhookCreateMutation,
  buildWebhookUpdateMutation,
  buildWebhookDeleteMutation,
  buildTeamStatesQuery,
  buildAttachmentsForUrlQuery,
  buildAttachmentCreateMutation,
  buildAttachmentUpdateMutation,
  buildIssueByIdQuery,
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

export interface LinearAttachmentLookup {
  id: string;
  title: string | null;
  subtitle: string | null;
  url: string;
  issue: {
    id: string;
    identifier: string | null;
    title: string | null;
    stateName: string | null;
  } | null;
}

export interface LinearIssueLookup {
  id: string;
  identifier: string | null;
  title: string | null;
  stateName: string | null;
}

function buildWorkflowStateLookupQuery(includeTeamFilter: boolean): string {
  return `
    query RisolutoWorkflowStates${includeTeamFilter ? "($teamId: ID)" : ""} {
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

function assertIssueTransitionSucceeded(payload: { data?: Record<string, unknown> }): void {
  const issueUpdate = asRecord(asRecord(payload.data).issueUpdate);
  if (asBooleanOrNull(issueUpdate.success) !== true) {
    throw new LinearClientError("linear_unknown_payload", "linear issue transition was not confirmed");
  }
}

export class LinearClient {
  constructor(
    private readonly getConfig: () => ServiceConfig,
    private readonly logger: RisolutoLogger,
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
    const project = await this.resolveProjectContext(config);
    return project.teamId;
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
      teamIds: string[];
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
        resourceTypes: asArray(n.resourceTypes).map(String),
        teamIds: asArray(n.teamIds).map(String),
      };
    });
  }

  /**
   * Create a new webhook in the Linear workspace.
   * Retries up to 3 times with exponential backoff.
   */
  async createWebhook(input: {
    url: string;
    teamIds?: string[];
    resourceTypes: string[];
    label?: string;
    secret?: string;
  }): Promise<{ id: string; secret: string | null }> {
    const payload = await withRetryReturn(this.logger, "createWebhook", async () => {
      return this.runGraphQL(buildWebhookCreateMutation(), {
        url: input.url,
        teamIds: input.teamIds ?? null,
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
    await withRetry(this.logger, "updateWebhook", async () => {
      await this.runGraphQL(buildWebhookUpdateMutation(), { id, ...input });
    });
  }

  /**
   * Delete a webhook by ID.
   * Retries up to 3 times with exponential backoff.
   */
  async deleteWebhook(id: string): Promise<void> {
    await withRetry(this.logger, "deleteWebhook", async () => {
      await this.runGraphQL(buildWebhookDeleteMutation(), { id });
    });
  }

  /**
   * Transition a Linear issue to the given state ID.
   * Retries up to 3 times with exponential backoff. Non-blocking on failure.
   */
  async updateIssueState(issueId: string, stateId: string): Promise<void> {
    await withRetry(this.logger, "updateIssueState", async () => {
      await this.runGraphQL(buildIssueTransitionMutation(), { issueId, stateId });
    });
  }

  /**
   * Strict variant of {@link updateIssueState}. Re-throws on final retry failure
   * so callers that need to report success/failure to an operator (state
   * transition endpoints, tracker adapter `transitionIssue`) can distinguish
   * success from a silent swallow.
   */
  async updateIssueStateStrict(issueId: string, stateId: string): Promise<void> {
    const payload = await withRetryReturn(this.logger, "updateIssueState", async () => {
      return this.runGraphQL(buildIssueTransitionMutation(), { issueId, stateId });
    });
    assertIssueTransitionSucceeded(payload);
  }

  /**
   * Post a comment on a Linear issue.
   * Retries up to 3 times with exponential backoff. Non-blocking on failure.
   */
  async createComment(issueId: string, body: string): Promise<void> {
    await withRetry(this.logger, "createComment", async () => {
      await this.runGraphQL(buildIssueCommentMutation(), { issueId, body });
    });
  }

  async createIssue(input: {
    title: string;
    description?: string | null;
    stateName?: string | null;
  }): Promise<{ issueId: string; identifier: string; url: string | null }> {
    const config = this.getConfig();
    const project = await this.resolveProjectContext(config);
    if (!project.teamId) {
      throw new LinearClientError("linear_unknown_payload", "project team could not be resolved for issue creation");
    }
    const stateId = input.stateName ? await this.resolveTeamStateId(project.teamId, input.stateName) : null;
    const payload = await withRetryReturn(this.logger, "createIssue", async () => {
      return this.runGraphQL(buildCreateIssueMutation(), {
        teamId: project.teamId,
        projectId: project.projectId,
        title: input.title,
        description: input.description ?? null,
        stateId,
      });
    });
    const issueCreate = asRecord(asRecord(payload.data).issueCreate);
    const issue = asRecord(issueCreate.issue);
    const issueId = asStringOrNull(issue.id);
    const identifier = asStringOrNull(issue.identifier);
    const url = asStringOrNull(issue.url);
    if (issueCreate.success !== true || !issueId || !identifier) {
      throw new LinearClientError("linear_unknown_payload", "linear issue creation was not confirmed");
    }
    return { issueId, identifier, url };
  }

  async findAttachmentsForUrl(url: string): Promise<LinearAttachmentLookup[]> {
    const payload = await this.runGraphQL(buildAttachmentsForUrlQuery(), { url });
    const nodes = asArray(asRecord(asRecord(payload.data).attachmentsForURL).nodes).map((entry) => asRecord(entry));
    return nodes.map((node) => {
      const issueRecord = node.issue && typeof node.issue === "object" ? asRecord(node.issue) : null;
      const stateRecord = issueRecord ? asRecord(issueRecord.state) : null;
      return {
        id: asStringOrNull(node.id) ?? "",
        title: asStringOrNull(node.title),
        subtitle: asStringOrNull(node.subtitle),
        url: asStringOrNull(node.url) ?? url,
        issue: issueRecord
          ? {
              id: asStringOrNull(issueRecord.id) ?? "",
              identifier: asStringOrNull(issueRecord.identifier),
              title: asStringOrNull(issueRecord.title),
              stateName: stateRecord ? asStringOrNull(stateRecord.name) : null,
            }
          : null,
      } satisfies LinearAttachmentLookup;
    });
  }

  async createAttachment(input: {
    issueId: string;
    title: string;
    subtitle?: string | null;
    url: string;
    iconUrl?: string | null;
  }): Promise<{ attachmentId: string; url: string }> {
    const payload = await withRetryReturn(this.logger, "createAttachment", async () => {
      return this.runGraphQL(buildAttachmentCreateMutation(), {
        issueId: input.issueId,
        title: input.title,
        subtitle: input.subtitle ?? null,
        url: input.url,
        iconUrl: input.iconUrl ?? null,
      });
    });
    const attachmentCreate = asRecord(asRecord(payload.data).attachmentCreate);
    const attachment = asRecord(attachmentCreate.attachment);
    const attachmentId = asStringOrNull(attachment.id);
    const createdUrl = asStringOrNull(attachment.url) ?? input.url;
    if (attachmentCreate.success !== true || !attachmentId) {
      throw new LinearClientError("linear_unknown_payload", "linear attachment creation was not confirmed");
    }
    return { attachmentId, url: createdUrl };
  }

  async updateAttachment(
    id: string,
    input: {
      title?: string | null;
      subtitle?: string | null;
      iconUrl?: string | null;
    },
  ): Promise<void> {
    await withRetry(this.logger, "updateAttachment", async () => {
      await this.runGraphQL(buildAttachmentUpdateMutation(), {
        id,
        title: input.title ?? null,
        subtitle: input.subtitle ?? null,
        iconUrl: input.iconUrl ?? null,
      });
    });
  }

  async getIssueById(id: string): Promise<LinearIssueLookup | null> {
    const payload = await this.runGraphQL(buildIssueByIdQuery(), { id });
    const issue = asRecord(asRecord(payload.data).issue);
    const issueId = asStringOrNull(issue.id);
    if (!issueId) {
      return null;
    }
    const state = asRecord(issue.state);
    return {
      id: issueId,
      identifier: asStringOrNull(issue.identifier),
      title: asStringOrNull(issue.title),
      stateName: asStringOrNull(state.name),
    } satisfies LinearIssueLookup;
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

  private async resolveProjectContext(
    config: ServiceConfig,
  ): Promise<{ projectId: string | null; teamId: string | null }> {
    if (!config.tracker.projectSlug) {
      throw new LinearClientError("linear_unknown_payload", "tracker.projectSlug is required to create Linear issues");
    }
    const payload = await this.runGraphQL(buildProjectLookupQuery(), { projectSlug: config.tracker.projectSlug });
    const projects = asRecord(asRecord(payload.data).projects);
    const project = asRecord(asArray(projects.nodes).at(0));
    return {
      projectId: asStringOrNull(project.id),
      teamId: asStringOrNull(asRecord(asArray(asRecord(project.teams).nodes).at(0)).id),
    };
  }

  private async resolveTeamStateId(teamId: string | null, stateName: string): Promise<string | null> {
    if (!teamId) {
      return null;
    }
    const payload = await this.runGraphQL(buildTeamStatesQuery(), { teamId });
    const team = asRecord(asRecord(payload.data).team);
    const states = asArray(asRecord(team.states).nodes);
    const target = stateName.trim().toLowerCase();
    for (const state of states.map((entry) => asRecord(entry))) {
      const id = asStringOrNull(state.id);
      const name = asStringOrNull(state.name)?.trim().toLowerCase();
      if (id && name === target) {
        return id;
      }
    }
    return null;
  }
}
