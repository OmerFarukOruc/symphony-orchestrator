/**
 * Integration test stubs for GET /api/v1/prs.
 *
 * These stubs document the expected behavior and serve as scaffolding
 * for future full integration tests backed by a real SQLite store.
 *
 * Activate full tests by replacing `describe.skip` with `describe`
 * and wiring the SQLite `SqliteAttemptStore` via the test harness
 * `attemptStore` override.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpenPrRecord } from "../../src/core/attempt-store-port.js";
import { startTestServer, type TestServerResult } from "../helpers/http-server-harness.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function makePrRecord(overrides: Partial<OpenPrRecord> = {}): OpenPrRecord {
  return {
    prId: "pr-1",
    attemptId: "attempt-abc",
    issueId: "issue-xyz",
    owner: "owner",
    repo: "repo",
    pullNumber: 42,
    url: "https://github.com/owner/repo/pull/42",
    branchName: "risoluto/eng-42",
    status: "open",
    mergedAt: null,
    mergeCommitSha: null,
    createdAt: "2026-04-01T09:00:00Z",
    updatedAt: "2026-04-01T09:00:00Z",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Happy path — non-empty PR list                                      */
/* ------------------------------------------------------------------ */

describe.skip("GET /api/v1/prs — happy path", () => {
  let ctx: TestServerResult;

  beforeEach(async () => {
    const pr = makePrRecord();
    ctx = await startTestServer({
      attemptStore: {
        listCheckpoints: vi.fn().mockResolvedValue([]),
        getAllPrs: vi.fn().mockResolvedValue([pr]),
      },
    });
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  it("returns 200 with a prs array", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/prs`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { prs: unknown[] };
    expect(body).toHaveProperty("prs");
    expect(Array.isArray(body.prs)).toBe(true);
    expect(body.prs).toHaveLength(1);
  });

  it("response contains expected PR fields", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/prs`);
    const body = (await response.json()) as { prs: Record<string, unknown>[] };
    const pr = body.prs[0];
    expect(pr).toMatchObject({
      issueId: "issue-xyz",
      url: "https://github.com/owner/repo/pull/42",
      number: 42,
      repo: "owner/repo",
      branchName: "risoluto/eng-42",
      status: "open",
      mergedAt: null,
      mergeCommitSha: null,
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Empty list                                                          */
/* ------------------------------------------------------------------ */

describe.skip("GET /api/v1/prs — empty list", () => {
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

  it("returns 200 with an empty prs array", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/prs`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { prs: unknown[] };
    expect(body.prs).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  503 when attempt store not configured                               */
/* ------------------------------------------------------------------ */

describe("GET /api/v1/prs — 503 without attempt store", () => {
  let ctx: TestServerResult;

  beforeEach(async () => {
    // No attemptStore passed — server should respond with 503
    ctx = await startTestServer();
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  it("returns 503 when no attempt store is configured", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/prs`);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_configured");
  });
});
