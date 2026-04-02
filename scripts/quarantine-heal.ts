#!/usr/bin/env tsx
/**
 * Nightly quarantine healing script.
 *
 * Reads Vitest JSON output and updates `quarantine.json`:
 * - Tests that passed: increment `passCount`
 * - Tests that failed: reset `passCount` to 0
 * - Tests with `passCount >= 5`: auto-removed (healed)
 * - Entries whose file no longer exists: auto-removed
 *
 * Writes atomically via temp file + rename to prevent corruption.
 *
 * Usage:
 *   npx tsx scripts/quarantine-heal.ts --results reports/vitest-results.json
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { HEAL_THRESHOLD, loadEntries, QUARANTINE_PATH, type QuarantineEntry } from "./quarantine-shared.js";

interface VitestTestResult {
  name: string;
  status: "passed" | "failed" | "skipped" | "pending";
}

interface VitestTestFile {
  filepath: string;
  tests: VitestTestResult[];
}

interface VitestJsonOutput {
  testResults: VitestTestFile[];
}

export function loadTestResults(resultsPath: string): Map<string, Map<string, string>> {
  const resultMap = new Map<string, Map<string, string>>();

  try {
    const raw = readFileSync(resultsPath, "utf-8");
    const output: VitestJsonOutput = JSON.parse(raw);

    for (const fileResult of output.testResults) {
      const normalizedPath = path.resolve(fileResult.filepath);
      const testMap = new Map<string, string>();

      for (const test of fileResult.tests) {
        testMap.set(test.name, test.status);
      }

      resultMap.set(normalizedPath, testMap);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error reading test results: ${message}`);
    process.exitCode = 1;
  }

  return resultMap;
}

export function saveEntriesAtomically(entries: QuarantineEntry[]): void {
  const tmpPath = QUARANTINE_PATH + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(entries, null, 2) + "\n", "utf-8");
  renameSync(tmpPath, QUARANTINE_PATH);
}

function processQuarantineEntry(
  entry: QuarantineEntry,
  testResults: Map<string, Map<string, string>>,
): { remaining: QuarantineEntry; healed?: QuarantineEntry; stale?: boolean; failedReset?: boolean } {
  const resolvedFile = path.resolve(entry.file);

  if (!existsSync(resolvedFile)) {
    return { remaining: entry, stale: true };
  }

  const fileResults = testResults.get(resolvedFile);
  const testStatus = fileResults?.get(entry.testName);

  if (testStatus === "passed") {
    const updatedEntry = { ...entry, passCount: entry.passCount + 1 };
    if (updatedEntry.passCount >= HEAL_THRESHOLD) {
      return { remaining: updatedEntry, healed: updatedEntry };
    }
    return { remaining: updatedEntry };
  }

  if (testStatus === "failed") {
    return { remaining: { ...entry, passCount: 0 }, failedReset: true };
  }

  return { remaining: entry };
}

function logHealingReport(
  entries: QuarantineEntry[],
  healed: QuarantineEntry[],
  staleRemoved: QuarantineEntry[],
  failedReset: QuarantineEntry[],
  stillQuarantined: QuarantineEntry[],
  remaining: QuarantineEntry[],
): void {
  console.log("Quarantine healing report:");
  console.log(`  Total entries processed: ${entries.length}`);

  if (healed.length > 0) {
    console.log(`\n  Healed (auto-removed after ${HEAL_THRESHOLD} consecutive passes):`);
    for (const entry of healed) {
      console.log(`    - "${entry.testName}" (${entry.file})`);
    }
  }

  if (staleRemoved.length > 0) {
    console.log("\n  Stale (file no longer exists, auto-removed):");
    for (const entry of staleRemoved) {
      console.log(`    - "${entry.testName}" (${entry.file})`);
    }
  }

  if (failedReset.length > 0) {
    console.log("\n  Failed (passCount reset to 0):");
    for (const entry of failedReset) {
      console.log(`    - "${entry.testName}" (${entry.file})`);
    }
  }

  if (stillQuarantined.length > 0) {
    console.log("\n  Still quarantined:");
    for (const entry of stillQuarantined) {
      console.log(`    - "${entry.testName}" (${entry.file}) — passCount: ${entry.passCount}/${HEAL_THRESHOLD}`);
    }
  }

  console.log(`\n  Remaining quarantined: ${remaining.length}`);

  const passCountChanged = stillQuarantined.some((e) => {
    const original = entries.find((o) => o.testName === e.testName && o.file === e.file);
    return original !== undefined && e.passCount !== original.passCount;
  });
  const changed = healed.length > 0 || staleRemoved.length > 0 || failedReset.length > 0 || passCountChanged;
  console.log(changed ? "\n  quarantine.json was updated." : "\n  No changes to quarantine.json.");
}

export function healQuarantine(resultsPathArg: string): void {
  const entries = loadEntries();

  if (entries.length === 0) {
    console.log("Quarantine is empty — nothing to heal.");
    return;
  }

  const resultsPath = path.resolve(resultsPathArg);
  if (!existsSync(resultsPath)) {
    console.error(`Error: Results file does not exist: ${resultsPathArg}`);
    process.exitCode = 1;
    return;
  }

  const testResults = loadTestResults(resultsPath);
  if (process.exitCode === 1) {
    return;
  }

  const healed: QuarantineEntry[] = [];
  const staleRemoved: QuarantineEntry[] = [];
  const stillQuarantined: QuarantineEntry[] = [];
  const failedReset: QuarantineEntry[] = [];
  const remaining: QuarantineEntry[] = [];

  for (const entry of entries) {
    const result = processQuarantineEntry(entry, testResults);

    if (result.stale) {
      staleRemoved.push(entry);
      continue;
    }

    if (result.healed) {
      healed.push(result.healed);
      continue;
    }

    remaining.push(result.remaining);

    if (result.failedReset) {
      failedReset.push(result.remaining);
    } else {
      stillQuarantined.push(result.remaining);
    }
  }

  saveEntriesAtomically(remaining);
  logHealingReport(entries, healed, staleRemoved, failedReset, stillQuarantined, remaining);
}

export function runCli(args: string[] = process.argv.slice(2)): void {
  const { values } = parseArgs({
    args,
    options: {
      results: { type: "string" },
    },
  });

  if (!values.results) {
    console.error("Usage: npx tsx scripts/quarantine-heal.ts --results <path-to-vitest-json>");
    process.exitCode = 1;
    return;
  }

  healQuarantine(values.results);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
