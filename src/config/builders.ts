/**
 * Service config builders.
 *
 * These functions build typed ServiceConfig subsections from raw
 * config records. Each builder handles one top-level config domain.
 */

import path from "node:path";
import type { ServiceConfig, WorkflowDefinition } from "../core/types.js";
import { asBoolean, asNumber, asNumberMap, asRecord, asString, asStringArray, asLooseStringArray } from "./coercion.js";
import { deepMerge } from "./merge.js";
import { resolveConfigString, resolvePathConfigString } from "./resolvers.js";
import {
  asCodexAuthMode,
  asReasoningEffort,
  normalizeAlerts,
  normalizeAutomations,
  normalizeCodexProvider,
  normalizeTurnSandboxPolicy,
  normalizeApprovalPolicy,
  normalizeNotifications,
  normalizeGitHub,
  normalizeRepos,
  normalizeStateMachine,
  normalizeTriggers,
} from "./normalizers.js";
import { DEFAULT_ACTIVE_STATES, DEFAULT_TERMINAL_STATES } from "../state/policy.js";
import { normalizeTrackerEndpoint } from "./url-policy.js";

/**
 * Options for service config derivation.
 */
interface DeriveServiceConfigOptions {
  /**
   * Pre-merged config map (workflow.config already merged with overlay).
   * When provided, the overlay field is ignored and no additional merge is performed.
   * Prefer this over `overlay` to avoid a second deep-merge pass.
   */
  mergedConfigMap?: Record<string, unknown>;
  /** Raw overlay map. Ignored when `mergedConfigMap` is present. */
  overlay?: Record<string, unknown>;
  secretResolver?: (name: string) => string | undefined;
}

/**
 * Alias registry mapping snake_case config keys to their camelCase equivalents.
 *
 * Each entry is [snakeCaseKey, camelCaseKey]. The registry is the single source
 * of truth for dual-format keys within a single config section. Builders pass
 * the section-specific alias list into `normalizeRecord` so alias handling
 * stays local to the subsection being derived.
 */
const WEBHOOK_ALIAS_REGISTRY: ReadonlyArray<readonly [string, string]> = [
  // webhook
  ["webhook_url", "webhookUrl"],
  ["webhook_secret", "webhookSecret"],
  ["polling_stretch_ms", "pollingStretchMs"],
  ["polling_base_ms", "pollingBaseMs"],
  ["health_check_interval_ms", "healthCheckIntervalMs"],
];

const AGENT_ALIAS_REGISTRY: ReadonlyArray<readonly [string, string]> = [
  // agent
  ["preflight_commands", "preflightCommands"],
  ["auto_retry_on_review_feedback", "autoRetryOnReviewFeedback"],
  ["pr_monitor_interval_ms", "prMonitorIntervalMs"],
  ["auto_merge", "autoMerge"],
];

const MERGE_POLICY_ALIAS_REGISTRY: ReadonlyArray<readonly [string, string]> = [
  // merge policy
  ["allowed_paths", "allowedPaths"],
  ["require_labels", "requireLabels"],
  ["exclude_labels", "excludeLabels"],
  ["max_changed_files", "maxChangedFiles"],
  ["max_diff_lines", "maxDiffLines"],
];

/**
 * Normalize a raw config record by resolving alias pairs.
 *
 * For each `[snakeKey, camelKey]` pair in the registry, if only the camelCase
 * key is present in `record`, the snake_case key is populated with that value.
 * snake_case always wins when both are present (operator YAML format is canonical).
 *
 * Returns a new object — the original is not mutated.
 */
function normalizeRecord(
  record: Record<string, unknown>,
  aliasRegistry: ReadonlyArray<readonly [string, string]>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...record };
  for (const [snakeKey, camelKey] of aliasRegistry) {
    // Intentional loose nullish check: preserve "", 0, and false while
    // treating both null and undefined the same as the previous `??` path.
    if (out[snakeKey] == null && out[camelKey] != null) {
      out[snakeKey] = out[camelKey];
    }
  }
  return out;
}

function asNumberish(value: unknown, fallback: number): number {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return asNumber(value, fallback);
}

/**
 * Build the tracker configuration subsection.
 */
