// Intentional high-fanout type barrel.
// Epic #410 removes avoidable wrapper churn elsewhere, but this file remains
// because its broad re-export surface is structural to the current codebase and
// deleting it would create noisy import fanout without deepening boundaries.

export type { Issue, IssueBlockerRef } from "./types/issue.js";

export type {
  AttemptRecord,
  AttemptEvent,
  AttemptCheckpointRecord,
  CheckpointTrigger,
  RunOutcome,
  RetryEntry,
  RecentEvent,
} from "./types/attempt.js";

export type { RuntimeSnapshot, RuntimeIssueView, WorkflowColumnView, StallEventView } from "./types/runtime.js";

export type {
  ServiceConfig,
  TrackerConfig,
  GitHubConfig,
  RepoConfig,
  PollingConfig,
  WebhookConfig,
  WorkspaceConfig,
  WorkspaceStrategy,
  ServerConfig,
  StateMachineConfig,
  StateStageConfig,
  StateStageKind,
} from "./types/config.js";

export type {
  CodexConfig,
  CodexAuthConfig,
  CodexAuthMode,
  CodexProviderConfig,
  SandboxConfig,
  SandboxSecurityConfig,
  SandboxResourceConfig,
  SandboxLogConfig,
} from "./types/codex.js";

export type { ModelSelection, ReasoningEffort, TokenUsageSnapshot } from "./types/model.js";

export type { Workspace } from "./types/workspace.js";

export type { SystemHealth, HealthStatus } from "./types/health.js";

export type { PrRecord, MergePolicy } from "./types/pr.js";

export type { RisolutoLogger } from "./types/logger.js";

// AgentConfig is defined co-located with its Zod schema; re-exported here for consumers.
export type { AgentConfig } from "../config/schemas/agent.js";

export type {
  AlertConfig,
  AlertRuleConfig,
  AutomationConfig,
  AutomationMode,
  NotificationConfig,
  NotificationChannelConfig,
  NotificationDeliveryFailure,
  NotificationDeliverySummary,
  NotificationDesktopChannelConfig,
  NotificationRecord,
  NotificationSeverity,
  NotificationSlackChannelConfig,
  NotificationSlackConfig,
  NotificationVerbosity,
  NotificationWebhookChannelConfig,
  TriggerAction,
  TriggerConfig,
} from "./notification-types.js";

export interface WorkflowDefinition {
  config: Record<string, unknown>;
  promptTemplate: string;
}

export interface ValidationError {
  code: string;
  message: string;
}
