/**
 * Live smoke tests for the Docker provider.
 *
 * These tests exercise the real Docker CLI and require Docker to be
 * installed and available.  Set `DOCKER_TEST_ENABLED=1` to opt in.
 * They are excluded from the default `test:integration` runner and only
 * execute via `pnpm run test:integration:live`.
 *
 * When the env var is absent the entire suite skips gracefully.
 */

import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterAll, describe, expect, it } from "vitest";

const execFile = promisify(execFileCb);
const DOCKER_ENABLED = process.env.DOCKER_TEST_ENABLED === "1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Container names created during tests — removed in afterAll. */
const containersToRemove: string[] = [];

async function dockerRm(containerName: string): Promise<void> {
  try {
    await execFile("docker", ["rm", "-f", containerName]);
  } catch {
    // Best-effort cleanup
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!DOCKER_ENABLED)("docker live smoke", () => {
  afterAll(async () => {
    for (const name of containersToRemove) {
      await dockerRm(name);
    }
  });

  // -----------------------------------------------------------------------
  // Prerequisite — Docker CLI is available
  // -----------------------------------------------------------------------

  it("has Docker CLI available and responsive", async () => {
    const { stdout } = await execFile("docker", ["version", "--format", "{{.Server.Version}}"]);
    expect(stdout.trim().length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Happy path — run a simple container and capture stdout
  // -----------------------------------------------------------------------

  it("runs alpine echo and captures stdout with exit code 0", async () => {
    const containerName = `risoluto-live-echo-${Date.now()}`;
    containersToRemove.push(containerName);

    const { stdout, stderr } = await execFile("docker", [
      "run",
      "--name",
      containerName,
      "--rm",
      "alpine:latest",
      "echo",
      "hello-risoluto",
    ]);

    expect(stdout.trim()).toBe("hello-risoluto");
    // --rm ensures automatic container removal; stderr should be empty or just pull logs
    expect(stderr).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Cleanup verification — container removed after --rm run
  // -----------------------------------------------------------------------

  it("verifies container is removed after --rm run", async () => {
    const containerName = `risoluto-live-cleanup-${Date.now()}`;

    // Run with --rm — container auto-removes
    await execFile("docker", ["run", "--name", containerName, "--rm", "alpine:latest", "true"]);

    // Inspect should fail because container no longer exists
    try {
      await execFile("docker", ["inspect", containerName]);
      expect.fail("Container should not exist after --rm run");
    } catch (error) {
      expect(String(error)).toContain("No such object");
    }
  });

  // -----------------------------------------------------------------------
  // Workspace mount — file written by container is accessible on host
  // -----------------------------------------------------------------------

  it("mounts a workspace dir and reads a file written by the container", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "risoluto-docker-mount-"));
    const containerName = `risoluto-live-mount-${Date.now()}`;
    containersToRemove.push(containerName);

    try {
      await execFile("docker", [
        "run",
        "--name",
        containerName,
        "--rm",
        "-v",
        `${tempDir}:/workspace`,
        "alpine:latest",
        "sh",
        "-c",
        'echo "mount-test-ok" > /workspace/output.txt',
      ]);

      const content = await readFile(path.join(tempDir, "output.txt"), "utf-8");
      expect(content.trim()).toBe("mount-test-ok");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  // -----------------------------------------------------------------------
  // Non-zero exit code — error captured correctly
  // -----------------------------------------------------------------------

  it("captures non-zero exit codes from containers", async () => {
    const containerName = `risoluto-live-fail-${Date.now()}`;
    containersToRemove.push(containerName);

    try {
      await execFile("docker", ["run", "--name", containerName, "--rm", "alpine:latest", "sh", "-c", "exit 42"]);
      expect.fail("Expected docker run to reject with non-zero exit code");
    } catch (error) {
      // Node's execFile rejects on non-zero exit — verify the error is captured
      const execError = error as { code?: number; killed?: boolean };
      expect(execError.code).toBe(42);
    }
  });
});
