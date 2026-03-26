/**
 * SQLite database lifecycle management.
 *
 * Provides functions to open, configure, and close a SQLite database
 * using `better-sqlite3` for synchronous operations and WAL mode
 * for concurrent read performance.
 */

import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.js";

export type SymphonyDatabase = BetterSQLite3Database<typeof schema>;

/** SQL statements that create the schema tables if they don't exist. */
const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS attempts (
    attempt_id       TEXT PRIMARY KEY,
    issue_id         TEXT NOT NULL,
    issue_identifier TEXT NOT NULL,
    title            TEXT NOT NULL,
    workspace_key    TEXT,
    workspace_path   TEXT,
    status           TEXT NOT NULL CHECK(status IN ('running','completed','failed','timed_out','stalled','cancelled','paused')),
    attempt_number   INTEGER,
    started_at       TEXT NOT NULL,
    ended_at         TEXT,
    model            TEXT NOT NULL,
    reasoning_effort TEXT CHECK(reasoning_effort IS NULL OR reasoning_effort IN ('none','minimal','low','medium','high','xhigh')),
    model_source     TEXT NOT NULL CHECK(model_source IN ('default','override')),
    thread_id        TEXT,
    turn_id          TEXT,
    turn_count       INTEGER NOT NULL DEFAULT 0,
    error_code       TEXT,
    error_message    TEXT,
    input_tokens     INTEGER,
    output_tokens    INTEGER,
    total_tokens     INTEGER,
    pull_request_url TEXT,
    stop_signal      TEXT CHECK(stop_signal IS NULL OR stop_signal IN ('done','blocked'))
  );

  CREATE TABLE IF NOT EXISTS attempt_events (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id       TEXT NOT NULL REFERENCES attempts(attempt_id),
    timestamp        TEXT NOT NULL,
    issue_id         TEXT,
    issue_identifier TEXT,
    session_id       TEXT,
    type             TEXT NOT NULL,
    message          TEXT NOT NULL,
    content          TEXT,
    input_tokens     INTEGER,
    output_tokens    INTEGER,
    total_tokens     INTEGER,
    metadata         TEXT
  );

  CREATE TABLE IF NOT EXISTS issue_index (
    issue_identifier  TEXT PRIMARY KEY,
    issue_id          TEXT NOT NULL,
    latest_attempt_id TEXT REFERENCES attempts(attempt_id),
    latest_status     TEXT,
    attempt_count     INTEGER NOT NULL DEFAULT 0,
    updated_at        TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_attempts_issue_id ON attempts(issue_id);
  CREATE INDEX IF NOT EXISTS idx_attempts_issue_identifier ON attempts(issue_identifier);
  CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts(status);
  CREATE INDEX IF NOT EXISTS idx_attempt_events_attempt_id ON attempt_events(attempt_id);
`;

/**
 * Opens (or creates) a SQLite database at the given path,
 * enables WAL journal mode, and ensures the schema tables exist.
 *
 * @param dbPath - File path for the SQLite database. Use ":memory:" for in-memory databases.
 * @returns A Drizzle ORM database instance with the Symphony schema.
 */
export function openDatabase(dbPath: string): SymphonyDatabase {
  const sqlite = new BetterSqlite3(dbPath);

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(CREATE_TABLES_SQL);

  return drizzle(sqlite, { schema });
}

/**
 * Closes the underlying SQLite connection for a Drizzle database instance.
 *
 * Drizzle wraps the raw `better-sqlite3` handle; this function extracts
 * the session and calls `.close()` on it to release file locks and flush WAL.
 */
export function closeDatabase(db: SymphonyDatabase): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (db as any).session;
  if (session?.client?.close) {
    session.client.close();
  }
}
