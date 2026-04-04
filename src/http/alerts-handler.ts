import type { Request, Response } from "express";

import type { AlertHistoryStorePort } from "../alerts/history-store.js";

interface AlertHandlerDeps {
  alertHistoryStore?: AlertHistoryStorePort;
}

function parseLimit(value: unknown): number | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") {
    return null;
  }
  const parsed = Number.parseInt(candidate, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function getSingleParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export async function handleListAlertHistory(
  deps: AlertHandlerDeps,
  request: Request,
  response: Response,
): Promise<void> {
  if (!deps.alertHistoryStore) {
    response.status(503).json({ error: { code: "not_configured", message: "alert history store not available" } });
    return;
  }

  const limit = parseLimit(request.query.limit);
  if (request.query.limit !== undefined && limit === null) {
    response.status(400).json({ error: { code: "validation_error", message: "limit must be a positive integer" } });
    return;
  }

  const ruleName = getSingleParam(request.query.rule_name as string | string[] | undefined);
  const records = await deps.alertHistoryStore.list({
    limit: limit ?? undefined,
    ruleName: ruleName ?? undefined,
  });
  response.json({
    history: records,
  });
}
