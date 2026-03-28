// Single-concern: workspace lifecycle management across clone, worktree, cleanup, and path safety.
import { rm, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import type { Issue, ServiceConfig, SymphonyLogger, Workspace } from "../core/types.js";
import type { RepoMatch } from "../git/repo-router.js";
import { buildSafePath, isWithinRoot, sanitizeIdentifier, resolveWorkspacePath } from "./paths.js";
import { toErrorString } from "../utils/type-guards.js";
export { buildSafePath } from "./paths.js";

const TRANSIENT_DIRECTORIES = ["tmp", ".elixir_ls"];

async function pathIsDirectory(pathname: string): Promise<boolean> {
  try {
    const info = await stat(pathname);
    return info.isDirectory();
  } catch {
    return false;
  }
}

export interface WorkspaceManagerWorktreeDeps {
  gitManager: {
    setupWorktree: (
      route: RepoMatch,
      baseCloneDir: string,
      worktreePath: string,
      issue: Pick<Issue, "identifier" | "branchName">,
      branchPrefix?: string,
    ) => Promise<{ branchName: string }>;
    removeWorktree: (baseCloneDir: string, worktreePath: string, force?: boolean) => Promise<void>;
    deriveBaseCloneDir: (workspaceRoot: string, repoUrl: string) => string;
  };
  repoRouter: {
    matchIssue: (issue: Issue) => RepoMatch | null;
  };
}

export class WorkspaceManager {
  private readonly worktreeDeps: WorkspaceManagerWorktreeDeps | null;

  constructor(
    private readonly getConfig: () => ServiceConfig,
    private readonly logger: SymphonyLogger,
    worktreeDeps?: WorkspaceManagerWorktreeDeps,
  ) {
    this.worktreeDeps = worktreeDeps ?? null;
  }

  async ensureWorkspace(issueIdentifier: string, issue?: Issue): Promise<Workspace> {
    const config = this.getConfig();

    if (config.workspace.strategy === "worktree") {
      return this.ensureWorktreeWorkspace(config, issueIdentifier, issue);
    }
    return this.ensureDirectoryWorkspace(config, issueIdentifier);
  }

  async prepareForAttempt(workspace: Workspace): Promise<void> {
    this.assertWorkspaceWithinRoot(workspace);
    for (const transientDirectory of TRANSIENT_DIRECTORIES) {
      const target = path.resolve(workspace.path, transientDirectory);
      // Explicit normalization + containment check to satisfy static analysis
      // codeql[js/path-injection] workspace.path already validated via assertWorkspaceWithinRoot + isWithinRoot check
      const normalizedTarget = path.resolve(target);
      if (isWithinRoot(workspace.path, normalizedTarget)) {
        // codeql[js/path-injection] normalizedTarget validated via isWithinRoot check above
        await rm(normalizedTarget, { recursive: true, force: true });
      }
    }
  }

  async runBeforeRun(workspace: Workspace, issueIdentifier: string): Promise<void> {
    const sanitized = sanitizeIdentifier(issueIdentifier);
    await this.runHook(this.getConfig().workspace.hooks.beforeRun, workspace, issueIdentifier, sanitized);
  }

  async runAfterRun(workspace: Workspace, issueIdentifier: string): Promise<void> {
    const sanitized = sanitizeIdentifier(issueIdentifier);
    await this.runHook(this.getConfig().workspace.hooks.afterRun, workspace, issueIdentifier, sanitized);
  }

  async removeWorkspace(issueIdentifier: string, issue?: Issue): Promise<void> {
    const config = this.getConfig();

    if (config.workspace.strategy === "worktree") {
      await this.removeWorktreeWorkspace(config, issueIdentifier, issue);
      return;
    }
    await this.removeDirectoryWorkspace(config, issueIdentifier);
  }

  private async ensureDirectoryWorkspace(config: ServiceConfig, issueIdentifier: string): Promise<Workspace> {
    await mkdir(config.workspace.root, { recursive: true });
    const { workspaceKey, workspacePath } = resolveWorkspacePath(config.workspace.root, issueIdentifier);

    let createdNow = false;
    try {
      try {
        const info = await stat(workspacePath);
        if (!info.isDirectory()) {
          throw new Error(`workspace target is not a directory: ${workspacePath}`);
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") {
          throw error;
        }
        await mkdir(workspacePath, { recursive: false });
        createdNow = true;
      }

      const workspace = { path: workspacePath, workspaceKey, createdNow };
      if (createdNow) {
        await this.runHook(config.workspace.hooks.afterCreate, workspace, issueIdentifier, workspaceKey);
      }
      return workspace;
    } catch (error) {
      if (createdNow) {
        await rm(workspacePath, { recursive: true, force: true });
      }
      throw error;
    }
  }

  private async ensureWorktreeWorkspace(
    config: ServiceConfig,
    issueIdentifier: string,
    issue?: Issue,
  ): Promise<Workspace> {
    if (!issue) {
      throw new Error("worktree strategy requires the full Issue object");
    }
    if (!this.worktreeDeps) {
      throw new Error("worktree strategy requires gitManager and repoRouter deps");
    }

    const repoMatch = this.worktreeDeps.repoRouter.matchIssue(issue);
    if (!repoMatch) {
      throw new Error(
        `worktree strategy requires a repo match for issue ${issueIdentifier} — no matching repo route found`,
      );
    }

    await mkdir(config.workspace.root, { recursive: true });
    const { workspaceKey, workspacePath } = resolveWorkspacePath(config.workspace.root, issueIdentifier);
    const baseCloneDir = this.worktreeDeps.gitManager.deriveBaseCloneDir(config.workspace.root, repoMatch.repoUrl);

    const worktreeExists = await pathIsDirectory(workspacePath);
    const createdNow = !worktreeExists;

    if (createdNow) {
      await this.worktreeDeps.gitManager.setupWorktree(
        repoMatch,
        baseCloneDir,
        workspacePath,
        issue,
        config.workspace.branchPrefix,
      );
    }

    const workspace = { path: workspacePath, workspaceKey, createdNow, gitBaseDir: baseCloneDir };
    if (createdNow) {
      await this.runHook(config.workspace.hooks.afterCreate, workspace, issueIdentifier, workspaceKey);
    }
    return workspace;
  }

  private async removeDirectoryWorkspace(config: ServiceConfig, issueIdentifier: string): Promise<void> {
    const { workspaceKey, workspacePath } = resolveWorkspacePath(config.workspace.root, issueIdentifier);

    const workspace = { path: workspacePath, workspaceKey, createdNow: false };
    if (!(await pathIsDirectory(workspacePath))) {
      return;
    }

    try {
      await this.runHook(config.workspace.hooks.beforeRemove, workspace, issueIdentifier, workspaceKey);
    } catch (error) {
      this.logger.warn(
        {
          workspacePath: workspace.path,
          issueIdentifier,
          error: toErrorString(error),
          classification: "before_remove_hook_failed",
        },
        "before_remove hook failed; continuing with workspace removal",
      );
    }
    await rm(workspacePath, { recursive: true, force: true });
  }

  private async removeWorktreeWorkspace(config: ServiceConfig, issueIdentifier: string, issue?: Issue): Promise<void> {
    if (!this.worktreeDeps) {
      throw new Error("worktree strategy requires gitManager and repoRouter deps");
    }

    const { workspaceKey, workspacePath } = resolveWorkspacePath(config.workspace.root, issueIdentifier);

    if (!(await pathIsDirectory(workspacePath))) {
      return;
    }

    const workspace = { path: workspacePath, workspaceKey, createdNow: false };
    try {
      await this.runHook(config.workspace.hooks.beforeRemove, workspace, issueIdentifier, workspaceKey);
    } catch (error) {
      this.logger.warn(
        {
          workspacePath: workspace.path,
          issueIdentifier,
          error: toErrorString(error),
          classification: "before_remove_hook_failed",
        },
        "before_remove hook failed; continuing with workspace removal",
      );
    }

    if (issue) {
      const repoMatch = this.worktreeDeps.repoRouter.matchIssue(issue);
      if (repoMatch) {
        const baseCloneDir = this.worktreeDeps.gitManager.deriveBaseCloneDir(config.workspace.root, repoMatch.repoUrl);
        try {
          await this.worktreeDeps.gitManager.removeWorktree(baseCloneDir, workspacePath, true);
          return;
        } catch (error) {
          this.logger.warn(
            {
              workspacePath,
              issueIdentifier,
              error: toErrorString(error),
            },
            "git worktree remove failed; falling back to rm",
          );
        }
      }
    }

    await rm(workspacePath, { recursive: true, force: true });
  }

  private assertWorkspaceWithinRoot(workspace: Workspace): void {
    const root = this.getConfig().workspace.root;
    if (!isWithinRoot(root, workspace.path)) {
      throw new TypeError(`workspace path escaped root: ${workspace.path}`);
    }
  }

  private async runHook(
    hook: string | null,
    workspace: Workspace,
    issueIdentifier: string,
    sanitizedIdentifier: string,
  ): Promise<void> {
    if (!hook) {
      return;
    }
    this.assertWorkspaceWithinRoot(workspace);

    const timeoutMs = this.getConfig().workspace.hooks.timeoutMs;
    // codeql[js/path-injection] workspace.path already validated via assertWorkspaceWithinRoot
    const normalizedCwd = path.resolve(workspace.path);
    await new Promise<void>((resolve, reject) => {
      const child = spawn("sh", ["-lc", hook], {
        // codeql[js/path-injection] normalizedCwd validated above, workspace.path is sanitized
        cwd: normalizedCwd,
        env: {
          ...process.env,
          PATH: buildSafePath(),
          SYMPHONY_WORKSPACE_PATH: workspace.path,
          SYMPHONY_ISSUE_IDENTIFIER: sanitizedIdentifier,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`hook timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve();
          return;
        }
        this.logger.warn(
          {
            workspacePath: workspace.path,
            issueIdentifier,
            code,
            stderr: stderr.trim() || null,
          },
          "workspace hook failed",
        );
        reject(new Error(`hook exited with code ${code}`));
      });
    });
  }
}
