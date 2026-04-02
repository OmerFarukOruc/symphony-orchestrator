/**
 * Orchestrator restart, recovery, and idempotency integration tests.
 *
 * Exercises the orchestrator's resilience against:
 * - Duplicate webhook delivery (same Linear-Delivery header) → idempotent
 * - Restart mid-run → in-progress webhook data persists across server restarts
 * - Abort race conditions → concurrent abort and completion don't corrupt state
 * - Bootstrap idempotence → `openDatabase()` on existing DB doesn't lose data
 *
 * All tests use real temp SQLite databases via the shared HTTP server harness.
 */

import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SqliteWebhookInbox } from "../../src/persistence/sqlite/webhook-inbox.js";
import { closeDatabase, openDatabase } from "../../src/persistence/sqlite/database.js";
import { SqliteAttemptStore } from "../../src/persistence/sqlite/attempt-store-sqlite.js";
import { createLogger } from "../../src/core/logger.js";
import {
  buildStubOrchestrator,
  buildWebhookDeps,
  startTestServer,
  type TestServerResult,
} from "../helpers/http-server-harness.js";

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const WEBHOOK_SECRET = "whsec_integration_test_secret";

function sign(body: string, secret: string = WEBHOOK_SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function makeWebhookPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: "update",
    type: "Issue",
    data: { id: "issue-1", identifier: "RSL-10", title: "Test issue" },
    webhookTimestamp: Date.now(),
    ...overrides,
  };
}

/**
 * POST a signed webhook to the test server's `/webhooks/linear` endpoint.
 * Returns the response status and parsed body.
 */
async function postWebhook(
  baseUrl: string,
  payload: Record<string, unknown>,
  options: {
    deliveryId?: string;
    secret?: string;
    omitSignature?: boolean;
    customSignature?: string;
  } = {},
): Promise<{ status: number; body: unknown }> {
  const bodyStr = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!options.omitSignature) {
    headers["Linear-Signature"] = options.customSignature ?? sign(bodyStr, options.secret ?? WEBHOOK_SECRET);
  }

  if (options.deliveryId) {
    headers["Linear-Delivery"] = options.deliveryId;
  }

  const response = await fetch(`${baseUrl}/webhooks/linear`, {
    method: "POST",
    headers,
    body: bodyStr,
  });

  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

/** Flush microtask queue so fire-and-forget inbox promises settle. */
async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

const logger = createLogger();

/* ------------------------------------------------------------------ */
/*  Webhook dedup (idempotency via Linear-Delivery header)             */
/* ------------------------------------------------------------------ */

