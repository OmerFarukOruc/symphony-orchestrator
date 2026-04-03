import { GitManager, type GitManagerDeps } from "../git/manager.js";
import type { GitIntegrationPort } from "../git/port.js";
import { RepoRouter, type RepoRoute } from "../git/repo-router.js";
import type { ServiceConfig } from "../core/types.js";

const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";

function toRepoRoutes(config: ServiceConfig): RepoRoute[] {
  return (config.repos ?? []).map((route) => ({
    repoUrl: route.repoUrl,
    defaultBranch: route.defaultBranch,
    identifierPrefix: route.identifierPrefix ?? undefined,
    label: route.label ?? undefined,
    githubOwner: route.githubOwner ?? undefined,
    githubRepo: route.githubRepo ?? undefined,
    githubTokenEnv: route.githubTokenEnv ?? undefined,
  }));
}

export function createRepoRouterProvider(getConfig: () => ServiceConfig): Pick<RepoRouter, "matchIssue"> {
  return {
    matchIssue: (issue) => new RepoRouter(toRepoRoutes(getConfig())).matchIssue(issue),
  };
}

export function createGitHubToolProvider(
  getConfig: () => ServiceConfig,
  deps?: {
    env?: NodeJS.ProcessEnv;
    resolveSecret?: (name: string) => string | undefined;
    createGitManager?: (deps: GitManagerDeps) => GitIntegrationPort;
  },
): GitIntegrationPort {
  const createGitManager = deps?.createGitManager ?? ((managerDeps: GitManagerDeps) => new GitManager(managerDeps));
  const getManager = () => {
    const config = getConfig();
    const env = { ...(deps?.env ?? process.env) };
    const tokenEnvNames = new Set((config.repos ?? []).map((route) => route.githubTokenEnv || "GITHUB_TOKEN"));

    for (const envName of tokenEnvNames) {
      if (env[envName] === undefined) {
        const secretValue = deps?.resolveSecret?.(envName);
        if (secretValue) {
          env[envName] = secretValue;
        }
      }
    }

    return createGitManager({
      env,
      apiBaseUrl: config.github?.apiBaseUrl ?? DEFAULT_GITHUB_API_BASE_URL,
    });
  };

  return {
    hasUncommittedChanges: (workspaceDir) => getManager().hasUncommittedChanges(workspaceDir),
    autoCommit: (workspaceDir, message, options) => getManager().autoCommit(workspaceDir, message, options),
    cloneInto: (route, workspaceDir, issue, branchPrefix) =>
      getManager().cloneInto(route, workspaceDir, issue, branchPrefix),
    commitAndPush: (workspaceDir, message, branchName) => getManager().commitAndPush(workspaceDir, message, branchName),
    createPullRequest: (route, issue, branchName, summary) =>
      getManager().createPullRequest(route, issue, branchName, summary),
    addPrComment: (input) => getManager().addPrComment(input),
    getPrStatus: (input) => getManager().getPrStatus(input),
    forcePushIfBranchExists: (branchName, workspaceDir) =>
      getManager().forcePushIfBranchExists(branchName, workspaceDir),
    setupWorktree: (route, baseCloneDir, worktreePath, issue, branchPrefix) =>
      getManager().setupWorktree(route, baseCloneDir, worktreePath, issue, branchPrefix),
    syncWorktree: (baseCloneDir) => getManager().syncWorktree(baseCloneDir),
    removeWorktree: (baseCloneDir, worktreePath, force) =>
      getManager().removeWorktree(baseCloneDir, worktreePath, force),
    deriveBaseCloneDir: (workspaceRoot, repoUrl) => getManager().deriveBaseCloneDir(workspaceRoot, repoUrl),
  };
}
