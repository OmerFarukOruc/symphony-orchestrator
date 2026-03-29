import { createHmac, timingSafeEqual } from "node:crypto";

import type { Response } from "express";

import type { SymphonyLogger } from "../core/types.js";
import type { ApiErrorResponse } from "./service-errors.js";
import type { LinearWebhookPayload, WebhookRequest } from "./webhook-types.js";

/** Maximum allowed clock skew (ms) between webhook timestamp and server time. */
const REPLAY_WINDOW_MS = 60_000;

export interface WebhookHandlerDeps {
  /** Returns the signing secret from config, or null when not yet configured. */
  getWebhookSecret: () => string | null;
  /** Signal the orchestrator to re-poll Linear for fresh state. */
  requestRefresh: (reason: string) => void;
  /** Record a verified delivery in the health tracker. */
  recordVerifiedDelivery: (eventType: string) => void;
  logger: SymphonyLogger;
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
 * Handles POST /webhooks/linear.
 *
 * Steps:
 * 1. Check signing secret available (503 + Retry-After if not).
 * 2. Validate Linear-Signature header present (401 if missing).
 * 3. Validate rawBody exists (401 if missing).
 * 4. Verify HMAC signature (401 if invalid — logged as security telemetry).
 * 5. Parse body and reject timestamp replays outside the 60s window (401).
 * 6. Respond 200 immediately.
 * 7. Fire requestRefresh and recordVerifiedDelivery asynchronously.
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

  // 4. HMAC verification (security-critical — failures are logged but NOT sent to health tracker)
  if (!verifyLinearSignature(rawBody, signature, secret)) {
    deps.logger.warn(
      { path: req.path, remoteAddress: req.socket.remoteAddress },
      "webhook signature verification failed — possible tampering or misconfigured secret",
    );
    sendError(res, 401, "signature_invalid", "Invalid webhook signature");
    return;
  }

  // 5. Replay rejection — webhookTimestamp must be within the allowed window
  const body = req.body as LinearWebhookPayload;
  const timestamp = body.webhookTimestamp;
  if (typeof timestamp !== "number" || Math.abs(Date.now() - timestamp) > REPLAY_WINDOW_MS) {
    sendError(res, 401, "replay_rejected", "Webhook timestamp outside acceptable window");
    return;
  }

  // 6. Accept — respond immediately before side-effects
  const action = body.action ?? "unknown";
  const type = body.type ?? "unknown";
  const eventType = `${type}:${action}`;

  res.status(200).json({ ok: true });

  // 7. Fire-and-forget side-effects (coalescing is the orchestrator's job)
  deps.requestRefresh(`webhook:${action}:${type}`);
  deps.recordVerifiedDelivery(eventType);
}
