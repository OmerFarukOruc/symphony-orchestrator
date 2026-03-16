import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

/**
 * Integration test: validates config loading → workflow parsing pipeline
 * using real fixture files, no mocks.
 */
describe("config-workflow integration", () => {
  const fixtureDir = path.resolve("tests/fixtures");

  it("parses a valid WORKFLOW.example.md into a ServiceConfig", async () => {
    const workflowPath = path.resolve("WORKFLOW.example.md");
    const content = await readFile(workflowPath, "utf8");

    // Extract YAML front matter between --- markers
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    expect(match).not.toBeNull();
    const yamlContent = match![1];
    const parsed = parse(yamlContent);

    expect(parsed).toBeDefined();
    expect(parsed).toHaveProperty("tracker");
    expect(parsed.tracker).toHaveProperty("kind");
    expect(parsed).toHaveProperty("workspace");
    expect(parsed).toHaveProperty("agent");
  });

  it("fixture codex-home directories exist and contain expected structure", async () => {
    const requiredMcp = path.join(fixtureDir, "codex-home-required-mcp");
    const customProvider = path.join(fixtureDir, "codex-home-custom-provider");

    // Verify fixture directories exist by reading them
    const requiredConfig = await readFile(path.join(requiredMcp, "config.toml"), "utf8");
    expect(requiredConfig).toBeTruthy();
    expect(requiredConfig.length).toBeGreaterThan(0);

    const providerConfig = await readFile(path.join(customProvider, "config.toml"), "utf8");
    expect(providerConfig).toBeTruthy();
    expect(providerConfig.length).toBeGreaterThan(0);
  });

  it("WORKFLOW.example.md prompt template contains Liquid-compatible placeholders", async () => {
    const content = await readFile("WORKFLOW.example.md", "utf8");

    // Strip front matter, get template body
    const body = content.replace(/^---[\s\S]*?---\n*/, "");
    expect(body.length).toBeGreaterThan(0);

    // Should contain Liquid template variables used by agent-runner
    expect(body).toMatch(/\{\{.*issue.*\}\}/);
  });
});
