import { LinearClient } from "../src/linear/client.js";
import { defaultHistoryPath } from "../src/linear/nightly-history.js";
import { createOrUpdateNightlyIssue, readNightlyFailureSummary } from "../src/linear/nightly-failures.js";

interface IntakeOutput {
  generatedAt: string;
  mode: "dry-run" | "live" | "live-disabled";
  workflow: string;
  runId: string;
  failedJobs: string[];
  fingerprintPreview: string | null;
  disabledLinearWrite: boolean;
  disabledR2Upload: boolean;
  artifactUrls: unknown;
  recommendation?: string;
  result?: unknown;
}

function mainArgs(): { summaryPath: string; dryRun: boolean } {
  const summaryPath = process.argv[2];
  if (!summaryPath) {
    throw new TypeError("summary path argument is required");
  }
  return {
    summaryPath,
    dryRun: process.argv.includes("--dry-run") || process.env.NIGHTLY_LINEAR_DRY_RUN === "true",
  };
}

function fingerprintPreview(summary: ReturnType<typeof readNightlyFailureSummary>): string | null {
  return summary.failedJobs.length > 0 ? `${summary.workflow}:${[...summary.failedJobs].sort().join(",")}` : null;
}

function buildBaseOutput(
  summary: ReturnType<typeof readNightlyFailureSummary>,
  mode: IntakeOutput["mode"],
): IntakeOutput {
  return {
    generatedAt: new Date().toISOString(),
    mode,
    workflow: summary.workflow,
    runId: summary.runId,
    failedJobs: summary.failedJobs,
    fingerprintPreview: fingerprintPreview(summary),
    disabledLinearWrite: process.env.NIGHTLY_DISABLE_LINEAR_WRITE === "true",
    disabledR2Upload: process.env.NIGHTLY_DISABLE_R2_UPLOAD === "true",
    artifactUrls: summary.artifactUrls ?? null,
  };
}

function buildDryRunOutput(summary: ReturnType<typeof readNightlyFailureSummary>): IntakeOutput {
  return {
    ...buildBaseOutput(summary, "dry-run"),
    recommendation:
      summary.failedJobs.length === 0
        ? "No Linear issue should be created."
        : "Create or update one Linear issue per stable failure fingerprint after recurrence heuristics are satisfied.",
  };
}

function createClient(apiKey: string, projectSlug: string): LinearClient {
  return new LinearClient(
    () => ({
      tracker: {
        kind: "linear",
        apiKey,
        endpoint: process.env.LINEAR_API_ENDPOINT ?? "https://api.linear.app/graphql",
        projectSlug,
        activeStates: ["In Progress"],
        terminalStates: ["Done", "Canceled"],
      },
      polling: { intervalMs: 30000 },
      workspace: {
        root: "/tmp/risoluto-nightly",
        hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 1000 },
      },
      agent: {
        maxConcurrentAgents: 1,
        maxConcurrentAgentsByState: {},
        maxTurns: 1,
        maxRetryBackoffMs: 300000,
        maxContinuationAttempts: 1,
      },
      codex: {
        command: "codex app-server",
        model: "gpt-5.4",
        reasoningEffort: "minimal",
        approvalPolicy: "never",
        threadSandbox: "danger-full-access",
        turnSandboxPolicy: { type: "dangerFullAccess" },
        readTimeoutMs: 1000,
        turnTimeoutMs: 1000,
        drainTimeoutMs: 0,
        startupTimeoutMs: 1000,
        stallTimeoutMs: 1000,
        auth: { mode: "api_key", sourceHome: "/tmp" },
        provider: null,
        sandbox: {
          image: "node:22",
          network: "none",
          security: { noNewPrivileges: true, dropCapabilities: true, gvisor: false, seccompProfile: "" },
          resources: { memory: "1g", memoryReservation: "512m", memorySwap: "2g", cpus: "1", tmpfsSize: "100m" },
          extraMounts: [],
          envPassthrough: [],
          logs: { driver: "json-file", maxSize: "10m", maxFile: 3 },
          egressAllowlist: [],
        },
      },
      server: { port: 4000 },
    }),
    {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      child: () => {
        throw new TypeError("child logger not implemented");
      },
    } as never,
  );
}

function liveIssueConfig(): Parameters<typeof createOrUpdateNightlyIssue>[2] {
  return {
    issueStateName: process.env.LINEAR_NIGHTLY_STATE ?? null,
    closedStateName: process.env.LINEAR_NIGHTLY_CLOSED_STATE ?? null,
    iconUrl: process.env.LINEAR_ATTACHMENT_ICON_URL ?? null,
    baseEvidenceUrl:
      process.env.NIGHTLY_EVIDENCE_BASE_URL ??
      `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    historyPath: process.env.NIGHTLY_LINEAR_HISTORY_PATH ?? defaultHistoryPath(),
  };
}

async function main(): Promise<void> {
  const { summaryPath, dryRun } = mainArgs();
  const summary = readNightlyFailureSummary(summaryPath);

  if (dryRun) {
    process.stdout.write(JSON.stringify(buildDryRunOutput(summary), null, 2) + "\n");
    return;
  }

  const apiKey = process.env.LINEAR_API_KEY ?? "";
  const projectSlug = process.env.LINEAR_PROJECT_SLUG ?? "";
  if (!apiKey || !projectSlug) {
    throw new TypeError("LINEAR_API_KEY and LINEAR_PROJECT_SLUG are required when not running in dry-run mode");
  }

  if (process.env.NIGHTLY_DISABLE_LINEAR_WRITE === "true") {
    process.stdout.write(JSON.stringify(buildBaseOutput(summary, "live-disabled"), null, 2) + "\n");
    return;
  }

  const client = createClient(apiKey, projectSlug);
  const result = await createOrUpdateNightlyIssue(client, summary, liveIssueConfig());
  process.stdout.write(JSON.stringify({ ...buildBaseOutput(summary, "live"), result }, null, 2) + "\n");
}

void main();
