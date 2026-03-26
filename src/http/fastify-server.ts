import { randomUUID } from "node:crypto";
import { join } from "node:path";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import fastifySwagger from "@fastify/swagger";
import Fastify, { type FastifyInstance } from "fastify";
import { schemas } from "@symphony/shared";

import type { ConfigStore } from "../config/store.js";
import { REQUEST_ID_HEADER, resolveRequestId, runWithRequestContext } from "../observability/tracing.js";
import { globalMetrics } from "../observability/prom-client-metrics.js";
import type { RuntimeSnapshot, SymphonyLogger } from "../core/types.js";
import type { ConfigOverlayStore } from "../config/overlay.js";
import type { SecretBackend } from "@symphony/shared";
import type { LinearClient } from "../linear/client.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import {
  registerFastifyHttpRoutes,
  type ControlPlaneInvalidationEvent,
  type FastifyRouteDeps,
} from "./fastify-routes.js";
import { createError, serializeSnapshot } from "./route-helpers.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;
const RETRY_INTERVAL_MS = 5_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 300;
const defaultFrontendDist = join(process.cwd(), "dist/frontend");
const LOCAL_FRONTEND_ORIGIN = "http://127.0.0.1:4001";
const LOCALHOST_FRONTEND_ORIGIN = "http://localhost:4001";

interface Subscribable {
  subscribe(listener: () => void): () => void;
}

interface CorsDecisionCallback {
  (error: Error | null, allow: boolean): void;
}

export interface FastifyServerDeps {
  orchestrator: Orchestrator;
  logger: SymphonyLogger;
  linearClient?: LinearClient;
  configStore?: ConfigStore;
  configOverlayStore?: ConfigOverlayStore;
  secretsStore?: SecretBackend;
  frontendDir?: string;
  archiveDir?: string;
}

interface SseClient {
  id: string;
  reply: {
    raw: NodeJS.WritableStream & { writeHead(statusCode: number, headers: Record<string, string | number>): void };
  };
  heartbeat: NodeJS.Timeout;
}

type SseResponseHeaders = Record<string, string>;

function resolveSseOrigin(origin: string | undefined): string | null {
  if (origin === LOCAL_FRONTEND_ORIGIN) {
    return LOCAL_FRONTEND_ORIGIN;
  }
  if (origin === LOCALHOST_FRONTEND_ORIGIN) {
    return LOCALHOST_FRONTEND_ORIGIN;
  }
  return null;
}

function buildSseHeaders(origin: string | undefined): SseResponseHeaders {
  const headers: SseResponseHeaders = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };
  const allowedOrigin = resolveSseOrigin(origin);
  if (allowedOrigin !== null) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
  }
  return headers;
}

export class FastifyServer {
  private readonly app: FastifyInstance;
  private readonly clients = new Map<string, SseClient>();
  private pollTimer: NodeJS.Timeout | null = null;
  private lastEventFingerprint = "";
  private lastAttemptFingerprint = "";
  private lastSnapshotFingerprint = "";
  private unsubscribeConfig: (() => void) | null = null;
  private unsubscribeSecrets: (() => void) | null = null;

  /* eslint-disable sonarjs/no-async-constructor -- Fastify() is synchronous */
  constructor(private readonly deps: FastifyServerDeps) {
    this.app = Fastify({ logger: false, disableRequestLogging: true });
  }
  /* eslint-enable sonarjs/no-async-constructor */

  async start(port: number): Promise<{ port: number }> {
    this.registerCoreHooks();
    this.registerSharedSchemas();
    this.registerErrorHandler();

    await this.app.register(fastifySwagger, {
      openapi: {
        openapi: "3.1.0",
        info: {
          title: "Symphony Orchestrator Control Plane API",
          version: process.env.npm_package_version ?? "unknown",
        },
      },
    });
    await this.app.register(fastifyCors, {
      origin: (origin: string | undefined, callback: CorsDecisionCallback) => {
        if (!origin || origin === "http://127.0.0.1:4001" || origin === "http://localhost:4001") {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
    });
    await this.app.register(fastifyRateLimit, {
      max: RATE_LIMIT_MAX_REQUESTS,
      timeWindow: RATE_LIMIT_WINDOW_MS,
      allowList: (request) => !request.url.startsWith("/api/") && request.url !== "/metrics",
    });

    this.registerDocumentationRoutes();
    this.registerEventStream();
    registerFastifyHttpRoutes(this.app, this.routeDeps());

    const staticRoot = this.deps.frontendDir ?? defaultFrontendDist;
    await this.app.register(fastifyStatic, { root: staticRoot, prefix: "/", wildcard: true });
    this.app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/") || request.url === "/metrics") {
        reply.status(404).send(createError("not_found", "Not found"));
        return;
      }
      reply.sendFile("index.html");
    });

