import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLogger } from "../../src/core/logger.js";
import { HttpServer } from "../../src/http/server.js";
import { openDatabase, closeDatabase, type RisolutoDatabase } from "../../src/persistence/sqlite/database.js";
import { SqliteAttemptStore } from "../../src/persistence/sqlite/attempt-store-sqlite.js";
import { buildSilentLogger, buildStubOrchestrator } from "../helpers/http-server-harness.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-pr-handler-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("GET /api/v1/prs", () => {
  let dataDir: string;
  let db: RisolutoDatabase;
  let store: SqliteAttemptStore;
  let server: HttpServer;
  let baseUrl: string;

  beforeEach(async () => {
    dataDir = await createTempDir();
    db = openDatabase(path.join(dataDir, "test.db"));
    store = new SqliteAttemptStore(db, createLogger());

    await store.upsertPr({
      attemptId: "attempt-1",
      issueId: "issue-1",
      owner: "acme",
      repo: "backend",
      pullNumber: 42,
      url: "https://github.com/acme/backend/pull/42",
      status: "open",
      createdAt: "2026-04-03T10:00:00.000Z",
      updatedAt: "2026-04-03T10:00:00.000Z",
      branchName: "feature/eng-1",
    });
    await store.upsertPr({
      attemptId: "attempt-2",
      issueId: "issue-2",
      owner: "acme",
      repo: "backend",
      pullNumber: 43,
      url: "https://github.com/acme/backend/pull/43",
      status: "merged",
      createdAt: "2026-04-03T10:10:00.000Z",
      updatedAt: "2026-04-03T10:10:00.000Z",
      branchName: "feature/eng-2",
    });

    server = new HttpServer({
      orchestrator: buildStubOrchestrator(),
      logger: buildSilentLogger(),
      attemptStore: store,
      archiveDir: dataDir,
    });
    const { port } = await server.start(0);
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await server.stop();
    closeDatabase(db);
  });

  it("returns all tracked PRs", async () => {
    const response = await fetch(`${baseUrl}/api/v1/prs`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      prs: Array<{ issueId: string; number: number; repo: string; status: string }>;
    };
    expect(body.prs).toHaveLength(2);
    expect(body.prs[0]).toEqual(
      expect.objectContaining({
        issueId: expect.any(String),
        number: expect.any(Number),
        repo: "acme/backend",
        status: expect.stringMatching(/open|merged|closed/),
      }),
    );
  });

  it("filters by status when query param is provided", async () => {
    const response = await fetch(`${baseUrl}/api/v1/prs?status=open`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      prs: Array<{ number: number; status: string }>;
    };
    expect(body.prs).toHaveLength(1);
    expect(body.prs[0]).toEqual(expect.objectContaining({ number: 42, status: "open" }));
  });

  it("returns 400 for an invalid status filter", async () => {
    const response = await fetch(`${baseUrl}/api/v1/prs?status=queued`);
    expect(response.status).toBe(400);
  });
});
