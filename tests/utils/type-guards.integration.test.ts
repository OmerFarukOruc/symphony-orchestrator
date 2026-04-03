import { describe, expect, it } from "vitest";

import {
  isRecord,
  asRecord,
  asArray,
  asStringOrNull,
  asBooleanOrNull,
  asStringRecord,
  getErrorMessage,
  toErrorString,
} from "../../src/utils/type-guards.js";

// ── isRecord ──────────────────────────────────────────────────────────────────

describe("isRecord — integration", () => {
  it("accepts plain empty object", () => {
    expect(isRecord({})).toBe(true);
  });

  it("accepts plain object with properties", () => {
    expect(isRecord({ a: 1, b: "x" })).toBe(true);
  });

  it("accepts nested objects", () => {
    expect(isRecord({ nested: { deep: true } })).toBe(true);
  });

  it("accepts class instances (they are objects)", () => {
    expect(isRecord(new Date())).toBe(true);
    expect(isRecord(new Error("e"))).toBe(true);
  });

  it("rejects null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isRecord(undefined)).toBe(false);
  });

  it("rejects arrays", () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2, 3])).toBe(false);
    expect(isRecord(new Array(5))).toBe(false);
  });

  it("rejects strings", () => {
    expect(isRecord("")).toBe(false);
    expect(isRecord("hello")).toBe(false);
  });

  it("rejects numbers", () => {
    expect(isRecord(0)).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(NaN)).toBe(false);
  });

  it("rejects booleans", () => {
    expect(isRecord(true)).toBe(false);
    expect(isRecord(false)).toBe(false);
  });

  it("rejects symbols", () => {
    expect(isRecord(Symbol("x"))).toBe(false);
  });

  it("rejects functions", () => {
    expect(isRecord(() => {})).toBe(false);
  });
});

// ── asRecord ──────────────────────────────────────────────────────────────────

describe("asRecord — integration", () => {
  it("returns same reference for plain object", () => {
    const obj = { x: 1 };
    expect(asRecord(obj)).toBe(obj);
  });

  it("returns same reference for nested object", () => {
    const obj = { a: { b: 2 } };
    expect(asRecord(obj)).toBe(obj);
  });

  it("returns empty object for null", () => {
    expect(asRecord(null)).toEqual({});
  });

  it("returns empty object for undefined", () => {
    expect(asRecord(undefined)).toEqual({});
  });

  it("returns empty object for arrays", () => {
    expect(asRecord([])).toEqual({});
    expect(asRecord([1, 2])).toEqual({});
  });

  it("returns empty object for strings", () => {
    expect(asRecord("hello")).toEqual({});
    expect(asRecord("")).toEqual({});
  });

  it("returns empty object for numbers", () => {
    expect(asRecord(42)).toEqual({});
    expect(asRecord(0)).toEqual({});
  });

  it("returns empty object for booleans", () => {
    expect(asRecord(true)).toEqual({});
    expect(asRecord(false)).toEqual({});
  });

  it("returns same reference for Error instance", () => {
    const err = new Error("test");
    expect(asRecord(err)).toBe(err);
  });
});

// ── asArray ───────────────────────────────────────────────────────────────────

