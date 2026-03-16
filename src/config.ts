import path from "node:path";

import chokidar, { type FSWatcher } from "chokidar";

import type { ReasoningEffort, ServiceConfig, SymphonyLogger, ValidationError, WorkflowDefinition } from "./types.js";
import { loadWorkflowDefinition } from "./workflow-loader.js";

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

function resolveEnvBackedString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  if (!value.startsWith("$")) {
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

export function deriveServiceConfig(workflow: WorkflowDefinition): ServiceConfig {
  const root = asRecord(workflow.config);
  const tracker = asRecord(root.tracker);
  const polling = asRecord(root.polling);
  const workspace = asRecord(root.workspace);
  const hooks = asRecord(root.hooks);
  const agent = asRecord(root.agent);
  const codex = asRecord(root.codex);
  const server = asRecord(root.server);

  const workspaceRoot = resolveTmpDir(expandHomePath(asString(workspace.root, "./workspaces")));
  const turnSandboxPolicyRecord = asRecord(codex.turn_sandbox_policy);
  const hookTimeoutMs = asNumber(hooks.timeout_ms, 60000);
  const readTimeoutMs = asNumber(codex.read_timeout_ms, asNumber(agent.read_timeout_ms, 5000));
  const turnTimeoutMs = asNumber(codex.turn_timeout_ms, 3600000);
  const stallTimeoutMs = asNumber(codex.stall_timeout_ms, asNumber(agent.stall_timeout_ms, 300000));
  const approvalPolicy = normalizeApprovalPolicy(codex.approval_policy);

  const sandbox = asRecord(codex.sandbox);
  const sandboxSecurity = asRecord(sandbox.security);
  const sandboxResources = asRecord(sandbox.resources);
  const sandboxLogs = asRecord(sandbox.logs);

  return {
    tracker: {
      kind: "linear",
      apiKey: resolveEnvBackedString(tracker.api_key),
      projectSlug: asString(tracker.project_slug) || null,
    },
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
      maxConcurrentAgents: asNumber(agent.max_concurrent_agents, 4),
      maxTurns: asNumber(agent.max_turns, 20),
      maxRetryBackoffMs: asNumber(agent.max_retry_backoff_ms, 120000),
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
      sandbox: {
        enabled: asBoolean(sandbox.enabled, true),
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
    server: {
      port: asNumber(server.port, 4000),
    },
  };
}

export class ConfigStore {
  private watcher: FSWatcher | null = null;
  private workflow: WorkflowDefinition | null = null;
  private config: ServiceConfig | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly workflowPath: string,
    private readonly logger: SymphonyLogger,
  ) {}

  async start(): Promise<void> {
    await this.refresh("startup");
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
  }

  async refresh(reason: string): Promise<void> {
    try {
      const workflow = await loadWorkflowDefinition(this.workflowPath);
      const config = deriveServiceConfig(workflow);
      this.workflow = workflow;
      this.config = config;
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

  validateDispatch(): ValidationError | null {
    const config = this.getConfig();
    if (!config.tracker.apiKey) {
      return {
        code: "missing_tracker_api_key",
        message: "tracker.api_key is required after env resolution",
      };
    }
    if (!config.codex.command) {
      return {
        code: "missing_codex_command",
        message: "codex.command is required",
      };
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
