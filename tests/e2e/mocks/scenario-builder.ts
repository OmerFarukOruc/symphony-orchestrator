import type { SetupStatus } from "./data/setup-status";
import { buildSetupStatus, buildSetupUnconfigured } from "./data/setup-status";
import {
  buildRuntimeSnapshot,
  buildIssueView,
  type RuntimeSnapshot,
  type RuntimeIssueView,
} from "./data/runtime-snapshot";
import { buildIssueDetail, type IssueDetail } from "./data/issue-detail";
import { buildAttemptRecord, type AttemptRecord } from "./data/attempts";
import type { ApiMockOverrides } from "./api-mock";

/**
 * Fluent builder for constructing API mock scenarios.
 *
 * @example
 * const scenario = new ScenarioBuilder()
 *   .withSetupConfigured()
 *   .withRunningIssues(2)
 *   .build();
 * await installApiMock(page, scenario);
 */
export class ScenarioBuilder {
  private setupStatus: SetupStatus = buildSetupStatus();
  private snapshot: RuntimeSnapshot = buildRuntimeSnapshot();
  private issueDetails: Record<string, IssueDetail> = {};
  private attemptRecords: Record<string, AttemptRecord> = {};

  withSetupConfigured(): this {
    this.setupStatus = buildSetupStatus();
    return this;
  }

  withSetupUnconfigured(): this {
    this.setupStatus = buildSetupUnconfigured();
    return this;
  }

  withSetup(overrides: Partial<SetupStatus>): this {
    this.setupStatus = buildSetupStatus(overrides);
    return this;
  }

  withSnapshot(overrides: Partial<RuntimeSnapshot>): this {
    this.snapshot = buildRuntimeSnapshot(overrides);
    return this;
  }

  withRunningIssues(count: number): this {
    const running: RuntimeIssueView[] = [];
    for (let i = 0; i < count; i++) {
      running.push(
        buildIssueView({
          issueId: `issue-r${i + 1}`,
          identifier: `SYM-${100 + i}`,
          title: `Running task ${i + 1}`,
          status: "running",
          state: "In Progress",
        }),
      );
    }
    this.snapshot = buildRuntimeSnapshot({ running, counts: { running: count, retrying: 0 } });
    return this;
  }

  withIssueDetail(identifier: string, overrides?: Partial<IssueDetail>): this {
    this.issueDetails[identifier] = buildIssueDetail({ identifier, ...overrides });
    return this;
  }

  withAttemptRecord(attemptId: string, overrides?: Partial<AttemptRecord>): this {
    this.attemptRecords[attemptId] = buildAttemptRecord({ attemptId, ...overrides });
    return this;
  }

  build(): ApiMockOverrides {
    return {
      setupStatus: this.setupStatus,
      runtimeSnapshot: this.snapshot,
      issueDetail: Object.keys(this.issueDetails).length > 0 ? this.issueDetails : undefined,
      attemptRecords: Object.keys(this.attemptRecords).length > 0 ? this.attemptRecords : undefined,
    };
  }
}
