import http, { type IncomingMessage } from "node:http";

import express, { type Express } from "express";

import type { WebhookRequest } from "./webhook-types.js";
import type { HttpRouteDeps } from "./route-types.js";

import { createMetricsCollector } from "../observability/metrics.js";
import { createObservabilityHub, type ObservabilityHub } from "../observability/hub.js";
import { getRequestId, tracingMiddleware } from "../observability/tracing.js";

import { registerHttpRoutes } from "./routes.js";
import { createReadGuard, hasConfiguredReadAccessToken } from "./read-guard.js";
import { createWriteGuard } from "./write-guard.js";
import { serviceErrorHandler } from "./service-errors.js";

function isLoopbackBindHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export class HttpServer {
  private readonly app: Express;
  private readonly observability: ObservabilityHub;
  private server: http.Server | null = null;

  constructor(private readonly deps: HttpRouteDeps) {
    this.app = express();
    this.app.disable("x-powered-by");
    this.app.set("trust proxy", process.env.RISOLUTO_TRUST_PROXY === "true" ? 1 : false);
    this.app.use(tracingMiddleware);
    const metrics = this.deps.metrics ?? createMetricsCollector();
    this.observability = this.deps.observability ?? createObservabilityHub({ archiveDir: this.deps.archiveDir });
    const httpObserver = this.observability.getComponent("http");
    this.app.use((request, response, next) => {
      const startedAt = process.hrtime.bigint();
      response.once("finish", () => {
        const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
        const durationMs = durationSeconds * 1000;
        const requestId = getRequestId(request);
        metrics.httpRequestsTotal.increment({
          method: request.method,
          status: String(response.statusCode),
        });
        metrics.httpRequestDurationSeconds.observe(durationSeconds, {
          method: request.method,
          status: String(response.statusCode),
        });
        httpObserver.recordOperation({
          metric: "api_request",
          operation: "http_request",
          outcome: response.statusCode >= 500 ? "failure" : "success",
          correlationId: requestId,
          durationMs,
          reason: response.statusCode >= 500 ? `HTTP ${response.statusCode}` : null,
          data: {
            method: request.method,
            path: request.path,
            statusCode: response.statusCode,
          },
        });
        httpObserver.setHealth({
          surface: "http",
          status: response.statusCode >= 500 ? "error" : response.statusCode >= 400 ? "warn" : "ok",
          reason:
            response.statusCode >= 500
              ? `last request returned ${response.statusCode}`
              : response.statusCode >= 400
                ? `last request returned ${response.statusCode}`
                : "request handling healthy",
          details: {
            method: request.method,
            path: request.path,
            statusCode: response.statusCode,
          },
        });
      });
      next();
    });
    this.app.use(
      express.json({
        limit: "1mb",
        verify: (req: IncomingMessage, _res, buf: Buffer) => {
          if (req.url?.startsWith("/webhooks/")) {
            (req as unknown as WebhookRequest).rawBody = buf;
          }
        },
      }),
    );
    this.app.use(createReadGuard());
    this.app.use(createWriteGuard());
    registerHttpRoutes(this.app, { ...this.deps, metrics, observability: this.observability });
    this.app.use(serviceErrorHandler);
  }

  async start(port: number): Promise<{ port: number }> {
    if (this.server) {
      throw new Error("http server already started");
    }
    const host = process.env.RISOLUTO_BIND ?? "127.0.0.1";
    if (!isLoopbackBindHost(host) && !hasConfiguredReadAccessToken()) {
      throw new Error(
        `Refusing to bind Risoluto to non-loopback host ${host} without read auth. ` +
          `Set RISOLUTO_READ_TOKEN or RISOLUTO_WRITE_TOKEN first.`,
      );
    }
    let startedServer: http.Server | null = null;
    await new Promise<void>((resolve, reject) => {
      const server = this.app.listen(port, host, () => {
        startedServer = server;
        resolve();
      });
      server.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          reject(
            new Error(
              `Port ${port} is already in use on ${host}. ` +
                `Another Risoluto instance (or another process) is likely still running. ` +
                `Kill it first or use a different port with --port.`,
            ),
          );
          return;
        }
        reject(error);
      });
    });
    this.server = startedServer;
    this.observability.getComponent("http").setHealth({
      surface: "http",
      status: "ok",
      reason: "http server listening",
    });
    if (startedServer) {
      const address = (startedServer as { address?: () => { port: number } | string | null }).address?.();
      if (address && typeof address === "object") {
        return { port: address.port };
      }
    }
    return { port };
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.observability.getComponent("http").setHealth({
      surface: "http",
      status: "warn",
      reason: "http server stopped",
    });
    await this.observability.drain();
    this.server = null;
  }
}
