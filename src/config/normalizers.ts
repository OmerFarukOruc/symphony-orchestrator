/**
 * Domain-specific config normalizers.
 *
 * These functions transform raw config subsections into typed,
 * validated domain objects. Each normalizer handles one config domain.
 */

import type {
  CodexAuthMode,
  CodexProviderConfig,
  NotificationConfig,
  RepoConfig,
  ServiceConfig,
  ReasoningEffort,
  StateMachineConfig,
  StateStageConfig,
  TurnSandboxPolicy,
} from "../core/types.js";
import { asBoolean, asRecord, asString, asStringArray, asStringMap, asRecordArray } from "./coercion.js";
import { resolveConfigString } from "./resolvers.js";

/**
 * Normalize a Codex auth mode string.
 * Only accepts "openai_login"; everything else falls back to the provided default.
 */
export function asCodexAuthMode(value: unknown, fallback: CodexAuthMode): CodexAuthMode {
  return value === "openai_login" ? "openai_login" : fallback;
}

/**
 * Normalize a Codex provider configuration.
 * Returns null if the provider record is empty.
 */
export function normalizeCodexProvider(
  value: unknown,
  secretResolver?: (name: string) => string | undefined,
): CodexProviderConfig | null {
  const provider = asRecord(value);
  if (Object.keys(provider).length === 0) {
    return null;
  }

  return {
    id: asString(provider.id) || null,
    name: asString(provider.name) || null,
    baseUrl: resolveConfigString(provider.base_url, secretResolver) || null,
    envKey: asString(provider.env_key) || null,
    envKeyInstructions: asString(provider.env_key_instructions) || null,
    wireApi: asString(provider.wire_api) || null,
    requiresOpenaiAuth: asBoolean(provider.requires_openai_auth, false),
    httpHeaders: asStringMap(provider.http_headers),
    envHttpHeaders: asStringMap(provider.env_http_headers),
    queryParams: asStringMap(provider.query_params),
  };
}

/**
 * Normalize notification configuration.
 * Returns slack: null if no webhook URL is configured.
 */
export function normalizeNotifications(
  value: unknown,
  secretResolver?: (name: string) => string | undefined,
): NotificationConfig {
  const root = asRecord(value);
  const slack = asRecord(root.slack);
  const webhookUrl = resolveConfigString(slack.webhook_url, secretResolver);
  if (!webhookUrl) {
    return { slack: null };
  }
  const verbosity = asString(slack.verbosity, "critical");
  return {
    slack: {
      webhookUrl,
      verbosity: verbosity === "off" || verbosity === "critical" || verbosity === "verbose" ? verbosity : "critical",
    },
  };
}

/**
 * Normalize GitHub service configuration.
 * Returns null if no token is configured.
 */
export function normalizeGitHub(
  value: unknown,
  secretResolver?: (name: string) => string | undefined,
): ServiceConfig["github"] {
  const root = asRecord(value);
  const token = resolveConfigString(root.token, secretResolver);
  if (!token) {
    return null;
  }
  return {
    token,
    apiBaseUrl: resolveConfigString(root.api_base_url, secretResolver) || "https://api.github.com",
  };
}

/**
 * Normalize repository configurations.
 * Filters out repos that don't have a repoUrl AND (identifierPrefix OR label).
 */
export function normalizeRepos(value: unknown): RepoConfig[] {
  return asRecordArray(value)
    .map((repo) => ({
      repoUrl: asString(repo.repo_url),
      defaultBranch: asString(repo.default_branch, "main"),
      identifierPrefix: asString(repo.identifier_prefix) || null,
      label: asString(repo.label) || null,
      githubOwner: asString(repo.github_owner) || null,
      githubRepo: asString(repo.github_repo) || null,
      githubTokenEnv: asString(repo.github_token_env) || null,
    }))
    .filter((repo) => Boolean(repo.repoUrl && (repo.identifierPrefix || repo.label)));
}

/**
 * Normalize state machine configuration.
 * Returns null if no valid stages are defined.
 */
export function normalizeStateMachine(value: unknown): StateMachineConfig | null {
  const root = asRecord(value);
  const stages = asRecordArray(root.stages)
    .map((stage): StateStageConfig | null => {
      const name = asString(stage.name);
      const kind = asString(stage.kind);
      if (!name || !["backlog", "todo", "active", "gate", "terminal"].includes(kind)) {
        return null;
      }
      return {
        name,
        kind: kind as StateStageConfig["kind"],
      };
    })
    .filter((stage): stage is StateStageConfig => stage !== null);
  if (stages.length === 0) {
    return null;
  }

  const transitions = Object.fromEntries(
    Object.entries(asRecord(root.transitions)).map(([from, to]) => [from, asStringArray(to, [])]),
  );
  return { stages, transitions };
}

/**
 * Create a default approval policy object.
 */
function defaultApprovalPolicy(): Record<string, unknown> {
  return {
    reject: {
      sandbox_approval: true,
      rules: true,
      mcp_elicitations: true,
    },
  };
}

/**
 * Normalize turn sandbox policy configuration.
 * Returns a default policy if the input is empty.
 */
export function normalizeTurnSandboxPolicy(value: Record<string, unknown>): TurnSandboxPolicy {
  if (Object.keys(value).length === 0) {
    return {
      type: "workspaceWrite",
      writableRoots: [],
      networkAccess: false,
      readOnlyAccess: {
        type: "fullAccess",
      },
    };
  }

  const policyType = asString(value.type, "workspaceWrite");
  if (policyType === "workspaceWrite") {
    return {
      type: "workspaceWrite",
      writableRoots: Array.isArray(value.writableRoots) ? (value.writableRoots as string[]) : [],
      networkAccess: typeof value.networkAccess === "boolean" ? value.networkAccess : false,
      readOnlyAccess:
        typeof value.readOnlyAccess === "object" && value.readOnlyAccess !== null
          ? (value.readOnlyAccess as { type: string })
          : { type: "fullAccess" },
    };
  }

  return {
    type: policyType,
    ...value,
  };
}

/**
 * Normalize approval policy configuration.
 * Passes through strings, returns default for empty objects.
 */
// eslint-disable-next-line sonarjs/function-return-type -- union return is intentional
export function normalizeApprovalPolicy(value: unknown): string | Record<string, unknown> {
  if (typeof value === "string") {
    return value;
  }
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? record : defaultApprovalPolicy();
}

/**
 * Normalize reasoning effort value.
 * Validates against known effort levels: none, minimal, low, medium, high, xhigh.
 */
export function asReasoningEffort(value: unknown, fallback: ReasoningEffort | null): ReasoningEffort | null {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  if (typeof value !== "string") {
    return fallback;
  }
  if (["none", "minimal", "low", "medium", "high", "xhigh"].includes(value)) {
    return value as ReasoningEffort;
  }
  return fallback;
}
