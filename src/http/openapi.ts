/**
 * OpenAPI 3.1 spec generator for Risoluto.
 *
 * Assembles the spec from path definitions in `./openapi-paths.js`.
 * Uses Zod 4's built-in `z.toJSONSchema()` — no external OpenAPI library needed.
 */

import { buildInfrastructurePaths, buildIssuePaths, buildPrPaths, buildStateAndMetricsPaths } from "./openapi-paths.js";

/** Lazily cached spec — built once on first access, then reused. */
let cachedSpec: Record<string, unknown> | undefined;

/** Returns the OpenAPI 3.1 spec as a plain JSON-serializable object. */
export function getOpenApiSpec(): Record<string, unknown> {
  cachedSpec ??= {
    openapi: "3.1.0",
    info: {
      title: "Risoluto API",
      version: "0.4.0",
      description: "REST API for Risoluto — manages issues, workspaces, config, and agent lifecycle.",
    },
    servers: [{ url: "http://localhost:4000", description: "Local Risoluto instance" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "token",
        },
        readTokenQuery: {
          type: "apiKey",
          in: "query",
          name: "read_token",
        },
      },
    },
    paths: {
      ...buildStateAndMetricsPaths(),
      ...buildIssuePaths(),
      ...buildPrPaths(),
      ...buildInfrastructurePaths(),
    },
  };
  return cachedSpec;
}
