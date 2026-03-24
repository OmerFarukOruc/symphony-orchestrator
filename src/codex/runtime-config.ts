import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";

import type { CodexConfig, CodexProviderConfig } from "../core/types.js";
import { normalizeCodexAuthJson } from "./auth-file.js";
import { isTokenExpired, refreshAccessToken } from "./token-refresh.js";

const DIRECT_OPENAI_PROVIDER_ID = "symphony_openai_api";
const DIRECT_OPENAI_BASE_URL = "https://api.openai.com/v1";

interface PreparedCodexRuntimeConfig {
  configToml: string;
  authJsonBase64: string | null;
}

function formatTomlString(value: string): string {
  return JSON.stringify(value);
}

function formatTomlKey(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : formatTomlString(value);
}

function rewriteHostBoundUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
      parsed.hostname = "host.docker.internal";
    }
    return parsed.toString();
  } catch {
    return value.replaceAll(/:\/\/(127\.0\.0\.1|localhost)(?=[:/]|$)/g, "://host.docker.internal");
  }
}

function effectiveProvider(config: CodexConfig): CodexProviderConfig | null {
  if (config.provider) {
    return {
      ...config.provider,
      wireApi: config.provider.wireApi ?? "responses",
      requiresOpenaiAuth: config.auth.mode === "openai_login" ? true : config.provider.requiresOpenaiAuth,
      envKey: config.auth.mode === "api_key" ? (config.provider.envKey ?? "OPENAI_API_KEY") : null,
      baseUrl: config.provider.baseUrl ? rewriteHostBoundUrl(config.provider.baseUrl) : null,
    };
  }

  if (config.auth.mode === "api_key") {
    return {
      id: DIRECT_OPENAI_PROVIDER_ID,
      name: "OpenAI",
      baseUrl: DIRECT_OPENAI_BASE_URL,
      envKey: "OPENAI_API_KEY",
      envKeyInstructions: null,
      wireApi: "responses",
      requiresOpenaiAuth: false,
      httpHeaders: {},
      envHttpHeaders: {},
      queryParams: {},
    };
  }

  return null;
}

function providerIdFor(provider: CodexProviderConfig): string {
  return provider.id || (provider.requiresOpenaiAuth ? "symphony_openai_auth" : "symphony_custom_provider");
}

function appendStringMap(lines: string[], tableName: string, values: Record<string, string>): void {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return;
  }

  lines.push("", tableName);
  for (const [key, value] of entries) {
    lines.push(`${formatTomlKey(key)} = ${formatTomlString(value)}`);
  }
}

function appendProviderFields(lines: string[], provider: CodexProviderConfig, providerId: string): void {
  if (provider.name) {
    lines.push(`name = ${formatTomlString(provider.name)}`);
  }
  if (provider.baseUrl) {
    lines.push(`base_url = ${formatTomlString(provider.baseUrl)}`);
  }
  if (provider.envKey) {
    lines.push(`env_key = ${formatTomlString(provider.envKey)}`);
  }
  if (provider.envKeyInstructions) {
    lines.push(`env_key_instructions = ${formatTomlString(provider.envKeyInstructions)}`);
  }
  if (provider.wireApi) {
    lines.push(`wire_api = ${formatTomlString(provider.wireApi)}`);
  }
  if (provider.requiresOpenaiAuth) {
    lines.push("requires_openai_auth = true");
  }
  appendStringMap(lines, `[model_providers.${formatTomlKey(providerId)}.http_headers]`, provider.httpHeaders);
  appendStringMap(lines, `[model_providers.${formatTomlKey(providerId)}.env_http_headers]`, provider.envHttpHeaders);
  appendStringMap(lines, `[model_providers.${formatTomlKey(providerId)}.query_params]`, provider.queryParams);
}

export function buildConfigToml(config: CodexConfig): string {
  const provider = effectiveProvider(config);
  const lines = [`model = ${formatTomlString(config.model)}`];

  if (config.reasoningEffort) {
    lines.push(`model_reasoning_effort = ${formatTomlString(config.reasoningEffort)}`);
  }

  if (config.auth.mode === "openai_login") {
    lines.push('cli_auth_credentials_store = "file"');
  }

  if (provider) {
    const providerId = providerIdFor(provider);
    lines.push(
      `model_provider = ${formatTomlString(providerId)}`,
      "",
      `[model_providers.${formatTomlKey(providerId)}]`,
    );
    appendProviderFields(lines, provider, providerId);
  } else {
    lines.push('model_provider = "openai"');
  }

  return `${lines.join("\n")}\n`;
}

export function getRequiredProviderEnvNames(config: CodexConfig): string[] {
  if (config.auth.mode !== "api_key") {
    return [];
  }

  const provider = effectiveProvider(config);
  const names = new Set<string>();
  if (provider?.envKey) {
    names.add(provider.envKey);
  }
  for (const envName of Object.values(provider?.envHttpHeaders ?? {})) {
    names.add(envName);
  }
  return [...names];
}

export async function prepareCodexRuntimeConfig(config: CodexConfig): Promise<PreparedCodexRuntimeConfig> {
  const authJsonPath = `${config.auth.sourceHome}/auth.json`;
  let authJsonBase64: string | null = null;

  if (config.auth.mode === "openai_login") {
    let authJson = await readAuthJson(authJsonPath);
    if (isTokenExpired(authJson)) {
      authJson = await refreshAccessToken(authJsonPath);
    }
    authJson = normalizeCodexAuthJson(authJson);
    authJsonBase64 = Buffer.from(authJson, "utf8").toString("base64");
  }

  return {
    configToml: buildConfigToml(config),
    authJsonBase64,
  };
}

async function readAuthJson(authJsonPath: string): Promise<string> {
  try {
    return await readFile(authJsonPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`codex auth.json unavailable at ${authJsonPath}: ${message}`, { cause: error });
  }
}
