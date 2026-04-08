import type { Express, Request, Response } from "express";

import { CodexControlPlaneMethodUnsupportedError } from "../../codex/control-plane.js";
import { methodNotAllowed } from "../route-helpers.js";
import type { HttpRouteDeps } from "../route-types.js";

function handleMissingControlPlane(res: Response): void {
  res.status(503).json({
    error: {
      code: "codex_control_plane_unavailable",
      message: "Codex control plane is unavailable",
    },
  });
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "string") {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sendCodexError(error: unknown, res: Response): void {
  if (error instanceof CodexControlPlaneMethodUnsupportedError) {
    res.status(501).json({
      error: {
        code: "unsupported_method",
        message: error.message,
        method: error.method,
      },
    });
    return;
  }

  res.status(502).json({
    error: {
      code: "codex_request_failed",
      message: error instanceof Error ? error.message : String(error),
    },
  });
}

function withControlPlane(
  deps: HttpRouteDeps,
  handler: (
    controlPlane: NonNullable<HttpRouteDeps["codexControlPlane"]>,
    req: Request,
    res: Response,
  ) => Promise<void>,
) {
  return async (req: Request, res: Response) => {
    if (!deps.codexControlPlane) {
      handleMissingControlPlane(res);
      return;
    }
    try {
      await handler(deps.codexControlPlane, req, res);
    } catch (error) {
      sendCodexError(error, res);
    }
  };
}

export function registerCodexRoutes(app: Express, deps: HttpRouteDeps): void {
  app
    .route("/api/v1/codex/capabilities")
    .get(
      withControlPlane(deps, async (controlPlane, _req, res) => {
        res.json(await controlPlane.getCapabilities());
      }),
    )
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/codex/features")
    .get(
      withControlPlane(deps, async (controlPlane, req, res) => {
        const result = await controlPlane.request("experimentalFeature/list", {
          limit: parsePositiveInteger(req.query.limit, 50),
          cursor: typeof req.query.cursor === "string" ? req.query.cursor : null,
        });
        res.json(result);
      }),
    )
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/codex/collaboration-modes")
    .get(
      withControlPlane(deps, async (controlPlane, _req, res) => {
        res.json(await controlPlane.request("collaborationMode/list", {}));
      }),
    )
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/codex/mcp")
    .get(
      withControlPlane(deps, async (controlPlane, req, res) => {
        const result = await controlPlane.request("mcpServerStatus/list", {
          limit: parsePositiveInteger(req.query.limit, 50),
          cursor: typeof req.query.cursor === "string" ? req.query.cursor : null,
        });
        res.json(result);
      }),
    )
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/codex/mcp/oauth/login")
    .post(
      withControlPlane(deps, async (controlPlane, req, res) => {
        const name = typeof req.body?.name === "string" ? req.body.name : "";
        res.json(await controlPlane.request("mcpServer/oauth/login", { name }));
      }),
    )
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/codex/mcp/reload")
    .post(
      withControlPlane(deps, async (controlPlane, _req, res) => {
        res.json(await controlPlane.request("config/mcpServer/reload", {}));
      }),
    )
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/codex/threads")
    .get(
      withControlPlane(deps, async (controlPlane, req, res) => {
        const modelProviders =
          typeof req.query.modelProviders === "string"
            ? req.query.modelProviders
                .split(",")
                .map((part) => part.trim())
                .filter((part) => part.length > 0)
            : [];
        const sourceKinds =
          typeof req.query.sourceKinds === "string"
            ? req.query.sourceKinds
                .split(",")
                .map((part) => part.trim())
                .filter((part) => part.length > 0)
            : [];
        const archived = req.query.archived === "true" ? true : req.query.archived === "false" ? false : undefined;
        const result = await controlPlane.request("thread/list", {
          cursor: typeof req.query.cursor === "string" ? req.query.cursor : null,
          limit: parsePositiveInteger(req.query.limit, 25),
          sortKey: req.query.sortKey === "updated_at" ? "updated_at" : "created_at",
          archived,
          cwd: undefined,
          modelProviders,
          sourceKinds,
        });
        res.json(result);
      }),
    )
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/codex/threads/loaded")
    .get(
      withControlPlane(deps, async (controlPlane, _req, res) => {
        res.json(await controlPlane.request("thread/loaded/list", {}));
      }),
    )
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/codex/threads/:threadId")
    .get(
      withControlPlane(deps, async (controlPlane, req, res) => {
        const includeTurns = req.query.includeTurns === "true";
        res.json(
          await controlPlane.request("thread/read", {
            threadId: req.params.threadId,
            includeTurns,
          }),
        );
      }),
    )
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/codex/threads/:threadId/fork")
    .post(
      withControlPlane(deps, async (controlPlane, req, res) => {
        res.json(await controlPlane.request("thread/fork", { threadId: req.params.threadId }));
      }),
    )
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/codex/threads/:threadId/name")
    .post(
      withControlPlane(deps, async (controlPlane, req, res) => {
        const name = typeof req.body?.name === "string" ? req.body.name : "";
        res.json(await controlPlane.request("thread/name/set", { threadId: req.params.threadId, name }));
      }),
    )
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/codex/threads/:threadId/archive")
    .post(
      withControlPlane(deps, async (controlPlane, req, res) => {
        res.json(await controlPlane.request("thread/archive", { threadId: req.params.threadId }));
      }),
    )
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/codex/threads/:threadId/unarchive")
    .post(
      withControlPlane(deps, async (controlPlane, req, res) => {
        res.json(await controlPlane.request("thread/unarchive", { threadId: req.params.threadId }));
      }),
    )
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/codex/threads/:threadId/unsubscribe")
    .post(
      withControlPlane(deps, async (controlPlane, req, res) => {
        res.json(await controlPlane.request("thread/unsubscribe", { threadId: req.params.threadId }));
      }),
    )
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/codex/account")
    .get(
      withControlPlane(deps, async (controlPlane, _req, res) => {
        res.json(await controlPlane.request("account/read", { refreshToken: false }));
      }),
    )
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/codex/account/rate-limits")
    .get(
      withControlPlane(deps, async (controlPlane, _req, res) => {
        res.json(await controlPlane.request("account/rateLimits/read", {}));
      }),
    )
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/codex/account/login/start")
    .post(
      withControlPlane(deps, async (controlPlane, req, res) => {
        const body = req.body ?? {};
        const payload: Record<string, unknown> = {};
        if (typeof body.type === "string") payload.type = body.type;
        if (typeof body.apiKey === "string") payload.apiKey = body.apiKey;
        res.json(await controlPlane.request("account/login/start", payload));
      }),
    )
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/codex/account/login/cancel")
    .post(
      withControlPlane(deps, async (controlPlane, req, res) => {
        const loginId = typeof req.body?.loginId === "string" ? req.body.loginId : "";
        res.json(await controlPlane.request("account/login/cancel", { loginId }));
      }),
    )
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/codex/account/logout")
    .post(
      withControlPlane(deps, async (controlPlane, _req, res) => {
        res.json(await controlPlane.request("account/logout", {}));
      }),
    )
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/codex/requests/user-input")
    .get(
      withControlPlane(deps, async (controlPlane, _req, res) => {
        res.json({ data: controlPlane.listPendingUserInputRequests() });
      }),
    )
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/codex/requests/user-input/:requestId/respond")
    .post(
      withControlPlane(deps, async (controlPlane, req, res) => {
        const requestId =
          typeof req.params.requestId === "string" ? req.params.requestId : String(req.params.requestId ?? "");
        const accepted = await controlPlane.respondToRequest(requestId, req.body?.result ?? null);
        if (!accepted) {
          res.status(404).json({ error: { code: "not_found", message: "Pending request not found" } });
          return;
        }
        res.json({ ok: true });
      }),
    )
    .all((_req, res) => methodNotAllowed(res, ["POST"]));
}
