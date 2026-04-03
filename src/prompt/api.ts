/**
 * HTTP routes for prompt template CRUD + preview.
 *
 * GET    /api/v1/templates           — list all templates
 * GET    /api/v1/templates/:id       — get one template
 * POST   /api/v1/templates           — create template
 * PUT    /api/v1/templates/:id       — update template
 * DELETE /api/v1/templates/:id       — delete template
 * POST   /api/v1/templates/:id/preview — render with sample data
 */

import type { Express } from "express";

import { methodNotAllowed } from "../http/route-helpers.js";
import type { PromptTemplateStore } from "./store.js";
import { PromptTemplateValidationError } from "./template-policy.js";
import { isRecord } from "../utils/type-guards.js";

interface TemplateApiDeps {
  templateStore: PromptTemplateStore;
}

function sendTemplateValidationError(
  response: { status: (code: number) => { json: (body: unknown) => void } },
  message: string,
): void {
  response.status(400).json({
    error: { code: "invalid_template_body", message },
  });
}

export function registerTemplateApi(app: Express, deps: TemplateApiDeps): void {
  app
    .route("/api/v1/templates")
    .get((_request, response) => {
      response.json({ templates: deps.templateStore.list() });
    })
    .post((request, response) => {
      const body = request.body;
      if (
        !isRecord(body) ||
        typeof body.id !== "string" ||
        typeof body.name !== "string" ||
        typeof body.body !== "string"
      ) {
        response.status(400).json({
          error: { code: "invalid_template", message: "id, name, and body are required strings" },
        });
        return;
      }

      const existing = deps.templateStore.get(body.id);
      if (existing) {
        response.status(409).json({
          error: { code: "template_exists", message: `template "${body.id}" already exists` },
        });
        return;
      }

      try {
        const template = deps.templateStore.create({
          id: body.id,
          name: body.name,
          body: body.body,
        });
        response.status(201).json({ template });
      } catch (error) {
        if (error instanceof PromptTemplateValidationError) {
          sendTemplateValidationError(response, error.message);
          return;
        }
        throw error;
      }
    })
    .all((_request, response) => {
      methodNotAllowed(response, ["GET", "POST"]);
    });

  app
    .route("/api/v1/templates/:id")
    .get((request, response) => {
      const template = deps.templateStore.get(request.params.id);
      if (!template) {
        response.status(404).json({
          error: { code: "template_not_found", message: `template "${request.params.id}" not found` },
        });
        return;
      }
      response.json({ template });
    })
    .put((request, response) => {
      const body = request.body;
      if (!isRecord(body)) {
        response.status(400).json({
          error: { code: "invalid_payload", message: "body must be a JSON object" },
        });
        return;
      }

      const patch: { name?: string; body?: string } = {};
      if (typeof body.name === "string") patch.name = body.name;
      if (typeof body.body === "string") patch.body = body.body;

      try {
        const updated = deps.templateStore.update(request.params.id, patch);
        if (!updated) {
          response.status(404).json({
            error: { code: "template_not_found", message: `template "${request.params.id}" not found` },
          });
          return;
        }
        response.json({ template: updated });
      } catch (error) {
        if (error instanceof PromptTemplateValidationError) {
          sendTemplateValidationError(response, error.message);
          return;
        }
        throw error;
      }
    })
    .delete((request, response) => {
      const result = deps.templateStore.remove(request.params.id);
      if (result.error) {
        response.status(409).json({ error: { code: "active_template", message: result.error } });
        return;
      }
      if (!result.deleted) {
        response.status(404).json({
          error: { code: "template_not_found", message: `template "${request.params.id}" not found` },
        });
        return;
      }
      response.json({ deleted: true });
    })
    .all((_request, response) => {
      methodNotAllowed(response, ["GET", "PUT", "DELETE"]);
    });

  app
    .route("/api/v1/templates/:id/preview")
    .post(async (request, response) => {
      const result = await deps.templateStore.preview(request.params.id);
      if (result.error) {
        response.status(result.rendered ? 200 : 400).json(result);
        return;
      }
      response.json(result);
    })
    .all((_request, response) => {
      methodNotAllowed(response, ["POST"]);
    });
}
