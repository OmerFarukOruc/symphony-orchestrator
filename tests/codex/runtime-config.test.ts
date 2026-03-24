import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildConfigToml,
  getRequiredProviderEnvNames,
  prepareCodexRuntimeConfig,
} from "../../src/codex/runtime-config.js";
import type { CodexConfig } from "../../src/core/types.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-runtime-config-test-"));
  tempDirs.push(dir);
  return dir;
}

function baseConfig(overrides?: Partial<CodexConfig>): CodexConfig {
  return {
    command: "codex app-server",
    model: "gpt-5.4",
    reasoningEffort: "high",
    approvalPolicy: "never",
    threadSandbox: "danger-full-access",
    turnSandboxPolicy: { type: "dangerFullAccess" },
    readTimeoutMs: 5000,
    turnTimeoutMs: 120000,
    drainTimeoutMs: 2000,
    startupTimeoutMs: 30000,
    stallTimeoutMs: 300000,
    auth: {
      mode: "api_key",
      sourceHome: path.join(os.tmpdir(), "unused-codex-home"),
    },
    provider: null,
    sandbox: {
      image: "symphony-codex:latest",
      network: "",
      security: { noNewPrivileges: true, dropCapabilities: true, gvisor: false, seccompProfile: "" },
      resources: {
        memory: "4g",
        memoryReservation: "1g",
        memorySwap: "4g",
        cpus: "2.0",
        tmpfsSize: "512m",
      },
      extraMounts: [],
      envPassthrough: [],
      logs: { driver: "json-file", maxSize: "50m", maxFile: 3 },
      egressAllowlist: [],
    },
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("buildConfigToml", () => {
  it("generates an env-key based OpenAI provider config by default", () => {
    const configToml = buildConfigToml(baseConfig());

    expect(configToml).toContain('model_provider = "symphony_openai_api"');
    expect(configToml).toContain('base_url = "https://api.openai.com/v1"');
    expect(configToml).toContain('env_key = "OPENAI_API_KEY"');
  });

  it("rewrites host-bound provider URLs for Docker", () => {
    const configToml = buildConfigToml(
      baseConfig({
        auth: {
          mode: "openai_login",
          sourceHome: "/tmp/test-home",
        },
        provider: {
          id: "cliproxyapi",
          name: "CLIProxyAPI",
          baseUrl: "http://127.0.0.1:8317/v1",
          envKey: null,
          envKeyInstructions: null,
          wireApi: "responses",
          requiresOpenaiAuth: false,
          httpHeaders: {},
          envHttpHeaders: {},
          queryParams: {},
        },
      }),
    );

    expect(configToml).toContain('base_url = "http://host.docker.internal:8317/v1"');
    expect(configToml).toContain("requires_openai_auth = true");
    expect(configToml).toContain('cli_auth_credentials_store = "file"');
  });
});

describe("prepareCodexRuntimeConfig", () => {
  it("reads auth.json for openai_login mode without creating a host runtime home", async () => {
    const sourceHome = await createTempDir();
    await writeFile(path.join(sourceHome, "auth.json"), '{"OPENAI_API_KEY":"token"}\n', "utf8");

    const runtimeConfig = await prepareCodexRuntimeConfig(
      baseConfig({
        auth: {
          mode: "openai_login",
          sourceHome,
        },
      }),
    );

    expect(runtimeConfig.configToml).toContain('cli_auth_credentials_store = "file"');
    expect(runtimeConfig.authJsonBase64).toBeTruthy();
  });

  it("normalizes legacy flat auth.json into Codex CLI's nested token format", async () => {
    const sourceHome = await createTempDir();
    await writeFile(
      path.join(sourceHome, "auth.json"),
      JSON.stringify({
        access_token: "access-token",
        refresh_token: "refresh-token",
        id_token: "id-token",
        account_id: "account-id",
        email: "user@example.com",
      }),
      "utf8",
    );

    const runtimeConfig = await prepareCodexRuntimeConfig(
      baseConfig({
        auth: {
          mode: "openai_login",
          sourceHome,
        },
      }),
    );

    const authJson = Buffer.from(runtimeConfig.authJsonBase64 ?? "", "base64").toString("utf8");
    expect(JSON.parse(authJson)).toEqual({
      email: "user@example.com",
      auth_mode: "chatgpt",
      last_refresh: expect.any(String),
      tokens: {
        access_token: "access-token",
        refresh_token: "refresh-token",
        id_token: "id-token",
        account_id: "account-id",
      },
    });
  });

  it("throws a controlled error when auth.json becomes unavailable", async () => {
    const sourceHome = await createTempDir();

    await expect(
      prepareCodexRuntimeConfig(
        baseConfig({
          auth: {
            mode: "openai_login",
            sourceHome,
          },
        }),
      ),
    ).rejects.toThrow(`codex auth.json unavailable at ${path.join(sourceHome, "auth.json")}`);
  });
});

describe("getRequiredProviderEnvNames", () => {
  it("returns provider env vars for api_key mode", () => {
    const config = baseConfig({
      provider: {
        id: "azure",
        name: "Azure",
        baseUrl: "https://example.com/v1",
        envKey: "AZURE_OPENAI_API_KEY",
        envKeyInstructions: null,
        wireApi: "responses",
        requiresOpenaiAuth: false,
        httpHeaders: {},
        envHttpHeaders: {
          "api-key": "AZURE_OPENAI_API_KEY",
          "x-tenant": "AZURE_TENANT_ID",
        },
        queryParams: {},
      },
    });

    expect(getRequiredProviderEnvNames(config).sort()).toEqual(["AZURE_OPENAI_API_KEY", "AZURE_TENANT_ID"]);
  });
});
