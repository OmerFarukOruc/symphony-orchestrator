import type { GitManager } from "../git/manager.js";
import type { RepoMatch } from "../git/repo-router.js";
import type { Issue, Workspace } from "../core/types.js";

export async function executeGitPostRun(
  gitManager: Pick<GitManager, "commitAndPush" | "createPullRequest">,
  workspace: Workspace,
  issue: Issue,
  repoMatch: RepoMatch,
): Promise<{ pullRequestUrl: string | null }> {
  const commitResult = await gitManager.commitAndPush(
    workspace.path,
    `${issue.identifier}: ${issue.title}`,
    undefined,
    repoMatch.githubTokenEnv,
  );
  if (!commitResult.pushed) {
    return { pullRequestUrl: null };
  }
  const pullRequest = await gitManager.createPullRequest(repoMatch, issue, commitResult.branchName);
  const pullRequestUrl =
    typeof pullRequest === "object" &&
    pullRequest !== null &&
    "html_url" in pullRequest &&
    typeof (pullRequest as { html_url?: unknown }).html_url === "string"
      ? ((pullRequest as { html_url: string }).html_url ?? null)
      : null;
  return { pullRequestUrl };
}
