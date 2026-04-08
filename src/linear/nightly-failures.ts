import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { LinearClient } from "./client.js";
import {
  readFailureHistory,
  shouldAutoCloseIssue,
  shouldCreateOrUpdateIssue,
  type FailureHistoryStore,
  updateHistoryForFailure,
  updateHistoryForSuccesses,
  writeFailureHistory,
} from "./nightly-history.js";

export interface NightlyFailureSummary {
  generatedAt: string;
  workflow: string;
  runId: string;
  sha: string;
  refName: string;
  jobs: Array<{ job: string; result: string }>;
  failedJobs: string[];
  failingTests?: Array<{
    file: string;
    title: string;
    projectName: string | null;
    error: string | null;
  }>;
  artifactUrls?: {
    runUrl: string | null;
    intakeArtifactName: string | null;
    htmlReportArtifactName: string | null;
    jsonReportPath: string | null;
    htmlReportUrl: string | null;
    traceUrl: string | null;
    videoUrl: string | null;
    intakeArtifactUrl: string | null;
  };
  suggestedRepro?: string[];
}

export interface LinearNightlyIssueConfig {
  issueStateName?: string | null;
  closedStateName?: string | null;
  iconUrl?: string | null;
  baseEvidenceUrl: string;
  historyPath?: string | null;
}

export interface LinearNightlyIssueResult {
  fingerprint: string;
  issueId: string;
  identifier: string;
  url: string | null;
  attachmentUrl: string;
  attachmentId?: string | null;
  mode: "created" | "updated" | "skipped" | "closed";
}

interface PreparedFailureContext {
  fingerprint: string;
  attachmentUrl: string;
  title: string;
  subtitle: string;
}

function failingJobsSection(summary: NightlyFailureSummary): string {
  return summary.failedJobs.map((job) => `- ${job}`).join("\n") || "- none recorded";
}

function failingTestsSection(summary: NightlyFailureSummary): string {
  return (
    (summary.failingTests ?? [])
      .slice(0, 10)
      .map((test) => {
        const project = test.projectName ? ` [${test.projectName}]` : "";
        const error = test.error ? ` — ${test.error}` : "";
        return `- ${test.file}${project} :: ${test.title}${error}`;
      })
      .join("\n") || "- No structured failing test details were available."
  );
}

function pushEvidence(lines: string[], label: string, value: string | null | undefined): void {
  if (!value) {
    return;
  }
  lines.push(`- ${label}: ${value}`);
}

function evidenceSection(summary: NightlyFailureSummary, evidenceUrl: string): string {
  const lines = [`- Stable evidence URL: ${evidenceUrl}`];
  pushEvidence(lines, "GitHub run", summary.artifactUrls?.runUrl);
  pushEvidence(lines, "HTML report", summary.artifactUrls?.htmlReportUrl);
  pushEvidence(lines, "Trace bundle", summary.artifactUrls?.traceUrl);
  pushEvidence(lines, "Video bundle", summary.artifactUrls?.videoUrl);
  pushEvidence(lines, "JSON intake artifact", summary.artifactUrls?.intakeArtifactUrl);
  pushEvidence(lines, "HTML report artifact", summary.artifactUrls?.htmlReportArtifactName);
  pushEvidence(lines, "Intake artifact", summary.artifactUrls?.intakeArtifactName);
  pushEvidence(lines, "JSON report path", summary.artifactUrls?.jsonReportPath);
  return lines.join("\n");
}

function suggestedReproSection(summary: NightlyFailureSummary): string {
  return (
    (summary.suggestedRepro ?? []).map((command) => `- \`${command}\``).join("\n") ||
    "- No repro command was generated."
  );
}

