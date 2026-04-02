/**
 * Live smoke tests for the GitHub provider.
 *
 * These tests exercise real GitHub API endpoints and require a valid
 * `E2E_GITHUB_TOKEN` environment variable (a PAT with `repo` scope).
 * They are excluded from the default `test:integration` runner and only
 * execute via `pnpm run test:integration:live`.
 *
 * When the env var is absent the entire suite skips gracefully.
 */

import { afterAll, describe, expect, it } from "vitest";

const GITHUB_TOKEN = process.env.E2E_GITHUB_TOKEN ?? "";
const API_BASE = "https://api.github.com";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function githubRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API returned HTTP ${response.status}: ${body}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!GITHUB_TOKEN)("github live smoke", () => {
  /** Refs to delete in cleanup: `{ owner, repo, ref }` tuples. */
  const branchesToDelete: Array<{ owner: string; repo: string; ref: string }> = [];
  /** PRs to close in cleanup: `{ owner, repo, number }` tuples. */
  const prsToClose: Array<{ owner: string; repo: string; number: number }> = [];

  afterAll(async () => {
    for (const pr of prsToClose) {
      try {
        await githubRequest(`/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`, {
          method: "PATCH",
          body: JSON.stringify({ state: "closed" }),
        });
      } catch {
        // Best-effort cleanup
      }
    }
    for (const branch of branchesToDelete) {
      try {
        await githubRequest(`/repos/${branch.owner}/${branch.repo}/git/refs/${branch.ref}`, {
          method: "DELETE",
        });
      } catch {
        // Best-effort cleanup
      }
    }
  });

  // -----------------------------------------------------------------------
  // Auth check
  // -----------------------------------------------------------------------

  it("authenticates and fetches the current user", async () => {
    const user = await githubRequest<{ login: string; id: number; type: string }>("/user");

    expect(typeof user.login).toBe("string");
    expect(user.login.length).toBeGreaterThan(0);
    expect(typeof user.id).toBe("number");
    expect(user.type).toBe("User");
  });

  // -----------------------------------------------------------------------
  // Repository listing — response shape
  // -----------------------------------------------------------------------

  it("lists repos with expected response shape", async () => {
    const repos =
      await githubRequest<Array<{ id: number; full_name: string; private: boolean }>>("/user/repos?per_page=5");

    expect(Array.isArray(repos)).toBe(true);

    if (repos.length > 0) {
      const repo = repos[0];
      expect(typeof repo.id).toBe("number");
      expect(typeof repo.full_name).toBe("string");
      expect(typeof repo.private).toBe("boolean");
    }
  });

  // -----------------------------------------------------------------------
  // PR lifecycle — create branch, open draft PR, comment, verify, close, delete branch
  // -----------------------------------------------------------------------

  it("creates a draft PR, comments, then cleans up", async () => {
    const testRepo = process.env.E2E_GITHUB_REPO;
    if (!testRepo) {
      // Skip lifecycle test when no target repo is configured
      return;
    }

    const [owner, repo] = testRepo.split("/");
    const branchName = `risoluto-live-smoke-${Date.now()}`;

    // 1) Get the default branch SHA
    const repoInfo = await githubRequest<{ default_branch: string }>(`/repos/${owner}/${repo}`);
    const defaultBranch = repoInfo.default_branch;

    const refData = await githubRequest<{ object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`,
    );
    const baseSha = refData.object.sha;

    // 2) Create a branch
    await githubRequest(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
    });
    branchesToDelete.push({ owner, repo, ref: `heads/${branchName}` });

    // 3) Create a draft PR
    const pr = await githubRequest<{ number: number; state: string; draft: boolean }>(`/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: `[Risoluto CI] Live smoke test PR`,
        head: branchName,
        base: defaultBranch,
        body: "Automated test PR — safe to close.",
        draft: true,
      }),
    });

    expect(typeof pr.number).toBe("number");
    expect(pr.state).toBe("open");
    expect(pr.draft).toBe(true);
    prsToClose.push({ owner, repo, number: pr.number });

    // 4) Add a comment
    const comment = await githubRequest<{ id: number; body: string }>(
      `/repos/${owner}/${repo}/issues/${pr.number}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ body: "Automated comment from Risoluto live smoke test." }),
      },
    );
    expect(typeof comment.id).toBe("number");
    expect(comment.body).toContain("Risoluto");

    // 5) Fetch PR status and verify it's still open
    const prStatus = await githubRequest<{ number: number; state: string }>(
      `/repos/${owner}/${repo}/pulls/${pr.number}`,
    );
    expect(prStatus.number).toBe(pr.number);
    expect(prStatus.state).toBe("open");

    // Cleanup happens in afterAll via prsToClose and branchesToDelete
  });

  // -----------------------------------------------------------------------
  // Duplicate PR handling
  // -----------------------------------------------------------------------

  it("returns 422 when creating a duplicate PR from the same branch", async () => {
    const testRepo = process.env.E2E_GITHUB_REPO;
    if (!testRepo) return;

    const [owner, repo] = testRepo.split("/");
    const branchName = `risoluto-live-dup-${Date.now()}`;

    // Setup: create branch + first PR
    const repoInfo = await githubRequest<{ default_branch: string }>(`/repos/${owner}/${repo}`);
    const refData = await githubRequest<{ object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/ref/heads/${repoInfo.default_branch}`,
    );

    await githubRequest(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: refData.object.sha }),
    });
    branchesToDelete.push({ owner, repo, ref: `heads/${branchName}` });

    const firstPr = await githubRequest<{ number: number }>(`/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: "[Risoluto CI] Dup test PR",
        head: branchName,
        base: repoInfo.default_branch,
        body: "First PR — will attempt duplicate.",
        draft: true,
      }),
    });
    prsToClose.push({ owner, repo, number: firstPr.number });

    // Attempt duplicate
    try {
      await githubRequest(`/repos/${owner}/${repo}/pulls`, {
        method: "POST",
        body: JSON.stringify({
          title: "[Risoluto CI] Dup test PR (second)",
          head: branchName,
          base: repoInfo.default_branch,
          body: "Duplicate attempt — should fail.",
          draft: true,
        }),
      });
      // If we get here, GitHub didn't reject it (unexpected)
      expect.fail("Expected 422 for duplicate PR but request succeeded");
    } catch (error) {
      expect(String(error)).toContain("422");
    }
  });
});
