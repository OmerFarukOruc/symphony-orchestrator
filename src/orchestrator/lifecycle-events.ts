import type { Issue, RecentEvent } from "../core/types.js";
import { getErrorMessage } from "../utils/type-guards.js";

export type RuntimeEventRecord = RecentEvent & {
  usage?: unknown;
  rateLimits?: unknown;
};

export type RuntimeEventSink = (event: RuntimeEventRecord) => void;

export interface LifecycleEventInput {
  issue: Pick<Issue, "id" | "identifier">;
  event: string;
  message: string;
  sessionId?: string | null;
  metadata?: Record<string, unknown> | null;
  at?: string;
}

export function createLifecycleEvent(input: LifecycleEventInput): RecentEvent {
  return {
    at: input.at ?? new Date().toISOString(),
    issueId: input.issue.id,
    issueIdentifier: input.issue.identifier,
    sessionId: input.sessionId ?? null,
    event: input.event,
    message: input.message,
    metadata: input.metadata ?? null,
  };
}

export function toErrorMessage(error: unknown): string {
  return getErrorMessage(error, String(error));
}
