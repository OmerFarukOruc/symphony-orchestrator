import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
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

    // Verify fixture directories exist by reading them
    const requiredConfig = await readFile(path.join(requiredMcp, "config.toml"), "utf8");
    expect(requiredConfig).toBeTruthy();
    expect(requiredConfig.length).toBeGreaterThan(0);
  });

  it("WORKFLOW.example.md prompt template contains Liquid-compatible placeholders", async () => {
    const content = await readFile("WORKFLOW.example.md", "utf8");

    // Strip front matter, get template body
    const body = content.replace(/^---[\s\S]*?---\n*/, "");
    expect(body.length).toBeGreaterThan(0);

    // Should contain Liquid template variables used by agent-runner
    expect(body).toMatch(/\{\{\s*issue\b/);
  });
});

/**
 * Runtime smoke tests: validate that key runtime modules can be
 * imported and their exported shapes match expectations.
 */
describe("runtime module smoke tests", () => {
  it("ConfigStore can be imported and has expected shape", async () => {
    const mod = await import("../../src/config/store.js");
    expect(mod.ConfigStore).toBeDefined();
    expect(typeof mod.ConfigStore).toBe("function");
    expect(mod.ConfigStore.prototype).toHaveProperty("start");
    expect(mod.ConfigStore.prototype).toHaveProperty("stop");
    expect(mod.ConfigStore.prototype).toHaveProperty("getConfig");
  });

  it("AttemptStore exports expected runtime shape", async () => {
    const mod = await import("../../src/core/attempt-store.js");
    expect(mod.AttemptStore).toBeDefined();
    expect(typeof mod.AttemptStore).toBe("function");
    expect(mod.AttemptStore.prototype).toHaveProperty("recordEvent");
    expect(mod.AttemptStore.prototype).toHaveProperty("loadAttempts");
  });

  it("HttpServer has expected lifecycle methods", async () => {
    const mod = await import("../../src/http/server.js");
    expect(mod.HttpServer).toBeDefined();
    expect(typeof mod.HttpServer).toBe("function");
    expect(mod.HttpServer.prototype).toHaveProperty("start");
    expect(mod.HttpServer.prototype).toHaveProperty("stop");
  });

  it("Orchestrator has expected lifecycle shape", async () => {
    const mod = await import("../../src/orchestrator/orchestrator.js");
    expect(mod.Orchestrator).toBeDefined();
    expect(typeof mod.Orchestrator).toBe("function");
    expect(mod.Orchestrator.prototype).toHaveProperty("start");
    expect(mod.Orchestrator.prototype).toHaveProperty("stop");
  });

  it("docker lifecycle exports all expected functions", async () => {
    const mod = await import("../../src/docker/lifecycle.js");
    expect(typeof mod.stopContainer).toBe("function");
    expect(typeof mod.inspectOomKilled).toBe("function");
    expect(typeof mod.inspectContainerRunning).toBe("function");
    expect(typeof mod.removeContainer).toBe("function");
    expect(typeof mod.removeVolume).toBe("function");
  });

  it("feature flags can be loaded from non-existent directory gracefully", async () => {
    const { loadFlags } = await import("../../src/core/feature-flags.js");
    const result = loadFlags("/tmp/nonexistent-symphony-flags-dir");
    expect(result).toHaveProperty("source");
    expect(result).toHaveProperty("fileStatus");
    expect(result.fileStatus).toBe("missing");
  });
});

/**
 * Fixture archive integrity tests: validate the test archive fixtures
 * contain well-formed data that the AttemptStore can process.
 */
describe("archive fixture integrity", () => {
  const archiveDir = path.resolve("tests/fixtures/symphony-archive-sandbox/.symphony");

  it("issue-index.json is valid JSON with expected shape", async () => {
    const indexPath = path.join(archiveDir, "issue-index.json");
    const content = await readFile(indexPath, "utf8");
    const index = JSON.parse(content) as Record<string, unknown>;
    expect(typeof index).toBe("object");
    expect(index).not.toBeNull();
    // Each entry should have attempt IDs
    for (const value of Object.values(index)) {
      expect(Array.isArray(value)).toBe(true);
    }
  });

  it("attempt files in attempts/ are valid JSON", async () => {
    const attemptsDir = path.join(archiveDir, "attempts");
    const files = await readdir(attemptsDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    expect(jsonFiles.length).toBeGreaterThan(0);

    for (const file of jsonFiles) {
      const content = await readFile(path.join(attemptsDir, file), "utf8");
      const parsed = JSON.parse(content) as Record<string, unknown>;
      expect(parsed).toHaveProperty("attemptId");
      expect(parsed).toHaveProperty("identifier");
    }
  });

  it("event files in events/ are valid JSONL", async () => {
    const eventsDir = path.join(archiveDir, "events");
    const files = await readdir(eventsDir);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
    expect(jsonlFiles.length).toBeGreaterThan(0);

    for (const file of jsonlFiles) {
      const content = await readFile(path.join(eventsDir, file), "utf8");
      const lines = content.trim().split("\n");
      for (const line of lines) {
        const event = JSON.parse(line) as Record<string, unknown>;
        expect(event).toHaveProperty("kind");
      }
    }
  });
});
