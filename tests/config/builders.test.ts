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

  it("defaults server port to 4000", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.server.port).toBe(4000);
  });

  it("applies overlay config via deepMerge when provided", () => {
    const config = deriveServiceConfig(createWorkflow({ polling: { interval_ms: 5000 } }), {
      overlay: { polling: { interval_ms: 30000 } },
    });
    expect(config.polling.intervalMs).toBe(30000);
  });
});

describe("deriveServiceConfig - tracker subsection", () => {
  it("falls back to secretResolver for LINEAR_API_KEY when api_key not in config", () => {
    const resolver = (name: string) => (name === "LINEAR_API_KEY" ? "resolved-key" : undefined);
    const config = deriveServiceConfig(createWorkflow({}), { secretResolver: resolver });
    expect(config.tracker.apiKey).toBe("resolved-key");
  });

  it("falls back to secretResolver for LINEAR_PROJECT_SLUG when not in config", () => {
    const resolver = (name: string) => (name === "LINEAR_PROJECT_SLUG" ? "PROJ" : undefined);
    const config = deriveServiceConfig(createWorkflow({}), { secretResolver: resolver });
    expect(config.tracker.projectSlug).toBe("PROJ");
  });

  it("resolves owner from secretResolver GITHUB_OWNER when tracker.owner is empty", () => {
    const resolver = (name: string) => (name === "GITHUB_OWNER" ? "my-org" : undefined);
    const config = deriveServiceConfig(createWorkflow({}), { secretResolver: resolver });
    expect(config.tracker.owner).toBe("my-org");
  });

  it("resolves repo from secretResolver GITHUB_REPO when tracker.repo is empty", () => {
    const resolver = (name: string) => (name === "GITHUB_REPO" ? "my-repo" : undefined);
    const config = deriveServiceConfig(createWorkflow({}), { secretResolver: resolver });
    expect(config.tracker.repo).toBe("my-repo");
  });

  it("prefers tracker.owner from config over secretResolver", () => {
    const resolver = (name: string) => (name === "GITHUB_OWNER" ? "env-org" : undefined);
    const config = deriveServiceConfig(createWorkflow({ tracker: { owner: "config-org" } }), {
      secretResolver: resolver,
    });
    expect(config.tracker.owner).toBe("config-org");
  });

  it("prefers tracker.repo from config over secretResolver", () => {
    const resolver = (name: string) => (name === "GITHUB_REPO" ? "env-repo" : undefined);
    const config = deriveServiceConfig(createWorkflow({ tracker: { repo: "config-repo" } }), {
      secretResolver: resolver,
    });
    expect(config.tracker.repo).toBe("config-repo");
  });

  it("returns empty owner when no config value and no secretResolver", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.tracker.owner).toBe("");
  });

  it("returns empty repo when no config value and no secretResolver", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.tracker.repo).toBe("");
  });

  it("returns empty owner when secretResolver returns undefined for GITHUB_OWNER", () => {
    const resolver = () => undefined;
    const config = deriveServiceConfig(createWorkflow({}), { secretResolver: resolver });
    expect(config.tracker.owner).toBe("");
  });

  it("returns empty repo when secretResolver returns undefined for GITHUB_REPO", () => {
    const resolver = () => undefined;
    const config = deriveServiceConfig(createWorkflow({}), { secretResolver: resolver });
    expect(config.tracker.repo).toBe("");
  });

  it("defaults tracker kind to linear", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.tracker.kind).toBe("linear");
  });

  it("defaults tracker endpoint", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.tracker.endpoint).toBe("https://api.linear.app/graphql");
  });

  it("defaults activeStates and terminalStates", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.tracker.activeStates).toEqual(["Backlog", "Todo", "In Progress"]);
    expect(config.tracker.terminalStates).toEqual(["Done", "Canceled"]);
  });
});

