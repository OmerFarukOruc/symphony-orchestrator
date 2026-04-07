import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadDefaults() {
  return import("../../src/state/defaults.js");
}

describe("state defaults", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("exports the expected active states in order", async () => {
    const { DEFAULT_ACTIVE_STATES } = await loadDefaults();
    expect(DEFAULT_ACTIVE_STATES).toEqual(["Backlog", "Todo", "In Progress"]);
  });

  it("exports the expected terminal states in order", async () => {
    const { DEFAULT_TERMINAL_STATES } = await loadDefaults();
    expect(DEFAULT_TERMINAL_STATES).toEqual(["Done", "Canceled"]);
  });
});
