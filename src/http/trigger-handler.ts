import type { Request, Response } from "express";

import type { ConfigStore } from "../config/store.js";
import type { RisolutoLogger } from "../core/types.js";
import type { OrchestratorPort } from "../orchestrator/port.js";
import type { TrackerIssueCreateInput, TrackerPort } from "../tracker/port.js";
import type { ApiErrorResponse } from "./service-errors.js";

export interface TriggerHandlerDeps {
  configStore?: ConfigStore;
  tracker?: TrackerPort;
  orchestrator: Pick<OrchestratorPort, "requestRefresh" | "requestTargetedRefresh">;
  webhookInbox?: {
    insertVerified: (delivery: {
      deliveryId: string;
      type: string;
      action: string;
      entityId: string | null;
      issueId: string | null;
      issueIdentifier: string | null;
      webhookTimestamp: number | null;
      payloadJson: string | null;
    }) => Promise<{ isNew: boolean }>;
  };
  logger: RisolutoLogger;
}

type TriggerConfig = ReturnType<ConfigStore["getConfig"]>["triggers"];
type ActiveTriggerConfig = TriggerConfig & { apiKey: string };

interface TriggerDispatchContext {
  action: string;
  body: Record<string, unknown>;
  issueId: string | null;
  issueIdentifier: string | null;
}

function sendError(response: Response, status: number, code: string, message: string): void {
  response.status(status).json({ error: { code, message } } satisfies ApiErrorResponse);
}

function extractApiKey(request: Request): string | null {
  const header = request.get("x-risoluto-trigger-key");
  if (header && header.trim()) {
    return header.trim();
  }
  const authorization = request.get("authorization");
  if (!authorization) {
    return null;
  }
  const bearerPrefix = "Bearer ";
  if (!authorization.startsWith(bearerPrefix)) {
    return null;
  }
  return authorization.slice(bearerPrefix.length).trim() || null;
}

function pickString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function requireTriggerConfig(
  response: Response,
  triggerConfig: TriggerConfig | undefined,
): ActiveTriggerConfig | null {
  if (triggerConfig?.apiKey) {
    return {
      ...triggerConfig,
      apiKey: triggerConfig.apiKey,
    };
  }

  sendError(response, 503, "trigger_not_configured", "Trigger API key is not configured");
  return null;
}

function authorizeTriggerRequest(request: Request, response: Response, apiKey: string): boolean {
  if (extractApiKey(request) === apiKey) {
    return true;
  }

  sendError(response, 401, "unauthorized", "Invalid trigger API key");
  return false;
}

function parseTriggerDispatchContext(
  request: Request,
  response: Response,
  allowedActions: readonly string[],
): TriggerDispatchContext | null {
  const body = request.body as Record<string, unknown>;
  const action = pickString(body, "action");
  if (!action) {
    sendError(response, 400, "validation_error", "action is required");
    return null;
  }

  if (!allowedActions.includes(action)) {
    sendError(response, 403, "action_not_allowed", `Action ${action} is not enabled`);
    return null;
  }

  return {
    action,
    body,
    issueId: pickString(body, "issue_id", "issueId"),
    issueIdentifier: pickString(body, "issue_identifier", "issueIdentifier"),
  };
}

function getIdempotencyKey(request: Request, body: Record<string, unknown>): string | null {
  return request.get("Idempotency-Key") ?? pickString(body, "idempotency_key", "idempotencyKey");
}

async function handleDuplicateTriggerDelivery(
  deps: TriggerHandlerDeps,
  request: Request,
  response: Response,
  dispatch: TriggerDispatchContext,
): Promise<boolean> {
  const idempotencyKey = getIdempotencyKey(request, dispatch.body);
  if (!idempotencyKey || !deps.webhookInbox) {
    return false;
  }

  const result = await deps.webhookInbox.insertVerified({
    deliveryId: idempotencyKey,
    type: "Trigger",
    action: dispatch.action,
    entityId: null,
    issueId: dispatch.issueId,
    issueIdentifier: dispatch.issueIdentifier,
    webhookTimestamp: null,
    payloadJson: JSON.stringify(dispatch.body),
  });
  if (result.isNew) {
    return false;
  }

  response.status(200).json({ ok: true, action: dispatch.action, duplicate: true });
  return true;
}

