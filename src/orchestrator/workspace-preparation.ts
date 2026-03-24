import { lstatSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

import { createLifecycleEvent, toErrorMessage, type RuntimeEventSink } from "./lifecycle-events.js";
import type { Issue, ServiceConfig, Workspace } from "../core/types.js";
import type { RepoMatch } from "../git/repo-router.js";
import { resolveWorkspacePath } from "../workspace/paths.js";

interface WorkspacePreparationContext {
  deps: {
    workspaceManager: {
      ensureWorkspace: (issueIdentifier: string, issue?: Issue) => Promise<Workspace>;
    };
    configStore: {
      getConfig: () => ServiceConfig;
    };
    repoRouter?: {
      matchIssue: (issue: Issue) => RepoMatch | null;
    };
    gitManager?: {
      cloneInto: (
        route: RepoMatch,
        workspaceDir: string,
        issue: Pick<Issue, "identifier" | "branchName">,
        branchPrefix?: string,
      ) => Promise<unknown>;
    };
  };
  releaseIssueClaim: (issueId: string) => void;
  pushEvent?: RuntimeEventSink;
}

export function pruneDanglingWorkspaceSkillLinks(workspacePath: string): void {
  const skillsDir = path.join(workspacePath, ".agents", "skills");
  try {
    for (const entry of readdirSync(skillsDir)) {
      const skillPath = path.join(skillsDir, entry);
      let info;
      try {
        info = lstatSync(skillPath);
      } catch {
        continue;
      }
      if (!info.isSymbolicLink()) {
        continue;
      }

      try {
        statSync(skillPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
        rmSync(skillPath, { force: true });
      }
    }
  } catch {
    return;
  }
}

export async function prepareWorkspaceForLaunch(ctx: WorkspacePreparationContext, issue: Issue): Promise<Workspace> {
  const config = ctx.deps.configStore.getConfig();
  const { workspacePath } = resolveWorkspacePath(config.workspace.root, issue.identifier);
  ctx.pushEvent?.(
    createLifecycleEvent({
      issue,
      event: "workspace_preparing",
      message: "Preparing issue workspace",
      metadata: {
        workspacePath,
        strategy: config.workspace.strategy,
      },
    }),
  );
  try {
    const workspace = await ctx.deps.workspaceManager.ensureWorkspace(issue.identifier, issue);
    if (config.workspace.strategy === "directory") {
      const repoMatch = ctx.deps.repoRouter?.matchIssue(issue) ?? null;
      if (repoMatch && workspace.createdNow && ctx.deps.gitManager) {
        await ctx.deps.gitManager.cloneInto(
          repoMatch,
          workspace.path,
          issue,
          ctx.deps.configStore.getConfig().workspace.branchPrefix,
        );
      }
    }
    pruneDanglingWorkspaceSkillLinks(workspace.path);
    ctx.pushEvent?.(
      createLifecycleEvent({
        issue,
        event: "workspace_ready",
        message: "Workspace ready",
        metadata: {
          workspacePath: workspace.path,
          workspaceKey: workspace.workspaceKey,
          createdNow: workspace.createdNow,
          strategy: config.workspace.strategy,
        },
      }),
    );
    return workspace;
  } catch (error) {
    ctx.pushEvent?.(
      createLifecycleEvent({
        issue,
        event: "workspace_failed",
        message: "Workspace preparation failed",
        metadata: {
          workspacePath,
          strategy: config.workspace.strategy,
          error: toErrorMessage(error),
        },
      }),
    );
    ctx.releaseIssueClaim(issue.id);
    throw error;
  }
}
