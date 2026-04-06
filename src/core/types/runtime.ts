import type { IssueBlockerRef } from "./issue.js";
import type { TokenUsageSnapshot, ReasoningEffort } from "./model.js";
import type { RecentEvent } from "./attempt.js";
import type { SystemHealth } from "./health.js";

export interface RuntimeIssueView {
  issueId: string;
  identifier: string;
  title: string;
  state: string;
  workspaceKey: string | null;
  workspacePath?: string | null;
  message: string | null;
  status: string;
  updatedAt: string;
  attempt: number | null;
  error: string | null;
  priority?: number | null;
  labels?: string[];
  startedAt?: string | null;
  lastEventAt?: string | null;
  tokenUsage?: TokenUsageSnapshot | null;
  model?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  modelSource?: "default" | "override" | null;
  configuredModel?: string | null;
  configuredReasoningEffort?: ReasoningEffort | null;
  configuredModelSource?: "default" | "override" | null;
  modelChangePending?: boolean;
  configuredTemplateId?: string | null;
  configuredTemplateName?: string | null;
  url?: string | null;
  description?: string | null;
  blockedBy?: IssueBlockerRef[];
  branchName?: string | null;
  pullRequestUrl?: string | null;
  nextRetryDueAt?: string | null;
  createdAt?: string | null;
}

export interface WorkflowColumnView {
  key: string;
  label: string;
  kind: "backlog" | "todo" | "active" | "gate" | "terminal" | "other";
  terminal: boolean;
  count: number;
  issues: RuntimeIssueView[];
}

export interface StallEventView {
  at: string;
  issueId: string;
  issueIdentifier: string;
  silentMs: number;
  timeoutMs: number;
}

export interface RuntimeSnapshot {
  generatedAt: string;
  counts: { running: number; retrying: number };
  running: RuntimeIssueView[];
  retrying: RuntimeIssueView[];
  queued?: RuntimeIssueView[];
  completed?: RuntimeIssueView[];
  workflowColumns: WorkflowColumnView[];
  codexTotals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    secondsRunning: number;
    costUsd: number;
  };
  rateLimits: unknown;
  recentEvents: RecentEvent[];
  stallEvents?: StallEventView[];
  systemHealth?: SystemHealth;
  webhookHealth?: {
    status: string;
    effectiveIntervalMs: number;
    stats: { deliveriesReceived: number; lastDeliveryAt: string | null; lastEventType: string | null };
    lastDeliveryAt: string | null;
    lastEventType: string | null;
  };
  availableModels?: string[] | null;
}
