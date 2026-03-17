export type NotificationVerbosity = "off" | "critical" | "verbose";

export type NotificationSeverity = "info" | "critical";

export type NotificationEventType =
  | "issue_claimed"
  | "worker_launched"
  | "worker_completed"
  | "worker_retry"
  | "worker_failed";

export interface NotificationIssueContext {
  id: string | null;
  identifier: string;
  title: string;
  state: string | null;
  url: string | null;
}

export interface NotificationEvent {
  type: NotificationEventType;
  severity: NotificationSeverity;
  timestamp: string;
  message: string;
  issue: NotificationIssueContext;
  attempt: number | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
}

export interface NotificationChannel {
  readonly name: string;
  notify(event: NotificationEvent): Promise<void>;
}

export function shouldDeliverByVerbosity(event: NotificationEvent, verbosity: NotificationVerbosity): boolean {
  if (verbosity === "off") {
    return false;
  }
  if (verbosity === "critical") {
    return event.severity === "critical";
  }
  return true;
}
