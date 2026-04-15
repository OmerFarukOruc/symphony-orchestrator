import type { Request, Response } from "express";

import type { AlertHistoryStorePort } from "../alerts/history-store.js";
import { NotificationCenter } from "../notification/notification-center.js";
import { parseLimit, getSingleParam } from "./query-params.js";

interface AlertHandlerDeps {
  alertHistoryStore?: AlertHistoryStorePort;
  notificationCenter?: Pick<NotificationCenter, "listAlertHistory">;
}

export async function handleListAlertHistory(
  deps: AlertHandlerDeps,
  request: Request,
  response: Response,
): Promise<void> {
  const limit = parseLimit(request.query.limit);
  if (request.query.limit !== undefined && limit === null) {
    response.status(400).json({ error: { code: "validation_error", message: "limit must be a positive integer" } });
    return;
  }

  const ruleName = getSingleParam(request.query.rule_name as string | string[] | undefined);
  const center =
    deps.notificationCenter ??
    new NotificationCenter({
      alertHistoryStore: deps.alertHistoryStore,
    });
  const result = await center.listAlertHistory({
    limit: limit ?? undefined,
    ruleName: ruleName ?? undefined,
  });
  response.status(result.status).json(result.body);
}
