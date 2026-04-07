import { describe, expect, it } from "vitest";

import {
  isDangerousKey,
  mergeOverlayMaps,
  normalizePathExpression,
  removeOverlayPathValue,
  setOverlayPathValue,
  stableStringify,
} from "../../src/config/overlay-helpers.js";

describe("overlay-helpers", () => {
  describe("isDangerousKey", () => {
    it("recognizes every blocked prototype-pollution key", () => {
      expect(isDangerousKey("__proto__")).toBe(true);
      expect(isDangerousKey("constructor")).toBe(true);
      expect(isDangerousKey("prototype")).toBe(true);
      expect(isDangerousKey("safe")).toBe(false);
      expect(["__proto__", "constructor", "prototype"].every(isDangerousKey)).toBe(true);
    });
  });

  describe("normalizePathExpression", () => {
    it("splits dotted paths, trims whitespace, and drops empty segments", () => {
      expect(normalizePathExpression("  codex . model . reasoning_effort  ")).toEqual([
        "codex",
        "model",
        "reasoning_effort",
      ]);
      expect(normalizePathExpression("... tracker .. project_slug ...")).toEqual(["tracker", "project_slug"]);
    });
  });

  describe("stableStringify", () => {
    it("sorts nested object keys while preserving array order", () => {
      expect(
        stableStringify({
          zebra: {
            beta: 2,
            alpha: 1,
          },
          alpha: [
            { b: 2, a: 1 },
            { d: 4, c: 3 },
          ],
        }),
      ).toBe('{"alpha":[{"a":1,"b":2},{"c":3,"d":4}],"zebra":{"alpha":1,"beta":2}}');
    });

    it("handles primitive arrays without collapsing them", () => {
      expect(stableStringify(["b", "a", { z: 2, a: 1 }])).toBe('["b","a",{"a":1,"z":2}]');
    });
  });

  describe("mergeOverlayMaps", () => {
    it("deep merges nested maps, clones patch values, and preserves siblings", () => {
      const base = {
        codex: {
          model: "gpt-5.4",
          reasoning_effort: "high",
        },
        agent: {
          max_turns: 20,
        },
      };
      const patch = {
        codex: {
          model: "gpt-5.5",
          sandbox: {
            cpus: "2.0",
          },
        },
      };

      const merged = mergeOverlayMaps(base, patch);

      expect(merged).toEqual({
        codex: {
          model: "gpt-5.5",
          reasoning_effort: "high",
          sandbox: {
            cpus: "2.0",
          },
        },
        agent: {
          max_turns: 20,
        },
      });
      expect(merged).not.toBe(base);
      expect(merged.codex).not.toBe(base.codex);
      expect((merged.codex as Record<string, unknown>).sandbox).not.toBe(
        (patch.codex as Record<string, unknown>).sandbox,
      );
    });

    it("ignores dangerous patch keys entirely", () => {
      const merged = mergeOverlayMaps(
        {
          safe: {
            enabled: true,
          },
        },
        {
          __proto__: {
            polluted: true,
          },
          constructor: {
            polluted: true,
          },
          prototype: {
            polluted: true,
          },
          safe: {
            enabled: false,
          },
        } as Record<string, unknown>,
      );

      expect(merged).toEqual({
        safe: {
          enabled: false,
        },
      });
      expect((merged as Record<string, unknown>).polluted).toBeUndefined();
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  });

  describe("setOverlayPathValue", () => {
    it("creates intermediate objects for missing path segments", () => {
      const target: Record<string, unknown> = {};

      setOverlayPathValue(target, ["codex", "sandbox", "resources", "memory"], "8g");

      expect(target).toEqual({
        codex: {
          sandbox: {
            resources: {
              memory: "8g",
            },
          },
        },
      });
    });

    it("replaces a non-record intermediate value with a nested object", () => {
      const target: Record<string, unknown> = {
        codex: "flat-value",
      };

      setOverlayPathValue(target, ["codex", "model"], "gpt-5.4");

      expect(target).toEqual({
        codex: {
          model: "gpt-5.4",
        },
      });
    });

    it("throws with the exact action in throw mode for dangerous traverse and set keys", () => {
      expect(() =>
        setOverlayPathValue({}, ["safe", "__proto__", "polluted"], true, {
          dangerousKeyMode: "throw",
        }),
      ).toThrow(new TypeError("Refusing to traverse dangerous key: __proto__"));

      expect(() =>
        setOverlayPathValue({}, ["safe", "constructor"], true, {
          dangerousKeyMode: "throw",
        }),
      ).toThrow(new TypeError("Refusing to set dangerous key: constructor"));
    });

    it("returns early in ignore mode for dangerous traverse or set keys", () => {
      const traverseTarget: Record<string, unknown> = {
        safe: {
          existing: true,
        },
      };
      const setTarget: Record<string, unknown> = {
        safe: {
          existing: true,
        },
      };

      setOverlayPathValue(traverseTarget, ["safe", "__proto__", "polluted"], true, {
        dangerousKeyMode: "ignore",
      });
      setOverlayPathValue(setTarget, ["safe", "prototype"], true, {
        dangerousKeyMode: "ignore",
      });

      expect(traverseTarget).toEqual({
        safe: {
          existing: true,
        },
      });
      expect(setTarget).toEqual({
        safe: {
          existing: true,
        },
      });
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("does not mutate a nested own __proto__ record when ignore mode short-circuits traversal", () => {
      const dangerousChild = Object.create(null) as Record<string, unknown>;
      dangerousChild["__proto__"] = {
        existing: true,
      };
      const target: Record<string, unknown> = {
        safe: dangerousChild,
      };

      setOverlayPathValue(target, ["safe", "__proto__", "polluted"], true, {
        dangerousKeyMode: "ignore",
      });

      expect((dangerousChild["__proto__"] as Record<string, unknown>).existing).toBe(true);
      expect((dangerousChild["__proto__"] as Record<string, unknown>).polluted).toBeUndefined();
    });
  });

  describe("removeOverlayPathValue", () => {
    it("returns false for empty paths, missing paths, and non-record intermediates", () => {
      const target: Record<string, unknown> = {
        codex: "flat-value",
        undefined: "keep-me",
      };

      expect(removeOverlayPathValue(target, [])).toBe(false);
      expect(removeOverlayPathValue(target, ["missing"])).toBe(false);
      expect(removeOverlayPathValue(target, ["codex", "model"])).toBe(false);
      expect(target).toEqual({
        codex: "flat-value",
        undefined: "keep-me",
      });
    });

    it("removes leaf values and prunes now-empty parents", () => {
      const target: Record<string, unknown> = {
        codex: {
          sandbox: {
            memory: "8g",
          },
          model: "gpt-5.4",
        },
      };

      expect(removeOverlayPathValue(target, ["codex", "sandbox", "memory"])).toBe(true);
      expect(target).toEqual({
        codex: {
          model: "gpt-5.4",
        },
      });

      expect(removeOverlayPathValue(target, ["codex", "model"])).toBe(true);
      expect(target).toEqual({});
    });

    it("throws or returns false for dangerous traverse keys depending on mode", () => {
      const throwTarget: Record<string, unknown> = {
        safe: {
          value: true,
        },
      };
      const ignoreTarget: Record<string, unknown> = {
        safe: {
          value: true,
        },
      };

      expect(() =>
        removeOverlayPathValue(throwTarget, ["__proto__", "polluted"], {
          dangerousKeyMode: "throw",
        }),
      ).toThrow(new TypeError("Refusing to traverse dangerous key: __proto__"));

      expect(
        removeOverlayPathValue(ignoreTarget, ["constructor", "polluted"], {
          dangerousKeyMode: "ignore",
        }),
      ).toBe(false);
      expect(ignoreTarget).toEqual({
        safe: {
          value: true,
        },
      });
    });

    it("does not recurse into dangerous own keys when ignore mode short-circuits traversal", () => {
      const target: Record<string, unknown> = {
        constructor: {
          polluted: true,
        },
      };

      expect(
        removeOverlayPathValue(target, ["constructor", "polluted"], {
          dangerousKeyMode: "ignore",
        }),
      ).toBe(false);
      expect(target).toEqual({
        constructor: {
          polluted: true,
        },
      });
    });
  });
});
