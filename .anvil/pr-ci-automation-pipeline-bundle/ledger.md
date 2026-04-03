## Debate Ledger
**Plan**: feat: PR/CI Automation Pipeline Bundle
**Round**: FINALIZED (2026-04-03, claude-sonnet-4-6)
**Status**: FINALIZED — 20 settlements applied, 5 sharpened by anti-compromise check. Plan ready for /batch execution.

---

### FINALIZED

- **Date**: 2026-04-03
- **Model**: claude-sonnet-4-6
- **Settlements applied**: 20 (all ledger items from rounds 2–5 + hostile audit warnings)
- **Sharpened by anti-compromise check**: 5 (ISSUE-13, NEW-3, ISSUE-1, U6 auto_archive, ISSUE-8 runningByIssue)
- **Plan files updated**:
  - `.anvil/pr-ci-automation-pipeline-bundle/plan.md` (status: finalized, frontmatter updated)
  - `docs/plans/2026-04-03-002-feat-pr-ci-automation-pipeline-plan.md` (mirrored)
- **Changelog**: `.anvil/pr-ci-automation-pipeline-bundle/reviews/006-finalize-claude-2026-04-03.md`

Key changes from finalization:
- U1: `AgentConfig` → `z.infer<typeof agentConfigSchema>`; explicit builder mappings in `builders.ts`; try/catch migration (no `IF NOT EXISTS`); migration audit scope noted
- U2: unified comment call replaced with branched success/failure call; `handleCancelledOrHardFailure` made async with 2 call site updates
- U3: `PrStatusResponse` + `isPrStatusResponse()` type guard added; `src/git/port.ts` in file list; `DispatchRequest.previousPrFeedback` confirmed; retry-manager + dispatch/types in file list
- U4: Claude SDK / `apiKey` fully removed; `generatePrSummary(workspaceDir, defaultBranch)` — codex exec JSONL pattern only; explicit PR body template
- U6: `auto_archive` per-issue flag removed; `runningByIssue` isolation constraint as hard requirement; U6↔U7 dependency direction corrected; `getAllPrs()` added to interface
- U7: dependency direction corrected (U7 does NOT depend on U6)

---

---

### Settled (all models agree)

- **ISSUE-2 [HIGH] Schema migration gap for `summary` column**: Both models agree `database.ts` only applies create-only SQL. The `summary` column needs an `ALTER TABLE` migration gated by `version < 4`. NOTE (claude-round2): the migration block also has a fresh-install trap (see NEW-3) — must use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. — settled round 2.

- **ISSUE-4 [MEDIUM] `queueRetry` interface surgery underestimated**: Both models agree. Claude-round2 adds: `DispatchRequest` also needs `previousPrFeedback` (see NEW-1) for remote dispatch mode to forward the feedback to the data plane. U3 file list must include `src/core/types.ts` (RetryEntry), `src/orchestrator/retry-manager.ts`, `src/dispatch/types.ts`. — settled round 2.

- **ISSUE-6 [MEDIUM] U6↔U7 circular dependency**: Both models agree the dependency declarations are contradictory. Claude-round2 position: this is NOT a real circular module dependency — U7 provides schema/port/store, U6 calls `appendCheckpoint()`. U7's dependency on U6 in the plan is a documentation error. Fix: remove U6 from U7's dependency list. — settled round 2.

- **ISSUE-7 [LOW] Duplicate `db`/`attemptStore` in `PrMonitorService` constructor**: Both models agree — trivial fix. — settled round 2.

- **ISSUE-8 [MEDIUM] Auto-retry race condition**: Both models agree — `poll()` auto-retry path needs `status !== "running"` guard. Note (hostile-audit, round 5, warning): `PrMonitorService.updateAttempt()` on merge must only update the DB record — must NOT touch orchestrator runtime state (`runningByIssue` map). That state is managed exclusively by the orchestrator's `handleStopSignal`/`handleCancelledOrHardFailure` paths. Document this constraint in the PR monitor implementation. — settled round 2, sharpened round 5.

