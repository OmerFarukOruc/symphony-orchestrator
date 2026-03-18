import type { Express, Response } from "express";

import { ConfigOverlayStore } from "./overlay.js";
import { isRecord } from "../utils/type-guards.js";

function methodNotAllowed(response: Response): void {
  response.status(405).json({
    error: {
      code: "method_not_allowed",
      message: "Method Not Allowed",
    },
  });
}

const DEFAULT_CONFIG_SCHEMA = {
  overlay_put_body_examples: [
    {
      codex: {
        model: "gpt-5.4",
      },
    },
    {
      path: "codex.model",
      value: "gpt-5.4",
    },
    {
      patch: {
        server: {
          port: 4001,
        },
      },
    },
  ],
  routes: {
    get_effective_config: "GET /api/v1/config",
    get_overlay: "GET /api/v1/config/overlay",
    put_overlay: "PUT /api/v1/config/overlay",
    delete_overlay_path: "DELETE /api/v1/config/overlay/:path",
    get_schema: "GET /api/v1/config/schema",
  },
};

interface ConfigApiDeps {
  getEffectiveConfig: () => Record<string, unknown>;
  configOverlayStore: ConfigOverlayStore;
  getConfigSchema?: () => Record<string, unknown>;
}

export function registerConfigApi(app: Express, deps: ConfigApiDeps): void {
  app
    .route("/api/v1/config")
    .get((_request, response) => {
      response.json(deps.getEffectiveConfig());
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });

  app
    .route("/api/v1/config/schema")
    .get((_request, response) => {
      response.json(deps.getConfigSchema?.() ?? DEFAULT_CONFIG_SCHEMA);
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });

  app
    .route("/api/v1/config/overlay")
    .get((_request, response) => {
      response.json({
        overlay: deps.configOverlayStore.toMap(),
      });
    })
    .put(async (request, response) => {
      const body = request.body;
      if (!isRecord(body)) {
        response.status(400).json({
          error: {
            code: "invalid_overlay_payload",
            message: "overlay payload must be a JSON object",
          },
        });
        return;
      }

      if ("path" in body) {
        if (typeof body.path !== "string" || !("value" in body)) {
          response.status(400).json({
            error: {
              code: "invalid_overlay_payload",
              message: "path-based updates require a string path and value",
            },
          });
          return;
        }
        const updated = await deps.configOverlayStore.set(body.path, body.value);
        response.json({
          updated,
          overlay: deps.configOverlayStore.toMap(),
        });
        return;
      }

      const patch = isRecord(body.patch) ? body.patch : body;
      const updated = await deps.configOverlayStore.applyPatch(patch);
      response.json({
        updated,
        overlay: deps.configOverlayStore.toMap(),
      });
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });

  app
    .route("/api/v1/config/overlay/:path")
    .delete(async (request, response) => {
      const pathExpression = request.params.path;
      if (!pathExpression || !pathExpression.trim()) {
        response.status(400).json({
          error: {
            code: "invalid_overlay_path",
            message: "overlay path must not be empty",
          },
        });
        return;
      }

      const deleted = await deps.configOverlayStore.delete(pathExpression);
      if (!deleted) {
        response.status(404).json({
          error: {
            code: "overlay_path_not_found",
            message: "overlay path not found",
          },
        });
        return;
      }

      response.status(204).send();
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });
}
