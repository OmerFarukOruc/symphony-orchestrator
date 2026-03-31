import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { normalizeStateList } from "../state/policy.js";
import type { ServiceConfig, ValidationError } from "../core/types.js";
import { codexAuthModeValues } from "./schemas/index.js";

/**
 * Zod schema for validating tracker fields that must pass
 * before dispatch can proceed. Stricter than the config-shape
 * schema: kind must be "linear" and required fields non-empty.
 */
const dispatchTrackerSchema = z.object({
  kind: z.literal("linear"),
  apiKey: z.string().min(1),
  endpoint: z.string().min(1),
  projectSlug: z.string().min(1),
});

function validateTrackerConfig(config: ServiceConfig): ValidationError | null {
  const result = dispatchTrackerSchema.safeParse(config.tracker);
  if (!result.success) {
    const field = String(result.error.issues[0].path[0]);
    return trackerIssueToError(field, config.tracker.kind);
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

/** Map a Zod tracker field issue to the corresponding error code/message. */
function trackerIssueToError(field: string, trackerKind: string): ValidationError {
  const errors: Record<string, ValidationError> = {
    kind: {
      code: "invalid_tracker_kind",
      message: `tracker.kind must be "linear"; received ${JSON.stringify(trackerKind)}`,
    },
    apiKey: { code: "missing_tracker_api_key", message: "tracker.api_key is required after env resolution" },
    endpoint: { code: "missing_tracker_endpoint", message: "tracker.endpoint is required" },
    projectSlug: {
      code: "missing_tracker_project_slug",
      message: "tracker.project_slug is required when tracker.kind is linear",
    },
  };
  return errors[field] ?? { code: "invalid_tracker_config", message: `tracker.${field} is invalid` };
}

function validateCodexAuthConfig(
  config: ServiceConfig,
  fileExists: (filePath: string) => boolean,
): ValidationError | null {
  if (!config.codex.command) {
    return { code: "missing_codex_command", message: "codex.command is required" };
  }
  if (!codexAuthModeValues.safeParse(config.codex.auth.mode).success) {
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

function normalizeRepoTarget(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/\.git$/, "")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/");
}

export function collectDispatchWarnings(config: ServiceConfig): ValidationError[] {
  const warnings: ValidationError[] = [];

  for (const repo of config.repos ?? []) {
    const normalizedRepoUrl = normalizeRepoTarget(repo.repoUrl);
    const githubRepo = normalizeRepoTarget(repo.githubRepo);
    if (!normalizedRepoUrl.includes("risoluto") && githubRepo !== "risoluto") {
      continue;
    }
    warnings.push({
      code: "self_routing_repo",
      message:
        `repo route ${JSON.stringify(repo.identifierPrefix ?? repo.label ?? repo.repoUrl)} points to ` +
        `risoluto itself. This is fine for self-test traffic, but it will make dispatched agents modify ` +
        "the orchestrator repo instead of the intended target repository.",
    });
  }

  return warnings;
}
