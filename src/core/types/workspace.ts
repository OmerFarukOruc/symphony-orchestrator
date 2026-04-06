export interface Workspace {
  path: string;
  workspaceKey: string;
  createdNow: boolean;
  /** Bare-clone directory for worktree-strategy workspaces; mounted into Docker alongside the workspace. */
  gitBaseDir?: string;
}
