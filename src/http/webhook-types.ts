import type { Request } from "express";

/**
 * Extended Express request carrying the raw body buffer for webhook
 * signature verification (HMAC-SHA256).
 *
 * Populated by the `verify` callback on `express.json()` for paths
 * under `/webhooks/`. Non-webhook routes never receive this property.
 */
export interface WebhookRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Shape of a Linear webhook delivery payload.
 *
 * Linear sends this JSON body for every webhook event. The `action`
 * and `type` fields identify what happened (e.g. action="update",
 * type="Issue"). `webhookTimestamp` is used for replay rejection.
 *
 * Headers sent alongside the body:
 * - `Linear-Delivery` — unique delivery UUID
 * - `Linear-Event` — entity type (e.g. "Issue")
 * - `Linear-Signature` — HMAC-SHA256 hex digest of the raw body
 */
export interface LinearWebhookPayload {
  action: string;
  type: string;
  data: Record<string, unknown>;
  actor?: Record<string, unknown>;
  id?: string;
  webhookTimestamp: number;
  url?: string;
  createdAt?: string;
}
