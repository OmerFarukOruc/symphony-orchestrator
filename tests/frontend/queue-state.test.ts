import { describe, expect, it } from "vitest";

import { createFilters, hasActiveFilters, isDefaultFilters } from "../../frontend/src/pages/queue-state";

describe("isDefaultFilters", () => {
  it("returns true for fresh filters", () => {
    expect(isDefaultFilters(createFilters())).toBe(true);
  });

  it("returns false when search has text", () => {
    const filters = createFilters();
    filters.search = "auth";
    expect(isDefaultFilters(filters)).toBe(false);
  });

  it("returns false when any stage is selected", () => {
    const filters = createFilters();
    filters.stages.add("in_progress");
    expect(isDefaultFilters(filters)).toBe(false);
  });

  it("returns false when priority is not all", () => {
    const filters = createFilters();
    filters.priority = "urgent";
    expect(isDefaultFilters(filters)).toBe(false);
  });

  it("returns false when sort is not updated", () => {
    const filters = createFilters();
    filters.sort = "priority";
    expect(isDefaultFilters(filters)).toBe(false);
  });

  it("returns false when density is compact", () => {
    const filters = createFilters();
    filters.density = "compact";
    expect(isDefaultFilters(filters)).toBe(false);
  });

  it("returns false when completed are hidden", () => {
    const filters = createFilters();
    filters.showCompleted = false;
    expect(isDefaultFilters(filters)).toBe(false);
  });
});

describe("hasActiveFilters", () => {
  it("returns false for fresh filters", () => {
    expect(hasActiveFilters(createFilters())).toBe(false);
  });

  it("returns true when search has text", () => {
    const filters = createFilters();
    filters.search = "auth";
    expect(hasActiveFilters(filters)).toBe(true);
  });

  it("returns true when any stage is selected", () => {
    const filters = createFilters();
    filters.stages.add("in_progress");
    expect(hasActiveFilters(filters)).toBe(true);
  });

  it("returns true when priority is not all", () => {
    const filters = createFilters();
    filters.priority = "high";
    expect(hasActiveFilters(filters)).toBe(true);
  });

  it("ignores sort, density, and showCompleted", () => {
    const filters = createFilters();
    filters.sort = "priority";
    filters.density = "compact";
    filters.showCompleted = false;
    expect(hasActiveFilters(filters)).toBe(false);
  });
});
