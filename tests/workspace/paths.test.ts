import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildSafePath, isWithinRoot, sanitizeIdentifier, resolveWorkspacePath } from "../../src/workspace/paths.js";

/* ── env snapshot ────────────────────────────────────────────────── */

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

/* ── buildSafePath (edge cases beyond safe-path.test.ts) ─────────── */

describe("buildSafePath", () => {
  it("preserves all six known safe directories", () => {
    process.env.PATH = "/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin";
    expect(buildSafePath()).toBe("/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin");
  });

  it("returns fallback when PATH is empty string", () => {
    process.env.PATH = "";
    expect(buildSafePath()).toBe("/usr/local/bin:/usr/bin:/bin");
  });
});

/* ── isWithinRoot ────────────────────────────────────────────────── */

describe("isWithinRoot", () => {
  it("accepts a path directly inside the root", () => {
    expect(isWithinRoot("/workspace", "/workspace/issue-1")).toBe(true);
  });

  it("accepts a deeply nested path inside the root", () => {
    expect(isWithinRoot("/workspace", "/workspace/a/b/c")).toBe(true);
  });

  it("accepts the root path itself", () => {
    expect(isWithinRoot("/workspace", "/workspace")).toBe(true);
  });

  it("rejects a path that escapes the root via ../", () => {
    expect(isWithinRoot("/workspace", "/workspace/../etc/passwd")).toBe(false);
  });

  it("rejects a completely unrelated path", () => {
    expect(isWithinRoot("/workspace", "/other/directory")).toBe(false);
  });

  it("rejects a sibling path with a similar prefix", () => {
    expect(isWithinRoot("/workspace", "/workspace-extra/data")).toBe(false);
  });

  it("rejects a parent directory", () => {
    expect(isWithinRoot("/workspace/sub", "/workspace")).toBe(false);
  });

  it("handles trailing slashes correctly", () => {
    expect(isWithinRoot("/workspace/", "/workspace/file.txt")).toBe(true);
  });
});

/* ── sanitizeIdentifier ──────────────────────────────────────────── */

describe("sanitizeIdentifier", () => {
  it("passes through a clean identifier unchanged", () => {
    expect(sanitizeIdentifier("MT-42")).toBe("MT-42");
  });

  it("replaces spaces with underscores", () => {
    expect(sanitizeIdentifier("my issue")).toBe("my_issue");
  });

  it("replaces slashes with underscores", () => {
    expect(sanitizeIdentifier("org/repo#123")).toBe("org_repo_123");
  });

  it("preserves dots and hyphens", () => {
    expect(sanitizeIdentifier("v1.2.3-rc1")).toBe("v1.2.3-rc1");
  });

  it("replaces special characters", () => {
    expect(sanitizeIdentifier("issue@#$%^&*()")).toBe("issue_________");
  });

  it("handles empty string", () => {
    expect(sanitizeIdentifier("")).toBe("");
  });

  it("replaces unicode characters", () => {
    expect(sanitizeIdentifier("issue-\u00e9\u00e8")).toBe("issue-__");
  });

  it("handles path traversal characters", () => {
    expect(sanitizeIdentifier("../../etc/passwd")).toBe(".._.._etc_passwd");
  });
});

/* ── resolveWorkspacePath ────────────────────────────────────────── */

describe("resolveWorkspacePath", () => {
  it("returns a sanitized key and resolved path for a clean identifier", () => {
    const result = resolveWorkspacePath("/workspaces", "MT-42");
    expect(result.workspaceKey).toBe("MT-42");
    expect(result.workspacePath).toBe(path.resolve("/workspaces", "MT-42"));
  });

  it("sanitizes the identifier before resolving", () => {
    const result = resolveWorkspacePath("/workspaces", "org/repo#99");
    expect(result.workspaceKey).toBe("org_repo_99");
    expect(result.workspacePath).toBe(path.resolve("/workspaces", "org_repo_99"));
  });

  it("handles identifiers with dots and hyphens", () => {
    const result = resolveWorkspacePath("/workspaces", "project-1.0");
    expect(result.workspaceKey).toBe("project-1.0");
    expect(result.workspacePath).toBe(path.resolve("/workspaces", "project-1.0"));
  });

  it("sanitizes traversal attempts into safe directory names", () => {
    // "../../etc" sanitizes to ".._.._etc" which is a safe directory name
    // (not a path traversal segment), so it stays within root
    const result = resolveWorkspacePath("/workspaces", "../../etc");
    expect(result.workspaceKey).toBe(".._.._etc");
    expect(isWithinRoot("/workspaces", result.workspacePath)).toBe(true);
  });

  it("does not throw for safe identifiers", () => {
    const result = resolveWorkspacePath("/workspaces", "safe-identifier");
    expect(result.workspaceKey).toBe("safe-identifier");
    expect(isWithinRoot("/workspaces", result.workspacePath)).toBe(true);
  });
});
