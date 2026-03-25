import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { ConfigOverlayStore } from "./overlay.js";
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
  configOverlayStore: ConfigOverlayStore;
  getConfigSchema?: () => Record<string, unknown>;
}

export function registerConfigApi(app: FastifyInstance, deps: ConfigApiDeps): void {
  app.get("/api/v1/config", (_request, reply) => {
    reply.send(deps.getEffectiveConfig());
  });

  app.get("/api/v1/config/schema", (_request, reply) => {
    reply.send(deps.getConfigSchema?.() ?? DEFAULT_CONFIG_SCHEMA);
  });

  app.get("/api/v1/config/overlay", (_request, reply) => {
    reply.send({
      overlay: deps.configOverlayStore.toMap(),
    });
  });

  app.put("/api/v1/config/overlay", async (request: FastifyRequest<{ Body: Record<string, unknown> }>, reply) => {
    const body = request.body;
    if (!isRecord(body)) {
      reply.status(400).send({
        error: {
          code: "invalid_overlay_payload",
          message: "overlay payload must be a JSON object",
        },
      });
      return;
    }

    const patch = isRecord(body.patch) ? body.patch : body;
    const updated = await deps.configOverlayStore.applyPatch(patch);
    reply.send({
      updated,
      overlay: deps.configOverlayStore.toMap(),
    });
  });

  app.patch(
    "/api/v1/config/overlay/:path",
    async (request: FastifyRequest<{ Params: { path: string }; Body: Record<string, unknown> }>, reply) => {
      const pathExpression = request.params.path;
      if (!pathExpression?.trim()) {
        reply.status(400).send({
          error: {
            code: "invalid_overlay_path",
            message: "overlay path must not be empty",
          },
        });
        return;
      }

      const body = request.body;
      if (!isRecord(body) || !("value" in body)) {
        reply.status(400).send({
          error: {
            code: "invalid_overlay_payload",
            message: "PATCH body must contain a value field",
          },
        });
        return;
      }

      const updated = await deps.configOverlayStore.set(pathExpression, body.value);
      reply.send({
        updated,
        overlay: deps.configOverlayStore.toMap(),
      });
    },
  );

  app.delete(
    "/api/v1/config/overlay/:path",
    async (request: FastifyRequest<{ Params: { path: string } }>, reply: FastifyReply) => {
      const pathExpression = request.params.path;
      if (!pathExpression?.trim()) {
        reply.status(400).send({
          error: {
            code: "invalid_overlay_path",
            message: "overlay path must not be empty",
          },
        });
        return;
      }

      const deleted = await deps.configOverlayStore.delete(pathExpression);
      if (!deleted) {
        reply.status(404).send({
          error: {
            code: "overlay_path_not_found",
            message: "overlay path not found",
          },
        });
        return;
      }

      reply.status(204).send();
    },
  );
}
