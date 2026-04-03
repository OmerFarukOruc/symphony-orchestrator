import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const coverageRoot = path.join(repoRoot, "coverage", "backend-integration");
const deterministicCoverageDir = path.join(coverageRoot, "deterministic");
const liveCoverageDir = path.join(coverageRoot, "live");
const summaryPath = path.join(coverageRoot, "summary.json");
const uncoveredPath = path.join(coverageRoot, "uncovered-files.json");
const mergedCoveragePath = path.join(coverageRoot, "coverage-final.json");

const requiredLiveEnv = {
  LINEAR_API_KEY: (value) => value.trim().length > 0,
  E2E_GITHUB_TOKEN: (value) => value.trim().length > 0,
  E2E_GITHUB_REPO: (value) => value.trim().length > 0,
  DOCKER_TEST_ENABLED: (value) => value === "1",
};

const parsed = parseArgs({
  allowPositionals: false,
  options: {
    "require-live": { type: "boolean", default: false },
    "threshold-lines": { type: "string" },
    "threshold-statements": { type: "string" },
    "threshold-functions": { type: "string" },
    "threshold-branches": { type: "string" },
  },
});

function parseThreshold(value, envName) {
  if (value === undefined) {
    const envValue = process.env[envName];
    return envValue === undefined ? null : Number(envValue);
  }
  return Number(value);
}

const thresholds = {
  lines: parseThreshold(parsed.values["threshold-lines"], "RISOLUTO_BACKEND_COVERAGE_LINES"),
  statements: parseThreshold(parsed.values["threshold-statements"], "RISOLUTO_BACKEND_COVERAGE_STATEMENTS"),
  functions: parseThreshold(parsed.values["threshold-functions"], "RISOLUTO_BACKEND_COVERAGE_FUNCTIONS"),
  branches: parseThreshold(parsed.values["threshold-branches"], "RISOLUTO_BACKEND_COVERAGE_BRANCHES"),
};

function run(label, args) {
  console.log(`[backend-coverage] ${label}`);
  const result = spawnSync("pnpm", args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    const exitCode = result.status ?? 1;
    throw new Error(`${label} failed with exit code ${exitCode}`);
  }
}

function cloneEntry(entry) {
  return {
    path: entry.path,
    statementMap: structuredClone(entry.statementMap),
    fnMap: structuredClone(entry.fnMap),
    branchMap: structuredClone(entry.branchMap),
    s: structuredClone(entry.s),
    f: structuredClone(entry.f),
    b: structuredClone(entry.b),
    meta: structuredClone(entry.meta ?? {}),
  };
}

function mergeCounterMap(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = Math.max(target[key] ?? 0, value);
  }
}

function mergeBranchCounterMap(target, source) {
  for (const [key, value] of Object.entries(source)) {
    const sourceValues = Array.isArray(value) ? value : [];
    const targetValues = Array.isArray(target[key]) ? target[key] : [];
    const mergedValues = [];
    for (let index = 0; index < Math.max(targetValues.length, sourceValues.length); index += 1) {
      mergedValues.push(Math.max(targetValues[index] ?? 0, sourceValues[index] ?? 0));
    }
    target[key] = mergedValues;
  }
}

function mergeCoverageMaps(...maps) {
  const merged = {};
  for (const map of maps) {
    for (const [filePath, entry] of Object.entries(map)) {
      const current = merged[filePath];
      if (!current) {
        merged[filePath] = cloneEntry(entry);
        continue;
      }
      mergeCounterMap(current.s, entry.s);
      mergeCounterMap(current.f, entry.f);
      mergeBranchCounterMap(current.b, entry.b);
    }
  }
  return merged;
}

function countCovered(values) {
  return values.filter((value) => value > 0).length;
}

function flattenBranchCounters(branchCounters) {
  return Object.values(branchCounters).flat();
}

function computeMetricSummary(covered, total) {
  return {
    covered,
    total,
    pct: total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2)),
  };
}

function summarizeCoverage(coverageMap) {
  const backendPrefix = `${repoRoot}${path.sep}src${path.sep}`;
  const files = [];

  let statementCovered = 0;
  let statementTotal = 0;
  let functionCovered = 0;
  let functionTotal = 0;
  let branchCovered = 0;
  let branchTotal = 0;

  for (const entry of Object.values(coverageMap)) {
    if (!entry.path.startsWith(backendPrefix)) {
      continue;
    }

    const statements = Object.values(entry.s);
    const functions = Object.values(entry.f);
    const branches = flattenBranchCounters(entry.b);
    const relPath = path.relative(repoRoot, entry.path);

    const fileStatementsCovered = countCovered(statements);
    const fileFunctionsCovered = countCovered(functions);
    const fileBranchesCovered = countCovered(branches);

    statementCovered += fileStatementsCovered;
    statementTotal += statements.length;
    functionCovered += fileFunctionsCovered;
    functionTotal += functions.length;
    branchCovered += fileBranchesCovered;
    branchTotal += branches.length;

    const uncoveredStatements = statements.length - fileStatementsCovered;
    const uncoveredFunctions = functions.length - fileFunctionsCovered;
    const uncoveredBranches = branches.length - fileBranchesCovered;

    if (uncoveredStatements > 0 || uncoveredFunctions > 0 || uncoveredBranches > 0) {
      files.push({
        file: relPath,
        uncoveredStatements,
        uncoveredFunctions,
        uncoveredBranches,
      });
    }
  }

  files.sort((left, right) => {
    const leftTotal = left.uncoveredStatements + left.uncoveredFunctions + left.uncoveredBranches;
    const rightTotal = right.uncoveredStatements + right.uncoveredFunctions + right.uncoveredBranches;
    return rightTotal - leftTotal || left.file.localeCompare(right.file);
  });

  return {
    statements: computeMetricSummary(statementCovered, statementTotal),
    lines: computeMetricSummary(statementCovered, statementTotal),
    functions: computeMetricSummary(functionCovered, functionTotal),
    branches: computeMetricSummary(branchCovered, branchTotal),
    uncoveredFiles: files,
  };
}

