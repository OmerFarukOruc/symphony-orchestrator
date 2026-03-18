import { GitManager, type GitManagerDeps } from "../git-manager.js";
import { RepoRouter, type RepoRoute } from "../repo-router.js";
import type { ServiceConfig } from "../types.js";

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
    createGitManager?: (deps: GitManagerDeps) => GitManager;
  },
): Pick<GitManager, "cloneInto" | "commitAndPush" | "createPullRequest" | "addPrComment" | "getPrStatus"> {
  const createGitManager = deps?.createGitManager ?? ((managerDeps: GitManagerDeps) => new GitManager(managerDeps));
  const getManager = () =>
    createGitManager({
      env: deps?.env ?? process.env,
      apiBaseUrl: getConfig().github?.apiBaseUrl ?? DEFAULT_GITHUB_API_BASE_URL,
    });

  return {
    cloneInto: (route, workspaceDir, issue) => getManager().cloneInto(route, workspaceDir, issue),
    commitAndPush: (workspaceDir, message, branchName) => getManager().commitAndPush(workspaceDir, message, branchName),
    createPullRequest: (route, issue, branchName) => getManager().createPullRequest(route, issue, branchName),
    addPrComment: (input) => getManager().addPrComment(input),
    getPrStatus: (input) => getManager().getPrStatus(input),
  };
}
