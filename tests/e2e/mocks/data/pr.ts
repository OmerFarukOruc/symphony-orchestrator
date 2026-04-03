/**
 * Mock data factory for PrRecord objects used in E2E API mock intercepts.
 *
 * Mirrors the shape returned by `GET /api/v1/prs`.
 */

export interface PrRecord {
  attemptId: string;
  issueId: string;
  url: string;
  number: number;
  owner: string;
  repo: string;
  branchName: string;
  status: "open" | "merged" | "closed";
  mergedAt: string | null;
  mergeCommitSha: string | null;
  createdAt: string;
  updatedAt: string;
}

export function buildPrRecord(overrides?: Partial<PrRecord>): PrRecord {
  return {
    attemptId: "attempt-abc",
    issueId: "issue-xyz",
    url: "https://github.com/owner/repo/pull/42",
    number: 42,
    owner: "owner",
    repo: "owner/repo",
    branchName: "risoluto/eng-42",
    status: "open",
    mergedAt: null,
    mergeCommitSha: null,
    createdAt: "2026-04-01T09:00:00.000Z",
    updatedAt: "2026-04-01T09:00:00.000Z",
    ...overrides,
  };
}

export function buildMergedPrRecord(overrides?: Partial<PrRecord>): PrRecord {
  return buildPrRecord({
    status: "merged",
    mergedAt: "2026-04-03T10:00:00.000Z",
    mergeCommitSha: "abc123def456",
    updatedAt: "2026-04-03T10:00:00.000Z",
    ...overrides,
  });
}
