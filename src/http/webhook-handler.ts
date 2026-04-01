import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import type { Response } from "express";

import type { RisolutoLogger } from "../core/types.js";
import type { ApiErrorResponse } from "./service-errors.js";
import type { LinearWebhookPayload, WebhookRequest } from "./webhook-types.js";
import { COMMENT_ACTIONS, ISSUE_ACTIONS, SUPPORTED_WEBHOOK_TYPES, validateWebhookPayload } from "./webhook-types.js";

/** Maximum allowed clock skew (ms) between webhook timestamp and server time. */
const REPLAY_WINDOW_MS = 60_000;

export interface WebhookHandlerDeps {
  /** Returns the current signing secret from config, or null when not yet configured. */
  getWebhookSecret: () => string | null;
  /** Returns the previous signing secret for rotation window (optional). */
  getPreviousWebhookSecret?: () => string | null;
  /** Signal the orchestrator to re-poll Linear for fresh state. */
  requestRefresh: (reason: string) => void;
  /** Signal the orchestrator to refresh a specific issue (targeted). */
  requestTargetedRefresh?: (issueId: string, issueIdentifier: string, reason: string) => void;
  /** Signal the orchestrator to stop a running worker for an issue. */
  stopWorkerForIssue?: (issueIdentifier: string, reason: string) => void;
  /** Record a verified delivery in the health tracker. */
  recordVerifiedDelivery: (eventType: string) => void;
  /** Durable inbox for verified deliveries. */
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

/**
 * Verify a Linear webhook HMAC-SHA256 signature using constant-time comparison.
 *
 * Returns `true` when the signature matches the expected digest of the raw
 * body, `false` otherwise. Length is checked first to avoid feeding
 * `timingSafeEqual` buffers of differing size.
 */
export function verifyLinearSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } } satisfies ApiErrorResponse);
}

/**
 * Extract the Linear-Delivery header (our dedup key).
 */
function extractDeliveryId(req: WebhookRequest): string | null {
  const header = req.get("linear-delivery");
  if (!header) return null;
  return header.trim();
}

/**
 * Extract the issue identifier from webhook payload data.
 * Linear sends `id`/`identifier` on Issue events.
 * On Comment events, issue info is nested under `data.issue`.
 */
function extractIssueInfo(
  data: Record<string, unknown>,
  type: string,
): { issueId: string | null; issueIdentifier: string | null } {
  if (type === "Issue") {
    const issueId = typeof data.id === "string" ? data.id : null;
    const issueIdentifier = typeof data.identifier === "string" ? data.identifier : null;
    return { issueId, issueIdentifier };
  }
  // Comment and other types: issue info nested under data.issue
  const issue = data.issue as Record<string, unknown> | undefined;
  if (issue && typeof issue === "object") {
    const issueId = typeof issue.id === "string" ? issue.id : null;
    const issueIdentifier = typeof issue.identifier === "string" ? issue.identifier : null;
    return { issueId, issueIdentifier };
  }
  return { issueId: null, issueIdentifier: null };
}

/**
 * Handles POST /webhooks/linear.
 *
 * Steps:
 * 1. Check signing secret available (503 + Retry-After if not).
 * 2. Validate Linear-Signature header present (401 if missing).
 * 3. Validate rawBody exists (401 if missing).
 * 4. Verify HMAC signature with current secret, then previous secret (dual-rotation).
 * 5. Parse body, validate schema, reject timestamp replays (401).
 * 6. Extract Linear-Delivery header for dedup.
 * 7. Persist to durable inbox (dedup check).
 * 8. Respond 200 immediately.
 * 9. Entity-aware processing: targeted refresh for Issue, activity for Comment, ignore unsupported.
 */
