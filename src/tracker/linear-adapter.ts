import type { Issue, RisolutoLogger, ServiceConfig } from "../core/types.js";
import type { LinearClient } from "../linear/client.js";
import {
  buildCreateIssueMutation,
  buildCreateLabelMutation,
  buildCreateProjectMutation,
  buildProjectLookupQuery,
  buildTeamStatesQuery,
  buildTeamsQuery,
} from "../linear/queries.js";
import type {
  TrackerIssueCreateInput,
  TrackerIssueCreateResult,
  TrackerPort,
  TrackerProvisionCreateLabelInput,
  TrackerProvisionCreateLabelResult,
  TrackerProvisionCreateProjectInput,
  TrackerProvisionCreateProjectResult,
  TrackerProvisionCreateTestIssueInput,
  TrackerProvisionCreateTestIssueResult,
  TrackerProvisionInput,
  TrackerProvisionListProjectsInput,
  TrackerProvisionListProjectsResult,
  TrackerProvisionSelectProjectInput,
  TrackerProvisionSelectProjectResult,
} from "./port.js";
import { toErrorString } from "../utils/type-guards.js";

interface LinearGraphQLResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message?: string }>;
}

interface LinearTeam {
  id: string;
  key: string;
}

interface LinearProjectContext {
  id: string;
  teamId: string | null;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class LinearTrackerAdapter implements TrackerPort {
  constructor(
    private readonly client: LinearClient,
    private readonly getConfig?: () => ServiceConfig,
    private readonly logger?: Pick<RisolutoLogger, "warn">,
  ) {}

  fetchCandidateIssues(): Promise<Issue[]> {
    return this.client.fetchCandidateIssues();
  }

  fetchIssueStatesByIds(ids: string[]): Promise<Issue[]> {
    return this.client.fetchIssueStatesByIds(ids);
  }

  fetchIssuesByStates(states: string[]): Promise<Issue[]> {
    return this.client.fetchIssuesByStates(states);
  }

  resolveStateId(stateName: string): Promise<string | null> {
    return this.client.resolveStateId(stateName);
  }

  updateIssueState(issueId: string, stateId: string): Promise<void> {
    return this.client.updateIssueState(issueId, stateId);
  }

  createComment(issueId: string, body: string): Promise<void> {
    return this.client.createComment(issueId, body);
  }

  createIssue(input: TrackerIssueCreateInput): Promise<TrackerIssueCreateResult> {
    return this.client.createIssue({
      title: input.title,
      description: input.description ?? null,
      stateName: input.stateName ?? null,
    });
  }

  async transitionIssue(issueId: string, stateId: string): Promise<{ success: boolean }> {
    try {
      await this.client.updateIssueStateStrict(issueId, stateId);
      return { success: true };
    } catch (error) {
      this.logger?.warn({ issueId, stateId, error: toErrorString(error) }, "linear tracker transition failed");
      return { success: false };
    }
  }

  provision(input: TrackerProvisionListProjectsInput): Promise<TrackerProvisionListProjectsResult>;
  provision(input: TrackerProvisionSelectProjectInput): Promise<TrackerProvisionSelectProjectResult>;
  provision(input: TrackerProvisionCreateProjectInput): Promise<TrackerProvisionCreateProjectResult>;
  provision(input: TrackerProvisionCreateTestIssueInput): Promise<TrackerProvisionCreateTestIssueResult>;
  provision(input: TrackerProvisionCreateLabelInput): Promise<TrackerProvisionCreateLabelResult>;
  async provision(
    input: TrackerProvisionInput,
  ): Promise<
    | TrackerProvisionListProjectsResult
    | TrackerProvisionSelectProjectResult
    | TrackerProvisionCreateProjectResult
    | TrackerProvisionCreateTestIssueResult
    | TrackerProvisionCreateLabelResult
  > {
    switch (input.type) {
      case "list_projects":
        return this.listProjects();
      case "select_project":
        return { ok: true };
      case "create_project":
        return this.createProject(input.name);
      case "create_test_issue":
        return this.createTestIssue();
      case "create_label":
        return this.createLabel();
    }
  }

  private requireConfig(): ServiceConfig {
    if (this.getConfig) {
      return this.getConfig();
    }
    throw new Error("Linear tracker provisioning requires access to the resolved service config");
  }

  private async runGraphQL(query: string, variables: Record<string, unknown>): Promise<LinearGraphQLResponse> {
    const config = this.requireConfig();
    const response = await fetch(config.tracker.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: config.tracker.apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Linear API returned ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as LinearGraphQLResponse;
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((error) => error.message ?? "Linear GraphQL error").join("; "));
    }

    return payload;
  }

  private async listProjects(): Promise<TrackerProvisionListProjectsResult> {
    const payload = await this.runGraphQL(
      "{ projects(first: 50) { nodes { id name slugId teams { nodes { key } } } } }",
      {},
    );
    const nodes = (payload.data?.projects as { nodes?: Array<Record<string, unknown>> } | undefined)?.nodes ?? [];

    return {
      projects: nodes.map((node) => {
        const teams = node.teams as { nodes?: Array<{ key?: string }> } | undefined;
        return {
          id: node.id,
          name: node.name,
          slugId: node.slugId,
          teamKey: teams?.nodes?.[0]?.key ?? null,
        };
      }),
    };
  }

