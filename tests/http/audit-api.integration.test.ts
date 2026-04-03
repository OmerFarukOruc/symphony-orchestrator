/**
 * Integration tests for GET /api/v1/audit.
 *
 * Uses a real SQLite database (temp file) and a real AuditLogger instance
 * wired into the HttpServer via the test harness.
 */

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuditLogger } from "../../src/audit/logger.js";
import { closeDatabase, openDatabase, type RisolutoDatabase } from "../../src/persistence/sqlite/database.js";
import { startTestServer, type TestServerResult } from "../helpers/http-server-harness.js";

/* ------------------------------------------------------------------ */
/*  Per-test setup                                                      */
/* ------------------------------------------------------------------ */

let ctx: TestServerResult;
let db: RisolutoDatabase;
let auditLogger: AuditLogger;
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "risoluto-audit-integ-"));
  db = openDatabase(path.join(tempDir, "audit.db"));
  auditLogger = new AuditLogger(db);
  ctx = await startTestServer({ auditLogger });
});

afterEach(async () => {
  await ctx.teardown();
  closeDatabase(db);
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

async function fetchAudit(query = ""): Promise<Response> {
  const qs = query ? `?${query}` : "";
  return fetch(`${ctx.baseUrl}/api/v1/audit${qs}`);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describe("GET /api/v1/audit", () => {
  it("returns { entries: [], total: 0 } when log is empty", async () => {
    const response = await fetchAudit();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ entries: [], total: 0 });
  });

  it("returns entries after AuditLogger.log() is called", async () => {
    auditLogger.log({
      tableName: "config",
      key: "system",
      operation: "update",
      previousValue: "old",
      newValue: "new",
    });

    const response = await fetchAudit();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { entries: unknown[]; total: number };
    expect(body.total).toBe(1);
    expect(body.entries).toHaveLength(1);
    const entry = body.entries[0] as Record<string, unknown>;
    expect(entry.tableName).toBe("config");
    expect(entry.key).toBe("system");
    expect(entry.operation).toBe("update");
  });

  it("filters by tableName", async () => {
    auditLogger.log({ tableName: "config", key: "k1", operation: "create" });
    auditLogger.log({ tableName: "secrets", key: "k2", operation: "set" });

    const response = await fetchAudit("tableName=config");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { entries: unknown[]; total: number };
    expect(body.total).toBe(1);
    const entry = body.entries[0] as Record<string, unknown>;
    expect(entry.tableName).toBe("config");
  });

  it("filters by key", async () => {
    auditLogger.log({ tableName: "config", key: "alpha", operation: "create" });
    auditLogger.log({ tableName: "config", key: "beta", operation: "create" });

    const response = await fetchAudit("key=alpha");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { entries: unknown[]; total: number };
    expect(body.total).toBe(1);
    const entry = body.entries[0] as Record<string, unknown>;
    expect(entry.key).toBe("alpha");
  });

  it("filters by pathPrefix", async () => {
    auditLogger.log({ tableName: "config", key: "system", path: "repos.0.url", operation: "update" });
    auditLogger.log({ tableName: "config", key: "system", path: "tracker.states", operation: "update" });

    const response = await fetchAudit("pathPrefix=repos");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { entries: unknown[]; total: number };
    expect(body.total).toBe(1);
    const entry = body.entries[0] as Record<string, unknown>;
    expect(entry.path).toBe("repos.0.url");
  });

  it("filters by from / to timestamps", async () => {
    const before = new Date(Date.now() - 5000).toISOString();
    auditLogger.log({ tableName: "config", key: "x", operation: "create" });
    const after = new Date(Date.now() + 5000).toISOString();

    // 'from' only — should include the entry
    const responseFrom = await fetchAudit(`from=${encodeURIComponent(before)}`);
    expect(responseFrom.status).toBe(200);
    const bodyFrom = (await responseFrom.json()) as { total: number };
    expect(bodyFrom.total).toBe(1);

    // 'to' before the entry was created — should exclude it
    const cutoff = new Date(Date.now() - 10000).toISOString();
    const responseTo = await fetchAudit(`to=${encodeURIComponent(cutoff)}`);
    expect(responseTo.status).toBe(200);
    const bodyTo = (await responseTo.json()) as { total: number };
    expect(bodyTo.total).toBe(0);

    // 'from' after the entry — should exclude it
    const responseFuture = await fetchAudit(`from=${encodeURIComponent(after)}`);
    expect(responseFuture.status).toBe(200);
    const bodyFuture = (await responseFuture.json()) as { total: number };
    expect(bodyFuture.total).toBe(0);
  });

  it("supports limit and offset pagination", async () => {
    for (let i = 0; i < 5; i++) {
      auditLogger.log({ tableName: "config", key: `key-${i}`, operation: "create" });
    }

    const responsePage1 = await fetchAudit("limit=2&offset=0");
    expect(responsePage1.status).toBe(200);
    const bodyPage1 = (await responsePage1.json()) as { entries: unknown[]; total: number };
    expect(bodyPage1.total).toBe(5);
    expect(bodyPage1.entries).toHaveLength(2);

    const responsePage2 = await fetchAudit("limit=2&offset=2");
    expect(responsePage2.status).toBe(200);
    const bodyPage2 = (await responsePage2.json()) as { entries: unknown[]; total: number };
    expect(bodyPage2.total).toBe(5);
    expect(bodyPage2.entries).toHaveLength(2);

    const responsePage3 = await fetchAudit("limit=2&offset=4");
    expect(responsePage3.status).toBe(200);
    const bodyPage3 = (await responsePage3.json()) as { entries: unknown[]; total: number };
    expect(bodyPage3.entries).toHaveLength(1);
  });

  it("clamps limit to 1000 max", async () => {
    // Seed one entry so we can confirm the route works normally.
    auditLogger.log({ tableName: "config", key: "k", operation: "create" });

    const response = await fetchAudit("limit=9999");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { entries: unknown[]; total: number };
    // Should not error — returns the clamped result
    expect(body.total).toBe(1);
    expect(body.entries).toHaveLength(1);
  });

  it("falls back to limit=50 for invalid limit value", async () => {
    auditLogger.log({ tableName: "config", key: "k", operation: "create" });

    const response = await fetchAudit("limit=not-a-number");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { entries: unknown[]; total: number };
    expect(body.total).toBe(1);
    expect(body.entries).toHaveLength(1);
  });
});

describe("/api/v1/audit — method guards", () => {
  it("POST → 405", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(405);
  });

  it("PUT → 405", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/audit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(405);
  });

  it("DELETE → 405", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/audit`, { method: "DELETE" });
    expect(response.status).toBe(405);
  });
});
