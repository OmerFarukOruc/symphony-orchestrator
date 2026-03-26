import type { FastifyInstance } from "fastify";

import { schemas, type SecretBackend } from "@symphony/shared";

import type { ConfigOverlayStore } from "../config/overlay.js";
import { getAllFlags } from "../core/feature-flags.js";
import type { RuntimeSnapshot } from "../core/types.js";
import { globalMetrics } from "../observability/prom-client-metrics.js";
import { handleDetectDefaultBranch } from "../setup/detect-default-branch.js";
import { handleDeleteRepoRoute, handleGetRepoRoutes, handlePostRepoRoute } from "../setup/repo-route-handlers.js";
import {
  handleGetLinearProjects,
  handleGetPkceAuthStatus,
  handleGetPromptTemplate,
  handleGetStatus,
  handlePostCodexAuth,
  handlePostCreateLabel,
  handlePostCreateProject,
  handlePostCreateTestIssue,
  handlePostGithubToken,
  handlePostLinearProject,
  handlePostMasterKey,
  handlePostOpenaiKey,
  handlePostPkceAuthCancel,
  handlePostPkceAuthStart,
  handlePostPromptTemplate,
  handlePostReset,
  type SetupApiDeps,
} from "../setup/setup-handlers.js";
import { handleAttemptDetail } from "./attempt-handler.js";
import { handleGitContext } from "./git-context.js";
import { handleModelUpdate } from "./model-handler.js";
import type { HttpServerDeps } from "./server.js";
import { refreshReason, sanitizeConfigValue, serializeSnapshot } from "./route-helpers.js";
import { handleTransition } from "./transition-handler.js";
import { handleGetTransitions } from "./transitions-api.js";
import { handleWorkspaceInventory, handleWorkspaceRemove } from "./workspace-inventory.js";

export type ControlPlaneInvalidationEvent =
  | { type: "attempt"; issue_id: string | null; attempt_id: string | null; status: string | null }
  | { type: "event"; attempt_id: string | null; event_type: string; data: Record<string, unknown> }
  | { type: "snapshot"; state: Record<string, unknown> }
  | { type: "config"; key: string; value: unknown }
  | { type: "secret"; key: string; action: "set" | "delete" };

export interface FastifyRouteDeps extends Omit<HttpServerDeps, "logger"> {
  emitInvalidation?: (event: ControlPlaneInvalidationEvent) => void;
}

const DEFAULT_CONFIG_SCHEMA = {
  overlay_put_body_examples: [
    { codex: { model: "gpt-5.4" } },
    { path: "codex.model", value: "gpt-5.4" },
    { patch: { server: { port: 4001 } } },
  ],
  routes: {
    get_effective_config: "GET /api/v1/config",
    get_overlay: "GET /api/v1/config/overlay",
    put_overlay: "PUT /api/v1/config/overlay",
    delete_overlay_path: "DELETE /api/v1/config/overlay/:path",
    get_schema: "GET /api/v1/config/schema",
  },
};

export function registerFastifyHttpRoutes(app: FastifyInstance, deps: FastifyRouteDeps): void {
  registerStateRoutes(app, deps);
  registerIssueRoutes(app, deps);
  registerGitRoutes(app, deps);
  registerWorkspaceRoutes(app, deps);
  registerConfigRoutes(app, deps);
  registerSecretsRoutes(app, deps);
  registerSetupRoutes(app, deps);
}

function emitSnapshot(deps: FastifyRouteDeps): void {
  deps.emitInvalidation?.({
    type: "snapshot",
    state: serializeSnapshot(deps.orchestrator.getSnapshot() as RuntimeSnapshot & Record<string, unknown>),
  });
}