describe("deriveServiceConfig - workspace subsection", () => {
  it("defaults hook timeout to 60000 and guards against non-positive values", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.workspace.hooks.timeoutMs).toBe(60000);
  });

  it("uses provided hook timeout when positive", () => {
    const config = deriveServiceConfig(createWorkflow({ hooks: { timeout_ms: 5000 } }));
    expect(config.workspace.hooks.timeoutMs).toBe(5000);
  });

  it("falls back to 60000 when hook timeout is zero or negative", () => {
    const configZero = deriveServiceConfig(createWorkflow({ hooks: { timeout_ms: 0 } }));
    expect(configZero.workspace.hooks.timeoutMs).toBe(60000);

    const configNeg = deriveServiceConfig(createWorkflow({ hooks: { timeout_ms: -100 } }));
    expect(configNeg.workspace.hooks.timeoutMs).toBe(60000);
  });

  it("defaults workspace strategy to directory", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.workspace.strategy).toBe("directory");
  });

  it("selects worktree strategy when explicitly set", () => {
    const config = deriveServiceConfig(createWorkflow({ workspace: { strategy: "worktree" } }));
    expect(config.workspace.strategy).toBe("worktree");
  });

  it("falls back to directory for unknown strategy values", () => {
    const config = deriveServiceConfig(createWorkflow({ workspace: { strategy: "unknown" } }));
    expect(config.workspace.strategy).toBe("directory");
  });

  it("defaults branchPrefix to symphony/", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.workspace.branchPrefix).toBe("symphony/");
  });

  it("uses configured branchPrefix", () => {
    const config = deriveServiceConfig(createWorkflow({ workspace: { branch_prefix: "feat/" } }));
    expect(config.workspace.branchPrefix).toBe("feat/");
  });

  it("defaults all hooks to null when not configured", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.workspace.hooks.afterCreate).toBe(null);
    expect(config.workspace.hooks.beforeRun).toBe(null);
    expect(config.workspace.hooks.afterRun).toBe(null);
    expect(config.workspace.hooks.beforeRemove).toBe(null);
  });

  it("sets hooks to their configured values when provided", () => {
    const config = deriveServiceConfig(
      createWorkflow({
        hooks: {
          after_create: "echo created",
          before_run: "echo before",
          after_run: "echo after",
          before_remove: "echo remove",
        },
      }),
    );
    expect(config.workspace.hooks.afterCreate).toBe("echo created");
    expect(config.workspace.hooks.beforeRun).toBe("echo before");
    expect(config.workspace.hooks.afterRun).toBe("echo after");
    expect(config.workspace.hooks.beforeRemove).toBe("echo remove");
  });
});

describe("deriveServiceConfig - agent subsection", () => {
  it("defaults agent values", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.agent.maxConcurrentAgents).toBe(10);
    expect(config.agent.maxTurns).toBe(20);
    expect(config.agent.maxRetryBackoffMs).toBe(300000);
    expect(config.agent.maxContinuationAttempts).toBe(5);
    expect(config.agent.stallTimeoutMs).toBe(1200000);
    expect(config.agent.successState).toBe(null);
  });

  it("normalizes maxConcurrentAgentsByState keys to lowercase and trimmed", () => {
    const config = deriveServiceConfig(
      createWorkflow({
        agent: {
          max_concurrent_agents_by_state: {
            "  In Progress  ": 3,
            BACKLOG: 5,
          },
        },
      }),
    );
    expect(config.agent.maxConcurrentAgentsByState).toEqual({
      "in progress": 3,
      backlog: 5,
    });
  });

  it("returns empty maxConcurrentAgentsByState when not configured", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.agent.maxConcurrentAgentsByState).toEqual({});
  });

  it("uses configured successState", () => {
    const config = deriveServiceConfig(createWorkflow({ agent: { success_state: "Done" } }));
    expect(config.agent.successState).toBe("Done");
  });
});

describe("deriveServiceConfig - sandbox security subsection", () => {
  it("defaults security settings", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.codex.sandbox.security.noNewPrivileges).toBe(true);
    expect(config.codex.sandbox.security.dropCapabilities).toBe(true);
    expect(config.codex.sandbox.security.gvisor).toBe(false);
    expect(config.codex.sandbox.security.seccompProfile).toBe("");
  });

  it("uses configured security settings", () => {
    const config = deriveServiceConfig(
      createWorkflow({
        codex: {
          sandbox: {
            security: {
              no_new_privileges: false,
              drop_capabilities: false,
              gvisor: true,
              seccomp_profile: "custom-profile",
            },
          },
        },
      }),
    );
    expect(config.codex.sandbox.security.noNewPrivileges).toBe(false);
    expect(config.codex.sandbox.security.dropCapabilities).toBe(false);
    expect(config.codex.sandbox.security.gvisor).toBe(true);
    expect(config.codex.sandbox.security.seccompProfile).toBe("custom-profile");
  });
});

