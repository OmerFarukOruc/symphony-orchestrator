import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDatabase, openDatabase, type RisolutoDatabase } from "../../../src/persistence/sqlite/database.js";
import { IssueConfigStore } from "../../../src/persistence/sqlite/issue-config-store.js";

let db: RisolutoDatabase;
let store: IssueConfigStore;

beforeEach(() => {
  db = openDatabase(":memory:");
  store = new IssueConfigStore(db);
});

afterEach(() => {
  closeDatabase(db);
});

describe("IssueConfigStore — loadAll", () => {
  it("returns empty array when table is empty", () => {
    expect(store.loadAll()).toEqual([]);
  });

  it("returns all rows after inserts", () => {
    store.upsertModel("MT-1", "gpt-5", "high");
    store.upsertModel("MT-2", "o3-mini", null);
    const rows = store.loadAll();
    expect(rows).toHaveLength(2);
    const identifiers = rows.map((r) => r.identifier).sort();
    expect(identifiers).toEqual(["MT-1", "MT-2"]);
  });

  it("maps null columns correctly", () => {
    store.upsertModel("MT-1", "gpt-5", null);
    const rows = store.loadAll();
    expect(rows[0].reasoningEffort).toBeNull();
    expect(rows[0].templateId).toBeNull();
  });
});

describe("IssueConfigStore — upsertModel", () => {
  it("inserts a new row with model and reasoningEffort", () => {
    store.upsertModel("MT-10", "claude-opus", "high");
    const rows = store.loadAll();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      identifier: "MT-10",
      model: "claude-opus",
      reasoningEffort: "high",
      templateId: null,
    });
  });

  it("updates model/reasoningEffort on conflict without touching templateId", () => {
    store.upsertTemplateId("MT-10", "tmpl-abc");
    store.upsertModel("MT-10", "gpt-5", "medium");
    const rows = store.loadAll();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      identifier: "MT-10",
      model: "gpt-5",
      reasoningEffort: "medium",
      templateId: "tmpl-abc",
    });
  });

  it("stores null reasoningEffort", () => {
    store.upsertModel("MT-11", "some-model", null);
    const row = store.loadAll().find((r) => r.identifier === "MT-11");
    expect(row?.reasoningEffort).toBeNull();
  });
});

describe("IssueConfigStore — upsertTemplateId", () => {
  it("inserts a new row with templateId", () => {
    store.upsertTemplateId("MT-20", "tmpl-xyz");
    const rows = store.loadAll();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      identifier: "MT-20",
      templateId: "tmpl-xyz",
      model: null,
      reasoningEffort: null,
    });
  });

  it("updates templateId on conflict without touching model columns", () => {
    store.upsertModel("MT-20", "gpt-5", "high");
    store.upsertTemplateId("MT-20", "tmpl-xyz");
    const row = store.loadAll().find((r) => r.identifier === "MT-20");
    expect(row).toMatchObject({
      identifier: "MT-20",
      model: "gpt-5",
      reasoningEffort: "high",
      templateId: "tmpl-xyz",
    });
  });
});

describe("IssueConfigStore — clearTemplateId", () => {
  it("sets templateId to null for an existing row", () => {
    store.upsertTemplateId("MT-30", "tmpl-abc");
    store.clearTemplateId("MT-30");
    const row = store.loadAll().find((r) => r.identifier === "MT-30");
    expect(row?.templateId).toBeNull();
  });

  it("does nothing when the row does not exist", () => {
    expect(() => store.clearTemplateId("MT-NONEXISTENT")).not.toThrow();
    expect(store.loadAll()).toHaveLength(0);
  });

  it("preserves model columns when clearing templateId", () => {
    store.upsertModel("MT-30", "gpt-5", "high");
    store.upsertTemplateId("MT-30", "tmpl-abc");
    store.clearTemplateId("MT-30");
    const row = store.loadAll().find((r) => r.identifier === "MT-30");
    expect(row?.model).toBe("gpt-5");
    expect(row?.reasoningEffort).toBe("high");
    expect(row?.templateId).toBeNull();
  });
});

describe("IssueConfigStore — create factory", () => {
  it("returns a functional store when db is provided", () => {
    const created = IssueConfigStore.create(db);
    created.upsertModel("MT-99", "test-model", null);
    expect(created.loadAll()).toHaveLength(1);
  });

  it("returns a no-op store when db is null", () => {
    const noop = IssueConfigStore.create(null);
    expect(noop.loadAll()).toEqual([]);
    expect(() => noop.upsertModel("MT-1", "gpt-5", null)).not.toThrow();
    expect(() => noop.upsertTemplateId("MT-1", "tmpl")).not.toThrow();
    expect(() => noop.clearTemplateId("MT-1")).not.toThrow();
    expect(noop.loadAll()).toEqual([]);
  });
});
