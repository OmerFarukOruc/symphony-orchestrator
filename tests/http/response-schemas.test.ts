import { describe, expect, it } from "vitest";

import {
  abortResponseSchema,
  attemptsListResponseSchema,
  errorResponseSchema,
  refreshResponseSchema,
  runtimeResponseSchema,
  transitionResponseSchema,
  validationErrorSchema,
} from "../../src/http/response-schemas.js";

describe("refreshResponseSchema", () => {
  it("parses a valid refresh response", () => {
    const result = refreshResponseSchema.parse({
      queued: true,
      coalesced: false,
      requested_at: "2026-03-28T12:00:00Z",
    });
    expect(result.queued).toBe(true);
    expect(result.coalesced).toBe(false);
    expect(result.requested_at).toBe("2026-03-28T12:00:00Z");
  });

  it("rejects missing fields", () => {
    expect(refreshResponseSchema.safeParse({ queued: true }).success).toBe(false);
    expect(refreshResponseSchema.safeParse({ coalesced: false }).success).toBe(false);
    expect(refreshResponseSchema.safeParse({}).success).toBe(false);
  });

  it("rejects non-boolean queued", () => {
    const result = refreshResponseSchema.safeParse({
      queued: "yes",
      coalesced: false,
      requested_at: "2026-03-28T12:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string requested_at", () => {
    const result = refreshResponseSchema.safeParse({
      queued: true,
      coalesced: false,
      requested_at: 12345,
    });
    expect(result.success).toBe(false);
  });
});

describe("abortResponseSchema", () => {
  it("parses a valid abort response", () => {
    const result = abortResponseSchema.parse({
      ok: true,
      status: "stopping",
      already_stopping: false,
      requested_at: "2026-03-28T12:00:00Z",
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("stopping");
    expect(result.already_stopping).toBe(false);
  });

  it("requires ok to be literal true", () => {
    const result = abortResponseSchema.safeParse({
      ok: false,
      status: "stopping",
      already_stopping: false,
      requested_at: "2026-03-28T12:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("requires status to be literal stopping", () => {
    const result = abortResponseSchema.safeParse({
      ok: true,
      status: "stopped",
      already_stopping: false,
      requested_at: "2026-03-28T12:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(abortResponseSchema.safeParse({}).success).toBe(false);
    expect(abortResponseSchema.safeParse({ ok: true }).success).toBe(false);
  });
});

describe("transitionResponseSchema", () => {
  it("parses a full transition response", () => {
    const result = transitionResponseSchema.parse({
      ok: true,
      from: "backlog",
      to: "in_progress",
      reason: "manual transition",
    });
    expect(result.ok).toBe(true);
    expect(result.from).toBe("backlog");
    expect(result.to).toBe("in_progress");
    expect(result.reason).toBe("manual transition");
  });

  it("parses a minimal transition response (optional fields omitted)", () => {
    const result = transitionResponseSchema.parse({ ok: false });
    expect(result.ok).toBe(false);
    expect(result.from).toBeUndefined();
    expect(result.to).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  it("rejects missing ok field", () => {
    const result = transitionResponseSchema.safeParse({ from: "backlog", to: "done" });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean ok", () => {
    const result = transitionResponseSchema.safeParse({ ok: "yes" });
    expect(result.success).toBe(false);
  });
});

describe("errorResponseSchema", () => {
  it("parses a valid error response", () => {
    const result = errorResponseSchema.parse({
      error: { code: "NOT_FOUND", message: "Issue not found" },
    });
    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.message).toBe("Issue not found");
  });

  it("rejects missing error.code", () => {
    const result = errorResponseSchema.safeParse({
      error: { message: "oops" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing error.message", () => {
    const result = errorResponseSchema.safeParse({
      error: { code: "ERR" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing error envelope", () => {
    const result = errorResponseSchema.safeParse({ code: "ERR", message: "flat" });
    expect(result.success).toBe(false);
  });
});

describe("validationErrorSchema", () => {
  it("parses a valid validation error", () => {
    const result = validationErrorSchema.parse({
      error: "validation_error",
      details: [{ code: "invalid_type", path: ["model"], message: "Expected string, received number" }],
    });
    expect(result.error).toBe("validation_error");
    expect(result.details).toHaveLength(1);
    expect(result.details[0].code).toBe("invalid_type");
    expect(result.details[0].path).toEqual(["model"]);
  });

  it("supports numeric path segments", () => {
    const result = validationErrorSchema.parse({
      error: "validation_error",
      details: [{ code: "too_small", path: ["items", 0, "name"], message: "Required" }],
    });
    expect(result.details[0].path).toEqual(["items", 0, "name"]);
  });

  it("parses with empty details array", () => {
    const result = validationErrorSchema.parse({
      error: "validation_error",
      details: [],
    });
    expect(result.details).toHaveLength(0);
  });

  it("requires error to be literal validation_error", () => {
    const result = validationErrorSchema.safeParse({
      error: "server_error",
      details: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects details without required fields", () => {
    const result = validationErrorSchema.safeParse({
      error: "validation_error",
      details: [{ code: "err" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing details", () => {
    const result = validationErrorSchema.safeParse({ error: "validation_error" });
    expect(result.success).toBe(false);
  });
});

describe("runtimeResponseSchema", () => {
  it("parses a valid runtime response", () => {
    const result = runtimeResponseSchema.parse({
      version: "0.5.0",
      workflow_path: "/home/user/WORKFLOW.md",
      data_dir: "/tmp/.symphony",
      feature_flags: { sse: true },
      provider_summary: "linear",
    });
    expect(result.version).toBe("0.5.0");
    expect(result.workflow_path).toBe("/home/user/WORKFLOW.md");
    expect(result.data_dir).toBe("/tmp/.symphony");
    expect(result.feature_flags).toEqual({ sse: true });
    expect(result.provider_summary).toBe("linear");
  });

  it("accepts empty feature_flags record", () => {
    const result = runtimeResponseSchema.parse({
      version: "1.0.0",
      workflow_path: "./w.md",
      data_dir: "./data",
      feature_flags: {},
      provider_summary: "github",
    });
    expect(result.feature_flags).toEqual({});
  });

  it("rejects missing fields", () => {
    expect(runtimeResponseSchema.safeParse({}).success).toBe(false);
    expect(runtimeResponseSchema.safeParse({ version: "1.0" }).success).toBe(false);
  });

  it("rejects non-string version", () => {
    const result = runtimeResponseSchema.safeParse({
      version: 1,
      workflow_path: "./w.md",
      data_dir: "./data",
      feature_flags: {},
      provider_summary: "linear",
    });
    expect(result.success).toBe(false);
  });
});

describe("attemptsListResponseSchema", () => {
  it("parses a valid attempts list with entries", () => {
    const result = attemptsListResponseSchema.parse({
      attempts: [
        { id: "a1", status: "done" },
        { id: "a2", status: "running" },
      ],
      current_attempt_id: "a2",
    });
    expect(result.attempts).toHaveLength(2);
    expect(result.current_attempt_id).toBe("a2");
  });

  it("parses with null current_attempt_id", () => {
    const result = attemptsListResponseSchema.parse({
      attempts: [],
      current_attempt_id: null,
    });
    expect(result.attempts).toHaveLength(0);
    expect(result.current_attempt_id).toBeNull();
  });

  it("rejects missing attempts array", () => {
    const result = attemptsListResponseSchema.safeParse({ current_attempt_id: null });
    expect(result.success).toBe(false);
  });

  it("rejects missing current_attempt_id", () => {
    const result = attemptsListResponseSchema.safeParse({ attempts: [] });
    expect(result.success).toBe(false);
  });

  it("rejects non-array attempts", () => {
    const result = attemptsListResponseSchema.safeParse({
      attempts: "not-an-array",
      current_attempt_id: null,
    });
    expect(result.success).toBe(false);
  });
});
