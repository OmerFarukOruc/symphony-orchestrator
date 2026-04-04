import type { Issue, ServiceConfig } from "../core/types.js";
import { GitHubIssuesClient, normalizeGitHubIssue } from "../github/issues-client.js";
import type { TrackerIssueCreateInput, TrackerIssueCreateResult, TrackerPort } from "./port.js";

/**
 * Thin adapter that implements TrackerPort by delegating to GitHubIssuesClient.
 * GitHub uses label names as state identifiers — there are no separate "state IDs".
 */
export class GitHubTrackerAdapter implements TrackerPort {
  constructor(
    private readonly client: GitHubIssuesClient,
    private readonly getConfig: () => ServiceConfig,
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
    } catch {
      return { success: false };
    }
  }
}
