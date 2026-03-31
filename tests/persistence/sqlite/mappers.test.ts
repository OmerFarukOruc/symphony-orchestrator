import { describe, expect, it } from "vitest";

import type { AttemptEvent, AttemptRecord, TokenUsageSnapshot } from "../../../src/core/types.js";
import {
  attemptEventToRow,
  attemptRecordToRow,
  rowToAttemptEvent,
  rowToAttemptRecord,
} from "../../../src/persistence/sqlite/mappers.js";

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function createAttemptRecord(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId: "attempt-1",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    title: "Implement feature",
    workspaceKey: "MT-42",
    workspacePath: "/tmp/risoluto/MT-42",
    status: "running",
    attemptNumber: 1,
    startedAt: "2026-03-20T10:00:00.000Z",
    endedAt: null,
    model: "gpt-5.4",
    reasoningEffort: "high",
    modelSource: "default",
    threadId: "thread-abc",
    turnId: "turn-xyz",
    turnCount: 3,
    errorCode: null,
    errorMessage: null,
    tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    pullRequestUrl: null,
    stopSignal: null,
    ...overrides,
  };
}

function createAttemptEvent(overrides: Partial<AttemptEvent> = {}): AttemptEvent {
  return {
    attemptId: "attempt-1",
    at: "2026-03-20T10:01:00.000Z",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    sessionId: "session-1",
    event: "attempt.updated",
    message: "Processing turn 2",
    content: null,
    usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
    metadata: null,
    ...overrides,
  };
}

/** Simulate a DB row by running record -> row -> adding auto-increment id for events. */
function simulateAttemptRow(record: AttemptRecord) {
  const row = attemptRecordToRow(record);
  return { ...row } as ReturnType<typeof attemptRecordToRow>;
}

// ---------------------------------------------------------------------------
// AttemptRecord mappers
// ---------------------------------------------------------------------------

