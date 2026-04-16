import { randomUUID } from "node:crypto";

import type { Response } from "express";

import type { ConfigStore } from "../config/store.js";
import type { RisolutoLogger } from "../core/types.js";
import { asRecord, asStringOrNull, toErrorString } from "../utils/type-guards.js";
import type { VerifiedWebhookDeliveryStore } from "./delivery-workflow.js";
import { WebhookDeliveryWorkflow } from "./delivery-workflow.js";
import { verifyGitHubSignature, verifyLinearSignature } from "./signature.js";
import type { ApiErrorResponse } from "../http/service-errors.js";
import type { LinearWebhookPayload, WebhookRequest } from "../http/webhook-types.js";
import {
  COMMENT_ACTIONS,
  ISSUE_ACTIONS,
  SUPPORTED_WEBHOOK_TYPES,
  validateWebhookPayload,
} from "../http/webhook-types.js";

const REPLAY_WINDOW_MS = 60_000;
const SUPPORTED_GITHUB_ISSUE_ACTIONS = new Set(["opened", "edited", "reopened", "closed", "labeled", "unlabeled"]);

export interface WebhookHandlerDeps {
  getWebhookSecret: () => string | null;
  getPreviousWebhookSecret?: () => string | null;
  requestRefresh: (reason: string) => void;
  requestTargetedRefresh?: (issueId: string, issueIdentifier: string, reason: string) => void;
  stopWorkerForIssue?: (issueIdentifier: string, reason: string) => void;
  recordVerifiedDelivery: (eventType: string) => void;
  webhookInbox?: VerifiedWebhookDeliveryStore;
  logger: RisolutoLogger;
}

export interface GitHubWebhookHandlerDeps {
  configStore?: ConfigStore;
  requestTargetedRefresh?: (issueId: string, issueIdentifier: string, reason: string) => void;
  stopWorkerForIssue?: (issueIdentifier: string, reason: string) => void;
  webhookInbox?: VerifiedWebhookDeliveryStore;
  logger: RisolutoLogger;
}

type ServiceConfig = ReturnType<ConfigStore["getConfig"]>;

interface GitHubWebhookContext {
  action: string;
  config: ServiceConfig | undefined;
  deliveryId: string;
  event: string;
  issueId: string | null;
  issueIdentifier: string | null;
  payload: Record<string, unknown>;
  repoFullName: string | null;
}

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } } satisfies ApiErrorResponse);
}

function extractDeliveryId(req: WebhookRequest): string | null {
  const header = req.get("linear-delivery");
  if (!header) return null;
  return header.trim();
}

function extractIssueInfo(
  data: Record<string, unknown>,
  type: string,
): { issueId: string | null; issueIdentifier: string | null } {
  if (type === "Issue") {
    const issueId = typeof data.id === "string" ? data.id : null;
    const issueIdentifier = typeof data.identifier === "string" ? data.identifier : null;
    return { issueId, issueIdentifier };
  }
  const issue = data.issue as Record<string, unknown> | undefined;
  if (issue && typeof issue === "object") {
    const issueId = typeof issue.id === "string" ? issue.id : null;
    const issueIdentifier = typeof issue.identifier === "string" ? issue.identifier : null;
    return { issueId, issueIdentifier };
  }
  return { issueId: null, issueIdentifier: null };
}

