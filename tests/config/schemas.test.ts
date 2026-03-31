import { describe, expect, it } from "vitest";

import {
  trackerConfigSchema,
  workspaceConfigSchema,
  agentConfigSchema,
  codexConfigSchema,
  codexProviderSchema,
  codexAuthModeValues,
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

  it("defaults owner and repo to empty strings", () => {
    const result = trackerConfigSchema.parse({});
    expect(result.owner).toBe("");
    expect(result.repo).toBe("");
  });

  it("preserves custom owner and repo", () => {
    const result = trackerConfigSchema.parse({ owner: "my-org", repo: "my-repo" });
    expect(result.owner).toBe("my-org");
    expect(result.repo).toBe("my-repo");
  });
});

describe("workspaceConfigSchema", () => {
  it("applies defaults for empty input", () => {
    const result = workspaceConfigSchema.parse({});
    expect(result.root).toBe("../risoluto-workspaces");
    expect(result.strategy).toBe("directory");
    expect(result.branchPrefix).toBe("risoluto/");
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

  it("accepts worktree strategy", () => {
    const result = workspaceConfigSchema.parse({ strategy: "worktree" });
    expect(result.strategy).toBe("worktree");
  });

  it("defaults all hook slots to null", () => {
    const result = workspaceConfigSchema.parse({});
    expect(result.hooks.beforeRun).toBe(null);
    expect(result.hooks.afterRun).toBe(null);
    expect(result.hooks.beforeRemove).toBe(null);
  });

  it("preserves custom hook commands", () => {
    const result = workspaceConfigSchema.parse({
      hooks: {
        afterCreate: "npm install",
        beforeRun: "npm run build",
        afterRun: "npm run clean",
        beforeRemove: "git stash",
        timeoutMs: 30000,
      },
    });
    expect(result.hooks.afterCreate).toBe("npm install");
    expect(result.hooks.beforeRun).toBe("npm run build");
    expect(result.hooks.afterRun).toBe("npm run clean");
    expect(result.hooks.beforeRemove).toBe("git stash");
    expect(result.hooks.timeoutMs).toBe(30000);
  });

  it("clamps zero hook timeout to default", () => {
    const result = workspaceConfigSchema.parse({ hooks: { timeoutMs: 0 } });
    expect(result.hooks.timeoutMs).toBe(60000);
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

  it("defaults maxConcurrentAgentsByState to empty record", () => {
    const result = agentConfigSchema.parse({});
    expect(result.maxConcurrentAgentsByState).toEqual({});
  });

  it("preserves maxConcurrentAgentsByState entries", () => {
    const result = agentConfigSchema.parse({
      maxConcurrentAgentsByState: { "In Progress": 3, Backlog: 1 },
    });
    expect(result.maxConcurrentAgentsByState).toEqual({ "In Progress": 3, Backlog: 1 });
  });

  it("preserves custom successState", () => {
    const result = agentConfigSchema.parse({ successState: "Deployed" });
    expect(result.successState).toBe("Deployed");
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

  it("defaults drainTimeoutMs, startupTimeoutMs, and stallTimeoutMs", () => {
    const result = codexConfigSchema.parse({});
    expect(result.drainTimeoutMs).toBe(2000);
    expect(result.startupTimeoutMs).toBe(30000);
    expect(result.stallTimeoutMs).toBe(300000);
  });

  it("applies default approvalPolicy with reject rules", () => {
    const result = codexConfigSchema.parse({});
    expect(result.approvalPolicy).toEqual({
      reject: {
        sandbox_approval: true,
        rules: true,
        mcp_elicitations: true,
      },
    });
  });

  it("accepts string approvalPolicy", () => {
    const result = codexConfigSchema.parse({ approvalPolicy: "auto-edit" });
    expect(result.approvalPolicy).toBe("auto-edit");
  });

  it("accepts custom object approvalPolicy", () => {
    const result = codexConfigSchema.parse({
      approvalPolicy: { reject: { sandbox_approval: false } },
    });
    expect(result.approvalPolicy).toEqual({ reject: { sandbox_approval: false } });
  });

  it("populates turnSandboxPolicy default fields", () => {
    const result = codexConfigSchema.parse({});
    expect(result.turnSandboxPolicy).toEqual({
      type: "workspaceWrite",
      writableRoots: [],
      networkAccess: false,
      readOnlyAccess: { type: "fullAccess" },
    });
  });

  it("spreads non-string type through turnSandboxPolicy", () => {
    const result = codexConfigSchema.parse({
      turnSandboxPolicy: { type: 123, networkAccess: true },
    });
    // spread overwrites the computed fallback, so the raw value comes through
    expect(result.turnSandboxPolicy.type).toBe(123);
    expect(result.turnSandboxPolicy.networkAccess).toBe(true);
  });

  it("preserves extra fields in turnSandboxPolicy", () => {
    const result = codexConfigSchema.parse({
      turnSandboxPolicy: {
        type: "customSandbox",
        writableRoots: ["/tmp"],
        networkAccess: true,
        customField: "value",
      },
    });
    expect(result.turnSandboxPolicy.type).toBe("customSandbox");
    expect(result.turnSandboxPolicy.writableRoots).toEqual(["/tmp"]);
    expect(result.turnSandboxPolicy.customField).toBe("value");
  });

  it("defaults nested sandbox config within codex", () => {
    const result = codexConfigSchema.parse({});
    expect(result.sandbox.image).toBe("risoluto-codex:latest");
    expect(result.sandbox.security.noNewPrivileges).toBe(true);
    expect(result.sandbox.resources.memory).toBe("4g");
  });

  it("preserves custom auth mode", () => {
    const result = codexConfigSchema.parse({ auth: { mode: "openai_login" } });
    expect(result.auth.mode).toBe("openai_login");
    expect(result.auth.sourceHome).toBe("~/.codex");
  });

  it("catches invalid auth mode to api_key", () => {
    const result = codexConfigSchema.parse({
      auth: { mode: "invalid_mode" as "api_key" },
    });
    expect(result.auth.mode).toBe("api_key");
  });
});

describe("sandboxConfigSchema", () => {
  it("applies defaults for empty input", () => {
    const result = sandboxConfigSchema.parse({});
    expect(result.image).toBe("risoluto-codex:latest");
    expect(result.security.noNewPrivileges).toBe(true);
    expect(result.resources.memory).toBe("4g");
    expect(result.logs.driver).toBe("json-file");
    expect(result.extraMounts).toEqual([]);
  });

  it("defaults all security sub-fields", () => {
    const result = sandboxConfigSchema.parse({});
    expect(result.security.dropCapabilities).toBe(true);
    expect(result.security.gvisor).toBe(false);
    expect(result.security.seccompProfile).toBe("");
  });

  it("defaults all resource sub-fields", () => {
    const result = sandboxConfigSchema.parse({});
    expect(result.resources.memoryReservation).toBe("1g");
    expect(result.resources.memorySwap).toBe("4g");
    expect(result.resources.cpus).toBe("2.0");
    expect(result.resources.tmpfsSize).toBe("512m");
  });

  it("defaults all logs sub-fields", () => {
    const result = sandboxConfigSchema.parse({});
    expect(result.logs.maxSize).toBe("50m");
    expect(result.logs.maxFile).toBe(3);
  });

  it("defaults network, envPassthrough, and egressAllowlist", () => {
    const result = sandboxConfigSchema.parse({});
    expect(result.network).toBe("");
    expect(result.envPassthrough).toEqual([]);
    expect(result.egressAllowlist).toEqual([]);
  });

  it("preserves custom security overrides", () => {
    const result = sandboxConfigSchema.parse({
      security: { gvisor: true, seccompProfile: "runtime/default" },
    });
    expect(result.security.gvisor).toBe(true);
    expect(result.security.seccompProfile).toBe("runtime/default");
    expect(result.security.noNewPrivileges).toBe(true);
    expect(result.security.dropCapabilities).toBe(true);
  });

  it("preserves custom resource overrides", () => {
    const result = sandboxConfigSchema.parse({
      resources: { memory: "8g", cpus: "4.0" },
    });
    expect(result.resources.memory).toBe("8g");
    expect(result.resources.cpus).toBe("4.0");
    expect(result.resources.memoryReservation).toBe("1g");
  });

  it("preserves envPassthrough and egressAllowlist arrays", () => {
    const result = sandboxConfigSchema.parse({
      envPassthrough: ["HOME", "PATH"],
      egressAllowlist: ["api.github.com", "registry.npmjs.org"],
    });
    expect(result.envPassthrough).toEqual(["HOME", "PATH"]);
    expect(result.egressAllowlist).toEqual(["api.github.com", "registry.npmjs.org"]);
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

  it("defaults all nullable fields to null", () => {
    const result = codexProviderSchema.parse({});
    expect(result?.id).toBe(null);
    expect(result?.name).toBe(null);
    expect(result?.baseUrl).toBe(null);
    expect(result?.envKey).toBe(null);
    expect(result?.envKeyInstructions).toBe(null);
    expect(result?.wireApi).toBe(null);
  });

  it("defaults map fields to empty objects", () => {
    const result = codexProviderSchema.parse({});
    expect(result?.httpHeaders).toEqual({});
    expect(result?.envHttpHeaders).toEqual({});
    expect(result?.queryParams).toEqual({});
  });

  it("defaults requiresOpenaiAuth to false", () => {
    const result = codexProviderSchema.parse({});
    expect(result?.requiresOpenaiAuth).toBe(false);
  });

  it("preserves custom map fields", () => {
    const result = codexProviderSchema.parse({
      httpHeaders: { Authorization: "Bearer tok" },
      envHttpHeaders: { "X-Api-Key": "MY_KEY_ENV" },
      queryParams: { version: "v2" },
    });
    expect(result?.httpHeaders).toEqual({ Authorization: "Bearer tok" });
    expect(result?.envHttpHeaders).toEqual({ "X-Api-Key": "MY_KEY_ENV" });
    expect(result?.queryParams).toEqual({ version: "v2" });
  });

  it("preserves full provider config with all fields", () => {
    const result = codexProviderSchema.parse({
      id: "azure",
      name: "Azure OpenAI",
      baseUrl: "https://my-resource.openai.azure.com",
      envKey: "AZURE_OPENAI_KEY",
      envKeyInstructions: "Set via portal",
      wireApi: "openai",
      requiresOpenaiAuth: true,
    });
    expect(result?.id).toBe("azure");
    expect(result?.name).toBe("Azure OpenAI");
    expect(result?.wireApi).toBe("openai");
    expect(result?.requiresOpenaiAuth).toBe(true);
    expect(result?.envKeyInstructions).toBe("Set via portal");
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

  it("preserves custom intervalMs", () => {
    expect(pollingConfigSchema.parse({ intervalMs: 5000 }).intervalMs).toBe(5000);
  });
});

describe("serverConfigSchema", () => {
  it("defaults port to 4000", () => {
    expect(serverConfigSchema.parse({}).port).toBe(4000);
  });

  it("preserves custom port", () => {
    expect(serverConfigSchema.parse({ port: 8080 }).port).toBe(8080);
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

  it("defaults slack verbosity to critical when omitted", () => {
    const result = notificationConfigSchema.parse({
      slack: { webhookUrl: "https://hooks.slack.com/xxx" },
    });
    expect(result.slack?.verbosity).toBe("critical");
  });

  it("accepts off verbosity", () => {
    const result = notificationConfigSchema.parse({
      slack: { webhookUrl: "https://hooks.slack.com/xxx", verbosity: "off" },
    });
    expect(result.slack?.verbosity).toBe("off");
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

  it("defaults GitHub-specific nullable fields to null", () => {
    const result = repoConfigSchema.parse({ repoUrl: "https://github.com/org/repo" });
    expect(result.githubOwner).toBe(null);
    expect(result.githubRepo).toBe(null);
    expect(result.githubTokenEnv).toBe(null);
  });

  it("preserves all provided repo fields", () => {
    const result = repoConfigSchema.parse({
      repoUrl: "https://github.com/acme/widget",
      defaultBranch: "develop",
      identifierPrefix: "WID",
      label: "widget-repo",
      githubOwner: "acme",
      githubRepo: "widget",
      githubTokenEnv: "GH_TOKEN",
    });
    expect(result.repoUrl).toBe("https://github.com/acme/widget");
    expect(result.defaultBranch).toBe("develop");
    expect(result.identifierPrefix).toBe("WID");
    expect(result.label).toBe("widget-repo");
    expect(result.githubOwner).toBe("acme");
    expect(result.githubRepo).toBe("widget");
    expect(result.githubTokenEnv).toBe("GH_TOKEN");
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

  it("defaults stages and transitions to empty when object provided", () => {
    const result = stateMachineConfigSchema.parse({});
    expect(result?.stages).toEqual([]);
    expect(result?.transitions).toEqual({});
  });

  it("accepts all stage kind values", () => {
    const kinds = ["backlog", "todo", "active", "gate", "terminal"] as const;
    const stages = kinds.map((kind, index) => ({ name: `Stage${String(index)}`, kind }));
    const result = stateMachineConfigSchema.parse({ stages });
    expect(result?.stages).toHaveLength(5);
    for (const [index, kind] of kinds.entries()) {
      expect(result?.stages[index]?.kind).toBe(kind);
    }
  });

  it("rejects empty stage name", () => {
    expect(() =>
      stateMachineConfigSchema.parse({
        stages: [{ name: "", kind: "backlog" }],
      }),
    ).toThrow();
  });

  it("rejects invalid stage kind", () => {
    expect(() =>
      stateMachineConfigSchema.parse({
        stages: [{ name: "Broken", kind: "invalid" }],
      }),
    ).toThrow();
  });

  it("parses multi-target transitions", () => {
    const result = stateMachineConfigSchema.parse({
      stages: [
        { name: "Backlog", kind: "backlog" },
        { name: "Active", kind: "active" },
        { name: "Review", kind: "gate" },
        { name: "Done", kind: "terminal" },
      ],
      transitions: {
        Backlog: ["Active"],
        Active: ["Review", "Done"],
        Review: ["Active", "Done"],
      },
    });
    expect(result?.transitions.Active).toEqual(["Review", "Done"]);
    expect(result?.transitions.Review).toEqual(["Active", "Done"]);
  });
});

describe("codexAuthModeValues", () => {
  it("accepts api_key", () => {
    expect(codexAuthModeValues.parse("api_key")).toBe("api_key");
  });

  it("accepts openai_login", () => {
    expect(codexAuthModeValues.parse("openai_login")).toBe("openai_login");
  });

  it("rejects unknown auth mode", () => {
    expect(() => codexAuthModeValues.parse("oauth2")).toThrow();
  });
});