describe("rowToAttemptRecord / attemptRecordToRow", () => {
  describe("round-trip preservation", () => {
    it("preserves all fields through a full round-trip", () => {
      const record = createAttemptRecord();
      const row = attemptRecordToRow(record);
      const restored = rowToAttemptRecord(row as Parameters<typeof rowToAttemptRecord>[0]);

      expect(restored).toEqual(record);
    });

    it("preserves a completed attempt with all fields populated", () => {
      const record = createAttemptRecord({
        status: "completed",
        endedAt: "2026-03-20T10:05:00.000Z",
        errorCode: "EXIT_1",
        errorMessage: "Process exited with code 1",
        pullRequestUrl: "https://github.com/org/repo/pull/42",
        stopSignal: "done",
        reasoningEffort: "xhigh",
        modelSource: "override",
      });

      const restored = rowToAttemptRecord(attemptRecordToRow(record) as Parameters<typeof rowToAttemptRecord>[0]);
      expect(restored).toEqual(record);
    });

    it("preserves a minimal attempt with all nullable fields null", () => {
      const record = createAttemptRecord({
        workspaceKey: null,
        workspacePath: null,
        attemptNumber: null,
        endedAt: null,
        reasoningEffort: null,
        threadId: null,
        turnId: null,
        errorCode: null,
        errorMessage: null,
        tokenUsage: null,
        pullRequestUrl: null,
        stopSignal: null,
      });

      const restored = rowToAttemptRecord(attemptRecordToRow(record) as Parameters<typeof rowToAttemptRecord>[0]);
      expect(restored).toEqual(record);
    });
  });

  describe("token usage flattening / reconstruction", () => {
    it("flattens tokenUsage into individual columns", () => {
      const record = createAttemptRecord({
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      });
      const row = attemptRecordToRow(record);

      expect(row.inputTokens).toBe(100);
      expect(row.outputTokens).toBe(50);
      expect(row.totalTokens).toBe(150);
    });

    it("maps null tokenUsage to null columns", () => {
      const record = createAttemptRecord({ tokenUsage: null });
      const row = attemptRecordToRow(record);

      expect(row.inputTokens).toBeNull();
      expect(row.outputTokens).toBeNull();
      expect(row.totalTokens).toBeNull();
    });

    it("reconstructs tokenUsage from non-null columns", () => {
      const row = simulateAttemptRow(
        createAttemptRecord({
          tokenUsage: { inputTokens: 500, outputTokens: 250, totalTokens: 750 },
        }),
      );

      const record = rowToAttemptRecord(row as Parameters<typeof rowToAttemptRecord>[0]);
      expect(record.tokenUsage).toEqual({
        inputTokens: 500,
        outputTokens: 250,
        totalTokens: 750,
      });
    });

    it("returns null tokenUsage when all token columns are null", () => {
      const row = simulateAttemptRow(createAttemptRecord({ tokenUsage: null }));

      const record = rowToAttemptRecord(row as Parameters<typeof rowToAttemptRecord>[0]);
      expect(record.tokenUsage).toBeNull();
    });

    it("handles partial token columns (some null, some not) via buildTokenUsage", () => {
      // When at least one token field is non-null, buildTokenUsage returns an object
      // with 0 defaults for the null fields.
      const row = {
        ...simulateAttemptRow(createAttemptRecord({ tokenUsage: null })),
        inputTokens: 100,
        outputTokens: null,
        totalTokens: null,
      };

      const record = rowToAttemptRecord(row as Parameters<typeof rowToAttemptRecord>[0]);
      expect(record.tokenUsage).toEqual({
        inputTokens: 100,
        outputTokens: 0,
        totalTokens: 0,
      });
    });

    it("defaults missing token fields to 0 when only totalTokens is present", () => {
      const row = {
        ...simulateAttemptRow(createAttemptRecord({ tokenUsage: null })),
        inputTokens: null,
        outputTokens: null,
        totalTokens: 500,
      };

      const record = rowToAttemptRecord(row as Parameters<typeof rowToAttemptRecord>[0]);
      expect(record.tokenUsage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 500,
      });
    });

    it("preserves zero-value token usage (not confused with null)", () => {
      const record = createAttemptRecord({
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });

      const row = attemptRecordToRow(record);
      expect(row.inputTokens).toBe(0);
      expect(row.outputTokens).toBe(0);
      expect(row.totalTokens).toBe(0);

      const restored = rowToAttemptRecord(row as Parameters<typeof rowToAttemptRecord>[0]);
      // Zero values still produce a non-null TokenUsageSnapshot
      expect(restored.tokenUsage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });
    });
  });

  describe("enum coercion", () => {
    const statuses: AttemptRecord["status"][] = [
      "running",
      "completed",
      "failed",
      "timed_out",
      "stalled",
      "cancelled",
      "paused",
    ];

    for (const status of statuses) {
      it(`preserves status "${status}"`, () => {
        const record = createAttemptRecord({ status });
        const restored = rowToAttemptRecord(attemptRecordToRow(record) as Parameters<typeof rowToAttemptRecord>[0]);
        expect(restored.status).toBe(status);
      });
    }

    const efforts: AttemptRecord["reasoningEffort"][] = ["none", "minimal", "low", "medium", "high", "xhigh", null];

    for (const effort of efforts) {
      it(`preserves reasoningEffort "${String(effort)}"`, () => {
        const record = createAttemptRecord({ reasoningEffort: effort });
        const restored = rowToAttemptRecord(attemptRecordToRow(record) as Parameters<typeof rowToAttemptRecord>[0]);
        expect(restored.reasoningEffort).toBe(effort);
      });
    }

    it('preserves modelSource "default"', () => {
      const record = createAttemptRecord({ modelSource: "default" });
      const restored = rowToAttemptRecord(attemptRecordToRow(record) as Parameters<typeof rowToAttemptRecord>[0]);
      expect(restored.modelSource).toBe("default");
    });

    it('preserves modelSource "override"', () => {
      const record = createAttemptRecord({ modelSource: "override" });
      const restored = rowToAttemptRecord(attemptRecordToRow(record) as Parameters<typeof rowToAttemptRecord>[0]);
      expect(restored.modelSource).toBe("override");
    });

    it('preserves stopSignal "done"', () => {
      const record = createAttemptRecord({ stopSignal: "done" });
      const restored = rowToAttemptRecord(attemptRecordToRow(record) as Parameters<typeof rowToAttemptRecord>[0]);
      expect(restored.stopSignal).toBe("done");
    });

    it('preserves stopSignal "blocked"', () => {
      const record = createAttemptRecord({ stopSignal: "blocked" });
      const restored = rowToAttemptRecord(attemptRecordToRow(record) as Parameters<typeof rowToAttemptRecord>[0]);
      expect(restored.stopSignal).toBe("blocked");
    });

    it("preserves stopSignal null", () => {
      const record = createAttemptRecord({ stopSignal: null });
      const restored = rowToAttemptRecord(attemptRecordToRow(record) as Parameters<typeof rowToAttemptRecord>[0]);
      expect(restored.stopSignal).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("handles empty string values", () => {
      const record = createAttemptRecord({
        title: "",
        model: "",
        errorCode: "",
        errorMessage: "",
      });
      const restored = rowToAttemptRecord(attemptRecordToRow(record) as Parameters<typeof rowToAttemptRecord>[0]);
      expect(restored.title).toBe("");
      expect(restored.model).toBe("");
      expect(restored.errorCode).toBe("");
      expect(restored.errorMessage).toBe("");
    });

    it("handles zero turnCount", () => {
      const record = createAttemptRecord({ turnCount: 0 });
      const restored = rowToAttemptRecord(attemptRecordToRow(record) as Parameters<typeof rowToAttemptRecord>[0]);
      expect(restored.turnCount).toBe(0);
    });

    it("handles large token values", () => {
      const usage: TokenUsageSnapshot = {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        totalTokens: 1_500_000,
      };
      const record = createAttemptRecord({ tokenUsage: usage });
      const restored = rowToAttemptRecord(attemptRecordToRow(record) as Parameters<typeof rowToAttemptRecord>[0]);
      expect(restored.tokenUsage).toEqual(usage);
    });

    it("handles pullRequestUrl with special characters", () => {
      const url = "https://github.com/org/repo/pull/42?query=a&b=c#hash";
      const record = createAttemptRecord({ pullRequestUrl: url });
      const restored = rowToAttemptRecord(attemptRecordToRow(record) as Parameters<typeof rowToAttemptRecord>[0]);
      expect(restored.pullRequestUrl).toBe(url);
    });
  });
});

