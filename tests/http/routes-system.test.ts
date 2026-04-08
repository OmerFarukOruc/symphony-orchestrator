import { describe, expect, it, vi } from "vitest";

import { registerSystemRoutes } from "../../src/http/routes/system.js";
import { createMockLogger } from "../helpers.js";

vi.mock("../../src/codex/model-list.js", () => ({
  fetchCodexModels: vi.fn().mockResolvedValue([]),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createApp() {
  const routeChain = {
    get: vi.fn().mockReturnThis(),
    post: vi.fn().mockReturnThis(),
    all: vi.fn().mockReturnThis(),
  };
  return {
    route: vi.fn().mockReturnValue(routeChain),
    _routeChain: routeChain,
  };
}

function createOrchestrator() {
  return {
    getSerializedState: vi.fn().mockReturnValue({}),
    getSnapshot: vi.fn().mockReturnValue({}),
    requestRefresh: vi.fn().mockReturnValue({ queued: true, coalesced: false, requestedAt: "now" }),
    getRecoveryReport: vi.fn().mockReturnValue(null),
    getIssueDetail: vi.fn().mockReturnValue(null),
  };
}

function createDeps(overrides: Record<string, unknown> = {}) {
  return {
    orchestrator: createOrchestrator(),
    logger: createMockLogger(),
    configStore: { getConfig: vi.fn().mockReturnValue({}) },
    ...overrides,
  } as never;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerSystemRoutes", () => {
  it("registers all system routes normally", () => {
    const app = createApp();
    const deps = createDeps({ eventBus: { onAny: vi.fn(), offAny: vi.fn() } });

    registerSystemRoutes(app as never, deps);

    const registeredPaths = app.route.mock.calls.map((call: unknown[]) => call[0]);
    expect(registeredPaths).toContain("/api/v1/state");
    expect(registeredPaths).toContain("/api/v1/observability");
    expect(registeredPaths).toContain("/api/v1/runtime");
    expect(registeredPaths).toContain("/api/v1/recovery");
    expect(registeredPaths).toContain("/metrics");
    expect(registeredPaths).toContain("/api/v1/refresh");
    expect(registeredPaths).toContain("/api/v1/events");
    expect(registeredPaths).toContain("/api/v1/models");
    expect(registeredPaths).toContain("/api/v1/transitions");
    expect(registeredPaths).toContain("/api/v1/openapi.json");
    expect(registeredPaths).toContain("/api/docs");
  });

  it("skips events endpoint and warns when eventBus is absent", () => {
    const app = createApp();
    const logger = createMockLogger();
    const deps = createDeps({ eventBus: undefined, logger });

    registerSystemRoutes(app as never, deps);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: expect.stringContaining("eventBus not provided"),
      }),
    );
    const registeredPaths = app.route.mock.calls.map((call: unknown[]) => call[0]);
    expect(registeredPaths).not.toContain("/api/v1/events");
  });
});