function deriveTrackerConfig(
  tracker: Record<string, unknown>,
  secretResolver?: (name: string) => string | undefined,
): ServiceConfig["tracker"] {
  const kind = asString(tracker.kind, "linear");
  const defaultEndpoint = kind === "github" ? "https://api.github.com" : "https://api.linear.app/graphql";
  const endpoint = resolveConfigString(tracker.endpoint, secretResolver) || defaultEndpoint;
  return {
    kind,
    apiKey: resolveConfigString(tracker.api_key, secretResolver) || secretResolver?.("LINEAR_API_KEY") || "",
    endpoint: normalizeTrackerEndpoint(kind, endpoint),
    projectSlug:
      resolveConfigString(tracker.project_slug, secretResolver) || secretResolver?.("LINEAR_PROJECT_SLUG") || null,
    owner: asString(tracker.owner, "") || (secretResolver?.("GITHUB_OWNER") ?? ""),
    repo: asString(tracker.repo, "") || (secretResolver?.("GITHUB_REPO") ?? ""),
    activeStates: asStringArray(tracker.active_states, DEFAULT_ACTIVE_STATES),
    terminalStates: asStringArray(tracker.terminal_states, DEFAULT_TERMINAL_STATES),
  };
}

/**
 * Build the workspace configuration subsection.
 */
function deriveWorkspaceConfig(
  workspace: Record<string, unknown>,
  hooks: Record<string, unknown>,
  secretResolver?: (name: string) => string | undefined,
): ServiceConfig["workspace"] {
  const containerRoot = process.env.RISOLUTO_CONTAINER_WORKSPACE_ROOT;
  const defaultWorkspaceRoot = containerRoot || "../risoluto-workspaces";
  const workspaceRoot = resolvePathConfigString(asString(workspace.root, defaultWorkspaceRoot), secretResolver);
  const rawHookTimeoutMs = asNumber(hooks.timeout_ms, 60000);
  const hookTimeoutMs = rawHookTimeoutMs > 0 ? rawHookTimeoutMs : 60000;

  const rawStrategy = asString(workspace.strategy, "directory");
  const strategy: ServiceConfig["workspace"]["strategy"] = rawStrategy === "worktree" ? "worktree" : "directory";
  const branchPrefix = asString(workspace.branch_prefix, "risoluto/");

  return {
    root: path.resolve(workspaceRoot),
    hooks: {
      afterCreate: asString(hooks.after_create) || null,
      beforeRun: asString(hooks.before_run) || null,
      afterRun: asString(hooks.after_run) || null,
      beforeRemove: asString(hooks.before_remove) || null,
      timeoutMs: hookTimeoutMs,
    },
    strategy,
    branchPrefix,
  };
}

/**
 * Build the merge policy configuration sub-block from a raw agent config record.
 *
 * Always returns a fully-populated object with safe defaults so callers
 * never need to guard against undefined fields.
 */
function deriveMergePolicyConfig(raw: Record<string, unknown>): ServiceConfig["agent"]["autoMerge"] {
  const norm = normalizeRecord(raw, MERGE_POLICY_ALIAS_REGISTRY);
  const allowedPaths = asLooseStringArray(norm.allowed_paths);
  const requireLabels = asLooseStringArray(norm.require_labels);
  const excludeLabels = asLooseStringArray(norm.exclude_labels);

  const rawMaxFiles = norm.max_changed_files;
  const maxChangedFiles = rawMaxFiles !== undefined && rawMaxFiles !== null ? asNumber(rawMaxFiles, 0) : undefined;

  const rawMaxLines = norm.max_diff_lines;
  const maxDiffLines = rawMaxLines !== undefined && rawMaxLines !== null ? asNumber(rawMaxLines, 0) : undefined;

  return {
    enabled: asBoolean(norm.enabled, false),
    allowedPaths,
    maxChangedFiles,
    maxDiffLines,
    requireLabels,
    excludeLabels,
  };
}

/**
 * Build the agent configuration subsection.
 */
