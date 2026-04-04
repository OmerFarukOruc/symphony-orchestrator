/**
 * Zod schemas for server, polling, notification,
 * GitHub, repo, and state machine config subsections.
 */

import { z } from "zod";

export const pollingConfigSchema = z.object({
  intervalMs: z.number().default(15000),
});

export const serverConfigSchema = z.object({
  port: z.number().default(4000),
});

const notificationVerbositySchema = z.enum(["off", "critical", "verbose"]).catch("critical");
const notificationSeveritySchema = z.enum(["info", "warning", "critical"]).catch("info");

const slackConfigSchema = z
  .object({
    webhookUrl: z.string(),
    verbosity: notificationVerbositySchema.default("critical"),
  })
  .nullable()
  .default(null);

const notificationChannelBaseSchema = z.object({
  name: z.string(),
  enabled: z.boolean().default(true),
  minSeverity: notificationSeveritySchema.default("info"),
});

const slackChannelConfigSchema = notificationChannelBaseSchema.extend({
  type: z.literal("slack"),
  webhookUrl: z.string(),
  verbosity: notificationVerbositySchema.default("critical"),
});

const webhookChannelConfigSchema = notificationChannelBaseSchema.extend({
  type: z.literal("webhook"),
  url: z.string(),
  headers: z.record(z.string(), z.string()).default({}),
});

const desktopChannelConfigSchema = notificationChannelBaseSchema.extend({
  type: z.literal("desktop"),
});

export const notificationConfigSchema = z.object({
  slack: slackConfigSchema,
  channels: z
    .array(z.union([slackChannelConfigSchema, webhookChannelConfigSchema, desktopChannelConfigSchema]))
    .default([]),
});

export const triggerConfigSchema = z
  .object({
    apiKey: z.string().nullable().default(null),
    allowedActions: z.array(z.enum(["create_issue", "re_poll", "refresh_issue"])).default([]),
    githubSecret: z.string().nullable().default(null),
    rateLimitPerMinute: z.number().default(30),
  })
  .nullable()
  .default(null);

export const automationConfigSchema = z.object({
  name: z.string(),
  schedule: z.string(),
  mode: z.enum(["implement", "report", "findings"]).default("report"),
  prompt: z.string(),
  enabled: z.boolean().default(true),
  repoUrl: z.string().nullable().default(null),
});

export const alertConfigSchema = z
  .object({
    rules: z
      .array(
        z.object({
          name: z.string(),
          type: z.string(),
          severity: notificationSeveritySchema.default("critical"),
          channels: z.array(z.string()).default([]),
          cooldownMs: z.number().default(300000),
          enabled: z.boolean().default(true),
        }),
      )
      .default([]),
  })
  .nullable()
  .default(null);

export const gitHubConfigSchema = z
  .object({
    token: z.string(),
    apiBaseUrl: z.string().default("https://api.github.com"),
  })
  .nullable()
  .default(null);

export const repoConfigSchema = z.object({
  repoUrl: z.string(),
  defaultBranch: z.string().default("main"),
  identifierPrefix: z.string().nullable().default(null),
  label: z.string().nullable().default(null),
  githubOwner: z.string().nullable().default(null),
  githubRepo: z.string().nullable().default(null),
  githubTokenEnv: z.string().nullable().default(null),
});

const stageKindSchema = z.enum(["backlog", "todo", "active", "gate", "terminal"]);

const stateStageConfigSchema = z.object({
  name: z.string().min(1),
  kind: stageKindSchema,
});

export const stateMachineConfigSchema = z
  .object({
    stages: z.array(stateStageConfigSchema).default([]),
    transitions: z.record(z.string(), z.array(z.string())).default({}),
  })
  .nullable()
  .default(null);