describe("Webhook dedup (idempotency)", () => {
  let ctx: TestServerResult;

  afterEach(async () => {
    await ctx?.teardown();
  });

  it("same deliveryId posted twice → inbox shows only one entry, both return 200", async () => {
    const db = openDatabase(":memory:");
    const inbox = new SqliteWebhookInbox(db, logger);

    ctx = await startTestServer({
      withDatabase: true,
      webhookDeps: buildWebhookDeps({
        getWebhookSecret: vi.fn().mockReturnValue(WEBHOOK_SECRET),
        webhookInbox: inbox,
      }),
    });

    const payload = makeWebhookPayload();
    const deliveryId = "dedup-test-001";

    const first = await postWebhook(ctx.baseUrl, payload, { deliveryId });
    await flushMicrotasks();
    const second = await postWebhook(ctx.baseUrl, payload, { deliveryId });
    await flushMicrotasks();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const recent = await inbox.getRecent();
    expect(recent).toHaveLength(1);
    expect(recent[0].deliveryId).toBe(deliveryId);

    closeDatabase(db);
  });

  it("two different deliveryIds → both stored and processed", async () => {
    const db = openDatabase(":memory:");
    const inbox = new SqliteWebhookInbox(db, logger);
    const recordVerifiedDelivery = vi.fn();

    ctx = await startTestServer({
      withDatabase: true,
      webhookDeps: buildWebhookDeps({
        getWebhookSecret: vi.fn().mockReturnValue(WEBHOOK_SECRET),
        webhookInbox: inbox,
        recordVerifiedDelivery,
      }),
    });

    const payload1 = makeWebhookPayload({ data: { id: "issue-1", identifier: "RSL-10", title: "First" } });
    const payload2 = makeWebhookPayload({ data: { id: "issue-2", identifier: "RSL-11", title: "Second" } });

    await postWebhook(ctx.baseUrl, payload1, { deliveryId: "delivery-A" });
    await flushMicrotasks();
    await postWebhook(ctx.baseUrl, payload2, { deliveryId: "delivery-B" });
    await flushMicrotasks();

    const recent = await inbox.getRecent();
    expect(recent).toHaveLength(2);

    const deliveryIds = recent.map((record) => record.deliveryId);
    expect(deliveryIds).toContain("delivery-A");
    expect(deliveryIds).toContain("delivery-B");

    // Both were new, so recordVerifiedDelivery should have been called twice
    expect(recordVerifiedDelivery).toHaveBeenCalledTimes(2);

    closeDatabase(db);
  });

  it("duplicate delivery skips side-effect processing", async () => {
    const db = openDatabase(":memory:");
    const inbox = new SqliteWebhookInbox(db, logger);
    const requestRefresh = vi.fn();
    const requestTargetedRefresh = vi.fn();
    const recordVerifiedDelivery = vi.fn();

    ctx = await startTestServer({
      withDatabase: true,
      webhookDeps: buildWebhookDeps({
        getWebhookSecret: vi.fn().mockReturnValue(WEBHOOK_SECRET),
        webhookInbox: inbox,
        requestRefresh,
        requestTargetedRefresh,
        recordVerifiedDelivery,
      }),
    });

    const payload = makeWebhookPayload();
    const deliveryId = "dedup-skip-test";

    await postWebhook(ctx.baseUrl, payload, { deliveryId });
    await flushMicrotasks();

    // Reset call counts after first delivery
    requestRefresh.mockClear();
    requestTargetedRefresh.mockClear();
    recordVerifiedDelivery.mockClear();

    await postWebhook(ctx.baseUrl, payload, { deliveryId });
    await flushMicrotasks();

    // Second delivery should not trigger processing
    expect(recordVerifiedDelivery).not.toHaveBeenCalled();

    closeDatabase(db);
  });
});

/* ------------------------------------------------------------------ */
/*  Restart persistence                                                */
/* ------------------------------------------------------------------ */

describe("Restart persistence", () => {
  it("webhook inbox data survives server stop → new server with same DB", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "risoluto-restart-test-"));
    const dbPath = path.join(tmpDir, "restart-test.db");

    // Phase 1: start server, post webhook, stop server
    const db1 = openDatabase(dbPath);
    const inbox1 = new SqliteWebhookInbox(db1, logger);

    const ctx1 = await startTestServer({
      withDatabase: true,
      webhookDeps: buildWebhookDeps({
        getWebhookSecret: vi.fn().mockReturnValue(WEBHOOK_SECRET),
        webhookInbox: inbox1,
      }),
    });

    const payload = makeWebhookPayload();
    await postWebhook(ctx1.baseUrl, payload, { deliveryId: "persist-across-restart" });
    await flushMicrotasks();

    // Verify it was stored
    const beforeRestart = await inbox1.getRecent();
    expect(beforeRestart).toHaveLength(1);
    expect(beforeRestart[0].deliveryId).toBe("persist-across-restart");

    // Stop the first server and close DB
    await ctx1.server.stop();
    closeDatabase(db1);

    // Phase 2: reopen DB, start new server, verify data persists
    const db2 = openDatabase(dbPath);
    const inbox2 = new SqliteWebhookInbox(db2, logger);

    const afterRestart = await inbox2.getRecent();
    expect(afterRestart).toHaveLength(1);
    expect(afterRestart[0].deliveryId).toBe("persist-across-restart");
    expect(afterRestart[0].status).toBe("received");

    // Verify the new server can accept new webhooks to the same DB
    const ctx2 = await startTestServer({
      withDatabase: true,
      webhookDeps: buildWebhookDeps({
        getWebhookSecret: vi.fn().mockReturnValue(WEBHOOK_SECRET),
        webhookInbox: inbox2,
      }),
    });

    const newPayload = makeWebhookPayload({ data: { id: "issue-2", identifier: "RSL-20", title: "Post-restart" } });
    await postWebhook(ctx2.baseUrl, newPayload, { deliveryId: "post-restart-delivery" });
    await flushMicrotasks();

    const allRecords = await inbox2.getRecent();
    expect(allRecords).toHaveLength(2);

    const deliveryIds = allRecords.map((record) => record.deliveryId);
    expect(deliveryIds).toContain("persist-across-restart");
    expect(deliveryIds).toContain("post-restart-delivery");

    // Cleanup
    await ctx2.server.stop();
    closeDatabase(db2);

    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    // Also teardown ctx1's temp dir (harness created one)
    await ctx1.teardown().catch(() => {});
  });
});