function deriveAgentConfig(agent: Record<string, unknown>): ServiceConfig["agent"] {
  const norm = normalizeRecord(agent, AGENT_ALIAS_REGISTRY);
  return {
    maxConcurrentAgents: asNumber(norm.max_concurrent_agents, 10),
    maxConcurrentAgentsByState: Object.fromEntries(
      Object.entries(asNumberMap(norm.max_concurrent_agents_by_state)).map(([state, limit]) => [
        state.trim().toLowerCase(),
        limit,
      ]),
    ),
    maxTurns: asNumber(norm.max_turns, 20),
    maxRetryBackoffMs: asNumber(norm.max_retry_backoff_ms, 300000),
    maxContinuationAttempts: asNumber(norm.max_continuation_attempts, 5),
    successState: asString(norm.success_state) || null,
    stallTimeoutMs: asNumber(norm.stall_timeout_ms, 1200000),
    preflightCommands: asLooseStringArray(norm.preflight_commands),
    autoRetryOnReviewFeedback: asBoolean(norm.auto_retry_on_review_feedback, false),
    prMonitorIntervalMs: asNumber(norm.pr_monitor_interval_ms, 60000),
    autoMerge: deriveMergePolicyConfig(asRecord(norm.auto_merge)),
  };
}

/**
 * Build the sandbox security configuration subsection.
 */
function deriveSandboxSecurityConfig(
  sandboxSecurity: Record<string, unknown>,
): ServiceConfig["codex"]["sandbox"]["security"] {
  return {
    noNewPrivileges: asBoolean(sandboxSecurity.no_new_privileges, true),
    dropCapabilities: asBoolean(sandboxSecurity.drop_capabilities, true),
    gvisor: asBoolean(sandboxSecurity.gvisor, false),
    seccompProfile: asString(sandboxSecurity.seccomp_profile, ""),
  };
}

/**
 * Build the sandbox resources configuration subsection.
 */
function deriveSandboxResourcesConfig(
  sandboxResources: Record<string, unknown>,
): ServiceConfig["codex"]["sandbox"]["resources"] {
  return {
    memory: asString(sandboxResources.memory, "4g"),
    memoryReservation: asString(sandboxResources.memory_reservation, "1g"),
    memorySwap: asString(sandboxResources.memory_swap, "4g"),
    cpus: asString(sandboxResources.cpus, "2.0"),
    tmpfsSize: asString(sandboxResources.tmpfs_size, "512m"),
  };
}

/**
 * Build the sandbox logs configuration subsection.
 */
function deriveSandboxLogsConfig(sandboxLogs: Record<string, unknown>): ServiceConfig["codex"]["sandbox"]["logs"] {
  return {
    driver: asString(sandboxLogs.driver, "json-file"),
    maxSize: asString(sandboxLogs.max_size, "50m"),
    maxFile: asNumber(sandboxLogs.max_file, 3),
  };
}

/**
 * Build the sandbox configuration subsection.
 */
function deriveSandboxConfig(sandbox: Record<string, unknown>): ServiceConfig["codex"]["sandbox"] {
  const sandboxSecurity = asRecord(sandbox.security);
  const sandboxResources = asRecord(sandbox.resources);
  const sandboxLogs = asRecord(sandbox.logs);

  return {
    image: asString(sandbox.image, "risoluto-codex:latest"),
    network: asString(sandbox.network, ""),
    security: deriveSandboxSecurityConfig(sandboxSecurity),
    resources: deriveSandboxResourcesConfig(sandboxResources),
    extraMounts: asLooseStringArray(sandbox.extra_mounts),
    envPassthrough: asLooseStringArray(sandbox.env_passthrough),
    logs: deriveSandboxLogsConfig(sandboxLogs),
    egressAllowlist: asLooseStringArray(sandbox.egress_allowlist),
  };
}

/**
 * Build the codex configuration subsection.
 */
function deriveCodexConfig(
  codex: Record<string, unknown>,
  agent: Record<string, unknown>,
  secretResolver?: (name: string) => string | undefined,
): ServiceConfig["codex"] {
  const auth = asRecord(codex.auth);
  const sandbox = asRecord(codex.sandbox);
  const turnSandboxPolicyRecord = asRecord(codex.turn_sandbox_policy);

  const readTimeoutMs = asNumber(codex.read_timeout_ms, asNumber(agent.read_timeout_ms, 5000));
  const stallTimeoutMs = asNumber(codex.stall_timeout_ms, asNumber(agent.stall_timeout_ms, 300000));

  return {
    command: asString(codex.command, "codex app-server"),
    model: asString(codex.model, "gpt-5.4"),
    reasoningEffort: asReasoningEffort(codex.reasoning_effort, "high"),
    approvalPolicy: normalizeApprovalPolicy(codex.approval_policy),
    threadSandbox: asString(codex.thread_sandbox, "workspace-write"),
    personality: asString(codex.personality, "friendly"),
    turnSandboxPolicy: normalizeTurnSandboxPolicy(turnSandboxPolicyRecord),
    selfReview: codex.self_review === true,
    readTimeoutMs,
    turnTimeoutMs: asNumber(codex.turn_timeout_ms, 3600000),
    drainTimeoutMs: asNumber(codex.drain_timeout_ms, 2000),
    startupTimeoutMs: asNumber(codex.startup_timeout_ms, 30000),
    stallTimeoutMs,
    structuredOutput: asBoolean(codex.structured_output, false),
    auth: {
      mode: asCodexAuthMode(auth.mode, "api_key"),
      sourceHome: resolveConfigString(asString(auth.source_home, "~/.codex"), secretResolver),
    },
    provider: normalizeCodexProvider(codex.provider, secretResolver),
    sandbox: deriveSandboxConfig(sandbox),
  };
}

