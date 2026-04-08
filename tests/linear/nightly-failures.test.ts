import { describe, expect, it, vi } from "vitest";

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildFailureIssueBody,
  buildFailureIssueTitle,
  computeFailureFingerprint,
  createOrUpdateNightlyIssue,
} from "../../src/linear/nightly-failures.js";

function makeSummary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    generatedAt: "2026-04-07T18:00:00.000Z",
    workflow: "CI",
    runId: "12345",
    sha: "abc123",
    refName: "main",
    jobs: [
      { job: "fullstack-e2e", result: "failure" },
      { job: "visual-regression", result: "success" },
    ],
    failedJobs: ["fullstack-e2e"],
    failingTests: [
      {
        file: "tests/e2e/specs/fullstack/webhook-to-ui.fullstack.spec.ts",
        title: "webhook propagates to UI",
        projectName: "fullstack",
        error: "TimeoutError: expected state update",
      },
    ],
    artifactUrls: {
      runUrl: "https://github.com/OmerFarukOruc/risoluto/actions/runs/12345",
      intakeArtifactName: "nightly-linear-intake-abc123",
      htmlReportArtifactName: "fullstack-e2e-report-abc123",
      jsonReportPath: "test-results/playwright-fullstack-results.json",
      htmlReportUrl: "https://github.com/OmerFarukOruc/risoluto/actions/runs/12345#artifacts",
      traceUrl: "https://github.com/OmerFarukOruc/risoluto/actions/runs/12345#artifacts",
      videoUrl: "https://github.com/OmerFarukOruc/risoluto/actions/runs/12345#artifacts",
      intakeArtifactUrl: "https://github.com/OmerFarukOruc/risoluto/actions/runs/12345#artifacts",
    },
    suggestedRepro: ["pnpm exec playwright test --config playwright.fullstack.config.ts"],
    ...overrides,
  };
}