- **ISSUE-9 [LOW] `getAllPrs()` method split across U6/U8**: Both models agree — add to U6 interface additions. — settled round 2.

- **ISSUE-11 [MEDIUM] JSONL-mode `AttemptStore` not in U6/U7 file lists**: Both models agree — confirmed `AttemptStore` is assigned to `AttemptStorePort`-typed variable in `runtime.ts` via structural typing. Claude-round2: stubs should throw `Error("not supported in JSONL mode")` rather than silently no-op. — settled round 2.

- **ISSUE-3 [MEDIUM] `handleCancelledOrHardFailure` sync→async ambiguity**: Contested round 2 (Codex: fire-and-forget viable). Claude-round2: async is clearly correct — `handleContinuationExhausted` in the same file is already async with await call sites. Fire-and-forget is inconsistent with the pattern. Resolution: make `async`, update 2 call sites. — settled round 3.

- **ISSUE-5 [MEDIUM] Config typing omission — `AgentConfig` vs `builders.ts`**: Claude-round4 settles with code evidence. `agentConfigSchema` already has `preflightCommands` that `AgentConfig` interface lacks — drift confirmed. Fix: replace `export interface AgentConfig` with `export type AgentConfig = z.infer<typeof agentConfigSchema>` in `src/core/types.ts`. Additionally, `deriveAgentConfig()` in `src/config/builders.ts` hardcodes the return object by field name — the type fix alone does not populate runtime values. Both files required in U1. — settled round 4.

- **ISSUE-10 [LOW] PR body format unspecified**: Claude-round4 settles. Current body is `` `Source issue: ${issue.url}` ``. Explicit template: join source-issue line and conditional `## Changes\n\n${summary}` section with `\n`. Add to U4 approach. — settled round 4.

- **ISSUE-12 [MEDIUM] `getPrStatus()` returns `unknown`**: Claude-round4 settles. `getPrStatus()` and all new `GitHubPrClient` methods return `Promise<unknown>`. U3 must deliver: `PrStatusResponse` interface (`state: "open"|"closed"`, `merged: boolean`, `number: number`, `html_url: string`, `merge_commit_sha: string|null`) and `isPrStatusResponse()` type guard. U6's `poll()` must use the guard. — settled round 4.

- **ISSUE-13 [HIGH] Runtime config plumbing missing from U1 (`builders.ts`)**: Claude-round4 confirms: `deriveAgentConfig()` in `src/config/builders.ts` hardcodes the return object by field name and does NOT call `agentConfigSchema.parse()`. New schema fields have zero runtime effect until the builder maps them. TypeScript WILL catch this at the `deriveServiceConfig()` return statement. Fix: add `src/config/builders.ts` to U1 file list; add all three new fields to `deriveAgentConfig()`'s return object using explicit field-by-field mapping: `autoRetryOnReviewFeedback: asBoolean(agent.auto_retry_on_review_feedback, false)`, `prMonitorIntervalMs: asNumber(agent.pr_monitor_interval_ms, 60000)`, `autoMerge: deriveMergePolicyConfig(asRecord(agent.auto_merge))`. Do NOT replace the builder with `agentConfigSchema.parse()` — that bypasses secret resolution and the `asRecord`/`asNumber` tolerance layer. — settled round 4, sharpened round 5.

- **ISSUE-14 [MEDIUM] Git abstraction gaps for U3/U4**: Claude-round4 settles with precision. Force-push (`forcePushIfBranchExists`) IS a real gap — `GitPostRunPort.commitAndPush()` needs this option and `src/git/port.ts` must be in U3's file list. PR summary generation does NOT need git port changes — it uses `child_process.execFile()` for `git diff` directly. Severity MEDIUM for port change, resolved for summary path. — settled round 4.

- **NEW-1 [MEDIUM] `DispatchRequest` missing `previousPrFeedback`**: Claude-round4 confirms: `DispatchRequest` in `dispatch/types.ts` lacks BOTH `previousThreadId` and `previousPrFeedback`. These are needed for remote dispatch mode to pass either value to the data plane. U3 must add both fields to `DispatchRequest`. This is an extension of ISSUE-4's fix scope. — settled round 4.

