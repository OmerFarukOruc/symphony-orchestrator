import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.js";

function applySchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS attempt_rows (
      attempt_id TEXT PRIMARY KEY,
      issue_identifier TEXT NOT NULL,
      started_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attempt_event_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS attempt_event_position_idx
      ON attempt_event_rows(attempt_id, position);
    CREATE TABLE IF NOT EXISTS config_overlay_rows (
      id INTEGER PRIMARY KEY,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS secret_state_rows (
      id INTEGER PRIMARY KEY,
      envelope TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS secret_audit_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      operation TEXT NOT NULL,
      key TEXT NOT NULL
    );
  `);
}

export interface SymphonyDatabase {
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
}

const connectionCache = new Map<string, SymphonyDatabase>();

export function openSymphonyDatabase(baseDir: string): SymphonyDatabase {
  mkdirSync(baseDir, { recursive: true });
  const dbPath = path.join(baseDir, "symphony.db");
  const existing = connectionCache.get(dbPath);
  if (existing) {
    return existing;
  }
  const sqlite = new Database(dbPath);
  applySchema(sqlite);
  const instance: SymphonyDatabase = {
    sqlite,
    db: drizzle(sqlite, { schema }),
  };
  connectionCache.set(dbPath, instance);
  return instance;
}

export function closeSymphonyDatabase(baseDir: string): void {
  const dbPath = path.join(baseDir, "symphony.db");
  const instance = connectionCache.get(dbPath);
  if (instance) {
    instance.sqlite.close();
    connectionCache.delete(dbPath);
  }
}
