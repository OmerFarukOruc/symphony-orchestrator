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
  normalizeCodexProvider,
  normalizeTurnSandboxPolicy,
  normalizeApprovalPolicy,
  normalizeNotifications,
  normalizeGitHub,
  normalizeRepos,
  normalizeStateMachine,
} from "./normalizers.js";
import { DEFAULT_ACTIVE_STATES, DEFAULT_TERMINAL_STATES } from "../state/policy.js";

/**
 * Options for service config derivation.
 */
interface DeriveServiceConfigOptions {
  overlay?: Record<string, unknown>;
  secretResolver?: (name: string) => string | undefined;
}

/**
 * Build the tracker configuration subsection.
 */
function deriveTrackerConfig(
  tracker: Record<string, unknown>,
  secretResolver?: (name: string) => string | undefined,
): ServiceConfig["tracker"] {
  return {
    kind: asString(tracker.kind, "linear"),
    apiKey: resolveConfigString(tracker.api_key, secretResolver) || secretResolver?.("LINEAR_API_KEY") || "",
    endpoint: resolveConfigString(tracker.endpoint, secretResolver) || "https://api.linear.app/graphql",
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
  const workspaceRoot = resolvePathConfigString(asString(workspace.root, "../symphony-workspaces"), secretResolver);
  const rawHookTimeoutMs = asNumber(hooks.timeout_ms, 60000);
  const hookTimeoutMs = rawHookTimeoutMs > 0 ? rawHookTimeoutMs : 60000;

  const rawStrategy = asString(workspace.strategy, "directory");
  const strategy: ServiceConfig["workspace"]["strategy"] = rawStrategy === "worktree" ? "worktree" : "directory";
  const branchPrefix = asString(workspace.branch_prefix, "symphony/");

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
 * Build the agent configuration subsection.
 */
function deriveAgentConfig(agent: Record<string, unknown>): ServiceConfig["agent"] {
  return {
    maxConcurrentAgents: asNumber(agent.max_concurrent_agents, 10),
    maxConcurrentAgentsByState: Object.fromEntries(
      Object.entries(asNumberMap(agent.max_concurrent_agents_by_state)).map(([state, limit]) => [
        state.trim().toLowerCase(),
        limit,
      ]),
    ),
    maxTurns: asNumber(agent.max_turns, 20),
    maxRetryBackoffMs: asNumber(agent.max_retry_backoff_ms, 300000),
    maxContinuationAttempts: asNumber(agent.max_continuation_attempts, 5),
    successState: asString(agent.success_state) || null,
    stallTimeoutMs: asNumber(agent.stall_timeout_ms, 1200000),
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
    image: asString(sandbox.image, "symphony-codex:latest"),
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
 */
export function deriveServiceConfig(workflow: WorkflowDefinition, options?: DeriveServiceConfigOptions): ServiceConfig {
  const mergedConfig = options?.overlay
    ? (deepMerge(workflow.config, options.overlay) as Record<string, unknown>)
    : workflow.config;
  const secretResolver = options?.secretResolver;
  const root = asRecord(mergedConfig);
  const tracker = asRecord(root.tracker);
  const notifications = asRecord(root.notifications);
  const github = asRecord(root.github);
  const repos = root.repos;
  const polling = asRecord(root.polling);
  const workspace = asRecord(root.workspace);
  const hooks = asRecord(root.hooks);
  const agent = asRecord(root.agent);
  const codex = asRecord(root.codex);
  const stateMachine = asRecord(root.state_machine);
  const server = asRecord(root.server);

  return {
    tracker: deriveTrackerConfig(tracker, secretResolver),
    notifications: normalizeNotifications(notifications, secretResolver),
    github: normalizeGitHub(github, secretResolver),
    repos: normalizeRepos(repos),
    polling: derivePollingConfig(polling),
    workspace: deriveWorkspaceConfig(workspace, hooks, secretResolver),
    agent: deriveAgentConfig(agent),
    codex: deriveCodexConfig(codex, agent, secretResolver),
    stateMachine: normalizeStateMachine(stateMachine),
    server: deriveServerConfig(server),
  };
}
