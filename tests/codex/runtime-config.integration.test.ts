import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildConfigToml,
  formatTomlKey,
  getRequiredProviderEnvNames,
  prepareCodexRuntimeConfig,
  rewriteHostBoundUrl,
} from "../../src/codex/runtime-config.js";
import type { CodexConfig } from "../../src/core/types.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-runtime-config-int-"));
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
    readTimeoutMs: 5_000,
    turnTimeoutMs: 120_000,
    drainTimeoutMs: 2_000,
    startupTimeoutMs: 30_000,
    stallTimeoutMs: 300_000,
    auth: {
      mode: "api_key",
      sourceHome: path.join(os.tmpdir(), "unused-codex-home"),
    },
    provider: null,
    sandbox: {
      image: "risoluto-codex:latest",
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

describe("codex runtime config integration", () => {
  it("formats TOML keys and rewrites host-bound URLs for Docker", () => {
    expect(formatTomlKey("alpha-key_1")).toBe("alpha-key_1");
    expect(formatTomlKey("azure.openai")).toBe('"azure.openai"');
    expect(rewriteHostBoundUrl("http://127.0.0.1:8317/v1")).toBe("http://host.docker.internal:8317/v1");
    expect(rewriteHostBoundUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1");
  });

  it("builds a provider TOML that preserves provider ids and env-key settings", () => {
    const configToml = buildConfigToml(
      baseConfig({
        provider: {
          id: "azure.openai",
          name: "Azure",
          baseUrl: "https://example.com/v1",
          envKey: "AZURE_OPENAI_API_KEY",
          envKeyInstructions: null,
          wireApi: "responses",
          requiresOpenaiAuth: false,
          httpHeaders: {},
          envHttpHeaders: { authorization: "AZURE_OPENAI_API_KEY" },
          queryParams: {},
        },
      }),
    );

    expect(configToml).toContain('model_provider = "azure.openai"');
    expect(configToml).toContain('[model_providers."azure.openai"]');
    expect(configToml).toContain('env_key = "AZURE_OPENAI_API_KEY"');
  });

  it("always writes a provider name for custom providers", () => {
    const configToml = buildConfigToml(
      baseConfig({
        auth: {
          mode: "openai_login",
          sourceHome: "/tmp/codex-home",
        },
        provider: {
          id: "custom-provider",
          name: null,
          baseUrl: "https://example.com/v1",
          envKey: null,
          envKeyInstructions: null,
          wireApi: "responses",
          requiresOpenaiAuth: true,
          httpHeaders: {},
          envHttpHeaders: {},
          queryParams: {},
        },
      }),
    );

    expect(configToml).toContain('name = "custom-provider"');
  });

  it("returns all required provider env names in api_key mode", () => {
    expect(
      getRequiredProviderEnvNames(
        baseConfig({
          provider: {
            id: "custom",
            name: "Custom",
            baseUrl: "https://example.com/v1",
            envKey: "CUSTOM_API_KEY",
            envKeyInstructions: null,
            wireApi: "responses",
            requiresOpenaiAuth: false,
            httpHeaders: {},
            envHttpHeaders: {
              authorization: "CUSTOM_API_KEY",
              "x-tenant": "CUSTOM_TENANT",
            },
            queryParams: {},
          },
        }),
      ).sort(),
    ).toEqual(["CUSTOM_API_KEY", "CUSTOM_TENANT"]);
  });

  it("prepares nested auth.json for openai_login mode and validates PKCE tokens", async () => {
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

    expect(runtimeConfig.configToml).toContain('cli_auth_credentials_store = "file"');
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

  it("throws helpful errors when auth.json is missing or malformed for openai_login", async () => {
    const missingHome = await createTempDir();
    const invalidHome = await createTempDir();
    await writeFile(path.join(invalidHome, "auth.json"), JSON.stringify({ OPENAI_API_KEY: "sk-test" }), "utf8");

    await expect(
      prepareCodexRuntimeConfig(
        baseConfig({
          auth: {
            mode: "openai_login",
            sourceHome: missingHome,
          },
        }),
      ),
    ).rejects.toThrow(`codex auth.json unavailable at ${path.join(missingHome, "auth.json")}`);

    await expect(
      prepareCodexRuntimeConfig(
        baseConfig({
          auth: {
            mode: "openai_login",
            sourceHome: invalidHome,
          },
        }),
      ),
    ).rejects.toThrow("does not contain valid OpenAI PKCE tokens");
  });
});
