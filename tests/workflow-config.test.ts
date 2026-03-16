import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ConfigStore } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { loadWorkflowDefinition } from "../src/workflow-loader.js";

const tempDirs: string[] = [];
const baseTmpDir = os.tmpdir();

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(baseTmpDir, "symphony-workflow-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("workflow loader", () => {
  it("parses YAML front matter and prompt body", async () => {
    const dir = await createTempDir();
    const workflowPath = path.join(dir, "WORKFLOW.md");
    await writeFile(
      workflowPath,
      "---\ntracker:\n  api_key: $LINEAR_API_KEY\nserver:\n  port: 4001\n---\nHello {{ issue.identifier }}\n",
      "utf8",
    );

    const workflow = await loadWorkflowDefinition(workflowPath);

    expect(workflow.promptTemplate).toBe("Hello {{ issue.identifier }}");
    expect(workflow.config).toMatchObject({
      tracker: { api_key: "$LINEAR_API_KEY" },
      server: { port: 4001 },
    });
  });

  it("throws missing_workflow_file for absent workflow", async () => {
    await expect(loadWorkflowDefinition("/nope/WORKFLOW.md")).rejects.toMatchObject({
      validationError: { code: "missing_workflow_file" },
    });
  });

  it("throws workflow_front_matter_not_a_map for scalar front matter", async () => {
    const dir = await createTempDir();
    const workflowPath = path.join(dir, "WORKFLOW.md");
    await writeFile(workflowPath, "---\nhello\n---\nBody\n", "utf8");

    await expect(loadWorkflowDefinition(workflowPath)).rejects.toMatchObject({
      validationError: { code: "workflow_front_matter_not_a_map" },
    });
  });
});

describe("config store", () => {
  it("resolves env-backed fields and validates missing tracker key", async () => {
    const dir = await createTempDir();
    const workflowPath = path.join(dir, "WORKFLOW.md");
    await writeFile(
      workflowPath,
      "---\ntracker:\n  api_key: $LINEAR_API_KEY\nworkspace:\n  root: $TMPDIR/symphony\ncodex:\n  command: codex app-server\n---\nPrompt\n",
      "utf8",
    );

    delete process.env.LINEAR_API_KEY;
    process.env.TMPDIR = dir;

    const store = new ConfigStore(workflowPath, createLogger());
    await store.start();

    expect(store.getConfig().workspace.root).toBe(path.join(dir, "symphony"));
    expect(store.validateDispatch()).toEqual({
      code: "missing_tracker_api_key",
      message: "tracker.api_key is required after env resolution",
    });

    await store.stop();
  });

  it("keeps the last known good config on invalid reload", async () => {
    const dir = await createTempDir();
    const workflowPath = path.join(dir, "WORKFLOW.md");
    process.env.LINEAR_API_KEY = "linear-token";

    await writeFile(
      workflowPath,
      "---\ntracker:\n  api_key: $LINEAR_API_KEY\ncodex:\n  command: codex app-server\nserver:\n  port: 4001\n---\nPrompt\n",
      "utf8",
    );

    const store = new ConfigStore(workflowPath, createLogger());
    await store.start();
    expect(store.getConfig().server.port).toBe(4001);

    await writeFile(workflowPath, "---\ninvalid: [\n---\nPrompt\n", "utf8");
    await store.refresh("test-invalid-reload");

    expect(store.getConfig().server.port).toBe(4001);
    await store.stop();
  });
});
