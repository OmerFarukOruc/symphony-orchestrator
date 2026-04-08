import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createSuccessResponse } from "./protocol.js";
import { buildConfigToml } from "./runtime-config.js";
import { CODEX_METHOD } from "./methods.js";
import { JsonRpcConnection } from "../agent/json-rpc-connection.js";
import type { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { CodexConfig } from "../core/types/codex.js";
import type { RisolutoLogger } from "../core/types.js";
import { asRecord, asStringOrNull as asString } from "../utils/type-guards.js";

type CapabilityState = "supported" | "unsupported" | "unknown";

interface CapabilityRegistry {
  connectedAt: string | null;
  initializationError: string | null;
  methods: Record<string, CapabilityState>;
  notifications: Record<string, "enabled">;
}

interface PendingServerRequest {
  requestId: string;
  method: string;
  threadId: string | null;
  turnId: string | null;
  params: Record<string, unknown>;
  createdAt: string;
  resolve: (options: { writeResponse: boolean; result?: unknown }) => void;
}

export interface PendingUserInputRequest {
  requestId: string;
  method: string;
  threadId: string | null;
  turnId: string | null;
  questions: unknown[];
  createdAt: string;
}

export class CodexControlPlaneMethodUnsupportedError extends Error {
  constructor(
    readonly method: string,
    message = `Codex method ${method} is unavailable on the connected app-server`,
  ) {
    super(message);
    this.name = "CodexControlPlaneMethodUnsupportedError";
  }
}

const SAFE_PROBES: Array<{ method: string; params: Record<string, unknown> }> = [
  { method: CODEX_METHOD.AccountRead, params: { refreshToken: false } },
  { method: CODEX_METHOD.AccountRateLimitsRead, params: {} },
  { method: CODEX_METHOD.ConfigRead, params: { includeLayers: false } },
  { method: CODEX_METHOD.ConfigRequirementsRead, params: {} },
  { method: CODEX_METHOD.ModelList, params: { limit: 1, includeHidden: false } },
  { method: CODEX_METHOD.ThreadList, params: { limit: 1 } },
  { method: CODEX_METHOD.ThreadLoadedList, params: {} },
  { method: CODEX_METHOD.ExperimentalFeatureList, params: { limit: 1 } },
  { method: CODEX_METHOD.CollaborationModeList, params: {} },
  { method: CODEX_METHOD.McpServerStatusList, params: { limit: 1 } },
];

const NOTIFICATION_METHODS = [
  "thread/archived",
  "thread/unarchived",
  "thread/closed",
  "serverRequest/resolved",
  "app/list/updated",
  "windowsSandbox/setupCompleted",
  "account/login/completed",
  "account/updated",
  "account/rateLimits/updated",
  "mcpServer/oauthLogin/completed",
] as const;

function splitCommand(command: string): { program: string; args: string[] } {
  const parts = command
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return { program: "codex", args: ["app-server"] };
  }
  return {
    program: parts[0] ?? "codex",
    args: parts.slice(1),
  };
}

function methodLooksUnsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("unknown request method") ||
    message.includes("Method not found") ||
    message.includes("requires experimentalApi capability")
  );
}

export class CodexControlPlane {
  private child: ChildProcessWithoutNullStreams | null = null;
  private connection: JsonRpcConnection | null = null;
  private connectPromise: Promise<void> | null = null;
  private codexHome: string | null = null;
  private readonly capabilityRegistry: CapabilityRegistry = {
    connectedAt: null,
    initializationError: null,
    methods: {},
    notifications: Object.fromEntries(NOTIFICATION_METHODS.map((method) => [method, "enabled"])) as Record<
      string,
      "enabled"
    >,
  };
  private readonly pendingServerRequests = new Map<string, PendingServerRequest>();

  constructor(
    private readonly getCodexConfig: () => CodexConfig,
    private readonly logger: RisolutoLogger,
    private readonly eventBus?: TypedEventBus<RisolutoEventMap>,
  ) {}

  async getCapabilities(): Promise<CapabilityRegistry> {
    try {
      await this.ensureConnected();
    } catch {
      // Return the last known registry even when connection setup fails.
    }
    return {
      connectedAt: this.capabilityRegistry.connectedAt,
      initializationError: this.capabilityRegistry.initializationError,
      methods: { ...this.capabilityRegistry.methods },
      notifications: { ...this.capabilityRegistry.notifications },
    };
  }

  listPendingUserInputRequests(): PendingUserInputRequest[] {
    return [...this.pendingServerRequests.values()]
      .filter(
        (request) =>
          request.method === CODEX_METHOD.ToolRequestUserInput ||
          request.method === CODEX_METHOD.ItemToolRequestUserInput,
      )
      .map((request) => ({
        requestId: request.requestId,
        method: request.method,
        threadId: request.threadId,
        turnId: request.turnId,
        questions: Array.isArray(request.params.questions) ? request.params.questions : [],
        createdAt: request.createdAt,
      }));
  }

