import http, { type IncomingMessage } from "node:http";

import express, { type Express } from "express";

import type { WebhookRequest } from "./webhook-types.js";

import type { AuditLogger } from "../audit/logger.js";
import type { ConfigOverlayPort } from "../config/overlay.js";
import type { ConfigStore } from "../config/store.js";
import type { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { RisolutoLogger } from "../core/types.js";
import type { PromptTemplateStore } from "../prompt/store.js";
import { globalMetrics } from "../observability/metrics.js";
import type { OrchestratorPort } from "../orchestrator/port.js";
import type { SecretsStore } from "../secrets/store.js";
import { tracingMiddleware } from "../observability/tracing.js";
import type { TrackerPort } from "../tracker/port.js";

import { registerHttpRoutes } from "./routes.js";
import { createWriteGuard } from "./write-guard.js";
import { serviceErrorHandler } from "./service-errors.js";
import type { WebhookHandlerDeps } from "./webhook-handler.js";

export class HttpServer {
  private readonly app: Express;
  private server: http.Server | null = null;

  constructor(
    private readonly deps: {
      orchestrator: OrchestratorPort;
      logger: RisolutoLogger;
      tracker?: TrackerPort;
      configStore?: ConfigStore;
      configOverlayStore?: ConfigOverlayPort;
      secretsStore?: SecretsStore;
      eventBus?: TypedEventBus<RisolutoEventMap>;

      frontendDir?: string;
      archiveDir?: string;
      templateStore?: PromptTemplateStore;
      auditLogger?: AuditLogger;
      webhookHandlerDeps?: WebhookHandlerDeps;
    },
  ) {
    this.app = express();
    this.app.disable("x-powered-by");
    this.app.set("trust proxy", process.env.RISOLUTO_TRUST_PROXY === "true" ? 1 : false);
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
    this.app.use(createWriteGuard());
    registerHttpRoutes(this.app, this.deps);
    this.app.use(serviceErrorHandler);
  }

  async start(port: number): Promise<{ port: number }> {
    if (this.server) {
      throw new Error("http server already started");
    }
    const host = process.env.RISOLUTO_BIND ?? "127.0.0.1";
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
