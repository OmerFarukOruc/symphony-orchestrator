import type { Express, Response } from "express";

import { SecretsStore } from "./secrets-store.js";

function methodNotAllowed(response: Response): void {
  response.status(405).json({
    error: {
      code: "method_not_allowed",
      message: "Method Not Allowed",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidSecretKey(value: string): boolean {
  return /^[A-Za-z0-9._:-]+$/.test(value);
}

export interface SecretsApiDeps {
  secretsStore: SecretsStore;
}

export function registerSecretsApi(app: Express, deps: SecretsApiDeps): void {
  app
    .route("/api/v1/secrets")
    .get((_request, response) => {
      response.json({
        keys: deps.secretsStore.list(),
      });
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });

  app
    .route("/api/v1/secrets/:key")
    .post(async (request, response) => {
      const key = request.params.key;
      if (!key || !isValidSecretKey(key)) {
        response.status(400).json({
          error: {
            code: "invalid_secret_key",
            message: "secret key must match /^[A-Za-z0-9._:-]+$/",
          },
        });
        return;
      }

      const body = request.body;
      const rawValue = isRecord(body) ? body.value : null;
      if (typeof rawValue !== "string" || rawValue.length === 0) {
        response.status(400).json({
          error: {
            code: "invalid_secret_value",
            message: "secret value must be a non-empty string",
          },
        });
        return;
      }

      await deps.secretsStore.set(key, rawValue);
      response.status(204).send();
    })
    .delete(async (request, response) => {
      const key = request.params.key;
      if (!key || !isValidSecretKey(key)) {
        response.status(400).json({
          error: {
            code: "invalid_secret_key",
            message: "secret key must match /^[A-Za-z0-9._:-]+$/",
          },
        });
        return;
      }

      const deleted = await deps.secretsStore.delete(key);
      if (!deleted) {
        response.status(404).json({
          error: {
            code: "secret_not_found",
            message: "secret key not found",
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
