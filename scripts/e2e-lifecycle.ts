#!/usr/bin/env tsx
/**
 * Symphony E2E lifecycle test — main entry point.
 *
 * Orchestrates a full create-issue -> pickup -> solve -> PR -> verify pipeline
 * against a real Linear + GitHub environment. Designed to run from CI or locally.
 *
 * Usage:
 *   npx tsx scripts/e2e-lifecycle.ts [--config path] [--keep] [--verbose]
 *   bash scripts/run-e2e.sh [--config path] [--keep] [--verbose]
 */
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { RunContext, PhaseResult, E2EConfig, PhaseName } from "./e2e-lib/types.js";
import { e2eConfigSchema } from "./e2e-lib/types.js";
import { printPhaseResult, printSummary } from "./e2e-lib/helpers.js";
import { preflight, cleanSlate } from "./e2e-lib/phases-setup.js";
import { startSymphony, setupWizard, createIssue } from "./e2e-lib/phases-launch.js";
import { waitPickup, monitorLifecycle, restartResilience } from "./e2e-lib/phases-monitor.js";
import { verifyPr, verifyLinear, collectArtifacts, cleanup, shutdownSymphony } from "./e2e-lib/phases-teardown.js";

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function errorMsg(error_: unknown): string {
  return error_ instanceof Error ? error_.message : String(error_);
}

/* ------------------------------------------------------------------ */
/*  CLI argument parsing                                               */
/* ------------------------------------------------------------------ */

const { values: args } = parseArgs({
  options: {
    config: { type: "string", default: "scripts/e2e-config.yaml" },
    timeout: { type: "string" },
    "skip-build": { type: "boolean", default: false },
    keep: { type: "boolean", default: false },
    "keep-symphony": { type: "boolean", default: false },
    verbose: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (args.help) {
  console.log(`
Symphony E2E Lifecycle Test

Usage:
  npx tsx scripts/e2e-lifecycle.ts [options]

Options:
  --config <path>       Config file path (default: scripts/e2e-config.yaml)
  --timeout <seconds>   Lifecycle timeout override
  --skip-build          Skip pnpm build step
  --keep                Don't auto-cleanup issue + PR
  --keep-symphony       Don't kill Symphony after run
  --verbose             Debug-level logging
  --help                Show this message
`);
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/*  Config loading                                                     */
/* ------------------------------------------------------------------ */

async function loadConfig(configPath: string): Promise<E2EConfig> {
  const absolutePath = resolve(configPath);
  const raw = await readFile(absolutePath, "utf-8");
  const parsed: unknown = parseYaml(raw);
  return e2eConfigSchema.parse(parsed);
}

/* ------------------------------------------------------------------ */
/*  Phase pipeline                                                     */
/* ------------------------------------------------------------------ */

interface PhaseEntry {
  name: PhaseName;
  fn: (ctx: RunContext) => Promise<PhaseResult>;
  alwaysRun?: boolean;
}

const phases: PhaseEntry[] = [
  { name: "preflight", fn: preflight },
  { name: "clean-slate", fn: cleanSlate },
  { name: "start-symphony", fn: startSymphony },
  { name: "setup-wizard", fn: setupWizard },
  { name: "create-issue", fn: createIssue },
  { name: "wait-pickup", fn: waitPickup },
  { name: "monitor-lifecycle", fn: monitorLifecycle },
  { name: "verify-pr", fn: verifyPr },
  { name: "verify-linear", fn: verifyLinear },
  { name: "restart-resilience", fn: restartResilience },
  { name: "collect-artifacts", fn: collectArtifacts, alwaysRun: true },
  { name: "cleanup", fn: cleanup, alwaysRun: true },
];

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main(): Promise<number> {
  const runId = randomUUID().slice(0, 8);
  const reportDir = resolve(`e2e-reports/${runId}`);
  await mkdir(reportDir, { recursive: true });

  console.log(`\n  Symphony E2E Lifecycle Test`);
  console.log(`  Run ID:     ${runId}`);
  console.log(`  Report dir: ${reportDir}\n`);

  let config: E2EConfig;
  try {
    config = await loadConfig(args.config ?? "scripts/e2e-config.yaml");
  } catch (error_) {
    console.error(`[fatal] failed to load config: ${errorMsg(error_)}`);
    return 1;
  }

  // Apply CLI timeout override
  if (args.timeout) {
    const overrideMs = Number(args.timeout) * 1000;
    if (!Number.isFinite(overrideMs) || overrideMs <= 0) {
      console.error("[fatal] --timeout must be a positive number of seconds");
      return 1;
    }
    config.timeouts.lifecycle_complete_ms = overrideMs;
  }

  const ctx: RunContext = {
    runId,
    config,
    reportDir,
    workspaceDir: null,
    symphonyProcess: null,
    issueId: null,
    issueIdentifier: null,
    prUrl: null,
    flags: {
      keep: args.keep ?? false,
      keepSymphony: args["keep-symphony"] ?? false,
      skipBuild: args["skip-build"] ?? false,
      verbose: args.verbose ?? false,
    },
  };

  const results: PhaseResult[] = [];
  let hasFailed = false;

  // Signal handling — run cleanup on SIGINT/SIGTERM
  const signalHandler = async (signal: string) => {
    console.warn(`\n[${signal}] interrupted — running cleanup phases...`);
    hasFailed = true;

    try {
      if (!ctx.flags?.keepSymphony) {
        await shutdownSymphony(ctx);
      }
      const artifactResult = await collectArtifacts(ctx);
      printPhaseResult(artifactResult);
      results.push(artifactResult);

      const cleanupResult = await cleanup(ctx);
      printPhaseResult(cleanupResult);
      results.push(cleanupResult);
    } catch (error_) {
      console.error(`[${signal}] cleanup failed: ${errorMsg(error_)}`);
    }

    await writeSummary(reportDir, results, runId);
    process.exit(1);
  };

  process.on("SIGINT", () => void signalHandler("SIGINT"));
  process.on("SIGTERM", () => void signalHandler("SIGTERM"));

  // Run pipeline
  for (const phase of phases) {
    if (hasFailed && !phase.alwaysRun) {
      results.push({
        phase: phase.name,
        status: "skip",
        durationMs: 0,
      });
      continue;
    }

    try {
      const result = await phase.fn(ctx);
      results.push(result);
      printPhaseResult(result);

      if (result.status === "fail") {
        hasFailed = true;
      }
    } catch (error_) {
      const result: PhaseResult = {
        phase: phase.name,
        status: "fail",
        durationMs: 0,
        error: `unhandled: ${errorMsg(error_)}`,
      };
      results.push(result);
      printPhaseResult(result);
      hasFailed = true;
    }
  }

  // Shutdown Symphony unless --keep-symphony
  if (!ctx.flags?.keepSymphony) {
    await shutdownSymphony(ctx);
  }

  // Summary
  printSummary(results);
  await writeSummary(reportDir, results, runId);

  return hasFailed ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/*  Summary file                                                       */
/* ------------------------------------------------------------------ */

async function writeSummary(reportDir: string, results: PhaseResult[], runId: string): Promise<void> {
  const summary = {
    runId,
    timestamp: new Date().toISOString(),
    phases: results,
    overall: results.every((r) => r.status === "pass" || r.status === "skip") ? "pass" : "fail",
  };

  const summaryPath = join(reportDir, "summary.json");
  await writeFile(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf-8");
  console.log(`\n  Summary written to: ${summaryPath}\n`);
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                        */
/* ------------------------------------------------------------------ */

process.exitCode = await main();
