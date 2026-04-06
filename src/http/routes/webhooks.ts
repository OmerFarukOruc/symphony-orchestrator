import type { Express } from "express";

import rateLimit from "express-rate-limit";

import type { HttpRouteDeps } from "../route-types.js";
import { handleWebhookGitHub, type GitHubWebhookHandlerDeps } from "../github-webhook-handler.js";
import { triggerSchema } from "../request-schemas.js";
import { methodNotAllowed } from "../route-helpers.js";
import { handleTriggerDispatch } from "../trigger-handler.js";
import { validateBody } from "../validation.js";
import { handleWebhookLinear, type WebhookHandlerDeps } from "../webhook-handler.js";
import type { WebhookRequest } from "../webhook-types.js";

export function registerWebhookRoutes(app: Express, deps: HttpRouteDeps): void {
  const triggerLimiter = rateLimit({
    windowMs: 60_000,
    limit: () => deps.configStore?.getConfig?.().triggers?.rateLimitPerMinute ?? 30,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app
    .route("/api/v1/webhooks/trigger")
    .post(triggerLimiter, validateBody(triggerSchema), async (req, res) => {
      await handleTriggerDispatch(
        {
          configStore: deps.configStore,
          tracker: deps.tracker,
          orchestrator: deps.orchestrator,
          webhookInbox: deps.webhookHandlerDeps?.webhookInbox,
          logger: deps.webhookHandlerDeps?.logger ?? deps.logger,
        },
        req,
        res,
      );
    })
    .all((_req, res) => {
      methodNotAllowed(res, ["POST"]);
    });

  if (!deps.webhookHandlerDeps) {
    deps.logger.warn({
      msg: "webhookHandlerDeps not provided — /webhooks/linear and /webhooks/github will not be registered",
    });
    return;
  }

  const webhookLimiter = rateLimit({
    windowMs: 60_000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const webhookDeps: WebhookHandlerDeps = deps.webhookHandlerDeps;
  const githubWebhookDeps: GitHubWebhookHandlerDeps = {
    configStore: deps.configStore,
    requestTargetedRefresh: deps.orchestrator.requestTargetedRefresh.bind(deps.orchestrator),
    stopWorkerForIssue: deps.orchestrator.stopWorkerForIssue.bind(deps.orchestrator),
    webhookInbox: webhookDeps.webhookInbox,
    logger: webhookDeps.logger,
  };

  app
    .route("/webhooks/linear")
    .post(webhookLimiter, (req, res) => {
      handleWebhookLinear(webhookDeps, req as WebhookRequest, res);
    })
    .all((_req, res) => {
      methodNotAllowed(res, ["POST"]);
    });

  app
    .route("/webhooks/github")
    .post(webhookLimiter, (req, res) => {
      handleWebhookGitHub(githubWebhookDeps, req as WebhookRequest, res);
    })
    .all((_req, res) => {
      methodNotAllowed(res, ["POST"]);
    });
}