function handleRePollTrigger(deps: TriggerHandlerDeps, response: Response): void {
  const refresh = deps.orchestrator.requestRefresh("trigger:re_poll");
  response.status(202).json({ ok: true, action: "re_poll", queued: refresh.queued, coalesced: refresh.coalesced });
}

function handleRefreshIssueTrigger(
  deps: TriggerHandlerDeps,
  response: Response,
  dispatch: Pick<TriggerDispatchContext, "action" | "issueId" | "issueIdentifier">,
): void {
  if (dispatch.issueId && dispatch.issueIdentifier) {
    deps.orchestrator.requestTargetedRefresh(dispatch.issueId, dispatch.issueIdentifier, "trigger:refresh_issue");
    response.status(202).json({
      ok: true,
      action: dispatch.action,
      targeted: true,
      issueId: dispatch.issueId,
      issueIdentifier: dispatch.issueIdentifier,
    });
    return;
  }

  const refresh = deps.orchestrator.requestRefresh("trigger:refresh_issue");
  response.status(202).json({
    ok: true,
    action: dispatch.action,
    targeted: false,
    queued: refresh.queued,
    coalesced: refresh.coalesced,
  });
}

async function handleCreateIssueTrigger(
  deps: TriggerHandlerDeps,
  response: Response,
  body: Record<string, unknown>,
): Promise<void> {
  if (!deps.tracker) {
    sendError(response, 503, "tracker_not_configured", "Tracker is not available");
    return;
  }

  const title = pickString(body, "title");
  if (!title) {
    sendError(response, 400, "validation_error", "title is required for create_issue");
    return;
  }

  const input: TrackerIssueCreateInput = {
    title,
    description: pickString(body, "description"),
    stateName: pickString(body, "state_name", "stateName"),
  };
  const created = await deps.tracker.createIssue(input);
  deps.orchestrator.requestTargetedRefresh(created.issueId, created.identifier, "trigger:create_issue");
  response.status(202).json({
    ok: true,
    action: "create_issue",
    issueId: created.issueId,
    issueIdentifier: created.identifier,
    issueUrl: created.url,
  });
}

async function dispatchTriggerAction(
  deps: TriggerHandlerDeps,
  response: Response,
  dispatch: TriggerDispatchContext,
): Promise<void> {
  switch (dispatch.action) {
    case "re_poll":
      handleRePollTrigger(deps, response);
      return;
    case "refresh_issue":
      handleRefreshIssueTrigger(deps, response, dispatch);
      return;
    case "create_issue":
      await handleCreateIssueTrigger(deps, response, dispatch.body);
      return;
    default:
      deps.logger.warn({ action: dispatch.action }, "trigger action reached unexpected fallback");
      sendError(response, 400, "validation_error", `Unsupported action ${dispatch.action}`);
  }
}

export async function handleTriggerDispatch(
  deps: TriggerHandlerDeps,
  request: Request,
  response: Response,
): Promise<void> {
  const triggerConfig = requireTriggerConfig(response, deps.configStore?.getConfig().triggers);
  if (!triggerConfig) {
    return;
  }

  if (!authorizeTriggerRequest(request, response, triggerConfig.apiKey)) {
    return;
  }

  const dispatch = parseTriggerDispatchContext(request, response, triggerConfig.allowedActions);
  if (!dispatch) {
    return;
  }

  if (await handleDuplicateTriggerDelivery(deps, request, response, dispatch)) {
    return;
  }

  await dispatchTriggerAction(deps, response, dispatch);
}