export function handleWebhookLinear(deps: WebhookHandlerDeps, req: WebhookRequest, res: Response): void {
  const secret = deps.getWebhookSecret();
  if (!secret) {
    res.setHeader("Retry-After", "5");
    sendError(res, 503, "webhook_not_configured", "Webhook signing secret is not configured");
    return;
  }

  const signature = req.get("linear-signature");
  if (!signature) {
    sendError(res, 401, "signature_missing", "Missing Linear-Signature header");
    return;
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    sendError(res, 401, "signature_invalid", "Unable to verify signature — raw body unavailable");
    return;
  }

  let signatureValid = verifyLinearSignature(rawBody, signature, secret);
  let usedPreviousSecret = false;
  if (!signatureValid) {
    const previousSecret = deps.getPreviousWebhookSecret?.();
    if (previousSecret) {
      signatureValid = verifyLinearSignature(rawBody, signature, previousSecret);
      usedPreviousSecret = signatureValid;
    }
  }
  if (!signatureValid) {
    deps.logger.warn(
      { path: req.path, remoteAddress: req.socket.remoteAddress },
      "webhook signature verification failed — possible tampering or misconfigured secret",
    );
    sendError(res, 401, "signature_invalid", "Invalid webhook signature");
    return;
  }

  const body = req.body as LinearWebhookPayload;
  const validationError = validateWebhookPayload(body);
  if (validationError) {
    sendError(res, 400, "invalid_payload", validationError);
    return;
  }

  const timestamp = body.webhookTimestamp;
  if (Math.abs(Date.now() - timestamp) > REPLAY_WINDOW_MS) {
    sendError(res, 401, "replay_rejected", "Webhook timestamp outside acceptable window");
    return;
  }

  const deliveryId = extractDeliveryId(req);
  const action = body.action;
  const type = body.type;
  const eventType = `${type}:${action}`;
  const { issueId, issueIdentifier } = extractIssueInfo(body.data, type);
  const workflow = new WebhookDeliveryWorkflow(deps.logger, deps.webhookInbox);

  workflow.respondAccepted(res, {
    delivery: {
      deliveryId: deliveryId ?? `fallback-${Date.now()}-${randomUUID().slice(0, 8)}`,
      type,
      action,
      entityId: typeof body.data.id === "string" ? body.data.id : null,
      issueId,
      issueIdentifier,
      webhookTimestamp: timestamp,
      payloadJson: JSON.stringify(body),
    },
    eventType,
    recordVerifiedDelivery: deps.recordVerifiedDelivery,
    duplicateMessage: "duplicate webhook delivery — skipped",
    errorMessage: "unhandled error in webhook side-effect processing",
    process: () => processWebhookEvent(deps, type, action, body, issueId, issueIdentifier, usedPreviousSecret),
  });
}

function processWebhookEvent(
  deps: WebhookHandlerDeps,
  type: string,
  action: string,
  body: LinearWebhookPayload,
  issueId: string | null,
  issueIdentifier: string | null,
  usedPreviousSecret: boolean,
): void {
  const logCtx = { type, action, issueId, issueIdentifier, usedPreviousSecret };

  if (!SUPPORTED_WEBHOOK_TYPES.has(type)) {
    deps.logger.debug(logCtx, "unsupported webhook type — ignored");
    return;
  }

  if (type === "Issue" && ISSUE_ACTIONS.has(action)) {
    handleIssueEvent(deps, action, body, issueId, issueIdentifier);
    return;
  }

  if (type === "Comment" && COMMENT_ACTIONS.has(action)) {
    handleCommentEvent(deps, action, issueId, issueIdentifier);
    return;
  }

  deps.logger.debug(logCtx, "supported type but unsupported action — ignored");
}

function handleIssueEvent(
  deps: WebhookHandlerDeps,
  action: string,
  body: LinearWebhookPayload,
  issueId: string | null,
  issueIdentifier: string | null,
): void {
  if (issueId && issueIdentifier && deps.requestTargetedRefresh) {
    deps.requestTargetedRefresh(issueId, issueIdentifier, `webhook:issue:${action}`);
    maybeStopWorker(deps, action, body, issueIdentifier);
    return;
  }

  deps.requestRefresh(`webhook:issue:${action}`);
}

function handleCommentEvent(
  deps: WebhookHandlerDeps,
  action: string,
  issueId: string | null,
  issueIdentifier: string | null,
): void {
  if (issueId && issueIdentifier && deps.requestTargetedRefresh) {
    deps.requestTargetedRefresh(issueId, issueIdentifier, `webhook:comment:${action}`);
    return;
  }

  deps.requestRefresh(`webhook:comment:${action}`);
}

function maybeStopWorker(
  deps: WebhookHandlerDeps,
  action: string,
  body: LinearWebhookPayload,
  issueIdentifier: string,
): void {
  if (action !== "update") {
    return;
  }

  const data = body.data as Record<string, unknown>;
  const state = data.state as Record<string, unknown> | undefined;
  const stateName = typeof state?.name === "string" ? state.name : null;
  if (!stateName) {
    return;
  }

  if (["done", "cancelled", "canceled", "archived", "closed"].includes(stateName.toLowerCase())) {
    deps.stopWorkerForIssue?.(issueIdentifier, `webhook:issue:update:state=${stateName}`);
  }
}

