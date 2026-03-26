/**
 * Event map for the Symphony orchestrator event bus.
 *
 * Each key is a dot-delimited channel name; the value is the typed payload
 * subscribers receive. Channels mirror the categories already flowing through
 * the RecentEvent ring buffer so the bus is a superset of existing telemetry.
 */

export interface SymphonyEventMap {
  /** An agent worker was launched for an issue. */
  "issue.started": { issueId: string; identifier: string; attempt: number | null };

  /** An agent worker finished (any terminal outcome). */
  "issue.completed": { issueId: string; identifier: string; outcome: string };

  /** An agent worker was detected as stalled and killed. */
  "issue.stalled": { issueId: string; identifier: string; reason: string };

  /** An issue was queued for later processing. */
  "issue.queued": { issueId: string; identifier: string };

  /** A worker failure occurred (crash, timeout, etc.). */
  "worker.failed": { issueId: string; identifier: string; error: string };

  /** A model selection was updated at runtime. */
  "model.updated": { identifier: string; model: string; source: string };

  /** A workspace lifecycle event (preparing, ready, failed). */
  "workspace.event": { issueId: string; identifier: string; status: string };

  /** A raw agent event forwarded from the worker stream. */
  "agent.event": {
    issueId: string;
    identifier: string;
    type: string;
    message: string;
    sessionId: string | null;
  };

  /** A polling cycle completed. */
  "poll.complete": { timestamp: string; issueCount: number };

  /** A system-level error not tied to a specific issue. */
  "system.error": { message: string; context?: Record<string, unknown> };
}
