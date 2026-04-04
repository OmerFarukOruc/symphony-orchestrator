import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { closeDatabase, openDatabase, type RisolutoDatabase } from "../../../src/persistence/sqlite/database.js";
import { AutomationStore } from "../../../src/persistence/sqlite/automation-store.js";
import { automationRuns } from "../../../src/persistence/sqlite/schema.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-automation-store-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function createSqliteStore(dir: string): {
  db: RisolutoDatabase;
  store: ReturnType<typeof AutomationStore.create>;
  close: () => void;
} {
  const db = openDatabase(path.join(dir, "test.db"));
  return {
    db,
    store: AutomationStore.create(db),
    close: () => closeDatabase(db),
  };
}

describe("AutomationStore", () => {
  it("persists automation runs and lists them newest-first", async () => {
    const dir = await createTempDir();
    const { db, store, close } = createSqliteStore(dir);

    try {
      const first = await store.createRun({
        automationName: "nightly-report",
        mode: "report",
        trigger: "schedule",
        repoUrl: "https://github.com/acme/app",
        startedAt: "2026-04-04T10:00:00.000Z",
      });
      const second = await store.createRun({
        automationName: "triage-findings",
        mode: "findings",
        trigger: "manual",
        repoUrl: "https://github.com/acme/app",
        startedAt: "2026-04-04T10:05:00.000Z",
      });

      const listed = await store.listRuns();
      expect(listed.map((run) => run.id)).toEqual([second.id, first.id]);
      expect(await store.countRuns()).toBe(2);

      const row = db.select().from(automationRuns).where(eq(automationRuns.id, second.id)).get();
      expect(row).toMatchObject({
        automationName: "triage-findings",
        mode: "findings",
        status: "running",
      });
    } finally {
      close();
    }
  });

  it("updates completed automation runs with output and issue linkage", async () => {
    const dir = await createTempDir();
    const { db, store, close } = createSqliteStore(dir);

    try {
      const created = await store.createRun({
        automationName: "dispatch-implementer",
        mode: "implement",
        trigger: "schedule",
        repoUrl: null,
        startedAt: "2026-04-04T10:10:00.000Z",
      });

      const finished = await store.finishRun(created.id, {
        status: "completed",
        output: "Created issue ENG-9",
        details: { prompt: "Fix the deploy" },
        issueId: "issue-9",
        issueIdentifier: "ENG-9",
        issueUrl: "https://tracker.example/issues/ENG-9",
        error: null,
        finishedAt: "2026-04-04T10:11:00.000Z",
      });

      expect(finished).toMatchObject({
        status: "completed",
        issueIdentifier: "ENG-9",
        output: "Created issue ENG-9",
      });

      const row = db.select().from(automationRuns).where(eq(automationRuns.id, created.id)).get();
      expect(row).toMatchObject({
        issueIdentifier: "ENG-9",
        status: "completed",
      });
    } finally {
      close();
    }
  });

  it("falls back to an in-memory store when SQLite is unavailable", async () => {
    const store = AutomationStore.create(null);

    const created = await store.createRun({
      automationName: "memory-report",
      mode: "report",
      trigger: "manual",
      repoUrl: "https://github.com/acme/app",
      startedAt: "2026-04-04T10:20:00.000Z",
    });
    await store.finishRun(created.id, {
      status: "completed",
      output: "ok",
      details: null,
      issueId: null,
      issueIdentifier: null,
      issueUrl: null,
      error: null,
      finishedAt: "2026-04-04T10:21:00.000Z",
    });

    const listed = await store.listRuns();
    expect(listed).toHaveLength(1);
    expect(listed[0].status).toBe("completed");
  });
});
