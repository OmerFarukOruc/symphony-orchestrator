export type { NotificationSeverity, NotificationVerbosity } from "../core/notification-types.js";
import type { NotificationSeverity, NotificationVerbosity } from "../core/notification-types.js";

export type NotificationEventType =
  | "issue_claimed"
  | "worker_launched"
  | "worker_completed"
  | "worker_retry"
  | "worker_failed"
  | "automation_completed"
  | "automation_failed"
  | "alert_fired";

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
  title?: string;
  message: string;
  href?: string | null;
  source?: string | null;
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

const SEVERITY_ORDER: Record<NotificationSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export function shouldDeliverByMinSeverity(
  eventSeverity: NotificationSeverity,
  minimumSeverity: NotificationSeverity,
): boolean {
  return SEVERITY_ORDER[eventSeverity] >= SEVERITY_ORDER[minimumSeverity];
}
