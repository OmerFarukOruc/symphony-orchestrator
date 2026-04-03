/**
 * HTTP routes for the audit log.
 *
 * GET /api/v1/audit — paginated, filterable audit log.
 *
 * Query params:
 *   tableName — filter by table (config, secrets, prompt_templates)
 *   key       — filter by exact key
 *   pathPrefix — filter by path prefix
 *   from      — filter by timestamp >= ISO date
 *   to        — filter by timestamp <= ISO date
 *   limit     — max results (default 50)
 *   offset    — pagination offset (default 0)
 */

import type { Express } from "express";

import { methodNotAllowed } from "../http/route-helpers.js";
import type { AuditLogger } from "./logger.js";

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(Math.trunc(value), max));
}

interface AuditApiDeps {
  auditLogger: AuditLogger;
}

export function registerAuditApi(app: Express, deps: AuditApiDeps): void {
  app
    .route("/api/v1/audit")
    .get((request, response) => {
      const { tableName, key, pathPrefix, from, to, limit, offset } = request.query;

      const queryOptions = {
        tableName: typeof tableName === "string" ? tableName : undefined,
        key: typeof key === "string" ? key : undefined,
        pathPrefix: typeof pathPrefix === "string" ? pathPrefix : undefined,
        from: typeof from === "string" ? from : undefined,
        to: typeof to === "string" ? to : undefined,
        limit: typeof limit === "string" ? clampInt(Number(limit), 0, 1000, 50) : 50,
        offset: typeof offset === "string" ? clampInt(Number(offset), 0, Infinity, 0) : 0,
      };

      const entries = deps.auditLogger.query(queryOptions);
      const total = deps.auditLogger.count(queryOptions);

      response.json({ entries, total });
    })
    .all((_request, response) => {
      methodNotAllowed(response);
    });
}
