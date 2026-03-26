import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { createLifecycleEvent, toErrorMessage } from "../../src/orchestrator/lifecycle-events.js";

describe("lifecycle-events", () => {
  describe("createLifecycleEvent", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-15T10:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("creates an event with all required fields", () => {
      const event = createLifecycleEvent({
        issue: { id: "issue-1", identifier: "MT-42" },
        event: "worker_started",
        message: "Worker started for MT-42",
      });

      expect(event).toEqual({
        at: "2026-03-15T10:00:00.000Z",
        issueId: "issue-1",
        issueIdentifier: "MT-42",
        sessionId: null,
        event: "worker_started",
        message: "Worker started for MT-42",
        metadata: null,
      });
    });

    it("uses the provided 'at' timestamp instead of current time", () => {
      const event = createLifecycleEvent({
        issue: { id: "issue-1", identifier: "MT-42" },
        event: "worker_completed",
        message: "Worker completed",
        at: "2026-03-14T08:00:00Z",
      });

      expect(event.at).toBe("2026-03-14T08:00:00Z");
    });

    it("defaults 'at' to current time when not provided", () => {
      const event = createLifecycleEvent({
        issue: { id: "issue-1", identifier: "MT-42" },
        event: "worker_started",
        message: "Worker started",
      });

      expect(event.at).toBe("2026-03-15T10:00:00.000Z");
    });

    it("includes sessionId when provided", () => {
      const event = createLifecycleEvent({
        issue: { id: "issue-1", identifier: "MT-42" },
        event: "worker_started",
        message: "Worker started",
        sessionId: "session-abc",
      });

      expect(event.sessionId).toBe("session-abc");
    });

    it("defaults sessionId to null when not provided", () => {
      const event = createLifecycleEvent({
        issue: { id: "issue-1", identifier: "MT-42" },
        event: "worker_started",
        message: "Worker started",
      });

      expect(event.sessionId).toBeNull();
    });

    it("defaults sessionId to null when explicitly null", () => {
      const event = createLifecycleEvent({
        issue: { id: "issue-1", identifier: "MT-42" },
        event: "worker_started",
        message: "Worker started",
        sessionId: null,
      });

      expect(event.sessionId).toBeNull();
    });

    it("includes metadata when provided", () => {
      const metadata = { attempt: 3, errorCode: "turn_failed" };
      const event = createLifecycleEvent({
        issue: { id: "issue-1", identifier: "MT-42" },
        event: "retry_scheduled",
        message: "Retry scheduled",
        metadata,
      });

      expect(event.metadata).toEqual(metadata);
    });

    it("defaults metadata to null when not provided", () => {
      const event = createLifecycleEvent({
        issue: { id: "issue-1", identifier: "MT-42" },
        event: "worker_started",
        message: "Worker started",
      });

      expect(event.metadata).toBeNull();
    });

    it("defaults metadata to null when explicitly null", () => {
      const event = createLifecycleEvent({
        issue: { id: "issue-1", identifier: "MT-42" },
        event: "worker_started",
        message: "Worker started",
        metadata: null,
      });

      expect(event.metadata).toBeNull();
    });

    it("preserves issue id and identifier exactly as given", () => {
      const event = createLifecycleEvent({
        issue: { id: "abc-def-123", identifier: "PROJ-999" },
        event: "test_event",
        message: "Test message",
      });

      expect(event.issueId).toBe("abc-def-123");
      expect(event.issueIdentifier).toBe("PROJ-999");
    });

    it("preserves the event type string exactly as given", () => {
      const event = createLifecycleEvent({
        issue: { id: "issue-1", identifier: "MT-42" },
        event: "custom_event_type",
        message: "Something happened",
      });

      expect(event.event).toBe("custom_event_type");
    });
  });

  describe("toErrorMessage", () => {
    it("extracts message from an Error instance", () => {
      const result = toErrorMessage(new Error("something went wrong"));
      expect(result).toBe("something went wrong");
    });

    it("extracts message from a TypeError instance", () => {
      const result = toErrorMessage(new TypeError("invalid type"));
      expect(result).toBe("invalid type");
    });

    it("converts a string to its string representation", () => {
      const result = toErrorMessage("plain string error");
      expect(result).toBe("plain string error");
    });

    it("converts a number to its string representation", () => {
      const result = toErrorMessage(42);
      expect(result).toBe("42");
    });

    it("converts null to its string representation", () => {
      const result = toErrorMessage(null);
      expect(result).toBe("null");
    });

    it("converts undefined to its string representation", () => {
      const result = toErrorMessage(undefined);
      expect(result).toBe("undefined");
    });

    it("converts an object to its string representation", () => {
      const result = toErrorMessage({ code: "ERR" });
      expect(result).toBe("[object Object]");
    });

    it("converts a boolean to its string representation", () => {
      const result = toErrorMessage(false);
      expect(result).toBe("false");
    });
  });
});
