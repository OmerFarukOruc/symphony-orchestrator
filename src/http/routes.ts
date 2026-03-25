import type { FastifyInstance } from "fastify";

import { registerConfigApi } from "../config/api.js";
import type { ConfigOverlayStore } from "../config/overlay.js";
import type { ConfigStore } from "../config/store.js";
import type { RuntimeSnapshot } from "../core/types.js";
import { globalMetrics } from "../observability/metrics.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";

import { registerSecretsApi } from "../secrets/api.js";
import { registerSetupApi } from "../setup/api.js";
import type { SecretsStore } from "../secrets/store.js";
import { handleAttemptDetail } from "./attempt-handler.js";
import { handleGitContext } from "./git-context.js";
import { handleModelUpdate } from "./model-handler.js";

import { handleTransition } from "./transition-handler.js";
import { handleGetTransitions } from "./transitions-api.js";
import { handleWorkspaceInventory, handleWorkspaceRemove } from "./workspace-inventory.js";
import { refreshReason, sanitizeConfigValue, serializeSnapshot } from "./route-helpers.js";
import type { LinearClient } from "../linear/client.js";

interface HttpRouteDeps {
  orchestrator: Orchestrator;
  linearClient?: LinearClient;
  configStore?: ConfigStore;
  configOverlayStore?: ConfigOverlayStore;
  secretsStore?: SecretsStore;

  frontendDir?: string;
  archiveDir?: string;
}

export function registerHttpRoutes(app: FastifyInstance, deps: HttpRouteDeps): void {
  registerStateAndMetricsRoutes(app, deps);
  registerExtensionApis(app, deps);
  registerGitRoutes(app, deps);
  registerWorkspaceRoutes(app, deps);
  registerIssueRoutes(app, deps);
}

function registerStateAndMetricsRoutes(app: FastifyInstance, deps: HttpRouteDeps): void {
  app.get("/api/v1/state", (_request, reply) => {
    reply.send(serializeSnapshot(deps.orchestrator.getSnapshot() as RuntimeSnapshot & Record<string, unknown>));
  });

  app.get("/api/v1/runtime", (_request, reply) => {
    reply.send({
      version: process.env.npm_package_version ?? "unknown",
      workflow_path: process.env.SYMPHONY_WORKFLOW_PATH ?? "",
      data_dir: process.env.SYMPHONY_DATA_DIR ?? "",
      feature_flags: {},
      provider_summary: "Codex",
    });
  });

  app.get("/metrics", async (_request, reply) => {
    reply.header("content-type", "text/plain; version=0.0.4; charset=utf-8");
    reply.send(await globalMetrics.serialize());
  });

  app.post("/api/v1/refresh", (request, reply) => {
    const refresh = deps.orchestrator.requestRefresh(refreshReason(request));
    reply.status(202).send({ queued: refresh.queued, coalesced: refresh.coalesced, requested_at: refresh.requestedAt });
  });

  app.get("/api/v1/transitions", (request, reply) => {
    handleGetTransitions({ orchestrator: deps.orchestrator, configStore: deps.configStore }, request, reply);
  });
}

function registerIssueRoutes(app: FastifyInstance, deps: HttpRouteDeps): void {
  app.post<{ Params: { issue_identifier: string } }>("/api/v1/:issue_identifier/abort", (request, reply) => {
    const result = deps.orchestrator.abortIssue(request.params.issue_identifier);
    if (!result.ok) {
      const status = result.code === "not_found" ? 404 : 409;
      reply.status(status).send({ error: { code: result.code, message: result.message } });
      return;
    }
    reply.status(result.alreadyStopping ? 200 : 202).send({
      ok: true,
      status: "stopping",
      already_stopping: result.alreadyStopping,
      requested_at: result.requestedAt,
    });
  });

  app.post<{ Params: { issue_identifier: string }; Body: Record<string, unknown> }>(
    "/api/v1/:issue_identifier/model",
    async (request, reply) => {
      await handleModelUpdate(deps.orchestrator, request, reply);
    },
  );

  app.get<{ Params: { issue_identifier: string } }>("/api/v1/:issue_identifier/attempts", (request, reply) => {
    const detail = deps.orchestrator.getIssueDetail(request.params.issue_identifier);
    if (!detail) {
      reply.status(404).send({ error: { code: "not_found", message: "Unknown issue identifier" } });
      return;
    }
    reply.send({ attempts: detail.attempts ?? [], current_attempt_id: detail.currentAttemptId ?? null });
  });

  app.get<{ Params: { attempt_id: string } }>("/api/v1/attempts/:attempt_id", (request, reply) => {
    handleAttemptDetail(deps.orchestrator, request, reply);
  });

  app.post<{ Params: { issue_identifier: string }; Body: Record<string, unknown> }>(
    "/api/v1/:issue_identifier/transition",
    async (request, reply) => {
      await handleTransition(
        { orchestrator: deps.orchestrator, linearClient: deps.linearClient, configStore: deps.configStore },
        request,
        reply,
      );
    },
  );

  app.get<{ Params: { issue_identifier: string } }>("/api/v1/:issue_identifier", (request, reply) => {
    const detail = deps.orchestrator.getIssueDetail(request.params.issue_identifier);
    if (!detail) {
      reply.status(404).send({ error: { code: "not_found", message: "Unknown issue identifier" } });
      return;
    }
    reply.send(detail);
  });
}

function registerGitRoutes(app: FastifyInstance, deps: HttpRouteDeps): void {
  app.get("/api/v1/git/context", async (request, reply) => {
    await handleGitContext(
      {
        orchestrator: deps.orchestrator,
        configStore: deps.configStore,
        secretsStore: deps.secretsStore,
      },
      request,
      reply,
    );
  });
}

function registerWorkspaceRoutes(app: FastifyInstance, deps: HttpRouteDeps): void {
  app.get("/api/v1/workspaces", async (request, reply) => {
    await handleWorkspaceInventory(
      {
        orchestrator: deps.orchestrator,
        configStore: deps.configStore,
      },
      request,
      reply,
    );
  });

  app.delete<{ Params: { workspace_key: string } }>("/api/v1/workspaces/:workspace_key", async (request, reply) => {
    await handleWorkspaceRemove(
      {
        orchestrator: deps.orchestrator,
        configStore: deps.configStore,
      },
      request,
      reply,
    );
  });
}

function registerExtensionApis(app: FastifyInstance, deps: HttpRouteDeps): void {
  if (deps.configStore && deps.configOverlayStore) {
    registerConfigApi(app, {
      getEffectiveConfig: () =>
        sanitizeConfigValue(deps.configStore?.getMergedConfigMap() ?? {}) as Record<string, unknown>,
      configOverlayStore: deps.configOverlayStore,
    });
  }
  if (deps.secretsStore) {
    registerSecretsApi(app, { secretsStore: deps.secretsStore });
  }
  if (deps.secretsStore && deps.configOverlayStore && deps.archiveDir) {
    registerSetupApi(app, {
      secretsStore: deps.secretsStore,
      configOverlayStore: deps.configOverlayStore,
      orchestrator: deps.orchestrator,
      archiveDir: deps.archiveDir,
    });
  }
}
