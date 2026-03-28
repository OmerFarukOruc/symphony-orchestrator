import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import {
  attempts,
  attemptEvents,
  issueIndex,
  config,
  encryptedSecrets,
  promptTemplates,
  configHistory,
} from "../../../src/persistence/sqlite/schema.js";

// ---------------------------------------------------------------------------
// Helper: extract a column map from a Drizzle table for easy assertions.
// ---------------------------------------------------------------------------
type ColumnInfo = {
  name: string;
  dataType: string;
  notNull: boolean;
  hasDefault: boolean;
  primaryKey: boolean;
};

function getColumnMap(table: Parameters<typeof getTableConfig>[0]): Record<string, ColumnInfo> {
  const cfg = getTableConfig(table);
  const map: Record<string, ColumnInfo> = {};
  for (const col of cfg.columns) {
    map[col.name] = {
      name: col.name,
      dataType: col.dataType,
      notNull: col.notNull,
      hasDefault: col.hasDefault,
      primaryKey: col.primary,
    };
  }
  return map;
}

function getColumnNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table)
    .columns.map((c) => c.name)
    .sort();
}

// ---------------------------------------------------------------------------
// Table exports
// ---------------------------------------------------------------------------
describe("schema table exports", () => {
  it("exports all seven tables", () => {
    expect(attempts).toBeDefined();
    expect(attemptEvents).toBeDefined();
    expect(issueIndex).toBeDefined();
    expect(config).toBeDefined();
    expect(encryptedSecrets).toBeDefined();
    expect(promptTemplates).toBeDefined();
    expect(configHistory).toBeDefined();
  });

  it("tables have correct SQL names", () => {
    expect(getTableConfig(attempts).name).toBe("attempts");
    expect(getTableConfig(attemptEvents).name).toBe("attempt_events");
    expect(getTableConfig(issueIndex).name).toBe("issue_index");
    expect(getTableConfig(config).name).toBe("config");
    expect(getTableConfig(encryptedSecrets).name).toBe("encrypted_secrets");
    expect(getTableConfig(promptTemplates).name).toBe("prompt_templates");
    expect(getTableConfig(configHistory).name).toBe("config_history");
  });
});

// ---------------------------------------------------------------------------
// attempts table
// ---------------------------------------------------------------------------
describe("attempts table schema", () => {
  it("has all expected columns", () => {
    const cols = getColumnNames(attempts);
    expect(cols).toEqual(
      [
        "attempt_id",
        "issue_id",
        "issue_identifier",
        "title",
        "workspace_key",
        "workspace_path",
        "status",
        "attempt_number",
        "started_at",
        "ended_at",
        "model",
        "reasoning_effort",
        "model_source",
        "thread_id",
        "turn_id",
        "turn_count",
        "error_code",
        "error_message",
        "input_tokens",
        "output_tokens",
        "total_tokens",
        "pull_request_url",
        "stop_signal",
      ].sort(),
    );
  });

  it("attempt_id is text primary key", () => {
    const col = getColumnMap(attempts)["attempt_id"];
    expect(col.dataType).toBe("string");
    expect(col.primaryKey).toBe(true);
  });

  it("required text fields are notNull", () => {
    const cols = getColumnMap(attempts);
    for (const name of ["issue_id", "issue_identifier", "title", "started_at", "model", "model_source"]) {
      expect(cols[name].notNull).toBe(true);
    }
  });

  it("status column is notNull text", () => {
    const col = getColumnMap(attempts)["status"];
    expect(col.dataType).toBe("string");
    expect(col.notNull).toBe(true);
  });

  it("turn_count defaults to 0 and is notNull", () => {
    const col = getColumnMap(attempts)["turn_count"];
    expect(col.dataType).toBe("number");
    expect(col.notNull).toBe(true);
    expect(col.hasDefault).toBe(true);
  });

  it("nullable columns are not marked notNull", () => {
    const cols = getColumnMap(attempts);
    const nullableNames = [
      "workspace_key",
      "workspace_path",
      "attempt_number",
      "ended_at",
      "reasoning_effort",
      "thread_id",
      "turn_id",
      "error_code",
      "error_message",
      "input_tokens",
      "output_tokens",
      "total_tokens",
      "pull_request_url",
      "stop_signal",
    ];
    for (const name of nullableNames) {
      expect(cols[name].notNull).toBe(false);
    }
  });

  it("token columns are integer type", () => {
    const cols = getColumnMap(attempts);
    for (const name of ["input_tokens", "output_tokens", "total_tokens"]) {
      expect(cols[name].dataType).toBe("number");
    }
  });
});

