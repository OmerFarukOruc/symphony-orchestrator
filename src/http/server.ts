import http from "node:http";

import express, { type Express } from "express";
import type { ConfigStore } from "../config/store.js";
import { registerHttpRoutes } from "./routes.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import type { PlanningExecutionResult } from "../planning/api.js";
import type { PlannedIssue } from "../planning/skill.js";
import type { ConfigOverlayStore } from "../config/overlay.js";
import type { SecretsStore } from "../secrets/store.js";
import type { SymphonyLogger } from "../core/types.js";
import { globalMetrics } from "../observability/metrics.js";
import { tracingMiddleware } from "../observability/tracing.js";

export class HttpServer {
  private readonly app: Express;
  private server: http.Server | null = null;

  constructor(
    private readonly deps: {
      orchestrator: Orchestrator;
      logger: SymphonyLogger;
      configStore?: ConfigStore;
      configOverlayStore?: ConfigOverlayStore;
      secretsStore?: SecretsStore;
      executePlan?: (issues: PlannedIssue[]) => Promise<PlanningExecutionResult>;
      frontendDir?: string;
      archiveDir?: string;
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
    registerHttpRoutes(this.app, this.deps);
  }

  async start(port: number): Promise<{ port: number }> {
    if (this.server) {
      throw new Error("http server already started");
    }
    let startedServer: http.Server | null = null;
    await new Promise<void>((resolve, reject) => {
      const server = this.app.listen(port, "127.0.0.1", () => {
        startedServer = server;
        resolve();
      });
      server.on("error", reject);
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