- **NEW-2 [LOW] Double-comment risk in `writeCompletionWriteback`**: Claude-round4 confirms: current `tracker.createComment()` at line 67 of `completion-writeback.ts` fires for BOTH `"done"` and `"blocked"` — no gate on stop signal. U2's failure comment addition is additive, which would cause two comments on blocked runs. U2 approach must explicitly say "replace the unified comment call with a branched success/failure call." — settled round 4.

- **NEW-3 [BLOCKER] Fresh-install trap in schema migration**: REOPENED by hostile audit (round 5). Confirmed: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is NOT valid SQLite syntax — throws `near "EXISTS": syntax error` on SQLite 3.50.2. Neither `IF NOT EXISTS` nor any equivalent modifier exists in the SQLite `ADD COLUMN` grammar. Codebase audit (round 5) confirms zero `ALTER TABLE` statements exist anywhere in `src/` — the migration infrastructure is completely absent; all columns have been delivered via `CREATE TABLE IF NOT EXISTS` DDL only. **Fix**: Add a v4 migration block in `openDatabase()` using try/catch on `"already has a column named summary"` error:
  ```typescript
  if (!versionRow || versionRow.version < 4) {
    try { sqlite.exec("ALTER TABLE attempts ADD COLUMN summary TEXT"); }
    catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("already has a column named summary")) throw err;
    }
    sqlite.prepare("INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)")
      .run(4, new Date().toISOString());
  }
  ```
  Do NOT use `IF NOT EXISTS`. Do NOT use `PRAGMA table_info` (try/catch is preferred — atomic, race-safe). Update U1 approach text and add migration idempotence test scenario. — settled round 5.

- **ISSUE-1 [BLOCKER] Summary-generation mechanism gap (U4)**: REOPENED by hostile audit (round 5). Confirmed: (1) `-o /dev/stdout` produces mixed output — `codex exec` writes both JSONL/TUI progress and the `-o` file-write to stdout; piped capture is not clean. (2) U4 plan body was never updated — still contains `generatePrSummary(workspaceDir, defaultBranch, apiKey)` and "Claude API call" language. (3) Project already has working `codex exec --json` JSONL parsing infrastructure in `.claude/skills/gstack/test/helpers/codex-session-runner.ts`. **Fix**: Use `codex exec {prompt} --json -s read-only` with piped stdout; collect JSONL lines; extract final assistant text from `item.completed` events where `item.type === 'agent_message'`. No `-o` flag. No `apiKey` parameter. No Claude SDK import. Update U4 approach to replace all "Claude API call" / `apiKey` language with the `codex exec --json` subprocess + JSONL parsing pattern. Updated function signature: `generatePrSummary(workspaceDir: string, defaultBranch: string): Promise<string | null>`. Update U4 test scenarios to mock JSONL output instead of a Claude SDK response. — settled round 5.

---

### Contested (models disagree)

*(none — all points settled)*

---

### Open (raised, not yet addressed by all)

*(none — all points settled)*

---

### Score History

| Round | Version | Model | Overall | UX & Design | A11y & Responsive | Verdict |
|-------|---------|-------|---------|-------------|-------------------|---------|
| 1 | initial | claude-sonnet-4-6 | 6.7/10 | N/A | N/A | CONDITIONAL GO (78%) |
| 2 | initial | codex-gpt-5 | 5.8/10 | N/A | N/A | NO-GO (82%) |
| 3 | initial | claude-round2 | 7.4/10 | N/A | N/A | CONDITIONAL GO (85%) |
| 4 | initial | claude-round4 | 8.1/10 | N/A | N/A | CONDITIONAL GO (91%) |
| 5 | initial | hostile-auditor | —/10 | N/A | N/A | AUDIT: REOPEN 2 (10 clean, 6 flagged — 2 blockers, 4 warnings) |
| 5 | initial | claude-round5 | 8.3/10 | N/A | N/A | CONDITIONAL GO (93%) — 0 contested/open |
