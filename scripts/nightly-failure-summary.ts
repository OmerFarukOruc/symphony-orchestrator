import { readFileSync, writeFileSync } from "node:fs";

interface NightlyJobStatus {
  job: string;
  result: string;
}

interface NightlyFailingTest {
  file: string;
  title: string;
  projectName: string | null;
  error: string | null;
}

interface NightlySummary {
  generatedAt: string;
  workflow: string;
  runId: string;
  sha: string;
  refName: string;
  jobs: NightlyJobStatus[];
  failedJobs: string[];
  failingTests: NightlyFailingTest[];
  artifactUrls: {
    runUrl: string | null;
    intakeArtifactName: string | null;
    htmlReportArtifactName: string | null;
    jsonReportPath: string | null;
    htmlReportUrl: string | null;
    traceUrl: string | null;
    videoUrl: string | null;
    intakeArtifactUrl: string | null;
  };
  suggestedRepro: string[];
}

function collectJobsFromEnv(): NightlyJobStatus[] {
  const jobNames = (process.env.NIGHTLY_JOB_NAMES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return jobNames.map((job) => ({
    job,
    result: process.env[`NIGHTLY_RESULT_${job.toUpperCase().replaceAll(/[^\w]/g, "_")}`] ?? "unknown",
  }));
}

function reportPaths(): string[] {
  const paths = (process.env.PLAYWRIGHT_JSON_REPORT_PATHS ?? process.env.PLAYWRIGHT_JSON_REPORT_PATH ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(paths)];
}

function collectSuiteFailures(suite: Record<string, unknown>, titles: string[], failing: NightlyFailingTest[]): void {
  const childSuites = Array.isArray(suite.suites) ? (suite.suites as Record<string, unknown>[]) : [];
  for (const childSuite of childSuites) {
    const nextTitles =
      typeof childSuite.title === "string" && childSuite.title ? [...titles, childSuite.title] : titles;
    collectSuiteFailures(childSuite, nextTitles, failing);
  }

  const specs = Array.isArray(suite.specs) ? (suite.specs as Record<string, unknown>[]) : [];
  for (const spec of specs) {
    collectSpecFailures(spec, titles, failing);
  }
}

function collectSpecFailures(spec: Record<string, unknown>, titles: string[], failing: NightlyFailingTest[]): void {
  const specTests = Array.isArray(spec.tests) ? (spec.tests as Record<string, unknown>[]) : [];
  for (const test of specTests) {
    const failure = extractFailedTest(spec, test, titles);
    if (failure) {
      failing.push(failure);
    }
  }
}

function extractFailedTest(
  spec: Record<string, unknown>,
  test: Record<string, unknown>,
  titles: string[],
): NightlyFailingTest | null {
  const results = Array.isArray(test.results) ? (test.results as Record<string, unknown>[]) : [];
  const failed = results.find((result) => result.status === "failed");
  if (!failed) {
    return null;
  }
  const errors = Array.isArray(failed.errors) ? failed.errors : [];
  const firstError = errors[0] as Record<string, unknown> | undefined;
  return {
    file: typeof spec.file === "string" ? spec.file : "unknown",
    title: [...titles, typeof spec.title === "string" ? spec.title : "unknown test"].join(" > "),
    projectName: typeof test.projectName === "string" ? test.projectName : null,
    error: firstError && typeof firstError.message === "string" ? firstError.message : null,
  };
}

function collectFailingTestsFromReport(path: string): NightlyFailingTest[] {
  const report = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const suites = Array.isArray(report.suites) ? (report.suites as Record<string, unknown>[]) : [];
  const failing: NightlyFailingTest[] = [];
  for (const suite of suites) {
    collectSuiteFailures(suite, [], failing);
  }
  return failing;
}

function collectFailingTests(): NightlyFailingTest[] {
  const failing: NightlyFailingTest[] = [];
  for (const path of reportPaths()) {
    try {
      failing.push(...collectFailingTestsFromReport(path));
    } catch {
      // Ignore unreadable reports so intake can still proceed with partial evidence.
    }
  }

  const deduped = new Map<string, NightlyFailingTest>();
  for (const test of failing) {
    const key = `${test.file}::${test.projectName ?? ""}::${test.title}`;
    if (!deduped.has(key)) {
      deduped.set(key, test);
    }
  }
  return [...deduped.values()];
}

function buildSuggestedReproCommands(): string[] {
  const commands: string[] = [];
  if (process.env.NIGHTLY_FAILED_JOB_FULLSTACK_E2E === "true") {
    commands.push("pnpm exec playwright test --config playwright.fullstack.config.ts");
  }
  if (process.env.NIGHTLY_FAILED_JOB_VISUAL_REGRESSION === "true") {
    commands.push("pnpm exec playwright test --project=visual");
  }
  if (process.env.NIGHTLY_FAILED_JOB_LIVE_PROVIDER_SMOKE === "true") {
    commands.push("pnpm run test:integration:live");
  }
  return commands;
}

function buildRunUrl(): string | null {
  if (!(process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID)) {
    return null;
  }
  return `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
}

function buildArtifactUrls(runUrl: string | null): NightlySummary["artifactUrls"] {
  return {
    runUrl,
    intakeArtifactName: process.env.NIGHTLY_INTAKE_ARTIFACT_NAME ?? null,
    htmlReportArtifactName: process.env.NIGHTLY_HTML_ARTIFACT_NAME ?? null,
    jsonReportPath: process.env.PLAYWRIGHT_JSON_REPORT_PATHS ?? process.env.PLAYWRIGHT_JSON_REPORT_PATH ?? null,
    htmlReportUrl: process.env.NIGHTLY_HTML_REPORT_URL ?? null,
    traceUrl: process.env.NIGHTLY_TRACE_URL ?? null,
    videoUrl: process.env.NIGHTLY_VIDEO_URL ?? null,
    intakeArtifactUrl: process.env.NIGHTLY_INTAKE_ARTIFACT_URL ?? null,
  };
}

function main(): void {
  const outputPath = process.argv[2];
  if (!outputPath) {
    throw new TypeError("output path argument is required");
  }
  const jobs = collectJobsFromEnv();
  const failedJobs = jobs.filter((job) => job.result === "failure").map((job) => job.job);
  const runUrl = buildRunUrl();
  const summary: NightlySummary = {
    generatedAt: new Date().toISOString(),
    workflow: process.env.GITHUB_WORKFLOW ?? "unknown",
    runId: process.env.GITHUB_RUN_ID ?? "unknown",
    sha: process.env.GITHUB_SHA ?? "unknown",
    refName: process.env.GITHUB_REF_NAME ?? "unknown",
    jobs,
    failedJobs,
    failingTests: collectFailingTests(),
    artifactUrls: buildArtifactUrls(runUrl),
    suggestedRepro: buildSuggestedReproCommands(),
  };
  writeFileSync(outputPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
}

main();