function validateGitHubWebhookRequest(
  deps: GitHubWebhookHandlerDeps,
  req: WebhookRequest,
  res: Response,
): { config: ServiceConfig | undefined; event: string } | null {
  const config = deps.configStore?.getConfig();
  const secret = config?.triggers?.githubSecret ?? null;
  if (!secret) {
    sendError(res, 503, "webhook_not_configured", "GitHub webhook signing secret is not configured");
    return null;
  }

  const signature = req.get("x-hub-signature-256");
  if (!signature) {
    sendError(res, 401, "signature_missing", "Missing X-Hub-Signature-256 header");
    return null;
  }

  if (!req.rawBody) {
    sendError(res, 401, "signature_invalid", "Unable to verify signature — raw body unavailable");
    return null;
  }

  if (!verifyGitHubSignature(req.rawBody, signature, secret)) {
    deps.logger.warn({ path: req.path, remoteAddress: req.socket.remoteAddress }, "github webhook signature invalid");
    sendError(res, 401, "signature_invalid", "Invalid GitHub webhook signature");
    return null;
  }

  const event = req.get("x-github-event");
  if (!event) {
    sendError(res, 400, "event_missing", "Missing X-GitHub-Event header");
    return null;
  }

  return { config, event };
}

function buildGitHubWebhookContext(
  req: WebhookRequest,
  validated: { config: ServiceConfig | undefined; event: string },
): GitHubWebhookContext {
  const payload = asRecord(req.body);
  const action = asStringOrNull(payload.action) ?? "unknown";
  const issue = asRecord(payload.issue);
  const repository = asRecord(payload.repository);
  const repoFullName = asStringOrNull(repository.full_name);
  const issueNumber = typeof issue.number === "number" ? issue.number : null;

  const issueId = issueNumber === null ? null : String(issueNumber);
  const issueIdentifier = issueNumber === null || !repoFullName ? null : `${repoFullName}#${issueNumber}`;

  return {
    action,
    config: validated.config,
    deliveryId: req.get("x-github-delivery") ?? `github-${Date.now()}`,
    event: validated.event,
    issueId,
    issueIdentifier,
    payload,
    repoFullName,
  };
}

export function handleWebhookGitHub(deps: GitHubWebhookHandlerDeps, req: WebhookRequest, res: Response): void {
  const validated = validateGitHubWebhookRequest(deps, req, res);
  if (!validated) {
    return;
  }

  const context = buildGitHubWebhookContext(req, validated);
  const workflow = new WebhookDeliveryWorkflow(deps.logger, deps.webhookInbox);
  workflow.respondAccepted(res, {
    delivery: {
      deliveryId: context.deliveryId,
      type: context.event,
      action: context.action,
      entityId: context.issueId,
      issueId: context.issueId,
      issueIdentifier: context.issueIdentifier,
      webhookTimestamp: null,
      payloadJson: JSON.stringify(context.payload),
    },
    duplicateMessage: "duplicate github webhook delivery skipped",
    errorMessage: "github webhook processing failed",
    process: () =>
      processGitHubWebhook(
        deps,
        context.config,
        context.event,
        context.action,
        context.repoFullName,
        context.issueId,
        context.issueIdentifier,
      ),
  });
}

function processGitHubWebhook(
  deps: GitHubWebhookHandlerDeps,
  config: ServiceConfig | undefined,
  event: string,
  action: string,
  repoFullName: string | null,
  issueId: string | null,
  issueIdentifier: string | null,
): void {
  if (event !== "issues" || !SUPPORTED_GITHUB_ISSUE_ACTIONS.has(action)) {
    deps.logger.debug({ event, action }, "github webhook event ignored");
    return;
  }

  const configuredRepo =
    config?.tracker.kind === "github" && config.tracker.owner && config.tracker.repo
      ? `${config.tracker.owner}/${config.tracker.repo}`.toLowerCase()
      : null;
  if (!configuredRepo || !repoFullName || configuredRepo !== repoFullName.toLowerCase()) {
    deps.logger.debug({ event, action, repoFullName, configuredRepo }, "github webhook repo does not match tracker");
    return;
  }
  if (!issueId || !issueIdentifier) {
    deps.logger.debug({ event, action }, "github webhook missing issue identity");
    return;
  }

  deps.requestTargetedRefresh?.(issueId, issueIdentifier, `github:${event}:${action}`);
  if (action === "closed") {
    deps.stopWorkerForIssue?.(issueIdentifier, "github webhook reported issue closed");
  }
}

export { toErrorString };
export { verifyGitHubSignature, verifyLinearSignature } from "./signature.js";
