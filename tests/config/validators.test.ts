import { describe, expect, it } from "vitest";

import {
  collectDispatchWarnings,
  dispatchTrackerSchema,
  normalizeRepoTarget,
  validateDispatch,
} from "../../src/config/validators.js";
import type { ServiceConfig } from "../../src/core/types.js";

function makeConfig(overrides: Partial<ServiceConfig> = {}): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "lin_api_key",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "PROJ",
      activeStates: ["In Progress"],
      terminalStates: ["Done"],
    },
    codex: {
      command: "codex app-server",
      model: "gpt-4o",
      reasoningEffort: null,
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: { type: "dangerFullAccess" },
      readTimeoutMs: 1000,
      turnTimeoutMs: 10000,
      drainTimeoutMs: 0,
      startupTimeoutMs: 5000,
      stallTimeoutMs: 10000,
      auth: {
        mode: "api_key",
        sourceHome: "/tmp/codex-home",
      },
      provider: null,
      sandbox: {
        image: "codex:latest",
        network: "",
        security: { noNewPrivileges: true, dropCapabilities: true, gvisor: false, seccompProfile: "" },
        resources: { memory: "4g", memoryReservation: "1g", memorySwap: "4g", cpus: "2", tmpfsSize: "512m" },
        extraMounts: [],
        envPassthrough: [],
        logs: { driver: "json-file", maxSize: "50m", maxFile: 3 },
        egressAllowlist: [],
      },
    },
    polling: { intervalMs: 30000 },
    workspace: {
      root: "/tmp/risoluto",
      hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 1000 },
    },
    agent: { maxConcurrentAgents: 1, maxConcurrentAgentsByState: {}, maxTurns: 10, maxRetryBackoffMs: 300000 },
    server: { port: 4000 },
    ...overrides,
  } as unknown as ServiceConfig;
}

const noFile = () => false;
const hasFile = () => true;
const noEnv: NodeJS.ProcessEnv = {};
const withOpenAI: NodeJS.ProcessEnv = { OPENAI_API_KEY: "sk-test" };

describe("validateDispatch - tracker validation", () => {
  it("returns null for a valid config", () => {
    expect(validateDispatch(makeConfig(), { existsSync: noFile, env: withOpenAI })).toBe(null);
  });

  it("returns error for non-linear tracker kind", () => {
    const config = makeConfig({ tracker: { ...makeConfig().tracker, kind: "github" as "linear" } });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error).toEqual({
      code: "invalid_tracker_kind",
      message: 'tracker.kind must be "linear"; received "github"',
    });
  });

  it("returns error when apiKey is empty", () => {
    const config = makeConfig({ tracker: { ...makeConfig().tracker, apiKey: "" } });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error).toEqual({
      code: "missing_tracker_api_key",
      message: "tracker.api_key is required after env resolution",
    });
  });

  it("returns error when endpoint is empty", () => {
    const config = makeConfig({ tracker: { ...makeConfig().tracker, endpoint: "" } });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error).toEqual({
      code: "missing_tracker_endpoint",
      message: "tracker.endpoint is required",
    });
  });

  it("returns error when projectSlug is empty", () => {
    const config = makeConfig({ tracker: { ...makeConfig().tracker, projectSlug: "" } });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error).toEqual({
      code: "missing_tracker_project_slug",
      message: "tracker.project_slug is required when tracker.kind is linear",
    });
  });

  it("returns error when activeStates is empty", () => {
    const config = makeConfig({ tracker: { ...makeConfig().tracker, activeStates: [] } });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error).toEqual({
      code: "invalid_tracker_active_states",
      message: "tracker.active_states must contain at least one state",
    });
  });

  it("returns error when terminalStates is empty", () => {
    const config = makeConfig({ tracker: { ...makeConfig().tracker, terminalStates: [] } });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error).toEqual({
      code: "invalid_tracker_terminal_states",
      message: "tracker.terminal_states must contain at least one state",
    });
  });

  it("treats whitespace-only state lists as invalid after normalization", () => {
    const config = makeConfig({
      tracker: { ...makeConfig().tracker, activeStates: ["   "], terminalStates: ["\n\t"] },
    });

    expect(validateDispatch(config, { existsSync: noFile, env: withOpenAI })).toEqual({
      code: "invalid_tracker_active_states",
      message: "tracker.active_states must contain at least one state",
    });
  });

  it("falls back to a generic tracker config error for malformed tracker payloads", () => {
    const config = makeConfig({ tracker: "broken" as unknown as ServiceConfig["tracker"] });

    expect(validateDispatch(config, { existsSync: noFile, env: withOpenAI })).toEqual({
      code: "invalid_tracker_config",
      message: "tracker.undefined is invalid",
    });
  });

  it("falls back to a generic tracker config error for null tracker payloads", () => {
    const config = makeConfig({ tracker: null as unknown as ServiceConfig["tracker"] });

    expect(validateDispatch(config, { existsSync: noFile, env: withOpenAI })).toEqual({
      code: "invalid_tracker_config",
      message: "tracker.undefined is invalid",
    });
  });
});

