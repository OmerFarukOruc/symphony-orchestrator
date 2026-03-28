import { describe, expect, it, beforeEach } from "vitest";

import { openDatabase, closeDatabase, type SymphonyDatabase } from "../../src/persistence/sqlite/database.js";
import { PromptTemplateStore } from "../../src/prompt/store.js";
import { createLogger } from "../../src/core/logger.js";

let db: SymphonyDatabase;
let store: PromptTemplateStore;

beforeEach(() => {
  db = openDatabase(":memory:");
  store = new PromptTemplateStore(db, createLogger());
  return () => closeDatabase(db);
});

describe("PromptTemplateStore — CRUD", () => {
  it("creates and retrieves a template", () => {
    const created = store.create({ id: "test", name: "Test", body: "Hello {{ issue.title }}" });
    expect(created.id).toBe("test");
    expect(created.body).toBe("Hello {{ issue.title }}");

    const retrieved = store.get("test");
    expect(retrieved).toMatchObject({ id: "test", name: "Test" });
  });

  it("returns null for nonexistent template", () => {
    expect(store.get("nope")).toBeNull();
  });

  it("lists all templates", () => {
    store.create({ id: "a", name: "Alpha", body: "body a" });
    store.create({ id: "b", name: "Beta", body: "body b" });
    const list = store.list();
    expect(list).toHaveLength(2);
  });

  it("updates a template name and body", () => {
    store.create({ id: "t", name: "Old", body: "old body" });
    const updated = store.update("t", { name: "New", body: "new body" });
    expect(updated).toMatchObject({ name: "New", body: "new body" });

    const retrieved = store.get("t");
    expect(retrieved?.name).toBe("New");
    expect(retrieved?.body).toBe("new body");
  });

  it("update returns null for nonexistent template", () => {
    expect(store.update("nope", { name: "x" })).toBeNull();
  });

  it("removes a template", () => {
    store.create({ id: "t", name: "T", body: "b" });
    expect(store.remove("t")).toEqual({ deleted: true });
    expect(store.get("t")).toBeNull();
  });

  it("remove returns not-deleted for nonexistent template", () => {
    expect(store.remove("nope")).toEqual({ deleted: false });
  });
});

describe("PromptTemplateStore — preview", () => {
  it("renders a template with sample data", async () => {
    store.create({ id: "p", name: "P", body: "Issue: {{ issue.identifier }} - {{ issue.title }}" });
    const result = await store.preview("p");
    expect(result.error).toBeNull();
    expect(result.rendered).toContain("PROJ-42");
    expect(result.rendered).toContain("Example issue for template preview");
  });

  it("returns error for nonexistent template", async () => {
    const result = await store.preview("nope");
    expect(result.error).toContain("not found");
  });

  it("returns error for bad Liquid syntax", async () => {
    store.create({ id: "bad", name: "Bad", body: "{% if %}" });
    const result = await store.preview("bad");
    expect(result.error).toBeTruthy();
  });

  it("renderPreview works with raw body string", async () => {
    const result = await store.renderPreview("Attempt {{ attempt }}");
    expect(result.error).toBeNull();
    expect(result.rendered).toContain("1");
  });
});
