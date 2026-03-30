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
