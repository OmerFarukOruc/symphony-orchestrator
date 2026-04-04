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

export type RisolutoDatabase = BetterSQLite3Database<typeof schema>;

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
    stop_signal      TEXT CHECK(stop_signal IS NULL OR stop_signal IN ('done','blocked')),
    summary          TEXT
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

  CREATE TABLE IF NOT EXISTS config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS encrypted_secrets (
    key        TEXT PRIMARY KEY,
    ciphertext TEXT NOT NULL,
    iv         TEXT NOT NULL,
    auth_tag   TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prompt_templates (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS config_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name      TEXT NOT NULL,
    key             TEXT NOT NULL,
    path            TEXT,
    operation       TEXT NOT NULL,
    previous_value  TEXT,
    new_value       TEXT,
    actor           TEXT NOT NULL DEFAULT 'dashboard',
    request_id      TEXT,
    timestamp       TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_config_history_table_key ON config_history(table_name, key);
  CREATE INDEX IF NOT EXISTS idx_config_history_timestamp ON config_history(timestamp);

  CREATE TABLE IF NOT EXISTS issue_config (
    identifier        TEXT PRIMARY KEY,
    model             TEXT,
    reasoning_effort  TEXT CHECK(reasoning_effort IS NULL OR reasoning_effort IN ('none','minimal','low','medium','high','xhigh')),
    template_id       TEXT
  );

  CREATE TABLE IF NOT EXISTS webhook_inbox (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_id       TEXT NOT NULL UNIQUE,
    received_at       TEXT NOT NULL,
    type              TEXT NOT NULL,
    action            TEXT NOT NULL,
    entity_id         TEXT,
    issue_id          TEXT,
    issue_identifier  TEXT,
    webhook_timestamp INTEGER,
    payload_json      TEXT,
    status            TEXT NOT NULL DEFAULT 'received'
                      CHECK(status IN ('received','processing','applied','ignored','retry','dead_letter')),
    attempt_count     INTEGER NOT NULL DEFAULT 0,
    next_attempt_at   TEXT,
    last_error        TEXT,
    applied_at        TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_webhook_inbox_status ON webhook_inbox(status);
  CREATE INDEX IF NOT EXISTS idx_webhook_inbox_issue_id ON webhook_inbox(issue_id);
  CREATE INDEX IF NOT EXISTS idx_webhook_inbox_next_attempt ON webhook_inbox(next_attempt_at);

  CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attempt_checkpoints (
    checkpoint_id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id    TEXT NOT NULL,
    ordinal       INTEGER NOT NULL,
    trigger       TEXT NOT NULL,
    event_cursor  INTEGER,
    status        TEXT NOT NULL,
    thread_id     TEXT,
    turn_id       TEXT,
    turn_count    INTEGER NOT NULL DEFAULT 0,
    input_tokens  INTEGER,
    output_tokens INTEGER,
    total_tokens  INTEGER,
    metadata      TEXT,
    created_at    TEXT NOT NULL,
    UNIQUE(attempt_id, ordinal)
  );

  CREATE INDEX IF NOT EXISTS idx_attempt_checkpoints_attempt_id ON attempt_checkpoints(attempt_id);

  CREATE TABLE IF NOT EXISTS pull_requests (
    pr_id            TEXT PRIMARY KEY,
    attempt_id       TEXT,
    issue_id         TEXT NOT NULL,
    owner            TEXT NOT NULL,
    repo             TEXT NOT NULL,
    pull_number      INTEGER NOT NULL,
    url              TEXT NOT NULL UNIQUE,
    branch_name      TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'open',
    merged_at        TEXT,
    merge_commit_sha TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_pull_requests_status ON pull_requests(status);
  CREATE INDEX IF NOT EXISTS idx_pull_requests_issue_id ON pull_requests(issue_id);

  CREATE TABLE IF NOT EXISTS notifications (
    id               TEXT PRIMARY KEY,
    type             TEXT NOT NULL,
    severity         TEXT NOT NULL CHECK(severity IN ('info','warning','critical')),
    title            TEXT NOT NULL,
    message          TEXT NOT NULL,
    source           TEXT,
    href             TEXT,
    read             INTEGER NOT NULL DEFAULT 0,
    dedupe_key       TEXT,
    metadata         TEXT,
    delivery_summary TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
  CREATE INDEX IF NOT EXISTS idx_notifications_read_created_at ON notifications(read, created_at);

  CREATE TABLE IF NOT EXISTS automation_runs (
    id               TEXT PRIMARY KEY,
    automation_name  TEXT NOT NULL,
    mode             TEXT NOT NULL CHECK(mode IN ('implement','report','findings')),
    trigger          TEXT NOT NULL CHECK(trigger IN ('schedule','manual')),
    repo_url         TEXT,
    status           TEXT NOT NULL CHECK(status IN ('running','completed','failed','skipped')),
    output           TEXT,
    details          TEXT,
    issue_id         TEXT,
    issue_identifier TEXT,
    issue_url        TEXT,
    error            TEXT,
    started_at       TEXT NOT NULL,
    finished_at      TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_automation_runs_started_at ON automation_runs(started_at);
  CREATE INDEX IF NOT EXISTS idx_automation_runs_name_started_at ON automation_runs(automation_name, started_at);

  CREATE TABLE IF NOT EXISTS alert_history (
    id                 TEXT PRIMARY KEY,
    rule_name          TEXT NOT NULL,
    event_type         TEXT NOT NULL,
    severity           TEXT NOT NULL CHECK(severity IN ('info','warning','critical')),
    status             TEXT NOT NULL CHECK(status IN ('delivered','suppressed','partial_failure','failed')),
    channels           TEXT NOT NULL,
    delivered_channels TEXT NOT NULL,
    failed_channels    TEXT NOT NULL,
    message            TEXT NOT NULL,
    created_at         TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_alert_history_created_at ON alert_history(created_at);
  CREATE INDEX IF NOT EXISTS idx_alert_history_rule_created_at ON alert_history(rule_name, created_at);
`;

type SqliteDb = InstanceType<typeof BetterSqlite3>;

/** Idempotent: bump schema_version to `version` if not already at or past it. */
function bumpSchemaVersion(sqlite: SqliteDb, version: number): void {
  sqlite
    .prepare("INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)")
    .run(version, new Date().toISOString());
}

/** Check whether a specific schema version row exists. */
function hasSchemaVersion(sqlite: SqliteDb, version: number): boolean {
  const row = sqlite.prepare("SELECT version FROM schema_version WHERE version = ?").get(version) as
    | { version: number }
    | undefined;
  return row !== undefined;
}

/**
 * v4 migration: add `summary` column to `attempts` table.
 * Fresh installs already have the column from CREATE_TABLES_SQL.
 * Existing databases need ALTER TABLE; try/catch suppresses the duplicate-column error.
 */
function applyV4Migration(sqlite: SqliteDb): void {
  if (hasSchemaVersion(sqlite, 4)) return;
  try {
    sqlite.exec("ALTER TABLE attempts ADD COLUMN summary TEXT");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("duplicate column name: summary")) throw err;
  }
  bumpSchemaVersion(sqlite, 4);
}

/**
 * v5 migration: add `attempt_checkpoints` table.
 * Fresh installs already have the table from CREATE_TABLES_SQL.
 * Existing databases need the table created; try/catch suppresses "already exists".
 */
function applyV5Migration(sqlite: SqliteDb): void {
  if (hasSchemaVersion(sqlite, 5)) return;
  try {
    sqlite.exec(`
      CREATE TABLE attempt_checkpoints (
        checkpoint_id INTEGER PRIMARY KEY AUTOINCREMENT,
        attempt_id    TEXT NOT NULL,
        ordinal       INTEGER NOT NULL,
        trigger       TEXT NOT NULL,
        event_cursor  INTEGER,
        status        TEXT NOT NULL,
        thread_id     TEXT,
        turn_id       TEXT,
        turn_count    INTEGER NOT NULL DEFAULT 0,
        input_tokens  INTEGER,
        output_tokens INTEGER,
        total_tokens  INTEGER,
        metadata      TEXT,
        created_at    TEXT NOT NULL,
        UNIQUE(attempt_id, ordinal)
      )
    `);
    sqlite.exec("CREATE INDEX idx_attempt_checkpoints_attempt_id ON attempt_checkpoints(attempt_id)");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("already exists")) throw err;
  }
  bumpSchemaVersion(sqlite, 5);
}

/**
 * v6 migration: normalize `pull_requests` to the finalized PR record shape.
 */
function applyV6Migration(sqlite: SqliteDb): void {
  if (hasSchemaVersion(sqlite, 6)) return;

  const existingColumns = sqlite.prepare("SELECT name FROM pragma_table_info('pull_requests')").all() as Array<{
    name: string;
  }>;
  const hasTable = existingColumns.length > 0;
  const hasCanonicalShape =
    hasTable &&
    existingColumns.some((column) => column.name === "pr_id") &&
    existingColumns.some((column) => column.name === "pull_number");

  if (!hasTable) {
    sqlite.exec(`
      CREATE TABLE pull_requests (
        pr_id            TEXT PRIMARY KEY,
        attempt_id       TEXT,
        issue_id         TEXT NOT NULL,
        owner            TEXT NOT NULL,
        repo             TEXT NOT NULL,
        pull_number      INTEGER NOT NULL,
        url              TEXT NOT NULL UNIQUE,
        branch_name      TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'open',
        merged_at        TEXT,
        merge_commit_sha TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      )
    `);
  } else if (!hasCanonicalShape) {
    sqlite.exec(`
      CREATE TABLE pull_requests_v2 (
        pr_id            TEXT PRIMARY KEY,
        attempt_id       TEXT,
        issue_id         TEXT NOT NULL,
        owner            TEXT NOT NULL,
        repo             TEXT NOT NULL,
        pull_number      INTEGER NOT NULL,
        url              TEXT NOT NULL UNIQUE,
        branch_name      TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'open',
        merged_at        TEXT,
        merge_commit_sha TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      )
    `);
    sqlite.exec(`
      INSERT INTO pull_requests_v2 (
        pr_id,
        attempt_id,
        issue_id,
        owner,
        repo,
        pull_number,
        url,
        branch_name,
        status,
        merged_at,
        merge_commit_sha,
        created_at,
        updated_at
      )
      SELECT
        CASE
          WHEN instr(repo, '/') > 0 THEN repo || '#' || number
          ELSE 'unknown/' || repo || '#' || number
        END,
        attempt_id,
        issue_id,
        CASE
          WHEN instr(repo, '/') > 0 THEN substr(repo, 1, instr(repo, '/') - 1)
          ELSE owner
        END,
        CASE
          WHEN instr(repo, '/') > 0 THEN substr(repo, instr(repo, '/') + 1)
          ELSE repo
        END,
        number,
        url,
        branch_name,
        status,
        merged_at,
        merge_commit_sha,
        created_at,
        updated_at
      FROM pull_requests
    `);
    sqlite.exec("DROP TABLE pull_requests");
    sqlite.exec("ALTER TABLE pull_requests_v2 RENAME TO pull_requests");
  }
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_pull_requests_status ON pull_requests(status)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_pull_requests_issue_id ON pull_requests(issue_id)");
  bumpSchemaVersion(sqlite, 6);
}

/**
 * v7 migration: add durable notifications table.
 */
function applyV7Migration(sqlite: SqliteDb): void {
  if (hasSchemaVersion(sqlite, 7)) return;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id               TEXT PRIMARY KEY,
      type             TEXT NOT NULL,
      severity         TEXT NOT NULL CHECK(severity IN ('info','warning','critical')),
      title            TEXT NOT NULL,
      message          TEXT NOT NULL,
      source           TEXT,
      href             TEXT,
      read             INTEGER NOT NULL DEFAULT 0,
      dedupe_key       TEXT,
      metadata         TEXT,
      delivery_summary TEXT,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    )
  `);
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_notifications_read_created_at ON notifications(read, created_at)");
  bumpSchemaVersion(sqlite, 7);
}

/**
 * v8 migration: add automation run history and alert history tables.
 */
function applyV8Migration(sqlite: SqliteDb): void {
  if (hasSchemaVersion(sqlite, 8)) return;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS automation_runs (
      id               TEXT PRIMARY KEY,
      automation_name  TEXT NOT NULL,
      mode             TEXT NOT NULL CHECK(mode IN ('implement','report','findings')),
      trigger          TEXT NOT NULL CHECK(trigger IN ('schedule','manual')),
      repo_url         TEXT,
      status           TEXT NOT NULL CHECK(status IN ('running','completed','failed','skipped')),
      output           TEXT,
      details          TEXT,
      issue_id         TEXT,
      issue_identifier TEXT,
      issue_url        TEXT,
      error            TEXT,
      started_at       TEXT NOT NULL,
      finished_at      TEXT
    )
  `);
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_automation_runs_started_at ON automation_runs(started_at)");
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_automation_runs_name_started_at ON automation_runs(automation_name, started_at)",
  );
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS alert_history (
      id                 TEXT PRIMARY KEY,
      rule_name          TEXT NOT NULL,
      event_type         TEXT NOT NULL,
      severity           TEXT NOT NULL CHECK(severity IN ('info','warning','critical')),
      status             TEXT NOT NULL CHECK(status IN ('delivered','suppressed','partial_failure','failed')),
      channels           TEXT NOT NULL,
      delivered_channels TEXT NOT NULL,
      failed_channels    TEXT NOT NULL,
      message            TEXT NOT NULL,
      created_at         TEXT NOT NULL
    )
  `);
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_alert_history_created_at ON alert_history(created_at)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_alert_history_rule_created_at ON alert_history(rule_name, created_at)");
  bumpSchemaVersion(sqlite, 8);
}

/**
 * Opens (or creates) a SQLite database at the given path,
 * enables WAL journal mode, and ensures the schema tables exist.
 *
 * @param dbPath - File path for the SQLite database. Use ":memory:" for in-memory databases.
 * @returns A Drizzle ORM database instance with the Risoluto schema.
 */
export function openDatabase(dbPath: string): RisolutoDatabase {
  const sqlite = new BetterSqlite3(dbPath);

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("busy_timeout = 5000");

  sqlite.exec(CREATE_TABLES_SQL);

  // Seed schema version if not present (v3 = Phase 1 config tables).
  const versionRow = sqlite.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get() as
    | { version: number }
    | undefined;
  if (!versionRow || versionRow.version < 3) {
    bumpSchemaVersion(sqlite, 3);
  }

  applyV4Migration(sqlite);
  applyV5Migration(sqlite);
  applyV6Migration(sqlite);
  applyV7Migration(sqlite);
  applyV8Migration(sqlite);

  return drizzle(sqlite, { schema });
}

/**
 * Closes the underlying SQLite connection for a Drizzle database instance.
 *
 * Drizzle wraps the raw `better-sqlite3` handle; this function extracts
 * the session and calls `.close()` on it to release file locks and flush WAL.
 */
export function closeDatabase(db: RisolutoDatabase): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (db as any).session;
  if (session?.client?.close) {
    session.client.close();
  }
}
