import http from "node:http";

import express, { type Express, type Request, type Response } from "express";

import { renderDashboardTemplate } from "./dashboard-template.js";
import { renderLogsTemplate } from "./logs-template.js";
import { Orchestrator } from "./orchestrator.js";
import type { ReasoningEffort } from "./types.js";
import type { RuntimeSnapshot, SymphonyLogger } from "./types.js";

function methodNotAllowed(response: Response): void {
  response.status(405).json({
    error: {
      code: "method_not_allowed",
      message: "Method Not Allowed",
    },
  });
}

function serializeSnapshot(snapshot: RuntimeSnapshot & Record<string, unknown>): Record<string, unknown> {
  return {
    generated_at: snapshot.generatedAt,
    counts: snapshot.counts,
    queued: snapshot.queued ?? [],
    running: snapshot.running,
    retrying: snapshot.retrying,
    completed: snapshot.completed ?? [],
    codex_totals: {
      input_tokens: snapshot.codexTotals.inputTokens,
      output_tokens: snapshot.codexTotals.outputTokens,
      total_tokens: snapshot.codexTotals.totalTokens,
      seconds_running: snapshot.codexTotals.secondsRunning,
    },
    rate_limits: snapshot.rateLimits,
    recent_events: snapshot.recentEvents.map((event) => ({
      at: event.at,
      issue_id: event.issueId,
      issue_identifier: event.issueIdentifier,
      session_id: event.sessionId,
      event: event.event,
      message: event.message,
    })),
  };
}

export class HttpServer {
  private readonly app: Express;
  private server: http.Server | null = null;

  constructor(private readonly deps: { orchestrator: Orchestrator; logger: SymphonyLogger }) {
    this.app = express();
    this.app.disable("x-powered-by");
    this.app.use(express.json());
    this.registerRoutes();
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

  private registerRoutes(): void {
    this.app
      .route("/")
      .get((_request, response) => {
        response.type("html").send(renderDashboardTemplate());
      })
      .all((_request, response) => {
        methodNotAllowed(response);
      });

    this.app
      .route("/logs/:issue_identifier")
      .get((request, response) => {
        response.type("html").send(renderLogsTemplate(request.params.issue_identifier));
      })
      .all((_request, response) => {
        methodNotAllowed(response);
      });

    this.app
      .route("/api/v1/state")
      .get((_request, response) => {
        response.json(
          serializeSnapshot(this.deps.orchestrator.getSnapshot() as RuntimeSnapshot & Record<string, unknown>),
        );
      })
      .all((_request, response) => {
        methodNotAllowed(response);
      });

    this.app
      .route("/api/v1/refresh")
      .post((request, response) => {
        const refresh = this.deps.orchestrator.requestRefresh(this.refreshReason(request));
        response.status(202).json({
          queued: refresh.queued,
          coalesced: refresh.coalesced,
          requested_at: refresh.requestedAt,
        });
      })
      .all((_request, response) => {
        methodNotAllowed(response);
      });

    this.app
      .route("/api/v1/:issue_identifier/model")
      .post(async (request, response) => {
        const model = this.asModel(request.body?.model);
        const effortResult = this.parseReasoningEffort(request.body?.reasoning_effort ?? request.body?.reasoningEffort);
        if (!model) {
          response.status(400).json({
            error: {
              code: "invalid_model",
              message: "model is required",
            },
          });
          return;
        }
        if (!effortResult.ok) {
          response.status(400).json({
            error: {
              code: effortResult.code,
              message: effortResult.message,
            },
          });
          return;
        }
        const updated = await this.deps.orchestrator.updateIssueModelSelection({
          identifier: request.params.issue_identifier,
          model,
          reasoningEffort: effortResult.value,
        });
        if (!updated) {
          response.status(404).json({
            error: {
              code: "not_found",
              message: "Unknown issue identifier",
            },
          });
          return;
        }
        response.status(202).json({
          updated: updated.updated,
          restarted: updated.restarted,
          applies_next_attempt: updated.appliesNextAttempt,
          selection: {
            model: updated.selection.model,
            reasoning_effort: updated.selection.reasoningEffort,
            source: updated.selection.source,
          },
        });
      })
      .all((_request, response) => {
        methodNotAllowed(response);
      });

    this.app
      .route("/api/v1/:issue_identifier/attempts")
      .get((request, response) => {
        const detail = this.deps.orchestrator.getIssueDetail(request.params.issue_identifier);
        if (!detail) {
          response.status(404).json({
            error: {
              code: "not_found",
              message: "Unknown issue identifier",
            },
          });
          return;
        }
        response.json({
          attempts: detail.attempts ?? [],
          current_attempt_id: detail.currentAttemptId ?? null,
        });
      })
      .all((_request, response) => {
        methodNotAllowed(response);
      });

    this.app
      .route("/api/v1/attempts/:attempt_id")
      .get((request, response) => {
        const attempt = this.deps.orchestrator.getAttemptDetail(request.params.attempt_id);
        if (!attempt) {
          response.status(404).json({
            error: {
              code: "not_found",
              message: "Unknown attempt identifier",
            },
          });
          return;
        }
        response.json(attempt);
      })
      .all((_request, response) => {
        methodNotAllowed(response);
      });

    this.app
      .route("/api/v1/:issue_identifier")
      .get((request, response) => {
        const detail = this.deps.orchestrator.getIssueDetail(request.params.issue_identifier);
        if (!detail) {
          response.status(404).json({
            error: {
              code: "not_found",
              message: "Unknown issue identifier",
            },
          });
          return;
        }
        response.json(detail);
      })
      .all((_request, response) => {
        methodNotAllowed(response);
      });
  }

  private refreshReason(request: Request): string {
    return request.get("x-symphony-reason") ?? "http_refresh";
  }

  private asModel(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  }

  private parseReasoningEffort(
    value: unknown,
  ): { ok: true; value: ReasoningEffort | null } | { ok: false; code: string; message: string } {
    if (value === null || value === undefined || value === "") {
      return { ok: true, value: null };
    }
    if (typeof value !== "string") {
      return { ok: false, code: "invalid_reasoning_effort", message: "reasoning_effort must be a string" };
    }
    const trimmed = value.trim();
    if (trimmed === "") {
      return { ok: true, value: null };
    }
    const VALID: ReasoningEffort[] = ["none", "minimal", "low", "medium", "high", "xhigh"];
    if (VALID.includes(trimmed as ReasoningEffort)) {
      return { ok: true, value: trimmed as ReasoningEffort };
    }
    return {
      ok: false,
      code: "invalid_reasoning_effort",
      message: `Invalid reasoning_effort "${trimmed}". Allowed values: ${VALID.join(", ")}`,
    };
  }
}
