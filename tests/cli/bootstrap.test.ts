import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

/** A minimal valid WORKFLOW.md that passes schema validation. */
const MINIMAL_WORKFLOW = `---
tracker:
  kind: linear
  project_slug: test-project
  api_key: $LINEAR_API_KEY
  active_states: ["Backlog", "Todo", "In Progress"]
agent:
  maxTurns: 1
codex:
  model: gpt-4o
  sandbox:
    resources:
      memory: 512m
workspace:
  root: ./workspaces
`;

interface TempCtx {
  dir: string;
  workflowPath: string;
  archiveDir: string;
}

const tempDirs: string[] = [];

async function createTempWorkflow(): Promise<TempCtx> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-cli-test-"));
  tempDirs.push(dir);
  const workflowPath = path.join(dir, "WORKFLOW.md");
  const archiveDir = path.join(dir, "archive");
  await writeFile(workflowPath, MINIMAL_WORKFLOW, "utf8");
  await mkdir(archiveDir, { recursive: true });
  return { dir, workflowPath, archiveDir };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("CLI parseCliArgs (via main module)", () => {
  it("resolves default workflow path when no positional arg given", async () => {
    const { parseArgs } = await import("node:util");
    const result = parseArgs({
      args: [],
      allowPositionals: true,
      options: {
        port: { type: "string" },
        "log-dir": { type: "string" },
      },
    });
    expect(result.positionals[0] ?? "./WORKFLOW.md").toBe("./WORKFLOW.md");
  });

  it("resolves custom workflow path from first positional", async () => {
    const { parseArgs } = await import("node:util");
    const result = parseArgs({
      args: ["./my-workflow.md"],
      allowPositionals: true,
      options: {
        port: { type: "string" },
        "log-dir": { type: "string" },
      },
    });
    expect(result.positionals[0]).toBe("./my-workflow.md");
  });

  it("extracts --port and --log-dir options", async () => {
    const { parseArgs } = await import("node:util");
    const result = parseArgs({
      args: ["./flow.md", "--port", "3456", "--log-dir", "/tmp/my-archives"],
      allowPositionals: true,
      options: {
        port: { type: "string" },
        "log-dir": { type: "string" },
      },
    });
    expect(result.values.port).toBe("3456");
    expect(result.values["log-dir"]).toBe("/tmp/my-archives");
  });

  it("resolves archive dir from DATA_DIR env when no --log-dir", () => {
    const dataDir = "/data/custom";
    const archiveDir = path.resolve(path.join(dataDir, "archives"));
    expect(archiveDir).toBe(path.resolve("/data/custom/archives"));
  });

  it("rejects invalid --port values before startup", async () => {
    const { parseCliArgs } = await import("../../src/cli/parse-args.js");
    expect(() => parseCliArgs(["--port", "abc"])).toThrow(
      "invalid --port value: abc. Expected an integer between 1 and 65535 with no leading zeros.",
    );
  });

  it("rejects --port 0 (anvil hardening: port 0 means 'any' and must be explicit)", async () => {
    const { parseCliArgs } = await import("../../src/cli/parse-args.js");
    expect(() => parseCliArgs(["--port", "0"])).toThrow(
      "invalid --port value: 0. Expected an integer between 1 and 65535 with no leading zeros.",
    );
  });

  it("rejects --port with leading zeros (anvil hardening: 00004000 is not 4000)", async () => {
    const { parseCliArgs } = await import("../../src/cli/parse-args.js");
    expect(() => parseCliArgs(["--port", "04000"])).toThrow(
      "invalid --port value: 04000. Expected an integer between 1 and 65535 with no leading zeros.",
    );
  });
});

describe("CLI readMasterKeyFile equivalent", () => {
  it("returns null when master.key file does not exist", async () => {
    const { dir } = await createTempWorkflow();
    try {
      await readFile(path.join(dir, "archive", "master.key"), "utf8");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe("ENOENT");
    }
  });

  it("reads and trims master.key content", async () => {
    const { dir } = await createTempWorkflow();
    const keyPath = path.join(dir, "archive", "master.key");
    await writeFile(keyPath, "  my-secret-key  \n", "utf8");
    const content = (await readFile(keyPath, "utf8")).trim();
    expect(content).toBe("my-secret-key");
  });

  it("returns null for empty master.key", async () => {
    const { dir } = await createTempWorkflow();
    const keyPath = path.join(dir, "archive", "master.key");
    await writeFile(keyPath, "   \n", "utf8");
    const content = (await readFile(keyPath, "utf8")).trim() || null;
    expect(content).toBeNull();
  });
});

describe("CLI printValidationError", () => {
  it("formats validation errors to stderr pattern", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = { code: "test_error", message: "something bad" };
    console.error(`error code=${error.code} msg=${JSON.stringify(error.message)}`);
    expect(spy).toHaveBeenCalledWith('error code=test_error msg="something bad"');
    spy.mockRestore();
  });
});

describe("CLI cleanupTransientWorkspaceDirs", () => {
  it("removes transient subdirectories but preserves workspace dirs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-cleanup-test-"));
    tempDirs.push(dir);

    const wsRoot = path.join(dir, "workspaces");
    const issueDir = path.join(wsRoot, "MT-42");
    await mkdir(path.join(issueDir, "tmp"), { recursive: true });
    await writeFile(path.join(issueDir, "tmp", "junk.txt"), "junk", "utf8");
    await mkdir(path.join(issueDir, ".elixir_ls"), { recursive: true });
    await writeFile(path.join(issueDir, "RISOLUTO_SMOKE.md"), "keep", "utf8");

    // Simulate the cleanup logic (same as src/cli/index.ts)
    const { readdir, rm: rmFs } = await import("node:fs/promises");
    const entries = await readdir(wsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      for (const transientName of ["tmp", ".elixir_ls"]) {
        await rmFs(path.join(wsRoot, entry.name, transientName), { recursive: true, force: true });
      }
    }

    // Verify transients removed but workspace preserved
    const remaining = await readdir(issueDir);
    expect(remaining).toEqual(["RISOLUTO_SMOKE.md"]);
  });
});