describe("validateDispatch - codex auth validation", () => {
  it("returns error when codex command is empty", () => {
    const config = makeConfig({ codex: { ...makeConfig().codex, command: "" } });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error).toEqual({
      code: "missing_codex_command",
      message: "codex.command is required",
    });
  });

  it("returns error for invalid auth mode", () => {
    const config = makeConfig({
      codex: { ...makeConfig().codex, auth: { mode: "invalid" as "api_key", sourceHome: "/tmp" } },
    });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error).toEqual({
      code: "invalid_codex_auth_mode",
      message: "codex.auth.mode must be either api_key or openai_login",
    });
  });

  it("returns error when openai_login missing auth.json", () => {
    const fileExists = (filePath: string) => {
      expect(filePath).toBe("/tmp/codex-home/auth.json");
      return false;
    };
    const config = makeConfig({
      codex: {
        ...makeConfig().codex,
        auth: { mode: "openai_login", sourceHome: "/tmp/codex-home" },
      },
    });
    const error = validateDispatch(config, { existsSync: fileExists, env: noEnv });
    expect(error).toEqual({
      code: "missing_codex_auth_json",
      message: "codex.auth.mode=openai_login requires auth.json at /tmp/codex-home/auth.json",
    });
  });

  it("passes when openai_login auth.json exists", () => {
    const config = makeConfig({
      codex: {
        ...makeConfig().codex,
        auth: { mode: "openai_login", sourceHome: "/tmp/codex-home" },
        provider: { requiresOpenaiAuth: true, baseUrl: "https://api.example.com" },
      },
    });
    const error = validateDispatch(config, { existsSync: hasFile, env: noEnv });
    expect(error).toBe(null);
  });

  it("returns error when turnTimeoutMs is zero", () => {
    const config = makeConfig({ codex: { ...makeConfig().codex, turnTimeoutMs: 0 } });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error).toEqual({
      code: "invalid_turn_timeout_ms",
      message: "codex.turn_timeout_ms must be greater than zero",
    });
  });

  it("returns error when turnTimeoutMs is negative", () => {
    const config = makeConfig({ codex: { ...makeConfig().codex, turnTimeoutMs: -1 } });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error).toEqual({
      code: "invalid_turn_timeout_ms",
      message: "codex.turn_timeout_ms must be greater than zero",
    });
  });
});

describe("validateDispatch - codex provider validation", () => {
  it("returns error when provider configured without baseUrl", () => {
    const config = makeConfig({
      codex: {
        ...makeConfig().codex,
        provider: { id: "custom", baseUrl: null, requiresOpenaiAuth: false },
      },
    });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error).toEqual({
      code: "missing_codex_provider_base_url",
      message: "codex.provider.base_url is required when codex.provider is configured",
    });
  });

  it("returns error when openai_login with provider that lacks requiresOpenaiAuth", () => {
    const config = makeConfig({
      codex: {
        ...makeConfig().codex,
        auth: { mode: "openai_login", sourceHome: "/tmp" },
        provider: { baseUrl: "https://api.example.com", requiresOpenaiAuth: false },
      },
    });
    const error = validateDispatch(config, { existsSync: hasFile, env: noEnv });
    expect(error).toEqual({
      code: "invalid_codex_provider_auth_mode",
      message:
        "codex.provider.requires_openai_auth must be true when codex.auth.mode=openai_login and a custom provider is configured",
    });
  });
});

