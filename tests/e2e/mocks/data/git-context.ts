export interface GitPullView {
  number: number;
  title: string;
  author: string;
  state: string;
  updatedAt: string;
  url: string;
  headBranch: string;
  checksStatus: string | null;
}

export interface GitCommitView {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface GitRepoView {
  repoUrl: string;
  defaultBranch: string;
  identifierPrefix: string | null;
  label: string | null;
  githubOwner: string | null;
  githubRepo: string | null;
  configured: boolean;
  github?: {
    description: string | null;
    visibility: string;
    openPrCount: number;
    pulls: GitPullView[];
    recentCommits: GitCommitView[];
  };
}

export interface ActiveBranchView {
  identifier: string;
  branchName: string;
  status: string;
  workspacePath: string | null;
  issueTitle: string;
  pullRequestUrl: string | null;
}

export interface GitContextResponse {
  repos: GitRepoView[];
  activeBranches: ActiveBranchView[];
  githubAvailable: boolean;
}

export function buildGitContext(overrides?: Partial<GitContextResponse>): GitContextResponse {
  return {
    repos: [
      {
        repoUrl: "https://github.com/owner/risoluto",
        defaultBranch: "main",
        identifierPrefix: "SYM",
        label: "backend",
        githubOwner: "owner",
        githubRepo: "risoluto",
        configured: true,
        github: {
          description: "Risoluto automation service",
          visibility: "private",
          openPrCount: 1,
          pulls: [
            {
              number: 42,
              title: "Fix authentication bug",
              author: "codex-bot",
              state: "open",
              updatedAt: "2026-04-03T10:00:00.000Z",
              url: "https://github.com/owner/risoluto/pull/42",
              headBranch: "sym-42-fix-auth",
              checksStatus: null,
            },
          ],
          recentCommits: [
            {
              sha: "abc1234",
              message: "feat: wire frontend to tracked PR lifecycle",
              author: "Codex",
              date: "2026-04-03T10:05:00.000Z",
            },
          ],
        },
      },
    ],
    activeBranches: [
      {
        identifier: "SYM-42",
        branchName: "sym-42-fix-auth",
        status: "running",
        workspacePath: "/tmp/workspace/sym-42",
        issueTitle: "Fix authentication bug",
        pullRequestUrl: "https://github.com/owner/risoluto/pull/42",
      },
    ],
    githubAvailable: true,
    ...overrides,
  };
}
