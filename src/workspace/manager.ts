import type { Issue, ServiceConfig, RisolutoLogger, Workspace } from "../core/types.js";
import { WorkspaceLifecycle, type WorkspaceManagerWorktreeDeps, type WorkspaceRemovalResult } from "./lifecycle.js";
export { buildSafePath } from "./paths.js";
export type { WorkspaceManagerWorktreeDeps, WorkspaceRemovalResult } from "./lifecycle.js";

export class WorkspaceManager {
  private readonly lifecycle: WorkspaceLifecycle;

  constructor(getConfig: () => ServiceConfig, logger: RisolutoLogger, worktreeDeps?: WorkspaceManagerWorktreeDeps) {
    this.lifecycle = new WorkspaceLifecycle(getConfig, logger, worktreeDeps ?? null);
  }

  async ensureWorkspace(issueIdentifier: string, issue?: Issue): Promise<Workspace> {
    return this.lifecycle.ensureWorkspace(issueIdentifier, issue);
  }

  async prepareForAttempt(workspace: Workspace): Promise<void> {
    return this.lifecycle.prepareForAttempt(workspace);
  }

  async runBeforeRun(workspace: Workspace, issueIdentifier: string): Promise<void> {
    return this.lifecycle.runBeforeRun(workspace, issueIdentifier);
  }

  async runAfterRun(workspace: Workspace, issueIdentifier: string): Promise<void> {
    return this.lifecycle.runAfterRun(workspace, issueIdentifier);
  }

  async removeWorkspace(issueIdentifier: string, issue?: Issue): Promise<void> {
    await this.lifecycle.removeWorkspaceWithResult(issueIdentifier, issue);
  }

  async removeWorkspaceWithResult(issueIdentifier: string, issue?: Issue): Promise<WorkspaceRemovalResult> {
    return this.lifecycle.removeWorkspaceWithResult(issueIdentifier, issue);
  }
}
