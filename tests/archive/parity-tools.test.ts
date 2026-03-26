import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { backfillArchiveToSqlite } from "../../src/archive/backfill.js";
import { runParityCheck } from "../../src/archive/parity.js";
import { closeDatabaseConnection, openDatabaseConnection } from "../../src/db/connection.js";
import { attempts } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

const tempDirs: string[] = [];
const fixtureArchiveDir = path.resolve("tests/fixtures/symphony-archive-sandbox/.symphony");

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-parity-tools-"));
  tempDirs.push(dir);
  return dir;
}

async function copyFixtureArchive(): Promise<string> {
  const tempDir = await createTempDir();
  const archiveDir = path.join(tempDir, ".symphony");
  await cp(fixtureArchiveDir, archiveDir, { recursive: true });
  return archiveDir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("archive parity tooling", () => {
  it("backfills the file archive into sqlite and reports zero discrepancies on fixture data", async () => {
    const archiveDir = await copyFixtureArchive();

    const backfillResult = await backfillArchiveToSqlite({ archiveDir });
    const parityReport = await runParityCheck({ archiveDir });

    expect(backfillResult.attemptCount).toBe(5);
    expect(backfillResult.eventCount).toBeGreaterThan(0);
    expect(backfillResult.warnings).toEqual([]);
    expect(parityReport.fileSnapshot.attempts.size).toBe(5);
    expect(parityReport.discrepancies).toEqual([]);
  });

  it("skips corrupt JSONL lines with warnings while preserving parity for valid events", async () => {
    const archiveDir = await copyFixtureArchive();
    const eventPath = path.join(archiveDir, "events", "00000000-0000-4000-8000-000000000006.jsonl");
    const existing = await readFile(eventPath, "utf8");
    await writeFile(eventPath, `${existing}not valid json\n`, "utf8");

    const backfillResult = await backfillArchiveToSqlite({ archiveDir });
    const parityReport = await runParityCheck({ archiveDir });

    expect(backfillResult.warnings).toEqual([
      expect.objectContaining({
        reference: `${eventPath}:7`,
        message: expect.stringContaining("corrupt JSONL line skipped"),
      }),
    ]);
    expect(parityReport.fileSnapshot.warnings).toEqual([
      expect.objectContaining({
        reference: `${eventPath}:7`,
        message: expect.stringContaining("corrupt JSONL line skipped"),
      }),
    ]);
    expect(parityReport.discrepancies).toEqual([]);
  });

  it("handles missing archive directories gracefully", async () => {
    const tempDir = await createTempDir();
    const archiveDir = path.join(tempDir, ".symphony");
    await mkdir(archiveDir, { recursive: true });

    const backfillResult = await backfillArchiveToSqlite({ archiveDir });
    const parityReport = await runParityCheck({ archiveDir });

    expect(backfillResult.attemptCount).toBe(0);
    expect(backfillResult.eventCount).toBe(0);
    expect(backfillResult.warnings).toEqual([
      expect.objectContaining({ message: "attempt archive directory missing; treating as empty" }),
      expect.objectContaining({ message: "issue index missing; deriving per-issue ordering from attempts" }),
      expect.objectContaining({ message: "event archive directory missing; treating as empty" }),
    ]);
    expect(parityReport.discrepancies).toEqual([]);
  });

  it("reports latest-attempt and ordering discrepancies with file references", async () => {
    const archiveDir = await copyFixtureArchive();
    await backfillArchiveToSqlite({ archiveDir });

    const connection = openDatabaseConnection({ baseDir: archiveDir });
    connection.db
      .update(attempts)
      .set({ startedAt: "2027-01-01T00:00:00.000Z" })
      .where(eq(attempts.attemptId, "00000000-0000-4000-8000-000000000421"))
      .run();
    closeDatabaseConnection({ baseDir: archiveDir });

    const parityReport = await runParityCheck({ archiveDir });

    expect(parityReport.discrepancies).toEqual([
      expect.objectContaining({
        reference: expect.stringContaining("issue-index.json:"),
        message: expect.stringContaining("issue MT-42 latest attempt mismatch"),
      }),
      expect.objectContaining({
        reference: expect.stringContaining("issue-index.json:"),
        message: expect.stringContaining("issue MT-42 ordering mismatch"),
      }),
    ]);
  });
});
