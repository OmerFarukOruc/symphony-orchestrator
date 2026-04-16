/**
 * Service config section builders.
 *
 * These functions build typed ServiceConfig subsections from raw config
 * records. `derivation-pipeline.ts` owns the end-to-end orchestration.
 */

import path from "node:path";

import type { ServiceConfig } from "../core/types.js";
import { DEFAULT_ACTIVE_STATES, DEFAULT_TERMINAL_STATES } from "../state/policy.js";
import { asBoolean, asNumber, asNumberMap, asRecord, asString, asLooseStringArray, asStringArray } from "./coercion.js";
import {
  asCodexAuthMode,
  asReasoningEffort,
  normalizeApprovalPolicy,
  normalizeCodexProvider,
  normalizeTurnSandboxPolicy,
} from "./normalizers.js";
import { resolveConfigString, resolvePathConfigString } from "./resolvers.js";
import { normalizeTrackerEndpoint } from "./url-policy.js";

const WEBHOOK_ALIAS_REGISTRY: ReadonlyArray<readonly [string, string]> = [
  ["webhook_url", "webhookUrl"],
  ["webhook_secret", "webhookSecret"],
  ["polling_stretch_ms", "pollingStretchMs"],
  ["polling_base_ms", "pollingBaseMs"],
  ["health_check_interval_ms", "healthCheckIntervalMs"],
];

const AGENT_ALIAS_REGISTRY: ReadonlyArray<readonly [string, string]> = [
  ["success_state", "successState"],
  ["max_concurrent_agents", "maxConcurrentAgents"],
  ["max_concurrent_agents_by_state", "maxConcurrentAgentsByState"],
  ["max_turns", "maxTurns"],
  ["max_retry_backoff_ms", "maxRetryBackoffMs"],
  ["max_continuation_attempts", "maxContinuationAttempts"],
  ["stall_timeout_ms", "stallTimeoutMs"],
  ["preflight_commands", "preflightCommands"],
  ["auto_retry_on_review_feedback", "autoRetryOnReviewFeedback"],
  ["pr_monitor_interval_ms", "prMonitorIntervalMs"],
  ["auto_merge", "autoMerge"],
];

const MERGE_POLICY_ALIAS_REGISTRY: ReadonlyArray<readonly [string, string]> = [
  ["allowed_paths", "allowedPaths"],
  ["require_labels", "requireLabels"],
  ["exclude_labels", "excludeLabels"],
  ["max_changed_files", "maxChangedFiles"],
  ["max_diff_lines", "maxDiffLines"],
];

export function normalizeRecord(
  record: Record<string, unknown>,
  aliasRegistry: ReadonlyArray<readonly [string, string]>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...record };
  for (const [snakeKey, camelKey] of aliasRegistry) {
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

export function deriveTrackerConfig(
  tracker: Record<string, unknown>,
  secretResolver?: (name: string) => string | undefined,
): ServiceConfig["tracker"] {
  const kind = asString(tracker.kind, "linear");
  const defaultEndpoint = kind === "github" ? "https://api.github.com" : "https://api.linear.app/graphql";
  const endpoint = normalizeTrackerEndpoint(
    kind,
    resolveConfigString(tracker.endpoint, secretResolver) || defaultEndpoint,
  );
  return {
    kind,
    apiKey: resolveConfigString(tracker.api_key, secretResolver) || secretResolver?.("LINEAR_API_KEY") || "",
    endpoint,
    projectSlug:
      resolveConfigString(tracker.project_slug, secretResolver) || secretResolver?.("LINEAR_PROJECT_SLUG") || null,
    owner: asString(tracker.owner, "") || (secretResolver?.("GITHUB_OWNER") ?? ""),
    repo: asString(tracker.repo, "") || (secretResolver?.("GITHUB_REPO") ?? ""),
    activeStates: asStringArray(tracker.active_states, DEFAULT_ACTIVE_STATES),
    terminalStates: asStringArray(tracker.terminal_states, DEFAULT_TERMINAL_STATES),
  };
}

export function deriveWorkspaceConfig(
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

export function deriveAgentConfig(agent: Record<string, unknown>): ServiceConfig["agent"] {
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

function deriveSandboxLogsConfig(sandboxLogs: Record<string, unknown>): ServiceConfig["codex"]["sandbox"]["logs"] {
  return {
    driver: asString(sandboxLogs.driver, "json-file"),
    maxSize: asString(sandboxLogs.max_size, "50m"),
    maxFile: asNumber(sandboxLogs.max_file, 3),
  };
}

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

export function deriveCodexConfig(
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

export function deriveWebhookConfig(
  webhook: Record<string, unknown>,
  secretResolver?: (name: string) => string | undefined,
): ServiceConfig["webhook"] | null {
  const norm = normalizeRecord(webhook, WEBHOOK_ALIAS_REGISTRY);
  const webhookUrl = resolveConfigString(norm.webhook_url, secretResolver) || null;

  return webhookUrl
    ? {
        webhookUrl,
        webhookSecret: resolveConfigString(norm.webhook_secret, secretResolver) || "",
        pollingStretchMs: asNumberish(norm.polling_stretch_ms, 120000),
        pollingBaseMs: asNumberish(norm.polling_base_ms, 15000),
        healthCheckIntervalMs: asNumberish(norm.health_check_interval_ms, 300000),
      }
    : null;
}

export function derivePollingConfig(polling: Record<string, unknown>): ServiceConfig["polling"] {
  return {
    intervalMs: asNumber(polling.interval_ms, 15000),
  };
}

export function deriveServerConfig(server: Record<string, unknown>): ServiceConfig["server"] {
  return {
    port: asNumber(server.port, 4000),
  };
}
