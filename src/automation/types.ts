import type { AutomationMode } from "../core/types.js";

export type AutomationRunTrigger = "schedule" | "manual";

export type AutomationRunStatus = "running" | "completed" | "failed" | "skipped";

export interface AutomationRunRecord {
  id: string;
  automationName: string;
  mode: AutomationMode;
  trigger: AutomationRunTrigger;
  repoUrl: string | null;
  status: AutomationRunStatus;
  output: string | null;
  details: Record<string, unknown> | null;
  issueId: string | null;
  issueIdentifier: string | null;
  issueUrl: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}