    this.subscribeStores();
    const host = process.env.SYMPHONY_BIND ?? "127.0.0.1";
    const address = await this.app.listen({ port, host });
    const matched = /:(\d+)$/.exec(address);
    return { port: matched ? Number(matched[1]) : port };
  }

  async stop(): Promise<void> {
    this.unsubscribeConfig?.();
    this.unsubscribeSecrets?.();
    this.unsubscribeConfig = null;
    this.unsubscribeSecrets = null;
    this.stopPolling();
    for (const client of this.clients.values()) {
      clearInterval(client.heartbeat);
      client.reply.raw.end();
    }
    this.clients.clear();
    await this.app.close();
  }

  private routeDeps(): FastifyRouteDeps {
    return {
      orchestrator: this.deps.orchestrator,
      linearClient: this.deps.linearClient,
      configStore: this.deps.configStore,
      configOverlayStore: this.deps.configOverlayStore,
      secretsStore: this.deps.secretsStore,
      frontendDir: this.deps.frontendDir,
      archiveDir: this.deps.archiveDir,
      emitInvalidation: (event) => this.broadcast(event),
    };
  }

  private registerCoreHooks(): void {
    this.app.addHook("onRequest", (request, reply, done) => {
      const requestId = resolveRequestId(request.headers["x-request-id"]);
      reply.header(REQUEST_ID_HEADER, requestId);
      const raw = request.raw as { requestId?: string; startedAt?: bigint };
      raw.requestId = requestId;
      raw.startedAt = process.hrtime.bigint();
      runWithRequestContext(requestId, done);
    });

    this.app.addHook("onResponse", (request, reply, done) => {
      const raw = request.raw as { startedAt?: bigint };
      const startedAt = raw.startedAt ?? process.hrtime.bigint();
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      globalMetrics.httpRequestsTotal.increment({ method: request.method, status: String(reply.statusCode) });
      globalMetrics.httpRequestDurationSeconds.observe(durationSeconds, {
        method: request.method,
        status: String(reply.statusCode),
      });
      done();
    });
  }

  private registerSharedSchemas(): void {
    for (const [name, schema] of Object.entries(schemas)) {
      if (!name.endsWith("Schema") || !schema || typeof schema !== "object") continue;
      this.app.addSchema({ ...(schema as Record<string, unknown>), $id: name });
    }
  }

  private registerDocumentationRoutes(): void {
    this.app.get("/openapi.json", async () => this.app.swagger());
    this.app.get("/docs", async () => this.app.swagger());
  }

  private registerErrorHandler(): void {
    this.app.setErrorHandler((error, request, reply) => {
      const message = error instanceof Error ? error.message : String(error);
      const hasValidation = typeof error === "object" && error !== null && "validation" in error;

      if (hasValidation) {
        this.deps.logger.warn({ error: message, url: request.url }, "fastify validation failed");
        reply.status(400).send(createError("not_found", message));
        return;
      }
      this.deps.logger.error({ error: message, url: request.url }, "fastify route failed");
      reply.status(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    });
  }

  private registerEventStream(): void {
    this.app.get("/api/v1/events", (request, reply) => {
      reply.raw.writeHead(200, buildSseHeaders(request.headers.origin));
      reply.hijack();
      reply.raw.write(`retry: ${RETRY_INTERVAL_MS}\n`);
      reply.raw.write("\n");

      const clientId = randomUUID();
      const heartbeat = setInterval(() => {
        reply.raw.write(":heartbeat\n\n");
      }, HEARTBEAT_INTERVAL_MS);

      const client: SseClient = { id: clientId, reply, heartbeat };
      this.clients.set(clientId, client);
      this.startPolling();

      this.broadcastToClient(client, {
        type: "snapshot",
        state: serializeSnapshot(this.deps.orchestrator.getSnapshot() as RuntimeSnapshot & Record<string, unknown>),
      });

      reply.raw.on("close", () => {
        clearInterval(heartbeat);
        this.clients.delete(clientId);
        if (this.clients.size === 0) {
          this.stopPolling();
        }
      });
    });
  }

  private subscribeStores(): void {
    const configStore = this.deps.configStore as ConfigStore & Partial<Subscribable>;
    if (typeof configStore?.subscribe === "function") {
      this.unsubscribeConfig = configStore.subscribe(() => {
        this.broadcast({ type: "config", key: "*", value: "changed" });
      });
    }

    const secretsStore = this.deps.secretsStore as SecretBackend & Partial<Subscribable>;
    if (typeof secretsStore?.subscribe === "function") {
      this.unsubscribeSecrets = secretsStore.subscribe(() => {
        this.broadcast({ type: "secret", key: "*", action: "set" });
      });
    }
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.refreshFingerprints();
    this.pollTimer = setInterval(() => {
      this.pollInvalidations();
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private pollInvalidations(): void {
    const snapshot = this.deps.orchestrator.getSnapshot();
    const serialized = serializeSnapshot(snapshot as RuntimeSnapshot & Record<string, unknown>);
    const snapshotFingerprint = JSON.stringify({
      counts: serialized.counts,
      running: serialized.running,
      retrying: serialized.retrying,
      completed: serialized.completed,
    });
    if (snapshotFingerprint !== this.lastSnapshotFingerprint) {
      this.lastSnapshotFingerprint = snapshotFingerprint;
      this.broadcast({ type: "snapshot", state: serialized });
    }

    const latestEvent = snapshot.recentEvents.at(-1) ?? null;
    const eventFingerprint = latestEvent
      ? JSON.stringify([latestEvent.at, latestEvent.issueId, latestEvent.event, latestEvent.message])
      : "";
    if (eventFingerprint !== this.lastEventFingerprint && latestEvent) {
      this.lastEventFingerprint = eventFingerprint;
      this.broadcast({
        type: "event",
        attempt_id: null,
        event_type: latestEvent.event,
        data: {
          issue_id: latestEvent.issueId,
          issue_identifier: latestEvent.issueIdentifier,
          session_id: latestEvent.sessionId,
          message: latestEvent.message,
        },
      });
    }

    const attemptFingerprint = JSON.stringify(
      [...snapshot.running, ...snapshot.retrying].map((issue) => [
        issue.issueId,
        issue.identifier,
        issue.attempt ?? null,
        issue.status ?? null,
      ]),
    );
    if (attemptFingerprint !== this.lastAttemptFingerprint) {
      this.lastAttemptFingerprint = attemptFingerprint;
      for (const issue of [...snapshot.running, ...snapshot.retrying]) {
        this.broadcast({
          type: "attempt",
          issue_id: issue.issueId ?? null,
          attempt_id: issue.attempt === null || issue.attempt === undefined ? null : String(issue.attempt),
          status: issue.status ?? null,
        });
      }
    }
  }

  private refreshFingerprints(): void {
    const snapshot = this.deps.orchestrator.getSnapshot();
    const serialized = serializeSnapshot(snapshot as RuntimeSnapshot & Record<string, unknown>);
    this.lastSnapshotFingerprint = JSON.stringify({
      counts: serialized.counts,
      running: serialized.running,
      retrying: serialized.retrying,
      completed: serialized.completed,
    });
    const latestEvent = snapshot.recentEvents.at(-1) ?? null;
    this.lastEventFingerprint = latestEvent
      ? JSON.stringify([latestEvent.at, latestEvent.issueId, latestEvent.event, latestEvent.message])
      : "";
    this.lastAttemptFingerprint = JSON.stringify(
      [...snapshot.running, ...snapshot.retrying].map((issue) => [
        issue.issueId,
        issue.identifier,
        issue.attempt ?? null,
        issue.status ?? null,
      ]),
    );
  }

  private broadcast(event: ControlPlaneInvalidationEvent): void {
    for (const client of this.clients.values()) {
      this.broadcastToClient(client, event);
    }
  }

  private broadcastToClient(client: SseClient, event: ControlPlaneInvalidationEvent): void {
    const eventName = event.type;
    client.reply.raw.write(`event: ${eventName}\n`);
    client.reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}
