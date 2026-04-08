import { describe, expect, it, vi } from "vitest";

import { registerExtensionRoutes } from "../../src/http/routes/extensions.js";
import { createMockLogger } from "../helpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDeps(overrides: Record<string, unknown> = {}) {
  return {
    orchestrator: {},
    logger: createMockLogger(),
    ...overrides,
  } as never;
}

function createApp() {
  return {
    route: vi.fn().mockReturnThis(),
    get: vi.fn().mockReturnThis(),
    post: vi.fn().mockReturnThis(),
    put: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    patch: vi.fn().mockReturnThis(),
    head: vi.fn().mockReturnThis(),
    all: vi.fn().mockReturnThis(),
    use: vi.fn().mockReturnThis(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerExtensionRoutes", () => {
  it("registers all extension APIs when all deps are present", () => {
    const app = createApp();
    const deps = createDeps({
      configStore: { getMergedConfigMap: vi.fn().mockReturnValue({}) },
      configOverlayStore: {},
      secretsStore: { get: vi.fn() },
      archiveDir: "/tmp/archive",
      templateStore: {},
      auditLogger: {},
    });
    const logger = (deps as Record<string, unknown>).logger as ReturnType<typeof createMockLogger>;

    registerExtensionRoutes(app as never, deps);

    // No warnings should be logged when all deps are present
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("warns and skips config registration when configStore is missing", () => {
    const app = createApp();
    const deps = createDeps({
      configOverlayStore: {},
      secretsStore: { get: vi.fn() },
      archiveDir: "/tmp/archive",
      templateStore: {},
      auditLogger: {},
    });
    const logger = (deps as Record<string, unknown>).logger as ReturnType<typeof createMockLogger>;

    registerExtensionRoutes(app as never, deps);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: expect.stringContaining("configStore or configOverlayStore") }),
    );
  });

  it("warns and skips config registration when configOverlayStore is missing", () => {
    const app = createApp();
    const deps = createDeps({
      configStore: { getMergedConfigMap: vi.fn() },
      secretsStore: { get: vi.fn() },
      archiveDir: "/tmp/archive",
      templateStore: {},
      auditLogger: {},
    });
    const logger = (deps as Record<string, unknown>).logger as ReturnType<typeof createMockLogger>;

    registerExtensionRoutes(app as never, deps);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: expect.stringContaining("configStore or configOverlayStore") }),
    );
  });

  it("warns and skips secrets registration when secretsStore is missing", () => {
    const app = createApp();
    const deps = createDeps({
      configStore: { getMergedConfigMap: vi.fn() },
      configOverlayStore: {},
      archiveDir: "/tmp/archive",
      templateStore: {},
      auditLogger: {},
    });
    const logger = (deps as Record<string, unknown>).logger as ReturnType<typeof createMockLogger>;

    registerExtensionRoutes(app as never, deps);

    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ msg: expect.stringContaining("secretsStore") }));
  });

  it("warns and skips setup registration when archiveDir is missing", () => {
    const app = createApp();
    const deps = createDeps({
      configStore: { getMergedConfigMap: vi.fn() },
      configOverlayStore: {},
      secretsStore: { get: vi.fn() },
      templateStore: {},
      auditLogger: {},
    });
    const logger = (deps as Record<string, unknown>).logger as ReturnType<typeof createMockLogger>;

    registerExtensionRoutes(app as never, deps);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: expect.stringContaining("secretsStore, configOverlayStore, or archiveDir") }),
    );
  });

  it("warns and skips template registration when templateStore is missing", () => {
    const app = createApp();
    const deps = createDeps({
      configStore: { getMergedConfigMap: vi.fn() },
      configOverlayStore: {},
      secretsStore: { get: vi.fn() },
      archiveDir: "/tmp/archive",
      auditLogger: {},
    });
    const logger = (deps as Record<string, unknown>).logger as ReturnType<typeof createMockLogger>;

    registerExtensionRoutes(app as never, deps);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: expect.stringContaining("templateStore") }),
    );
  });

  it("warns and skips audit registration when auditLogger is missing", () => {
    const app = createApp();
    const deps = createDeps({
      configStore: { getMergedConfigMap: vi.fn() },
      configOverlayStore: {},
      secretsStore: { get: vi.fn() },
      archiveDir: "/tmp/archive",
      templateStore: {},
    });
    const logger = (deps as Record<string, unknown>).logger as ReturnType<typeof createMockLogger>;

    registerExtensionRoutes(app as never, deps);

    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ msg: expect.stringContaining("auditLogger") }));
  });

  it("warns for all missing deps at once", () => {
    const app = createApp();
    const deps = createDeps({});
    const logger = (deps as Record<string, unknown>).logger as ReturnType<typeof createMockLogger>;

    registerExtensionRoutes(app as never, deps);

    // Should warn 5 times (config, secrets, setup, template, audit)
    expect(logger.warn).toHaveBeenCalledTimes(5);
  });
});
