export type NotificationVerbosity = "off" | "critical" | "verbose";

export type NotificationSeverity = "info" | "warning" | "critical";

export type NotificationChannelType = "slack" | "webhook" | "desktop";

export interface NotificationDeliveryFailure {
  channel: string;
  error: string;
}

export interface NotificationDeliverySummary {
  deliveredChannels: string[];
  failedChannels: NotificationDeliveryFailure[];
  skippedDuplicate: boolean;
}

export interface NotificationSlackConfig {
  webhookUrl: string;
  verbosity: NotificationVerbosity;
}

interface BaseNotificationChannelConfig {
  type: NotificationChannelType;
  name: string;
  enabled: boolean;
  minSeverity: NotificationSeverity;
}

export interface NotificationSlackChannelConfig extends BaseNotificationChannelConfig {
  type: "slack";
  webhookUrl: string;
  verbosity: NotificationVerbosity;
}

export interface NotificationWebhookChannelConfig extends BaseNotificationChannelConfig {
  type: "webhook";
  url: string;
  headers: Record<string, string>;
}

export interface NotificationDesktopChannelConfig extends BaseNotificationChannelConfig {
  type: "desktop";
}

export type NotificationChannelConfig =
  | NotificationSlackChannelConfig
  | NotificationWebhookChannelConfig
  | NotificationDesktopChannelConfig;

export interface NotificationConfig {
  slack: NotificationSlackConfig | null;
  channels: NotificationChannelConfig[];
}

export interface NotificationRecord {
  id: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  source: string | null;
  href: string | null;
  read: boolean;
  dedupeKey: string | null;
  metadata: Record<string, unknown> | null;
  deliverySummary: NotificationDeliverySummary | null;
  createdAt: string;
  updatedAt: string;
}

export type TriggerAction = "create_issue" | "re_poll" | "refresh_issue";

export interface TriggerConfig {
  apiKey: string | null;
  allowedActions: TriggerAction[];
  githubSecret: string | null;
  rateLimitPerMinute: number;
}

export type AutomationMode = "implement" | "report" | "findings";

export interface AutomationConfig {
  name: string;
  schedule: string;
  mode: AutomationMode;
  prompt: string;
  enabled: boolean;
  repoUrl: string | null;
}

export interface AlertRuleConfig {
  name: string;
  type: string;
  severity: NotificationSeverity;
  channels: string[];
  cooldownMs: number;
  enabled: boolean;
}

export interface AlertConfig {
  rules: AlertRuleConfig[];
}
