import type { Express } from "express";

import type { ConfigOverlayPort } from "./overlay.js";
import { mergeOverlayMaps, normalizePathExpression, setOverlayPathValue } from "./overlay-helpers.js";
import { methodNotAllowed } from "../http/route-helpers.js";
import { isRecord } from "../utils/type-guards.js";

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
  configOverlayStore: ConfigOverlayPort;
  getConfigSchema?: () => Record<string, unknown>;
}

function normalizeOverlayPatch(patch: Record<string, unknown>): Record<string, unknown> {
  let normalized: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(patch)) {
    const value = isRecord(rawValue) ? normalizeOverlayPatch(rawValue) : structuredClone(rawValue);

    if (!key.includes(".")) {
      normalized[key] = value;
      continue;
    }

    const segments = normalizePathExpression(key);
    if (segments.length === 0) {
      continue;
    }

    const expanded: Record<string, unknown> = {};
    setOverlayPathValue(expanded, segments, value, { dangerousKeyMode: "throw" });
    normalized = mergeOverlayMaps(normalized, expanded);
  }

  return normalized;
}

export function registerConfigApi(app: Express, deps: ConfigApiDeps): void {
  registerConfigRoute(app, deps);
  registerSchemaRoute(app, deps);
  registerOverlayRoute(app, deps);
  registerOverlayDeleteRoute(app, deps);
}

function registerConfigRoute(app: Express, deps: ConfigApiDeps): void {
  app
    .route("/api/v1/config")
    .get((_request, response) => {
      response.json(deps.getEffectiveConfig());
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });
}

function registerSchemaRoute(app: Express, deps: ConfigApiDeps): void {
  app
    .route("/api/v1/config/schema")
    .get((_request, response) => {
      response.json(deps.getConfigSchema?.() ?? DEFAULT_CONFIG_SCHEMA);
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });
}

function registerOverlayRoute(app: Express, deps: ConfigApiDeps): void {
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

      const patch = isRecord(body.patch) ? normalizeOverlayPatch(body.patch) : body;
      const updated = await deps.configOverlayStore.applyPatch(patch);
      response.json({
        updated,
        overlay: deps.configOverlayStore.toMap(),
      });
    })
    .all((_request, response) => {
      methodNotAllowed(response, ["GET", "PUT"]);
    });
}

function registerOverlayDeleteRoute(app: Express, deps: ConfigApiDeps): void {
  app
    .route("/api/v1/config/overlay/:path")
    .patch(async (request, response) => {
      const pathExpression = request.params.path;
      if (!pathExpression?.trim()) {
        response.status(400).json({
          error: {
            code: "invalid_overlay_path",
            message: "overlay path must not be empty",
          },
        });
        return;
      }

      const body = request.body;
      if (!isRecord(body) || !("value" in body)) {
        response.status(400).json({
          error: {
            code: "invalid_overlay_payload",
            message: "PATCH body must contain a value field",
          },
        });
        return;
      }

      const updated = await deps.configOverlayStore.set(pathExpression, body.value);
      response.json({
        updated,
        overlay: deps.configOverlayStore.toMap(),
      });
    })
    .delete(async (request, response) => {
      const pathExpression = request.params.path;
      if (!pathExpression?.trim()) {
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
      methodNotAllowed(response, ["PATCH", "DELETE"]);
    });
}