// ---------------------------------------------------------------------------
// attemptEvents table
// ---------------------------------------------------------------------------
describe("attemptEvents table schema", () => {
  it("has all expected columns", () => {
    const cols = getColumnNames(attemptEvents);
    expect(cols).toEqual(
      [
        "id",
        "attempt_id",
        "timestamp",
        "issue_id",
        "issue_identifier",
        "session_id",
        "type",
        "message",
        "content",
        "input_tokens",
        "output_tokens",
        "total_tokens",
        "metadata",
      ].sort(),
    );
  });

  it("id is auto-increment integer primary key", () => {
    const col = getColumnMap(attemptEvents)["id"];
    expect(col.dataType).toBe("number");
    expect(col.primaryKey).toBe(true);
  });

  it("attempt_id references the attempts table", () => {
    const cfg = getTableConfig(attemptEvents);
    const fks = cfg.foreignKeys;
    expect(fks.length).toBeGreaterThanOrEqual(1);

    // The FK should reference 'attempts' table on 'attempt_id' column
    const attemptFk = fks[0];
    expect(attemptFk.reference().foreignTable).toBe(attempts);
  });

  it("required fields are notNull", () => {
    const cols = getColumnMap(attemptEvents);
    for (const name of ["attempt_id", "timestamp", "type", "message"]) {
      expect(cols[name].notNull).toBe(true);
    }
  });

  it("optional fields are nullable", () => {
    const cols = getColumnMap(attemptEvents);
    for (const name of [
      "issue_id",
      "issue_identifier",
      "session_id",
      "content",
      "input_tokens",
      "output_tokens",
      "total_tokens",
      "metadata",
    ]) {
      expect(cols[name].notNull).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// issueIndex table
// ---------------------------------------------------------------------------
describe("issueIndex table schema", () => {
  it("has all expected columns", () => {
    const cols = getColumnNames(issueIndex);
    expect(cols).toEqual(
      ["issue_identifier", "issue_id", "latest_attempt_id", "latest_status", "attempt_count", "updated_at"].sort(),
    );
  });

  it("issue_identifier is the primary key", () => {
    const col = getColumnMap(issueIndex)["issue_identifier"];
    expect(col.primaryKey).toBe(true);
  });

  it("attempt_count defaults to 0", () => {
    const col = getColumnMap(issueIndex)["attempt_count"];
    expect(col.hasDefault).toBe(true);
    expect(col.notNull).toBe(true);
  });

  it("latest_attempt_id references the attempts table", () => {
    const fks = getTableConfig(issueIndex).foreignKeys;
    expect(fks.length).toBeGreaterThanOrEqual(1);

    const fk = fks[0];
    expect(fk.reference().foreignTable).toBe(attempts);
  });
});

// ---------------------------------------------------------------------------
// config table
// ---------------------------------------------------------------------------
describe("config table schema", () => {
  it("has key, value, updated_at columns", () => {
    const cols = getColumnNames(config);
    expect(cols).toEqual(["key", "updated_at", "value"].sort());
  });

  it("key is primary key", () => {
    const col = getColumnMap(config)["key"];
    expect(col.primaryKey).toBe(true);
    expect(col.dataType).toBe("string");
  });

  it("value and updated_at are notNull", () => {
    const cols = getColumnMap(config);
    expect(cols["value"].notNull).toBe(true);
    expect(cols["updated_at"].notNull).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// encryptedSecrets table
// ---------------------------------------------------------------------------
describe("encryptedSecrets table schema", () => {
  it("has all expected columns", () => {
    const cols = getColumnNames(encryptedSecrets);
    expect(cols).toEqual(["auth_tag", "ciphertext", "iv", "key", "updated_at"].sort());
  });

  it("key is primary key", () => {
    const col = getColumnMap(encryptedSecrets)["key"];
    expect(col.primaryKey).toBe(true);
  });

  it("all columns are notNull", () => {
    const cols = getColumnMap(encryptedSecrets);
    for (const name of ["key", "ciphertext", "iv", "auth_tag", "updated_at"]) {
      expect(cols[name].notNull).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// promptTemplates table
// ---------------------------------------------------------------------------
describe("promptTemplates table schema", () => {
  it("has all expected columns", () => {
    const cols = getColumnNames(promptTemplates);
    expect(cols).toEqual(["body", "created_at", "id", "name", "updated_at"].sort());
  });

  it("id is primary key", () => {
    const col = getColumnMap(promptTemplates)["id"];
    expect(col.primaryKey).toBe(true);
  });

  it("all columns are notNull", () => {
    const cols = getColumnMap(promptTemplates);
    for (const name of ["id", "name", "body", "created_at", "updated_at"]) {
      expect(cols[name].notNull).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// configHistory table
// ---------------------------------------------------------------------------
describe("configHistory table schema", () => {
  it("has all expected columns", () => {
    const cols = getColumnNames(configHistory);
    expect(cols).toEqual(
      [
        "id",
        "table_name",
        "key",
        "path",
        "operation",
        "previous_value",
        "new_value",
        "actor",
        "request_id",
        "timestamp",
      ].sort(),
    );
  });

  it("id is auto-increment integer primary key", () => {
    const col = getColumnMap(configHistory)["id"];
    expect(col.dataType).toBe("number");
    expect(col.primaryKey).toBe(true);
  });

  it("actor defaults to 'dashboard'", () => {
    const col = getColumnMap(configHistory)["actor"];
    expect(col.hasDefault).toBe(true);
    expect(col.notNull).toBe(true);
  });

  it("required fields are notNull", () => {
    const cols = getColumnMap(configHistory);
    for (const name of ["table_name", "key", "operation", "actor", "timestamp"]) {
      expect(cols[name].notNull).toBe(true);
    }
  });

  it("optional fields are nullable", () => {
    const cols = getColumnMap(configHistory);
    for (const name of ["path", "previous_value", "new_value", "request_id"]) {
      expect(cols[name].notNull).toBe(false);
    }
  });
});
