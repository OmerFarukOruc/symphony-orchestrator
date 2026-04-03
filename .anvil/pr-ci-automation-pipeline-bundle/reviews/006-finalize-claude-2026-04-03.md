---
plan: feat: PR/CI Automation Pipeline Bundle
type: finalize
model: claude-sonnet-4-6
date: 2026-04-03
round: finalize
settlements-applied: 20
sharpened-by-anti-compromise: 5
---

## Finalize Changelog

### Summary

All 20 settlements from the ledger (rounds 2–5 + hostile audit) applied to plan.md.
5 settlements sharpened by anti-compromise check before writing.
Plan status set to `finalized: 2026-04-03`, `finalized-by: claude-sonnet-4-6`.

---

### Settlements Applied

#### U1 — Config schema extensions (5 settlements)

1. **ISSUE-5 / AgentConfig type fix**: Replaced `export interface AgentConfig` with `export type AgentConfig = z.infer<typeof agentConfigSchema>` in `src/core/types.ts`. Added to U1 approach and file list.

2. **ISSUE-13 / Builder field mappings**: Added `src/config/builders.ts` to U1 file list. Approach specifies the exact three field-by-field mappings required: `autoRetryOnReviewFeedback: asBoolean(...)`, `prMonitorIntervalMs: asNumber(...)`, `autoMerge: deriveMergePolicyConfig(asRecord(...))`. Constraint added: do NOT use `agentConfigSchema.parse()` as it bypasses the tolerance layer.
   *Anti-compromise sharpening*: original settlement framing said "TypeScript WILL catch this" — reframed to specify exact builder additions, not rely on the type checker as the only safety net.

3. **NEW-3 / Schema migration try/catch (BLOCKER)**: Replaced all references to `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` with the correct try/catch pattern. Added the exact code block to U1 approach. Added migration idempotence test scenario. Added a risk row in the risk table for this issue. Added a note to deferred-to-implementation questions about the migration audit scope.
   *Anti-compromise sharpening*: `IF NOT EXISTS` language fully removed — no "consider" hedge, no dual approach.

4. **ISSUE-2 / Migration audit gap (WARNING)**: Added a deferred-to-implementation question about auditing post-v1 columns. Added language to the Documentation/Operational Notes section. The risk table entry for SQLite migration updated to reference both the `summary` column and the systemic gap. Avoided over-specifying the migration for columns outside the plan scope.

5. **`src/config/builders.ts` file list addition**: Added to U1 file list explicitly (was missing from original plan).

#### U2 — Completion writeback (2 settlements)

6. **NEW-2 / Double-comment prevention**: Replaced "add failure comment" framing with "replace the unified call with a branched success/failure call." The approach now explicitly says the existing `tracker.createComment()` at line 67 fires for ALL stop signals and must be replaced with a branched call. Added a test scenario: "No double-comment: `stopSignal === "blocked"` results in exactly ONE comment posted." Updated Context section note about `completion-writeback.ts` to describe the unified-call risk.

7. **ISSUE-3 / `handleCancelledOrHardFailure` async**: Added explicit async requirement. Updated U2 approach: "make the function `async` (2 call sites in `stop-signal.ts` must be updated to `await`)." Added to Key Technical Decisions section as a standalone decision. Added to Resolved Open Questions.

#### U3 — PR review feedback ingestion (4 settlements)

8. **ISSUE-4 / File list additions**: Added `src/core/types.ts` (RetryEntry), `src/orchestrator/retry-manager.ts`, `src/dispatch/types.ts` to U3 file list. These were confirmed as required for the `queueRetry()` interface surgery.

9. **NEW-1 / `DispatchRequest.previousPrFeedback`**: Added `previousPrFeedback?: string | null` to `DispatchRequest` in `dispatch/types.ts`. Confirmed `previousThreadId` should also be present. Added to U3 file list and approach.

10. **ISSUE-14 / `src/git/port.ts` file addition**: Added `src/git/port.ts` (GitPostRunPort) to U3 file list. Approach specifies extending `commitAndPush()` to accept `forcePushIfBranchExists?: boolean` with `--force-with-lease`. Force-push failure handling clarified: abort with user-visible warning, do not retry.

11. **ISSUE-12 / `PrStatusResponse` type guard**: Added `PrStatusResponse` interface and `isPrStatusResponse()` type guard as explicit U3 deliverables. Specified exact interface shape: `state: "open"|"closed"`, `merged: boolean`, `number: number`, `html_url: string`, `merge_commit_sha: string|null`. Added type guard test scenario. Added note in U6 that `poll()` must use the guard before accessing `.state`/`.merged`.

#### U4 — PR summary generation (3 settlements)

