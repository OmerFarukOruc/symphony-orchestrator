import { describe, expect, it } from "vitest";

import {
  trackerConfigSchema,
  workspaceConfigSchema,
  agentConfigSchema,
  codexConfigSchema,
  codexProviderSchema,
  sandboxConfigSchema,
  reasoningEffortSchema,
  pollingConfigSchema,
  serverConfigSchema,
  notificationConfigSchema,
  gitHubConfigSchema,
  repoConfigSchema,
  stateMachineConfigSchema,
} from "../../src/config/schemas/index.js";

describe("trackerConfigSchema", () => {
  it("applies defaults for empty input", () => {
    const result = trackerConfigSchema.parse({});
    expect(result.kind).toBe("linear");
    expect(result.endpoint).toBe("https://api.linear.app/graphql");
    expect(result.apiKey).toBe("");
    expect(result.projectSlug).toBe(null);
    expect(result.activeStates).toEqual(["Backlog", "Todo", "In Progress"]);
    expect(result.terminalStates).toContain("Done");
  });

  it("preserves provided values", () => {
    const result = trackerConfigSchema.parse({
      kind: "linear",
      apiKey: "lin_123",
      endpoint: "https://custom.api/graphql",
      projectSlug: "PROJ",
      activeStates: ["Working"],
      terminalStates: ["Shipped"],
    });
    expect(result.apiKey).toBe("lin_123");
    expect(result.projectSlug).toBe("PROJ");
    expect(result.activeStates).toEqual(["Working"]);
    expect(result.terminalStates).toEqual(["Shipped"]);
  });
});

describe("workspaceConfigSchema", () => {
  it("applies defaults for empty input", () => {
    const result = workspaceConfigSchema.parse({});
    expect(result.root).toBe("../symphony-workspaces");
    expect(result.strategy).toBe("directory");
    expect(result.branchPrefix).toBe("symphony/");
    expect(result.hooks.afterCreate).toBe(null);
    expect(result.hooks.timeoutMs).toBe(60000);
  });

  it("clamps non-positive hook timeout to default", () => {
    const result = workspaceConfigSchema.parse({
      hooks: { timeoutMs: -1 },
    });
    expect(result.hooks.timeoutMs).toBe(60000);
  });

  it("catches invalid strategy to directory", () => {
    const result = workspaceConfigSchema.parse({
      strategy: "invalid" as "directory",
    });
    expect(result.strategy).toBe("directory");
  });
});

describe("agentConfigSchema", () => {
  it("applies defaults for empty input", () => {
    const result = agentConfigSchema.parse({});
    expect(result.maxConcurrentAgents).toBe(10);
    expect(result.maxTurns).toBe(20);
    expect(result.maxRetryBackoffMs).toBe(300000);
    expect(result.maxContinuationAttempts).toBe(5);
    expect(result.successState).toBe(null);
    expect(result.stallTimeoutMs).toBe(1200000);
    expect(result.preflightCommands).toEqual([]);
  });

  it("accepts preflightCommands array", () => {
    const result = agentConfigSchema.parse({
      preflightCommands: ["npm test", "npm run lint"],
    });
    expect(result.preflightCommands).toEqual(["npm test", "npm run lint"]);
  });
});

describe("codexConfigSchema", () => {
  it("applies defaults for empty input", () => {
    const result = codexConfigSchema.parse({});
    expect(result.command).toBe("codex app-server");
    expect(result.model).toBe("gpt-5.4");
    expect(result.reasoningEffort).toBe("high");
    expect(result.threadSandbox).toBe("workspace-write");
    expect(result.readTimeoutMs).toBe(5000);
    expect(result.turnTimeoutMs).toBe(3600000);
    expect(result.auth.mode).toBe("api_key");
    expect(result.auth.sourceHome).toBe("~/.codex");
    expect(result.provider).toBe(null);
  });

  it("defaults selfReview to false", () => {
    const result = codexConfigSchema.parse({});
    expect(result.selfReview).toBe(false);
  });

  it("accepts selfReview true", () => {
    const result = codexConfigSchema.parse({ selfReview: true });
    expect(result.selfReview).toBe(true);
  });

  it("defaults personality to friendly", () => {
    const result = codexConfigSchema.parse({});
    expect(result.personality).toBe("friendly");
  });

  it("preserves custom personality value", () => {
    const result = codexConfigSchema.parse({ personality: "concise" });
    expect(result.personality).toBe("concise");
  });

  it("applies default turn sandbox policy for empty input", () => {
    const result = codexConfigSchema.parse({});
    expect(result.turnSandboxPolicy.type).toBe("workspaceWrite");
  });

  it("preserves custom turn sandbox policy", () => {
    const result = codexConfigSchema.parse({
      turnSandboxPolicy: { type: "dangerFullAccess", networkAccess: true },
    });
    expect(result.turnSandboxPolicy.type).toBe("dangerFullAccess");
  });

  it("defaults structuredOutput to false", () => {
    const result = codexConfigSchema.parse({});
    expect(result.structuredOutput).toBe(false);
  });

  it("accepts structuredOutput: true", () => {
    const result = codexConfigSchema.parse({ structuredOutput: true });
    expect(result.structuredOutput).toBe(true);
  });
});

