import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrMonitorService } from "../../src/git/pr-monitor.js";
import type { PrMonitorDeps } from "../../src/git/pr-monitor.js";
import type { OpenPrRecord, AttemptStorePort } from "../../src/core/attempt-store-port.js";
import type { AttemptRecord, AttemptCheckpointRecord } from "../../src/core/types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeOpenPr(overrides: Partial<OpenPrRecord> = {}): OpenPrRecord {
  return {
    prId: "1",
    attemptId: "attempt-1",
    issueId: "issue-abc",
    owner: "acme",
    repo: "acme/backend",
    pullNumber: 42,
    url: "https://github.com/acme/backend/pull/42",
    status: "open",
    mergedAt: null,
    mergeCommitSha: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    branchName: "feature/eng-1",
    ...overrides,
  };
}

function makeAttemptRecord(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId: "attempt-1",
    issueId: "issue-abc",
    issueIdentifier: "ENG-1",
    title: "Fix widget",
    workspaceKey: null,
    workspacePath: null,
    status: "completed",
    attemptNumber: 1,
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T01:00:00.000Z",
    model: "gpt-4o",
    reasoningEffort: null,
    modelSource: "default",
    threadId: "thread-1",
    turnId: "turn-1",
    turnCount: 5,
    errorCode: null,
    errorMessage: null,
    tokenUsage: null,
    pullRequestUrl: "https://github.com/acme/backend/pull/42",
    ...overrides,
  };
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

