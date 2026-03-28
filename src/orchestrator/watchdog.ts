/**
 * Workflow watchdog — periodic background health monitor.
 *
 * Runs on a configurable interval (default 60 s) and exposes a health
 * status endpoint consumed by the dashboard's System Health indicator.
 *
 * Health states:
 *   healthy   — all agents active, no recent stalls
 *   degraded  — one or more stalls detected in the last check window
 *   critical  — no agents are running and there are issues in the queue
 *              (i.e. the orchestrator appears stuck)
 */

import type { StallEvent } from "./stall-detector.js";
import type { HealthStatus } from "../core/types.js";

export type { HealthStatus } from "../core/types.js";

export interface WatchdogHealth {
  status: HealthStatus;
  checkedAt: string;
  runningCount: number;
  recentStalls: StallEvent[];
  message: string;
}

interface WatchdogContext {
  getRunningCount: () => number;
  getQueuedCount: () => number;
  getRecentStalls: () => StallEvent[];
  onHealthUpdated?: () => void;
  logger: {
    info: (meta: Record<string, unknown>, message: string) => void;
    warn: (meta: Record<string, unknown>, message: string) => void;
  };
}

const DEFAULT_INTERVAL_MS = 60_000;
const STALL_WINDOW_MS = 300_000; // stalls in last 5 min count toward degraded

export class Watchdog {
  private timer: NodeJS.Timeout | null = null;
  private health: WatchdogHealth = {
    status: "healthy",
    checkedAt: new Date().toISOString(),
    runningCount: 0,
    recentStalls: [],
    message: "not started",
  };

  constructor(
    private readonly ctx: WatchdogContext,
    private readonly intervalMs = DEFAULT_INTERVAL_MS,
  ) {}

  start(): void {
    if (this.timer) return;
    this.runCheck();
    this.timer = setInterval(() => {
      this.runCheck();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getHealth(): WatchdogHealth {
    return { ...this.health, recentStalls: [...this.health.recentStalls] };
  }

  private runCheck(): void {
    const now = Date.now();
    const checkedAt = new Date(now).toISOString();
    const runningCount = this.ctx.getRunningCount();
    const queuedCount = this.ctx.getQueuedCount();
    const allStalls = this.ctx.getRecentStalls();
    const windowCutoff = now - STALL_WINDOW_MS;
    const recentStalls = allStalls.filter((s) => new Date(s.at).getTime() >= windowCutoff);

    let status: HealthStatus;
    let message: string;

    if (recentStalls.length > 0) {
      status = "degraded";
      message = `${recentStalls.length} stall(s) detected in last ${STALL_WINDOW_MS / 60_000} min`;
    } else if (runningCount === 0 && queuedCount > 0) {
      status = "critical";
      message = `${queuedCount} issue(s) queued but no agents running`;
    } else {
      status = "healthy";
      message = runningCount === 0 ? "idle — no issues queued" : `${runningCount} agent(s) running`;
    }

    this.health = { status, checkedAt, runningCount, recentStalls, message };
    this.ctx.onHealthUpdated?.();

    if (status === "healthy") {
      this.ctx.logger.info({ status, runningCount }, "watchdog: health check passed");
    } else {
      this.ctx.logger.warn({ status, runningCount, stalls: recentStalls.length }, `watchdog: ${message}`);
    }
  }
}

/** Build a snapshot of watchdog health suitable for HTTP API / dashboard. */
export function buildHealthSnapshot(health: WatchdogHealth): Record<string, unknown> {
  return {
    status: health.status,
    checkedAt: health.checkedAt,
    runningCount: health.runningCount,
    recentStalls: health.recentStalls,
    message: health.message,
  };
}