export function handleWebhookLinear(deps: WebhookHandlerDeps, req: WebhookRequest, res: Response): void {
  // 1. Signing secret must be configured
  const secret = deps.getWebhookSecret();
  if (!secret) {
    res.setHeader("Retry-After", "5");
    sendError(res, 503, "webhook_not_configured", "Webhook signing secret is not configured");
    return;
  }

  // 2. Linear-Signature header required
  const signature = req.get("linear-signature");
  if (!signature) {
    sendError(res, 401, "signature_missing", "Missing Linear-Signature header");
    return;
  }

  // 3. Raw body must have been captured by express.json verify callback
  const rawBody = req.rawBody;
  if (!rawBody) {
    sendError(res, 401, "signature_invalid", "Unable to verify signature — raw body unavailable");
    return;
  }

  // 4. HMAC verification — try current secret first, then previous (dual-rotation)
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

  // 5. Schema validation
  const body = req.body as LinearWebhookPayload;
  const validationError = validateWebhookPayload(body);
  if (validationError) {
    sendError(res, 400, "invalid_payload", validationError);
    return;
  }

  // 6. Replay rejection — webhookTimestamp must be within the allowed window (both directions for clock skew)
  const timestamp = body.webhookTimestamp;
  if (Math.abs(Date.now() - timestamp) > REPLAY_WINDOW_MS) {
    sendError(res, 401, "replay_rejected", "Webhook timestamp outside acceptable window");
    return;
  }

  // 7. Extract delivery ID and entity info
  const deliveryId = extractDeliveryId(req);
  const action = body.action;
  const type = body.type;
  const eventType = `${type}:${action}`;
  const { issueId, issueIdentifier } = extractIssueInfo(body.data, type);

  // 8. Persist to durable inbox (dedup check)
  const inboxResult = deps.webhookInbox
    ? deps.webhookInbox
        .insertVerified({
          deliveryId: deliveryId ?? `fallback-${Date.now()}-${randomUUID().slice(0, 8)}`,
          type,
          action,
          entityId: typeof body.data.id === "string" ? body.data.id : null,
          issueId,
          issueIdentifier,
          webhookTimestamp: timestamp,
          payloadJson: JSON.stringify(body),
        })
        .catch((error_: unknown) => {
          deps.logger.error(
            { error: error_ instanceof Error ? error_.message : String(error_) },
            "inbox insert failed",
          );
          return { isNew: true } as const; // proceed even if inbox fails
        })
    : Promise.resolve({ isNew: true } as const);

  // 9. Accept — respond immediately before side-effects
  res.status(200).json({ ok: true });

  // 10. Fire-and-forget side-effects (async, after 200)
  void inboxResult
    .then((result) => {
      if (!result.isNew) {
        deps.logger.debug({ deliveryId, type, action }, "duplicate webhook delivery — skipped");
        return;
      }

      // Record in health tracker
      deps.recordVerifiedDelivery(eventType);

      // Entity-aware processing
      processWebhookEvent(deps, type, action, body, issueId, issueIdentifier, usedPreviousSecret);
    })
    .catch((error_: unknown) => {
      deps.logger.error(
        { error: error_ instanceof Error ? error_.message : String(error_), deliveryId, type, action },
        "unhandled error in webhook side-effect processing",
      );
    });
}

/**
 * Process a verified, non-duplicate webhook event with entity-aware routing.
 */
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
  } else if (type === "Comment" && COMMENT_ACTIONS.has(action)) {
    handleCommentEvent(deps, action, issueId, issueIdentifier);
  } else {
    deps.logger.debug(logCtx, "supported type but unsupported action — ignored");
  }
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
  } else {
    deps.requestRefresh(`webhook:issue:${action}`);
  }
}

function handleCommentEvent(
  deps: WebhookHandlerDeps,
  action: string,
  issueId: string | null,
  issueIdentifier: string | null,
): void {
  if (issueId && issueIdentifier && deps.requestTargetedRefresh) {
    deps.requestTargetedRefresh(issueId, issueIdentifier, `webhook:comment:${action}`);
  } else {
    deps.requestRefresh(`webhook:comment:${action}`);
  }
}

function maybeStopWorker(
  deps: WebhookHandlerDeps,
  action: string,
  body: LinearWebhookPayload,
  issueIdentifier: string,
): void {
  if (action !== "update" || !deps.stopWorkerForIssue) return;

  const data = body.data as Record<string, unknown>;
  const state = data.state as Record<string, unknown> | undefined;
  const stateName = typeof state?.name === "string" ? state.name : null;
  if (stateName && isTerminalState(stateName)) {
    deps.stopWorkerForIssue(issueIdentifier, `webhook:issue:update:state=${stateName}`);
  }
}

/**
 * Check if a state name is terminal (Done, Cancelled, etc.).
 * This is a conservative check — only stop workers for clearly terminal states.
 */
function isTerminalState(stateName: string): boolean {
  const terminal = ["done", "cancelled", "canceled", "archived", "closed"];
  return terminal.includes(stateName.toLowerCase());
}
