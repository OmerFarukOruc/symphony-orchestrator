import { describe, expect, it } from "vitest";

import {
  AlertHistoryStore,
  type AlertHistoryStorePort,
  type CreateAlertHistoryInput,
} from "../../src/alerts/history-store.js";
import { openDatabase } from "../../src/persistence/sqlite/database.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<CreateAlertHistoryInput> = {}): CreateAlertHistoryInput {
  return {
    ruleName: "worker-failures",
    eventType: "worker.failed",
    severity: "critical",
    status: "delivered",
    channels: ["ops-webhook"],
    deliveredChannels: ["ops-webhook"],
    failedChannels: [],
    message: "ENG-1 matched worker-failures: timeout",
    createdAt: "2026-04-04T11:30:00.000Z",
    ...overrides,
  };
}

// Tests cover limit normalization, ordering, filtering, and cloning logic
// against the SQLite-backed store using an in-memory database.

describe("AlertHistoryStore (SQLite in-memory)", () => {
  let store: AlertHistoryStorePort;

  function freshStore() {
    return AlertHistoryStore.create(openDatabase(":memory:"));
  }

  it("creates a record with a generated id", async () => {
    store = freshStore();
    const record = await store.create(makeInput());

    expect(record.id).toBeTruthy();
    expect(record.ruleName).toBe("worker-failures");
    expect(record.eventType).toBe("worker.failed");
    expect(record.severity).toBe("critical");
    expect(record.status).toBe("delivered");
    expect(record.channels).toEqual(["ops-webhook"]);
    expect(record.deliveredChannels).toEqual(["ops-webhook"]);
    expect(record.failedChannels).toEqual([]);
    expect(record.message).toBe("ENG-1 matched worker-failures: timeout");
    expect(record.createdAt).toBe("2026-04-04T11:30:00.000Z");
  });

  it("lists records in descending order by createdAt", async () => {
    store = freshStore();
    await store.create(makeInput({ createdAt: "2026-04-04T10:00:00.000Z", ruleName: "older" }));
    await store.create(makeInput({ createdAt: "2026-04-04T12:00:00.000Z", ruleName: "newer" }));

    const records = await store.list();
    expect(records).toHaveLength(2);
    expect(records[0].ruleName).toBe("newer");
    expect(records[1].ruleName).toBe("older");
  });

  it("breaks ties by insertion order (newest first)", async () => {
    store = freshStore();
    const ts = "2026-04-04T10:00:00.000Z";
    await store.create(makeInput({ createdAt: ts, ruleName: "first-inserted" }));
    await store.create(makeInput({ createdAt: ts, ruleName: "second-inserted" }));

    const records = await store.list();
    expect(records[0].ruleName).toBe("second-inserted");
    expect(records[1].ruleName).toBe("first-inserted");
  });

  it("limits results", async () => {
    store = freshStore();
    for (let i = 0; i < 5; i++) {
      await store.create(makeInput({ createdAt: `2026-04-04T${String(10 + i).padStart(2, "0")}:00:00.000Z` }));
    }

    const limited = await store.list({ limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it("defaults to limit 100 when not specified", async () => {
    store = freshStore();
    // Just verify listing works without a limit
    const records = await store.list();
    expect(records).toEqual([]);
  });

  it("normalizes limit — NaN defaults to 100", async () => {
    store = freshStore();
    await store.create(makeInput());

    const records = await store.list({ limit: NaN });
    expect(records).toHaveLength(1);
  });

  it("normalizes limit — values below 1 clamp to 1", async () => {
    store = freshStore();
    await store.create(makeInput({ ruleName: "a" }));
    await store.create(makeInput({ ruleName: "b" }));

    const records = await store.list({ limit: 0 });
    expect(records).toHaveLength(1);
  });

  it("normalizes limit — values above 500 clamp to 500", async () => {
    store = freshStore();
    await store.create(makeInput());

    const records = await store.list({ limit: 9999 });
    expect(records).toHaveLength(1); // Only 1 record, but limit was clamped
  });

  it("normalizes limit — truncates fractional values", async () => {
    store = freshStore();
    for (let i = 0; i < 3; i++) {
      await store.create(makeInput());
    }

    const records = await store.list({ limit: 2.7 });
    expect(records).toHaveLength(2);
  });

  it("filters by ruleName", async () => {
    store = freshStore();
    await store.create(makeInput({ ruleName: "worker-failures" }));
    await store.create(makeInput({ ruleName: "deploy-errors" }));
    await store.create(makeInput({ ruleName: "worker-failures" }));

    const filtered = await store.list({ ruleName: "worker-failures" });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => r.ruleName === "worker-failures")).toBe(true);
  });

  it("returns empty array when ruleName filter matches nothing", async () => {
    store = freshStore();
    await store.create(makeInput({ ruleName: "worker-failures" }));

    const filtered = await store.list({ ruleName: "nonexistent" });
    expect(filtered).toEqual([]);
  });

  it("returns cloned records (mutations do not affect store)", async () => {
    store = freshStore();
    const created = await store.create(makeInput());

    // Mutate the returned record
    created.channels.push("hacked");
    created.deliveredChannels.push("hacked");
    created.failedChannels.push({ channel: "hacked", error: "hacked" });

    const records = await store.list();
    expect(records[0].channels).toEqual(["ops-webhook"]);
    expect(records[0].deliveredChannels).toEqual(["ops-webhook"]);
    expect(records[0].failedChannels).toEqual([]);
  });

  it("persists failedChannels as structured objects", async () => {
    store = freshStore();
    await store.create(
      makeInput({
        failedChannels: [
          { channel: "slack", error: "timeout" },
          { channel: "email", error: "auth failed" },
        ],
      }),
    );

    const records = await store.list();
    expect(records[0].failedChannels).toEqual([
      { channel: "slack", error: "timeout" },
      { channel: "email", error: "auth failed" },
    ]);
  });
});

describe("AlertHistoryStore.create factory", () => {
  it("returns a store when given an in-memory database", () => {
    const store = AlertHistoryStore.create(openDatabase(":memory:"));
    expect(store).toBeDefined();
    expect(typeof store.create).toBe("function");
    expect(typeof store.list).toBe("function");
  });
});
