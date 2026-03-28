import http from "node:http";

import express, { type Express } from "express";

import type { AuditLogger } from "../audit/logger.js";
import type { ConfigOverlayPort } from "../config/overlay.js";
import type { ConfigStore } from "../config/store.js";
import type { TypedEventBus } from "../core/event-bus.js";
import type { SymphonyEventMap } from "../core/symphony-events.js";
import type { SymphonyLogger } from "../core/types.js";
import type { PromptTemplateStore } from "../prompt/store.js";
import { globalMetrics } from "../observability/metrics.js";
import type { OrchestratorPort } from "../orchestrator/port.js";
import type { SecretsStore } from "../secrets/store.js";
import { tracingMiddleware } from "../observability/tracing.js";
import type { TrackerPort } from "../tracker/port.js";

import { registerHttpRoutes } from "./routes.js";
import { createWriteGuard } from "./write-guard.js";
import { serviceErrorHandler } from "./service-errors.js";

export class HttpServer {
  private readonly app: Express;
  private server: http.Server | null = null;

  constructor(
    private readonly deps: {
      orchestrator: OrchestratorPort;
      logger: SymphonyLogger;
      tracker?: TrackerPort;
      configStore?: ConfigStore;
      configOverlayStore?: ConfigOverlayPort;
      secretsStore?: SecretsStore;
      eventBus?: TypedEventBus<SymphonyEventMap>;

      frontendDir?: string;
      archiveDir?: string;
      templateStore?: PromptTemplateStore;
      auditLogger?: AuditLogger;
    },
  ) {
    this.app = express();
    this.app.disable("x-powered-by");
    this.app.use(tracingMiddleware);
    this.app.use((request, response, next) => {
      const startedAt = process.hrtime.bigint();
      response.once("finish", () => {
        const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
        globalMetrics.httpRequestsTotal.increment({
          method: request.method,
          status: String(response.statusCode),
        });
        globalMetrics.httpRequestDurationSeconds.observe(durationSeconds, {
          method: request.method,
          status: String(response.statusCode),
        });
      });
      next();
    });
    this.app.use(express.json());
    this.app.use(createWriteGuard());
    registerHttpRoutes(this.app, this.deps);
    this.app.use(serviceErrorHandler);
  }

  async start(port: number): Promise<{ port: number }> {
    if (this.server) {
      throw new Error("http server already started");
    }
    const host = process.env.SYMPHONY_BIND ?? "127.0.0.1";
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
                `Another Symphony instance (or another process) is likely still running. ` +
                `Kill it first or use a different port with --port.`,
            ),
          );
          return;
        }
        reject(error);
      });
    });
    this.server = startedServer;
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
    this.server = null;
  }
}
