import type { Express } from "express";

import type { HttpRouteDeps } from "../route-types.js";
import { handleAttemptDetail } from "../attempt-handler.js";
import { handleAttemptCheckpoints } from "../checkpoint-handler.js";
import { handleModelUpdate } from "../model-handler.js";
import { modelUpdateSchema, steerSchema, templateOverrideSchema, transitionSchema } from "../request-schemas.js";
import { issueNotFound, methodNotAllowed } from "../route-helpers.js";
import { handleTemplateClear, handleTemplateOverride } from "../template-override-handler.js";
import { handleTransition } from "../transition-handler.js";
import { validateBody } from "../validation.js";

export function registerIssueRoutes(app: Express, deps: HttpRouteDeps): void {
  app
    .route("/api/v1/:issue_identifier/abort")
    .post((req, res) => {
      const result = deps.orchestrator.abortIssue(req.params.issue_identifier);
      if (!result.ok) {
        const status = result.code === "not_found" ? 404 : 409;
        res.status(status).json({ error: { code: result.code, message: result.message } });
        return;
      }
      res.status(result.alreadyStopping ? 200 : 202).json({
        ok: true,
        status: "stopping",
        already_stopping: result.alreadyStopping,
        requested_at: result.requestedAt,
      });
    })
    .all((_req, res) => {
      methodNotAllowed(res, ["POST"]);
    });

  app
    .route("/api/v1/:issue_identifier/model")
    .post(validateBody(modelUpdateSchema), async (req, res) => {
      await handleModelUpdate(deps.orchestrator, req, res);
    })
    .all((_req, res) => {
      methodNotAllowed(res, ["POST"]);
    });

  app
    .route("/api/v1/:issue_identifier/template")
    .post(validateBody(templateOverrideSchema), (req, res) => {
      if (!deps.templateStore) {
        res.status(503).json({ error: { code: "not_configured", message: "template store not available" } });
        return;
      }
      handleTemplateOverride(deps.orchestrator, deps.templateStore, req, res);
    })
    .delete((req, res) => {
      handleTemplateClear(deps.orchestrator, req, res);
    })
    .all((_req, res) => {
      methodNotAllowed(res, ["POST", "DELETE"]);
    });

  app
    .route("/api/v1/:issue_identifier/attempts")
    .get((req, res) => {
      const detail = deps.orchestrator.getIssueDetail(req.params.issue_identifier);
      if (!detail) {
        issueNotFound(res);
        return;
      }
      res.json({ attempts: detail.attempts ?? [], current_attempt_id: detail.currentAttemptId ?? null });
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/attempts/:attempt_id")
    .get((req, res) => {
      handleAttemptDetail(deps.orchestrator, req, res);
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/attempts/:attempt_id/checkpoints")
    .get(async (req, res) => {
      await handleAttemptCheckpoints(
        {
          orchestrator: deps.orchestrator,
          attemptStore: deps.attemptStore,
        },
        req,
        res,
      );
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/:issue_identifier/transition")
    .post(validateBody(transitionSchema), async (req, res) => {
      await handleTransition(
        { orchestrator: deps.orchestrator, tracker: deps.tracker, configStore: deps.configStore },
        req,
        res,
      );
    })
    .all((_req, res) => {
      methodNotAllowed(res, ["POST"]);
    });

  app
    .route("/api/v1/:issue_identifier/steer")
    .post(validateBody(steerSchema), async (req, res) => {
      const result = await deps.orchestrator.steerIssue(req.params.issue_identifier, req.body.message);
      if (!result) {
        res.status(404).json({ error: { code: "not_found", message: "issue not running" } });
        return;
      }
      res.json({ ok: result.ok, message: result.ok ? "steer sent" : "steer failed" });
    })
    .all((_req, res) => {
      methodNotAllowed(res, ["POST"]);
    });

  app
    .route("/api/v1/:issue_identifier")
    .get((req, res) => {
      const detail = deps.orchestrator.getIssueDetail(req.params.issue_identifier);
      if (!detail) {
        issueNotFound(res);
        return;
      }
      res.json(detail);
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });
}
