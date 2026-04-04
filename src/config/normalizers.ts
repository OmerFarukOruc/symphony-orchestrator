/**
 * Domain-specific config normalizers.
 *
 * These functions transform raw config subsections into typed,
 * validated domain objects. Each normalizer handles one config domain.
 */

import type {
  AlertConfig,
  AlertRuleConfig,
  AutomationConfig,
  AutomationMode,
  CodexAuthMode,
  CodexProviderConfig,
  NotificationChannelConfig,
  NotificationConfig,
  NotificationSeverity,
  RepoConfig,
  TriggerAction,
  TriggerConfig,
  ServiceConfig,
  ReasoningEffort,
  StateMachineConfig,
  StateStageConfig,
} from "../core/types.js";
import { asBoolean, asRecord, asString, asStringArray, asStringMap, asRecordArray } from "./coercion.js";
import { resolveConfigString } from "./resolvers.js";
import { normalizeGitHubApiBaseUrl, normalizeNotificationWebhookUrl, normalizeSlackWebhookUrl } from "./url-policy.js";

function pickValue(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }
  return undefined;
}

function asNotificationSeverity(value: unknown, fallback: NotificationSeverity = "info"): NotificationSeverity {
  return value === "warning" || value === "critical" || value === "info" ? value : fallback;
}

function asTriggerAction(value: unknown): TriggerAction | null {
  return value === "create_issue" || value === "re_poll" || value === "refresh_issue" ? value : null;
}

function asAutomationMode(value: unknown, fallback: AutomationMode = "report"): AutomationMode {
  return value === "implement" || value === "report" || value === "findings" ? value : fallback;
}

function normalizeLegacySlackConfig(
  value: Record<string, unknown>,
  secretResolver?: (name: string) => string | undefined,
): NotificationConfig["slack"] {
  const webhookUrl = resolveConfigString(pickValue(value, "webhook_url", "webhookUrl"), secretResolver);
  if (!webhookUrl) {
    return null;
  }
  const verbosity = asString(pickValue(value, "verbosity"), "critical");
  return {
    webhookUrl: normalizeSlackWebhookUrl(webhookUrl),
    verbosity: verbosity === "off" || verbosity === "critical" || verbosity === "verbose" ? verbosity : "critical",
  };
}

function normalizeNotificationChannels(
  value: unknown,
  secretResolver?: (name: string) => string | undefined,
): NotificationChannelConfig[] {
  return asRecordArray(value)
    .map((channel): NotificationChannelConfig | null => {
      const type = asString(channel.type).trim().toLowerCase();
      const enabled = asBoolean(pickValue(channel, "enabled"), true);
      const minSeverity = asNotificationSeverity(pickValue(channel, "min_severity", "minSeverity"), "info");

      if (type === "slack") {
        const webhookUrl = resolveConfigString(pickValue(channel, "webhook_url", "webhookUrl"), secretResolver);
        if (!webhookUrl) {
          return null;
        }
        const verbosity = asString(pickValue(channel, "verbosity"), "critical");
        return {
          type: "slack",
          name: asString(channel.name, "slack"),
          enabled,
          minSeverity,
          webhookUrl: normalizeSlackWebhookUrl(webhookUrl),
          verbosity:
            verbosity === "off" || verbosity === "critical" || verbosity === "verbose" ? verbosity : "critical",
        };
      }

      if (type === "webhook") {
        const url = resolveConfigString(pickValue(channel, "url"), secretResolver);
        if (!url) {
          return null;
        }
        return {
          type: "webhook",
          name: asString(channel.name, "webhook"),
          enabled,
          minSeverity,
          url: normalizeNotificationWebhookUrl(url),
          headers: asStringMap(pickValue(channel, "headers")),
        };
      }

      if (type === "desktop") {
        return {
          type: "desktop",
          name: asString(channel.name, "desktop"),
          enabled,
          minSeverity,
        };
      }

      return null;
    })
    .filter((channel): channel is NotificationChannelConfig => channel !== null);
}

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

  const id = asString(provider.id) || null;
  const baseUrl = resolveConfigString(provider.base_url, secretResolver) || null;

  // An overlay template writes all fields as empty strings — treat that as
  // "no provider configured" so the server starts without a validation error.
  if (!id && !baseUrl) {
    return null;
  }

  return {
    id,
    name: asString(provider.name) || null,
    baseUrl,
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
  const slack = normalizeLegacySlackConfig(asRecord(root.slack), secretResolver);
  const channels = normalizeNotificationChannels(root.channels, secretResolver);
  if (slack) {
    channels.unshift({
      type: "slack",
      name: "slack",
      enabled: true,
      minSeverity: "info",
      webhookUrl: slack.webhookUrl,
      verbosity: slack.verbosity,
    });
  }
  return {
    slack,
    channels,
  };
}

