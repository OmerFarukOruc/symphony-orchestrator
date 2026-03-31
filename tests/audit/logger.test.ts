import { describe, expect, it, beforeEach } from "vitest";

import { openDatabase, closeDatabase, type RisolutoDatabase } from "../../src/persistence/sqlite/database.js";
import { AuditLogger } from "../../src/audit/logger.js";

let db: RisolutoDatabase;
let audit: AuditLogger;

beforeEach(() => {
  db = openDatabase(":memory:");
  audit = new AuditLogger(db);
  return () => closeDatabase(db);
});

describe("AuditLogger", () => {
  it("logs a config change and retrieves it", () => {
    audit.logConfigChange("tracker", null, '{"kind":"linear"}');
    const entries = audit.query();
    expect(entries).toHaveLength(1);
    expect(entries[0].tableName).toBe("config");
    expect(entries[0].key).toBe("tracker");
    expect(entries[0].operation).toBe("create");
    expect(entries[0].newValue).toBe('{"kind":"linear"}');
  });

  it("logs config update with previous value", () => {
    audit.logConfigChange("server", '{"port":4000}', '{"port":5000}');
    const entries = audit.query();
    expect(entries[0].operation).toBe("update");
    expect(entries[0].previousValue).toBe('{"port":4000}');
    expect(entries[0].newValue).toBe('{"port":5000}');
  });

  it("redacts secret values", () => {
    audit.logSecretChange("API_KEY", "set");
    const entries = audit.query();
    expect(entries[0].previousValue).toBe("[REDACTED]");
    expect(entries[0].newValue).toBe("[REDACTED]");
  });

  it("logs template changes", () => {
    audit.logTemplateChange("default", "update", "old body", "new body");
    const entries = audit.query();
    expect(entries[0].tableName).toBe("prompt_templates");
    expect(entries[0].previousValue).toBe("old body");
    expect(entries[0].newValue).toBe("new body");
  });

  it("filters by tableName", () => {
    audit.logConfigChange("tracker", null, "{}");
    audit.logSecretChange("KEY", "set");
    audit.logTemplateChange("t", "create", null, "body");

    expect(audit.query({ tableName: "config" })).toHaveLength(1);
    expect(audit.query({ tableName: "secrets" })).toHaveLength(1);
    expect(audit.query({ tableName: "prompt_templates" })).toHaveLength(1);
  });

  it("filters by key", () => {
    audit.logConfigChange("tracker", null, "{}");
    audit.logConfigChange("server", null, "{}");

    expect(audit.query({ key: "tracker" })).toHaveLength(1);
  });

  it("paginates with limit and offset", () => {
    for (let index = 0; index < 10; index++) {
      audit.logConfigChange(`key-${index}`, null, "{}");
    }

    const page1 = audit.query({ limit: 3, offset: 0 });
    expect(page1).toHaveLength(3);

    const page2 = audit.query({ limit: 3, offset: 3 });
    expect(page2).toHaveLength(3);

    // Different entries
    expect(page1[0].key).not.toBe(page2[0].key);
  });

  it("count returns total entries", () => {
    audit.logConfigChange("a", null, "{}");
    audit.logConfigChange("b", null, "{}");
    audit.logSecretChange("c", "set");

    expect(audit.count()).toBe(3);
    expect(audit.count({ tableName: "config" })).toBe(2);
    expect(audit.count({ tableName: "secrets" })).toBe(1);
  });

  it("orders entries newest first", () => {
    audit.logConfigChange("first", null, "1");
    audit.logConfigChange("second", null, "2");

    const entries = audit.query();
    // second should come first (newest)
    expect(entries[0].key).toBe("second");
    expect(entries[1].key).toBe("first");
  });

  it("stores path for fine-grained changes", () => {
    audit.log({
      tableName: "config",
      key: "tracker",
      path: "tracker.project_slug",
      operation: "update",
      previousValue: '"OLD"',
      newValue: '"NEW"',
    });

    const entries = audit.query();
    expect(entries[0].path).toBe("tracker.project_slug");
  });
});