/**
 * Build the webhook configuration subsection.
 *
 * Returns null when `webhook_url` is absent or empty,
 * which disables the webhook integration entirely.
 */
function deriveWebhookConfig(
  webhook: Record<string, unknown>,
  secretResolver?: (name: string) => string | undefined,
): ServiceConfig["webhook"] | null {
  const norm = normalizeRecord(webhook, WEBHOOK_ALIAS_REGISTRY);
  const webhookUrl = resolveConfigString(norm.webhook_url, secretResolver) || null;
  if (!webhookUrl) return null;

  return {
    webhookUrl,
    webhookSecret: resolveConfigString(norm.webhook_secret, secretResolver) || "",
    pollingStretchMs: asNumberish(norm.polling_stretch_ms, 120000),
    pollingBaseMs: asNumberish(norm.polling_base_ms, 15000),
    healthCheckIntervalMs: asNumberish(norm.health_check_interval_ms, 300000),
  };
}

/**
 * Build the polling configuration subsection.
 */
function derivePollingConfig(polling: Record<string, unknown>): ServiceConfig["polling"] {
  return {
    intervalMs: asNumber(polling.interval_ms, 15000),
  };
}

/**
 * Build the server configuration subsection.
 */
function deriveServerConfig(server: Record<string, unknown>): ServiceConfig["server"] {
  return {
    port: asNumber(server.port, 4000),
  };
}

/**
 * Derive the complete ServiceConfig from a workflow definition.
 *
 * This is the main entry point that orchestrates all subsection builders.
 *
 * Pass `mergedConfigMap` (already merged by the caller) to skip the internal
 * deep-merge and avoid double-applying the overlay. The `overlay` option is
 * kept for backward compatibility with call sites that have not been updated yet.
 */
export function deriveServiceConfig(workflow: WorkflowDefinition, options?: DeriveServiceConfigOptions): ServiceConfig {
  const mergedConfig =
    options?.mergedConfigMap ??
    (options?.overlay ? (deepMerge(workflow.config, options.overlay) as Record<string, unknown>) : workflow.config);
  const secretResolver = options?.secretResolver;
  const root = asRecord(mergedConfig);
  const tracker = asRecord(root.tracker);
  const notifications = asRecord(root.notifications);
  const triggers = asRecord(root.triggers);
  const automations = root.automations;
  const alerts = asRecord(root.alerts);
  const github = asRecord(root.github);
  const repos = root.repos;
  const polling = asRecord(root.polling);
  const workspace = asRecord(root.workspace);
  const hooks = asRecord(root.hooks);
  const agent = asRecord(root.agent);
  const codex = asRecord(root.codex);
  const stateMachine = asRecord(root.state_machine);
  const server = asRecord(root.server);
  const webhook = asRecord(root.webhook);

  return {
    tracker: deriveTrackerConfig(tracker, secretResolver),
    notifications: normalizeNotifications(notifications, secretResolver),
    triggers: normalizeTriggers(triggers, secretResolver),
    automations: normalizeAutomations(automations),
    alerts: normalizeAlerts(alerts),
    github: normalizeGitHub(github, secretResolver),
    repos: normalizeRepos(repos),
    polling: derivePollingConfig(polling),
    workspace: deriveWorkspaceConfig(workspace, hooks, secretResolver),
    agent: deriveAgentConfig(agent),
    codex: deriveCodexConfig(codex, agent, secretResolver),
    stateMachine: normalizeStateMachine(stateMachine),
    server: deriveServerConfig(server),
    webhook: deriveWebhookConfig(webhook, secretResolver),
  };
}