/**
 * Normalize trigger configuration.
 * Returns null when the section is empty.
 */
export function normalizeTriggers(
  value: unknown,
  secretResolver?: (name: string) => string | undefined,
): TriggerConfig | null {
  const root = asRecord(value);
  if (Object.keys(root).length === 0) {
    return null;
  }
  const allowedActions = asStringArray(pickValue(root, "allowed_actions", "allowedActions"), [])
    .map(asTriggerAction)
    .filter((action): action is TriggerAction => action !== null);

  return {
    apiKey: resolveConfigString(pickValue(root, "api_key", "apiKey"), secretResolver) || null,
    allowedActions,
    githubSecret: resolveConfigString(pickValue(root, "github_secret", "githubSecret"), secretResolver) || null,
    rateLimitPerMinute: Number(pickValue(root, "rate_limit_per_minute", "rateLimitPerMinute") ?? 30) || 30,
  };
}

/**
 * Normalize automation configuration.
 */
export function normalizeAutomations(value: unknown): AutomationConfig[] {
  return asRecordArray(value)
    .map((automation): AutomationConfig | null => {
      const name = asString(automation.name);
      const schedule = asString(automation.schedule);
      const prompt = asString(automation.prompt);
      if (!name || !schedule || !prompt) {
        return null;
      }
      return {
        name,
        schedule,
        mode: asAutomationMode(automation.mode, "report"),
        prompt,
        enabled: asBoolean(automation.enabled, true),
        repoUrl: asString(pickValue(automation, "repo_url", "repoUrl")) || null,
      };
    })
    .filter((automation): automation is AutomationConfig => automation !== null);
}

/**
 * Normalize alert rule configuration.
 * Returns null when no valid rules are configured.
 */
export function normalizeAlerts(value: unknown): AlertConfig | null {
  const root = asRecord(value);
  const rules = asRecordArray(root.rules)
    .map((rule): AlertRuleConfig | null => {
      const name = asString(rule.name);
      const type = asString(rule.type);
      if (!name || !type) {
        return null;
      }
      return {
        name,
        type,
        severity: asNotificationSeverity(rule.severity, "critical"),
        channels: asStringArray(rule.channels, []),
        cooldownMs: Number(pickValue(rule, "cooldown_ms", "cooldownMs") ?? 300_000) || 300_000,
        enabled: asBoolean(rule.enabled, true),
      };
    })
    .filter((rule): rule is AlertRuleConfig => rule !== null);
  return rules.length > 0 ? { rules } : null;
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
    apiBaseUrl: normalizeGitHubApiBaseUrl(
      resolveConfigString(root.api_base_url, secretResolver) || "https://api.github.com",
    ),
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
const VALID_APPROVAL_POLICIES = new Set(["untrusted", "on-failure", "on-request", "never"]);

function defaultApprovalPolicy(): Record<string, unknown> {
  return {
    granular: {
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
export function normalizeTurnSandboxPolicy(value: Record<string, unknown>): { type: string; [key: string]: unknown } {
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

  return {
    type: asString(value.type, "workspaceWrite"),
    ...value,
  };
}

/**
 * Normalize approval policy configuration.
 * Passes through strings, returns default for empty objects.
 */

/** Legacy string aliases that predate the Codex 0.117+ AskForApproval enum. */
const LEGACY_APPROVAL_ALIASES: Record<string, string> = {
  "auto-edit": "never",
  "auto-approve": "never",
  reject: "never",
  suggest: "on-request",
};

// Codex AskForApproval accepts string | { granular: {...} } — mixed return is intentional.
// eslint-disable-next-line sonarjs/function-return-type
export function normalizeApprovalPolicy(value: unknown): string | Record<string, unknown> {
  if (typeof value === "string") {
    return LEGACY_APPROVAL_ALIASES[value] ?? (VALID_APPROVAL_POLICIES.has(value) ? value : "never");
  }
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return defaultApprovalPolicy();
  // Migrate legacy { reject: { ... } } → { granular: { ... } }
  if ("reject" in record && !("granular" in record)) {
    return { granular: record.reject };
  }
  return record;
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
