import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("cli/index integration helpers", () => {
  it("parseCliArgs prefers --data-dir over DATA_DIR and derives archiveDir", async () => {
    vi.stubEnv("DATA_DIR", "/env/data-dir");
    const { parseCliArgs } = await import("../../src/cli/index.js");

    const result = parseCliArgs(["--port", "4123", "--data-dir", "/flag/data-dir"]);

    expect(result.selectedPort).toBe(4123);
    expect(result.dataDir).toBe(path.resolve("/flag/data-dir"));
    expect(result.archiveDir).toBe(path.resolve("/flag/data-dir/archives"));
  });

  it("readMasterKeyFile trims content and returns null for missing files", async () => {
    const dir = await createTempDir("risoluto-cli-master-key-");
    const archiveDir = path.join(dir, "archives");
    await mkdir(archiveDir, { recursive: true });

    const { readMasterKeyFile } = await import("../../src/cli/index.js");

    await expect(readMasterKeyFile(archiveDir)).resolves.toBeNull();

    await writeFile(path.join(archiveDir, "master.key"), "  my-secret-key \n", "utf8");
    await expect(readMasterKeyFile(archiveDir)).resolves.toBe("my-secret-key");
  });

  it("cleanupTransientWorkspaceDirs creates a missing root and removes transient folders", async () => {
    const dir = await createTempDir("risoluto-cli-cleanup-");
    const workspaceRoot = path.join(dir, "workspaces");
    const issueDir = path.join(workspaceRoot, "MT-42");
    await mkdir(path.join(issueDir, "tmp"), { recursive: true });
    await mkdir(path.join(issueDir, ".elixir_ls"), { recursive: true });
    await writeFile(path.join(issueDir, "keep.txt"), "keep", "utf8");

    const { cleanupTransientWorkspaceDirs } = await import("../../src/cli/index.js");

    await cleanupTransientWorkspaceDirs(workspaceRoot);
    await expect(readdir(issueDir)).resolves.toEqual(["keep.txt"]);

    const missingRoot = path.join(dir, "missing-root");
    await cleanupTransientWorkspaceDirs(missingRoot);
    await expect(readdir(missingRoot)).resolves.toEqual([]);
  });

  it("safeStartConfigStore returns null on success and 1 for validation errors", async () => {
    const { safeStartConfigStore } = await import("../../src/cli/index.js");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      safeStartConfigStore({
        start: vi.fn().mockResolvedValue(undefined),
      } as never),
    ).resolves.toBeNull();

    await expect(
      safeStartConfigStore({
        start: vi.fn().mockRejectedValue({
          validationError: { code: "invalid_config", message: "broken config" },
        }),
      } as never),
    ).resolves.toBe(1);

    expect(errorSpy).toHaveBeenCalledWith('error code=invalid_config msg="broken config"');
  });

  it("evaluateSetupMode switches into setup mode for missing credentials and exits for hard validation errors", async () => {
    const { evaluateSetupMode } = await import("../../src/cli/index.js");
    const logger = { warn: vi.fn() };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      evaluateSetupMode(
        {
          validateDispatch: vi.fn().mockReturnValue({ code: "missing_tracker_api_key", message: "missing" }),
        } as never,
        logger as never,
        false,
      ),
    ).toEqual({ needsSetup: true, exitCode: null });

    expect(
      evaluateSetupMode(
        {
          validateDispatch: vi.fn().mockReturnValue({ code: "invalid_state", message: "broken" }),
        } as never,
        logger as never,
        false,
      ),
    ).toEqual({ needsSetup: false, exitCode: 1 });

    expect(logger.warn).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('error code=invalid_state msg="broken"');
  });
});
