import { describe, expect, it } from "vitest";

import { deriveServiceConfig } from "../../src/config/builders.js";
import type { WorkflowDefinition } from "../../src/core/types.js";

function createWorkflow(config: Record<string, unknown>): WorkflowDefinition {
  return {
    config,
    promptTemplate: "Work on the issue.",
  };
}

describe("deriveServiceConfig", () => {
  it("defaults polling to 15 seconds", () => {
    const config = deriveServiceConfig(
      createWorkflow({
        tracker: {
          kind: "linear",
          api_key: "lin_test",
          project_slug: "TEST",
        },
        codex: {
          command: "codex",
          auth: {
            mode: "api_key",
            source_home: "/tmp",
          },
        },
        agent: {},
      }),
    );

    expect(config.polling.intervalMs).toBe(15000);
  });
});
