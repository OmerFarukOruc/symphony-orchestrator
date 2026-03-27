import { describe, expect, it } from "vitest";

import type { RecentEvent } from "../../frontend/src/types";
import { createLogBuffer } from "../../frontend/src/state/log-buffer";

function makeEvent(overrides: Partial<RecentEvent> = {}): RecentEvent {
  return {
    at: "2026-01-15T12:00:00.000Z",
    issue_id: "issue-001",
    issue_identifier: "SYM-42",
    session_id: "sess-001",
    event: "tool_use",
    message: "Running tests",
    content: null,
    ...overrides,
  };
}

describe("LogBuffer", () => {
  it("defaults to desc (newest-first) direction", () => {
    const buffer = createLogBuffer();
    expect(buffer.direction()).toBe("desc");
  });

  it("respects an explicit initial direction", () => {
    const buffer = createLogBuffer("asc");
    expect(buffer.direction()).toBe("asc");
  });

  it("insert() maintains sorted order in desc mode", () => {
    const buffer = createLogBuffer("desc");

    buffer.insert(makeEvent({ at: "2026-01-15T12:00:00.000Z", message: "first" }));
    buffer.insert(makeEvent({ at: "2026-01-15T12:02:00.000Z", message: "third" }));
    buffer.insert(makeEvent({ at: "2026-01-15T12:01:00.000Z", message: "second" }));

    const timestamps = buffer.events().map((e) => e.at);
    expect(timestamps).toEqual(["2026-01-15T12:02:00.000Z", "2026-01-15T12:01:00.000Z", "2026-01-15T12:00:00.000Z"]);
  });

  it("insert() maintains sorted order in asc mode", () => {
    const buffer = createLogBuffer("asc");

    buffer.insert(makeEvent({ at: "2026-01-15T12:02:00.000Z", message: "third" }));
    buffer.insert(makeEvent({ at: "2026-01-15T12:00:00.000Z", message: "first" }));
    buffer.insert(makeEvent({ at: "2026-01-15T12:01:00.000Z", message: "second" }));

    const timestamps = buffer.events().map((e) => e.at);
    expect(timestamps).toEqual(["2026-01-15T12:00:00.000Z", "2026-01-15T12:01:00.000Z", "2026-01-15T12:02:00.000Z"]);
  });

  it("insert() rejects duplicate events and returns false", () => {
    const buffer = createLogBuffer();
    const event = makeEvent();

    expect(buffer.insert(event)).toBe(true);
    expect(buffer.insert(event)).toBe(false);
    expect(buffer.size()).toBe(1);
  });

  it("insert() accepts events with same timestamp but different message", () => {
    const buffer = createLogBuffer();
    const timestamp = "2026-01-15T12:00:00.000Z";

    expect(buffer.insert(makeEvent({ at: timestamp, message: "alpha" }))).toBe(true);
    expect(buffer.insert(makeEvent({ at: timestamp, message: "beta" }))).toBe(true);
    expect(buffer.size()).toBe(2);
  });

  it("insert() accepts events with same timestamp but different event type", () => {
    const buffer = createLogBuffer();
    const timestamp = "2026-01-15T12:00:00.000Z";

    expect(buffer.insert(makeEvent({ at: timestamp, event: "tool_use" }))).toBe(true);
    expect(buffer.insert(makeEvent({ at: timestamp, event: "started" }))).toBe(true);
    expect(buffer.size()).toBe(2);
  });

  it("insert() accepts events with same timestamp but different session_id", () => {
    const buffer = createLogBuffer();
    const timestamp = "2026-01-15T12:00:00.000Z";

    expect(buffer.insert(makeEvent({ at: timestamp, session_id: "sess-a" }))).toBe(true);
    expect(buffer.insert(makeEvent({ at: timestamp, session_id: "sess-b" }))).toBe(true);
    expect(buffer.size()).toBe(2);
  });

  it("insert() dedup key includes null session_id", () => {
    const buffer = createLogBuffer();

    expect(buffer.insert(makeEvent({ session_id: null }))).toBe(true);
    expect(buffer.insert(makeEvent({ session_id: null }))).toBe(false);
    expect(buffer.insert(makeEvent({ session_id: "sess-001" }))).toBe(true);
    expect(buffer.size()).toBe(2);
  });

  it("load() deduplicates and sorts", () => {
    const buffer = createLogBuffer("desc");
    const events = [
      makeEvent({ at: "2026-01-15T12:00:00.000Z", message: "a" }),
      makeEvent({ at: "2026-01-15T12:02:00.000Z", message: "c" }),
      makeEvent({ at: "2026-01-15T12:01:00.000Z", message: "b" }),
      makeEvent({ at: "2026-01-15T12:00:00.000Z", message: "a" }), // duplicate
    ];

    buffer.load(events);

    expect(buffer.size()).toBe(3);
    const timestamps = buffer.events().map((e) => e.at);
    expect(timestamps).toEqual(["2026-01-15T12:02:00.000Z", "2026-01-15T12:01:00.000Z", "2026-01-15T12:00:00.000Z"]);
  });

  it("load() merges with existing events", () => {
    const buffer = createLogBuffer("asc");

    buffer.insert(makeEvent({ at: "2026-01-15T12:00:00.000Z", message: "existing" }));

    buffer.load([
      makeEvent({ at: "2026-01-15T11:59:00.000Z", message: "earlier" }),
      makeEvent({ at: "2026-01-15T12:01:00.000Z", message: "later" }),
      makeEvent({ at: "2026-01-15T12:00:00.000Z", message: "existing" }), // duplicate
    ]);

    expect(buffer.size()).toBe(3);
    const messages = buffer.events().map((e) => e.message);
    expect(messages).toEqual(["earlier", "existing", "later"]);
  });

  it("load() with no new events does not re-sort", () => {
    const buffer = createLogBuffer("desc");
    const event = makeEvent();
    buffer.insert(event);

    // Loading the same event should not change the buffer
    buffer.load([event]);
    expect(buffer.size()).toBe(1);
  });

  it("setDirection() reverses the order", () => {
    const buffer = createLogBuffer("desc");

    buffer.insert(makeEvent({ at: "2026-01-15T12:00:00.000Z", message: "a" }));
    buffer.insert(makeEvent({ at: "2026-01-15T12:01:00.000Z", message: "b" }));
    buffer.insert(makeEvent({ at: "2026-01-15T12:02:00.000Z", message: "c" }));

    expect(buffer.events().map((e) => e.at)).toEqual([
      "2026-01-15T12:02:00.000Z",
      "2026-01-15T12:01:00.000Z",
      "2026-01-15T12:00:00.000Z",
    ]);

    buffer.setDirection("asc");
    expect(buffer.direction()).toBe("asc");
    expect(buffer.events().map((e) => e.at)).toEqual([
      "2026-01-15T12:00:00.000Z",
      "2026-01-15T12:01:00.000Z",
      "2026-01-15T12:02:00.000Z",
    ]);
  });

  it("setDirection() with same direction is a no-op", () => {
    const buffer = createLogBuffer("desc");

    buffer.insert(makeEvent({ at: "2026-01-15T12:00:00.000Z", message: "a" }));
    buffer.insert(makeEvent({ at: "2026-01-15T12:01:00.000Z", message: "b" }));

    const before = [...buffer.events()];
    buffer.setDirection("desc");

    expect(buffer.events()).toEqual(before);
  });

  it("insert into empty buffer works correctly", () => {
    const buffer = createLogBuffer();
    expect(buffer.size()).toBe(0);
    expect(buffer.events()).toEqual([]);

    expect(buffer.insert(makeEvent())).toBe(true);
    expect(buffer.size()).toBe(1);
  });

  it("insert into single-element buffer places correctly", () => {
    const buffer = createLogBuffer("desc");
    buffer.insert(makeEvent({ at: "2026-01-15T12:01:00.000Z", message: "middle" }));

    // Insert earlier event -- should go after in desc mode
    buffer.insert(makeEvent({ at: "2026-01-15T12:00:00.000Z", message: "earlier" }));
    expect(buffer.events().map((e) => e.message)).toEqual(["middle", "earlier"]);

    // Insert later event -- should go before in desc mode
    buffer.insert(makeEvent({ at: "2026-01-15T12:02:00.000Z", message: "later" }));
    expect(buffer.events().map((e) => e.message)).toEqual(["later", "middle", "earlier"]);
  });

  it("size() returns correct count", () => {
    const buffer = createLogBuffer();
    expect(buffer.size()).toBe(0);

    buffer.insert(makeEvent({ message: "a" }));
    expect(buffer.size()).toBe(1);

    buffer.insert(makeEvent({ message: "b" }));
    expect(buffer.size()).toBe(2);

    // Duplicate should not increase size
    buffer.insert(makeEvent({ message: "a" }));
    expect(buffer.size()).toBe(2);
  });

  it("events() returns the internal array", () => {
    const buffer = createLogBuffer();
    const event = makeEvent();
    buffer.insert(event);

    const result = buffer.events();
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(event);
  });

  it("handles many events with identical timestamps", () => {
    const buffer = createLogBuffer("desc");
    const timestamp = "2026-01-15T12:00:00.000Z";

    for (let index = 0; index < 20; index++) {
      buffer.insert(makeEvent({ at: timestamp, message: `msg-${index}` }));
    }

    expect(buffer.size()).toBe(20);
    // All timestamps are the same, so they should all be present
    for (const event of buffer.events()) {
      expect(event.at).toBe(timestamp);
    }
  });

  it("direction toggle back and forth preserves events", () => {
    const buffer = createLogBuffer("desc");

    buffer.insert(makeEvent({ at: "2026-01-15T12:00:00.000Z", message: "a" }));
    buffer.insert(makeEvent({ at: "2026-01-15T12:01:00.000Z", message: "b" }));
    buffer.insert(makeEvent({ at: "2026-01-15T12:02:00.000Z", message: "c" }));

    buffer.setDirection("asc");
    buffer.setDirection("desc");

    expect(buffer.size()).toBe(3);
    expect(buffer.events().map((e) => e.at)).toEqual([
      "2026-01-15T12:02:00.000Z",
      "2026-01-15T12:01:00.000Z",
      "2026-01-15T12:00:00.000Z",
    ]);
  });

  it("insert after direction change maintains new sort order", () => {
    const buffer = createLogBuffer("desc");

    buffer.insert(makeEvent({ at: "2026-01-15T12:00:00.000Z", message: "a" }));
    buffer.insert(makeEvent({ at: "2026-01-15T12:02:00.000Z", message: "c" }));

    buffer.setDirection("asc");

    buffer.insert(makeEvent({ at: "2026-01-15T12:01:00.000Z", message: "b" }));

    expect(buffer.events().map((e) => e.at)).toEqual([
      "2026-01-15T12:00:00.000Z",
      "2026-01-15T12:01:00.000Z",
      "2026-01-15T12:02:00.000Z",
    ]);
  });
});