  private async readTeams(): Promise<LinearTeam[]> {
    const payload = await this.runGraphQL(buildTeamsQuery(), {});
    return ((payload.data?.teams as { nodes?: LinearTeam[] } | undefined)?.nodes ?? []).filter(
      (team): team is LinearTeam => typeof team.id === "string" && typeof team.key === "string",
    );
  }

  private async createProject(name: string): Promise<TrackerProvisionCreateProjectResult> {
    const teams = await this.readTeams();
    if (teams.length === 0) {
      throw new Error("No teams found in your Linear workspace");
    }

    const payload = await this.runGraphQL(buildCreateProjectMutation(), {
      name,
      teamIds: [teams[0].id],
    });
    const result = payload.data?.projectCreate as
      | {
          success?: boolean;
          project?: {
            id?: string;
            name?: string;
            slugId?: string;
            url?: string;
            teams?: { nodes?: Array<{ key?: string }> };
          };
        }
      | undefined;

    if (!result?.success || !result.project?.slugId) {
      throw new Error("Linear did not confirm project creation");
    }

    return {
      ok: true,
      project: {
        id: result.project.id,
        name: result.project.name,
        slugId: result.project.slugId,
        url: result.project.url ?? null,
        teamKey: result.project.teams?.nodes?.[0]?.key ?? teams[0].key,
      },
    };
  }

  private async resolveProjectContext(): Promise<LinearProjectContext> {
    const config = this.requireConfig();
    if (!config.tracker.projectSlug) {
      throw new Error("No Linear project selected");
    }

    const payload = await this.runGraphQL(buildProjectLookupQuery(), {
      projectSlug: config.tracker.projectSlug,
    });
    const nodes = (payload.data?.projects as { nodes?: Array<Record<string, unknown>> } | undefined)?.nodes ?? [];
    const project = nodes[0];
    if (!project || typeof project.id !== "string") {
      throw new Error(`Project "${config.tracker.projectSlug}" not found`);
    }

    const teamId = (project.teams as { nodes?: Array<{ id?: string }> } | undefined)?.nodes?.[0]?.id ?? null;

    return { id: project.id, teamId };
  }

  private async resolveInProgressStateId(teamId: string): Promise<string> {
    const payload = await this.runGraphQL(buildTeamStatesQuery(), { teamId });
    const nodes = (payload.data?.team as { states?: { nodes?: Array<{ id?: string; name?: string }> } } | undefined)
      ?.states?.nodes;
    const inProgress = nodes?.find(
      (state) => typeof state.name === "string" && state.name.trim().toLowerCase() === "in progress",
    );
    if (!inProgress?.id) {
      throw new Error('No "In Progress" state found for the team');
    }
    return inProgress.id;
  }

  private async createTestIssue(): Promise<TrackerProvisionCreateTestIssueResult> {
    const project = await this.resolveProjectContext();
    if (!project.teamId) {
      throw new Error("No team found for the selected project");
    }

    const stateId = await this.resolveInProgressStateId(project.teamId);
    const payload = await this.runGraphQL(buildCreateIssueMutation(), {
      teamId: project.teamId,
      projectId: project.id,
      title: "Risoluto smoke test",
      description:
        "This issue was created automatically to verify your Risoluto setup. " +
        "Risoluto should pick it up within one poll cycle and run a sandboxed agent.",
      stateId,
    });

    const result = payload.data?.issueCreate as
      | { success?: boolean; issue?: { identifier?: string; url?: string } }
      | undefined;
    if (!result?.success || !result.issue?.identifier || !result.issue.url) {
      throw new Error("Linear did not confirm issue creation");
    }

    return {
      ok: true,
      issueIdentifier: result.issue.identifier,
      issueUrl: result.issue.url,
    };
  }

  private async createLabel(): Promise<TrackerProvisionCreateLabelResult> {
    const project = await this.resolveProjectContext();
    if (!project.teamId) {
      throw new Error("No team found for the selected project");
    }

    try {
      const payload = await this.runGraphQL(buildCreateLabelMutation(), {
        teamId: project.teamId,
        name: "risoluto",
        color: "#2563eb",
      });
      const result = payload.data?.issueLabelCreate as
        | { success?: boolean; issueLabel?: { id?: string; name?: string } }
        | undefined;
      if (!result?.success || !result.issueLabel?.id || !result.issueLabel?.name) {
        throw new Error("Linear did not confirm label creation");
      }

      return {
        ok: true,
        labelId: result.issueLabel.id,
        labelName: result.issueLabel.name,
        alreadyExists: false,
      };
    } catch (error) {
      const message = toErrorMessage(error).toLowerCase();
      if (!message.includes("duplicate")) {
        throw error;
      }

      return {
        ok: true,
        labelId: "",
        labelName: "risoluto",
        alreadyExists: true,
      };
    }
  }
}
