/**
 * Zod schemas for the codex configuration subsection,
 * including sandbox, auth, and provider sub-schemas.
 */

import { z } from "zod";

/** Base enum for codex auth mode values. */
export const codexAuthModeValues = z.enum(["api_key", "openai_login"]);

const codexAuthModeSchema = codexAuthModeValues.catch("api_key");

export const reasoningEffortSchema = z
  .enum(["none", "minimal", "low", "medium", "high", "xhigh"])
  .nullable()
  .catch(null);

const sandboxSecuritySchema = z.object({
  noNewPrivileges: z.boolean().default(true),
  dropCapabilities: z.boolean().default(true),
  gvisor: z.boolean().default(false),
  seccompProfile: z.string().default(""),
});

const sandboxResourcesSchema = z.object({
  memory: z.string().default("4g"),
  memoryReservation: z.string().default("1g"),
  memorySwap: z.string().default("4g"),
  cpus: z.string().default("2.0"),
  tmpfsSize: z.string().default("512m"),
});

const sandboxLogsSchema = z.object({
  driver: z.string().default("json-file"),
  maxSize: z.string().default("50m"),
  maxFile: z.number().default(3),
});

export const sandboxConfigSchema = z.object({
  image: z.string().default("symphony-codex:latest"),
  network: z.string().default(""),
  security: sandboxSecuritySchema.default(() => sandboxSecuritySchema.parse({})),
  resources: sandboxResourcesSchema.default(() => sandboxResourcesSchema.parse({})),
  extraMounts: z.array(z.string()).default([]),
  envPassthrough: z.array(z.string()).default([]),
  logs: sandboxLogsSchema.default(() => sandboxLogsSchema.parse({})),
  egressAllowlist: z.array(z.string()).default([]),
});

const codexAuthSchema = z.object({
  mode: codexAuthModeSchema.default("api_key"),
  sourceHome: z.string().default("~/.codex"),
});

const stringMapSchema = z.record(z.string(), z.string()).default({});

export const codexProviderSchema = z
  .object({
    id: z.string().nullable().default(null),
    name: z.string().nullable().default(null),
    baseUrl: z.string().nullable().default(null),
    envKey: z.string().nullable().default(null),
    envKeyInstructions: z.string().nullable().default(null),
    wireApi: z.string().nullable().default(null),
    requiresOpenaiAuth: z.boolean().default(false),
    httpHeaders: stringMapSchema,
    envHttpHeaders: stringMapSchema,
    queryParams: stringMapSchema,
  })
  .nullable()
  .default(null);

const turnSandboxPolicySchema = z
  .record(z.string(), z.unknown())
  .default({})
  .transform((value): { type: string; [key: string]: unknown } => {
    if (Object.keys(value).length === 0) {
      return {
        type: "workspaceWrite",
        writableRoots: [],
        networkAccess: false,
        readOnlyAccess: { type: "fullAccess" },
      };
    }
    return {
      type: typeof value.type === "string" ? value.type : "workspaceWrite",
      ...value,
    };
  });

const approvalPolicySchema = z.union([z.string(), z.record(z.string(), z.unknown())]).default(() => ({
  reject: {
    sandbox_approval: true,
    rules: true,
    mcp_elicitations: true,
  },
}));

export const codexConfigSchema = z.object({
  command: z.string().default("codex app-server"),
  model: z.string().default("gpt-5.4"),
  reasoningEffort: reasoningEffortSchema.default("high"),
  approvalPolicy: approvalPolicySchema,
  threadSandbox: z.string().default("workspace-write"),
  personality: z.string().default("friendly"),
  turnSandboxPolicy: turnSandboxPolicySchema,
  selfReview: z.boolean().default(false),
  readTimeoutMs: z.number().default(5000),
  turnTimeoutMs: z.number().default(3600000),
  drainTimeoutMs: z.number().default(2000),
  startupTimeoutMs: z.number().default(30000),
  stallTimeoutMs: z.number().default(300000),
  structuredOutput: z.boolean().default(false),
  auth: codexAuthSchema.default(() => codexAuthSchema.parse({})),
  provider: codexProviderSchema,
  sandbox: sandboxConfigSchema.default(() => sandboxConfigSchema.parse({})),
});
