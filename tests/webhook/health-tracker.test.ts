import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TypedEventBus } from "../../src/core/event-bus.js";
import type { SymphonyEventMap } from "../../src/core/symphony-events.js";
import type { SymphonyLogger, WebhookConfig } from "../../src/core/types.js";
import { DefaultWebhookHealthTracker } from "../../src/webhook/health-tracker.js";
import type { WebhookHealthTrackerDeps } from "../../src/webhook/health-tracker.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeLogger(): SymphonyLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as SymphonyLogger;
}

function makeWebhookConfig(overrides: Partial<WebhookConfig> = {}): WebhookConfig {
  return {
    webhookUrl: "https://symphony.example.com/webhooks/linear",
    webhookSecret: "whsec_test_secret_value",
    pollingStretchMs: 120_000,
    pollingBaseMs: 15_000,
    healthCheckIntervalMs: 300_000,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<WebhookHealthTrackerDeps> = {}): WebhookHealthTrackerDeps {
  return {
    config: makeWebhookConfig(),
    eventBus: new TypedEventBus<SymphonyEventMap>(),
    logger: makeLogger(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DefaultWebhookHealthTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it("starts in disconnected state with zero stats", () => {
    const deps = makeDeps();
    const tracker = new DefaultWebhookHealthTracker(deps);

    const health = tracker.getHealth();
    expect(health.status).toBe("disconnected");
    expect(health.stats.deliveriesReceived).toBe(0);
    expect(health.stats.lastDeliveryAt).toBeNull();
    expect(health.stats.lastEventType).toBeNull();
    expect(health.lastDeliveryAt).toBeNull();
    expect(health.lastEventType).toBeNull();

    tracker.stop();
  });

  it("reports pollingBaseMs as effectiveIntervalMs when disconnected", () => {
    const deps = makeDeps({ config: makeWebhookConfig({ pollingBaseMs: 20_000 }) });
    const tracker = new DefaultWebhookHealthTracker(deps);

    expect(tracker.getHealth().effectiveIntervalMs).toBe(20_000);

    tracker.stop();
  });

  // -------------------------------------------------------------------------
  // Happy path: disconnected → connected on first delivery
  // -------------------------------------------------------------------------

  it("transitions from disconnected to connected on first verified delivery", () => {
    const deps = makeDeps();
    const tracker = new DefaultWebhookHealthTracker(deps);

    tracker.recordVerifiedDelivery("Issue:create");

    const health = tracker.getHealth();
    expect(health.status).toBe("connected");
    expect(health.stats.deliveriesReceived).toBe(1);
    expect(health.stats.lastEventType).toBe("Issue:create");
    expect(health.stats.lastDeliveryAt).not.toBeNull();

    tracker.stop();
  });

  // -------------------------------------------------------------------------
  // Happy path: multiple deliveries keep connected, increment counter
  // -------------------------------------------------------------------------

  it("stays connected and increments counter on subsequent deliveries", () => {
    const deps = makeDeps();
    const tracker = new DefaultWebhookHealthTracker(deps);

    tracker.recordVerifiedDelivery("Issue:create");
    tracker.recordVerifiedDelivery("Issue:update");
    tracker.recordVerifiedDelivery("Comment:create");

    const health = tracker.getHealth();
    expect(health.status).toBe("connected");
    expect(health.stats.deliveriesReceived).toBe(3);
    expect(health.stats.lastEventType).toBe("Comment:create");

    tracker.stop();
  });

  // -------------------------------------------------------------------------
  // Happy path: effectiveIntervalMs reflects connected state
  // -------------------------------------------------------------------------

  it("reports pollingStretchMs as effectiveIntervalMs when connected", () => {
    const deps = makeDeps({ config: makeWebhookConfig({ pollingStretchMs: 120_000 }) });
    const tracker = new DefaultWebhookHealthTracker(deps);

    tracker.recordVerifiedDelivery("Issue:create");

    expect(tracker.getHealth().effectiveIntervalMs).toBe(120_000);

    tracker.stop();
  });

  // -------------------------------------------------------------------------
  // Happy path: subscription check with enabled=true maintains state
  // -------------------------------------------------------------------------

  it("maintains connected status when subscription check reports enabled=true", () => {
    const deps = makeDeps();
    const tracker = new DefaultWebhookHealthTracker(deps);

    tracker.recordVerifiedDelivery("Issue:create");
    expect(tracker.getHealth().status).toBe("connected");

    tracker.recordSubscriptionCheck(true);

    expect(tracker.getHealth().status).toBe("connected");

    tracker.stop();
  });

  // -------------------------------------------------------------------------
  // Error path: subscription check finds enabled=false → degraded
  // -------------------------------------------------------------------------

  it("transitions from connected to degraded when subscription check finds enabled=false", () => {
    const deps = makeDeps();
    const tracker = new DefaultWebhookHealthTracker(deps);

    tracker.recordVerifiedDelivery("Issue:create");
    expect(tracker.getHealth().status).toBe("connected");

    tracker.recordSubscriptionCheck(false);

    const health = tracker.getHealth();
    expect(health.status).toBe("degraded");
    expect(health.effectiveIntervalMs).toBe(deps.config.pollingBaseMs);

    tracker.stop();
  });

  it("does not degrade from disconnected when subscription check finds enabled=false", () => {
    const deps = makeDeps();
    const tracker = new DefaultWebhookHealthTracker(deps);

    tracker.recordSubscriptionCheck(false);

    expect(tracker.getHealth().status).toBe("disconnected");

    tracker.stop();
  });

  // -------------------------------------------------------------------------
  // Error path: subscription check network failure → state unchanged
  // -------------------------------------------------------------------------

  it("maintains state when periodic subscription check fails with network error", async () => {
    const linearClient = {
      runGraphQL: vi.fn().mockRejectedValue(new Error("network timeout")),
    };
    const deps = makeDeps({
      linearClient,
      config: makeWebhookConfig({ healthCheckIntervalMs: 10_000 }),
    });
    const tracker = new DefaultWebhookHealthTracker(deps);

    tracker.recordVerifiedDelivery("Issue:create");
    expect(tracker.getHealth().status).toBe("connected");

    // Advance past the first periodic check interval
    await vi.advanceTimersByTimeAsync(10_000);

    // State unchanged despite the check failing
    expect(tracker.getHealth().status).toBe("connected");
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: "network timeout" }),
      expect.stringContaining("subscription check failed"),
    );

    tracker.stop();
  });

  // -------------------------------------------------------------------------
  // Edge case: delivery during degraded starts cooldown, stays degraded
  // -------------------------------------------------------------------------

  it("stays degraded during 60s cooldown after a delivery", () => {
    const deps = makeDeps();
    const tracker = new DefaultWebhookHealthTracker(deps);

    // Get to degraded: connected → degraded
    tracker.recordVerifiedDelivery("Issue:create");
    tracker.recordSubscriptionCheck(false);
    expect(tracker.getHealth().status).toBe("degraded");

    // Delivery during degraded — starts cooldown but stays degraded
    tracker.recordVerifiedDelivery("Issue:update");
    expect(tracker.getHealth().status).toBe("degraded");
    expect(tracker.getHealth().stats.deliveriesReceived).toBe(2);

    // Advance 30s — still degraded (cooldown is 60s)
    vi.advanceTimersByTime(30_000);
    expect(tracker.getHealth().status).toBe("degraded");

    // Advance remaining 30s — cooldown expires, transitions to connected
    vi.advanceTimersByTime(30_000);
    expect(tracker.getHealth().status).toBe("connected");

    tracker.stop();
  });

  // -------------------------------------------------------------------------
  // Edge case: subscription check enabled=false during cooldown resets it
  // -------------------------------------------------------------------------

  it("resets cooldown when subscription check finds enabled=false during active cooldown", () => {
    const deps = makeDeps();
    const tracker = new DefaultWebhookHealthTracker(deps);

    // Get to degraded, then trigger delivery for cooldown
    tracker.recordVerifiedDelivery("Issue:create");
    tracker.recordSubscriptionCheck(false);
    tracker.recordVerifiedDelivery("Issue:update");
    expect(tracker.getHealth().status).toBe("degraded");

    // Advance 40s into cooldown
    vi.advanceTimersByTime(40_000);
    expect(tracker.getHealth().status).toBe("degraded");

    // Subscription check resets cooldown timer
    tracker.recordSubscriptionCheck(false);

    // Advance another 40s — would have been enough for the original cooldown
    // but the reset means the cooldown is cancelled (no timer running)
    vi.advanceTimersByTime(40_000);
    expect(tracker.getHealth().status).toBe("degraded");

    // A new delivery restarts the cooldown
    tracker.recordVerifiedDelivery("Comment:create");
    vi.advanceTimersByTime(60_000);
    expect(tracker.getHealth().status).toBe("connected");

    tracker.stop();
  });

  // -------------------------------------------------------------------------
  // Edge case: stop() transitions to disconnected and clears timers
  // -------------------------------------------------------------------------

  it("transitions to disconnected on stop() and emits health_changed", () => {
    const deps = makeDeps();
    const events: Array<{ oldStatus: string; newStatus: string }> = [];
    deps.eventBus.on("webhook.health_changed", (payload) => events.push(payload));

    const tracker = new DefaultWebhookHealthTracker(deps);
    tracker.recordVerifiedDelivery("Issue:create");

    // Clear the disconnected→connected event
    events.length = 0;

    tracker.stop();

    expect(tracker.getHealth().status).toBe("disconnected");
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ oldStatus: "connected", newStatus: "disconnected" });
  });

  it("does not emit health_changed on stop() when already disconnected", () => {
    const deps = makeDeps();
    const events: Array<{ oldStatus: string; newStatus: string }> = [];
    deps.eventBus.on("webhook.health_changed", (payload) => events.push(payload));

    const tracker = new DefaultWebhookHealthTracker(deps);
    tracker.stop();

    expect(events).toHaveLength(0);
  });

  it("is idempotent on double stop()", () => {
    const deps = makeDeps();
    const tracker = new DefaultWebhookHealthTracker(deps);
    tracker.recordVerifiedDelivery("Issue:create");

    tracker.stop();
    tracker.stop(); // should not throw or emit again

    expect(tracker.getHealth().status).toBe("disconnected");
  });

  it("ignores deliveries after stop()", () => {
    const deps = makeDeps();
    const tracker = new DefaultWebhookHealthTracker(deps);
    tracker.stop();

    tracker.recordVerifiedDelivery("Issue:create");

    expect(tracker.getHealth().status).toBe("disconnected");
    expect(tracker.getHealth().stats.deliveriesReceived).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Integration: event emissions
  // -------------------------------------------------------------------------

  it("emits webhook.health_changed on state transitions with old+new status", () => {
    const deps = makeDeps();
    const events: Array<{ oldStatus: string; newStatus: string }> = [];
    deps.eventBus.on("webhook.health_changed", (payload) => events.push(payload));

    const tracker = new DefaultWebhookHealthTracker(deps);

    // disconnected → connected
    tracker.recordVerifiedDelivery("Issue:create");

    // connected → degraded
    tracker.recordSubscriptionCheck(false);

    expect(events).toEqual([
      { oldStatus: "disconnected", newStatus: "connected" },
      { oldStatus: "connected", newStatus: "degraded" },
    ]);

    tracker.stop();
  });

  it("emits webhook.received on every verified delivery", () => {
    const deps = makeDeps();
    const receivedEvents: Array<{ eventType: string; timestamp: string }> = [];
    deps.eventBus.on("webhook.received", (payload) => receivedEvents.push(payload));

    const tracker = new DefaultWebhookHealthTracker(deps);

    tracker.recordVerifiedDelivery("Issue:create");
    tracker.recordVerifiedDelivery("Comment:create");

    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[0]!.eventType).toBe("Issue:create");
    expect(receivedEvents[1]!.eventType).toBe("Comment:create");
    // Timestamps should be ISO strings
    expect(receivedEvents[0]!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    tracker.stop();
  });

  // -------------------------------------------------------------------------
  // Periodic subscription check: integration with Linear client
  // -------------------------------------------------------------------------

  it("runs periodic subscription checks when Linear client is provided", async () => {
    const linearClient = {
      runGraphQL: vi.fn().mockResolvedValue({
        webhooks: {
          nodes: [{ url: "https://symphony.example.com/webhooks/linear", enabled: true }],
        },
      }),
    };
    const deps = makeDeps({
      linearClient,
      config: makeWebhookConfig({ healthCheckIntervalMs: 10_000 }),
    });
    const tracker = new DefaultWebhookHealthTracker(deps);

    tracker.recordVerifiedDelivery("Issue:create");
    expect(tracker.getHealth().status).toBe("connected");

    // First check fires at 10s
    await vi.advanceTimersByTimeAsync(10_000);
    expect(linearClient.runGraphQL).toHaveBeenCalledTimes(1);

    // Still connected (enabled=true)
    expect(tracker.getHealth().status).toBe("connected");

    tracker.stop();
  });

  it("degrades on periodic check when Linear reports enabled=false", async () => {
    const linearClient = {
      runGraphQL: vi.fn().mockResolvedValue({
        webhooks: {
          nodes: [{ url: "https://symphony.example.com/webhooks/linear", enabled: false }],
        },
      }),
    };
    const deps = makeDeps({
      linearClient,
      config: makeWebhookConfig({ healthCheckIntervalMs: 5_000 }),
    });
    const tracker = new DefaultWebhookHealthTracker(deps);

    tracker.recordVerifiedDelivery("Issue:create");
    expect(tracker.getHealth().status).toBe("connected");

    await vi.advanceTimersByTimeAsync(5_000);

    expect(tracker.getHealth().status).toBe("degraded");

    tracker.stop();
  });

  it("logs warning when webhook URL is not found in Linear subscription list", async () => {
    const linearClient = {
      runGraphQL: vi.fn().mockResolvedValue({
        webhooks: { nodes: [{ url: "https://other.example.com/webhooks", enabled: true }] },
      }),
    };
    const deps = makeDeps({
      linearClient,
      config: makeWebhookConfig({ healthCheckIntervalMs: 5_000 }),
    });
    const tracker = new DefaultWebhookHealthTracker(deps);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ webhookUrl: deps.config.webhookUrl }),
      expect.stringContaining("not found in Linear subscription list"),
    );

    tracker.stop();
  });

  it("skips periodic checks when no Linear client is provided", () => {
    const deps = makeDeps({ linearClient: undefined });
    const tracker = new DefaultWebhookHealthTracker(deps);

    // Just verifying it doesn't crash and logs the skip
    expect(deps.logger.debug).toHaveBeenCalledWith(
      {},
      expect.stringContaining("periodic subscription checks disabled"),
    );

    tracker.stop();
  });

  // -------------------------------------------------------------------------
  // Full lifecycle: degraded → cooldown → connected
  // -------------------------------------------------------------------------

  it("completes full degraded recovery lifecycle via cooldown", () => {
    const deps = makeDeps();
    const events: Array<{ oldStatus: string; newStatus: string }> = [];
    deps.eventBus.on("webhook.health_changed", (payload) => events.push(payload));

    const tracker = new DefaultWebhookHealthTracker(deps);

    // 1. Connect
    tracker.recordVerifiedDelivery("Issue:create");
    expect(tracker.getHealth().status).toBe("connected");

    // 2. Degrade
    tracker.recordSubscriptionCheck(false);
    expect(tracker.getHealth().status).toBe("degraded");

    // 3. Delivery during degraded — starts 60s cooldown
    tracker.recordVerifiedDelivery("Issue:update");
    expect(tracker.getHealth().status).toBe("degraded");

    // 4. Wait 60s — cooldown expires → connected
    vi.advanceTimersByTime(60_000);
    expect(tracker.getHealth().status).toBe("connected");

    expect(events).toEqual([
      { oldStatus: "disconnected", newStatus: "connected" },
      { oldStatus: "connected", newStatus: "degraded" },
      { oldStatus: "degraded", newStatus: "connected" },
    ]);

    tracker.stop();
  });
});
