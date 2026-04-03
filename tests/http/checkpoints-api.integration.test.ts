/**
 * Integration test stubs for GET /api/v1/attempts/:attempt_id/checkpoints.
 *
 * These stubs document the expected behavior and serve as scaffolding
 * for future full integration tests backed by a real SQLite store.
 *
 * Activate full tests by replacing `describe.skip` with `describe`
 * and wiring the SQLite `SqliteAttemptStore` via the test harness
 * `attemptStore` override.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AttemptCheckpointRecord } from "../../src/core/types.js";
import { startTestServer, type TestServerResult } from "../helpers/http-server-harness.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function makeCheckpoint(overrides: Partial<AttemptCheckpointRecord> = {}): AttemptCheckpointRecord {
  return {
    checkpointId: 1,
    attemptId: "attempt-abc",
    ordinal: 0,
    trigger: "pr_merged",
    eventCursor: null,
    status: "completed",
    threadId: null,
    turnId: null,
    turnCount: 4,
    tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    metadata: { prUrl: "https://github.com/owner/repo/pull/42", mergeCommitSha: "abc123" },
    createdAt: "2026-04-03T10:00:00Z",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  200 — known attempt with checkpoints                               */
/* ------------------------------------------------------------------ */

describe.skip("GET /api/v1/attempts/:attempt_id/checkpoints — 200 with data", () => {
  let ctx: TestServerResult;

  beforeEach(async () => {
    const checkpoint = makeCheckpoint();
    ctx = await startTestServer({
      orchestrator: {
        ...({} as never),
        getAttemptDetail: vi.fn().mockReturnValue({ attemptId: "attempt-abc" }),
      },
      attemptStore: {
        listCheckpoints: vi.fn().mockResolvedValue([checkpoint]),
        getAllPrs: vi.fn().mockResolvedValue([]),
      },
    });
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  it("returns 200 with a checkpoints array", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/attempts/attempt-abc/checkpoints`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { checkpoints: unknown[] };
    expect(body).toHaveProperty("checkpoints");
    expect(Array.isArray(body.checkpoints)).toBe(true);
    expect(body.checkpoints).toHaveLength(1);
  });

  it("response contains expected checkpoint fields", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/attempts/attempt-abc/checkpoints`);
    const body = (await response.json()) as { checkpoints: Record<string, unknown>[] };
    const cp = body.checkpoints[0];
    expect(cp).toMatchObject({
      checkpointId: 1,
      attemptId: "attempt-abc",
      ordinal: 0,
      trigger: "pr_merged",
      status: "completed",
      turnCount: 4,
    });
  });
});

/* ------------------------------------------------------------------ */
/*  404 — unknown attempt                                               */
/* ------------------------------------------------------------------ */

describe("GET /api/v1/attempts/:attempt_id/checkpoints — 404 for unknown attempt", () => {
  let ctx: TestServerResult;

  beforeEach(async () => {
    ctx = await startTestServer({
      attemptStore: {
        listCheckpoints: vi.fn().mockResolvedValue([]),
        getAllPrs: vi.fn().mockResolvedValue([]),
      },
    });
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  it("returns 404 when attempt is not found", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/attempts/unknown-attempt-id/checkpoints`);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });
});

/* ------------------------------------------------------------------ */
/*  503 — attempt store not configured                                  */
/* ------------------------------------------------------------------ */

describe("GET /api/v1/attempts/:attempt_id/checkpoints — 503 without attempt store", () => {
  let ctx: TestServerResult;

  beforeEach(async () => {
    ctx = await startTestServer();
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  it("returns 503 when no attempt store is configured", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/attempts/some-attempt/checkpoints`);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_configured");
  });
});