describe("nightly failure helpers", () => {
  async function withHistoryPath(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-nightly-history-"));
    return path.join(dir, "history.json");
  }
  it("computes a stable fingerprint from workflow and failed jobs", () => {
    const a = computeFailureFingerprint(makeSummary());
    const b = computeFailureFingerprint(makeSummary({ runId: "different", sha: "other" }));
    expect(a).toBe(b);
  });

  it("builds a readable issue title and body", () => {
    const summary = makeSummary();
    const fingerprint = computeFailureFingerprint(summary);
    const body = buildFailureIssueBody(summary, fingerprint, "https://example.test/failure");
    expect(buildFailureIssueTitle(summary, fingerprint)).toContain("[Nightly]");
    expect(body).toContain("Failing tests");
    expect(body).toContain("HTML report:");
    expect(body).toContain("Trace bundle:");
    expect(body).toContain("Video bundle:");
    expect(body).toContain("JSON intake artifact:");
    expect(body).toContain("Suggested repro");
    expect(body).toContain("TimeoutError: expected state update");
  });

  it("creates a new issue and attachment only after recurrence heuristics are satisfied", async () => {
    const historyPath = await withHistoryPath();
    const client = {
      findAttachmentsForUrl: vi.fn().mockResolvedValue([]),
      createIssue: vi.fn().mockResolvedValue({ issueId: "issue-1", identifier: "OPS-1", url: "https://linear/OPS-1" }),
      createAttachment: vi.fn().mockResolvedValue({ attachmentId: "att-1", url: "https://evidence/abc" }),
      createComment: vi.fn(),
      updateAttachment: vi.fn(),
      resolveStateId: vi.fn().mockResolvedValue("state-triage"),
      updateIssueState: vi.fn(),
      getIssueById: vi.fn(),
    } as never;

    const first = await createOrUpdateNightlyIssue(client, makeSummary(), {
      baseEvidenceUrl: "https://evidence.example/nightly",
      issueStateName: "Triage",
      historyPath,
    });
    expect(first?.mode).toBe("skipped");
    expect(client.createIssue).not.toHaveBeenCalled();

    const second = await createOrUpdateNightlyIssue(client, makeSummary({ runId: "12346" }), {
      baseEvidenceUrl: "https://evidence.example/nightly",
      issueStateName: "Triage",
      historyPath,
    });

    expect(client.createIssue).toHaveBeenCalledOnce();
    expect(client.createAttachment).toHaveBeenCalledOnce();
    expect(second?.mode).toBe("created");
    expect(second?.identifier).toBe("OPS-1");

    await rm(path.dirname(historyPath), { recursive: true, force: true });
  });

  it("updates an existing issue when an attachment with the same URL already exists", async () => {
    const historyPath = await withHistoryPath();
    const client = {
      findAttachmentsForUrl: vi.fn().mockResolvedValue([
        {
          id: "att-1",
          url: "https://evidence.example/nightly/abcd",
          title: "Old",
          subtitle: "Old subtitle",
          issue: { id: "issue-7", identifier: "OPS-7", title: "Old issue", stateName: "Done" },
        },
      ]),
      createIssue: vi.fn(),
      createAttachment: vi.fn(),
      createComment: vi.fn().mockResolvedValue(undefined),
      updateAttachment: vi.fn().mockResolvedValue(undefined),
      resolveStateId: vi.fn().mockResolvedValue("state-triage"),
      updateIssueState: vi.fn().mockResolvedValue(undefined),
      getIssueById: vi
        .fn()
        .mockResolvedValue({ id: "issue-7", identifier: "OPS-7", title: "Old issue", stateName: "Done" }),
    } as never;

    await createOrUpdateNightlyIssue(client, makeSummary(), {
      baseEvidenceUrl: "https://evidence.example/nightly",
      issueStateName: "Triage",
      historyPath,
    });
    const result = await createOrUpdateNightlyIssue(client, makeSummary({ runId: "12346" }), {
      baseEvidenceUrl: "https://evidence.example/nightly",
      issueStateName: "Triage",
      historyPath,
    });

    expect(client.createIssue).not.toHaveBeenCalled();
    expect(client.createAttachment).not.toHaveBeenCalled();
    expect(client.createComment).toHaveBeenCalledOnce();
    expect(client.updateAttachment).toHaveBeenCalledOnce();
    expect(client.updateIssueState).toHaveBeenCalledOnce();
    expect(result?.mode).toBe("updated");
    expect(result?.identifier).toBe("OPS-7");

    await rm(path.dirname(historyPath), { recursive: true, force: true });
  });

  it("auto-closes an issue after three clean runs", async () => {
    const historyPath = await withHistoryPath();
    const client = {
      findAttachmentsForUrl: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValue([
          {
            id: "att-1",
            url: "https://evidence.example/nightly/abc",
            title: "Nightly",
            subtitle: "Open",
            issue: { id: "issue-1", identifier: "OPS-1", title: "Nightly", stateName: "Triage" },
          },
        ]),
      createIssue: vi.fn().mockResolvedValue({ issueId: "issue-1", identifier: "OPS-1", url: "https://linear/OPS-1" }),
      createAttachment: vi.fn().mockResolvedValue({ attachmentId: "att-1", url: "https://evidence/abc" }),
      createComment: vi.fn(),
      updateAttachment: vi.fn(),
      resolveStateId: vi.fn().mockResolvedValue("state-done"),
      updateIssueState: vi.fn().mockResolvedValue(undefined),
      getIssueById: vi
        .fn()
        .mockResolvedValue({ id: "issue-1", identifier: "OPS-1", title: "Nightly", stateName: "Triage" }),
    } as never;

    await createOrUpdateNightlyIssue(client, makeSummary(), {
      baseEvidenceUrl: "https://evidence.example/nightly",
      issueStateName: "Triage",
      closedStateName: "Done",
      historyPath,
    });
    await createOrUpdateNightlyIssue(client, makeSummary({ runId: "12346" }), {
      baseEvidenceUrl: "https://evidence.example/nightly",
      issueStateName: "Triage",
      closedStateName: "Done",
      historyPath,
    });

    await createOrUpdateNightlyIssue(
      client,
      makeSummary({ failedJobs: [], jobs: [], runId: "12347", failingTests: [] }),
      {
        baseEvidenceUrl: "https://evidence.example/nightly",
        issueStateName: "Triage",
        closedStateName: "Done",
        historyPath,
      },
    );
    await createOrUpdateNightlyIssue(
      client,
      makeSummary({ failedJobs: [], jobs: [], runId: "12348", failingTests: [] }),
      {
        baseEvidenceUrl: "https://evidence.example/nightly",
        issueStateName: "Triage",
        closedStateName: "Done",
        historyPath,
      },
    );
    await createOrUpdateNightlyIssue(
      client,
      makeSummary({ failedJobs: [], jobs: [], runId: "12349", failingTests: [] }),
      {
        baseEvidenceUrl: "https://evidence.example/nightly",
        issueStateName: "Triage",
        closedStateName: "Done",
        historyPath,
      },
    );

    expect(client.updateIssueState).toHaveBeenCalled();
    await rm(path.dirname(historyPath), { recursive: true, force: true });
  });
});
