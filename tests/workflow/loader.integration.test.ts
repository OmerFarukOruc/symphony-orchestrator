import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadWorkflowDefinition } from "../../src/workflow/loader.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-loader-int-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("workflow loader integration", () => {
  it("loads plain text workflows without front matter", async () => {
    const dir = await createTempDir();
    const workflowPath = path.join(dir, "WORKFLOW.md");
    await writeFile(workflowPath, "Hello world\nSecond line\n", "utf8");

    await expect(loadWorkflowDefinition(workflowPath)).resolves.toEqual({
      config: {},
      promptTemplate: "Hello world\nSecond line",
    });
  });

  it("loads YAML front matter and preserves the prompt body", async () => {
    const dir = await createTempDir();
    const workflowPath = path.join(dir, "WORKFLOW.md");
    await writeFile(
      workflowPath,
      "---\ntracker:\n  api_key: test-key\n---\nFix {{ issue.identifier }}: {{ issue.title }}\n",
      "utf8",
    );

    await expect(loadWorkflowDefinition(workflowPath)).resolves.toEqual({
      config: { tracker: { api_key: "test-key" } },
      promptTemplate: "Fix {{ issue.identifier }}: {{ issue.title }}",
    });
  });

  it("throws missing_workflow_file for a nonexistent path", async () => {
    await expect(loadWorkflowDefinition("/nonexistent/WORKFLOW.md")).rejects.toMatchObject({
      name: "WorkflowLoaderError",
      validationError: { code: "missing_workflow_file" },
    });
  });

  it("throws workflow_parse_error for unclosed or invalid front matter", async () => {
    const dir = await createTempDir();
    const unclosedPath = path.join(dir, "unclosed.md");
    const invalidPath = path.join(dir, "invalid.md");
    await writeFile(unclosedPath, "---\nkey: value\nmore: stuff\n", "utf8");
    await writeFile(invalidPath, "---\ninvalid: [\n---\nBody\n", "utf8");

    await expect(loadWorkflowDefinition(unclosedPath)).rejects.toMatchObject({
      validationError: {
        code: "workflow_parse_error",
        message: "workflow front matter is not closed with a terminating --- line",
      },
    });
    await expect(loadWorkflowDefinition(invalidPath)).rejects.toMatchObject({
      validationError: { code: "workflow_parse_error" },
    });
  });

  it("throws workflow_front_matter_not_a_map when YAML parses to a scalar or array", async () => {
    const dir = await createTempDir();
    const scalarPath = path.join(dir, "scalar.md");
    const arrayPath = path.join(dir, "array.md");
    await writeFile(scalarPath, "---\njust a string\n---\nBody\n", "utf8");
    await writeFile(arrayPath, "---\n- item1\n- item2\n---\nBody\n", "utf8");

    await expect(loadWorkflowDefinition(scalarPath)).rejects.toMatchObject({
      validationError: { code: "workflow_front_matter_not_a_map" },
    });
    await expect(loadWorkflowDefinition(arrayPath)).rejects.toMatchObject({
      validationError: { code: "workflow_front_matter_not_a_map" },
    });
  });
});
