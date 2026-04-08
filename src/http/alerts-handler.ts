import type { Request, Response } from "express";

import type { AlertHistoryStorePort } from "../alerts/history-store.js";
import { parseLimit, getSingleParam } from "./query-params.js";

interface AlertHandlerDeps {
  alertHistoryStore?: AlertHistoryStorePort;
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