describe("sandboxConfigSchema", () => {
  it("applies defaults for empty input", () => {
    const result = sandboxConfigSchema.parse({});
    expect(result.image).toBe("symphony-codex:latest");
    expect(result.security.noNewPrivileges).toBe(true);
    expect(result.resources.memory).toBe("4g");
    expect(result.logs.driver).toBe("json-file");
    expect(result.extraMounts).toEqual([]);
  });
});

describe("codexProviderSchema", () => {
  it("defaults to null", () => {
    const result = codexProviderSchema.parse(null);
    expect(result).toBe(null);
  });

  it("parses a provider config", () => {
    const result = codexProviderSchema.parse({
      id: "custom",
      baseUrl: "https://api.example.com",
      requiresOpenaiAuth: false,
    });
    expect(result?.id).toBe("custom");
    expect(result?.baseUrl).toBe("https://api.example.com");
    expect(result?.envKey).toBe(null);
  });
});

describe("reasoningEffortSchema", () => {
  it("accepts valid effort levels", () => {
    for (const effort of ["none", "minimal", "low", "medium", "high", "xhigh"] as const) {
      expect(reasoningEffortSchema.parse(effort)).toBe(effort);
    }
  });

  it("catches invalid values to null", () => {
    expect(reasoningEffortSchema.parse("ultra")).toBe(null);
    expect(reasoningEffortSchema.parse(42)).toBe(null);
  });

  it("parses null as null", () => {
    expect(reasoningEffortSchema.parse(null)).toBe(null);
  });
});

describe("pollingConfigSchema", () => {
  it("defaults intervalMs to 15000", () => {
    expect(pollingConfigSchema.parse({}).intervalMs).toBe(15000);
  });
});

describe("serverConfigSchema", () => {
  it("defaults port to 4000", () => {
    expect(serverConfigSchema.parse({}).port).toBe(4000);
  });
});

describe("notificationConfigSchema", () => {
  it("defaults slack to null", () => {
    expect(notificationConfigSchema.parse({}).slack).toBe(null);
  });

  it("parses slack config with webhook url", () => {
    const result = notificationConfigSchema.parse({
      slack: { webhookUrl: "https://hooks.slack.com/xxx", verbosity: "verbose" },
    });
    expect(result.slack?.webhookUrl).toBe("https://hooks.slack.com/xxx");
    expect(result.slack?.verbosity).toBe("verbose");
  });

  it("catches invalid verbosity to critical", () => {
    const result = notificationConfigSchema.parse({
      slack: { webhookUrl: "https://hooks.slack.com/xxx", verbosity: "unknown" },
    });
    expect(result.slack?.verbosity).toBe("critical");
  });
});

describe("gitHubConfigSchema", () => {
  it("defaults to null", () => {
    expect(gitHubConfigSchema.parse(null)).toBe(null);
  });

  it("parses github config with token", () => {
    const result = gitHubConfigSchema.parse({
      token: "ghp_test",
      apiBaseUrl: "https://github.enterprise.com/api",
    });
    expect(result?.token).toBe("ghp_test");
    expect(result?.apiBaseUrl).toBe("https://github.enterprise.com/api");
  });

  it("defaults apiBaseUrl", () => {
    const result = gitHubConfigSchema.parse({ token: "ghp_test" });
    expect(result?.apiBaseUrl).toBe("https://api.github.com");
  });
});

describe("repoConfigSchema", () => {
  it("applies defaults for minimal input", () => {
    const result = repoConfigSchema.parse({ repoUrl: "https://github.com/org/repo" });
    expect(result.defaultBranch).toBe("main");
    expect(result.identifierPrefix).toBe(null);
    expect(result.label).toBe(null);
  });
});

describe("stateMachineConfigSchema", () => {
  it("defaults to null", () => {
    expect(stateMachineConfigSchema.parse(null)).toBe(null);
  });

  it("parses valid stages", () => {
    const result = stateMachineConfigSchema.parse({
      stages: [
        { name: "Backlog", kind: "backlog" },
        { name: "Done", kind: "terminal" },
      ],
      transitions: { Backlog: ["Done"] },
    });
    expect(result?.stages).toHaveLength(2);
    expect(result?.transitions).toEqual({ Backlog: ["Done"] });
  });
});
