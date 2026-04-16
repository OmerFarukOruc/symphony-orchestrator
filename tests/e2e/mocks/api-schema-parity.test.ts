import { describe, expect, it } from "vitest";

import {
  attemptDetailResponseSchema,
  checkpointsListResponseSchema,
  issueDetailResponseSchema,
  notificationsListResponseSchema,
  stateResponseSchema,
} from "../../../src/http/response-schemas.js";
import { buildAttemptRecord } from "./data/attempts";
import { buildCheckpointRecord } from "./data/checkpoint";
import { buildIssueDetail } from "./data/issue-detail";
import { buildRuntimeSnapshot } from "./data/runtime-snapshot";
import { buildIssueDrilldownScenario } from "./scenarios/issue-drilldown";

describe("E2E API mock schema parity", () => {
  it("keeps the default runtime snapshot builder aligned with the state schema", () => {
    const snapshot = buildRuntimeSnapshot();

    expect(stateResponseSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("keeps the issue detail and attempt detail builders aligned with the API schemas", () => {
    const issueDetail = buildIssueDetail();
    const attemptDetail = buildAttemptRecord();

    expect(issueDetailResponseSchema.parse(issueDetail)).toEqual(issueDetail);
    expect(attemptDetailResponseSchema.parse(attemptDetail)).toEqual(attemptDetail);
  });

  it("keeps drilldown scenario overrides aligned with issue and attempt detail schemas", () => {
    const scenario = buildIssueDrilldownScenario();
    const issueDetail = scenario.issueDetail?.["SYM-42"];
    const attempts = Object.values(scenario.attemptRecords ?? {});

    expect(issueDetail).toBeDefined();
    if (!issueDetail) {
      throw new Error("Expected SYM-42 issue detail override");
    }
    expect(issueDetailResponseSchema.parse(issueDetail)).toEqual(issueDetail);
    expect(attempts.map((attempt) => attemptDetailResponseSchema.parse(attempt))).toEqual(attempts);
  });

  it("keeps checkpoint and notifications payloads aligned with their response schemas", () => {
    const checkpointsPayload = {
      checkpoints: [buildCheckpointRecord()],
    };
    const notificationsPayload = {
      notifications: [
        {
          id: "notif-1",
          type: "worker.failed",
          severity: "warning",
          title: "Worker needs attention",
          message: "SYM-42 failed during startup",
          source: "orchestrator",
          href: "/issues/SYM-42",
          read: false,
          dedupeKey: "worker.failed:SYM-42",
          metadata: { issueIdentifier: "SYM-42", attempt: 2 },
          deliverySummary: {
            deliveredChannels: ["ui"],
            failedChannels: [],
            skippedDuplicate: false,
          },
          createdAt: "2026-04-10T10:00:00.000Z",
          updatedAt: "2026-04-10T10:00:00.000Z",
        },
      ],
      unreadCount: 1,
      totalCount: 1,
    };

    expect(checkpointsListResponseSchema.parse(checkpointsPayload)).toEqual(checkpointsPayload);
    expect(notificationsListResponseSchema.parse(notificationsPayload)).toEqual(notificationsPayload);
  });
});
