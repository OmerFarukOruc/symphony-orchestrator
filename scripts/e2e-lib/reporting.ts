/**
 * Reporting, diagnosis, and summary generation for the E2E lifecycle test.
 *
 * Provides JSONL event logging, failure categorization, phase-level terminal
 * output, and the final `e2e-summary.json` artifact.
 */

import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import type { WriteStream } from "node:fs";
import { join } from "node:path";
import type { DiagnosisResult, PhaseResult, RunContext } from "./types.js";

// ── JSONL Writer ────────────────────────────────────────────────────────────

/** Append-only JSONL event logger. Auto-adds an ISO timestamp to every line. */
export class JsonlWriter {
  private readonly stream: WriteStream;

  constructor(filePath: string) {
    this.stream = createWriteStream(filePath, { flags: "a" });
  }

  /** Append a single JSON line with an auto-injected `ts` field. */
  write(event: Record<string, unknown>): void {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
    this.stream.write(line + "\n");
  }

  /** Flush and close the underlying stream. */
  close(): void {
    this.stream.end();
  }
}

// ── Diagnosis ───────────────────────────────────────────────────────────────

interface DiagnosisRule {
  category: string;
  test: (stderr: string, attempt?: Record<string, unknown>) => boolean;
  summary: string;
  suggestedFix: string;
}

const DIAGNOSIS_RULES: DiagnosisRule[] = [
  {
    category: "AUTH_EXPIRED",
    test: (stderr) => /\b401\b/.test(stderr) || /unauthorized/i.test(stderr),
    summary: "Authentication token expired or invalid",
    suggestedFix: "Refresh LINEAR_API_KEY and GITHUB_TOKEN, then re-run",
  },
  {
    category: "DOCKER_OOM",
    test: (stderr, attempt) => /OOMKilled/i.test(stderr) || attempt?.["exitCode"] === 137,
    summary: "Container was killed by the OOM killer (exit 137)",
    suggestedFix: "Increase Docker memory limit or reduce agent concurrency",
  },
  {
    category: "RATE_LIMITED",
    test: (stderr) => /\b429\b/.test(stderr) || /rate.?limit/i.test(stderr),
    summary: "API rate limit exceeded",
    suggestedFix: "Wait for the rate-limit window to reset and retry",
  },
  {
    category: "AGENT_TIMEOUT",
    test: (stderr) => /stall detected/i.test(stderr) || /no events for/i.test(stderr),
    summary: "Agent stalled with no progress",
    suggestedFix: "Check agent logs for hangs; consider increasing the timeout",
  },
  {
    category: "AGENT_CRASH",
    test: (stderr) => /uncaught exception/i.test(stderr) || /non-zero exit/i.test(stderr),
    summary: "Agent process crashed unexpectedly",
    suggestedFix: "Inspect the agent stderr log for the root cause",
  },
  {
    category: "CONFIG_ERROR",
    test: (stderr) => /validation fail/i.test(stderr) || /missing required/i.test(stderr),
    summary: "Configuration validation failed",
    suggestedFix: "Check the workflow file against the config schema",
  },
  {
    category: "NETWORK_ERROR",
    test: (stderr) => /ECONNREFUSED/.test(stderr) || /ETIMEDOUT/.test(stderr),
    summary: "Network connectivity issue",
    suggestedFix: "Verify network access to Linear and GitHub APIs",
  },
  {
    category: "BUILD_FAILURE",
    test: (stderr) => /pnpm build failed/i.test(stderr) || /tsc.*error/i.test(stderr),
    summary: "Project build step failed",
    suggestedFix: "Run `pnpm run build` locally and fix compilation errors",
  },
];

/**
 * Classify a failure by scanning stderr and the attempt record for known
 * patterns. Returns the first matching category or `UNKNOWN`.
 */
