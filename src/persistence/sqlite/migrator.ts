/**
 * Migrates existing JSONL archive data into a SQLite database.
 *
 * ## Migration path: JSONL → SQLite
 *
 * Risoluto previously stored each attempt as a JSON file under
 * `<archiveDir>/attempts/<attemptId>.json` and its events as JSONL lines
 * under `<archiveDir>/events/<attemptId>.jsonl`. SQLite is now the default
 * and primary persistence backend.
 *
 * ### How migration works
 *
 * `initPersistenceRuntime` calls this function on first boot when the
 * `attempts` table is empty. It reads the JSON/JSONL archive files and
 * inserts them into the SQLite schema. Attempt inserts use
 * `ON CONFLICT DO NOTHING` keyed on `attempt_id`, so the migration is
 * **idempotent** — safe to call multiple times without duplicating records.
 *
 * ### Operator steps to migrate
 *
 * 1. Stop the running Risoluto service.
 * 2. Ensure `RISOLUTO_PERSISTENCE` is unset (or set to `sqlite`).
 * 3. Restart — migration runs automatically on first boot.
 * 4. Verify data in the dashboard, then optionally archive the legacy
 *    `attempts/` and `events/` directories.
 *
 * ### Idempotency guarantees
 *
 * - Attempt records: `ON CONFLICT DO NOTHING` on `attempt_id` — re-running
 *   migration never overwrites an existing row.
 * - Event records: events are appended without deduplication; callers must
 *   ensure `migrateFromJsonl` is only called when the `attempts` table is
 *   empty (which `initPersistenceRuntime` already enforces).
 * - Corrupt or missing archive files are skipped with a warning; they do
 *   not abort the migration.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { AttemptEvent, AttemptRecord, RisolutoLogger } from "../../core/types.js";
import type { RisolutoDatabase } from "./database.js";
import { attempts, attemptEvents } from "./schema.js";
import { attemptRecordToRow, attemptEventToRow } from "./mappers.js";
import { toErrorString } from "../../utils/type-guards.js";

export interface MigrationResult {
  attemptCount: number;
  eventCount: number;
}

/**
 * Migrate JSON/JSONL archive files into the SQLite database.
 *
 * @returns Count of migrated attempt records and events.
 */
export async function migrateFromJsonl(
  db: RisolutoDatabase,
  archiveDir: string,
  logger: RisolutoLogger,
): Promise<MigrationResult> {
  const attemptsDir = path.join(archiveDir, "attempts");
  const eventsDir = path.join(archiveDir, "events");

  const attemptFiles = await safeReaddir(attemptsDir);
  const eventFiles = await safeReaddir(eventsDir);

  const { ac: attemptCount, ec: eventCount } = await loadArchiveFiles(
    db,
    attemptsDir,
    attemptFiles,
    eventsDir,
    eventFiles,
    logger,
  );

  if (attemptCount > 0 || eventCount > 0) {
    logger.info({ attemptCount, eventCount }, "JSONL migration completed");
  }

  return { attemptCount, eventCount };
}

async function loadArchiveFiles(
  db: RisolutoDatabase,
  attemptsDir: string,
  attemptFiles: string[],
  eventsDir: string,
  eventFiles: string[],
  logger: RisolutoLogger,
): Promise<{ ac: number; ec: number }> {
  let ac = 0;
  let ec = 0;

  for (const file of attemptFiles) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = await readFile(path.join(attemptsDir, file), "utf8");
      const record = JSON.parse(content) as AttemptRecord;
      db.insert(attempts).values(attemptRecordToRow(record)).onConflictDoNothing().run();
      ac += 1;
    } catch (error) {
      logger.warn({ file, error: toErrorString(error) }, "skipped corrupt attempt file during migration");
    }
  }

  for (const file of eventFiles) {
    if (!file.endsWith(".jsonl")) continue;
    try {
      const content = await readFile(path.join(eventsDir, file), "utf8");
      for (const line of content
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)) {
        const event = JSON.parse(line) as AttemptEvent;
        db.insert(attemptEvents).values(attemptEventToRow(event)).run();
        ec += 1;
      }
    } catch (error) {
      logger.warn({ file, error: toErrorString(error) }, "skipped corrupt event file during migration");
    }
  }

  return { ac, ec };
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
