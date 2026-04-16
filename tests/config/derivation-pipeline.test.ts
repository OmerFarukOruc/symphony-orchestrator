import { describe, expect, it } from "vitest";

import { deriveServiceConfig } from "../../src/config/derivation-pipeline.js";
import type { WorkflowDefinition } from "../../src/core/types.js";

function createWorkflow(config: Record<string, unknown>): WorkflowDefinition {
  return {
    config,
    promptTemplate: "Work on the issue.",
  };
}

describe("deriveServiceConfig pipeline", () => {
  it("derives a full config through the pipeline boundary", () => {
    const config = deriveServiceConfig(
      createWorkflow({
        tracker: { kind: "github", endpoint: "https://api.github.com" },
        workspace: { root: "~/workspaces", strategy: "directory" },
        hooks: { timeout_ms: 1234 },
        agent: { max_turns: 9 },
        codex: { command: "codex", auth: { mode: "api_key", source_home: "/tmp" } },
        server: { port: 9000 },
      }),
    );

    expect(config.tracker.endpoint).toBe("https://api.github.com");
    expect(config.workspace.hooks.timeoutMs).toBe(1234);
    expect(config.agent.maxTurns).toBe(9);
    expect(config.server.port).toBe(9000);
  });

  it("respects merged config input before deriving sections", () => {
    const config = deriveServiceConfig(
      createWorkflow({
        tracker: { kind: "linear" },
      }),
      {
        mergedConfigMap: {
          tracker: { kind: "linear", api_key: "lin_test", project_slug: "TEST" },
          codex: { command: "codex", auth: { mode: "api_key", source_home: "/tmp" } },
          agent: {},
        },
      },
    );

    expect(config.tracker.apiKey).toBe("lin_test");
    expect(config.tracker.projectSlug).toBe("TEST");
  });
});
