import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import type { Request, Response } from "express";

import type { ConfigStore } from "../config/store.js";
import type { RuntimeIssueView } from "../core/types.js";
import type { OrchestratorPort } from "../orchestrator/port.js";
import { withWorkspaceLifecycleLock } from "../workspace/lifecycle-lock.js";

/* ------------------------------------------------------------------ */
/*  Response types                                                     */
/* ------------------------------------------------------------------ */

interface WorkspaceInventoryEntry {
  workspace_key: string;
  path: string;
  status: "running" | "retrying" | "completed" | "orphaned";
  strategy: string;
  issue: {
    identifier: string;
    title: string;
    state: string;
  } | null;
  disk_bytes: number | null;
  last_modified_at: string | null;
}

interface WorkspaceInventoryResponse {
  workspaces: WorkspaceInventoryEntry[];
  generated_at: string;
  total: number;
  active: number;
  orphaned: number;
}

/* ------------------------------------------------------------------ */
/*  Disk usage helpers                                                  */
/* ------------------------------------------------------------------ */

async function computeDirSize(dirPath: string): Promise<number> {
  let total = 0;
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const isDirectory = entry.isDirectory();
      const isFile = entry.isFile();
      if (!isDirectory && !isFile) continue;

      const fullPath = path.join(dirPath, entry.name);
      if (isDirectory) {
        total += await computeDirSize(fullPath);
      } else {
        const info = await stat(fullPath);
        total += info.size;
      }
    }
  } catch {
    // Permission errors or race conditions — return what we have
  }
  return total;
}

async function getDirMtime(dirPath: string): Promise<string | null> {
  try {
    const info = await stat(dirPath);
    return info.mtime.toISOString();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Workspace classification                                            */
/* ------------------------------------------------------------------ */

interface WorkspaceStatus {
  status: "running" | "retrying" | "completed" | "orphaned";
  issue: { identifier: string; title: string; state: string } | null;
}

function classifyWorkspace(
  key: string,
  runningViews: RuntimeIssueView[],
  retryingViews: RuntimeIssueView[],
  completedViews: RuntimeIssueView[],
): WorkspaceStatus {
  const running = runningViews.find((v) => v.workspaceKey === key);
  if (running) {
    return {
      status: "running" as const,
      issue: { identifier: running.identifier, title: running.title, state: running.state },
    };
  }

  const retrying = retryingViews.find((v) => v.workspaceKey === key);
  if (retrying) {
    return {
      status: "retrying" as const,
      issue: { identifier: retrying.identifier, title: retrying.title, state: retrying.state },
    };
  }

  const completed = completedViews.find((v) => v.workspaceKey === key);
  if (completed) {
    return {
      status: "completed" as const,
      issue: { identifier: completed.identifier, title: completed.title, state: completed.state },
    };
  }

  return { status: "orphaned", issue: null };
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export interface WorkspaceInventoryDeps {
  orchestrator: OrchestratorPort;
  configStore?: ConfigStore;
}

export async function handleWorkspaceInventory(
  deps: WorkspaceInventoryDeps,
  _req: Request,
  res: Response,
): Promise<void> {
  const config = deps.configStore?.getConfig() ?? null;
  const workspaceRoot = config?.workspace.root;
  const strategy = config?.workspace.strategy ?? "directory";

  if (!workspaceRoot) {
    res.status(503).json({ error: { code: "config_unavailable", message: "Workspace config not available" } });
    return;
  }

  const snapshot = deps.orchestrator.getSnapshot();

  let fsEntries: string[];
  try {
    const entries = await readdir(workspaceRoot, { withFileTypes: true });
    fsEntries = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      res.json({
        workspaces: [],
        generated_at: new Date().toISOString(),
        total: 0,
        active: 0,
        orphaned: 0,
      } satisfies WorkspaceInventoryResponse);
      return;
    }
    throw error;
  }

  const workspaces: WorkspaceInventoryEntry[] = await Promise.all(
    fsEntries.map(async (key) => {
      const wsPath = path.join(workspaceRoot, key);
      const { status, issue } = classifyWorkspace(key, snapshot.running, snapshot.retrying, snapshot.completed ?? []);

      const [diskBytes, lastModified] = await Promise.all([computeDirSize(wsPath), getDirMtime(wsPath)]);

      return {
        workspace_key: key,
        path: wsPath,
        status,
        strategy,
        issue,
        disk_bytes: diskBytes,
        last_modified_at: lastModified,
      };
    }),
  );

  const statusOrder: Record<string, number> = { running: 0, retrying: 1, completed: 2, orphaned: 3 };
  workspaces.sort((a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99));

  const active = workspaces.filter((w) => w.status === "running" || w.status === "retrying").length;
  const orphaned = workspaces.filter((w) => w.status === "orphaned").length;

  const response: WorkspaceInventoryResponse = {
    workspaces,
    generated_at: new Date().toISOString(),
    total: workspaces.length,
    active,
    orphaned,
  };

  res.json(response);
}

export async function handleWorkspaceRemove(deps: WorkspaceInventoryDeps, req: Request, res: Response): Promise<void> {
  const workspaceKey = String(req.params.workspace_key);
  if (!workspaceKey) {
    res.status(400).json({ error: { code: "bad_request", message: "Missing workspace_key parameter" } });
    return;
  }

  const config = deps.configStore?.getConfig() ?? null;
  const workspaceRoot = config?.workspace.root;

  if (!workspaceRoot) {
    res.status(503).json({ error: { code: "config_unavailable", message: "Workspace config not available" } });
    return;
  }

  const wsPath = path.join(workspaceRoot, workspaceKey);
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedPath = path.resolve(wsPath);

  if (!resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    res.status(400).json({ error: { code: "bad_request", message: "Invalid workspace key" } });
    return;
  }

  await withWorkspaceLifecycleLock(workspaceKey, async () => {
    const snapshot = deps.orchestrator.getSnapshot();
    const isRetryingActive =
      Array.isArray(snapshot.retrying) && snapshot.retrying.some((view) => view.workspaceKey === workspaceKey);
    const isActive = snapshot.running.some((view) => view.workspaceKey === workspaceKey) || isRetryingActive;

    if (isActive) {
      res.status(409).json({ error: { code: "conflict", message: "Cannot remove an active workspace" } });
      return;
    }

    try {
      const info = await stat(wsPath);
      if (!info.isDirectory()) {
        res.status(404).json({ error: { code: "not_found", message: "Workspace not found" } });
        return;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        res.status(404).json({ error: { code: "not_found", message: "Workspace not found" } });
        return;
      }
      throw error;
    }

    await rm(wsPath, { recursive: true, force: true });
    res.status(204).end();
  });
}
