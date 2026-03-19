import { describe, expect, it } from "vitest";

import { validateDispatch } from "../../src/config/validators.js";
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
      root: "/tmp/symphony",
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
    expect(error?.code).toBe("invalid_tracker_kind");
  });

  it("returns error when apiKey is empty", () => {
    const config = makeConfig({ tracker: { ...makeConfig().tracker, apiKey: "" } });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error?.code).toBe("missing_tracker_api_key");
  });

  it("returns error when endpoint is empty", () => {
    const config = makeConfig({ tracker: { ...makeConfig().tracker, endpoint: "" } });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error?.code).toBe("missing_tracker_endpoint");
  });

  it("returns error when projectSlug is empty", () => {
    const config = makeConfig({ tracker: { ...makeConfig().tracker, projectSlug: "" } });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error?.code).toBe("missing_tracker_project_slug");
  });

  it("returns error when activeStates is empty", () => {
    const config = makeConfig({ tracker: { ...makeConfig().tracker, activeStates: [] } });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error?.code).toBe("invalid_tracker_active_states");
  });

  it("returns error when terminalStates is empty", () => {
    const config = makeConfig({ tracker: { ...makeConfig().tracker, terminalStates: [] } });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error?.code).toBe("invalid_tracker_terminal_states");
  });
});

describe("validateDispatch - codex auth validation", () => {
  it("returns error when codex command is empty", () => {
    const config = makeConfig({ codex: { ...makeConfig().codex, command: "" } });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error?.code).toBe("missing_codex_command");
  });

  it("returns error for invalid auth mode", () => {
    const config = makeConfig({
      codex: { ...makeConfig().codex, auth: { mode: "invalid" as "api_key", sourceHome: "/tmp" } },
    });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error?.code).toBe("invalid_codex_auth_mode");
  });

  it("returns error when openai_login missing auth.json", () => {
    const config = makeConfig({
      codex: {
        ...makeConfig().codex,
        auth: { mode: "openai_login", sourceHome: "/tmp/codex-home" },
      },
    });
    const error = validateDispatch(config, { existsSync: noFile, env: noEnv });
    expect(error?.code).toBe("missing_codex_auth_json");
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
    expect(error?.code).toBe("invalid_turn_timeout_ms");
  });

  it("returns error when turnTimeoutMs is negative", () => {
    const config = makeConfig({ codex: { ...makeConfig().codex, turnTimeoutMs: -1 } });
    const error = validateDispatch(config, { existsSync: noFile, env: withOpenAI });
    expect(error?.code).toBe("invalid_turn_timeout_ms");
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
    expect(error?.code).toBe("missing_codex_provider_base_url");
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
    expect(error?.code).toBe("invalid_codex_provider_auth_mode");
  });
});

describe("validateDispatch - API key env validation", () => {
  it("returns error when OPENAI_API_KEY is missing for api_key mode", () => {
    const config = makeConfig();
    const error = validateDispatch(config, { existsSync: noFile, env: noEnv });
    expect(error?.code).toBe("missing_codex_provider_env");
    expect(error?.message).toContain("OPENAI_API_KEY");
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
    expect(error?.code).toBe("missing_codex_provider_env");
    expect(error?.message).toContain("MY_CUSTOM_KEY");
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
    expect(error?.code).toBe("missing_codex_provider_env");
    expect(error?.message).toContain("MY_AUTH_TOKEN");
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
});
