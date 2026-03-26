/**
 * Migrates existing JSONL archive data into a SQLite database.
 *
 * Reads `<archiveDir>/attempts/*.json` and `<archiveDir>/events/*.jsonl`
 * files, inserting them into the corresponding SQLite tables. Attempt
 * inserts use ON CONFLICT DO NOTHING (keyed on attempt_id). The caller
 * gates migration behind an emptiness check, making repeated calls safe.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { AttemptEvent, AttemptRecord, SymphonyLogger } from "../../core/types.js";
import type { SymphonyDatabase } from "./database.js";
import { attempts, attemptEvents } from "./schema.js";
import { attemptRecordToRow, attemptEventToRow } from "./mappers.js";

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
  db: SymphonyDatabase,
  archiveDir: string,
  logger: SymphonyLogger,
): Promise<MigrationResult> {
  let attemptCount = 0;
  let eventCount = 0;

  const attemptsDir = path.join(archiveDir, "attempts");
  const eventsDir = path.join(archiveDir, "events");

  const attemptFiles = await safeReaddir(attemptsDir);
  for (const file of attemptFiles) {
    if (!file.endsWith(".json")) continue;

    try {
      const content = await readFile(path.join(attemptsDir, file), "utf8");
      const record = JSON.parse(content) as AttemptRecord;
      const row = attemptRecordToRow(record);
      db.insert(attempts).values(row).onConflictDoNothing().run();
      attemptCount += 1;
    } catch (error) {
      logger.warn({ file, error: String(error) }, "skipped corrupt attempt file during migration");
    }
  }

  const eventFiles = await safeReaddir(eventsDir);
  for (const file of eventFiles) {
    if (!file.endsWith(".jsonl")) continue;

    try {
      const content = await readFile(path.join(eventsDir, file), "utf8");
      const lines = content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        const event = JSON.parse(line) as AttemptEvent;
        const row = attemptEventToRow(event);
        db.insert(attemptEvents).values(row).run();
        eventCount += 1;
      }
    } catch (error) {
      logger.warn({ file, error: String(error) }, "skipped corrupt event file during migration");
    }
  }

  if (attemptCount > 0 || eventCount > 0) {
    logger.info({ attemptCount, eventCount }, "JSONL migration completed");
  }

  return { attemptCount, eventCount };
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
