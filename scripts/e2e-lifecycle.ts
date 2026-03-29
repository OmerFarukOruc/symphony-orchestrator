#!/usr/bin/env tsx
/**
 * Symphony E2E Lifecycle Test — Main Entry Point
 *
 * Drives the full Symphony lifecycle:
 *   preflight → clean-slate → start-symphony → setup-wizard →
 *   create-issue → wait-pickup → monitor-lifecycle →
 *   verify-pr → verify-linear → restart-resilience →
 *   collect-artifacts → cleanup
 *
 * Usage:
 *   npx tsx scripts/e2e-lifecycle.ts [--config <path>] [--skip-build] [--keep] [--verbose]
 */

import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import type { RunContext, PhaseResult, PhaseFn } from "./e2e-lib/types.js";
import { e2eConfigSchema } from "./e2e-lib/types.js";
import { errorMsg } from "./e2e-lib/helpers.js";
import { preflight, cleanSlate, startSymphony, setupWizard } from "./e2e-lib/phases-startup.js";
import { createIssue, waitPickup, monitorLifecycle, restartResilience } from "./e2e-lib/phases-lifecycle.js";
import { verifyPr, verifyLinear, collectArtifacts, cleanup, shutdownSymphony } from "./e2e-lib/phases-teardown.js";
import {
  JsonlWriter,
  printPhaseResult,
  printFinalReport,
  generateSummary,
  writeSummaryFile,
  diagnoseProblem,
} from "./e2e-lib/reporting.js";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`
Symphony E2E Lifecycle Test

Usage:
  npx tsx scripts/e2e-lifecycle.ts [options]

Options:
  --config <path>   Config file path   (default: scripts/e2e-config.yaml)
  --timeout <sec>   Lifecycle timeout override in seconds
  --skip-build      Skip pnpm build step in preflight
  --keep            Don't auto-cleanup issue + PR
  --keep-symphony   Don't kill Symphony after the run
  --verbose         Debug-level logging
  --help            Show this message
`);
}

// ---------------------------------------------------------------------------
// Phase pipeline
// ---------------------------------------------------------------------------

interface PhaseEntry {
  name: string;
  fn: PhaseFn;
  alwaysRun?: boolean;
}

const PHASES: PhaseEntry[] = [
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

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

import type { E2EConfig } from "./e2e-lib/types.js";

function loadConfig(configPath: string): E2EConfig | null {
  let rawConfig: unknown;
  try {
    rawConfig = parseYaml(readFileSync(configPath, "utf-8"));
  } catch (error_) {
    console.error(`Failed to read config: ${errorMsg(error_)}`);
    return null;
  }

  const parseResult = e2eConfigSchema.safeParse(rawConfig);
  if (!parseResult.success) {
    console.error("Config validation errors:");
    for (const issue of parseResult.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    return null;
  }
  return parseResult.data;
}

// ---------------------------------------------------------------------------
// Pipeline runner
// ---------------------------------------------------------------------------

async function runPipeline(ctx: RunContext): Promise<{ results: PhaseResult[]; failed: boolean }> {
  const results: PhaseResult[] = [];
  let failed = false;

  for (const entry of PHASES) {
    if (failed && !entry.alwaysRun) {
      results.push({ phase: entry.name, status: "skip", durationMs: 0 });
      printPhaseResult(results.at(-1)!);
      continue;
    }

    try {
      const result = await entry.fn(ctx);
      results.push(result);
      printPhaseResult(result);
      if (result.status === "fail") failed = true;
    } catch (error_) {
      const result: PhaseResult = {
        phase: entry.name,
        status: "fail",
        durationMs: 0,
        error: { message: `unhandled: ${errorMsg(error_)}` },
      };
      results.push(result);
      printPhaseResult(result);
      failed = true;
    }
  }

  return { results, failed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const { values } = parseArgs({
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

  if (values.help) {
    printHelp();
    return 0;
  }

  const config = loadConfig(values.config ?? "scripts/e2e-config.yaml");
  if (!config) return 1;

  if (values.timeout) {
    config.timeouts.lifecycle_complete_ms = Number(values.timeout) * 1000;
  }

  const runId = randomUUID().slice(0, 8);
  const reportDir = `e2e-reports/${runId}`;
  await mkdir(reportDir, { recursive: true });

  const events = new JsonlWriter(`${reportDir}/events.jsonl`);

  const ctx: RunContext = {
    runId,
    config,
    startedAt: new Date(),
    symphonyProcess: null,
    symphonyPort: config.server.port,
    baseUrl: `http://127.0.0.1:${config.server.port}`,
    issueIdentifier: null,
    issueId: null,
    issueUrl: null,
    prUrl: null,
    reportDir,
    events,
    verbose: values.verbose ?? false,
    keep: values.keep ?? false,
    skipBuild: values["skip-build"] ?? false,
    keepSymphony: values["keep-symphony"] ?? false,
  };

  // Signal handling
  let interrupted = false;
  const onSignal = async (): Promise<void> => {
    if (interrupted) return;
    interrupted = true;
    console.log("\nInterrupted — running cleanup...");
    try {
      await collectArtifacts(ctx);
      await cleanup(ctx);
    } catch {
      // Best-effort
    }
    await shutdownSymphony(ctx);
    events.close();
    process.exit(1);
  };
  process.on("SIGINT", () => void onSignal());
  process.on("SIGTERM", () => void onSignal());

  // Run
  console.log(`\nSymphony E2E Lifecycle Test — run ${runId}\n`);
  const { results, failed } = await runPipeline(ctx);

  if (!ctx.keepSymphony) await shutdownSymphony(ctx);

  let stderrLog = "";
  try {
    stderrLog = readFileSync(`${reportDir}/symphony-stderr.log`, "utf-8");
  } catch {
    // No stderr log available
  }

  const diagnosis = failed ? diagnoseProblem(stderrLog) : null;
  const summary = generateSummary(ctx, results, diagnosis);
  writeSummaryFile(reportDir, summary);

  console.log("");
  printFinalReport(ctx, results, diagnosis);
  events.close();

  return failed ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

process.exitCode = await main();
