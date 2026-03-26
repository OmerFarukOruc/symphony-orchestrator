import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.js";

const connectionCache = new Map<string, SqliteConnection>();

function bootstrapSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS attempts (
      attempt_id TEXT PRIMARY KEY NOT NULL,
      issue_id TEXT NOT NULL,
      issue_identifier TEXT NOT NULL,
      title TEXT NOT NULL,
      workspace_key TEXT,
      workspace_path TEXT,
      status TEXT NOT NULL,
      attempt_number INTEGER,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      model TEXT NOT NULL,
      reasoning_effort TEXT,
      model_source TEXT NOT NULL,
      thread_id TEXT,
      turn_id TEXT,
      turn_count INTEGER NOT NULL,
      error_code TEXT,
      error_message TEXT,
      token_usage_input_tokens INTEGER,
      token_usage_output_tokens INTEGER,
      token_usage_total_tokens INTEGER,
      pull_request_url TEXT,
      stop_signal TEXT
    );
    CREATE INDEX IF NOT EXISTS attempts_issue_identifier_idx ON attempts(issue_identifier);
    CREATE INDEX IF NOT EXISTS attempts_status_idx ON attempts(status);
    CREATE INDEX IF NOT EXISTS attempts_started_at_idx ON attempts(started_at);

    CREATE TABLE IF NOT EXISTS events (
      row_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      attempt_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      at TEXT NOT NULL,
      issue_id TEXT,
      issue_identifier TEXT,
      session_id TEXT,
      event TEXT NOT NULL,
      message TEXT NOT NULL,
      content TEXT,
      metadata_json TEXT,
      usage_input_tokens INTEGER,
      usage_output_tokens INTEGER,
      usage_total_tokens INTEGER,
      rate_limits_json TEXT,
      FOREIGN KEY (attempt_id) REFERENCES attempts(attempt_id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS events_attempt_sequence_idx ON events(attempt_id, sequence);
    CREATE INDEX IF NOT EXISTS events_attempt_at_idx ON events(attempt_id, at);

    CREATE TABLE IF NOT EXISTS config_overlays (
      path TEXT PRIMARY KEY NOT NULL,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS config_overlays_updated_at_idx ON config_overlays(updated_at);

    CREATE TABLE IF NOT EXISTS secrets (
      key TEXT PRIMARY KEY NOT NULL,
      algorithm TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS secrets_updated_at_idx ON secrets(updated_at);

    CREATE TABLE IF NOT EXISTS secret_audit_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      at TEXT NOT NULL,
      operation TEXT NOT NULL,
      key TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS secret_audit_rows_at_idx ON secret_audit_rows(at);
  `);
}

function applyPragmas(database: Database.Database): void {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
}

export interface SqliteConnection {
  readonly path: string;
  readonly sqlite: Database.Database;
  readonly db: BetterSQLite3Database<typeof schema>;
}

export function resolveDatabasePath(baseDir: string, explicitPath?: string | null): string {
  const configuredPath = explicitPath ?? process.env.DB_PATH;
  if (configuredPath) {
    return path.resolve(configuredPath);
  }
  return path.resolve(baseDir, "symphony.db");
}

export function openDatabaseConnection(options: { baseDir: string; dbPath?: string | null }): SqliteConnection {
  const resolvedPath = resolveDatabasePath(options.baseDir, options.dbPath);
  const existing = connectionCache.get(resolvedPath);
  if (existing) {
    return existing;
  }

  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const sqlite = new Database(resolvedPath);
  applyPragmas(sqlite);
  bootstrapSchema(sqlite);

  const connection: SqliteConnection = {
    path: resolvedPath,
    sqlite,
    db: drizzle(sqlite, { schema }),
  };
  connectionCache.set(resolvedPath, connection);
  return connection;
}

export function closeDatabaseConnection(options: { baseDir: string; dbPath?: string | null }): void {
  const resolvedPath = resolveDatabasePath(options.baseDir, options.dbPath);
  const existing = connectionCache.get(resolvedPath);
  if (!existing) {
    return;
  }
  existing.sqlite.close();
  connectionCache.delete(resolvedPath);
}
