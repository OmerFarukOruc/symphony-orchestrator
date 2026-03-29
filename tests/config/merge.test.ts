import { describe, expect, it } from "vitest";

import { deepMerge, cloneConfigMap } from "../../src/config/merge.js";

describe("deepMerge", () => {
  it("returns overlay primitive directly", () => {
    expect(deepMerge("base", "overlay")).toBe("overlay");
    expect(deepMerge(1, 42)).toBe(42);
    expect(deepMerge("base", null)).toBe(null);
  });

  it("returns overlay array as a copy (replaces base array)", () => {
    const overlay = [1, 2, 3];
    const result = deepMerge(["a", "b"], overlay);
    expect(result).toEqual([1, 2, 3]);
    // should be a copy, not the same reference
    expect(result).not.toBe(overlay);
  });

  it("merges objects recursively", () => {
    const base = { a: 1, b: { x: 10, y: 20 }, c: "keep" };
    const overlay = { b: { x: 99 }, d: "new" };
    const result = deepMerge(base, overlay);
    expect(result).toEqual({ a: 1, b: { x: 99, y: 20 }, c: "keep", d: "new" });
  });

  it("overlay primitive replaces base object at the same key", () => {
    const base = { a: { nested: true } };
    const overlay = { a: "flat" };
    const result = deepMerge(base, overlay);
    expect(result).toEqual({ a: "flat" });
  });

  it("overlay object replaces base primitive at the same key", () => {
    const base = { a: "flat" };
    const overlay = { a: { nested: true } };
    const result = deepMerge(base, overlay);
    expect(result).toEqual({ a: { nested: true } });
  });

  it("overlay array replaces base array at nested key", () => {
    const base = { items: ["a", "b"] };
    const overlay = { items: ["x"] };
    const result = deepMerge(base, overlay) as { items: string[] };
    expect(result.items).toEqual(["x"]);
  });

  it("handles base being non-object (treats it as empty)", () => {
    const result = deepMerge(null, { a: 1 });
    expect(result).toEqual({ a: 1 });
  });

  it("handles empty overlay object (returns base unchanged)", () => {
    const base = { a: 1, b: 2 };
    const result = deepMerge(base, {});
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("handles empty base object", () => {
    const result = deepMerge({}, { a: 1, b: { c: 2 } });
    expect(result).toEqual({ a: 1, b: { c: 2 } });
  });

  it("does not mutate the base object", () => {
    const base = { a: 1, b: { x: 10 } };
    const baseCopy = JSON.parse(JSON.stringify(base)) as typeof base;
    deepMerge(base, { b: { x: 99 }, c: "new" });
    expect(base).toEqual(baseCopy);
  });

  it("treats null overlay values as primitives (replaces base)", () => {
    const result = deepMerge({ a: { nested: true } }, { a: null }) as Record<string, unknown>;
    expect(result.a).toBe(null);
  });

  it("correctly handles overlay with mixed types: objects, arrays, and primitives", () => {
    const base = {
      obj: { keep: true },
      arr: [1, 2],
      str: "base",
      num: 0,
    };
    const overlay = {
      obj: { added: true },
      arr: [3],
      str: "overlay",
      num: 42,
    };
    const result = deepMerge(base, overlay) as Record<string, unknown>;
    expect(result.obj).toEqual({ keep: true, added: true });
    expect(result.arr).toEqual([3]);
    expect(result.str).toBe("overlay");
    expect(result.num).toBe(42);
  });

  it("recursively merges nested objects through the typeof check", () => {
    const base = { level1: { level2: { a: 1 } } };
    const overlay = { level1: { level2: { b: 2 } } };
    const result = deepMerge(base, overlay) as Record<string, unknown>;
    const level2 = (result.level1 as Record<string, unknown>).level2 as Record<string, unknown>;
    expect(level2).toEqual({ a: 1, b: 2 });
  });

  it("handles falsy non-null non-object values as primitives in overlay entries", () => {
    const base = { a: { nested: true }, b: "existing" };
    const overlay = { a: 0, b: false };
    const result = deepMerge(base, overlay) as Record<string, unknown>;
    expect(result.a).toBe(0);
    expect(result.b).toBe(false);
  });

  it("distinguishes arrays from objects in overlay values (arrays replace, not merge)", () => {
    const base = { items: { 0: "a", 1: "b" } };
    const overlay = { items: ["x", "y"] };
    const result = deepMerge(base, overlay) as Record<string, unknown>;
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items).toEqual(["x", "y"]);
  });

  it("does not recursively merge when overlay value is null (truthy guard)", () => {
    // Tests: `value && ...` — when value is null, should not recurse
    const base = { a: { deep: 1 } };
    const overlay = { a: null };
    const result = deepMerge(base, overlay) as Record<string, unknown>;
    expect(result.a).toBe(null);
  });

  it("does not recursively merge when overlay value is a string (typeof guard)", () => {
    // Tests: `typeof value === 'object'` — strings are not objects
    const base = { a: { deep: 1, keep: 2 } };
    const overlay = { a: "replaced" };
    const result = deepMerge(base, overlay) as Record<string, unknown>;
    expect(result.a).toBe("replaced");
    expect(typeof result.a).toBe("string");
  });

  it("does not recursively merge when overlay value is a number (typeof guard)", () => {
    // Tests: `typeof value === 'object'` — numbers are not objects
    const base = { count: { nested: true } };
    const overlay = { count: 42 };
    const result = deepMerge(base, overlay) as Record<string, unknown>;
    expect(result.count).toBe(42);
  });

  it("replaces base value with overlay array, not merging it as object (Array.isArray guard)", () => {
    // Tests: `!Array.isArray(value)` — arrays should NOT be recursively merged
    const base = { tags: { 0: "old" } };
    const overlay = { tags: ["new1", "new2"] };
    const result = deepMerge(base, overlay) as Record<string, unknown>;
    expect(result.tags).toEqual(["new1", "new2"]);
    expect(Array.isArray(result.tags)).toBe(true);
  });

  it("preserves base keys not in overlay when overlay has an object entry", () => {
    // Tests recursive path: both base[key] and overlay[key] are objects
    const base = { cfg: { a: 1, b: 2 } };
    const overlay = { cfg: { b: 99 } };
    const result = deepMerge(base, overlay) as Record<string, unknown>;
    const cfg = result.cfg as Record<string, unknown>;
    expect(cfg.a).toBe(1);
    expect(cfg.b).toBe(99);
  });

  it("handles overlay object containing mixed value types at the same level", () => {
    // One key is a nested object (should merge), one is a primitive (should replace),
    // one is an array (should replace), one is null (should replace)
    const base = {
      nested: { x: 1, y: 2 },
      primitive: { old: true },
      list: { old: true },
      nullable: { old: true },
    };
    const overlay = {
      nested: { z: 3 },
      primitive: "string",
      list: [1, 2, 3],
      nullable: null,
    };
    const result = deepMerge(base, overlay) as Record<string, unknown>;
    expect(result.nested).toEqual({ x: 1, y: 2, z: 3 });
    expect(result.primitive).toBe("string");
    expect(result.list).toEqual([1, 2, 3]);
    expect(result.nullable).toBe(null);
  });
});

describe("cloneConfigMap", () => {
  it("returns a deep clone of the input", () => {
    const original = { a: 1, b: { c: [1, 2, 3] } };
    const clone = cloneConfigMap(original as Record<string, unknown>);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.b).not.toBe(original.b);
  });

  it("handles empty object", () => {
    expect(cloneConfigMap({})).toEqual({});
  });

  it("returns independent copy (mutations do not affect original)", () => {
    const original: Record<string, unknown> = { a: { b: 1 } };
    const clone = cloneConfigMap(original);
    (clone.a as Record<string, unknown>).b = 999;
    expect((original.a as Record<string, unknown>).b).toBe(1);
  });
});
