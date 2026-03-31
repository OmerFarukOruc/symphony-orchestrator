/**
 * Webhook health tracker — state machine that tracks the health of the
 * Linear webhook integration based on verified delivery signals and
 * periodic subscription checks.
 *
 * State machine:
 *   disconnected  →  connected     (first verified delivery)
 *   connected     →  degraded      (subscription check finds enabled=false)
 *   degraded      →  connected     (verified delivery + 60s cooldown expired)
 *   *             →  disconnected  (stop() called / webhook removed)
 *
 * Invalid HMAC signatures never reach this module — they are security
 * telemetry handled entirely by the webhook handler.
 */

import type { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { RisolutoLogger, WebhookConfig } from "../core/types.js";
import type { WebhookHealthState, WebhookHealthStats, WebhookHealthStatus } from "./types.js";

/** Duration (ms) a degraded tracker must wait after a delivery before promoting to connected. */
const DEGRADED_COOLDOWN_MS = 60_000;

export interface WebhookHealthTracker {
  /** Record a verified (HMAC-valid) webhook delivery. */
  recordVerifiedDelivery(eventType: string): void;

  /** Record the result of a Linear subscription status check. */
  recordSubscriptionCheck(enabled: boolean): void;

  /** Return the current health state snapshot. */
  getHealth(): WebhookHealthState;

  /** Stop background timers and clean up resources. */
  stop(): void;
}

export interface WebhookHealthTrackerDeps {
  config: WebhookConfig;
  eventBus: TypedEventBus<RisolutoEventMap>;
  logger: RisolutoLogger;
  /** Optional Linear client for periodic subscription checks (Phase 1: may be omitted). */
  linearClient?: {
    runGraphQL: (query: string, variables?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
}

export class DefaultWebhookHealthTracker implements WebhookHealthTracker {
  private status: WebhookHealthStatus = "disconnected";
  private deliveriesReceived = 0;
  private lastDeliveryAt: string | null = null;
  private lastEventType: string | null = null;

  private cooldownTimer: NodeJS.Timeout | null = null;
  private subscriptionCheckTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  private readonly config: WebhookConfig;
  private readonly eventBus: TypedEventBus<RisolutoEventMap>;
  private readonly logger: RisolutoLogger;
  private readonly linearClient: WebhookHealthTrackerDeps["linearClient"];

  constructor(deps: WebhookHealthTrackerDeps) {
    this.config = deps.config;
    this.eventBus = deps.eventBus;
    this.logger = deps.logger.child({ component: "webhook-health" });
    this.linearClient = deps.linearClient;

    this.startPeriodicSubscriptionCheck();
  }

  recordVerifiedDelivery(eventType: string): void {
    if (this.stopped) return;

    const now = new Date().toISOString();
    this.deliveriesReceived++;
    this.lastDeliveryAt = now;
    this.lastEventType = eventType;

    this.eventBus.emit("webhook.received", { eventType, timestamp: now });

    if (this.status === "disconnected") {
      this.transition("connected");
    } else if (this.status === "degraded") {
      // Start or reset the 60s cooldown — status stays degraded until it expires
      this.startCooldown();
    }
    // If already connected, nothing to transition — just stats updated
  }

  recordSubscriptionCheck(enabled: boolean): void {
    if (this.stopped) return;

    if (!enabled && this.status === "connected") {
      this.transition("degraded");
    } else if (!enabled && this.status === "degraded") {
      // Reset cooldown if one is running — subscription is still flagged
      this.resetCooldown();
    }
    // enabled === true → positive confirmation, maintain current state
  }

  getHealth(): WebhookHealthState {
    return {
      status: this.status,
      effectiveIntervalMs: this.computeEffectiveInterval(),
      stats: this.buildStats(),
      lastDeliveryAt: this.lastDeliveryAt,
      lastEventType: this.lastEventType,
    };
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;

    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    if (this.subscriptionCheckTimer) {
      clearInterval(this.subscriptionCheckTimer);
      this.subscriptionCheckTimer = null;
    }

    const oldStatus = this.status;
    if (oldStatus !== "disconnected") {
      this.status = "disconnected";
      this.eventBus.emit("webhook.health_changed", {
        oldStatus,
        newStatus: "disconnected",
      });
    }

    this.logger.debug({ finalStats: this.buildStats() }, "webhook health tracker stopped");
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private transition(newStatus: WebhookHealthStatus): void {
    const oldStatus = this.status;
    if (oldStatus === newStatus) return;

    this.status = newStatus;
    this.logger.info(
      { oldStatus, newStatus, deliveriesReceived: this.deliveriesReceived },
      `webhook health: ${oldStatus} → ${newStatus}`,
    );
    this.eventBus.emit("webhook.health_changed", { oldStatus, newStatus });
  }

  private startCooldown(): void {
    this.clearCooldown();
    this.cooldownTimer = setTimeout(() => {
      this.cooldownTimer = null;
      if (!this.stopped && this.status === "degraded") {
        this.transition("connected");
      }
    }, DEGRADED_COOLDOWN_MS);
  }

  private resetCooldown(): void {
    // Only reset if a cooldown is currently running
    if (this.cooldownTimer) {
      this.clearCooldown();
      this.logger.debug({}, "degraded cooldown reset by subscription check");
    }
  }

  private clearCooldown(): void {
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }

  private startPeriodicSubscriptionCheck(): void {
    if (!this.linearClient) {
      this.logger.debug({}, "no Linear client provided — periodic subscription checks disabled");
      return;
    }

    const intervalMs = this.config.healthCheckIntervalMs;
    this.subscriptionCheckTimer = setInterval(() => {
      void this.runSubscriptionCheck();
    }, intervalMs);

    this.logger.debug({ intervalMs }, "periodic subscription check started");
  }

  private async runSubscriptionCheck(): Promise<void> {
    if (this.stopped || !this.linearClient) return;

    try {
      const result = await this.linearClient.runGraphQL(`query { webhooks { nodes { url enabled } } }`);

      const webhooks = result as { webhooks?: { nodes?: Array<{ url: string; enabled: boolean }> } };
      const nodes = webhooks.webhooks?.nodes ?? [];
      const match = nodes.find((node) => node.url === this.config.webhookUrl);

      if (match) {
        this.recordSubscriptionCheck(match.enabled);
      } else {
        this.logger.warn({ webhookUrl: this.config.webhookUrl }, "webhook URL not found in Linear subscription list");
      }
    } catch (error) {
      // Network/auth errors — maintain current state, log and continue
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "periodic subscription check failed — state unchanged",
      );
    }
  }

  private computeEffectiveInterval(): number {
    switch (this.status) {
      case "connected":
        return this.config.pollingStretchMs;
      case "degraded":
        return this.config.pollingBaseMs;
      case "disconnected":
        return this.config.pollingBaseMs;
    }
  }

  private buildStats(): WebhookHealthStats {
    return {
      deliveriesReceived: this.deliveriesReceived,
      lastDeliveryAt: this.lastDeliveryAt,
      lastEventType: this.lastEventType,
    };
  }
}
