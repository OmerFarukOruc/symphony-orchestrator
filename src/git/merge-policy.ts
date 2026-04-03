import type { MergePolicy } from "../core/types.js";

/**
 * Result of evaluating the auto-merge policy against a pull request.
 */
export interface MergePolicyResult {
  /** Whether the auto-merge request is allowed under the policy. */
  allowed: boolean;
  /** Human-readable reason when `allowed` is false. */
  reason?: string;
  /** Files that failed the `allowedPaths` prefix check (populated only when the path check blocks). */
  blockedFiles?: string[];
}

/**
 * Pure function — no I/O. Evaluates the configured merge policy rules against
 * the actual state of a pull request.
 *
 * Checks are applied in this order:
 *  1. `enabled` flag — if false, block immediately.
 *  2. `excludeLabels` — any matching label blocks.
 *  3. `requireLabels` — all must be present.
 *  4. `maxChangedFiles` — total file count check.
 *  5. `maxDiffLines` — additions + deletions check.
 *  6. `allowedPaths` — every changed file must match at least one prefix.
 *
 * @param policy - The merge policy configuration from `AgentConfig.autoMerge`.
 * @param changedFiles - List of file paths changed in the PR (relative to repo root).
 * @param diffStats - Combined additions and deletions in the PR diff.
 * @param prLabels - Labels currently applied to the PR.
 * @returns A `MergePolicyResult` indicating whether auto-merge is allowed and why not if blocked.
 */
export function evaluateMergePolicy(
  policy: MergePolicy,
  changedFiles: string[],
  diffStats: { additions: number; deletions: number },
  prLabels: string[],
): MergePolicyResult {
  if (!policy.enabled) {
    return { allowed: false, reason: "auto-merge disabled" };
  }

  // Check excludeLabels — any match blocks immediately.
  for (const label of policy.excludeLabels) {
    if (prLabels.includes(label)) {
      return { allowed: false, reason: `excluded label present: ${label}` };
    }
  }

  // Check requireLabels — all must be present.
  if (policy.requireLabels.length > 0) {
    const missingLabels = policy.requireLabels.filter((label) => !prLabels.includes(label));
    if (missingLabels.length > 0) {
      return { allowed: false, reason: `required labels missing: ${missingLabels.join(", ")}` };
    }
  }

  // Check maxChangedFiles.
  if (policy.maxChangedFiles != null && changedFiles.length > policy.maxChangedFiles) {
    return {
      allowed: false,
      reason: `changed file count ${changedFiles.length} exceeds maxChangedFiles ${policy.maxChangedFiles}`,
    };
  }

  // Check maxDiffLines (additions + deletions).
  const totalDiffLines = diffStats.additions + diffStats.deletions;
  if (policy.maxDiffLines != null && totalDiffLines > policy.maxDiffLines) {
    return {
      allowed: false,
      reason: `diff lines ${totalDiffLines} exceeds maxDiffLines ${policy.maxDiffLines}`,
    };
  }

  // Check allowedPaths — if non-empty, every changed file must match at least one prefix.
  if (policy.allowedPaths.length > 0) {
    const blockedFiles = changedFiles.filter((file) => !policy.allowedPaths.some((prefix) => file.startsWith(prefix)));
    if (blockedFiles.length > 0) {
      return {
        allowed: false,
        reason: `changed files outside allowed paths: ${blockedFiles.join(", ")}`,
        blockedFiles,
      };
    }
  }

  return { allowed: true };
}
