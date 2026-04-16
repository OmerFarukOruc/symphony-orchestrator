import type { Express } from "express";

import type { AuditLoggerPort } from "../../audit/port.js";
import { methodNotAllowed } from "../errors.js";

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(Math.trunc(value), max));
}

interface AuditApiDeps {
  auditLogger: AuditLoggerPort;
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
