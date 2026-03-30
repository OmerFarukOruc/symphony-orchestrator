/**
 * Shared types for the webhook integration module.
 *
 * These are the contracts that other modules (orchestrator, HTTP server,
 * dashboard) depend on. The health tracker (Unit 4) implements the
 * state machine that produces these values.
 */

export type WebhookHealthStatus = "connected" | "degraded" | "disconnected";

export interface WebhookHealthStats {
  deliveriesReceived: number;
  lastDeliveryAt: string | null;
  lastEventType: string | null;
}

export interface WebhookHealthState {
  status: WebhookHealthStatus;
  effectiveIntervalMs: number;
  stats: WebhookHealthStats;
  lastDeliveryAt: string | null;
  lastEventType: string | null;
}
