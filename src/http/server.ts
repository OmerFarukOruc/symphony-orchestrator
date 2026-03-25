import { randomUUID } from "node:crypto";
import { join } from "node:path";

import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyRateLimit from "@fastify/rate-limit";

import type { ConfigStore } from "../config/store.js";
import { registerHttpRoutes } from "./routes.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";

import type { ConfigOverlayStore } from "../config/overlay.js";
import type { SecretsStore } from "../secrets/store.js";
import type { SymphonyLogger } from "../core/types.js";
import { globalMetrics } from "../observability/metrics.js";
import { buildOpenApiDocument } from "./openapi.js";
import type { LinearClient } from "../linear/client.js";

const SSE_HEARTBEAT_INTERVAL_MS = 5_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 300;

const defaultFrontendDist = join(process.cwd(), "dist/frontend");

export interface HttpServerDeps {
  orchestrator: Orchestrator;
  logger: SymphonyLogger;
  linearClient?: LinearClient;
  configStore?: ConfigStore;
  configOverlayStore?: ConfigOverlayStore;
  secretsStore?: SecretsStore;
  frontendDir?: string;
  archiveDir?: string;
}

export class HttpServer {
  private readonly app: FastifyInstance;
  private readonly deps: HttpServerDeps;

  constructor(deps: HttpServerDeps) {
    this.deps = deps;
    // eslint-disable-next-line sonarjs/no-async-constructor -- constructor is sync; Fastify() is not async
    this.app = Fastify({
      logger: false,
      disableRequestLogging: true,
    });
  }

  async start(port: number): Promise<{ port: number }> {
    this.registerCoreHooks();

    // Register rate limiting
    await this.app.register(fastifyRateLimit, {
      max: RATE_LIMIT_MAX_REQUESTS,
      timeWindow: RATE_LIMIT_WINDOW_MS,
      allowList: (request) => {
        const path = request.url;
        return !path.startsWith("/api/") && path !== "/metrics";
      },
    });

    // Register routes
    this.registerRoutes();

    // Serve static frontend files
    const staticRoot = this.deps.frontendDir ?? defaultFrontendDist;
    await this.app.register(fastifyStatic, {
      root: staticRoot,
      prefix: "/",
      wildcard: false,
    });

    // SPA fallback — serve index.html for non-API routes
    this.app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/") || request.url === "/metrics") {
        reply.status(404).send({ error: { code: "not_found", message: "Not found" } });
        return;
      }
      reply.sendFile("index.html");
    });

    const host = process.env.SYMPHONY_BIND ?? "127.0.0.1";
    const address = await this.app.listen({ port, host });
    const matched = /:(\d+)$/.exec(address);
    if (matched) {
      return { port: Number(matched[1]) };
    }
    return { port };
  }

  async stop(): Promise<void> {
    await this.app.close();
  }

  private registerCoreHooks(): void {
    this.app.addHook("onRequest", (request, reply, done) => {
      const incoming = request.headers["x-request-id"];
      const requestId = typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();
      reply.header("X-Request-ID", requestId);
      const raw = request.raw as { requestId?: string; startedAt?: bigint };
      raw.requestId = requestId;
      raw.startedAt = process.hrtime.bigint();
      done();
    });
    this.app.addHook("onResponse", (request, reply, done) => {
      const raw = request.raw as { startedAt?: bigint };
      const startedAt = raw.startedAt ?? process.hrtime.bigint();
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      globalMetrics.httpRequestsTotal.increment({
        method: request.method,
        status: String(reply.statusCode),
      });
      globalMetrics.httpRequestDurationSeconds.observe(durationSeconds, {
        method: request.method,
        status: String(reply.statusCode),
      });
      done();
    });
  }

  private registerRoutes(): void {
    this.app.get("/openapi.json", async () => buildOpenApiDocument());
    this.app.get("/api/v1/events", async (_request, reply) => {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      reply.hijack();
      const writeMessage = () => {
        reply.raw.write(`data: ${JSON.stringify({ type: "invalidate", at: new Date().toISOString() })}\n\n`);
      };
      writeMessage();
      const interval = setInterval(writeMessage, SSE_HEARTBEAT_INTERVAL_MS);
      reply.raw.on("close", () => {
        clearInterval(interval);
      });
    });

    // Register all API routes directly on Fastify
    registerHttpRoutes(this.app, this.deps);
  }
}
