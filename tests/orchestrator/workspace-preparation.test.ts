import { lstat, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { pruneDanglingWorkspaceSkillLinks } from "../../src/orchestrator/workspace-preparation.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-workspace-prep-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("pruneDanglingWorkspaceSkillLinks", () => {
  it("removes only dangling symlinks from .agents/skills", async () => {
    const workspaceDir = await createTempDir();
    const skillsDir = path.join(workspaceDir, ".agents", "skills");
    const validTarget = path.join(workspaceDir, "skills", "visual-verify");

    await mkdir(skillsDir, { recursive: true });
    await mkdir(validTarget, { recursive: true });
    await writeFile(path.join(validTarget, "SKILL.md"), "---\nname: visual-verify\n---\n", "utf8");
    await symlink("../../skills/visual-verify", path.join(skillsDir, "valid"));
    await symlink("../../skills/symphony-plan-review", path.join(skillsDir, "broken"));

    pruneDanglingWorkspaceSkillLinks(workspaceDir);

    await expect(
      lstatSafe(path.join(skillsDir, "valid")).then((value) => value?.isSymbolicLink() ?? false),
    ).resolves.toBe(true);
    await expect(lstatSafe(path.join(skillsDir, "broken"))).resolves.toBeNull();
  });
});

async function lstatSafe(targetPath: string) {
  try {
    return await lstat(targetPath);
  } catch {
    return null;
  }
}
