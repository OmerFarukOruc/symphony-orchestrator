import { buildIssueDetail, type IssueDetail } from "../data/issue-detail";
import { buildAttemptSummary } from "../data/attempts";
import type { ApiMockOverrides } from "../api-mock";
import { buildRuntimeSnapshot } from "../data/runtime-snapshot";
import { buildSetupStatus } from "../data/setup-status";

/**
 * Pre-built scenario for testing the issue drilldown flow:
 * queue → issue detail → attempts → individual attempt.
 *
 * Provides:
 * - SYM-42: running issue with 2 attempts (one completed, one running)
 * - SYM-43: queued issue
 * - SYM-41: completed issue
 */
export function buildIssueDrilldownScenario(): ApiMockOverrides {
  const completedAttempt = buildAttemptSummary({
    attemptId: "att-001",
    attemptNumber: 1,
    startedAt: "2026-01-15T10:00:00.000Z",
    endedAt: "2026-01-15T10:30:00.000Z",
    status: "failed",
    errorCode: "AGENT_ERROR",
    errorMessage: "Agent crashed during file write",
    tokenUsage: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000 },
    appServerBadge: { effectiveProvider: "openai", threadStatus: "systemError" },
  });

  const runningAttempt = buildAttemptSummary({
    attemptId: "att-002",
    attemptNumber: 2,
    startedAt: "2026-01-15T11:00:00.000Z",
    endedAt: null,
    status: "running",
    errorCode: null,
    errorMessage: null,
    tokenUsage: { inputTokens: 5000, outputTokens: 3000, totalTokens: 8000 },
    appServerBadge: { effectiveProvider: "cliproxyapi", threadStatus: "active" },
  });

  const sym42Detail: IssueDetail = buildIssueDetail({
    issueId: "issue-001",
    identifier: "SYM-42",
    title: "Fix authentication bug",
    state: "In Progress",
    status: "running",
    attempt: 2,
    attempts: [completedAttempt, runningAttempt],
    currentAttemptId: "att-002",
    recentEvents: [
      {
        at: "2026-01-15T12:00:00.000Z",
        issueId: "issue-001",
        issueIdentifier: "SYM-42",
        sessionId: "sess-002",
        event: "agent_started",
        message: "Agent started attempt #2",
        content: null,
      },
      {
        at: "2026-01-15T10:30:00.000Z",
        issueId: "issue-001",
        issueIdentifier: "SYM-42",
        sessionId: "sess-001",
        event: "agent_error",
        message: "Agent crashed during file write",
        content: null,
      },
    ],
  });

  return {
    setupStatus: buildSetupStatus(),
    runtimeSnapshot: buildRuntimeSnapshot(),
    issueDetail: {
      "SYM-42": sym42Detail,
    },
    attemptRecords: {
      "att-001": {
        ...completedAttempt,
        issueIdentifier: "SYM-42",
        title: "Fix authentication bug",
        workspacePath: "/tmp/workspace/sym-42",
        workspaceKey: "ws-001",
        modelSource: "default",
        turnCount: 3,
        threadId: "thread-001",
        turnId: "turn-003",
        appServer: {
          effectiveProvider: "openai",
          effectiveModel: "o3-mini",
          reasoningEffort: "medium",
          approvalPolicy: "never",
          threadName: "Authentication recovery",
          threadStatus: "systemError",
          threadStatusPayload: { type: "systemError" },
          allowedApprovalPolicies: ["never"],
          allowedSandboxModes: ["workspaceWrite"],
          networkRequirements: { enabled: false },
        },
        events: [],
      },
      "att-002": {
        ...runningAttempt,
        issueIdentifier: "SYM-42",
        title: "Fix authentication bug",
        workspacePath: "/tmp/workspace/sym-42",
        workspaceKey: "ws-001",
        modelSource: "default",
        turnCount: 5,
        threadId: "thread-002",
        turnId: "turn-005",
        appServer: {
          effectiveProvider: "cliproxyapi",
          effectiveModel: "o3-mini",
          reasoningEffort: "medium",
          approvalPolicy: "never",
          threadName: "Authentication fix thread",
          threadStatus: "active",
          threadStatusPayload: { type: "active", activeFlags: ["waitingOnApproval"] },
          allowedApprovalPolicies: ["never", "onRequest"],
          allowedSandboxModes: ["workspaceWrite"],
          networkRequirements: { enabled: true, allowedDomains: ["api.openai.com"] },
        },
        events: [],
      },
    },
  };
}