export function diagnoseProblem(stderrLog: string, attemptRecord?: Record<string, unknown>): DiagnosisResult {
  for (const rule of DIAGNOSIS_RULES) {
    if (rule.test(stderrLog, attemptRecord)) {
      return {
        category: rule.category,
        summary: rule.summary,
        suggestedFix: rule.suggestedFix,
      };
    }
  }
  return {
    category: "UNKNOWN",
    summary: "Failure does not match any known pattern",
    suggestedFix: "Review stderr and attempt record manually",
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** True when no phase has failed. */
function allPassed(phases: PhaseResult[]): boolean {
  return phases.every((phase) => phase.status !== "fail");
}

// ── Summary Generation ──────────────────────────────────────────────────────

/** Extract a `data` field from the first phase matching `name`, or `null`. */
function phaseData(phases: PhaseResult[], name: string): Record<string, unknown> | null {
  const found = phases.find((phase) => phase.phase === name);
  return (found?.data as Record<string, unknown>) ?? null;
}

/**
 * Build the structured summary object written to `e2e-summary.json`.
 *
 * Phase `data` bags carry intermediate results (attempt details, PR metadata)
 * that get promoted into top-level summary sections.
 */
export function generateSummary(
  ctx: RunContext,
  phases: PhaseResult[],
  diagnosis: DiagnosisResult | null,
): Record<string, unknown> {
  const finishedAt = new Date();
  const verdict = allPassed(phases) ? "pass" : "fail";

  const attemptData = phaseData(phases, "monitor-lifecycle");
  const prData = phaseData(phases, "verify-pr");
  const cleanupData = phaseData(phases, "cleanup");

  return {
    verdict,
    run_id: ctx.runId,
    started_at: ctx.startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - ctx.startedAt.getTime(),
    config_summary: {
      model: ctx.config.codex.model,
      project: ctx.config.linear.project_slug,
      repo: `${ctx.config.github.test_repo.owner}/${ctx.config.github.test_repo.repo}`,
    },
    phases: phases.map((phase) => ({
      name: phase.phase,
      status: phase.status,
      duration_ms: phase.durationMs,
    })),
    issue: {
      identifier: ctx.issueIdentifier,
      url: ctx.issueUrl,
      final_state: attemptData?.["finalState"] ?? null,
    },
    attempt: attemptData,
    pr: prData
      ? {
          url: ctx.prUrl,
          commits: prData["commits"] ?? 0,
          additions: prData["additions"] ?? 0,
          deletions: prData["deletions"] ?? 0,
        }
      : null,
    cleanup: cleanupData ?? { pr_closed: false, issue_canceled: false },
    diagnosis: diagnosis
      ? {
          category: diagnosis.category,
          summary: diagnosis.summary,
          suggested_fix: diagnosis.suggestedFix,
        }
      : null,
    errors: phases
      .filter((phase) => phase.error)
      .map((phase) => ({
        phase: phase.phase,
        message: phase.error?.message,
        code: phase.error?.code ?? null,
      })),
  };
}

// ── Terminal Output ─────────────────────────────────────────────────────────

/**
 * Print a single phase result line to the terminal.
 *
 * ```
 *   preflight          pass    1.2s
 *   monitor-lifecycle  FAIL  300.0s   timeout
 * ```
 */
export function printPhaseResult(result: PhaseResult): void {
  const name = result.phase.padEnd(20);
  const status = (result.status === "fail" ? "FAIL" : result.status).padEnd(6);
  const duration = `${(result.durationMs / 1000).toFixed(1)}s`;

  const notes: string[] = [];
  if (result.data) {
    const brief = result.data["note"] ?? result.data["identifier"] ?? result.data["turns"];
    if (brief !== undefined) {
      notes.push(String(brief));
    }
  }
  if (result.error) {
    notes.push(result.error.message);
  }

  const suffix = notes.length > 0 ? `   ${notes.join(" | ")}` : "";
  console.log(`  ${name}${status}${duration.padStart(7)}${suffix}`);
}

/**
 * Print the final verdict banner after all phases complete.
 *
 * ```
 *   VERDICT: PASS  (220.4s)
 *   Issue:   SYM-42 -- https://linear.app/...
 *   PR:      https://github.com/.../pull/14
 *   Report:  e2e-reports/abc123/
 * ```
 */
export function printFinalReport(ctx: RunContext, phases: PhaseResult[], diagnosis: DiagnosisResult | null): void {
  const totalMs = phases.reduce((sum, phase) => sum + phase.durationMs, 0);
  const totalSec = (totalMs / 1000).toFixed(1);
  const verdict = allPassed(phases) ? "PASS" : "FAIL";

  console.log("");
  console.log(`  VERDICT: ${verdict}  (${totalSec}s)`);

  if (ctx.issueIdentifier) {
    const issueLine = ctx.issueUrl ? `${ctx.issueIdentifier} -- ${ctx.issueUrl}` : ctx.issueIdentifier;
    console.log(`  Issue:   ${issueLine}`);
  }

  if (ctx.prUrl) {
    console.log(`  PR:      ${ctx.prUrl}`);
  }

  console.log(`  Report:  ${ctx.reportDir}`);

  if (diagnosis && diagnosis.category !== "UNKNOWN") {
    console.log("");
    console.log(`  -> Diagnosis: [${diagnosis.category}] ${diagnosis.summary}`);
    console.log(`  -> Fix:       ${diagnosis.suggestedFix}`);
  }

  console.log("");
}

// ── File Output ─────────────────────────────────────────────────────────────

/** Write the structured summary as pretty-printed JSON to the report directory. */
export function writeSummaryFile(reportDir: string, summary: Record<string, unknown>): void {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, "e2e-summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf-8");
}

// ── JUnit XML Output ──────────────────────────────────────────────────────

/** Escape XML special characters in a string. */
function escapeXml(text: string): string {
  return text.replaceAll(/&/g, "&amp;").replaceAll(/</g, "&lt;").replaceAll(/>/g, "&gt;").replaceAll(/"/g, "&quot;");
}

/**
 * Generate a JUnit XML string from phase results.
 *
 * Produces one `<testsuite>` with one `<testcase>` per phase.
 * Failed phases include a `<failure>` element, skipped phases
 * include a `<skipped/>` element.
 */
export function generateJunitXml(phases: PhaseResult[]): string {
  const failures = phases.filter((p) => p.status === "fail").length;
  const skipped = phases.filter((p) => p.status === "skip").length;
  const totalTimeSec = phases.reduce((sum, p) => sum + p.durationMs / 1000, 0).toFixed(3);

  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuite name="risoluto-e2e" tests="${String(phases.length)}" failures="${String(failures)}" skipped="${String(skipped)}" time="${totalTimeSec}">`,
  ];

  for (const phase of phases) {
    const timeSec = (phase.durationMs / 1000).toFixed(3);
    const name = escapeXml(phase.phase);

    if (phase.status === "fail") {
      const message = escapeXml(phase.error?.message ?? "unknown error");
      lines.push(`  <testcase name="${name}" classname="risoluto-e2e" time="${timeSec}">`);
      lines.push(`    <failure message="${message}">${message}</failure>`);
      lines.push(`  </testcase>`);
    } else if (phase.status === "skip") {
      lines.push(`  <testcase name="${name}" classname="risoluto-e2e" time="${timeSec}">`);
      lines.push(`    <skipped/>`);
      lines.push(`  </testcase>`);
    } else {
      lines.push(`  <testcase name="${name}" classname="risoluto-e2e" time="${timeSec}"/>`);
    }
  }

  lines.push(`</testsuite>`);
  return lines.join("\n") + "\n";
}

/** Write JUnit XML to the report directory alongside e2e-summary.json. */
export function writeJunitXml(reportDir: string, phases: PhaseResult[]): void {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, "e2e-junit.xml"), generateJunitXml(phases), "utf-8");
}
