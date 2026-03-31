import { describe, expect, it, vi } from "vitest";

import { ConfigStore } from "../../src/config/store.js";
import type { RisolutoLogger } from "../../src/core/types.js";

function makeLogger(): RisolutoLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  } as unknown as RisolutoLogger;
}

describe("ConfigStore", () => {
  it("starts successfully with no deps and returns a config", async () => {
    const store = new ConfigStore(makeLogger());
    await store.start();
    try {
      const config = store.getConfig();
      // defaults come from builders.ts
      expect(config.tracker.kind).toBe("linear");
    } finally {
      await store.stop();
    }
  });

  it("throws when getConfig is called before start", () => {
    const store = new ConfigStore(makeLogger());
    expect(() => store.getConfig()).toThrow("config store has not been started");
  });

  it("notifies listeners on successful refresh", async () => {
    const store = new ConfigStore(makeLogger());
    await store.start();

    try {
      const listener = vi.fn();
      store.subscribe(listener);
      await store.refresh("test:manual");
      expect(listener).toHaveBeenCalled();
    } finally {
      await store.stop();
    }
  });

  it("subscribe returns an unsubscribe function that stops notifications", async () => {
    const store = new ConfigStore(makeLogger());
    await store.start();

    try {
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);
      unsubscribe();
      await store.refresh("test:after-unsub");
      expect(listener).not.toHaveBeenCalled();
    } finally {
      await store.stop();
    }
  });

  it("stop cleans up subscriptions", async () => {
    const overlayUnsubscribeFn = vi.fn();
    const overlayStore = {
      toMap: vi.fn().mockReturnValue({}),
      subscribe: vi.fn().mockReturnValue(overlayUnsubscribeFn),
    };
    const store = new ConfigStore(makeLogger(), { overlayStore });
    await store.start();
    await store.stop();

    expect(overlayUnsubscribeFn).toHaveBeenCalled();
  });

  it("merges overlay store values into config map", async () => {
    const overlayStore = {
      toMap: vi.fn().mockReturnValue({ custom_field: "overlay_value" }),
      subscribe: vi.fn().mockReturnValue(() => undefined),
    };
    const store = new ConfigStore(makeLogger(), { overlayStore });
    await store.start();

    try {
      const map = store.getMergedConfigMap();
      expect(map.custom_field).toBe("overlay_value");
    } finally {
      await store.stop();
    }
  });

  it("hydrates config from the injected workflow store before applying overlay", async () => {
    const overlayStore = {
      toMap: vi.fn().mockReturnValue({
        tracker: { project_slug: "OVERLAY-PROJECT" },
      }),
      subscribe: vi.fn().mockReturnValue(() => undefined),
    };
    const workflowStore = {
      getWorkflow: vi.fn().mockReturnValue({
        config: {
          tracker: {
            project_slug: "DB-PROJECT",
            api_key: "$LINEAR_API_KEY",
          },
          server: {
            port: 4400,
          },
        },
        promptTemplate: "Template body",
      }),
    };
    const store = new ConfigStore(makeLogger(), { overlayStore, workflowStore });

    await store.start();
    try {
      expect(store.getConfig().tracker.projectSlug).toBe("OVERLAY-PROJECT");
      expect(store.getConfig().server.port).toBe(4400);
      expect(store.getMergedConfigMap()).toMatchObject({
        tracker: { project_slug: "OVERLAY-PROJECT", api_key: "$LINEAR_API_KEY" },
        server: { port: 4400 },
      });
    } finally {
      await store.stop();
    }
  });

  it("getMergedConfigMap returns a clone (mutations don't affect store)", async () => {
    const store = new ConfigStore(makeLogger());
    await store.start();

    try {
      const map1 = store.getMergedConfigMap();
      map1.injected = "mutated";
      const map2 = store.getMergedConfigMap();
      expect(map2.injected).toBeUndefined();
    } finally {
      await store.stop();
    }
  });

  it("logs a warning for self-routing repos via overlay", async () => {
    const overlayStore = {
      toMap: vi.fn().mockReturnValue({
        repos: [
          {
            repo_url: "https://github.com/OmerFarukOruc/risoluto.git",
            identifier_prefix: "NIN",
          },
        ],
      }),
      subscribe: vi.fn().mockReturnValue(() => undefined),
    };
    const logger = makeLogger();
    const store = new ConfigStore(logger, { overlayStore });

    await store.start();
    try {
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ code: "self_routing_repo" }),
        expect.stringContaining("points to risoluto itself"),
      );
    } finally {
      await store.stop();
    }
  });

  it("keeps last known good config when overlay throws during refresh", async () => {
    let callCount = 0;
    const overlayStore = {
      toMap: vi.fn(() => {
        callCount++;
        if (callCount > 1) {
          throw new TypeError("overlay exploded");
        }
        return {};
      }),
      subscribe: vi.fn().mockReturnValue(() => undefined),
    };
    const logger = makeLogger();
    const store = new ConfigStore(logger, { overlayStore });

    await store.start();
    try {
      const firstConfig = store.getConfig();
      expect(firstConfig).toBeTypeOf("object");

      // Second refresh — overlayStore.toMap throws → error branch runs
      await store.refresh("test:broken-overlay");

      // Config should still be the last known good
      expect(store.getConfig()).toBeTypeOf("object");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "test:broken-overlay" }),
        expect.stringContaining("keeping last known good config"),
      );
    } finally {
      await store.stop();
    }
  });
});