describe("asArray — integration", () => {
  it("returns same reference for a plain array", () => {
    const arr = [1, 2, 3];
    expect(asArray(arr)).toBe(arr);
  });

  it("returns same reference for an empty array", () => {
    const arr: unknown[] = [];
    expect(asArray(arr)).toBe(arr);
  });

  it("returns same reference for an array of mixed types", () => {
    const arr = [null, undefined, "x", 42, {}];
    expect(asArray(arr)).toBe(arr);
  });

  it("returns empty array for null", () => {
    expect(asArray(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(asArray(undefined)).toEqual([]);
  });

  it("returns empty array for plain objects", () => {
    expect(asArray({})).toEqual([]);
    expect(asArray({ length: 3 })).toEqual([]);
  });

  it("returns empty array for strings", () => {
    expect(asArray("hello")).toEqual([]);
  });

  it("returns empty array for numbers", () => {
    expect(asArray(0)).toEqual([]);
    expect(asArray(99)).toEqual([]);
  });

  it("returns empty array for booleans", () => {
    expect(asArray(true)).toEqual([]);
    expect(asArray(false)).toEqual([]);
  });
});

// ── asStringOrNull ────────────────────────────────────────────────────────────

describe("asStringOrNull — integration", () => {
  it("returns the string for non-empty string", () => {
    expect(asStringOrNull("hello")).toBe("hello");
  });

  it("returns empty string for empty string (strings are strings)", () => {
    expect(asStringOrNull("")).toBe("");
  });

  it("returns the string for whitespace-only string", () => {
    expect(asStringOrNull("   ")).toBe("   ");
  });

  it("returns null for null", () => {
    expect(asStringOrNull(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(asStringOrNull(undefined)).toBeNull();
  });

  it("returns null for numbers", () => {
    expect(asStringOrNull(0)).toBeNull();
    expect(asStringOrNull(42)).toBeNull();
    expect(asStringOrNull(NaN)).toBeNull();
  });

  it("returns null for booleans", () => {
    expect(asStringOrNull(true)).toBeNull();
    expect(asStringOrNull(false)).toBeNull();
  });

  it("returns null for objects", () => {
    expect(asStringOrNull({})).toBeNull();
    expect(asStringOrNull({ toString: () => "hi" })).toBeNull();
  });

  it("returns null for arrays", () => {
    expect(asStringOrNull([])).toBeNull();
    expect(asStringOrNull(["a"])).toBeNull();
  });
});

// ── asBooleanOrNull ───────────────────────────────────────────────────────────

describe("asBooleanOrNull — integration", () => {
  it("returns true for boolean true", () => {
    expect(asBooleanOrNull(true)).toBe(true);
  });

  it("returns false for boolean false", () => {
    expect(asBooleanOrNull(false)).toBe(false);
  });

  it("returns null for null", () => {
    expect(asBooleanOrNull(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(asBooleanOrNull(undefined)).toBeNull();
  });

  it("returns null for numbers (including truthy/falsy 1 and 0)", () => {
    expect(asBooleanOrNull(1)).toBeNull();
    expect(asBooleanOrNull(0)).toBeNull();
    expect(asBooleanOrNull(-1)).toBeNull();
  });

  it("returns null for strings (including 'true' and 'false')", () => {
    expect(asBooleanOrNull("true")).toBeNull();
    expect(asBooleanOrNull("false")).toBeNull();
    expect(asBooleanOrNull("")).toBeNull();
  });

  it("returns null for objects", () => {
    expect(asBooleanOrNull({})).toBeNull();
  });

  it("returns null for arrays", () => {
    expect(asBooleanOrNull([])).toBeNull();
  });
});

// ── asStringRecord ────────────────────────────────────────────────────────────

describe("asStringRecord — integration", () => {
  it("extracts only string-valued keys from a mixed object", () => {
    const input = { a: "alpha", b: 42, c: null, d: "delta", e: undefined, f: true, g: [] };
    expect(asStringRecord(input)).toEqual({ a: "alpha", d: "delta" });
  });

  it("returns empty object for an all-non-string object", () => {
    expect(asStringRecord({ a: 1, b: false, c: null })).toEqual({});
  });

  it("returns empty object for null", () => {
    expect(asStringRecord(null)).toEqual({});
  });

  it("returns empty object for undefined", () => {
    expect(asStringRecord(undefined)).toEqual({});
  });

  it("returns empty object for arrays", () => {
    expect(asStringRecord(["a", "b"])).toEqual({});
  });

  it("returns empty object for primitive strings", () => {
    expect(asStringRecord("hello")).toEqual({});
  });

  it("returns empty object for numbers", () => {
    expect(asStringRecord(99)).toEqual({});
  });

  it("handles objects whose values include empty strings", () => {
    expect(asStringRecord({ a: "", b: "ok" })).toEqual({ a: "", b: "ok" });
  });

  it("handles nested objects — does not recurse, treats nested object value as non-string", () => {
    expect(asStringRecord({ a: "ok", b: { c: "nested" } })).toEqual({ a: "ok" });
  });

  it("returns empty object for empty plain object", () => {
    expect(asStringRecord({})).toEqual({});
  });
});

// ── getErrorMessage ───────────────────────────────────────────────────────────

describe("getErrorMessage — integration", () => {
  it("returns Error.message for an Error instance", () => {
    const err = new Error("something went wrong");
    expect(getErrorMessage(err, "fallback")).toBe("something went wrong");
  });

  it("returns Error.message for a subclass instance", () => {
    const err = new TypeError("wrong type");
    expect(getErrorMessage(err, "fallback")).toBe("wrong type");
  });

  it("returns Error.message even when it is an empty string", () => {
    const err = new Error("");
    expect(getErrorMessage(err, "fallback")).toBe("");
  });

  it("returns the fallback for null", () => {
    expect(getErrorMessage(null, "fallback msg")).toBe("fallback msg");
  });

  it("returns the fallback for undefined", () => {
    expect(getErrorMessage(undefined, "oops")).toBe("oops");
  });

  it("returns the fallback for a plain string", () => {
    expect(getErrorMessage("some string error", "fallback")).toBe("fallback");
  });

  it("returns the fallback for a plain object", () => {
    expect(getErrorMessage({ message: "looks like an error" }, "fallback")).toBe("fallback");
  });

  it("returns the fallback for a number", () => {
    expect(getErrorMessage(42, "fallback")).toBe("fallback");
  });

  it("returns the fallback for an array", () => {
    expect(getErrorMessage(["error"], "fallback")).toBe("fallback");
  });
});

// ── toErrorString ─────────────────────────────────────────────────────────────

describe("toErrorString — integration", () => {
  it("returns Error.message for an Error instance", () => {
    const err = new Error("something failed");
    expect(toErrorString(err)).toBe("something failed");
  });

  it("returns Error.message for a TypeError", () => {
    const err = new TypeError("bad type");
    expect(toErrorString(err)).toBe("bad type");
  });

  it("returns Error.message even when it is an empty string", () => {
    const err = new Error("");
    expect(toErrorString(err)).toBe("");
  });

  it("falls back to String() for a plain string", () => {
    expect(toErrorString("raw error string")).toBe("raw error string");
  });

  it("falls back to String() for null", () => {
    expect(toErrorString(null)).toBe("null");
  });

  it("falls back to String() for undefined", () => {
    expect(toErrorString(undefined)).toBe("undefined");
  });

  it("falls back to String() for a number", () => {
    expect(toErrorString(404)).toBe("404");
  });

  it("falls back to String() for a boolean", () => {
    expect(toErrorString(false)).toBe("false");
  });

  it("falls back to String() for a plain object (produces [object Object])", () => {
    expect(toErrorString({ code: 500 })).toBe("[object Object]");
  });

  it("falls back to String() for an array", () => {
    expect(toErrorString([1, 2, 3])).toBe("1,2,3");
  });
});
