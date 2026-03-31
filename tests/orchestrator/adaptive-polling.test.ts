import { describe, expect, it, vi } from "vitest";

import { Orchestrator } from "../../src/orchestrator/orchestrator.js";
import type { WebhookHealthTracker } from "../../src/webhook/health-tracker.js";
import type { WebhookHealthState } from "../../src/webhook/types.js";
import { serializeSnapshot } from "../../src/http/route-helpers.js";
import type { RuntimeSnapshot } from "../../src/core/types.js";
import {
  createConfig,
  createConfigStore,
  createAttemptStore,
  createIssueConfigStore,
  createResolveTemplate,
} from "./orchestrator-fixtures.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

function makeTracker() {
  return {
    fetchCandidateIssues: vi.fn(async () => []),
  };
}

function makeWorkspaceManager() {
  return {
    create: vi.fn(),
    remove: vi.fn(),
    listAll: vi.fn(async () => []),
    cleanup: vi.fn(async () => []),
  };
}

function makeAgentRunner() {
  return {
    dispatch: vi.fn(),
  };
}

function makeHealthTracker(overrides: Partial<WebhookHealthState> = {}): WebhookHealthTracker {
  const state: WebhookHealthState = {
    status: "connected",
    effectiveIntervalMs: 120_000,
    stats: { deliveriesReceived: 5, lastDeliveryAt: "2026-03-30T10:00:00Z", lastEventType: "Issue" },
    lastDeliveryAt: "2026-03-30T10:00:00Z",
    lastEventType: "Issue",
    ...overrides,
  };
  return {
    recordVerifiedDelivery: vi.fn(),
    recordSubscriptionCheck: vi.fn(),
    getHealth: vi.fn(() => state),
    stop: vi.fn(),
  };
}

function createOrchestrator(options: { webhookHealthTracker?: WebhookHealthTracker; pollingIntervalMs?: number } = {}) {
  const config = createConfig();
  config.polling.intervalMs = options.pollingIntervalMs ?? 15_000;
  const configStore = createConfigStore(config);

  const orchestrator = new Orchestrator({
    attemptStore: createAttemptStore(),
    configStore,
    tracker: makeTracker() as never,
    workspaceManager: makeWorkspaceManager() as never,
    agentRunner: makeAgentRunner() as never,
    issueConfigStore: createIssueConfigStore(),
    webhookHealthTracker: options.webhookHealthTracker,
    logger: makeLogger() as never,
    resolveTemplate: createResolveTemplate(),
  });

  return { orchestrator, config };
}

// ---------------------------------------------------------------------------
// getEffectivePollingInterval
// ---------------------------------------------------------------------------

describe("getEffectivePollingInterval", () => {
  it("returns config polling interval when no health tracker is configured", () => {
    const { orchestrator } = createOrchestrator({ pollingIntervalMs: 15_000 });
    expect(orchestrator.getEffectivePollingInterval()).toBe(15_000);
  });

  it("returns stretched interval (120s) when webhooks are connected", () => {
    const tracker = makeHealthTracker({ status: "connected", effectiveIntervalMs: 120_000 });
    const { orchestrator } = createOrchestrator({ webhookHealthTracker: tracker, pollingIntervalMs: 15_000 });

    expect(orchestrator.getEffectivePollingInterval()).toBe(120_000);
  });

  it("returns config base rate when webhooks are degraded", () => {
    const tracker = makeHealthTracker({ status: "degraded", effectiveIntervalMs: 15_000 });
    const { orchestrator } = createOrchestrator({ webhookHealthTracker: tracker, pollingIntervalMs: 15_000 });

    expect(orchestrator.getEffectivePollingInterval()).toBe(15_000);
  });

  it("returns config polling interval when webhooks are disconnected", () => {
    const tracker = makeHealthTracker({ status: "disconnected", effectiveIntervalMs: 15_000 });
    const { orchestrator } = createOrchestrator({ webhookHealthTracker: tracker, pollingIntervalMs: 20_000 });

    // disconnected → falls back to config interval, not health tracker's effectiveIntervalMs
    expect(orchestrator.getEffectivePollingInterval()).toBe(20_000);
  });
});

// ---------------------------------------------------------------------------
// requestRefresh still triggers immediate tick
// ---------------------------------------------------------------------------

