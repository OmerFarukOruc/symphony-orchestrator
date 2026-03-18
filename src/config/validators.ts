import { existsSync } from "node:fs";
import path from "node:path";

import { normalizeStateList } from "../state/policy.js";
import type { ServiceConfig, ValidationError } from "../core/types.js";

function validateTrackerConfig(config: ServiceConfig): ValidationError | null {
  if (config.tracker.kind !== "linear") {
    return {
      code: "invalid_tracker_kind",
      message: `tracker.kind must be "linear"; received ${JSON.stringify(config.tracker.kind)}`,
    };
  }
  if (!config.tracker.apiKey) {
    return { code: "missing_tracker_api_key", message: "tracker.api_key is required after env resolution" };
  }
  if (!config.tracker.endpoint) {
    return { code: "missing_tracker_endpoint", message: "tracker.endpoint is required" };
  }
  if (config.tracker.kind === "linear" && !config.tracker.projectSlug) {
    return {
      code: "missing_tracker_project_slug",
      message: "tracker.project_slug is required when tracker.kind is linear",
    };
  }
  if (normalizeStateList(config.tracker.activeStates).length === 0) {
    return { code: "invalid_tracker_active_states", message: "tracker.active_states must contain at least one state" };
  }
  if (normalizeStateList(config.tracker.terminalStates).length === 0) {
    return {
      code: "invalid_tracker_terminal_states",
      message: "tracker.terminal_states must contain at least one state",
    };
  }
  return null;
}

function validateCodexAuthConfig(
  config: ServiceConfig,
  fileExists: (filePath: string) => boolean,
): ValidationError | null {
  if (!config.codex.command) {
    return { code: "missing_codex_command", message: "codex.command is required" };
  }
  if (!["api_key", "openai_login"].includes(config.codex.auth.mode)) {
    return { code: "invalid_codex_auth_mode", message: "codex.auth.mode must be either api_key or openai_login" };
  }
  if (config.codex.auth.mode === "openai_login" && !fileExists(path.join(config.codex.auth.sourceHome, "auth.json"))) {
    return {
      code: "missing_codex_auth_json",
      message: `codex.auth.mode=openai_login requires auth.json at ${path.join(config.codex.auth.sourceHome, "auth.json")}`,
    };
  }
  if (config.codex.turnTimeoutMs <= 0) {
    return { code: "invalid_turn_timeout_ms", message: "codex.turn_timeout_ms must be greater than zero" };
  }
  return null;
}

function validateCodexProviderConfig(config: ServiceConfig): ValidationError | null {
  if (config.codex.provider && !config.codex.provider.baseUrl) {
    return {
      code: "missing_codex_provider_base_url",
      message: "codex.provider.base_url is required when codex.provider is configured",
    };
  }
  if (config.codex.auth.mode === "openai_login" && config.codex.provider && !config.codex.provider.requiresOpenaiAuth) {
    return {
      code: "invalid_codex_provider_auth_mode",
      message:
        "codex.provider.requires_openai_auth must be true when codex.auth.mode=openai_login and a custom provider is configured",
    };
  }
  return null;
}

function validateApiKeyEnv(config: ServiceConfig, env: NodeJS.ProcessEnv): ValidationError | null {
  if (config.codex.auth.mode !== "api_key") {
    return null;
  }
  const envVars = new Set<string>();
  if (config.codex.provider?.envKey) {
    envVars.add(config.codex.provider.envKey);
  } else if (!config.codex.provider) {
    envVars.add("OPENAI_API_KEY");
  }
  for (const envName of Object.values(config.codex.provider?.envHttpHeaders ?? {})) {
    envVars.add(envName);
  }
  for (const envName of envVars) {
    if (!env[envName]) {
      return {
        code: "missing_codex_provider_env",
        message: `codex runtime requires ${envName} in the host environment`,
      };
    }
  }
  return null;
}

export function validateDispatch(
  config: ServiceConfig,
  deps?: { existsSync?: (filePath: string) => boolean; env?: NodeJS.ProcessEnv },
): ValidationError | null {
  const fileExists = deps?.existsSync ?? existsSync;
  const env = deps?.env ?? process.env;

  return (
    validateTrackerConfig(config) ??
    validateCodexAuthConfig(config, fileExists) ??
    validateCodexProviderConfig(config) ??
    validateApiKeyEnv(config, env)
  );
}
