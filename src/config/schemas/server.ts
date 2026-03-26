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

const slackConfigSchema = z
  .object({
    webhookUrl: z.string(),
    verbosity: notificationVerbositySchema.default("critical"),
  })
  .nullable()
  .default(null);

export const notificationConfigSchema = z.object({
  slack: slackConfigSchema,
});

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