describe("validateDispatch - API key env validation", () => {
  it("returns error when OPENAI_API_KEY is missing for api_key mode", () => {
    const config = makeConfig();
    const error = validateDispatch(config, { existsSync: noFile, env: noEnv });
    expect(error).toEqual({
      code: "missing_codex_provider_env",
      message: "codex runtime requires OPENAI_API_KEY in the host environment",
    });
  });

  it("passes when OPENAI_API_KEY is set", () => {
    const config = makeConfig();
    const error = validateDispatch(config, { existsSync: noFile, env: { OPENAI_API_KEY: "sk-test" } });
    expect(error).toBe(null);
  });

  it("checks custom envKey from provider instead of OPENAI_API_KEY", () => {
    const config = makeConfig({
      codex: {
        ...makeConfig().codex,
        provider: { baseUrl: "https://api.example.com", envKey: "MY_CUSTOM_KEY", requiresOpenaiAuth: false },
      },
    });
    const error = validateDispatch(config, { existsSync: noFile, env: noEnv });
    expect(error).toEqual({
      code: "missing_codex_provider_env",
      message: "codex runtime requires MY_CUSTOM_KEY in the host environment",
    });
  });

  it("passes when custom envKey is set", () => {
    const config = makeConfig({
      codex: {
        ...makeConfig().codex,
        provider: { baseUrl: "https://api.example.com", envKey: "MY_CUSTOM_KEY", requiresOpenaiAuth: false },
      },
    });
    const error = validateDispatch(config, { existsSync: noFile, env: { MY_CUSTOM_KEY: "secret" } });
    expect(error).toBe(null);
  });

  it("checks envHttpHeaders env vars", () => {
    const config = makeConfig({
      codex: {
        ...makeConfig().codex,
        provider: {
          baseUrl: "https://api.example.com",
          envKey: null,
          envHttpHeaders: { Authorization: "MY_AUTH_TOKEN" },
          requiresOpenaiAuth: false,
        },
      },
    });
    const error = validateDispatch(config, { existsSync: noFile, env: noEnv });
    expect(error).toEqual({
      code: "missing_codex_provider_env",
      message: "codex runtime requires MY_AUTH_TOKEN in the host environment",
    });
  });

  it("does not check env for openai_login mode", () => {
    const config = makeConfig({
      codex: {
        ...makeConfig().codex,
        auth: { mode: "openai_login", sourceHome: "/tmp" },
        provider: { baseUrl: "https://api.example.com", requiresOpenaiAuth: true },
      },
    });
    // file exists but no env vars
    const error = validateDispatch(config, { existsSync: hasFile, env: noEnv });
    expect(error).toBe(null);
  });

  it("passes when both provider envKey and envHttpHeaders are present", () => {
    const config = makeConfig({
      codex: {
        ...makeConfig().codex,
        provider: {
          baseUrl: "https://api.example.com",
          envKey: "MY_CUSTOM_KEY",
          envHttpHeaders: { Authorization: "MY_AUTH_TOKEN" },
          requiresOpenaiAuth: false,
        },
      },
    });

    const error = validateDispatch(config, {
      existsSync: noFile,
      env: { MY_CUSTOM_KEY: "secret", MY_AUTH_TOKEN: "token" },
    });
    expect(error).toBe(null);
  });

  it("does not require OPENAI_API_KEY for openai_login mode when no provider is configured", () => {
    const config = makeConfig({
      codex: {
        ...makeConfig().codex,
        auth: { mode: "openai_login", sourceHome: "/tmp/codex-home" },
        provider: null,
      },
    });

    const error = validateDispatch(config, { existsSync: hasFile, env: noEnv });
    expect(error).toBe(null);
  });
});

