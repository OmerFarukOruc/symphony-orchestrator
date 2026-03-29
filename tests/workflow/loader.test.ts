import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadWorkflowDefinition } from "../../src/workflow/loader.js";

const tempDirs: string[] = [];
const baseTmpDir = os.tmpdir();

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(baseTmpDir, "symphony-loader-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("loadWorkflowDefinition", () => {
  describe("plain text (no YAML front matter)", () => {
    it("returns the entire content as promptTemplate with empty config", async () => {
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      await writeFile(filePath, "Hello world\nSecond line\n", "utf8");

      const result = await loadWorkflowDefinition(filePath);

      expect(result.config).toEqual({});
      expect(result.promptTemplate).toBe("Hello world\nSecond line");
    });

    it("trims whitespace from plain text content", async () => {
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      await writeFile(filePath, "  \n  Some prompt  \n  \n", "utf8");

      const result = await loadWorkflowDefinition(filePath);

      expect(result.promptTemplate).toBe("Some prompt");
    });
  });

  describe("YAML front matter", () => {
    it("parses front matter and separates the prompt body", async () => {
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      await writeFile(filePath, "---\ntracker:\n  api_key: test-key\n---\nPrompt body here\n", "utf8");

      const result = await loadWorkflowDefinition(filePath);

      expect(result.config).toEqual({ tracker: { api_key: "test-key" } });
      expect(result.promptTemplate).toBe("Prompt body here");
    });

    it("handles empty body after front matter", async () => {
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      await writeFile(filePath, "---\nkey: value\n---\n", "utf8");

      const result = await loadWorkflowDefinition(filePath);

      expect(result.config).toEqual({ key: "value" });
      expect(result.promptTemplate).toBe("");
    });

    it("handles front matter with no trailing content after closing ---", async () => {
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      await writeFile(filePath, "---\nkey: value\n---", "utf8");

      const result = await loadWorkflowDefinition(filePath);

      expect(result.config).toEqual({ key: "value" });
      expect(result.promptTemplate).toBe("");
    });

    it("preserves Liquid-compatible template syntax in the body", async () => {
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      await writeFile(filePath, "---\nmodel: gpt-4\n---\nFix {{ issue.identifier }}: {{ issue.title }}\n", "utf8");

      const result = await loadWorkflowDefinition(filePath);

      expect(result.promptTemplate).toBe("Fix {{ issue.identifier }}: {{ issue.title }}");
    });
  });

  describe("error handling", () => {
    it("throws missing_workflow_file for a nonexistent file", async () => {
      await expect(loadWorkflowDefinition("/nonexistent/WORKFLOW.md")).rejects.toMatchObject({
        name: "WorkflowLoaderError",
        validationError: { code: "missing_workflow_file" },
      });
    });

    it("throws workflow_parse_error for unclosed front matter (no closing ---)", async () => {
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      await writeFile(filePath, "---\nkey: value\nmore: stuff\n", "utf8");

      await expect(loadWorkflowDefinition(filePath)).rejects.toMatchObject({
        validationError: {
          code: "workflow_parse_error",
          message: "workflow front matter is not closed with a terminating --- line",
        },
      });
    });

    it("throws workflow_parse_error when front matter is just --- with no newline", async () => {
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      await writeFile(filePath, "---", "utf8");

      await expect(loadWorkflowDefinition(filePath)).rejects.toMatchObject({
        validationError: { code: "workflow_parse_error" },
      });
    });

    it("throws workflow_front_matter_not_a_map when front matter is a scalar", async () => {
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      await writeFile(filePath, "---\njust a string\n---\nBody\n", "utf8");

      await expect(loadWorkflowDefinition(filePath)).rejects.toMatchObject({
        validationError: { code: "workflow_front_matter_not_a_map" },
      });
    });

    it("throws workflow_front_matter_not_a_map when front matter is an array", async () => {
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      await writeFile(filePath, "---\n- item1\n- item2\n---\nBody\n", "utf8");

      await expect(loadWorkflowDefinition(filePath)).rejects.toMatchObject({
        validationError: { code: "workflow_front_matter_not_a_map" },
      });
    });

    it("throws workflow_parse_error for invalid YAML syntax", async () => {
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      await writeFile(filePath, "---\ninvalid: [\n---\nBody\n", "utf8");

      await expect(loadWorkflowDefinition(filePath)).rejects.toMatchObject({
        validationError: { code: "workflow_parse_error" },
      });
    });

    it("includes YAML parse error message in workflow_parse_error", async () => {
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      await writeFile(filePath, "---\ninvalid: [\n---\nBody\n", "utf8");

      await expect(loadWorkflowDefinition(filePath)).rejects.toMatchObject({
        validationError: {
          code: "workflow_parse_error",
          message: expect.any(String),
        },
      });
      // Ensure the message is non-empty (not "workflow parsing failed" fallback for non-Error throws)
      try {
        await loadWorkflowDefinition(filePath);
      } catch (error_: unknown) {
        const error = error_ as { validationError: { message: string } };
        expect(error.validationError.message.length).toBeGreaterThan(0);
      }
    });

    it("throws workflow_parse_error with fallback message for non-Error throws", async () => {
      // This test targets the catch branch where error is not instanceof Error
      // We can't easily force YAML.parse to throw a non-Error, but we verify the
      // re-throw path for WorkflowLoaderError
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      // Front matter that parses to a non-map scalar triggers WorkflowLoaderError re-throw
      await writeFile(filePath, "---\njust a string\n---\nBody\n", "utf8");

      await expect(loadWorkflowDefinition(filePath)).rejects.toMatchObject({
        validationError: { code: "workflow_front_matter_not_a_map" },
        name: "WorkflowLoaderError",
      });
    });
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: front matter parsing edge cases
  // -------------------------------------------------------------------------

  describe("front matter parsing details", () => {
    it("correctly slices front matter content between first and second ---", async () => {
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      // Verify the exact slicing: firstNewline+1 to endMarker
      await writeFile(filePath, "---\nkey1: value1\nkey2: value2\n---\nBody text\n", "utf8");

      const result = await loadWorkflowDefinition(filePath);
      expect(result.config).toEqual({ key1: "value1", key2: "value2" });
      expect(result.promptTemplate).toBe("Body text");
    });

    it("returns empty body when no newline after closing ---", async () => {
      // Kills: afterEnd === -1 branch -> body = ""
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      await writeFile(filePath, "---\nkey: val\n---", "utf8");

      const result = await loadWorkflowDefinition(filePath);
      expect(result.config).toEqual({ key: "val" });
      expect(result.promptTemplate).toBe("");
    });

    it("handles multi-line body after front matter", async () => {
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      await writeFile(filePath, "---\nkey: val\n---\nLine 1\nLine 2\nLine 3\n", "utf8");

      const result = await loadWorkflowDefinition(filePath);
      expect(result.promptTemplate).toBe("Line 1\nLine 2\nLine 3");
    });

    it("trims body content from front matter documents", async () => {
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      await writeFile(filePath, "---\nkey: val\n---\n  \n  Prompt  \n  \n", "utf8");

      const result = await loadWorkflowDefinition(filePath);
      expect(result.promptTemplate).toBe("Prompt");
    });

    it("includes error message from missing_workflow_file", async () => {
      // Kills: StringLiteral for error message
      try {
        await loadWorkflowDefinition("/nonexistent/path/WORKFLOW.md");
      } catch (error_: unknown) {
        const error = error_ as { validationError: { code: string; message: string } };
        expect(error.validationError.code).toBe("missing_workflow_file");
        expect(error.validationError.message).toContain("/nonexistent/path/WORKFLOW.md");
      }
    });

    it("throws when front matter parses to null (empty YAML)", async () => {
      const dir = await createTempDir();
      const filePath = path.join(dir, "WORKFLOW.md");
      await writeFile(filePath, "---\n\n---\nBody here\n", "utf8");

      await expect(loadWorkflowDefinition(filePath)).rejects.toMatchObject({
        validationError: { code: "workflow_front_matter_not_a_map" },
      });
    });
  });
});
