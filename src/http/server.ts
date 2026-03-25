import { randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance } from "fastify";
import fastifyExpress from "@fastify/express";
import express from "express";
import type { ConfigStore } from "../config/store.js";
import { registerHttpRoutes } from "./routes.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";

import type { ConfigOverlayStore } from "../config/overlay.js";
import type { SecretsStore } from "../secrets/store.js";
import type { SymphonyLogger } from "../core/types.js";
import { globalMetrics } from "../observability/metrics.js";
import { tracingMiddleware } from "../observability/tracing.js";
import type { LinearClient } from "../linear/client.js";
import { buildOpenApiDocument } from "./openapi.js";

const SSE_HEARTBEAT_INTERVAL_MS = 5_000;

export class HttpServer {
  private readonly app: FastifyInstance;
  private expressBridgeReady = false;

  constructor(
    private readonly deps: {
      orchestrator: Orchestrator;
      logger: SymphonyLogger;
      linearClient?: LinearClient;
      configStore?: ConfigStore;
      configOverlayStore?: ConfigOverlayStore;
      secretsStore?: SecretsStore;

      frontendDir?: string;
      archiveDir?: string;
    },
  ) {
    // eslint-disable-next-line sonarjs/no-async-constructor
    this.app = Fastify({
      logger: false,
      disableRequestLogging: true,
    });
    this.registerCoreHooks();
    this.registerFastifyRoutes();
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

  private registerFastifyRoutes(): void {
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
  }

  async start(port: number): Promise<{ port: number }> {
    if (!this.expressBridgeReady) {
      await this.app.register(fastifyExpress);
      const expressApp = express();
      expressApp.disable("x-powered-by");
      expressApp.use(tracingMiddleware);
      expressApp.use(express.json());
      registerHttpRoutes(expressApp, this.deps);
      this.app.use(expressApp);
      this.expressBridgeReady = true;
    }
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
}
