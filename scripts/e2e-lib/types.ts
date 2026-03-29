/**
 * Foundation types and Zod config schema for the Symphony E2E lifecycle test.
 *
 * Defines the validated config shape (loaded from YAML), runtime context
 * carried through every phase, and the phase result contract.
 */

import type { ChildProcess } from "node:child_process";

import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod config schema
// ---------------------------------------------------------------------------

const linearConfigSchema = z.object({
  api_key: z.string().min(1),
  project_slug: z.string().min(1),
  team_id: z.string().min(1),
});

const codexConfigSchema = z.object({
  auth_mode: z.enum(["openai_login", "api_key"]).default("api_key"),
  source_home: z.string().default("~/.codex"),
  model: z.string().default("o3-mini"),
  reasoning_effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).default("low"),
});

const testRepoSchema = z.object({
  url: z.string().min(1),
  branch: z.string().default("main"),
  identifier_prefix: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
});

const githubConfigSchema = z.object({
  token: z.string().min(1),
  test_repo: testRepoSchema,
});

const serverConfigSchema = z.object({
  port: z.number().default(4111),
});

const timeoutsConfigSchema = z.object({
  symphony_startup_ms: z.number().default(15_000),
  setup_complete_ms: z.number().default(30_000),
  issue_pickup_ms: z.number().default(60_000),
  lifecycle_complete_ms: z.number().default(1_800_000),
  pr_verification_ms: z.number().default(30_000),
  graceful_shutdown_ms: z.number().default(10_000),
});

const testIssueSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.number().min(0).max(4).default(3),
});

const cleanupConfigSchema = z.object({
  enabled: z.boolean().default(true),
});

export const e2eConfigSchema = z.object({
  linear: linearConfigSchema,
  codex: codexConfigSchema.default(() => codexConfigSchema.parse({})),
  github: githubConfigSchema,
  server: serverConfigSchema.default(() => serverConfigSchema.parse({})),
  timeouts: timeoutsConfigSchema.default(() => timeoutsConfigSchema.parse({})),
  test_issue: testIssueSchema,
  cleanup: cleanupConfigSchema.default(() => cleanupConfigSchema.parse({})),
});

/** Validated E2E config — inferred from the Zod schema. */
export type E2EConfig = z.infer<typeof e2eConfigSchema>;

// ---------------------------------------------------------------------------
// JsonlWriter stub (defined in reporting.ts — forward-referenced here)
// ---------------------------------------------------------------------------

/** Minimal interface matching the JsonlWriter from reporting.ts. */
export interface JsonlWriter {
  write(event: Record<string, unknown>): void;
  close(): void;
}

// ---------------------------------------------------------------------------
// Core interfaces
// ---------------------------------------------------------------------------

/** Mutable runtime context threaded through every E2E phase. */
export interface RunContext {
  runId: string;
  config: E2EConfig;
  startedAt: Date;
  symphonyProcess: ChildProcess | null;
  symphonyPort: number;
  /** Base URL for the local Symphony HTTP server. */
  baseUrl: string;
  issueIdentifier: string | null;
  issueId: string | null;
  issueUrl: string | null;
  prUrl: string | null;
  /** Directory for run artifacts: `e2e-reports/${runId}/` */
  reportDir: string;
  events: JsonlWriter;
  verbose: boolean;
  /** --keep flag: skip cleanup of issue + PR. */
  keep: boolean;
  /** --skip-build flag: skip pnpm build in preflight. */
  skipBuild: boolean;
  /** --keep-symphony flag: don't kill Symphony after run. */
  keepSymphony: boolean;
}

/** Result returned by each lifecycle phase. */
export interface PhaseResult {
  phase: string;
  status: "pass" | "fail" | "skip";
  durationMs: number;
  error?: { message: string; code?: string; stack?: string };
  data?: Record<string, unknown>;
}

/** Async function signature for a single E2E phase. */
export type PhaseFn = (ctx: RunContext) => Promise<PhaseResult>;

/** Structured diagnosis produced by error analysis helpers. */
export interface DiagnosisResult {
  category: string;
  summary: string;
  suggestedFix: string;
}
