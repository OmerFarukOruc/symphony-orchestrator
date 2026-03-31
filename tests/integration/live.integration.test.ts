import { mkdtemp, cp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-live-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("live integration", () => {
  it("skips cleanly when required credentials are absent, while still copying the required MCP fixture into temp space", async () => {
    const originalLinearApiKey = process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_API_KEY;

    const tempDir = await createTempDir();
    const requiredTarget = path.join(tempDir, "required-mcp-home");

    try {
      await cp("tests/fixtures/codex-home-required-mcp", requiredTarget, { recursive: true });

      expect(process.env.LINEAR_API_KEY ?? "").toBe("");
      expect(requiredTarget).toContain("required-mcp-home");
    } finally {
      if (originalLinearApiKey === undefined) {
        delete process.env.LINEAR_API_KEY;
      } else {
        process.env.LINEAR_API_KEY = originalLinearApiKey;
      }
    }
  });
});