12. **ISSUE-1 / codex exec --json pattern (BLOCKER)**: Completely replaced the U4 approach. Removed all "Claude API call" / `apiKey` / `generatePrSummary(workspaceDir, defaultBranch, apiKey)` language. New function signature: `generatePrSummary(workspaceDir: string, defaultBranch: string): Promise<string | null>`. Approach now specifies: spawn `codex exec {prompt} --json -s read-only` with piped stdout, collect JSONL lines, extract final assistant text from `item.completed` events where `item.type === 'agent_message'`. No `-o` flag. Referenced `codex-session-runner.ts` as the established pattern. Updated test scenarios to mock JSONL output. Added verification: "No `apiKey`, `ANTHROPIC_API_KEY`, or `@anthropic-ai/sdk` references in `pr-summary-generator.ts`." Updated high-level design diagram comment. Removed `src/agent-runner/contracts.ts` `apiKey`-related additions (U4 uses codex auth, not agent runner auth).
    *Anti-compromise sharpening*: no dual approach — codex exec JSONL wins, Claude SDK approach fully removed.

13. **ISSUE-10 / PR body format**: Explicit template added showing exact "Changes" section format: `Source issue: ${issue.url}\n\n## Changes\n\n${summary}`. When summary is null: body is `Source issue: ${issue.url}` only (no `## Changes` section). Added to U4 approach.

14. **`src/agent-runner/contracts.ts` cleanup**: Confirmed no `apiKey`-related additions needed in contracts.ts for U4. Summary uses codex auth. Retained `previousPrFeedback` addition which IS needed for U3.

#### U5 — Auto-merge policy (0 settlements)

No structural changes required.

#### U6 — PR lifecycle monitor (4 settlements)

15. **`auto_archive` per-issue flag removal**: Removed all references to "per-issue `auto_archive` flag" from U6 approach. Archive-on-merge trigger is now stated clearly: `config.agent.autoMerge.enabled === true` only. Added to Key Technical Decisions. Added to Resolved Open Questions. Added to Scope Boundaries (implied: no per-issue override in this bundle).
    *Anti-compromise sharpening*: language is now binary — "config-level only" with no "optional" or "consider adding per-issue."

16. **ISSUE-8 extension / `runningByIssue` stale state (WARNING)**: Added explicit constraint in U6 approach, U6 test scenarios, and Institutional Learnings: "`PrMonitorService.updateAttempt()` on merge must ONLY update the DB record. It must NOT touch orchestrator runtime state (`runningByIssue` map)." Test scenario added: "Runtime state isolation: `poll()` on merge updates DB record only."
    *Anti-compromise sharpening*: stated as a hard constraint with test coverage requirement, not a "note to consider."

17. **ISSUE-6 / U6↔U7 dependency fix**: Fixed the Module Dependency Graph. U7 → U6 (correct: U6 calls `appendCheckpoint()` from U7). Removed erroneous U6 → U7 arrow. Added implementation note to U6 and U7 unit headers: "U7 does NOT depend on U6." Updated U6 Dependencies field to remove U7. Updated U7 Dependencies field (was already clean; added clarifying note).

18. **ISSUE-9 / `getAllPrs()` method**: Added `getAllPrs()` to U6 file list (`attempt-store-sqlite.ts`, `attempt-store-port.ts`). Method is used by U8's `/api/v1/prs` handler. Added to System-Wide Impact note.

#### U7 — Checkpoint history (0 settlements)

No structural changes required beyond the dependency direction fix above.

#### U8 — HTTP endpoints (0 settlements)

No structural changes required. `getAllPrs()` availability confirmed via U6 settlement.

---

### Anti-Compromise Check Results

| Settlement | Hedge test | Division test | Diplomat test | Specificity test | Result |
|-----------|------------|---------------|---------------|------------------|--------|
| ISSUE-13 builder | FAIL (relied on "TypeScript catches it") | PASS | PASS | FAIL (less specific than needed) | Sharpened: explicit field mappings added |
| NEW-3 migration | FAIL ("consider try/catch") | PASS | PASS | FAIL (code not in plan body) | Sharpened: exact code block added to approach, old syntax fully removed |
| ISSUE-1 codex exec | PASS | PASS | FAIL (two approaches remained in plan body) | FAIL (plan body not updated) | Sharpened: Claude SDK fully removed, codex exec JSONL is the only approach |
| U6 auto_archive | PASS | PASS | PASS | FAIL ("per-issue or config" ambiguity) | Sharpened: config-level only, per-issue fully removed |
| ISSUE-8 runningByIssue | PASS | PASS | PASS | FAIL (advisory note only, no test requirement) | Sharpened: hard constraint + test coverage required |

All 20 settlements: 15 passed the anti-compromise check as written. 5 sharpened before writing.

---

### Plan Size

- `.anvil/pr-ci-automation-pipeline-bundle/plan.md`: finalized (approx. 18KB — original was 15.6KB token-estimated; additions from settlements add ~15%)
- `docs/plans/2026-04-03-002-feat-pr-ci-automation-pipeline-plan.md`: mirrored (same content)

---

### Contested / Open Items

None. All 16 ledger items settled across rounds 2–5. Two blockers (NEW-3, ISSUE-1) re-opened by hostile audit and settled in round 5. Four warnings (ISSUE-2, ISSUE-13, U6 `auto_archive`, ISSUE-8) sharpened during finalization.

The plan is ready for `/batch` execution.