async function readCoverageMap(reportsDir) {
  const coverageFile = path.join(reportsDir, "coverage-final.json");
  return JSON.parse(await readFile(coverageFile, "utf8"));
}

function validateLiveEnvironment() {
  const missing = Object.entries(requiredLiveEnv)
    .filter(([envName, predicate]) => !predicate(process.env[envName] ?? ""))
    .map(([envName]) => envName);
  return {
    ok: missing.length === 0,
    missing,
  };
}

function assertThreshold(metricName, actual, threshold) {
  if (threshold === null || Number.isNaN(threshold)) {
    return;
  }
  if (actual.pct < threshold) {
    throw new Error(
      `${metricName} coverage ${actual.pct}% is below required threshold ${threshold}% (${actual.covered}/${actual.total})`,
    );
  }
}

function printSummary(summary, includedLive) {
  console.log("");
  console.log("[backend-coverage] Backend integration coverage summary");
  console.log(
    `[backend-coverage] Live suite included: ${includedLive ? "yes" : "no"} | ` +
      `lines ${summary.lines.pct}% | statements ${summary.statements.pct}% | ` +
      `functions ${summary.functions.pct}% | branches ${summary.branches.pct}%`,
  );

  if (summary.uncoveredFiles.length === 0) {
    console.log("[backend-coverage] No uncovered backend files remain.");
    return;
  }

  console.log("[backend-coverage] Top uncovered backend files:");
  for (const file of summary.uncoveredFiles.slice(0, 20)) {
    console.log(
      `[backend-coverage] - ${file.file} ` +
        `(statements ${file.uncoveredStatements}, functions ${file.uncoveredFunctions}, branches ${file.uncoveredBranches})`,
    );
  }
}

async function main() {
  await rm(coverageRoot, { recursive: true, force: true });
  await mkdir(coverageRoot, { recursive: true });

  run("deterministic backend integration suite", [
    "exec",
    "vitest",
    "run",
    "--config",
    "vitest.integration.config.ts",
    "--coverage",
    "--coverage.include=src/**/*.ts",
    "--coverage.reporter=json",
    "--coverage.reporter=text-summary",
    "--coverage.reportsDirectory",
    deterministicCoverageDir,
  ]);

  const liveEnv = validateLiveEnvironment();
  const shouldRunLive = parsed.values["require-live"] || liveEnv.ok;

  if (parsed.values["require-live"] && !liveEnv.ok) {
    throw new Error(
      `live backend integration coverage was required but these env vars are missing or invalid: ${liveEnv.missing.join(", ")}`,
    );
  }

  if (shouldRunLive) {
    run("live backend integration suite", [
      "exec",
      "vitest",
      "run",
      "--config",
      "vitest.live.config.ts",
      "--coverage",
      "--coverage.include=src/**/*.ts",
      "--coverage.reporter=json",
      "--coverage.reporter=text-summary",
      "--coverage.reportsDirectory",
      liveCoverageDir,
    ]);
  } else {
    console.log("[backend-coverage] Live suite skipped because the full live env set is not present.");
  }

  const mergedCoverage = mergeCoverageMaps(
    await readCoverageMap(deterministicCoverageDir),
    shouldRunLive && existsSync(path.join(liveCoverageDir, "coverage-final.json")) ? await readCoverageMap(liveCoverageDir) : {},
  );
  const summary = summarizeCoverage(mergedCoverage);

  await writeFile(mergedCoveragePath, JSON.stringify(mergedCoverage, null, 2));
  await writeFile(summaryPath, JSON.stringify(summary, null, 2));
  await writeFile(uncoveredPath, JSON.stringify(summary.uncoveredFiles, null, 2));

  printSummary(summary, shouldRunLive);

  assertThreshold("lines", summary.lines, thresholds.lines);
  assertThreshold("statements", summary.statements, thresholds.statements);
  assertThreshold("functions", summary.functions, thresholds.functions);
  assertThreshold("branches", summary.branches, thresholds.branches);
}

main().catch((error) => {
  console.error(`[backend-coverage] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
