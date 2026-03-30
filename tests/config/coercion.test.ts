import { describe, expect, it } from "vitest";

import {
  asRecord,
  asString,
  asNumber,
  asBoolean,
  asStringMap,
  asNumberMap,
  asStringArray,
  asRecordArray,
  asLooseStringArray,
} from "../../src/config/coercion.js";

describe("asRecord", () => {
  it("returns the value when it is a plain object", () => {
    const obj = { a: 1 };
    expect(asRecord(obj)).toBe(obj);
  });

  it("returns empty object for null", () => {
    expect(asRecord(null)).toEqual({});
  });

  it("returns empty object for undefined", () => {
    expect(asRecord(undefined)).toEqual({});
  });

  it("returns empty object for arrays", () => {
    expect(asRecord([1, 2])).toEqual({});
  });

  it("returns empty object for primitives", () => {
    expect(asRecord("string")).toEqual({});
    expect(asRecord(42)).toEqual({});
    expect(asRecord(true)).toEqual({});
  });
});

describe("asString", () => {
  it("returns the string when value is a string", () => {
    expect(asString("hello")).toBe("hello");
    expect(asString("")).toBe("");
  });

  it("returns fallback (default '') for non-strings", () => {
    expect(asString(null)).toBe("");
    expect(asString(undefined)).toBe("");
    expect(asString(42)).toBe("");
    expect(asString({})).toBe("");
  });

  it("uses provided fallback", () => {
    expect(asString(null, "default")).toBe("default");
  });
});

describe("asNumber", () => {
  it("returns number for valid finite numbers", () => {
    expect(asNumber(42, 0)).toBe(42);
    expect(asNumber(0, 99)).toBe(0);
    expect(asNumber(-5.5, 0)).toBe(-5.5);
  });

  it("returns fallback for non-numbers", () => {
    expect(asNumber("42", 0)).toBe(0);
    expect(asNumber(null, 99)).toBe(99);
    expect(asNumber(undefined, 10)).toBe(10);
  });

  it("returns fallback for non-finite numbers", () => {
    expect(asNumber(Infinity, 0)).toBe(0);
    expect(asNumber(-Infinity, 0)).toBe(0);
    expect(asNumber(NaN, 0)).toBe(0);
  });
});

describe("asBoolean", () => {
  it("returns true/false for booleans", () => {
    expect(asBoolean(true, false)).toBe(true);
    expect(asBoolean(false, true)).toBe(false);
  });

  it("returns fallback for non-booleans", () => {
    expect(asBoolean(1, false)).toBe(false);
    expect(asBoolean("true", false)).toBe(false);
    expect(asBoolean(null, true)).toBe(true);
  });
});

describe("asStringMap", () => {
  it("extracts string-valued entries from an object", () => {
    const input = { a: "hello", b: "world", c: 42, d: null };
    expect(asStringMap(input)).toEqual({ a: "hello", b: "world" });
  });

  it("returns empty object for non-objects", () => {
    expect(asStringMap(null)).toEqual({});
    expect(asStringMap(undefined)).toEqual({});
    expect(asStringMap([1, 2])).toEqual({});
    expect(asStringMap("string")).toEqual({});
  });

  it("returns empty object for empty input", () => {
    expect(asStringMap({})).toEqual({});
  });
});

describe("asNumberMap", () => {
  it("extracts finite number-valued entries", () => {
    const input = { a: 1, b: 2.5, c: "str", d: Infinity, e: NaN };
    expect(asNumberMap(input)).toEqual({ a: 1, b: 2.5 });
  });

  it("returns empty object for non-objects", () => {
    expect(asNumberMap(null)).toEqual({});
    expect(asNumberMap([1, 2])).toEqual({});
  });

  it("filters out entries where value is typeof number but not finite", () => {
    const input = { good: 42, inf: Infinity, negInf: -Infinity, nan: NaN };
    const result = asNumberMap(input);
    expect(result).toEqual({ good: 42 });
    expect(Object.keys(result)).toEqual(["good"]);
  });

  it("filters out entries where typeof check is not number", () => {
    const input = { str: "42", bool: true, obj: {}, num: 7 };
    const result = asNumberMap(input);
    expect(result).toEqual({ num: 7 });
  });

  it("filters out string numbers that would pass Number.isFinite when coerced", () => {
    // "42" as a string: typeof "42" !== "number" but Number.isFinite("42" as any) is false
    // However, if typeof check is mutated to `true`, then Number.isFinite("42") is false anyway
    // So we need a value where typeof is not "number" but Number.isFinite would return true
    // Actually Number.isFinite only returns true for actual number types, so this mutant
    // is equivalent. But let's verify the exact output shape.
    const input = { a: 1, b: "not-a-number", c: null, d: undefined };
    const result = asNumberMap(input);
    expect(result).toEqual({ a: 1 });
    expect(Object.keys(result)).toHaveLength(1);
  });
});

describe("asStringArray", () => {
  it("returns string array filtering out non-strings and empty strings", () => {
    const input = ["a", "b", "", 42, null, "c"];
    expect(asStringArray(input, [])).toEqual(["a", "b", "c"]);
  });

  it("returns fallback when input is not an array", () => {
    expect(asStringArray(null, ["fallback"])).toEqual(["fallback"]);
    expect(asStringArray("str", ["fb"])).toEqual(["fb"]);
  });

  it("returns fallback when array is empty after filtering", () => {
    expect(asStringArray(["", "  "], ["fallback"])).toEqual(["fallback"]);
    expect(asStringArray([], ["fallback"])).toEqual(["fallback"]);
  });

  it("filters out whitespace-only strings", () => {
    expect(asStringArray(["  ", "\t", "valid"], [])).toEqual(["valid"]);
  });
});

describe("asRecordArray", () => {
  it("filters array to only plain objects", () => {
    const input = [{ a: 1 }, "string", null, 42, [1, 2], { b: 2 }];
    expect(asRecordArray(input)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("returns empty array for non-arrays", () => {
    expect(asRecordArray(null)).toEqual([]);
    expect(asRecordArray({})).toEqual([]);
    expect(asRecordArray("str")).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(asRecordArray([])).toEqual([]);
  });
});

describe("asLooseStringArray", () => {
  it("returns all string elements including empty strings", () => {
    const input = ["a", "", "b", 42, null];
    expect(asLooseStringArray(input)).toEqual(["a", "", "b"]);
  });

  it("returns empty array for non-arrays", () => {
    expect(asLooseStringArray(null)).toEqual([]);
    expect(asLooseStringArray("str")).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(asLooseStringArray([])).toEqual([]);
  });
});
