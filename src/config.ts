import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import chokidar, { type FSWatcher } from "chokidar";

import type { ConfigOverlayStore } from "./config-overlay.js";
import type { SecretsStore } from "./secrets-store.js";
import type {
  CodexAuthMode,
  CodexProviderConfig,
  NotificationConfig,
  RepoConfig,
  ReasoningEffort,
  ServiceConfig,
  StateMachineConfig,
  StateStageConfig,
  SymphonyLogger,
  ValidationError,
  WorkflowDefinition,
} from "./types.js";
import { loadWorkflowDefinition } from "./workflow-loader.js";
import { DEFAULT_ACTIVE_STATES, DEFAULT_TERMINAL_STATES, normalizeStateList } from "./state-policy.js";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringMap(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function asNumberMap(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return values.length > 0 ? values : fallback;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item),
    )
    .map((item) => item);
}

function deepMerge(base: unknown, overlay: unknown): unknown {
  if (Array.isArray(overlay)) {
    return [...overlay];
  }
  if (typeof overlay !== "object" || overlay === null) {
    return overlay;
  }
  const baseRecord = asRecord(base);
  const overlayRecord = asRecord(overlay);
  const merged: Record<string, unknown> = { ...baseRecord };
  for (const [key, value] of Object.entries(overlayRecord)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      merged[key] = deepMerge(baseRecord[key], value);
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

function cloneConfigMap(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function resolveEnvBackedString(value: unknown, secretResolver?: (name: string) => string | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  const secretMatch = value.match(/^\$SECRET:([A-Za-z0-9._-]+)$/);
  if (secretMatch) {
    return secretResolver?.(secretMatch[1]) ?? "";
  }
  if (!value.startsWith("$")) {
    return value;
  }
  if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(value) === false) {
    return value;
  }

  const envName = value.slice(1);
  return process.env[envName] ?? "";
}

function expandHomePath(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  if (value === "~") {
    return process.env.HOME ?? value;
  }
  if (value.startsWith("~/")) {
    return path.join(process.env.HOME ?? "~", value.slice(2));
  }
  return value;
}

function resolveTmpDir(value: string): string {
  return value.replace("$TMPDIR", process.env.TMPDIR ?? "/tmp");
}

function resolveConfigString(value: unknown, secretResolver?: (name: string) => string | undefined): string {
  return resolveTmpDir(expandHomePath(resolveEnvBackedString(value, secretResolver)));
}

function expandPathEnvVars(value: string): string {
  return value.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name: string) => process.env[name] ?? "");
}

function resolvePathConfigString(value: unknown, secretResolver?: (name: string) => string | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  return expandPathEnvVars(resolveTmpDir(expandHomePath(resolveEnvBackedString(value, secretResolver))));
}

function asCodexAuthMode(value: unknown, fallback: CodexAuthMode): CodexAuthMode {
  return value === "openai_login" ? "openai_login" : fallback;
}

function normalizeCodexProvider(value: unknown): CodexProviderConfig | null {
  const provider = asRecord(value);
  if (Object.keys(provider).length === 0) {
    return null;
  }

  return {
    id: asString(provider.id) || null,
    name: asString(provider.name) || null,
    baseUrl: resolveConfigString(provider.base_url) || null,
    envKey: asString(provider.env_key) || null,
    envKeyInstructions: asString(provider.env_key_instructions) || null,
    wireApi: asString(provider.wire_api) || null,
    requiresOpenaiAuth: asBoolean(provider.requires_openai_auth, false),
    httpHeaders: asStringMap(provider.http_headers),
    envHttpHeaders: asStringMap(provider.env_http_headers),
    queryParams: asStringMap(provider.query_params),
  };
}