function prepareFailureContext(
  summary: NightlyFailureSummary,
  config: LinearNightlyIssueConfig,
): PreparedFailureContext {
  const fingerprint = computeFailureFingerprint(summary);
  return {
    fingerprint,
    attachmentUrl: `${config.baseEvidenceUrl.replace(/\/$/, "")}/${fingerprint}`,
    title: buildFailureIssueTitle(summary, fingerprint),
    subtitle: `Run ${summary.runId} · ${summary.failedJobs.join(", ")}`,
  };
}

async function closeRecoveredIssues(
  client: LinearClient,
  history: FailureHistoryStore,
  historyPath: string,
  config: LinearNightlyIssueConfig,
  occurredAt: string,
): Promise<void> {
  updateHistoryForSuccesses(history, occurredAt, []);
  if (!config.closedStateName) {
    writeFailureHistory(historyPath, history);
    return;
  }

  const closedStateId = await client.resolveStateId(config.closedStateName);
  for (const entry of Object.values(history.entries)) {
    if (!shouldAutoCloseIssue(entry) || !entry.issueId || !closedStateId) {
      continue;
    }
    const issue = await client.getIssueById(entry.issueId);
    if (issue?.stateName !== config.closedStateName) {
      await client.updateIssueState(entry.issueId, closedStateId);
    }
  }
  writeFailureHistory(historyPath, history);
}

async function updateExistingIssue(
  client: LinearClient,
  summary: NightlyFailureSummary,
  config: LinearNightlyIssueConfig,
  context: PreparedFailureContext,
  existing: Awaited<ReturnType<LinearClient["findAttachmentsForUrl"]>>,
): Promise<LinearNightlyIssueResult> {
  const issue = existing[0].issue!;
  if (config.issueStateName) {
    const stateId = await client.resolveStateId(config.issueStateName);
    if (stateId) {
      await client.updateIssueState(issue.id, stateId);
    }
  }
  await client.createComment(issue.id, buildFailureIssueBody(summary, context.fingerprint, context.attachmentUrl));
  await client.updateAttachment(existing[0].id, {
    title: context.title,
    subtitle: context.subtitle,
    iconUrl: config.iconUrl ?? null,
  });
  return {
    fingerprint: context.fingerprint,
    issueId: issue.id,
    identifier: issue.identifier ?? "",
    url: null,
    attachmentUrl: context.attachmentUrl,
    attachmentId: existing[0].id,
    mode: "updated",
  };
}

async function createNewIssue(
  client: LinearClient,
  summary: NightlyFailureSummary,
  config: LinearNightlyIssueConfig,
  context: PreparedFailureContext,
): Promise<LinearNightlyIssueResult> {
  const created = await client.createIssue({
    title: context.title,
    description: buildFailureIssueBody(summary, context.fingerprint, context.attachmentUrl),
    stateName: config.issueStateName ?? null,
  });
  const attachment = await client.createAttachment({
    issueId: created.issueId,
    title: context.title,
    subtitle: context.subtitle,
    url: context.attachmentUrl,
    iconUrl: config.iconUrl ?? null,
  });
  return {
    fingerprint: context.fingerprint,
    issueId: created.issueId,
    identifier: created.identifier,
    url: created.url,
    attachmentUrl: context.attachmentUrl,
    attachmentId: attachment.attachmentId,
    mode: "created",
  };
}

function persistFailureResult(
  history: FailureHistoryStore,
  historyPath: string | null,
  summary: NightlyFailureSummary,
  fingerprint: string,
  result: LinearNightlyIssueResult | null,
): void {
  updateHistoryForSuccesses(history, summary.generatedAt, [fingerprint]);
  if (result && result.mode !== "skipped") {
    const entry = history.entries[fingerprint];
    if (entry) {
      entry.issueId = result.issueId || entry.issueId;
      entry.issueIdentifier = result.identifier || entry.issueIdentifier;
      entry.attachmentId = result.attachmentId ?? entry.attachmentId;
    }
  }
  if (historyPath) {
    writeFailureHistory(historyPath, history);
  }
}