function makeStore(overrides: Partial<AttemptStorePort> = {}): AttemptStorePort {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    getAttempt: vi.fn().mockReturnValue(null),
    getAllAttempts: vi.fn().mockReturnValue([makeAttemptRecord()]),
    getEvents: vi.fn().mockReturnValue([]),
    getAttemptsForIssue: vi.fn().mockReturnValue([]),
    createAttempt: vi.fn().mockResolvedValue(undefined),
    updateAttempt: vi.fn().mockResolvedValue(undefined),
    appendEvent: vi.fn().mockResolvedValue(undefined),
    sumArchivedSeconds: vi.fn().mockReturnValue(0),
    sumCostUsd: vi.fn().mockReturnValue(0),
    sumArchivedTokens: vi.fn().mockReturnValue({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    appendCheckpoint: vi.fn().mockResolvedValue(undefined),
    listCheckpoints: vi.fn().mockResolvedValue([] as AttemptCheckpointRecord[]),
    upsertPr: vi.fn().mockResolvedValue(undefined),
    getOpenPrs: vi.fn().mockResolvedValue([]),
    updatePrStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeGhClient(statusOverride: { state: "open" | "closed"; merged: boolean; merge_commit_sha: string | null }) {
  return {
    getPrStatus: vi.fn().mockResolvedValue({
      state: statusOverride.state,
      merged: statusOverride.merged,
      number: 42,
      html_url: "https://github.com/acme/backend/pull/42",
      merge_commit_sha: statusOverride.merge_commit_sha,
    }),
  } as unknown as PrMonitorDeps["ghClient"];
}

function makeEventBus() {
  return { emit: vi.fn() } as unknown as PrMonitorDeps["events"];
}

function makeOrchestrator() {
  return { requestRefresh: vi.fn() };
}

function makeDeps(overrides: Partial<PrMonitorDeps> = {}): PrMonitorDeps {
  return {
    store: makeStore(),
    ghClient: makeGhClient({ state: "open", merged: false, merge_commit_sha: null }),
    tracker: {} as PrMonitorDeps["tracker"],
    workspaceManager: {} as PrMonitorDeps["workspaceManager"],
    config: { prMonitorIntervalMs: 60_000 } as PrMonitorDeps["config"],
    logger: makeLogger() as unknown as PrMonitorDeps["logger"],
    events: makeEventBus(),
    orchestrator: makeOrchestrator(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("PrMonitorService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("start() / stop()", () => {
    it("starts a poll interval and stop() clears it", () => {
      const deps = makeDeps();
      const monitor = new PrMonitorService(deps);

      monitor.start();
      expect(deps.store.getOpenPrs).not.toHaveBeenCalled(); // not called yet

      // Advance past one interval
      vi.advanceTimersByTime(60_001);
      // getOpenPrs is called inside an async callback — just verify the timer fires
      monitor.stop();
    });

    it("stop() is idempotent — calling twice does not throw", () => {
      const deps = makeDeps();
      const monitor = new PrMonitorService(deps);
      monitor.start();
      monitor.stop();
      expect(() => monitor.stop()).not.toThrow();
    });

    it("start() is idempotent — calling twice does not create multiple intervals", async () => {
      const store = makeStore({
        getOpenPrs: vi.fn().mockResolvedValue([]),
      });
      const deps = makeDeps({ store });
      const monitor = new PrMonitorService(deps);

      monitor.start();
      monitor.start(); // second call should be a no-op

      await vi.advanceTimersByTimeAsync(60_001);

      // Should only poll once per interval, not twice
      expect(store.getOpenPrs).toHaveBeenCalledTimes(1);
      monitor.stop();
    });
  });

  describe("poll loop — status changes detected", () => {
    it("calls updatePrStatus when a PR is merged", async () => {
      const pr = makeOpenPr();
      const store = makeStore({
        getOpenPrs: vi.fn().mockResolvedValue([pr]),
        updatePrStatus: vi.fn().mockResolvedValue(undefined),
      });
      const ghClient = makeGhClient({ state: "closed", merged: true, merge_commit_sha: "abc123" });
      const deps = makeDeps({ store, ghClient });
      const monitor = new PrMonitorService(deps);

      monitor.start();
      await vi.advanceTimersByTimeAsync(60_001);

      expect(store.updatePrStatus).toHaveBeenCalledWith(
        pr.url,
        "merged",
        expect.any(String), // mergedAt ISO string
        "abc123",
      );
      monitor.stop();
    });

    it("calls updatePrStatus when a PR is closed without merging", async () => {
      const pr = makeOpenPr();
      const store = makeStore({
        getOpenPrs: vi.fn().mockResolvedValue([pr]),
        updatePrStatus: vi.fn().mockResolvedValue(undefined),
      });
      const ghClient = makeGhClient({ state: "closed", merged: false, merge_commit_sha: null });
      const deps = makeDeps({ store, ghClient });
      const monitor = new PrMonitorService(deps);

      monitor.start();
      await vi.advanceTimersByTimeAsync(60_001);

      expect(store.updatePrStatus).toHaveBeenCalledWith(pr.url, "closed", undefined, undefined);
      monitor.stop();
    });

    it("does NOT call updatePrStatus when PR is still open", async () => {
      const pr = makeOpenPr();
      const store = makeStore({
        getOpenPrs: vi.fn().mockResolvedValue([pr]),
        updatePrStatus: vi.fn().mockResolvedValue(undefined),
      });
      const ghClient = makeGhClient({ state: "open", merged: false, merge_commit_sha: null });
      const deps = makeDeps({ store, ghClient });
      const monitor = new PrMonitorService(deps);

      monitor.start();
      await vi.advanceTimersByTimeAsync(60_001);

      expect(store.updatePrStatus).not.toHaveBeenCalled();
      monitor.stop();
    });
  });

  describe("handleStateChange — SSE events", () => {
    it("emits pr.merged event on merge", async () => {
      const pr = makeOpenPr();
      const store = makeStore({ getOpenPrs: vi.fn().mockResolvedValue([pr]) });
      const events = makeEventBus();
      const ghClient = makeGhClient({ state: "closed", merged: true, merge_commit_sha: "sha-xyz" });
      const deps = makeDeps({ store, ghClient, events });
      const monitor = new PrMonitorService(deps);

      monitor.start();
      await vi.advanceTimersByTimeAsync(60_001);

      expect(events.emit).toHaveBeenCalledWith(
        "pr.merged",
        expect.objectContaining({
          issueId: pr.issueId,
          url: pr.url,
          mergeCommitSha: "sha-xyz",
        }),
      );
      monitor.stop();
    });

    it("emits pr.closed event when PR is closed without merging", async () => {
      const pr = makeOpenPr();
      const store = makeStore({ getOpenPrs: vi.fn().mockResolvedValue([pr]) });
      const events = makeEventBus();
      const ghClient = makeGhClient({ state: "closed", merged: false, merge_commit_sha: null });
      const deps = makeDeps({ store, ghClient, events });
      const monitor = new PrMonitorService(deps);

      monitor.start();
      await vi.advanceTimersByTimeAsync(60_001);

      expect(events.emit).toHaveBeenCalledWith(
        "pr.closed",
        expect.objectContaining({ issueId: pr.issueId, url: pr.url }),
      );
      monitor.stop();
    });
  });

  describe("handleStateChange — checkpoint on merge", () => {
    it("calls appendCheckpoint with pr_merged trigger on merge", async () => {
      const pr = makeOpenPr();
      const store = makeStore({
        getOpenPrs: vi.fn().mockResolvedValue([pr]),
        getAllAttempts: vi.fn().mockReturnValue([makeAttemptRecord()]),
        appendCheckpoint: vi.fn().mockResolvedValue(undefined),
      });
      const ghClient = makeGhClient({ state: "closed", merged: true, merge_commit_sha: "sha-abc" });
      const deps = makeDeps({ store, ghClient });
      const monitor = new PrMonitorService(deps);

      monitor.start();
      await vi.advanceTimersByTimeAsync(60_001);

      expect(store.appendCheckpoint).toHaveBeenCalledWith(expect.objectContaining({ trigger: "pr_merged" }));
      monitor.stop();
    });

    it("does NOT call appendCheckpoint when PR is only closed", async () => {
      const pr = makeOpenPr();
      const store = makeStore({
        getOpenPrs: vi.fn().mockResolvedValue([pr]),
        appendCheckpoint: vi.fn().mockResolvedValue(undefined),
      });
      const ghClient = makeGhClient({ state: "closed", merged: false, merge_commit_sha: null });
      const deps = makeDeps({ store, ghClient });
      const monitor = new PrMonitorService(deps);

      monitor.start();
      await vi.advanceTimersByTimeAsync(60_001);

      expect(store.appendCheckpoint).not.toHaveBeenCalled();
      monitor.stop();
    });
  });

  describe("environmental error handling", () => {
    it("catches getPrStatus errors and continues polling", async () => {
      const pr = makeOpenPr();
      const store = makeStore({ getOpenPrs: vi.fn().mockResolvedValue([pr]) });
      const ghClient = {
        getPrStatus: vi.fn().mockRejectedValue(new Error("network timeout")),
      } as unknown as PrMonitorDeps["ghClient"];
      const logger = makeLogger();
      const deps = makeDeps({ store, ghClient, logger: logger as unknown as PrMonitorDeps["logger"] });
      const monitor = new PrMonitorService(deps);

      monitor.start();
      await vi.advanceTimersByTimeAsync(60_001);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: "network timeout" }),
        expect.stringContaining("getPrStatus failed"),
      );
      // A second tick fires without crashing
      await vi.advanceTimersByTimeAsync(60_001);
      expect(store.updatePrStatus).not.toHaveBeenCalled();
      monitor.stop();
    });

    it("catches getOpenPrs errors and continues the loop", async () => {
      const store = makeStore({
        getOpenPrs: vi.fn().mockRejectedValue(new Error("db locked")),
      });
      const logger = makeLogger();
      const deps = makeDeps({ store, logger: logger as unknown as PrMonitorDeps["logger"] });
      const monitor = new PrMonitorService(deps);

      monitor.start();
      await vi.advanceTimersByTimeAsync(60_001);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: "db locked" }),
        expect.stringContaining("failed to fetch open PRs"),
      );
      monitor.stop();
    });

    it("logs a warning when repo field cannot be parsed and skips the PR", async () => {
      const pr = makeOpenPr({ repo: "not-a-valid-repo-string" });
      const store = makeStore({ getOpenPrs: vi.fn().mockResolvedValue([pr]) });
      const ghClient = makeGhClient({ state: "closed", merged: true, merge_commit_sha: null });
      const logger = makeLogger();
      const deps = makeDeps({ store, ghClient, logger: logger as unknown as PrMonitorDeps["logger"] });
      const monitor = new PrMonitorService(deps);

      monitor.start();
      await vi.advanceTimersByTimeAsync(60_001);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ repo: "not-a-valid-repo-string" }),
        expect.stringContaining("cannot parse owner/repo"),
      );
      expect(store.updatePrStatus).not.toHaveBeenCalled();
      monitor.stop();
    });
  });

  describe("orchestrator integration", () => {
    it("calls orchestrator.requestRefresh after a state change", async () => {
      const pr = makeOpenPr();
      const store = makeStore({ getOpenPrs: vi.fn().mockResolvedValue([pr]) });
      const ghClient = makeGhClient({ state: "closed", merged: true, merge_commit_sha: null });
      const orchestrator = makeOrchestrator();
      const deps = makeDeps({ store, ghClient, orchestrator });
      const monitor = new PrMonitorService(deps);

      monitor.start();
      await vi.advanceTimersByTimeAsync(60_001);

      expect(orchestrator.requestRefresh).toHaveBeenCalledWith("pr_state_changed");
      monitor.stop();
    });

    it("does NOT call orchestrator.requestRefresh when PR is still open", async () => {
      const pr = makeOpenPr();
      const store = makeStore({ getOpenPrs: vi.fn().mockResolvedValue([pr]) });
      const ghClient = makeGhClient({ state: "open", merged: false, merge_commit_sha: null });
      const orchestrator = makeOrchestrator();
      const deps = makeDeps({ store, ghClient, orchestrator });
      const monitor = new PrMonitorService(deps);

      monitor.start();
      await vi.advanceTimersByTimeAsync(60_001);

      expect(orchestrator.requestRefresh).not.toHaveBeenCalled();
      monitor.stop();
    });
  });
});