  async respondToRequest(requestId: string, result: unknown): Promise<boolean> {
    const pending = this.pendingServerRequests.get(requestId);
    if (!pending) {
      return false;
    }
    this.pendingServerRequests.delete(requestId);
    pending.resolve({ writeResponse: true, result });
    return true;
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    await this.ensureConnected();
    const activeConnection = this.connection;
    if (!activeConnection || activeConnection.exited) {
      throw new Error("codex control-plane connection is unavailable");
    }
    try {
      const result = await activeConnection.request(method, params);
      this.capabilityRegistry.methods[method] = "supported";
      return result;
    } catch (error) {
      if (methodLooksUnsupported(error)) {
        this.capabilityRegistry.methods[method] = "unsupported";
        throw new CodexControlPlaneMethodUnsupportedError(method);
      }
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    for (const pending of this.pendingServerRequests.values()) {
      pending.resolve({ writeResponse: false });
    }
    this.pendingServerRequests.clear();
    this.connection?.close();
    this.connection = null;
    this.child = null;
    if (this.codexHome) {
      await rm(this.codexHome, { recursive: true, force: true }).catch(() => {});
      this.codexHome = null;
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.connection && !this.connection.exited) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = (async () => {
      const codexConfig = this.getCodexConfig();
      const { program, args } = splitCommand(codexConfig.command || "codex app-server");

      const codexHome = await mkdtemp(path.join(tmpdir(), "risoluto-cp-"));
      await writeFile(path.join(codexHome, "config.toml"), buildConfigToml(codexConfig));
      if (codexConfig.auth.mode === "openai_login" && codexConfig.auth.sourceHome) {
        const srcAuth = path.join(codexConfig.auth.sourceHome, "auth.json");
        await cp(srcAuth, path.join(codexHome, "auth.json")).catch(() => {});
      }
      this.codexHome = codexHome;

      const child = spawn(program, args, {
        env: { ...process.env, CODEX_HOME: codexHome },
      });
      const connection = new JsonRpcConnection(
        child,
        this.logger.child({ component: "codex-control-plane-rpc" }),
        codexConfig.readTimeoutMs,
        async (request) => {
          await this.handleServerRequest(child, request.id, request.method, asRecord(request.params));
        },
        (notification) => {
          this.handleNotification(notification.method, asRecord(notification.params));
        },
      );

      this.child = child;
      this.connection = connection;

      try {
        await connection.request(CODEX_METHOD.Initialize, {
          clientInfo: {
            name: "risoluto_control_plane",
            title: "Risoluto Control Plane",
            version: process.env.npm_package_version ?? "unknown",
          },
          capabilities: {
            experimentalApi: true,
          },
        });
        connection.notify(CODEX_METHOD.Initialized, {});
        this.capabilityRegistry.connectedAt = new Date().toISOString();
        this.capabilityRegistry.initializationError = null;
        await this.probeCapabilities();
      } catch (error) {
        this.capabilityRegistry.initializationError = error instanceof Error ? error.message : String(error);
        connection.close();
        this.connection = null;
        this.child = null;
        if (this.codexHome) {
          await rm(this.codexHome, { recursive: true, force: true }).catch(() => {});
          this.codexHome = null;
        }
        throw error;
      }
    })();

    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async probeCapabilities(): Promise<void> {
    for (const probe of SAFE_PROBES) {
      try {
        await this.request(probe.method, probe.params);
      } catch (error) {
        if (!(error instanceof CodexControlPlaneMethodUnsupportedError)) {
          this.logger.debug(
            { method: probe.method, error: error instanceof Error ? error.message : String(error) },
            "codex capability probe failed",
          );
        }
      }
    }
  }

  private async handleServerRequest(
    child: ChildProcessWithoutNullStreams,
    id: string | number,
    method: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    if (method === CODEX_METHOD.ToolRequestUserInput || method === CODEX_METHOD.ItemToolRequestUserInput) {
      const requestId = String(id);
      await new Promise<void>((resolve) => {
        this.pendingServerRequests.set(requestId, {
          requestId,
          method,
          threadId: asString(params.threadId),
          turnId: asString(params.turnId),
          params,
          createdAt: new Date().toISOString(),
          resolve: ({ writeResponse, result }) => {
            if (writeResponse) {
              child.stdin.write(`${JSON.stringify(createSuccessResponse(id, { result }))}\n`);
            }
            resolve();
          },
        });
        this.emitCodexEvent("codex.server_request", {
          requestId,
          method,
          threadId: asString(params.threadId),
          turnId: asString(params.turnId),
          params,
          createdAt: new Date().toISOString(),
        });
      });
      return;
    }

    let response: unknown;
    switch (method) {
      case "item/commandExecution/requestApproval":
      case "item/fileChange/requestApproval":
        response = { decision: "acceptForSession" };
        break;
      case "item/permissions/requestApproval":
        response = { permissions: params.permissionProfile ?? params.permissions ?? null, scope: "session" };
        break;
      default:
        response = { error: { code: -32601, message: `unsupported host-side codex request: ${method}` } };
        break;
    }
    child.stdin.write(`${JSON.stringify(createSuccessResponse(id, response))}\n`);
  }

  private handleNotification(method: string, params: Record<string, unknown>): void {
    if (method === "serverRequest/resolved") {
      const requestId = asString(params.requestId);
      if (requestId) {
        const pending = this.pendingServerRequests.get(requestId);
        if (pending) {
          this.pendingServerRequests.delete(requestId);
          pending.resolve({ writeResponse: false });
        }
      }
    }

    this.emitCodexEvent("codex.event", {
      method,
      params,
      receivedAt: new Date().toISOString(),
    });
  }

  private emitCodexEvent(
    channel: "codex.event" | "codex.server_request",
    payload: RisolutoEventMap["codex.event"] | RisolutoEventMap["codex.server_request"],
  ): void {
    this.eventBus?.emit(channel, payload);
  }
}
