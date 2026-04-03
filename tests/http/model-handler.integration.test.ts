/**
 * Integration tests for src/http/model-handler.ts
 *
 * Exercises the handler through the full HTTP stack using startTestServer.
 * Covers:
 *   1. Normal 202 response when orchestrator finds the issue
 *   2. 404 response (lines 26-32) when orchestrator returns null
 *   3. validateBody rejection (400) for missing/invalid fields
 *   4. 405 for unsupported methods on the route
 */

import { afterEach, describe, expect, it } from "vitest";

import { buildStubOrchestrator, startTestServer, type TestServerResult } from "../helpers/http-server-harness.js";

describe("POST /api/v1/:issue_identifier/model — integration", () => {
  let ctx: TestServerResult;

  afterEach(async () => {
    if (ctx) await ctx.teardown();
  });

  // -----------------------------------------------------------------------
  // Normal success path
  // -----------------------------------------------------------------------
  it("returns 202 with selection payload when orchestrator resolves with an update", async () => {
    const orchestrator = buildStubOrchestrator({
      updateIssueModelSelection: async () => ({
        updated: true,
        restarted: false,
        appliesNextAttempt: false,
        selection: { model: "gpt-4o", reasoningEffort: null, source: "override" },
      }),
    });
    ctx = await startTestServer({ orchestrator });

    const res = await fetch(`${ctx.baseUrl}/api/v1/MT-42/model`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o" }),
    });

    expect(res.status).toBe(202);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.updated).toBe(true);
    expect(body.restarted).toBe(false);
    expect(body.applies_next_attempt).toBe(false);
    expect((body.selection as Record<string, unknown>).model).toBe("gpt-4o");
  });

  it("forwards reasoning_effort through to the response selection", async () => {
    const orchestrator = buildStubOrchestrator({
      updateIssueModelSelection: async () => ({
        updated: true,
        restarted: true,
        appliesNextAttempt: false,
        selection: { model: "gpt-4o", reasoningEffort: "high", source: "override" },
      }),
    });
    ctx = await startTestServer({ orchestrator });

    const res = await fetch(`${ctx.baseUrl}/api/v1/MT-99/model`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o", reasoning_effort: "high" }),
    });

    expect(res.status).toBe(202);
    const body = (await res.json()) as Record<string, unknown>;
    const selection = body.selection as Record<string, unknown>;
    expect(selection.reasoning_effort).toBe("high");
    expect(selection.source).toBe("override");
  });

  // -----------------------------------------------------------------------
  // 404 path — lines 26-32 in model-handler.ts
  // -----------------------------------------------------------------------
  it("returns 404 when orchestrator returns null (issue not found)", async () => {
    // Default stub already returns null for updateIssueModelSelection
    ctx = await startTestServer();

    const res = await fetch(`${ctx.baseUrl}/api/v1/UNKNOWN-1/model`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, { code: string; message: string }>;
    expect(body.error.code).toBe("not_found");
    expect(typeof body.error.message).toBe("string");
  });

  it("returns 404 regardless of which model name is supplied when issue is unknown", async () => {
    ctx = await startTestServer();

    const res = await fetch(`${ctx.baseUrl}/api/v1/NO-SUCH-ISSUE/model`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "o4-mini", reasoning_effort: "medium" }),
    });

    expect(res.status).toBe(404);
  });

  // -----------------------------------------------------------------------
  // validateBody rejection (400) — middleware layer
  // -----------------------------------------------------------------------
  it("returns 400 when model field is missing", async () => {
    ctx = await startTestServer();

    const res = await fetch(`${ctx.baseUrl}/api/v1/MT-1/model`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reasoning_effort: "low" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("validation_error");
  });

  it("returns 400 when model is an empty string", async () => {
    ctx = await startTestServer();

    const res = await fetch(`${ctx.baseUrl}/api/v1/MT-1/model`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "   " }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("validation_error");
  });

  it("returns 400 when reasoning_effort value is not a valid enum member", async () => {
    ctx = await startTestServer();

    const res = await fetch(`${ctx.baseUrl}/api/v1/MT-1/model`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o", reasoning_effort: "turbo" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("validation_error");
  });

  // -----------------------------------------------------------------------
  // Method guard
  // -----------------------------------------------------------------------
  it("returns 405 for GET on the model route", async () => {
    ctx = await startTestServer();
    const res = await fetch(`${ctx.baseUrl}/api/v1/MT-1/model`);
    expect(res.status).toBe(405);
  });

  it("returns 405 for DELETE on the model route", async () => {
    ctx = await startTestServer();
    const res = await fetch(`${ctx.baseUrl}/api/v1/MT-1/model`, { method: "DELETE" });
    expect(res.status).toBe(405);
  });
});
