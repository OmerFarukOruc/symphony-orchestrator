import { createHmac, timingSafeEqual } from "node:crypto";

import type { Response } from "express";

import type { ConfigStore } from "../config/store.js";
import type { RisolutoLogger } from "../core/types.js";
import { asRecord, asStringOrNull } from "../utils/type-guards.js";
import type { ApiErrorResponse } from "./service-errors.js";
import type { WebhookRequest } from "./webhook-types.js";

const SUPPORTED_GITHUB_ISSUE_ACTIONS = new Set(["opened", "edited", "reopened", "closed", "labeled", "unlabeled"]);

export interface GitHubWebhookHandlerDeps {
  configStore?: ConfigStore;
  requestTargetedRefresh?: (issueId: string, issueIdentifier: string, reason: string) => void;
  stopWorkerForIssue?: (issueIdentifier: string, reason: string) => void;
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

export function verifyGitHubSignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  const normalized = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected.length !== normalized.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(normalized));
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

function queueGitHubWebhookProcessing(deps: GitHubWebhookHandlerDeps, context: GitHubWebhookContext): void {
  const insertPromise = deps.webhookInbox
    ? deps.webhookInbox.insertVerified({
        deliveryId: context.deliveryId,
        type: context.event,
        action: context.action,
        entityId: context.issueId,
        issueId: context.issueId,
        issueIdentifier: context.issueIdentifier,
        webhookTimestamp: null,
        payloadJson: JSON.stringify(context.payload),
      })
    : Promise.resolve({ isNew: true } as const);

  void insertPromise
    .then((result) => {
      if (!result.isNew) {
        deps.logger.debug(
          { deliveryId: context.deliveryId, event: context.event, action: context.action },
          "duplicate github webhook delivery skipped",
        );
        return;
      }

      processGitHubWebhook(
        deps,
        context.config,
        context.event,
        context.action,
        context.repoFullName,
        context.issueId,
        context.issueIdentifier,
      );
    })
    .catch((error) => {
      deps.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          deliveryId: context.deliveryId,
          event: context.event,
          action: context.action,
        },
        "github webhook processing failed",
      );
    });
}

export function handleWebhookGitHub(deps: GitHubWebhookHandlerDeps, req: WebhookRequest, res: Response): void {
  const validated = validateGitHubWebhookRequest(deps, req, res);
  if (!validated) {
    return;
  }

  const context = buildGitHubWebhookContext(req, validated);
  res.status(200).json({ ok: true });
  queueGitHubWebhookProcessing(deps, context);
}

function processGitHubWebhook(
  deps: GitHubWebhookHandlerDeps,
  config: ReturnType<ConfigStore["getConfig"]> | undefined,
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
