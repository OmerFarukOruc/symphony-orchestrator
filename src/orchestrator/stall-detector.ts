/**
 * Stall detector for orchestrator-level stall detection.
 *
 * Detects running agents that have emitted no events for longer than
 * `config.codex.stallTimeoutMs` and aborts them so the retry mechanism can
 * requeue the work.  A `StallEvent` record is stored per detected stall for
 * dashboard display (stall timeline widget).
 */

import type { RuntimeEventSink } from "../core/lifecycle-events.js";
import { nowIso } from "./views.js";
import type { ServiceConfig } from "../core/types.js";
import type { RunningEntry } from "./runtime-types.js";

export interface StallEvent {
  at: string;
  issueId: string;
  issueIdentifier: string;
  silentMs: number;
  timeoutMs: number;
}

export interface StallDetectorContext {
  runningEntries: Map<string, RunningEntry>;
  stallEvents: StallEvent[];
  getConfig: () => ServiceConfig;
  pushEvent: RuntimeEventSink;
  logger: {
    warn: (meta: Record<string, unknown>, message: string) => void;
  };
}

/** Maximum stall events kept in memory for the dashboard timeline. */
const MAX_STALL_EVENTS = 100;

/**
 * Scan running entries for stalled agents and abort them.
 * Records a `StallEvent` for each stalled agent, capped at `MAX_STALL_EVENTS`.
 *
 * @returns Number of agents that were aborted.
 */
export function detectAndKillStalledWorkers(ctx: StallDetectorContext): number {
  const config = ctx.getConfig();
  const stallTimeoutMs = config.codex.stallTimeoutMs;
  if (stallTimeoutMs <= 0) return 0;

  const now = Date.now();
  let killed = 0;

  for (const entry of ctx.runningEntries.values()) {
    if (entry.abortController.signal.aborted) continue;
    const silentMs = now - entry.lastEventAtMs;
    if (silentMs <= stallTimeoutMs) continue;

    entry.abortController.abort("stalled");
    entry.status = "stopping";
    killed++;

    const stallEvent: StallEvent = {
      at: nowIso(),
      issueId: entry.issue.id,
      issueIdentifier: entry.issue.identifier,
      silentMs,
      timeoutMs: stallTimeoutMs,
    };

    ctx.stallEvents.push(stallEvent);
    if (ctx.stallEvents.length > MAX_STALL_EVENTS) {
      ctx.stallEvents.shift();
    }

    ctx.logger.warn(
      {
        issue_identifier: entry.issue.identifier,
        silent_ms: silentMs,
        timeout_ms: stallTimeoutMs,
      },
      "stall detector: agent killed (no events within stall timeout)",
    );

    ctx.pushEvent({
      at: stallEvent.at,
      issueId: entry.issue.id,
      issueIdentifier: entry.issue.identifier,
      sessionId: entry.sessionId,
      event: "worker_stalled",
      message: `agent silent for ${Math.round(silentMs / 1000)}s — killed by stall detector`,
    });
  }

  return killed;
}
