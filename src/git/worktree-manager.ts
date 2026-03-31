/**
 * Git worktree primitives for isolated per-issue worktrees.
 *
 * All functions are stateless — they receive a WorktreeContext
 * with the GitRunner and environment. GitManager delegates to
 * these functions for worktree strategy operations.
 */

import type { GitRunner } from "./git-types.js";
import type { RisolutoLogger } from "../core/types.js";

export interface WorktreeContext {
  runGit: GitRunner;
  env: NodeJS.ProcessEnv;
  logger: RisolutoLogger;
}

export interface WorktreeEntry {
  path: string;
  branch: string | null;
  bare: boolean;
}

/** Derive a stable filesystem-safe key from a repo URL. */
function sanitizeChar(ch: string): string {
  if (/[\w.-]/.test(ch)) return ch;
  return "-";
}

export function deriveRepoKey(repoUrl: string): string {
  let key = repoUrl.trim();
  if (key.endsWith(".git")) {
    key = key.slice(0, -4);
  }
  let result = "";
  let prevDash = false;
  for (const ch of key) {
    const s = sanitizeChar(ch);
    if (s === "-") {
      if (!prevDash) {
        result += "-";
        prevDash = true;
      }
    } else {
      result += s;
      prevDash = false;
    }
  }
  let start = 0;
  while (start < result.length && result.charAt(start) === "-") {
    start++;
  }
  let end = result.length;
  while (end > start && result.charAt(end - 1) === "-") {
    end--;
  }
  result = result.slice(start, end);
  return result || "repo";
}

/** Ensure a bare clone exists at baseDir. Fetches if already present. */
export async function ensureBaseClone(ctx: WorktreeContext, repoUrl: string, baseDir: string): Promise<void> {
  const { stdout } = await ctx.runGit(["rev-parse", "--git-dir"], { cwd: baseDir, env: ctx.env }).catch(() => ({
    stdout: "",
  }));
  if (stdout.trim().length > 0) {
    // Already a git dir — fetch latest refs.
    await ctx.runGit(["fetch", "origin", "--prune"], { cwd: baseDir, env: ctx.env });
    return;
  }
  await ctx.runGit(["clone", "--bare", repoUrl, baseDir], { cwd: ".", env: ctx.env });
}

/** Fetch latest refs into the bare clone. Never mutates worktrees. */
export async function syncBaseClone(ctx: WorktreeContext, baseDir: string): Promise<void> {
  await ctx.runGit(["fetch", "origin", "--prune"], { cwd: baseDir, env: ctx.env });
}

/** Create a new worktree with a new branch off startPoint. */
export async function addWorktree(
  ctx: WorktreeContext,
  baseDir: string,
  worktreePath: string,
  branchName: string,
  startPoint: string,
): Promise<void> {
  await ctx.runGit(["worktree", "add", "-b", branchName, worktreePath, startPoint], { cwd: baseDir, env: ctx.env });
}

/** Attach an existing branch to a new worktree (branch already exists in base). */
export async function attachWorktree(
  ctx: WorktreeContext,
  baseDir: string,
  worktreePath: string,
  branchName: string,
): Promise<void> {
  await ctx.runGit(["worktree", "add", worktreePath, branchName], { cwd: baseDir, env: ctx.env });
}

/** Remove a worktree and prune stale metadata. */
export async function removeWorktree(
  ctx: WorktreeContext,
  baseDir: string,
  worktreePath: string,
  force = false,
): Promise<void> {
  const args = ["worktree", "remove"];
  if (force) {
    args.push("--force");
  }
  args.push(worktreePath);
  await ctx.runGit(args, { cwd: baseDir, env: ctx.env });
  await ctx.runGit(["worktree", "prune"], { cwd: baseDir, env: ctx.env });
}

/** List worktrees from a bare clone. */
export async function listWorktrees(ctx: WorktreeContext, baseDir: string): Promise<WorktreeEntry[]> {
  const { stdout } = await ctx.runGit(["worktree", "list", "--porcelain"], { cwd: baseDir, env: ctx.env });
  return parseWorktreeList(stdout);
}

/** Check if a worktree has uncommitted changes. */
export async function isWorktreeClean(ctx: WorktreeContext, worktreePath: string): Promise<boolean> {
  const { stdout } = await ctx.runGit(["status", "--porcelain"], { cwd: worktreePath, env: ctx.env });
  return stdout.trim().length === 0;
}

/** Check if a branch exists in the base clone. */
export async function branchExists(ctx: WorktreeContext, baseDir: string, branchName: string): Promise<boolean> {
  try {
    await ctx.runGit(["rev-parse", "--verify", `refs/heads/${branchName}`], { cwd: baseDir, env: ctx.env });
    return true;
  } catch {
    return false;
  }
}

/** Parse `git worktree list --porcelain` output into structured entries. */
function parseWorktreeList(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: Partial<WorktreeEntry> = {};

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current.path) {
        entries.push({ path: current.path, branch: current.branch ?? null, bare: current.bare ?? false });
      }
      current = { path: line.slice("worktree ".length) };
    } else if (line.startsWith("HEAD ")) {
      // skip
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length);
    } else if (line === "bare") {
      current.bare = true;
    } else if (line === "detached") {
      current.branch = null;
    }
  }
  if (current.path) {
    entries.push({ path: current.path, branch: current.branch ?? null, bare: current.bare ?? false });
  }
  return entries;
}
