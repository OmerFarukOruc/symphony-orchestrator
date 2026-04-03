import type { Express, Response } from "express";

import { SecretsStore } from "./store.js";
import { methodNotAllowed } from "../http/route-helpers.js";
import { isRecord } from "../utils/type-guards.js";

function isValidSecretKey(value: string): boolean {
  return /^[\w.:-]+$/.test(value);
}

/** Returns false and sends a 400 response when the key param is invalid. */
function validateSecretKeyOrReject(key: string | undefined, response: Response): key is string {
  if (!key || !isValidSecretKey(key)) {
    response.status(400).json({
      error: {
        code: "invalid_secret_key",
        message: "secret key must match /^[A-Za-z0-9._:-]+$/",
      },
    });
    return false;
  }
  return true;
}

interface SecretsApiDeps {
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
      if (!validateSecretKeyOrReject(request.params.key, response)) return;

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

      await deps.secretsStore.set(request.params.key, rawValue);
      response.status(204).send();
    })
    .delete(async (request, response) => {
      if (!validateSecretKeyOrReject(request.params.key, response)) return;

      const deleted = await deps.secretsStore.delete(request.params.key);
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
      methodNotAllowed(response, ["POST", "DELETE"]);
    });
}