describe("deriveServiceConfig - sandbox resources subsection", () => {
  it("defaults resource values", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.codex.sandbox.resources.memory).toBe("4g");
    expect(config.codex.sandbox.resources.memoryReservation).toBe("1g");
    expect(config.codex.sandbox.resources.memorySwap).toBe("4g");
    expect(config.codex.sandbox.resources.cpus).toBe("2.0");
    expect(config.codex.sandbox.resources.tmpfsSize).toBe("512m");
  });
});

describe("deriveServiceConfig - sandbox logs subsection", () => {
  it("defaults log values", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.codex.sandbox.logs.driver).toBe("json-file");
    expect(config.codex.sandbox.logs.maxSize).toBe("50m");
    expect(config.codex.sandbox.logs.maxFile).toBe(3);
  });
});

describe("deriveServiceConfig - sandbox container subsection", () => {
  it("defaults image and network", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.codex.sandbox.image).toBe("symphony-codex:latest");
    expect(config.codex.sandbox.network).toBe("");
  });

  it("defaults extraMounts, envPassthrough, egressAllowlist to empty arrays", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.codex.sandbox.extraMounts).toEqual([]);
    expect(config.codex.sandbox.envPassthrough).toEqual([]);
    expect(config.codex.sandbox.egressAllowlist).toEqual([]);
  });
});

describe("deriveServiceConfig - codex subsection", () => {
  it("defaults codex string fields", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.codex.command).toBe("codex app-server");
    expect(config.codex.model).toBe("gpt-5.4");
    expect(config.codex.threadSandbox).toBe("workspace-write");
    expect(config.codex.personality).toBe("friendly");
  });

  it("defaults selfReview to false", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.codex.selfReview).toBe(false);
  });

  it("sets selfReview to true only when codex.self_review is exactly true", () => {
    const configTrue = deriveServiceConfig(createWorkflow({ codex: { self_review: true } }));
    expect(configTrue.codex.selfReview).toBe(true);

    const configFalse = deriveServiceConfig(createWorkflow({ codex: { self_review: false } }));
    expect(configFalse.codex.selfReview).toBe(false);

    const configString = deriveServiceConfig(createWorkflow({ codex: { self_review: "true" } }));
    expect(configString.codex.selfReview).toBe(false);

    const configOne = deriveServiceConfig(createWorkflow({ codex: { self_review: 1 } }));
    expect(configOne.codex.selfReview).toBe(false);
  });

  it("defaults structuredOutput to false", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.codex.structuredOutput).toBe(false);
  });

  it("sets structuredOutput to true when configured", () => {
    const config = deriveServiceConfig(createWorkflow({ codex: { structured_output: true } }));
    expect(config.codex.structuredOutput).toBe(true);
  });

  it("defaults auth.sourceHome to resolved ~/.codex", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    // Should contain "codex" in the resolved path (from ~/.codex default)
    expect(config.codex.auth.sourceHome).toContain("codex");
    expect(config.codex.auth.sourceHome).not.toBe("");
  });

  it("defaults codex timeout values", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.codex.readTimeoutMs).toBe(5000);
    expect(config.codex.turnTimeoutMs).toBe(3600000);
    expect(config.codex.drainTimeoutMs).toBe(2000);
    expect(config.codex.startupTimeoutMs).toBe(30000);
    expect(config.codex.stallTimeoutMs).toBe(300000);
  });

  it("reads readTimeoutMs from agent section as fallback", () => {
    const config = deriveServiceConfig(createWorkflow({ agent: { read_timeout_ms: 9999 } }));
    expect(config.codex.readTimeoutMs).toBe(9999);
  });

  it("reads stallTimeoutMs from agent section as fallback", () => {
    const config = deriveServiceConfig(createWorkflow({ agent: { stall_timeout_ms: 88888 } }));
    expect(config.codex.stallTimeoutMs).toBe(88888);
  });

  it("defaults reasoningEffort to high", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.codex.reasoningEffort).toBe("high");
  });

  it("defaults approvalPolicy to reject object", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    const policy = config.codex.approvalPolicy as Record<string, unknown>;
    expect(policy).toHaveProperty("reject");
  });

  it("defaults provider to null when not configured", () => {
    const config = deriveServiceConfig(createWorkflow({}));
    expect(config.codex.provider).toBe(null);
  });
});
