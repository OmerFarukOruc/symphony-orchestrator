import { describe, expect, it } from "vitest";

import { createAuditState, matchesFilters } from "../../frontend/src/views/audit-state";
import type { AuditMutationEvent } from "../../frontend/src/views/audit-state";

describe("AuditState", () => {
  it("creates default state with empty values", () => {
    const state = createAuditState();
    expect(state.entries).toEqual([]);
    expect(state.total).toBe(0);
    expect(state.page).toBe(0);
    expect(state.pageSize).toBe(50);
    expect(state.liveCount).toBe(0);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("creates default filters", () => {
    const state = createAuditState();
    expect(state.filters).toEqual({
      tableName: "",
      key: "",
      from: "",
      to: "",
    });
  });

  it("tracks expanded rows with Set", () => {
    const state = createAuditState();
    state.expandedRows.add(1);
    state.expandedRows.add(5);
    expect(state.expandedRows.has(1)).toBe(true);
    expect(state.expandedRows.has(5)).toBe(true);
    expect(state.expandedRows.has(3)).toBe(false);
    state.expandedRows.delete(1);
    expect(state.expandedRows.has(1)).toBe(false);
  });

  it("increments live count", () => {
    const state = createAuditState();
    state.liveCount++;
    state.liveCount++;
    expect(state.liveCount).toBe(2);
  });
});

describe("matchesFilters", () => {
  const baseEvent: AuditMutationEvent = {
    tableName: "config",
    key: "codex.model",
    path: null,
    operation: "update",
    actor: "dashboard",
    timestamp: "2026-03-28T12:00:00Z",
  };

  it("matches when no filters are set", () => {
    expect(matchesFilters(baseEvent, { tableName: "", key: "", from: "", to: "" })).toBe(true);
  });

  it("matches when tableName filter matches", () => {
    expect(matchesFilters(baseEvent, { tableName: "config", key: "", from: "", to: "" })).toBe(true);
  });

  it("rejects when tableName filter does not match", () => {
    expect(matchesFilters(baseEvent, { tableName: "secrets", key: "", from: "", to: "" })).toBe(false);
  });

  it("matches when key filter matches exactly", () => {
    expect(matchesFilters(baseEvent, { tableName: "", key: "codex.model", from: "", to: "" })).toBe(true);
  });

  it("rejects when key filter is only a substring (exact match required)", () => {
    expect(matchesFilters(baseEvent, { tableName: "", key: "codex", from: "", to: "" })).toBe(false);
  });

  it("rejects when key filter does not match", () => {
    expect(matchesFilters(baseEvent, { tableName: "", key: "tracker", from: "", to: "" })).toBe(false);
  });

  it("applies both tableName and key filters", () => {
    expect(matchesFilters(baseEvent, { tableName: "config", key: "codex.model", from: "", to: "" })).toBe(true);
    expect(matchesFilters(baseEvent, { tableName: "secrets", key: "codex.model", from: "", to: "" })).toBe(false);
  });

  it("rejects when timestamp is before from filter", () => {
    expect(matchesFilters(baseEvent, { tableName: "", key: "", from: "2026-03-29T00:00:00Z", to: "" })).toBe(false);
  });

  it("rejects when timestamp is after to filter", () => {
    expect(matchesFilters(baseEvent, { tableName: "", key: "", from: "", to: "2026-03-27T00:00:00Z" })).toBe(false);
  });

  it("includes same-day events when to filter is date-only", () => {
    expect(matchesFilters(baseEvent, { tableName: "", key: "", from: "", to: "2026-03-28" })).toBe(true);
  });

  it("excludes next-day events when to filter is date-only", () => {
    const tomorrowEvent = { ...baseEvent, timestamp: "2026-03-29T01:00:00Z" };
    expect(matchesFilters(tomorrowEvent, { tableName: "", key: "", from: "", to: "2026-03-28" })).toBe(false);
  });
});
