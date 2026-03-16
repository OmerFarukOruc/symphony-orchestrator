import { rm, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import type { ServiceConfig, SymphonyLogger, Workspace } from "./types.js";

const TRANSIENT_DIRECTORIES = ["tmp", ".elixir_ls"];

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function ensureDirectory(pathname: string): Promise<void> {
  await mkdir(pathname, { recursive: true });
}

export function sanitizeIdentifier(identifier: string): string {
  return identifier.replace(/[^A-Za-z0-9._-]/g, "_");
}

async function pathIsDirectory(pathname: string): Promise<boolean> {
  try {
    const info = await stat(pathname);
    return info.isDirectory();
  } catch {
    return false;
  }
}

export class WorkspaceManager {
  constructor(
    private readonly getConfig: () => ServiceConfig,
    private readonly logger: SymphonyLogger,
  ) {}

  async ensureWorkspace(issueIdentifier: string): Promise<Workspace> {
    const config = this.getConfig();
    await ensureDirectory(config.workspace.root);

    const workspaceKey = sanitizeIdentifier(issueIdentifier);
    const workspacePath = path.resolve(config.workspace.root, workspaceKey);
    if (!isWithinRoot(config.workspace.root, workspacePath)) {
      throw new Error(`workspace path escaped root: ${workspacePath}`);
    }

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
        await this.runHook(config.workspace.hooks.afterCreate, workspace, issueIdentifier);
      }
      return workspace;
    } catch (error) {
      if (createdNow) {
        await rm(workspacePath, { recursive: true, force: true });
      }
      throw error;
    }
  }

  async prepareForAttempt(workspace: Workspace): Promise<void> {
    for (const transientDirectory of TRANSIENT_DIRECTORIES) {
      const target = path.resolve(workspace.path, transientDirectory);
      if (isWithinRoot(workspace.path, target)) {
        await rm(target, { recursive: true, force: true });
      }
    }
  }

  async runBeforeRun(workspace: Workspace): Promise<void> {
    await this.runHook(this.getConfig().workspace.hooks.beforeRun, workspace, workspace.workspaceKey);
  }

  async runAfterRun(workspace: Workspace): Promise<void> {
    await this.runHook(this.getConfig().workspace.hooks.afterRun, workspace, workspace.workspaceKey);
  }

  async removeWorkspace(issueIdentifier: string): Promise<void> {
    const config = this.getConfig();
    const workspaceKey = sanitizeIdentifier(issueIdentifier);
    const workspacePath = path.resolve(config.workspace.root, workspaceKey);
    if (!isWithinRoot(config.workspace.root, workspacePath)) {
      throw new Error(`workspace path escaped root: ${workspacePath}`);
    }

    const workspace = { path: workspacePath, workspaceKey, createdNow: false };
    if (!(await pathIsDirectory(workspacePath))) {
      return;
    }

    try {
      await this.runHook(config.workspace.hooks.beforeRemove, workspace, issueIdentifier);
    } catch (error) {
      this.logger.warn(
        {
          workspacePath: workspace.path,
          issueIdentifier,
          error: error instanceof Error ? error.message : String(error),
          classification: "before_remove_hook_failed",
        },
        "before_remove hook failed; continuing with workspace removal",
      );
    }
    await rm(workspacePath, { recursive: true, force: true });
  }

  private async runHook(hook: string | null, workspace: Workspace, issueIdentifier: string): Promise<void> {
    if (!hook) {
      return;
    }

    const timeoutMs = this.getConfig().workspace.hooks.timeoutMs;
    await new Promise<void>((resolve, reject) => {
      const child = spawn("sh", ["-lc", hook], {
        cwd: workspace.path,
        env: {
          ...process.env,
          SYMPHONY_WORKSPACE_PATH: workspace.path,
          SYMPHONY_ISSUE_IDENTIFIER: issueIdentifier,
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
