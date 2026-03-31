import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveWorkspaceExtraMountPaths } from "../../src/docker/workspace-mounts.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-workspace-mounts-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("resolveWorkspaceExtraMountPaths", () => {
  it("returns the shared git common dir for worktree-style .git files", async () => {
    const rootDir = await createTempDir();
    const workspacePath = path.join(rootDir, "NIN-49");
    const gitDirPath = path.join(rootDir, ".base", "repo.git", "worktrees", "NIN-49");
    const commonDirPath = path.join(rootDir, ".base", "repo.git");

    await mkdir(workspacePath, { recursive: true });
    await mkdir(gitDirPath, { recursive: true });
    await writeFile(path.join(workspacePath, ".git"), `gitdir: ${gitDirPath}\n`, "utf8");
    await writeFile(path.join(gitDirPath, "commondir"), "../..\n", "utf8");

    await expect(resolveWorkspaceExtraMountPaths(workspacePath)).resolves.toEqual([commonDirPath]);
  });

  it("returns an empty list for normal directories without a git pointer file", async () => {
    const workspacePath = await createTempDir();
    await expect(resolveWorkspaceExtraMountPaths(workspacePath)).resolves.toEqual([]);
  });
});
