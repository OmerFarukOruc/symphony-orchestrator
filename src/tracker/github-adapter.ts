import type { Issue, RisolutoLogger, ServiceConfig } from "../core/types.js";
import { GitHubIssuesClient, normalizeGitHubIssue } from "../github/issues-client.js";
import { toErrorString } from "../utils/type-guards.js";
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

interface GitHubLabelPayload {
  id?: number;
  name?: string;
}

const GITHUB_LABEL_DESCRIPTION = "Risoluto automation marker";

/**
 * Thin adapter that implements TrackerPort by delegating to GitHubIssuesClient.
 * GitHub uses label names as state identifiers — there are no separate "state IDs".
 */
export class GitHubTrackerAdapter implements TrackerPort {
  constructor(
    private readonly client: GitHubIssuesClient,
    private readonly getConfig: () => ServiceConfig,
    private readonly logger?: Pick<RisolutoLogger, "warn">,
  ) {}

  async fetchCandidateIssues(): Promise<Issue[]> {
    const config = this.getConfig();
    const { owner, repo, activeStates, terminalStates } = config.tracker;
    const open = await this.client.fetchOpenIssues();
    return open.map((r) => normalizeGitHubIssue(r, owner ?? "", repo ?? "", activeStates, terminalStates));
  }

  async fetchIssueStatesByIds(ids: string[]): Promise<Issue[]> {
    const config = this.getConfig();
    const { owner, repo, activeStates, terminalStates } = config.tracker;
    const numbers = ids.map(Number).filter((n) => !Number.isNaN(n));
    const raw = await this.client.fetchIssuesByNumbers(numbers);
    return raw.map((r) => normalizeGitHubIssue(r, owner ?? "", repo ?? "", activeStates, terminalStates));
  }

  async fetchIssuesByStates(states: string[]): Promise<Issue[]> {
    const config = this.getConfig();
    const { owner, repo, activeStates, terminalStates } = config.tracker;
    const raw = await this.client.fetchOpenIssues(states);
    return raw.map((r) => normalizeGitHubIssue(r, owner ?? "", repo ?? "", activeStates, terminalStates));
  }

  async resolveStateId(stateName: string): Promise<string | null> {
    // GitHub uses label names directly as state IDs — no resolution needed.
    return stateName || null;
  }

  async updateIssueState(issueId: string, stateId: string): Promise<void> {
    const number = Number(issueId);
    const config = this.getConfig();
    const isTerminal = config.tracker.terminalStates.includes(stateId);
    await this.client.withRetry("addLabel", () => this.client.addLabel(number, stateId));
    if (isTerminal) {
      await this.client.withRetry("closeIssue", () => this.client.closeIssue(number));
    } else {
      await this.client.withRetry("reopenIssue", () => this.client.reopenIssue(number));
    }
  }

  async createComment(issueId: string, body: string): Promise<void> {
    await this.client.withRetry("createComment", () => this.client.createComment(Number(issueId), body));
  }

  async createIssue(input: TrackerIssueCreateInput): Promise<TrackerIssueCreateResult> {
    const config = this.getConfig();
    const defaultState = config.tracker.activeStates.at(0) ?? null;
    const labels = [input.stateName ?? defaultState].filter(
      (label): label is string => typeof label === "string" && label.length > 0,
    );
    const raw = await this.client.createIssue({
      title: input.title,
      body: input.description ?? null,
      labels,
    });
    const normalized = normalizeGitHubIssue(
      raw,
      config.tracker.owner ?? "",
      config.tracker.repo ?? "",
      config.tracker.activeStates,
      config.tracker.terminalStates,
    );
    return {
      issueId: normalized.id,
      identifier: normalized.identifier,
      url: normalized.url,
    };
  }

  async transitionIssue(issueId: string, stateId: string): Promise<{ success: boolean }> {
    try {
      await this.updateIssueState(issueId, stateId);
      return { success: true };
    } catch (error) {
      this.logger?.warn({ issueId, stateId, error: toErrorString(error) }, "github tracker transition failed");
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
        return { projects: [] };
      case "select_project":
        return { ok: true };
      case "create_project":
        throw new Error("GitHub tracker does not support project creation through setup");
      case "create_test_issue":
        return this.createTestIssue();
      case "create_label":
        return this.createLabel();
    }
  }

  private getGitHubApiBaseUrl(): string {
    return this.getConfig().tracker.endpoint || "https://api.github.com";
  }

  private getGitHubToken(): string {
    return this.getConfig().github?.token ?? process.env.GITHUB_TOKEN ?? "";
  }

  private getRepoPath(): string {
    const config = this.getConfig();
    const owner = config.tracker.owner?.trim();
    const repo = config.tracker.repo?.trim();
    if (!owner || !repo) {
      throw new Error("tracker.owner and tracker.repo are required for GitHub setup provisioning");
    }
    return `/repos/${owner}/${repo}`;
  }

  private async requestGitHub(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${this.getGitHubApiBaseUrl()}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${this.getGitHubToken()}`,
        ...((init?.headers as Record<string, string> | undefined) ?? {}),
      },
      body: init?.body,
    });
  }

  private async readLabel(path: string): Promise<GitHubLabelPayload> {
    const response = await this.requestGitHub(path);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`GitHub API returned ${response.status}: ${body}`);
    }
    return (await response.json()) as GitHubLabelPayload;
  }

  private async createTestIssue(): Promise<TrackerProvisionCreateTestIssueResult> {
    const issue = await this.createIssue({
      title: "Risoluto smoke test",
      description:
        "This issue was created automatically to verify your Risoluto setup. " +
        "Risoluto should pick it up within one poll cycle and run a sandboxed agent.",
      stateName: this.getConfig().tracker.activeStates.at(0) ?? null,
    });

    return {
      ok: true,
      issueIdentifier: issue.identifier,
      issueUrl: issue.url ?? "",
    };
  }

  private async createLabel(): Promise<TrackerProvisionCreateLabelResult> {
    const repoPath = this.getRepoPath();
    const response = await this.requestGitHub(`${repoPath}/labels`, {
      method: "POST",
      body: JSON.stringify({
        name: "risoluto",
        color: "2563eb",
        description: GITHUB_LABEL_DESCRIPTION,
      }),
    });

    if (response.status === 201) {
      const payload = (await response.json()) as GitHubLabelPayload;
      return {
        ok: true,
        labelId: payload.id ? String(payload.id) : "",
        labelName: payload.name ?? "risoluto",
        alreadyExists: false,
      };
    }

    if (response.status === 422) {
      const payload = await this.readLabel(`${repoPath}/labels/${encodeURIComponent("risoluto")}`);
      return {
        ok: true,
        labelId: payload.id ? String(payload.id) : "",
        labelName: payload.name ?? "risoluto",
        alreadyExists: true,
      };
    }

    const body = await response.text().catch(() => "");
    throw new Error(`GitHub API returned ${response.status}: ${body}`);
  }
}