function registerStateRoutes(app: FastifyInstance, deps: FastifyRouteDeps): void {
  app.get(
    "/api/v1/state",
    { schema: { response: { 200: schemas.RuntimeSnapshotResponseSchema } } },
    (_request, reply) => {
      reply.send(serializeSnapshot(deps.orchestrator.getSnapshot() as RuntimeSnapshot & Record<string, unknown>));
    },
  );

  app.get("/api/v1/runtime", { schema: { response: { 200: schemas.RuntimeResponseSchema } } }, (_request, reply) => {
    reply.send({
      version: process.env.npm_package_version ?? "unknown",
      workflow_path: process.env.SYMPHONY_WORKFLOW_PATH ?? "",
      data_dir: process.env.SYMPHONY_DATA_DIR ?? "",
      feature_flags: getAllFlags(),
      provider_summary: "Codex",
    });
  });

  app.get("/metrics", (_request, reply) => {
    reply.header("content-type", "text/plain; version=0.0.4; charset=utf-8");
    return globalMetrics.serialize();
  });

  app.post("/api/v1/refresh", { schema: { response: { 202: schemas.RefreshResponseSchema } } }, (request, reply) => {
    const refresh = deps.orchestrator.requestRefresh(refreshReason(request));
    emitSnapshot(deps);
    reply.status(202).send({ queued: refresh.queued, coalesced: refresh.coalesced, requested_at: refresh.requestedAt });
  });

  app.get(
    "/api/v1/transitions",
    { schema: { response: { 200: schemas.TransitionsResponseSchema } } },
    (request, reply) => {
      handleGetTransitions({ orchestrator: deps.orchestrator, configStore: deps.configStore }, request, reply);
    },
  );
}

