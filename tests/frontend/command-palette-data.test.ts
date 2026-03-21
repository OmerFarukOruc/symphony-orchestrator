import { describe, expect, it } from "vitest";

import {
  createBasePaletteEntries,
  filterPaletteEntries,
  type PaletteEntry,
} from "../../frontend/src/ui/command-palette-data";

function createEntry(overrides: Partial<PaletteEntry> = {}): PaletteEntry {
  return {
    id: "entry:1",
    name: "Queue board",
    description: "Open the active board",
    meta: "g q",
    group: "Navigation",
    icon: "board",
    keywords: ["queue", "board"],
    run: () => undefined,
    ...overrides,
  };
}

describe("filterPaletteEntries", () => {
  it("supports fuzzy subsequence matches", () => {
    const entries = [
      createEntry(),
      createEntry({ id: "entry:2", name: "Config", description: "Edit settings", keywords: ["config"] }),
    ];

    const filtered = filterPaletteEntries(entries, "qb");

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.name).toBe("Queue board");
  });

  it("ranks stronger matches ahead of weaker ones", () => {
    const entries = [
      createEntry({ id: "entry:1", name: "Board", description: "Open board", keywords: ["board"] }),
      createEntry({
        id: "entry:2",
        name: "Observe board",
        description: "Inspect board",
        keywords: ["observe", "board"],
      }),
      createEntry({ id: "entry:3", name: "Config", description: "Edit settings", keywords: ["config"] }),
    ];

    const filtered = filterPaletteEntries(entries, "bo");

    expect(filtered.map((entry) => entry.name)).toEqual(["Board", "Observe board"]);
  });
});

describe("createBasePaletteEntries", () => {
  it("includes quick actions for discoverability", () => {
    const entries = createBasePaletteEntries();

    expect(entries.some((entry) => entry.id === "action:theme")).toBe(true);
    expect(entries.some((entry) => entry.id === "action:shortcuts")).toBe(true);
  });
});
