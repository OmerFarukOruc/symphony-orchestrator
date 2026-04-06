/**
 * Contract test suite for AttemptStorePort implementations.
 *
 * Any implementation of AttemptStorePort (JSONL, SQLite, or future adapters)
 * must pass this suite to prove behavioral conformance. This replaces the
 * duplicated test matrices that previously existed in separate test files.
 *
 * Usage:
 *   runAttemptStoreContract("my-store", {
 *     create: async () => store,
 *     teardown: async (s) => { ... },
 *   });
 */

import { describe, it, expect, afterEach } from "vitest";

import type { AttemptStorePort } from "../../src/core/attempt-store-port.js";
import type { AttemptEvent, AttemptRecord } from "../../src/core/types.js";

function createAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId: "attempt-1",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    title: "Characterize persistence",
    workspaceKey: "MT-42",
    workspacePath: "/tmp/risoluto/MT-42",
    status: "running",
    attemptNumber: 1,
    startedAt: "2026-03-16T10:00:00.000Z",
    endedAt: null,
    model: "gpt-5.4",
    reasoningEffort: "high",
    modelSource: "default",
    threadId: null,
    turnId: null,
    turnCount: 0,
    errorCode: null,
    errorMessage: null,
    tokenUsage: null,
    pullRequestUrl: null,
    stopSignal: null,
    summary: null,
    ...overrides,
  };
}

function createEvent(overrides: Partial<AttemptEvent> = {}): AttemptEvent {
  return {
    attemptId: "attempt-1",
    at: "2026-03-16T10:00:00.000Z",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    sessionId: null,
    event: "attempt.updated",
    message: "updated",
    content: null,
    ...overrides,
  };
}

export interface ContractHarness<T extends AttemptStorePort> {
  /** Create a fresh store instance. Called once per test. */
  create(): Promise<T>;
  /** Clean up the store after a test completes. */
  teardown(store: T): Promise<void>;
}

