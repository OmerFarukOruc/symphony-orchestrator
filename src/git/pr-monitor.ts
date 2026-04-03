/**
 * PR Lifecycle Monitor — polls open PRs and reacts to state changes.
 *
 * `PrMonitorService` runs a background `setInterval` loop that calls
 * `getPrStatus()` for every open PR in the store. When a PR transitions
 * to `merged` or `closed` it:
 *   - updates the store via `updatePrStatus()`
 *   - emits the appropriate SSE event on the event bus
 *   - writes an `"attempt_finished"` (pr_merged) checkpoint
 *   - clears the orchestrator's in-memory running entry for the issue
 *
 * Environmental failures (missing auth, network errors) are caught and
 * logged at warn level — they never crash the monitor loop.
 */

import type { OpenPrRecord } from "../core/attempt-store-port.js";
import type { AttemptStorePort } from "../core/attempt-store-port.js";
import type { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { AgentConfig, RisolutoLogger } from "../core/types.js";
import type { TrackerPort } from "../tracker/port.js";
import type { WorkspaceManager } from "../workspace/manager.js";
import type { PrStatusResponse } from "./github-pr-client.js";

/** Narrow GitHub client interface needed by the PR monitor. */
export interface PrMonitorGhClient {
  getPrStatus(input: {
    owner: string;
    repo: string;
    pullNumber: number;
    tokenEnvName?: string;
  }): Promise<PrStatusResponse>;
}

/** Subset of OrchestratorPort needed by the monitor to clear running state. */
export interface PrMonitorOrchestratorPort {
  /** Request an immediate refresh so the cleared entry is reconciled. */
  requestRefresh(reason: string): unknown;
}

export interface PrMonitorDeps {
  store: AttemptStorePort;
  ghClient: PrMonitorGhClient;
  tracker: TrackerPort;
  workspaceManager: WorkspaceManager;
  config: AgentConfig;
  logger: RisolutoLogger;
  /** Typed event bus used for SSE fan-out. */
  events: TypedEventBus<RisolutoEventMap>;
  /** Optional reference to the orchestrator — used to trigger reconciliation after a merge. */
  orchestrator?: PrMonitorOrchestratorPort;
}

/**
 * Background service that monitors open pull requests for state transitions.
 *
 * Start it alongside the Orchestrator; stop it during shutdown.
 */
export class PrMonitorService {
  private intervalHandle: NodeJS.Timeout | null = null;
  private readonly store: AttemptStorePort;
  private readonly ghClient: PrMonitorGhClient;
  private readonly config: AgentConfig;
  private readonly logger: RisolutoLogger;
  private readonly events: TypedEventBus<RisolutoEventMap>;
  private readonly orchestrator?: PrMonitorOrchestratorPort;

  constructor(private readonly deps: PrMonitorDeps) {
    this.store = deps.store;
    this.ghClient = deps.ghClient;
    this.config = deps.config;
    this.logger = deps.logger.child({ component: "pr-monitor" });
    this.events = deps.events;
    this.orchestrator = deps.orchestrator;
  }

  /** Start the polling loop. Safe to call multiple times — no-op if already running. */
  start(): void {
    if (this.intervalHandle !== null) return;
    const intervalMs = this.config.prMonitorIntervalMs;
    this.intervalHandle = setInterval(() => {
      void this.checkAllOpenPrs();
    }, intervalMs);
    this.logger.info({ intervalMs }, "pr monitor started");
  }

  /** Stop the polling loop. Safe to call multiple times — no-op if already stopped. */
  stop(): void {
    if (this.intervalHandle === null) return;
    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
    this.logger.info("pr monitor stopped");
  }

  /** Fetch all open PRs and check each one against GitHub. */
  private async checkAllOpenPrs(): Promise<void> {
    let openPrs: OpenPrRecord[];
    try {
      openPrs = await this.store.getOpenPrs();
    } catch (error) {
      this.logger.warn({ error: errorMessage(error) }, "pr monitor: failed to fetch open PRs");
      return;
    }

    for (const pr of openPrs) {
      await this.checkSinglePr(pr);
    }
  }

  /** Check one PR; any error is caught and logged so the loop continues. */
  private async checkSinglePr(pr: OpenPrRecord): Promise<void> {
    // Parse owner/repo from the stored `repo` field (expected "owner/repo").
    const slashIdx = pr.repo.indexOf("/");
    if (slashIdx === -1) {
      this.logger.warn({ url: pr.url, repo: pr.repo }, "pr monitor: cannot parse owner/repo — skipping");
      return;
    }
    const owner = pr.repo.slice(0, slashIdx);
    const repo = pr.repo.slice(slashIdx + 1);

    let prData: PrStatusResponse;
    try {
      prData = await this.ghClient.getPrStatus({ owner, repo, pullNumber: pr.pullNumber });
    } catch (error) {
      this.logger.warn(
        { url: pr.url, pullNumber: pr.pullNumber, error: errorMessage(error) },
        "pr monitor: getPrStatus failed (skipping)",
      );
      return;
    }

    const newStatus = resolveStatus(prData);
    if (newStatus === "open") return; // no change

    await this.handleStateChange(pr, newStatus, prData.merge_commit_sha ?? null);
  }

  /**
   * React to a PR state transition.
   * - Updates the store
   * - Emits SSE event
   * - Writes checkpoint on merge
   * - Triggers orchestrator reconciliation
   */
  private async handleStateChange(
    pr: OpenPrRecord,
    newStatus: "merged" | "closed",
    mergeCommitSha: string | null,
  ): Promise<void> {
    const now = new Date().toISOString();

    try {
      await this.store.updatePrStatus(
        pr.url,
        newStatus,
        newStatus === "merged" ? now : undefined,
        newStatus === "merged" ? (mergeCommitSha ?? undefined) : undefined,
      );
    } catch (error) {
      this.logger.warn({ url: pr.url, newStatus, error: errorMessage(error) }, "pr monitor: updatePrStatus failed");
      return;
    }

    this.logger.info({ url: pr.url, issueId: pr.issueId, newStatus }, "pr monitor: PR state changed");

    // Emit typed SSE event.
    if (newStatus === "merged") {
      emitEvent(this.events, "pr.merged", {
        issueId: pr.issueId,
        url: pr.url,
        mergedAt: now,
        mergeCommitSha,
      });
    } else {
      emitEvent(this.events, "pr.closed", {
        issueId: pr.issueId,
        url: pr.url,
      });
    }

    // Write checkpoint on merge.
    if (newStatus === "merged") {
      try {
        // Look up the latest attempt for this issue to obtain a valid attemptId.
        const allAttempts = this.store.getAllAttempts();
        const latestAttempt = allAttempts
          .filter((a) => a.issueId === pr.issueId)
          .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
          .at(0);

        if (latestAttempt) {
          await this.store.appendCheckpoint({
            attemptId: latestAttempt.attemptId,
            trigger: "pr_merged",
            eventCursor: null,
            status: latestAttempt.status,
            threadId: latestAttempt.threadId,
            turnId: latestAttempt.turnId,
            turnCount: latestAttempt.turnCount,
            tokenUsage: latestAttempt.tokenUsage,
            metadata: { prUrl: pr.url, mergeCommitSha },
            createdAt: now,
          });
        }
      } catch (error) {
        this.logger.warn(
          { url: pr.url, error: errorMessage(error) },
          "pr monitor: appendCheckpoint failed (non-fatal)",
        );
      }
    }

    // Trigger orchestrator reconciliation so in-memory state is cleared.
    if (this.orchestrator) {
      try {
        this.orchestrator.requestRefresh("pr_state_changed");
      } catch (error) {
        this.logger.warn({ error: errorMessage(error) }, "pr monitor: orchestrator requestRefresh failed (non-fatal)");
      }
    }
  }
}

/** Derive the canonical status string from a raw GitHub PR response. */
function resolveStatus(prData: { state: "open" | "closed"; merged: boolean }): "open" | "merged" | "closed" {
  if (prData.merged) return "merged";
  if (prData.state === "closed") return "closed";
  return "open";
}

/** Emit a typed event on the bus. */
function emitEvent<K extends keyof RisolutoEventMap>(
  bus: TypedEventBus<RisolutoEventMap>,
  channel: K,
  payload: RisolutoEventMap[K],
): void {
  bus.emit(channel, payload);
}

/** Extract a safe string from an unknown caught error. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