export function computeFailureFingerprint(summary: NightlyFailureSummary): string {
  const stable = JSON.stringify({
    workflow: summary.workflow,
    failedJobs: [...summary.failedJobs].sort(),
  });
  return createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

export function buildFailureIssueTitle(summary: NightlyFailureSummary, fingerprint: string): string {
  const failedJobs = summary.failedJobs.join(", ");
  return `[Nightly] ${summary.workflow} failed (${failedJobs}) [${fingerprint}]`;
}

export function buildFailureIssueBody(
  summary: NightlyFailureSummary,
  fingerprint: string,
  evidenceUrl: string,
): string {
  return [
    "## Failure summary",
    `- Fingerprint: ${fingerprint}`,
    `- Workflow: ${summary.workflow}`,
    `- Run ID: ${summary.runId}`,
    `- SHA: ${summary.sha}`,
    `- Ref: ${summary.refName}`,
    `- Generated at: ${summary.generatedAt}`,
    "",
    "## Failed jobs",
    failingJobsSection(summary),
    "",
    "## Failing tests",
    failingTestsSection(summary),
    "",
    "## Evidence",
    evidenceSection(summary, evidenceUrl),
    "",
    "## Suggested repro",
    suggestedReproSection(summary),
    "",
    "## Notes",
    "This issue was created or updated automatically by the nightly Linear intake workflow.",
    "Direct attachment URLs are used for deduplication.",
  ].join("\n");
}

function buildSkippedResult(
  context: PreparedFailureContext,
  historyEntry: FailureHistoryStore["entries"][string],
): LinearNightlyIssueResult {
  return {
    fingerprint: context.fingerprint,
    issueId: historyEntry.issueId ?? "",
    identifier: historyEntry.issueIdentifier ?? "",
    url: null,
    attachmentUrl: context.attachmentUrl,
    attachmentId: historyEntry.attachmentId,
    mode: "skipped",
  };
}

async function processFailureSummary(
  client: LinearClient,
  summary: NightlyFailureSummary,
  config: LinearNightlyIssueConfig,
  history: FailureHistoryStore,
): Promise<{ fingerprint: string; result: LinearNightlyIssueResult | null }> {
  const context = prepareFailureContext(summary, config);
  const existing = await client.findAttachmentsForUrl(context.attachmentUrl);
  const historyEntry = updateHistoryForFailure(history, {
    fingerprint: context.fingerprint,
    issueId: existing[0]?.issue?.id ?? null,
    issueIdentifier: existing[0]?.issue?.identifier ?? null,
    attachmentId: existing[0]?.id ?? null,
    occurredAt: summary.generatedAt,
  });

  if (!shouldCreateOrUpdateIssue(historyEntry)) {
    return { fingerprint: context.fingerprint, result: buildSkippedResult(context, historyEntry) };
  }
  if (existing.length > 0 && existing[0]?.issue?.id) {
    return {
      fingerprint: context.fingerprint,
      result: await updateExistingIssue(client, summary, config, context, existing),
    };
  }
  return {
    fingerprint: context.fingerprint,
    result: await createNewIssue(client, summary, config, context),
  };
}

export async function createOrUpdateNightlyIssue(
  client: LinearClient,
  summary: NightlyFailureSummary,
  config: LinearNightlyIssueConfig,
): Promise<LinearNightlyIssueResult | null> {
  const historyPath = config.historyPath ?? null;
  const history: FailureHistoryStore = historyPath ? readFailureHistory(historyPath) : { entries: {} };

  if (summary.failedJobs.length === 0) {
    if (historyPath) {
      await closeRecoveredIssues(client, history, historyPath, config, summary.generatedAt);
    }
    return null;
  }

  const { fingerprint, result } = await processFailureSummary(client, summary, config, history);
  persistFailureResult(history, historyPath, summary, fingerprint, result);
  return result;
}

export function readNightlyFailureSummary(path: string): NightlyFailureSummary {
  return JSON.parse(readFileSync(path, "utf8")) as NightlyFailureSummary;
}
