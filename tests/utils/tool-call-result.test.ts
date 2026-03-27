import { describe, expect, it } from "vitest";

import { toolCallSuccess, toolCallFailure, toolCallErrorPayload } from "../../src/utils/tool-call-result.js";

describe("toolCallSuccess", () => {
  it("wraps a primitive value as JSON success", () => {
    const result = toolCallSuccess("hello");
    expect(result.success).toBe(true);
    expect(result.contentItems).toHaveLength(1);
    expect(result.contentItems[0].type).toBe("inputText");
    expect(JSON.parse(result.contentItems[0].text)).toBe("hello");
  });

  it("wraps an object value as JSON success", () => {
    const result = toolCallSuccess({ key: "value", count: 42 });
    expect(result.success).toBe(true);
    expect(JSON.parse(result.contentItems[0].text)).toEqual({ key: "value", count: 42 });
  });

  it("wraps null as JSON success", () => {
    const result = toolCallSuccess(null);
    expect(result.success).toBe(true);
    expect(JSON.parse(result.contentItems[0].text)).toBeNull();
  });
});

describe("toolCallFailure", () => {
  it("extracts message from Error instances", () => {
    const result = toolCallFailure(new Error("something broke"));
    expect(result.success).toBe(false);
    const payload = JSON.parse(result.contentItems[0].text);
    expect(payload).toEqual({ error: "something broke" });
  });

  it("coerces non-Error values to string", () => {
    const result = toolCallFailure("raw string error");
    expect(result.success).toBe(false);
    const payload = JSON.parse(result.contentItems[0].text);
    expect(payload).toEqual({ error: "raw string error" });
  });

  it("coerces null/undefined gracefully", () => {
    const result = toolCallFailure(undefined);
    expect(result.success).toBe(false);
    expect(result.contentItems[0].type).toBe("inputText");
  });
});

describe("toolCallErrorPayload", () => {
  it("wraps an arbitrary error payload as JSON failure", () => {
    const result = toolCallErrorPayload({ code: "NOT_FOUND", message: "missing resource" });
    expect(result.success).toBe(false);
    const payload = JSON.parse(result.contentItems[0].text);
    expect(payload).toEqual({ code: "NOT_FOUND", message: "missing resource" });
  });

  it("wraps a string error payload", () => {
    const result = toolCallErrorPayload("simple error");
    expect(result.success).toBe(false);
    expect(JSON.parse(result.contentItems[0].text)).toBe("simple error");
  });
});