// ---------------------------------------------------------------------------
// AttemptEvent mappers
// ---------------------------------------------------------------------------

describe("rowToAttemptEvent / attemptEventToRow", () => {
  describe("round-trip preservation", () => {
    it("preserves all fields through a full round-trip", () => {
      const event = createAttemptEvent();
      const row = attemptEventToRow(event);
      const restored = rowToAttemptEvent(row as Parameters<typeof rowToAttemptEvent>[0]);

      expect(restored).toEqual(event);
    });

    it("preserves an event with all optional fields populated", () => {
      const event = createAttemptEvent({
        content: "Agent output log content",
        usage: { inputTokens: 500, outputTokens: 250, totalTokens: 750 },
        metadata: { exitCode: 0, duration: 5000, nested: { key: "value" } },
      });

      const restored = rowToAttemptEvent(attemptEventToRow(event) as Parameters<typeof rowToAttemptEvent>[0]);
      expect(restored).toEqual(event);
    });

    it("preserves an event with all optional fields null", () => {
      const event = createAttemptEvent({
        issueId: null,
        issueIdentifier: null,
        sessionId: null,
        content: null,
        usage: null,
        metadata: null,
      });

      const restored = rowToAttemptEvent(attemptEventToRow(event) as Parameters<typeof rowToAttemptEvent>[0]);
      expect(restored).toEqual(event);
    });
  });

  describe("field name mapping", () => {
    it("maps event.at to row.timestamp", () => {
      const event = createAttemptEvent({ at: "2026-03-20T12:00:00.000Z" });
      const row = attemptEventToRow(event);
      expect(row.timestamp).toBe("2026-03-20T12:00:00.000Z");
    });

    it("maps row.timestamp back to event.at", () => {
      const row = attemptEventToRow(createAttemptEvent({ at: "2026-03-20T12:00:00.000Z" }));
      const restored = rowToAttemptEvent(row as Parameters<typeof rowToAttemptEvent>[0]);
      expect(restored.at).toBe("2026-03-20T12:00:00.000Z");
    });

    it("maps event.event to row.type", () => {
      const event = createAttemptEvent({ event: "attempt.completed" });
      const row = attemptEventToRow(event);
      expect(row.type).toBe("attempt.completed");
    });

    it("maps row.type back to event.event", () => {
      const row = attemptEventToRow(createAttemptEvent({ event: "attempt.started" }));
      const restored = rowToAttemptEvent(row as Parameters<typeof rowToAttemptEvent>[0]);
      expect(restored.event).toBe("attempt.started");
    });
  });

  describe("JSON metadata serialization", () => {
    it("serializes metadata to JSON string in row", () => {
      const event = createAttemptEvent({
        metadata: { exitCode: 0, tags: ["a", "b"] },
      });
      const row = attemptEventToRow(event);
      expect(row.metadata).toBe(JSON.stringify({ exitCode: 0, tags: ["a", "b"] }));
    });

    it("deserializes JSON string back to metadata object", () => {
      const event = createAttemptEvent({
        metadata: { nested: { deep: true }, count: 42 },
      });
      const row = attemptEventToRow(event);
      const restored = rowToAttemptEvent(row as Parameters<typeof rowToAttemptEvent>[0]);
      expect(restored.metadata).toEqual({ nested: { deep: true }, count: 42 });
    });

    it("maps null metadata to null in row", () => {
      const event = createAttemptEvent({ metadata: null });
      const row = attemptEventToRow(event);
      expect(row.metadata).toBeNull();
    });

    it("maps null row.metadata back to null", () => {
      const row = attemptEventToRow(createAttemptEvent({ metadata: null }));
      const restored = rowToAttemptEvent(row as Parameters<typeof rowToAttemptEvent>[0]);
      expect(restored.metadata).toBeNull();
    });

    it("handles metadata with empty object", () => {
      const event = createAttemptEvent({ metadata: {} });
      const row = attemptEventToRow(event);
      expect(row.metadata).toBe("{}");

      const restored = rowToAttemptEvent(row as Parameters<typeof rowToAttemptEvent>[0]);
      expect(restored.metadata).toEqual({});
    });
  });

  describe("event token usage flattening / reconstruction", () => {
    it("flattens usage into individual columns", () => {
      const event = createAttemptEvent({
        usage: { inputTokens: 300, outputTokens: 150, totalTokens: 450 },
      });
      const row = attemptEventToRow(event);

      expect(row.inputTokens).toBe(300);
      expect(row.outputTokens).toBe(150);
      expect(row.totalTokens).toBe(450);
    });

    it("maps null usage to null columns", () => {
      const event = createAttemptEvent({ usage: null });
      const row = attemptEventToRow(event);

      expect(row.inputTokens).toBeNull();
      expect(row.outputTokens).toBeNull();
      expect(row.totalTokens).toBeNull();
    });

    it("maps undefined usage to null columns", () => {
      const event = createAttemptEvent();
      delete event.usage;
      const row = attemptEventToRow(event);

      expect(row.inputTokens).toBeNull();
      expect(row.outputTokens).toBeNull();
      expect(row.totalTokens).toBeNull();
    });

    it("reconstructs usage from non-null columns", () => {
      const event = createAttemptEvent({
        usage: { inputTokens: 800, outputTokens: 400, totalTokens: 1200 },
      });
      const row = attemptEventToRow(event);
      const restored = rowToAttemptEvent(row as Parameters<typeof rowToAttemptEvent>[0]);

      expect(restored.usage).toEqual({
        inputTokens: 800,
        outputTokens: 400,
        totalTokens: 1200,
      });
    });

    it("returns null usage when all token columns are null", () => {
      const event = createAttemptEvent({ usage: null });
      const row = attemptEventToRow(event);
      const restored = rowToAttemptEvent(row as Parameters<typeof rowToAttemptEvent>[0]);

      expect(restored.usage).toBeNull();
    });

    it("handles partial token columns with zero defaults", () => {
      const row = {
        ...attemptEventToRow(createAttemptEvent({ usage: null })),
        inputTokens: 100,
        outputTokens: null,
        totalTokens: null,
      };

      const restored = rowToAttemptEvent(row as Parameters<typeof rowToAttemptEvent>[0]);
      expect(restored.usage).toEqual({
        inputTokens: 100,
        outputTokens: 0,
        totalTokens: 0,
      });
    });
  });

  describe("edge cases", () => {
    it("handles empty string content", () => {
      const event = createAttemptEvent({ content: "" });
      const row = attemptEventToRow(event);
      const restored = rowToAttemptEvent(row as Parameters<typeof rowToAttemptEvent>[0]);
      expect(restored.content).toBe("");
    });

    it("handles empty string message", () => {
      const event = createAttemptEvent({ message: "" });
      const restored = rowToAttemptEvent(attemptEventToRow(event) as Parameters<typeof rowToAttemptEvent>[0]);
      expect(restored.message).toBe("");
    });

    it("handles content with special characters", () => {
      const content = 'Output: {"key": "value"}\nLine 2\tTabbed';
      const event = createAttemptEvent({ content });
      const restored = rowToAttemptEvent(attemptEventToRow(event) as Parameters<typeof rowToAttemptEvent>[0]);
      expect(restored.content).toBe(content);
    });

    it("handles metadata with string values containing JSON-like content", () => {
      const metadata = { raw: '{"nested": "json"}', count: 0 };
      const event = createAttemptEvent({ metadata });
      const restored = rowToAttemptEvent(attemptEventToRow(event) as Parameters<typeof rowToAttemptEvent>[0]);
      expect(restored.metadata).toEqual(metadata);
    });
  });
});
