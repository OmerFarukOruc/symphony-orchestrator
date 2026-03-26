import { randomInt } from "node:crypto";
import type { Issue, ServiceConfig, SymphonyLogger } from "../core/types.js";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

type GitHubErrorCode = "github_transport_error" | "github_http_error" | "github_unknown_payload";

export class GitHubIssuesClientError extends Error {
  constructor(
    readonly code: GitHubErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GitHubIssuesClientError";
  }
}

// ---------------------------------------------------------------------------
// Raw GitHub API shape
// ---------------------------------------------------------------------------

export interface RawGitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  labels: { name: string }[];
  html_url: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Issue normalizer (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Map a raw GitHub API issue to Symphony's canonical {@link Issue} shape.
 * State is determined by the first label that matches an active or terminal
 * state name; falls back to `"open"` when no state label is found.
 */
export function normalizeGitHubIssue(
  raw: RawGitHubIssue,
  owner: string,
  repo: string,
  activeStates: string[],
  terminalStates: string[],
): Issue {
  const allStates = new Set([...activeStates, ...terminalStates]);
  const labelNames = raw.labels.map((l) => l.name);
  const stateLabel = labelNames.find((name) => allStates.has(name));

  return {
    id: String(raw.number),
    identifier: `${owner}/${repo}#${raw.number}`,
    title: raw.title,
    description: raw.body ?? null,
    priority: null,
    state: stateLabel ?? "open",
    branchName: null,
    url: raw.html_url ?? null,
    labels: labelNames,
    blockedBy: [],
    createdAt: raw.created_at ?? null,
    updatedAt: raw.updated_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class GitHubIssuesClient {
  constructor(
    private readonly getConfig: () => ServiceConfig,
    private readonly logger: SymphonyLogger,
  ) {}

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private getOwnerRepo(): { owner: string; repo: string } {
    const config = this.getConfig();
    return {
      owner: config.tracker.owner ?? "",
      repo: config.tracker.repo ?? "",
    };
  }

  private getToken(): string {
    const config = this.getConfig();
    return config.github?.token ?? process.env.GITHUB_TOKEN ?? "";
  }

  private getApiBaseUrl(): string {
    const config = this.getConfig();
    return config.tracker.endpoint || "https://api.github.com";
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.getApiBaseUrl()}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          ...(options?.headers ?? {}),
        },
      });
    } catch (error) {
      this.logger.error({ error: String(error), url }, "github api transport failed");
      throw new GitHubIssuesClientError("github_transport_error", "github api request failed during transport", {
        cause: error,
      });
    }

    if (!response.ok) {
      this.logger.error({ status: response.status, statusText: response.statusText, url }, "github api request failed");
      throw new GitHubIssuesClientError(
        "github_http_error",
        `github api request failed with status ${response.status}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new GitHubIssuesClientError("github_unknown_payload", "github api response body is not valid json", {
        cause: error,
      });
    }
  }

  async withRetry(operation: string, fn: () => Promise<void>): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await fn();
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          this.logger.warn(
            { operation, attempt, error: String(error) },
            "github write-back failed after max retries (non-fatal)",
          );
          return;
        }
        const delayMs = 1000 * 2 ** (attempt - 1) * (randomInt(500, 1000) / 1000);
        this.logger.warn({ operation, attempt, delayMs, error: String(error) }, "github write-back retry");
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async fetchOpenIssues(labels?: string[]): Promise<RawGitHubIssue[]> {
    const { owner, repo } = this.getOwnerRepo();
    const labelParam = labels && labels.length > 0 ? `&labels=${encodeURIComponent(labels.join(","))}` : "";
    return this.request<RawGitHubIssue[]>(`/repos/${owner}/${repo}/issues?state=open&per_page=100${labelParam}`);
  }

  async fetchIssuesByNumbers(numbers: number[]): Promise<RawGitHubIssue[]> {
    const { owner, repo } = this.getOwnerRepo();
    return Promise.all(
      numbers.map((number) => this.request<RawGitHubIssue>(`/repos/${owner}/${repo}/issues/${number}`)),
    );
  }

  async addLabel(issueNumber: number, label: string): Promise<void> {
    const { owner, repo } = this.getOwnerRepo();
    await this.request<unknown>(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
      method: "POST",
      body: JSON.stringify({ labels: [label] }),
    });
  }

  async removeLabel(issueNumber: number, label: string): Promise<void> {
    const { owner, repo } = this.getOwnerRepo();
    await this.request<unknown>(`/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, {
      method: "DELETE",
    });
  }

  async closeIssue(issueNumber: number): Promise<void> {
    const { owner, repo } = this.getOwnerRepo();
    await this.request<unknown>(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed" }),
    });
  }

  async reopenIssue(issueNumber: number): Promise<void> {
    const { owner, repo } = this.getOwnerRepo();
    await this.request<unknown>(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "open" }),
    });
  }

  async createComment(issueNumber: number, body: string): Promise<void> {
    const { owner, repo } = this.getOwnerRepo();
    await this.request<unknown>(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }
}
