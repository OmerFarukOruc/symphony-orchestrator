export interface SetupStatus {
  configured: boolean;
  steps: {
    masterKey: { done: boolean };
    linearProject: { done: boolean };
    repoRoute: { done: boolean };
    openaiKey: { done: boolean };
    githubToken: { done: boolean };
  };
}

export interface LinearProject {
  id: string;
  name: string;
  slugId: string;
  teamKey: string | null;
}

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
