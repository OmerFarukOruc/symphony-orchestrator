import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Integration test: validates config loading and overlay derivation pipeline
 * using real fixture files, no mocks.
 */
describe("config-workflow integration", () => {
  const fixtureDir = path.resolve("tests/fixtures");

  it("fixture codex-home directories exist and contain expected structure", async () => {
    const requiredMcp = path.join(fixtureDir, "codex-home-required-mcp");

    // Verify fixture directories exist by reading them
    const requiredConfig = await readFile(path.join(requiredMcp, "config.toml"), "utf8");
    expect(requiredConfig).toBeTruthy();
    expect(requiredConfig.length).toBeGreaterThan(0);
  });

  it("overlay map with tracker config produces a valid config structure", async () => {
    const { deriveServiceConfig } = await import("../../src/config/builders.js");

    const workflow = {
      config: {
        tracker: {
          kind: "linear",
          api_key: "lin_api_test_key",
          project_slug: "test-project-slug",
        },
        polling: { interval_ms: 15000 },
        agent: { max_concurrent_agents: 3, max_turns: 10 },
        workspace: { root: "/tmp/test-workspaces" },
      },
      promptTemplate: "",
    };

    const config = deriveServiceConfig(workflow);

    expect(config.tracker.kind).toBe("linear");
    expect(config.tracker.apiKey).toBe("lin_api_test_key");
    expect(config.tracker.projectSlug).toBe("test-project-slug");
    expect(config.polling.intervalMs).toBe(15000);
    expect(config.agent.maxConcurrentAgents).toBe(3);
    expect(config.agent.maxTurns).toBe(10);
  });

  it("overlay map with codex config preserves all codex fields", async () => {
    const { deriveServiceConfig } = await import("../../src/config/builders.js");

    const workflow = {
      config: {
        tracker: {
          kind: "linear",
          api_key: "lin_api_test",
          project_slug: "slug",
        },
        codex: {
          command: "codex app-server",
          approval_policy: "never",
          thread_sandbox: "danger-full-access",
          turn_timeout_ms: 1800000,
        },
      },
      promptTemplate: "",
    };

    const config = deriveServiceConfig(workflow);

    expect(config.codex.command).toBe("codex app-server");
    expect(config.codex.approvalPolicy).toBe("never");
    expect(config.codex.threadSandbox).toBe("danger-full-access");
    expect(config.codex.turnTimeoutMs).toBe(1800000);
  });

  it("defaults apply when optional fields are omitted", async () => {
    const { deriveServiceConfig } = await import("../../src/config/builders.js");

    const workflow = {
      config: {
        tracker: {
          kind: "linear",
          api_key: "lin_api_test",
          project_slug: "slug",
        },
      },
      promptTemplate: "",
    };

    const config = deriveServiceConfig(workflow);

    // Defaults should apply for omitted fields
    expect(config.polling.intervalMs).toBe(15000);
    expect(config.agent.maxConcurrentAgents).toBe(10);
    expect(config.agent.maxTurns).toBe(20);
  });

  it("overlay option deep-merges into workflow config", async () => {
    const { deriveServiceConfig } = await import("../../src/config/builders.js");

    const workflow = {
      config: {
        tracker: {
          kind: "linear",
          api_key: "lin_api_base",
          project_slug: "base-slug",
        },
        polling: { interval_ms: 30000 },
      },
      promptTemplate: "",
    };

    const config = deriveServiceConfig(workflow, {
      overlay: { polling: { interval_ms: 5000 }, agent: { max_turns: 5 } },
    });

    // Overlay value wins over workflow config
    expect(config.polling.intervalMs).toBe(5000);
    // Overlay value fills in a field not in workflow config
    expect(config.agent.maxTurns).toBe(5);
    // Unaffected field from workflow config preserved
    expect(config.tracker.projectSlug).toBe("base-slug");
  });
});
