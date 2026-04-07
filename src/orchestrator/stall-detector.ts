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
  stallEvents: readonly StallEvent[];
  getConfig: () => ServiceConfig;
  pushEvent: RuntimeEventSink;
  logger: {
    warn: (meta: Record<string, unknown>, message: string) => void;
  };
}

/** Maximum stall events kept in memory for the dashboard timeline. */
export const MAX_STALL_EVENTS = 100;

export interface StallDetectorResult {
  killed: number;
  /** New stall events array (capped at MAX_STALL_EVENTS), or null if unchanged. */
  updatedStallEvents: StallEvent[] | null;
}

/**
 * Scan running entries for stalled agents and abort them.
 * Returns the kill count and a new stall events array (immutable — never mutates
 * the input `ctx.stallEvents`).
 */
export function detectAndKillStalledWorkers(ctx: StallDetectorContext): StallDetectorResult {
  const config = ctx.getConfig();
  const stallTimeoutMs = config.codex.stallTimeoutMs;
  if (stallTimeoutMs <= 0) return { killed: 0, updatedStallEvents: null };

  const now = Date.now();
  let killed = 0;
  const newEvents: StallEvent[] = [];

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
    newEvents.push(stallEvent);

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

  if (newEvents.length === 0) {
    return { killed: 0, updatedStallEvents: null };
  }

  const combined = [...ctx.stallEvents, ...newEvents];
  const updatedStallEvents = combined.slice(-MAX_STALL_EVENTS);

  return { killed, updatedStallEvents };
}