function normalizeNotifications(
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

function normalizeGitHub(
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

function normalizeRepos(value: unknown): RepoConfig[] {
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

function normalizeStateMachine(value: unknown): StateMachineConfig | null {
  const root = asRecord(value);
  const stages = asRecordArray(root.stages)
    .map((stage): StateStageConfig | null => {
      const name = asString(stage.name);
      const kind = asString(stage.kind);
      if (!name || !["backlog", "todo", "active", "terminal"].includes(kind)) {
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

function defaultApprovalPolicy(): Record<string, unknown> {
  return {
    reject: {
      sandbox_approval: true,
      rules: true,
      mcp_elicitations: true,
    },
  };
}

function normalizeTurnSandboxPolicy(value: Record<string, unknown>): { type: string; [key: string]: unknown } {
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

function normalizeApprovalPolicy(value: unknown): string | Record<string, unknown> {
  if (typeof value === "string") {
    return value;
  }
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? record : defaultApprovalPolicy();
}

function asReasoningEffort(value: unknown, fallback: ReasoningEffort | null): ReasoningEffort | null {
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

export function deriveServiceConfig(
  workflow: WorkflowDefinition,
  options?: {
    overlay?: Record<string, unknown>;
    secretResolver?: (name: string) => string | undefined;
  },
): ServiceConfig {
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

  const workspaceRoot = resolvePathConfigString(
    asString(workspace.root, path.join(os.tmpdir(), "symphony_workspaces")),
    secretResolver,
  );
  const turnSandboxPolicyRecord = asRecord(codex.turn_sandbox_policy);
  const rawHookTimeoutMs = asNumber(hooks.timeout_ms, 60000);
  const hookTimeoutMs = rawHookTimeoutMs > 0 ? rawHookTimeoutMs : 60000;
  const readTimeoutMs = asNumber(codex.read_timeout_ms, asNumber(agent.read_timeout_ms, 5000));
  const turnTimeoutMs = asNumber(codex.turn_timeout_ms, 3600000);
  const stallTimeoutMs = asNumber(codex.stall_timeout_ms, asNumber(agent.stall_timeout_ms, 300000));
  const approvalPolicy = normalizeApprovalPolicy(codex.approval_policy);
  const auth = asRecord(codex.auth);
  const trackerKind = asString(tracker.kind, "linear");
  const trackerActiveStates = asStringArray(tracker.active_states, DEFAULT_ACTIVE_STATES);
  const trackerTerminalStates = asStringArray(tracker.terminal_states, DEFAULT_TERMINAL_STATES);

  const sandbox = asRecord(codex.sandbox);
  const sandboxSecurity = asRecord(sandbox.security);
  const sandboxResources = asRecord(sandbox.resources);
  const sandboxLogs = asRecord(sandbox.logs);

  return {
    tracker: {
      kind: trackerKind,
      apiKey: resolveEnvBackedString(tracker.api_key, secretResolver),
      endpoint: resolveConfigString(tracker.endpoint, secretResolver) || "https://api.linear.app/graphql",
      projectSlug: asString(tracker.project_slug) || null,
      activeStates: trackerActiveStates,
      terminalStates: trackerTerminalStates,
    },
    notifications: normalizeNotifications(notifications, secretResolver),
    github: normalizeGitHub(github, secretResolver),
    repos: normalizeRepos(repos),
    polling: {
      intervalMs: asNumber(polling.interval_ms, 30000),
    },
    workspace: {
      root: path.resolve(workspaceRoot),
      hooks: {
        afterCreate: asString(hooks.after_create) || null,
        beforeRun: asString(hooks.before_run) || null,
        afterRun: asString(hooks.after_run) || null,
        beforeRemove: asString(hooks.before_remove) || null,
        timeoutMs: hookTimeoutMs,
      },
    },
    agent: {
      maxConcurrentAgents: asNumber(agent.max_concurrent_agents, 10),
      maxConcurrentAgentsByState: Object.fromEntries(
        Object.entries(asNumberMap(agent.max_concurrent_agents_by_state)).map(([state, limit]) => [
          state.trim().toLowerCase(),
          limit,
        ]),
      ),
      maxTurns: asNumber(agent.max_turns, 20),
      maxRetryBackoffMs: asNumber(agent.max_retry_backoff_ms, 300000),
    },
    codex: {
      command: asString(codex.command, "codex app-server"),
      model: asString(codex.model, "gpt-5.4"),
      reasoningEffort: asReasoningEffort(codex.reasoning_effort, "high"),
      approvalPolicy,
      threadSandbox: asString(codex.thread_sandbox, "workspace-write"),
      turnSandboxPolicy: normalizeTurnSandboxPolicy(turnSandboxPolicyRecord),
      readTimeoutMs,
      turnTimeoutMs,
      stallTimeoutMs,
      auth: {
        mode: asCodexAuthMode(auth.mode, "api_key"),
        sourceHome: resolveConfigString(asString(auth.source_home, "~/.codex"), secretResolver),
      },
      provider: normalizeCodexProvider(codex.provider),
      sandbox: {
        image: asString(sandbox.image, "symphony-codex:latest"),
        network: asString(sandbox.network, ""),
        security: {
          noNewPrivileges: asBoolean(sandboxSecurity.no_new_privileges, true),
          dropCapabilities: asBoolean(sandboxSecurity.drop_capabilities, true),
          gvisor: asBoolean(sandboxSecurity.gvisor, false),
        },
        resources: {
          memory: asString(sandboxResources.memory, "4g"),
          memoryReservation: asString(sandboxResources.memory_reservation, "1g"),
          memorySwap: asString(sandboxResources.memory_swap, "4g"),
          cpus: asString(sandboxResources.cpus, "2.0"),
          tmpfsSize: asString(sandboxResources.tmpfs_size, "512m"),
        },
        extraMounts: Array.isArray(sandbox.extra_mounts)
          ? sandbox.extra_mounts.filter((v): v is string => typeof v === "string")
          : [],
        envPassthrough: Array.isArray(sandbox.env_passthrough)
          ? sandbox.env_passthrough.filter((v): v is string => typeof v === "string")
          : [],
        logs: {
          driver: asString(sandboxLogs.driver, "json-file"),
          maxSize: asString(sandboxLogs.max_size, "50m"),
          maxFile: asNumber(sandboxLogs.max_file, 3),
        },
      },
    },
    stateMachine: normalizeStateMachine(stateMachine),
    server: {
      port: asNumber(server.port, 4000),
    },
  };
}

export class ConfigStore {
  private watcher: FSWatcher | null = null;
  private workflow: WorkflowDefinition | null = null;
  private config: ServiceConfig | null = null;
  private mergedConfigMap: Record<string, unknown> = {};
  private listeners = new Set<() => void>();
  private overlayUnsubscribe: (() => void) | null = null;
  private secretsUnsubscribe: (() => void) | null = null;

  constructor(
    private readonly workflowPath: string,
    private readonly logger: SymphonyLogger,
    private readonly deps?: {
      overlayStore?: Pick<ConfigOverlayStore, "toMap" | "subscribe">;
      secretsStore?: Pick<SecretsStore, "get" | "subscribe">;
    },
  ) {}

  async start(): Promise<void> {
    await this.refresh("startup");
    this.overlayUnsubscribe =
      this.deps?.overlayStore?.subscribe(() => {
        void this.refresh("overlay:change");
      }) ?? null;
    this.secretsUnsubscribe =
      this.deps?.secretsStore?.subscribe(() => {
        void this.refresh("secrets:change");
      }) ?? null;
    this.watcher = chokidar.watch(this.workflowPath, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
    });
    this.watcher.on("add", () => void this.refresh("watch:add"));
    this.watcher.on("change", () => void this.refresh("watch:change"));
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.overlayUnsubscribe?.();
    this.overlayUnsubscribe = null;
    this.secretsUnsubscribe?.();
    this.secretsUnsubscribe = null;
  }

  async refresh(reason: string): Promise<void> {
    try {
      const workflow = await loadWorkflowDefinition(this.workflowPath);
      const overlay = cloneConfigMap(this.deps?.overlayStore?.toMap() ?? {});
      const mergedConfigMap = deepMerge(workflow.config, overlay) as Record<string, unknown>;
      const config = deriveServiceConfig(workflow, {
        overlay,
        secretResolver: (name) => this.deps?.secretsStore?.get(name) ?? undefined,
      });
      this.workflow = workflow;
      this.config = config;
      this.mergedConfigMap = mergedConfigMap;
      this.logger.info({ workflowPath: this.workflowPath, reason }, "workflow loaded");
      for (const listener of this.listeners) {
        listener();
      }
    } catch (error) {
      if (this.config === null || this.workflow === null) {
        throw error;
      }
      this.logger.error(
        {
          workflowPath: this.workflowPath,
          reason,
          error: error instanceof Error ? error.message : String(error),
        },
        "workflow reload rejected; keeping last known good config",
      );
    }
  }

  getWorkflow(): WorkflowDefinition {
    if (!this.workflow) {
      throw new Error("config store has not been started");
    }
    return this.workflow;
  }

  getConfig(): ServiceConfig {
    if (!this.config) {
      throw new Error("config store has not been started");
    }
    return this.config;
  }

  getMergedConfigMap(): Record<string, unknown> {
    return cloneConfigMap(this.mergedConfigMap);
  }

  validateDispatch(): ValidationError | null {
    const config = this.getConfig();
    if (config.tracker.kind !== "linear") {
      return {
        code: "invalid_tracker_kind",
        message: `tracker.kind must be "linear"; received ${JSON.stringify(config.tracker.kind)}`,
      };
    }
    if (!config.tracker.apiKey) {
      return {
        code: "missing_tracker_api_key",
        message: "tracker.api_key is required after env resolution",
      };
    }
    if (!config.tracker.endpoint) {
      return {
        code: "missing_tracker_endpoint",
        message: "tracker.endpoint is required",
      };
    }
    if (config.tracker.kind === "linear" && !config.tracker.projectSlug) {
      return {
        code: "missing_tracker_project_slug",
        message: "tracker.project_slug is required when tracker.kind is linear",
      };
    }
    if (normalizeStateList(config.tracker.activeStates).length === 0) {
      return {
        code: "invalid_tracker_active_states",
        message: "tracker.active_states must contain at least one state",
      };
    }
    if (normalizeStateList(config.tracker.terminalStates).length === 0) {
      return {
        code: "invalid_tracker_terminal_states",
        message: "tracker.terminal_states must contain at least one state",
      };
    }
    if (!config.codex.command) {
      return {
        code: "missing_codex_command",
        message: "codex.command is required",
      };
    }
    if (!["api_key", "openai_login"].includes(config.codex.auth.mode)) {
      return {
        code: "invalid_codex_auth_mode",
        message: "codex.auth.mode must be either api_key or openai_login",
      };
    }
    if (
      config.codex.auth.mode === "openai_login" &&
      !existsSync(path.join(config.codex.auth.sourceHome, "auth.json"))
    ) {
      return {
        code: "missing_codex_auth_json",
        message: `codex.auth.mode=openai_login requires auth.json at ${path.join(config.codex.auth.sourceHome, "auth.json")}`,
      };
    }
    if (config.codex.provider && !config.codex.provider.baseUrl) {
      return {
        code: "missing_codex_provider_base_url",
        message: "codex.provider.base_url is required when codex.provider is configured",
      };
    }
    if (
      config.codex.auth.mode === "openai_login" &&
      config.codex.provider &&
      !config.codex.provider.requiresOpenaiAuth
    ) {
      return {
        code: "invalid_codex_provider_auth_mode",
        message:
          "codex.provider.requires_openai_auth must be true when codex.auth.mode=openai_login and a custom provider is configured",
      };
    }
    if (config.codex.auth.mode === "api_key") {
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
        if (!process.env[envName]) {
          return {
            code: "missing_codex_provider_env",
            message: `codex runtime requires ${envName} in the host environment`,
          };
        }
      }
    }
    if (config.codex.turnTimeoutMs <= 0) {
      return {
        code: "invalid_turn_timeout_ms",
        message: "codex.turn_timeout_ms must be greater than zero",
      };
    }
    return null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