export function runAttemptStoreContract<T extends AttemptStorePort>(label: string, harness: ContractHarness<T>): void {
  let store: T;
  const stores: T[] = [];

  async function freshStore(): Promise<T> {
    store = await harness.create();
    stores.push(store);
    return store;
  }

  afterEach(async () => {
    for (const s of stores.splice(0)) {
      await harness.teardown(s);
    }
  });

  describe(`AttemptStorePort contract: ${label}`, () => {
    // ---------------------------------------------------------------
    // CRUD basics
    // ---------------------------------------------------------------

    it("creates and retrieves an attempt", async () => {
      const s = await freshStore();
      const attempt = createAttempt();
      await s.createAttempt(attempt);
      expect(s.getAttempt(attempt.attemptId)).toEqual(attempt);
    });

    it("returns null for unknown attempt id", async () => {
      const s = await freshStore();
      expect(s.getAttempt("nonexistent")).toBeNull();
    });

    it("returns all attempts", async () => {
      const s = await freshStore();
      await s.createAttempt(createAttempt({ attemptId: "a1" }));
      await s.createAttempt(createAttempt({ attemptId: "a2", attemptNumber: 2 }));
      const all = s.getAllAttempts();
      expect(all).toHaveLength(2);
      expect(all.map((a) => a.attemptId).sort()).toEqual(["a1", "a2"]);
    });

    it("handles duplicate createAttempt calls idempotently", async () => {
      const s = await freshStore();
      const attempt = createAttempt();
      await s.createAttempt(attempt);
      await s.createAttempt(attempt);
      expect(s.getAllAttempts()).toHaveLength(1);
    });

    it("updates an existing attempt", async () => {
      const s = await freshStore();
      await s.createAttempt(createAttempt());
      await s.updateAttempt("attempt-1", {
        status: "completed",
        endedAt: "2026-03-16T10:05:00.000Z",
        turnCount: 5,
      });
      const updated = s.getAttempt("attempt-1");
      expect(updated).toMatchObject({
        status: "completed",
        endedAt: "2026-03-16T10:05:00.000Z",
        turnCount: 5,
        title: "Characterize persistence",
      });
    });

    it("throws when updating a nonexistent attempt", async () => {
      const s = await freshStore();
      await expect(s.updateAttempt("nonexistent", { status: "failed" })).rejects.toThrow("unknown attempt id");
    });

    // ---------------------------------------------------------------
    // Issue index
    // ---------------------------------------------------------------

    it("returns attempts for a specific issue sorted desc by startedAt", async () => {
      const s = await freshStore();
      await s.createAttempt(
        createAttempt({ attemptId: "a1", issueIdentifier: "MT-42", startedAt: "2026-03-16T10:00:00.000Z" }),
      );
      await s.createAttempt(
        createAttempt({ attemptId: "a2", issueIdentifier: "MT-42", startedAt: "2026-03-16T11:00:00.000Z" }),
      );
      await s.createAttempt(
        createAttempt({ attemptId: "a3", issueIdentifier: "MT-99", startedAt: "2026-03-16T10:30:00.000Z" }),
      );

      const forIssue = s.getAttemptsForIssue("MT-42");
      expect(forIssue).toHaveLength(2);
      expect(forIssue[0].attemptId).toBe("a2");
      expect(forIssue[1].attemptId).toBe("a1");
      expect(s.getAttemptsForIssue("MT-99")).toHaveLength(1);
      expect(s.getAttemptsForIssue("NONE")).toEqual([]);
    });

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    it("appends and retrieves events in chronological order", async () => {
      const s = await freshStore();
      await s.createAttempt(createAttempt());

      const e1 = createEvent({ at: "2026-03-16T10:01:00.000Z", event: "attempt.started", message: "started" });
      const e2 = createEvent({ at: "2026-03-16T10:02:00.000Z", event: "attempt.completed", message: "completed" });
      await s.appendEvent(e1);
      await s.appendEvent(e2);

      const events = s.getEvents("attempt-1");
      expect(events).toHaveLength(2);
      expect(events[0].event).toBe("attempt.started");
      expect(events[1].event).toBe("attempt.completed");
    });

    it("returns empty array for events of unknown attempt", async () => {
      const s = await freshStore();
      expect(s.getEvents("nonexistent")).toEqual([]);
    });

    // ---------------------------------------------------------------
    // Aggregates
    // ---------------------------------------------------------------

    it("sumArchivedSeconds returns 0 for an empty store", async () => {
      const s = await freshStore();
      expect(s.sumArchivedSeconds()).toBe(0);
    });

    it("sumArchivedSeconds sums completed attempts and ignores incomplete ones", async () => {
      const s = await freshStore();
      await s.createAttempt(
        createAttempt({
          attemptId: "a1",
          startedAt: "2026-03-16T10:00:00.000Z",
          endedAt: "2026-03-16T10:03:00.000Z",
          status: "completed",
        }),
      );
      await s.createAttempt(
        createAttempt({
          attemptId: "a2",
          startedAt: "2026-03-16T11:00:00.000Z",
          endedAt: "2026-03-16T11:01:00.000Z",
          status: "completed",
        }),
      );
      await s.createAttempt(
        createAttempt({
          attemptId: "a3",
          startedAt: "2026-03-16T12:00:00.000Z",
          endedAt: null,
          status: "running",
        }),
      );
      // 3*60 + 1*60 = 240 seconds
      expect(s.sumArchivedSeconds()).toBeCloseTo(240, 0);
    });

    it("sumCostUsd returns 0 for an empty store", async () => {
      const s = await freshStore();
      expect(s.sumCostUsd()).toBe(0);
    });

    it("sumCostUsd sums cost for completed attempts with known models", async () => {
      const s = await freshStore();
      // gpt-5.4: inputUsd=3.0, outputUsd=12.0 per 1M tokens
      // 1000 input + 500 output => (1000*3 + 500*12) / 1_000_000 = 0.009
      await s.createAttempt(
        createAttempt({
          attemptId: "a1",
          model: "gpt-5.4",
          status: "completed",
          endedAt: "2026-03-16T10:05:00.000Z",
          tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
        }),
      );
      // gpt-4o: inputUsd=2.5, outputUsd=10.0 per 1M tokens
      // 2000 input + 1000 output => (2000*2.5 + 1000*10) / 1_000_000 = 0.015
      await s.createAttempt(
        createAttempt({
          attemptId: "a2",
          model: "gpt-4o",
          status: "completed",
          endedAt: "2026-03-16T11:01:00.000Z",
          tokenUsage: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000 },
        }),
      );
      expect(s.sumCostUsd()).toBeCloseTo(0.024, 10);
    });

    it("sumCostUsd ignores attempts with unknown models", async () => {
      const s = await freshStore();
      await s.createAttempt(
        createAttempt({
          model: "unknown-model-xyz",
          status: "completed",
          endedAt: "2026-03-16T10:05:00.000Z",
          tokenUsage: { inputTokens: 10000, outputTokens: 5000, totalTokens: 15000 },
        }),
      );
      expect(s.sumCostUsd()).toBe(0);
    });

    it("sumCostUsd ignores attempts with null tokenUsage", async () => {
      const s = await freshStore();
      await s.createAttempt(
        createAttempt({
          model: "gpt-5.4",
          status: "completed",
          endedAt: "2026-03-16T10:05:00.000Z",
          tokenUsage: null,
        }),
      );
      expect(s.sumCostUsd()).toBe(0);
    });

    it("sumArchivedTokens accumulates token counts correctly", async () => {
      const s = await freshStore();
      await s.createAttempt(
        createAttempt({
          attemptId: "a1",
          status: "completed",
          endedAt: "2026-03-16T10:01:00.000Z",
          tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
        }),
      );
      await s.createAttempt(
        createAttempt({
          attemptId: "a2",
          model: "gpt-4o",
          status: "completed",
          endedAt: "2026-03-16T11:01:00.000Z",
          tokenUsage: { inputTokens: 400, outputTokens: 600, totalTokens: 1000 },
        }),
      );
      const tokens = s.sumArchivedTokens();
      expect(tokens.inputTokens).toBe(500);
      expect(tokens.outputTokens).toBe(800);
      expect(tokens.totalTokens).toBe(1300);
    });

    // ---------------------------------------------------------------
    // Token usage round-trip
    // ---------------------------------------------------------------

    it("preserves token usage through round-trip", async () => {
      const s = await freshStore();
      await s.createAttempt(createAttempt({ tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } }));
      const retrieved = s.getAttempt("attempt-1");
      expect(retrieved?.tokenUsage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    });

    it("preserves event metadata through round-trip", async () => {
      const s = await freshStore();
      await s.createAttempt(createAttempt());
      await s.appendEvent(
        createEvent({
          metadata: { exitCode: 0, duration: 1234 },
          usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
        }),
      );
      const events = s.getEvents("attempt-1");
      expect(events[0].metadata).toEqual({ exitCode: 0, duration: 1234 });
      expect(events[0].usage).toEqual({ inputTokens: 200, outputTokens: 100, totalTokens: 300 });
    });
  });
}