describe("collectDispatchWarnings", () => {
  it("returns no warnings when repos are absent", () => {
    expect(collectDispatchWarnings(makeConfig())).toEqual([]);
  });

  it("warns when repoUrl points to risoluto using https format", () => {
    const warnings = collectDispatchWarnings(
      makeConfig({
        repos: [
          {
            repoUrl: " https://github.com/OmerFarukOruc/risoluto.git ",
            defaultBranch: "main",
            identifierPrefix: "NIN",
            label: "Self test",
            githubRepo: null,
          },
        ],
      }),
    );

    expect(warnings).toEqual([
      {
        code: "self_routing_repo",
        message:
          'repo route "NIN" points to risoluto itself. This is fine for self-test traffic, but it will make dispatched agents modify the orchestrator repo instead of the intended target repository.',
      },
    ]);
  });

  it("warns when repoUrl normalizes to risoluto from ssh-style values", () => {
    const warnings = collectDispatchWarnings(
      makeConfig({
        repos: [
          {
            repoUrl: " ssh://git@github.com/risoluto ",
            defaultBranch: "main",
            identifierPrefix: null,
            label: "Risoluto SSH",
            githubRepo: null,
          },
          {
            repoUrl: "git@github.com:risoluto",
            defaultBranch: "main",
            identifierPrefix: null,
            label: null,
            githubRepo: null,
          },
        ],
      }),
    );

    expect(warnings).toEqual([
      {
        code: "self_routing_repo",
        message:
          'repo route "Risoluto SSH" points to risoluto itself. This is fine for self-test traffic, but it will make dispatched agents modify the orchestrator repo instead of the intended target repository.',
      },
      {
        code: "self_routing_repo",
        message:
          'repo route "git@github.com:risoluto" points to risoluto itself. This is fine for self-test traffic, but it will make dispatched agents modify the orchestrator repo instead of the intended target repository.',
      },
    ]);
  });

  it("warns when githubRepo is exactly risoluto", () => {
    const warnings = collectDispatchWarnings(
      makeConfig({
        repos: [
          {
            repoUrl: "https://github.com/example/target.git",
            defaultBranch: "main",
            identifierPrefix: null,
            label: "Bare repo",
            githubRepo: "risoluto",
          },
        ],
      }),
    );

    expect(warnings).toEqual([
      {
        code: "self_routing_repo",
        message:
          'repo route "Bare repo" points to risoluto itself. This is fine for self-test traffic, but it will make dispatched agents modify the orchestrator repo instead of the intended target repository.',
      },
    ]);
  });

  it("ignores non-risoluto repositories", () => {
    const warnings = collectDispatchWarnings(
      makeConfig({
        repos: [
          {
            repoUrl: "https://github.com/example/target.git",
            defaultBranch: "main",
            identifierPrefix: "APP",
            label: "Target app",
            githubRepo: "example/target",
          },
        ],
      }),
    );

    expect(warnings).toEqual([]);
  });

  it("ignores empty repo targets after normalization", () => {
    const warnings = collectDispatchWarnings(
      makeConfig({
        repos: [
          {
            repoUrl: "",
            defaultBranch: "main",
            identifierPrefix: "APP",
            label: "Blank",
            githubRepo: undefined,
          },
        ],
      }),
    );

    expect(warnings).toEqual([]);
  });
});

describe("dispatchTrackerSchema", () => {
  it("requires linear kind and non-empty dispatch fields", () => {
    const valid = dispatchTrackerSchema.safeParse(makeConfig().tracker);
    expect(valid).toEqual({
      success: true,
      data: {
        kind: "linear",
        apiKey: "lin_api_key",
        endpoint: "https://api.linear.app/graphql",
        projectSlug: "PROJ",
      },
    });

    const emptyApiKey = dispatchTrackerSchema.safeParse({ ...makeConfig().tracker, apiKey: "" });
    expect(emptyApiKey).toEqual({
      success: false,
      error: { issues: [{ path: ["apiKey"] }] },
    });

    const emptyEndpoint = dispatchTrackerSchema.safeParse({ ...makeConfig().tracker, endpoint: "" });
    expect(emptyEndpoint).toEqual({
      success: false,
      error: { issues: [{ path: ["endpoint"] }] },
    });

    const emptyProjectSlug = dispatchTrackerSchema.safeParse({ ...makeConfig().tracker, projectSlug: "" });
    expect(emptyProjectSlug).toEqual({
      success: false,
      error: { issues: [{ path: ["projectSlug"] }] },
    });

    const wrongKind = dispatchTrackerSchema.safeParse({ ...makeConfig().tracker, kind: "github" });
    expect(wrongKind).toEqual({
      success: false,
      error: { issues: [{ path: ["kind"] }] },
    });
  });
});

describe("normalizeRepoTarget", () => {
  it("returns an empty string for blankish values", () => {
    expect(normalizeRepoTarget(undefined)).toBe("");
    expect(normalizeRepoTarget(null)).toBe("");
    expect(normalizeRepoTarget("")).toBe("");
  });

  it("trims, lowercases, strips .git, and normalizes github ssh formats", () => {
    expect(normalizeRepoTarget("  HTTPS://GitHub.com/OmerFarukOruc/Risoluto.git  ")).toBe(
      "https://github.com/omerfarukoruc/risoluto",
    );
    expect(normalizeRepoTarget("git@github.com:Owner/Repo.git")).toBe("https://github.com/owner/repo");
    expect(normalizeRepoTarget("ssh://git@github.com/Owner/Repo.git")).toBe("https://github.com/owner/repo");
  });

  it("only strips a trailing .git suffix and only rewrites github ssh prefixes at the start", () => {
    expect(normalizeRepoTarget("https://example.com/org.git/repo")).toBe("https://example.com/org.git/repo");
    expect(normalizeRepoTarget("https://mirror.local/git@github.com:Owner/Repo")).toBe(
      "https://mirror.local/git@github.com:owner/repo",
    );
    expect(normalizeRepoTarget("https://mirror.local/ssh://git@github.com/Owner/Repo")).toBe(
      "https://mirror.local/ssh://git@github.com/owner/repo",
    );
  });
});
