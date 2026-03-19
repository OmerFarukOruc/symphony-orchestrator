import { describe, expect, it } from "vitest";

import {
  isRecord,
  asRecord,
  asArray,
  asStringOrNull,
  asBooleanOrNull,
  asStringRecord,
} from "../../src/utils/type-guards.js";

describe("isRecord", () => {
  it("returns true for plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2])).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isRecord("string")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe("asRecord (type-guards)", () => {
  it("returns the object if it is a record", () => {
    const obj = { a: 1 };
    expect(asRecord(obj)).toBe(obj);
  });

  it("returns empty object for non-records", () => {
    expect(asRecord(null)).toEqual({});
    expect(asRecord([])).toEqual({});
    expect(asRecord("str")).toEqual({});
    expect(asRecord(undefined)).toEqual({});
  });
});

describe("asArray", () => {
  it("returns the array when given an array", () => {
    const arr = [1, 2, 3];
    expect(asArray(arr)).toBe(arr);
  });

  it("returns empty array for non-arrays", () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray({})).toEqual([]);
    expect(asArray("str")).toEqual([]);
    expect(asArray(42)).toEqual([]);
  });
});

describe("asStringOrNull", () => {
  it("returns the string when value is a string", () => {
    expect(asStringOrNull("hello")).toBe("hello");
    expect(asStringOrNull("")).toBe("");
  });

  it("returns null for non-strings", () => {
    expect(asStringOrNull(null)).toBe(null);
    expect(asStringOrNull(undefined)).toBe(null);
    expect(asStringOrNull(42)).toBe(null);
    expect(asStringOrNull({})).toBe(null);
    expect(asStringOrNull([])).toBe(null);
    expect(asStringOrNull(true)).toBe(null);
  });
});

describe("asBooleanOrNull", () => {
  it("returns true/false for booleans", () => {
    expect(asBooleanOrNull(true)).toBe(true);
    expect(asBooleanOrNull(false)).toBe(false);
  });

  it("returns null for non-booleans", () => {
    expect(asBooleanOrNull(null)).toBe(null);
    expect(asBooleanOrNull(undefined)).toBe(null);
    expect(asBooleanOrNull(1)).toBe(null);
    expect(asBooleanOrNull("true")).toBe(null);
    expect(asBooleanOrNull({})).toBe(null);
  });
});

describe("asStringRecord", () => {
  it("extracts string-valued keys from an object", () => {
    const input = { a: "hello", b: "world", c: 42, d: null, e: true };
    expect(asStringRecord(input)).toEqual({ a: "hello", b: "world" });
  });

  it("returns empty object for non-objects", () => {
    expect(asStringRecord(null)).toEqual({});
    expect(asStringRecord(undefined)).toEqual({});
    expect(asStringRecord("str")).toEqual({});
    expect(asStringRecord([])).toEqual({});
  });

  it("returns empty object for objects with no string values", () => {
    expect(asStringRecord({ a: 1, b: null })).toEqual({});
  });
});