describe("requestRefresh with adaptive polling", () => {
  it("requestRefresh still queues an immediate tick regardless of adaptive interval", () => {
    const tracker = makeHealthTracker({ status: "connected", effectiveIntervalMs: 120_000 });
    const { orchestrator } = createOrchestrator({ webhookHealthTracker: tracker });

    const result = orchestrator.requestRefresh("webhook_delivery");
    expect(result.queued).toBe(true);
    expect(result.coalesced).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Snapshot includes webhook health
// ---------------------------------------------------------------------------

describe("webhook health in snapshot", () => {
  it("includes webhook health when health tracker is configured", () => {
    const tracker = makeHealthTracker({
      status: "connected",
      effectiveIntervalMs: 120_000,
      stats: { deliveriesReceived: 10, lastDeliveryAt: "2026-03-30T12:00:00Z", lastEventType: "Comment" },
      lastDeliveryAt: "2026-03-30T12:00:00Z",
      lastEventType: "Comment",
    });
    const { orchestrator } = createOrchestrator({ webhookHealthTracker: tracker });

    const snapshot = orchestrator.getSnapshot();
    expect(snapshot.webhookHealth).toMatchObject({
      status: "connected",
      effectiveIntervalMs: 120_000,
      stats: {
        deliveriesReceived: 10,
        lastDeliveryAt: "2026-03-30T12:00:00Z",
        lastEventType: "Comment",
      },
      lastDeliveryAt: "2026-03-30T12:00:00Z",
      lastEventType: "Comment",
    });
  });

  it("omits webhook health when no health tracker is configured", () => {
    const { orchestrator } = createOrchestrator();

    const snapshot = orchestrator.getSnapshot();
    expect(snapshot.webhookHealth).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// serializeSnapshot — webhook health mapping
// ---------------------------------------------------------------------------

describe("serializeSnapshot webhook health", () => {
  function makeMinimalSnapshot(
    webhookHealth?: RuntimeSnapshot["webhookHealth"],
  ): RuntimeSnapshot & Record<string, unknown> {
    return {
      generatedAt: "2026-03-30T00:00:00Z",
      counts: { running: 0, retrying: 0 },
      running: [],
      retrying: [],
      queued: [],
      completed: [],
      workflowColumns: [],
      codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0, costUsd: 0 },
      rateLimits: null,
      recentEvents: [],
      webhookHealth,
    } as RuntimeSnapshot & Record<string, unknown>;
  }

  it("maps webhook health to snake_case when present", () => {
    const snapshot = makeMinimalSnapshot({
      status: "connected",
      effectiveIntervalMs: 120_000,
      stats: { deliveriesReceived: 7, lastDeliveryAt: "2026-03-30T10:00:00Z", lastEventType: "Issue" },
      lastDeliveryAt: "2026-03-30T10:00:00Z",
      lastEventType: "Issue",
    });

    const result = serializeSnapshot(snapshot);
    expect(result.webhook_health).toEqual({
      status: "connected",
      effective_interval_ms: 120_000,
      stats: {
        deliveries_received: 7,
        last_delivery_at: "2026-03-30T10:00:00Z",
        last_event_type: "Issue",
      },
      last_delivery_at: "2026-03-30T10:00:00Z",
      last_event_type: "Issue",
    });
  });

  it("omits webhook_health key when not present", () => {
    const snapshot = makeMinimalSnapshot(undefined);
    const result = serializeSnapshot(snapshot);
    expect(result.webhook_health).toBeUndefined();
  });

  it("maps degraded status correctly", () => {
    const snapshot = makeMinimalSnapshot({
      status: "degraded",
      effectiveIntervalMs: 15_000,
      stats: { deliveriesReceived: 3, lastDeliveryAt: null, lastEventType: null },
      lastDeliveryAt: null,
      lastEventType: null,
    });

    const result = serializeSnapshot(snapshot);
    const webhookHealth = result.webhook_health as Record<string, unknown>;
    expect(webhookHealth.status).toBe("degraded");
    expect(webhookHealth.effective_interval_ms).toBe(15_000);
    const stats = webhookHealth.stats as Record<string, unknown>;
    expect(stats.last_delivery_at).toBeNull();
    expect(stats.last_event_type).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Serialized state from orchestrator includes webhook health
// ---------------------------------------------------------------------------

describe("getSerializedState webhook integration", () => {
  it("serialized state includes webhook_health when tracker is configured", () => {
    const tracker = makeHealthTracker({ status: "connected", effectiveIntervalMs: 120_000 });
    const { orchestrator } = createOrchestrator({ webhookHealthTracker: tracker });

    const serialized = orchestrator.getSerializedState();
    expect(serialized.webhook_health).toBeDefined();
    expect((serialized.webhook_health as Record<string, unknown>).status).toBe("connected");
  });

  it("serialized state omits webhook_health when tracker is not configured", () => {
    const { orchestrator } = createOrchestrator();

    const serialized = orchestrator.getSerializedState();
    expect(serialized.webhook_health).toBeUndefined();
  });
});
