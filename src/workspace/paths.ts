import path from "node:path";

const SAFE_PATH_DIRS = new Set(["/usr/local/bin", "/usr/bin", "/bin", "/usr/local/sbin", "/usr/sbin", "/sbin"]);

export function buildSafePath(): string {
  const current = process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin";
  const filtered = current.split(":").filter((dir) => SAFE_PATH_DIRS.has(dir));
  return filtered.length > 0 ? filtered.join(":") : "/usr/local/bin:/usr/bin:/bin";
}

export function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  if (relative === "") return true;
  if (path.isAbsolute(relative)) return false;
  // Check for actual path traversal segments (..), not just names starting with ".."
  // e.g., "../foo" or "..\foo" are traversals, but ".._" is a valid directory name
  return !relative.split(path.sep).includes("..");
}

export function sanitizeIdentifier(identifier: string): string {
  const sanitized = identifier.replaceAll(/[^A-Za-z0-9._-]/g, "_");
  // "." and ".." are valid characters but unsafe as standalone path segments.
  return sanitized === "." || sanitized === ".." ? sanitized.replaceAll(".", "_") : sanitized;
}

export interface ResolvedWorkspacePath {
  workspaceKey: string;
  workspacePath: string;
}

export function resolveWorkspacePath(workspaceRoot: string, issueIdentifier: string): ResolvedWorkspacePath {
  const workspaceKey = sanitizeIdentifier(issueIdentifier);
  const workspacePath = path.resolve(workspaceRoot, workspaceKey);
  if (!isWithinRoot(workspaceRoot, workspacePath)) {
    throw new Error(`workspace path escaped root: ${workspacePath}`);
  }
  return { workspaceKey, workspacePath };
}