function registerIssueRoutes(app: FastifyInstance, deps: FastifyRouteDeps): void {
  app.post<{ Params: { issue_identifier: string } }>(
    "/api/v1/:issue_identifier/abort",
    {
      schema: {
        response: {
          200: schemas.AbortResponseSchema,
          202: schemas.AbortResponseSchema,
          404: schemas.ErrorEnvelopeSchema,
          409: schemas.ErrorEnvelopeSchema,
        },
      },
    },
    (request, reply) => {
      const result = deps.orchestrator.abortIssue(request.params.issue_identifier);
      if (!result.ok) {
        const status = result.code === "not_found" ? 404 : 409;
        reply.status(status).send({ error: { code: result.code, message: result.message } });
        return;
      }
      emitSnapshot(deps);
      reply.status(result.alreadyStopping ? 200 : 202).send({
        ok: true,
        status: "stopping",
        already_stopping: result.alreadyStopping,
        requested_at: result.requestedAt,
      });
    },
  );

  app.post<{ Params: { issue_identifier: string }; Body: Record<string, unknown> }>(
    "/api/v1/:issue_identifier/model",
    {
      attachValidation: true,
      schema: {
        body: schemas.ModelUpdateBodySchema,
        response: {
          202: schemas.ModelUpdateResponseSchema,
          400: schemas.ErrorEnvelopeSchema,
          404: schemas.ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      await handleModelUpdate(deps.orchestrator, request, reply);
      if (reply.statusCode < 400) {
        const detail = deps.orchestrator.getIssueDetail(request.params.issue_identifier);
        const latestAttempt = Array.isArray(detail?.attempts) ? detail.attempts.at(-1) : null;
        deps.emitInvalidation?.({
          type: "attempt",
          issue_id: typeof detail?.issueId === "string" ? detail.issueId : null,
          attempt_id: typeof detail?.currentAttemptId === "string" ? detail.currentAttemptId : null,
          status: typeof latestAttempt?.status === "string" ? latestAttempt.status : null,
        });
        emitSnapshot(deps);
      }
    },
  );

  app.get<{ Params: { issue_identifier: string } }>(
    "/api/v1/:issue_identifier/attempts",
    { schema: { response: { 200: schemas.AttemptListResponseSchema, 404: schemas.ErrorEnvelopeSchema } } },
    (request, reply) => {
      const detail = deps.orchestrator.getIssueDetail(request.params.issue_identifier);
      if (!detail) {
        reply.status(404).send({ error: { code: "not_found", message: "Unknown issue identifier" } });
        return;
      }
      reply.send({ attempts: detail.attempts ?? [], current_attempt_id: detail.currentAttemptId ?? null });
    },
  );

  app.get<{ Params: { attempt_id: string } }>(
    "/api/v1/attempts/:attempt_id",
    { schema: { response: { 200: schemas.AttemptDetailSchema, 404: schemas.ErrorEnvelopeSchema } } },
    (request, reply) => {
      handleAttemptDetail(deps.orchestrator, request, reply);
    },
  );

  app.post<{ Params: { issue_identifier: string }; Body: Record<string, unknown> }>(
    "/api/v1/:issue_identifier/transition",
    {
      attachValidation: true,
      schema: {
        body: schemas.TransitionBodySchema,
        response: {
          200: schemas.TransitionSuccessResponseSchema,
          400: schemas.ErrorEnvelopeSchema,
          404: schemas.ErrorEnvelopeSchema,
          422: schemas.TransitionRejectedResponseSchema,
          503: schemas.ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      await handleTransition(
        { orchestrator: deps.orchestrator, linearClient: deps.linearClient, configStore: deps.configStore },
        request,
        reply,
      );
      if (reply.statusCode < 400) emitSnapshot(deps);
    },
  );

  app.get<{ Params: { issue_identifier: string } }>(
    "/api/v1/:issue_identifier",
    { schema: { response: { 200: schemas.IssueDetailSchema, 404: schemas.ErrorEnvelopeSchema } } },
    (request, reply) => {
      const detail = deps.orchestrator.getIssueDetail(request.params.issue_identifier);
      if (!detail) {
        reply.status(404).send({ error: { code: "not_found", message: "Unknown issue identifier" } });
        return;
      }
      reply.send(detail);
    },
  );
}

function registerGitRoutes(app: FastifyInstance, deps: FastifyRouteDeps): void {
  app.get(
    "/api/v1/git/context",
    { schema: { response: { 200: schemas.GitContextResponseSchema } } },
    async (request, reply) => {
      await handleGitContext(
        { orchestrator: deps.orchestrator, configStore: deps.configStore, secretsStore: deps.secretsStore },
        request,
        reply,
      );
    },
  );
}

function registerWorkspaceRoutes(app: FastifyInstance, deps: FastifyRouteDeps): void {
  app.get(
    "/api/v1/workspaces",
    { schema: { response: { 200: schemas.WorkspaceInventoryResponseSchema, 503: schemas.ErrorEnvelopeSchema } } },
    async (request, reply) => {
      await handleWorkspaceInventory(
        { orchestrator: deps.orchestrator, configStore: deps.configStore },
        request,
        reply,
      );
    },
  );

  app.delete<{ Params: { workspace_key: string } }>(
    "/api/v1/workspaces/:workspace_key",
    {
      schema: {
        params: schemas.WorkspaceKeyParamsSchema,
        response: {
          400: schemas.ErrorEnvelopeSchema,
          404: schemas.ErrorEnvelopeSchema,
          409: schemas.ErrorEnvelopeSchema,
          503: schemas.ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      await handleWorkspaceRemove({ orchestrator: deps.orchestrator, configStore: deps.configStore }, request, reply);
      if (reply.statusCode < 400) emitSnapshot(deps);
    },
  );
}

function registerConfigRoutes(app: FastifyInstance, deps: FastifyRouteDeps): void {
  if (!deps.configStore || !deps.configOverlayStore) return;

  app.get("/api/v1/config", { schema: { response: { 200: schemas.ConfigValueSchema } } }, (_request, reply) => {
    reply.send(sanitizeConfigValue(deps.configStore?.getMergedConfigMap() ?? {}) as Record<string, unknown>);
  });

  app.get(
    "/api/v1/config/schema",
    { schema: { response: { 200: schemas.ConfigSchemaResponseSchema } } },
    (_request, reply) => {
      reply.send(DEFAULT_CONFIG_SCHEMA);
    },
  );

  app.get(
    "/api/v1/config/overlay",
    { schema: { response: { 200: schemas.ConfigOverlayResponseSchema } } },
    (_request, reply) => {
      reply.send({ overlay: deps.configOverlayStore?.toMap() ?? {} });
    },
  );

  app.put<{ Body: Record<string, unknown> }>(
    "/api/v1/config/overlay",
    {
      attachValidation: true,
      schema: {
        body: schemas.ConfigValueSchema,
        response: { 200: schemas.ConfigOverlayUpdateResponseSchema, 400: schemas.ErrorEnvelopeSchema },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const patch =
        body && typeof body === "object" && body.patch && typeof body.patch === "object" ? body.patch : body;
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        reply
          .status(400)
          .send({ error: { code: "invalid_overlay_payload", message: "overlay payload must be a JSON object" } });
        return;
      }
      const updated = await deps.configOverlayStore!.applyPatch(patch as Record<string, unknown>);
      deps.emitInvalidation?.({ type: "config", key: "*", value: deps.configOverlayStore!.toMap() });
      reply.send({ updated, overlay: deps.configOverlayStore!.toMap() });
    },
  );

  app.patch<{ Params: { path: string }; Body: Record<string, unknown> }>(
    "/api/v1/config/overlay/:path",
    {
      attachValidation: true,
      schema: {
        params: schemas.ConfigPathParamsSchema,
        body: schemas.ConfigOverlayPatchBodySchema,
        response: { 200: schemas.ConfigOverlayUpdateResponseSchema, 400: schemas.ErrorEnvelopeSchema },
      },
    },
    async (request, reply) => {
      const pathExpression = request.params.path;
      if (!pathExpression?.trim()) {
        reply.status(400).send({ error: { code: "invalid_overlay_path", message: "overlay path must not be empty" } });
        return;
      }
      const body = request.body;
      if (!body || typeof body !== "object" || !("value" in body)) {
        reply
          .status(400)
          .send({ error: { code: "invalid_overlay_payload", message: "PATCH body must contain a value field" } });
        return;
      }
      const updated = await deps.configOverlayStore!.set(pathExpression, body.value);
      deps.emitInvalidation?.({ type: "config", key: pathExpression, value: body.value });
      reply.send({ updated, overlay: deps.configOverlayStore!.toMap() });
    },
  );

  app.delete<{ Params: { path: string } }>(
    "/api/v1/config/overlay/:path",
    {
      schema: {
        params: schemas.ConfigPathParamsSchema,
        response: {
          204: schemas.ErrorEnvelopeSchema,
          400: schemas.ErrorEnvelopeSchema,
          404: schemas.ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const pathExpression = request.params.path;
      if (!pathExpression?.trim()) {
        reply.status(400).send({ error: { code: "invalid_overlay_path", message: "overlay path must not be empty" } });
        return;
      }
      const deleted = await deps.configOverlayStore!.delete(pathExpression);
      if (!deleted) {
        reply.status(404).send({ error: { code: "overlay_path_not_found", message: "overlay path not found" } });
        return;
      }
      deps.emitInvalidation?.({ type: "config", key: pathExpression, value: null });
      reply.status(204).send();
    },
  );
}

function registerSecretsRoutes(app: FastifyInstance, deps: FastifyRouteDeps): void {
  if (!deps.secretsStore) return;

  app.get("/api/v1/secrets", { schema: { response: { 200: schemas.SecretListResponseSchema } } }, (_request, reply) => {
    reply.send({ keys: deps.secretsStore!.list() });
  });

  app.post<{ Params: { key: string }; Body: Record<string, unknown> }>(
    "/api/v1/secrets/:key",
    {
      attachValidation: true,
      schema: {
        params: schemas.SecretKeyParamsSchema,
        body: schemas.SecretValueBodySchema,
        response: { 204: schemas.ErrorEnvelopeSchema, 400: schemas.ErrorEnvelopeSchema },
      },
    },
    async (request, reply) => {
      const value = request.body?.value;
      if (typeof value !== "string" || value.length === 0) {
        reply
          .status(400)
          .send({ error: { code: "invalid_secret_value", message: "secret value must be a non-empty string" } });
        return;
      }
      await deps.secretsStore!.store(request.params.key, value);
      deps.emitInvalidation?.({ type: "secret", key: request.params.key, action: "set" });
      reply.status(204).send();
    },
  );

  app.delete<{ Params: { key: string } }>(
    "/api/v1/secrets/:key",
    {
      schema: {
        params: schemas.SecretKeyParamsSchema,
        response: {
          204: schemas.ErrorEnvelopeSchema,
          400: schemas.ErrorEnvelopeSchema,
          404: schemas.ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const deleted = await deps.secretsStore!.delete(request.params.key);
      if (!deleted) {
        reply.status(404).send({ error: { code: "secret_not_found", message: "secret key not found" } });
        return;
      }
      deps.emitInvalidation?.({ type: "secret", key: request.params.key, action: "delete" });
      reply.status(204).send();
    },
  );
}

function registerSetupRoutes(app: FastifyInstance, deps: FastifyRouteDeps): void {
  if (!deps.secretsStore || !deps.configOverlayStore || !deps.archiveDir) return;
  const setupDeps: SetupApiDeps = {
    secretsStore: deps.secretsStore,
    configOverlayStore: deps.configOverlayStore,
    orchestrator: deps.orchestrator,
    archiveDir: deps.archiveDir,
  };

  app.get(
    "/api/v1/setup/status",
    { schema: { response: { 200: schemas.SetupStatusResponseSchema } } },
    handleGetStatus(setupDeps),
  );
  app.post(
    "/api/v1/setup/reset",
    { schema: { response: { 200: schemas.OkResponseSchema, 500: schemas.ErrorEnvelopeSchema } } },
    handlePostReset(setupDeps),
  );
  app.post(
    "/api/v1/setup/master-key",
    {
      attachValidation: true,
      schema: {
        body: schemas.MasterKeyBodySchema,
        response: {
          200: schemas.MasterKeyResponseSchema,
          409: schemas.ErrorEnvelopeSchema,
          500: schemas.ErrorEnvelopeSchema,
        },
      },
    },
    handlePostMasterKey(setupDeps),
  );
  app.get(
    "/api/v1/setup/linear-projects",
    {
      schema: {
        response: {
          200: schemas.LinearProjectsResponseSchema,
          400: schemas.ErrorEnvelopeSchema,
          502: schemas.ErrorEnvelopeSchema,
        },
      },
    },
    handleGetLinearProjects(setupDeps),
  );
  app.post(
    "/api/v1/setup/linear-project",
    {
      attachValidation: true,
      schema: {
        body: schemas.LinearProjectSelectionBodySchema,
        response: { 200: schemas.OkResponseSchema, 400: schemas.ErrorEnvelopeSchema },
      },
    },
    handlePostLinearProject(setupDeps),
  );
  app.post(
    "/api/v1/setup/openai-key",
    {
      attachValidation: true,
      schema: {
        body: schemas.ApiKeyBodySchema,
        response: { 200: schemas.TokenValidationResponseSchema, 400: schemas.ErrorEnvelopeSchema },
      },
    },
    handlePostOpenaiKey(setupDeps),
  );
  app.post(
    "/api/v1/setup/codex-auth",
    {
      attachValidation: true,
      schema: {
        body: schemas.CodexAuthBodySchema,
        response: { 200: schemas.OkResponseSchema, 400: schemas.ErrorEnvelopeSchema, 500: schemas.ErrorEnvelopeSchema },
      },
    },
    handlePostCodexAuth(setupDeps),
  );
  app.post(
    "/api/v1/setup/pkce-auth/start",
    {
      schema: {
        response: {
          200: schemas.PkceStartResponseSchema,
          502: schemas.ErrorEnvelopeSchema,
          500: schemas.ErrorEnvelopeSchema,
        },
      },
    },
    handlePostPkceAuthStart(setupDeps),
  );
  app.get(
    "/api/v1/setup/pkce-auth/status",
    { schema: { response: { 200: schemas.PkceStatusResponseSchema } } },
    handleGetPkceAuthStatus(setupDeps),
  );
  app.post(
    "/api/v1/setup/pkce-auth/cancel",
    { schema: { response: { 200: schemas.OkResponseSchema } } },
    handlePostPkceAuthCancel(setupDeps),
  );
  app.post(
    "/api/v1/setup/github-token",
    {
      attachValidation: true,
      schema: {
        body: schemas.GitHubTokenBodySchema,
        response: { 200: schemas.TokenValidationResponseSchema, 400: schemas.ErrorEnvelopeSchema },
      },
    },
    handlePostGithubToken(setupDeps),
  );
  app.post(
    "/api/v1/setup/create-test-issue",
    {
      schema: {
        response: {
          200: schemas.CreateTestIssueResponseSchema,
          400: schemas.ErrorEnvelopeSchema,
          502: schemas.ErrorEnvelopeSchema,
        },
      },
    },
    handlePostCreateTestIssue(setupDeps),
  );
  app.post(
    "/api/v1/setup/create-label",
    {
      schema: {
        response: {
          200: schemas.CreateLabelResponseSchema,
          400: schemas.ErrorEnvelopeSchema,
          502: schemas.ErrorEnvelopeSchema,
        },
      },
    },
    handlePostCreateLabel(setupDeps),
  );
  app.post(
    "/api/v1/setup/create-project",
    {
      attachValidation: true,
      schema: {
        body: schemas.CreateProjectBodySchema,
        response: {
          200: schemas.CreateProjectResponseSchema,
          400: schemas.ErrorEnvelopeSchema,
          502: schemas.ErrorEnvelopeSchema,
        },
      },
    },
    handlePostCreateProject(setupDeps),
  );
  app.post(
    "/api/v1/setup/repo-route",
    {
      attachValidation: true,
      schema: {
        body: schemas.RepoRouteCreateBodySchema,
        response: { 200: schemas.RepoRouteCreateResponseSchema, 400: schemas.ErrorEnvelopeSchema },
      },
    },
    handlePostRepoRoute({ configOverlayStore: deps.configOverlayStore as ConfigOverlayStore }),
  );
  app.delete(
    "/api/v1/setup/repo-route",
    {
      attachValidation: true,
      schema: {
        body: schemas.RepoRouteDeleteBodySchema,
        response: { 200: schemas.RepoRouteDeleteResponseSchema, 400: schemas.ErrorEnvelopeSchema },
      },
    },
    handleDeleteRepoRoute({ configOverlayStore: deps.configOverlayStore as ConfigOverlayStore }),
  );
  app.get(
    "/api/v1/setup/repo-routes",
    { schema: { response: { 200: schemas.RepoRoutesResponseSchema } } },
    handleGetRepoRoutes({ configOverlayStore: deps.configOverlayStore as ConfigOverlayStore }),
  );
  app.post(
    "/api/v1/setup/detect-default-branch",
    {
      attachValidation: true,
      schema: {
        body: schemas.DetectDefaultBranchBodySchema,
        response: { 200: schemas.DetectDefaultBranchResponseSchema, 400: schemas.ErrorEnvelopeSchema },
      },
    },
    handleDetectDefaultBranch({ secretsStore: deps.secretsStore as SecretBackend }),
  );
  app.get(
    "/api/v1/setup/prompt-template",
    { schema: { response: { 200: schemas.PromptTemplateResponseSchema } } },
    handleGetPromptTemplate(setupDeps),
  );
  app.post(
    "/api/v1/setup/prompt-template",
    {
      attachValidation: true,
      schema: {
        body: schemas.PromptTemplateBodySchema,
        response: { 200: schemas.PromptTemplateUpdateResponseSchema, 400: schemas.ErrorEnvelopeSchema },
      },
    },
    handlePostPromptTemplate(setupDeps),
  );
}
