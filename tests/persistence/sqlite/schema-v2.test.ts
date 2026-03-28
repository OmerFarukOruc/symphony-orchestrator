import { describe, expect, it } from "vitest";

import { openDatabase, closeDatabase } from "../../../src/persistence/sqlite/database.js";

describe("Schema v2 — config tables", () => {
  it("creates all Phase 1 tables on fresh database", () => {
    const db = openDatabase(":memory:");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (db as any).session.client;
      const tables = raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((row: { name: string }) => row.name);

      expect(tables).toContain("config");
      expect(tables).toContain("encrypted_secrets");
      expect(tables).toContain("prompt_templates");
      expect(tables).toContain("config_history");
      expect(tables).toContain("schema_version");
      expect(tables).toContain("attempts");
      expect(tables).toContain("attempt_events");
      expect(tables).toContain("issue_index");
    } finally {
      closeDatabase(db);
    }
  });

  it("seeds schema_version with v2", () => {
    const db = openDatabase(":memory:");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (db as any).session.client;
      const row = raw.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get() as {
        version: number;
      };
      expect(row.version).toBe(2);
    } finally {
      closeDatabase(db);
    }
  });

  it("sets synchronous=NORMAL and busy_timeout=5000", () => {
    const db = openDatabase(":memory:");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (db as any).session.client;
      const synchronous = raw.pragma("synchronous", { simple: true });
      const busyTimeout = raw.pragma("busy_timeout", { simple: true });
      // synchronous=NORMAL is value 1
      expect(synchronous).toBe(1);
      expect(busyTimeout).toBe(5000);
    } finally {
      closeDatabase(db);
    }
  });

  it("creates indexes for config_history", () => {
    const db = openDatabase(":memory:");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (db as any).session.client;
      const indexes = raw
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_config_history%'")
        .all()
        .map((row: { name: string }) => row.name);

      expect(indexes).toContain("idx_config_history_table_key");
      expect(indexes).toContain("idx_config_history_timestamp");
    } finally {
      closeDatabase(db);
    }
  });
});
