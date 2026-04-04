import { describe, expect, it } from "vitest";

import { modelUpdateSchema, steerSchema, transitionSchema, triggerSchema } from "../../src/http/request-schemas.js";

describe("modelUpdateSchema", () => {
  it("parses a valid model update with model only", () => {
    const result = modelUpdateSchema.parse({ model: "gpt-4o" });
    expect(result.model).toBe("gpt-4o");
  });

  it("parses with snake_case reasoning_effort", () => {
    const result = modelUpdateSchema.parse({ model: "claude-sonnet-4-20250514", reasoning_effort: "high" });
    expect(result.model).toBe("claude-sonnet-4-20250514");
    expect(result.reasoning_effort).toBe("high");
  });

  it("parses with camelCase reasoningEffort", () => {
    const result = modelUpdateSchema.parse({ model: "claude-sonnet-4-20250514", reasoningEffort: "low" });
    expect(result.reasoningEffort).toBe("low");
  });

  it("accepts all valid reasoning effort values", () => {
    const values = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
    for (const effort of values) {
      const result = modelUpdateSchema.parse({ model: "test-model", reasoning_effort: effort });
      expect(result.reasoning_effort).toBe(effort);
    }
  });

  it("allows null reasoning_effort", () => {
    const result = modelUpdateSchema.parse({ model: "gpt-4o", reasoning_effort: null });
    expect(result.reasoning_effort).toBeNull();
  });

  it("allows undefined reasoning_effort", () => {
    const result = modelUpdateSchema.parse({ model: "gpt-4o" });
    expect(result.reasoning_effort).toBeUndefined();
  });

  it("trims whitespace from model", () => {
    const result = modelUpdateSchema.parse({ model: "  gpt-4o  " });
    expect(result.model).toBe("gpt-4o");
  });

  it("rejects empty model string", () => {
    const result = modelUpdateSchema.safeParse({ model: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only model string", () => {
    const result = modelUpdateSchema.safeParse({ model: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects missing model field", () => {
    const result = modelUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string model", () => {
    const result = modelUpdateSchema.safeParse({ model: 42 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid reasoning_effort value", () => {
    const result = modelUpdateSchema.safeParse({ model: "gpt-4o", reasoning_effort: "ultra" });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields (strict mode)", () => {
    const result = modelUpdateSchema.safeParse({ model: "gpt-4o", unknown_field: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.code === "unrecognized_keys")).toBe(true);
    }
  });
});

describe("transitionSchema", () => {
  it("parses a valid transition", () => {
    const result = transitionSchema.parse({ target_state: "in_progress" });
    expect(result.target_state).toBe("in_progress");
  });

  it("trims whitespace from target_state", () => {
    const result = transitionSchema.parse({ target_state: "  done  " });
    expect(result.target_state).toBe("done");
  });

  it("rejects missing target_state", () => {
    const result = transitionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty target_state", () => {
    const result = transitionSchema.safeParse({ target_state: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only target_state", () => {
    const result = transitionSchema.safeParse({ target_state: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects non-string target_state", () => {
    const result = transitionSchema.safeParse({ target_state: 123 });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields (strict mode)", () => {
    const result = transitionSchema.safeParse({ target_state: "done", reason: "manual" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.code === "unrecognized_keys")).toBe(true);
    }
  });
});

describe("steerSchema", () => {
  it("parses a valid steer message", () => {
    const result = steerSchema.parse({ message: "focus on the API layer" });
    expect(result.message).toBe("focus on the API layer");
  });

  it("rejects empty message", () => {
    const result = steerSchema.safeParse({ message: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing message field", () => {
    const result = steerSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string message", () => {
    const result = steerSchema.safeParse({ message: 42 });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields (strict mode)", () => {
    const result = steerSchema.safeParse({ message: "hello", priority: "high" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.code === "unrecognized_keys")).toBe(true);
    }
  });
});

describe("triggerSchema", () => {
  it("parses a valid create_issue payload", () => {
    const result = triggerSchema.parse({
      action: "create_issue",
      title: "Investigate slow cron run",
      description: "The nightly automation timed out",
      state_name: "Backlog",
    });
    expect(result.action).toBe("create_issue");
    expect(result.title).toBe("Investigate slow cron run");
  });

  it("parses refresh_issue with camelCase issue fields", () => {
    const result = triggerSchema.parse({
      action: "refresh_issue",
      issueId: "issue-1",
      issueIdentifier: "ENG-1",
    });
    expect(result.issueId).toBe("issue-1");
    expect(result.issueIdentifier).toBe("ENG-1");
  });

  it("rejects unsupported actions", () => {
    expect(triggerSchema.safeParse({ action: "delete_issue" }).success).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(triggerSchema.safeParse({ action: "re_poll", extra: true }).success).toBe(false);
  });
});
