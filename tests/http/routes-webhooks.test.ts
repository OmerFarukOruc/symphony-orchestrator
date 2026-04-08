import { describe, expect, it, vi } from "vitest";

import { registerWebhookRoutes } from "../../src/http/routes/webhooks.js";
import { createMockLogger } from "../helpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createApp() {
  const routeChain = {
    get: vi.fn().mockReturnThis(),
    post: vi.fn().mockReturnThis(),
    put: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    all: vi.fn().mockReturnThis(),
  };
  return {
    route: vi.fn().mockReturnValue(routeChain),
    _routeChain: routeChain,
  };
}

function createDeps(overrides: Record<string, unknown> = {}) {
  return {
    orchestrator: {
      requestTargetedRefresh: vi.fn(),
      stopWorkerForIssue: vi.fn(),
    },
    logger: createMockLogger(),
    configStore: {
      getConfig: vi.fn().mockReturnValue({
        triggers: { rateLimitPerMinute: 30 },
      }),
    },
    ...overrides,
  } as never;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerWebhookRoutes", () => {
  it("registers trigger route and warns when webhookHandlerDeps is missing", () => {
    const app = createApp();
    const logger = createMockLogger();
    const deps = createDeps({ logger, webhookHandlerDeps: undefined });

    registerWebhookRoutes(app as never, deps);

    // Trigger route should still be registered
    expect(app.route).toHaveBeenCalledWith("/api/v1/webhooks/trigger");
    // Webhook registration should be skipped with warning
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: expect.stringContaining("webhookHandlerDeps not provided"),
      }),
    );
    // /webhooks/linear and /webhooks/github should NOT be registered
    const registeredPaths = app.route.mock.calls.map((call: unknown[]) => call[0]);
    expect(registeredPaths).not.toContain("/webhooks/linear");
    expect(registeredPaths).not.toContain("/webhooks/github");
  });

  it("registers all webhook routes when webhookHandlerDeps is present", () => {
    const app = createApp();
    const logger = createMockLogger();
    const webhookHandlerDeps = {
      webhookInbox: {},
      logger: createMockLogger(),
      verifySignature: vi.fn(),
      orchestrator: {},
      configStore: {},
    };
    const deps = createDeps({ logger, webhookHandlerDeps });

    registerWebhookRoutes(app as never, deps);

    const registeredPaths = app.route.mock.calls.map((call: unknown[]) => call[0]);
    expect(registeredPaths).toContain("/api/v1/webhooks/trigger");
    expect(registeredPaths).toContain("/webhooks/linear");
    expect(registeredPaths).toContain("/webhooks/github");
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
