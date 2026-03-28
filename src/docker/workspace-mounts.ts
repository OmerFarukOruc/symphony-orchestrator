import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Returns extra host paths that must be mounted into the container for the
 * workspace to behave like it does on the host. This is primarily needed for
 * git worktrees whose `.git` file points at shared metadata outside the issue
 * workspace.
 */
export async function resolveWorkspaceExtraMountPaths(workspacePath: string): Promise<string[]> {
  const gitFilePath = path.join(workspacePath, ".git");

  let gitPointer: string;
  try {
    gitPointer = await readFile(gitFilePath, "utf8");
  } catch {
    return [];
  }

  const gitdirPrefix = "gitdir:";
  if (!gitPointer.startsWith(gitdirPrefix)) {
    return [];
  }

  const rawGitDir = gitPointer.slice(gitdirPrefix.length).trim();
  if (!rawGitDir) {
    return [];
  }

  const gitDirPath = path.isAbsolute(rawGitDir) ? rawGitDir : path.resolve(workspacePath, rawGitDir);

  let commonDir: string;
  try {
    commonDir = (await readFile(path.join(gitDirPath, "commondir"), "utf8")).trim();
  } catch {
    return isOutsideWorkspace(workspacePath, gitDirPath) ? [gitDirPath] : [];
  }

  if (!commonDir) {
    return isOutsideWorkspace(workspacePath, gitDirPath) ? [gitDirPath] : [];
  }

  const commonDirPath = path.resolve(gitDirPath, commonDir);
  return isOutsideWorkspace(workspacePath, commonDirPath) ? [commonDirPath] : [];
}

function isOutsideWorkspace(workspacePath: string, candidatePath: string): boolean {
  const relative = path.relative(workspacePath, candidatePath);
  return relative !== "" && relative.startsWith("..") && !path.isAbsolute(relative);
}