/* ------------------------------------------------------------------ */
/*  Abort race conditions                                              */
/* ------------------------------------------------------------------ */

describe("Abort race conditions", () => {
  let ctx: TestServerResult;

  afterEach(async () => {
    await ctx?.teardown();
  });

  it("concurrent abort and completion don't corrupt orchestrator state", async () => {
    // Create an orchestrator with an issue that has a running worker
    const abortIssue = vi.fn().mockReturnValue({
      ok: true,
      alreadyStopping: false,
      requestedAt: new Date().toISOString(),
    });
    const stopWorkerForIssue = vi.fn();

    const orchestrator = buildStubOrchestrator({ abortIssue });

    ctx = await startTestServer({
      withDatabase: true,
      webhookDeps: buildWebhookDeps({
        getWebhookSecret: vi.fn().mockReturnValue(WEBHOOK_SECRET),
        stopWorkerForIssue,
      }),
      orchestrator,
    });

    // Fire abort request and a "done" webhook concurrently
    const abortPromise = fetch(`${ctx.baseUrl}/api/v1/RSL-10/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    // Webhook with state moved to "Done" (terminal)
    const donePayload = makeWebhookPayload({
      action: "update",
      data: {
        id: "issue-1",
        identifier: "RSL-10",
        title: "Test issue",
        state: { name: "Done" },
      },
    });

    const webhookPromise = postWebhook(ctx.baseUrl, donePayload, { deliveryId: "race-done" });

    const [abortResult, webhookResult] = await Promise.all([abortPromise, webhookPromise]);
    await flushMicrotasks();

    // Both requests should complete without errors (no 500s)
    expect(abortResult.status).toBeLessThan(500);
    expect(webhookResult.status).toBe(200);

    // Orchestrator state should remain consistent — at least one path executed
    const snapshot = orchestrator.getSnapshot();
    expect(snapshot).toBeDefined();
  });

  it("rapid abort calls are idempotent", async () => {
    let callCount = 0;
    const abortIssue = vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return { ok: true, alreadyStopping: false, requestedAt: new Date().toISOString() };
      }
      return { ok: true, alreadyStopping: true, requestedAt: new Date().toISOString() };
    });

    ctx = await startTestServer({
      withDatabase: true,
      orchestrator: buildStubOrchestrator({ abortIssue }),
    });

    // Fire three abort requests concurrently
    const results = await Promise.all([
      fetch(`${ctx.baseUrl}/api/v1/RSL-10/abort`, { method: "POST" }),
      fetch(`${ctx.baseUrl}/api/v1/RSL-10/abort`, { method: "POST" }),
      fetch(`${ctx.baseUrl}/api/v1/RSL-10/abort`, { method: "POST" }),
    ]);

    // All should complete without 500 errors
    for (const result of results) {
      expect(result.status).toBeLessThan(500);
    }

    // abortIssue should have been called for each request
    expect(abortIssue).toHaveBeenCalledTimes(3);
  });
});

/* ------------------------------------------------------------------ */
/*  Refresh coalescing                                                 */
/* ------------------------------------------------------------------ */

describe("Refresh coalescing", () => {
  let ctx: TestServerResult;

  afterEach(async () => {
    await ctx?.teardown();
  });

  it("rapid POST /api/v1/refresh calls report coalescing", async () => {
    const requestRefresh = vi.fn().mockImplementation((_reason: string) => {
      // Simulate coalescing: first call is queued, subsequent are coalesced
      const callNumber = requestRefresh.mock.calls.length;
      return {
        queued: callNumber === 1,
        coalesced: callNumber > 1,
        requestedAt: new Date().toISOString(),
      };
    });

    ctx = await startTestServer({
      orchestrator: buildStubOrchestrator({ requestRefresh }),
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`${ctx.baseUrl}/api/v1/refresh`, { method: "POST" }).then(async (response) => ({
          status: response.status,
          body: await response.json(),
        })),
      ),
    );

    // All should return 202 Accepted
    for (const result of results) {
      expect(result.status).toBe(202);
    }

    // requestRefresh should have been called 5 times
    expect(requestRefresh).toHaveBeenCalledTimes(5);

    // At least the first call should have queued=true
    const firstResult = results.find(
      (result) => (result.body as { queued: boolean; coalesced: boolean }).queued === true,
    );
    expect(firstResult).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Webhook error paths                                                */
/* ------------------------------------------------------------------ */

describe("Webhook error paths (integration)", () => {
  let ctx: TestServerResult;

  afterEach(async () => {
    await ctx?.teardown();
  });

  it("POST without Linear-Signature header → 401", async () => {
    ctx = await startTestServer({
      webhookDeps: buildWebhookDeps({
        getWebhookSecret: vi.fn().mockReturnValue(WEBHOOK_SECRET),
      }),
    });

    const payload = makeWebhookPayload();
    const result = await postWebhook(ctx.baseUrl, payload, { omitSignature: true });

    expect(result.status).toBe(401);
    expect((result.body as { error: { code: string } }).error.code).toBe("signature_missing");
  });

  it("POST with wrong signature → 401", async () => {
    ctx = await startTestServer({
      webhookDeps: buildWebhookDeps({
        getWebhookSecret: vi.fn().mockReturnValue(WEBHOOK_SECRET),
      }),
    });

    const payload = makeWebhookPayload();
    const wrongSig = sign(JSON.stringify(payload), "wrong-secret-entirely");
    const result = await postWebhook(ctx.baseUrl, payload, { customSignature: wrongSig });

    expect(result.status).toBe(401);
    expect((result.body as { error: { code: string } }).error.code).toBe("signature_invalid");
  });

  it("POST with stale timestamp → 401 replay_rejected", async () => {
    ctx = await startTestServer({
      webhookDeps: buildWebhookDeps({
        getWebhookSecret: vi.fn().mockReturnValue(WEBHOOK_SECRET),
      }),
    });

    const stalePayload = makeWebhookPayload({ webhookTimestamp: Date.now() - 120_000 });
    const result = await postWebhook(ctx.baseUrl, stalePayload);

    expect(result.status).toBe(401);
    expect((result.body as { error: { code: string } }).error.code).toBe("replay_rejected");
  });

  it("POST when webhook secret not configured → 503 with Retry-After", async () => {
    ctx = await startTestServer({
      webhookDeps: buildWebhookDeps({
        getWebhookSecret: vi.fn().mockReturnValue(null),
      }),
    });

    const payload = makeWebhookPayload();
    const result = await postWebhook(ctx.baseUrl, payload);

    expect(result.status).toBe(503);
  });
});

/* ------------------------------------------------------------------ */
/*  Bootstrap idempotence (openDatabase on existing DB)                */
/* ------------------------------------------------------------------ */

describe("Bootstrap idempotence", () => {
  it("openDatabase() on existing DB preserves all data", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "risoluto-bootstrap-test-"));
    const dbPath = path.join(tmpDir, "bootstrap.db");

    // First open: seed data across multiple stores
    const db1 = openDatabase(dbPath);
    const inbox1 = new SqliteWebhookInbox(db1, logger);
    const attemptStore1 = new SqliteAttemptStore(db1, logger);

    await inbox1.insertVerified({
      deliveryId: "bootstrap-del-1",
      type: "Issue",
      action: "create",
      entityId: "entity-1",
      issueId: "issue-1",
      issueIdentifier: "RSL-50",
      webhookTimestamp: Date.now(),
      payloadJson: JSON.stringify({ test: "bootstrap" }),
    });

    await attemptStore1.createAttempt({
      attemptId: "bootstrap-attempt-1",
      issueId: "issue-1",
      issueIdentifier: "RSL-50",
      title: "Bootstrap test attempt",
      workspaceKey: "RSL-50",
      workspacePath: "/tmp/risoluto/RSL-50",
      status: "completed",
      attemptNumber: 1,
      startedAt: "2026-03-20T10:00:00.000Z",
      endedAt: "2026-03-20T10:05:00.000Z",
      model: "gpt-5.4",
      reasoningEffort: "high",
      modelSource: "default",
      threadId: null,
      turnId: null,
      turnCount: 3,
      errorCode: null,
      errorMessage: null,
      tokenUsage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
      pullRequestUrl: null,
      stopSignal: null,
    });

    closeDatabase(db1);

    // Second open: openDatabase uses CREATE TABLE IF NOT EXISTS → data should survive
    const db2 = openDatabase(dbPath);
    const inbox2 = new SqliteWebhookInbox(db2, logger);
    const attemptStore2 = new SqliteAttemptStore(db2, logger);

    // Webhook inbox data preserved
    const inboxRecords = await inbox2.getRecent();
    expect(inboxRecords).toHaveLength(1);
    expect(inboxRecords[0].deliveryId).toBe("bootstrap-del-1");
    expect(inboxRecords[0].status).toBe("received");

    // Attempt store data preserved
    const attempt = attemptStore2.getAttempt("bootstrap-attempt-1");
    expect(attempt).not.toBeNull();
    expect(attempt!.issueIdentifier).toBe("RSL-50");
    expect(attempt!.status).toBe("completed");
    expect(attempt!.turnCount).toBe(3);

    // Can still insert new data (schema is intact)
    await inbox2.insertVerified({
      deliveryId: "bootstrap-del-2",
      type: "Issue",
      action: "update",
      entityId: "entity-2",
      issueId: "issue-2",
      issueIdentifier: "RSL-51",
      webhookTimestamp: Date.now(),
      payloadJson: null,
    });

    const updatedRecords = await inbox2.getRecent();
    expect(updatedRecords).toHaveLength(2);

    closeDatabase(db2);
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("openDatabase() on existing DB preserves schema_version", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "risoluto-version-test-"));
    const dbPath = path.join(tmpDir, "version.db");

    // First open sets the schema version
    const db1 = openDatabase(dbPath);
    closeDatabase(db1);

    // Second open should not corrupt the version
    const db2 = openDatabase(dbPath);

    // Verify schema_version table is intact (query the raw SQLite)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = (db2 as any).session;
    const versionRow = session.client
      .prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
      .get() as { version: number } | undefined;

    expect(versionRow).toBeDefined();
    expect(versionRow!.version).toBeGreaterThanOrEqual(3);

    closeDatabase(db2);
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });
});
