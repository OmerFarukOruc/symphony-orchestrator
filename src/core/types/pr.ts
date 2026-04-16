/**
 * A durable record of a GitHub pull request associated with an attempt.
 * The `(owner, repo, pullNumber)` triple is the stable external key.
 * `attemptId` is a loose reference — no FK constraint — because the
 * attempt may be archived before the PR is closed.
 */
export interface PrRecord {
  prId: string;
  attemptId: string | null;
  issueId: string;
  owner: string;
  repo: string;
  pullNumber: number;
  url: string;
  status: "open" | "merged" | "closed";
  mergedAt: string | null;
  mergeCommitSha: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Merge policy rules evaluated by `evaluateMergePolicy()` before
 * requesting auto-merge via the GitHub API.
 *
 * This interface mirrors the shape of `mergePolicyConfigSchema` in
 * `src/config/schemas/pr-policy.ts` and is kept here as the canonical
 * domain type consumed by the policy engine (U5).
 */
export interface MergePolicy {
  enabled: boolean;
  allowedPaths: string[];
  maxChangedFiles?: number | null;
  maxDiffLines?: number | null;
  requireLabels: string[];
  excludeLabels: string[];
}
