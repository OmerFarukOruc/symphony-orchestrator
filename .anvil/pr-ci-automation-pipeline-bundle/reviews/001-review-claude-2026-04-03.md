---
plan: feat: PR/CI Automation Pipeline Bundle
round: 1
mode: review
model: claude-sonnet-4-6
date: 2026-04-03
previous: none
verdict: CONDITIONAL GO
confidence: 78%
overall_score: 6.7/10
---

## What Works

The plan is unusually well-grounded in the actual codebase: every file path and interface it references was verified as real. The requirements trace (R1–R33) is comprehensive and the dependency graph (U1→U2→…→U8) follows a sensible additive order. The institutional learnings section correctly captures how the codebase handles non-fatal errors and where config schema extensions belong — the plan won't introduce stylistic drift.

---

## Settled Points (0 items — first review, no ledger yet)

*Initial review — all findings are new.*

---

## Open Points

### [ISSUE-1] Unit 4 PR summary generation requires an Anthropic SDK that does not exist in the project

**Severity: HIGH — implementation blocker**

**My assessment:** The plan says `generatePrSummary()` "feeds the diff to a single-turn Claude API call." The plan specifically says "a Claude API call" and references `child_process.execFile` for `git diff`. There is **no `@anthropic-ai/sdk` or any Anthropic API client** in the project's `package.json` dependencies (confirmed: only `better-sqlite3`, `drizzle-orm`, `express`, `express-rate-limit`, `liquidjs`, `pino`, `yaml`, `zod`). The codebase has never made a direct Claude/Anthropic API call outside of skill helper scripts.

This means U4 requires either:
(a) adding a new runtime dependency (`@anthropic-ai/sdk`) and a new secret (`ANTHROPIC_API_KEY`) — which requires operator opt-in, docs updates, and security review, or
(b) using a different mechanism (e.g., spawning the existing Codex CLI the same way the agent runner does, or using `gh` CLI, or deferring summary generation entirely).

The plan says "no sandbox needed — just `child_process.exec` for `git diff` and a Claude API call for the summary" but the Claude API call mechanism is completely unspecified and unsupported by the current runtime. This is not a deferral-worthy detail — it's the entire mechanism of the feature. The plan calls it out as a technical decision ("lightweight Codex invocation") but then says it's a "separate agent call (not the main worker run)" which contradicts the unit description that calls it "a short Claude API call."

**What's missing:** The plan must specify whether this uses: (a) Codex CLI subprocess (consistent with how the rest of the system works), (b) direct Anthropic REST API via `fetch` (consistent with how `GitHubPrClient` makes GitHub calls — no SDK), or (c) skips LLM entirely and generates a structured summary from `git diff --stat` output without a model call. Option (b) is actually the most consistent with the codebase pattern (fetch-based, no SDK), but it requires an API key source to be specified.

**Status:** → Open (must be resolved before execution)

---

### [ISSUE-2] SQLite schema migration is `CREATE TABLE IF NOT EXISTS` only — existing DBs don't get new tables

**Severity: HIGH — data integrity risk on upgrade**

**My assessment:** Confirmed by reading `src/persistence/sqlite/database.ts`. The entire schema is applied via `sqlite.exec(CREATE_TABLE_SQL)` at startup. For fresh databases this works. For existing databases that already have the `attempts` table (i.e., every existing deployment), `CREATE TABLE IF NOT EXISTS` for the new `pullRequests`, `attemptCheckpoints` tables will execute fine — this is additive and safe.

However, the plan also proposes adding a `summary` column to the existing `attempts` table. `CREATE TABLE IF NOT EXISTS` **does not add new columns to existing tables**. There is no `ALTER TABLE attempts ADD COLUMN summary TEXT` in the plan, no migration step, and no schema versioning increment mentioned (current version is 3).

The plan's risk table says "Drizzle migrations; write migration script alongside schema changes; test against fresh DB and existing DB" but the actual Implementation Units for U1 say only "add `summary: text("summary")` (nullable)" to the Drizzle schema definition — **no `ALTER TABLE` migration step, no schema version bump, no migration file**.

The `summary` column will silently not exist on any existing deployment. `updateAttempt()` that includes `summary` in the patch will attempt to write a column that doesn't exist. Drizzle ORM will either silently drop it or throw an error depending on how `update().set(row)` handles extra columns — and since `attemptRecordToRow()` is driven by the Drizzle schema definition, the column mapping might silently no-op or throw.

**What's missing:** U1 must explicitly include: `ALTER TABLE attempts ADD COLUMN summary TEXT;` as a migration step gated behind a schema version check (version < 4), a `schema_version` bump, and a test for upgrading an existing DB. The same applies to any new columns on existing tables.

**Status:** → Open (must be resolved before execution)

---

### [ISSUE-3] `handleCancelledOrHardFailure` is a sync function — adding async tracker calls changes its signature

**Severity: MEDIUM — interface mismatch**

**My assessment:** Confirmed by reading `src/orchestrator/worker-outcome/terminal-paths.ts`. `handleCancelledOrHardFailure` is declared as a plain synchronous `function handleCancelledOrHardFailure(...)` that returns `void`. It has **no `async`**. All callers in `src/orchestrator/worker-outcome/index.ts` call it without `await`.

The plan says: "call a new `writeFailureWriteback()` helper (extracted from the failure branch above). Accept `tracker`, `issue`, `attempt`, `errorMessage`, `durationMs` as parameters." The tracker's `createComment()` is async (returns `Promise<void>`). So `writeFailureWriteback()` must be async.

If `handleCancelledOrHardFailure` calls an async function without `await`, the comment write is fire-and-forget. That's actually fine for the non-fatal requirement (R5), but it means:
1. The test scenario "Integration: `handleStopSignal` with `stopSignal === "blocked"` results in failure comment posted" requires `await` somewhere to be verifiable in tests — the test will need to flush the pending promise.
2. The plan should explicitly state whether `handleCancelledOrHardFailure` becomes `async` (changing 2 call sites in `index.ts` from `handleCancelledOrHardFailure(...)` to `await handleCancelledOrHardFailure(...)`) or fires-and-forgets.

The plan also lists this as modifying `terminal-paths.ts` and `retry-paths.ts` but the retry path change needed (`handleContinuationExhausted`) is already async — that one is fine.

**What's missing:** The plan must specify whether `handleCancelledOrHardFailure` becomes async (and update call sites) or delegates to a fire-and-forget call. The implementation notes should be explicit on this.

**Status:** → Open (needs clarification)

---

### [ISSUE-4] `queueRetry()` metadata type doesn't support `previousPrFeedback` — interface change depth is underestimated

**Severity: MEDIUM — broader-than-claimed interface surgery**

**My assessment:** Confirmed by reading `src/orchestrator/retry-manager.ts` and `src/orchestrator/context.ts`. The `queueRetry` function signature in `OutcomeContext` and `OrchestratorContext` is:
```typescript
queueRetry(issue, attempt, delayMs, error, metadata?: { threadId?: string | null }): void
```
And `RetryEntry` in `src/core/types.ts` has `threadId?: string | null` but no `previousPrFeedback` field.

The plan says: "On retry: `queueRetry()` accepts a `previousPrFeedback` field in its metadata; `launchWorker()` reads it and passes it to the agent runner prompt builder." This requires touching:
1. `src/core/types.ts` — `RetryEntry` interface (add `previousPrFeedback?: string | null`)
2. `src/orchestrator/retry-manager.ts` — `queueRetry()` function signature and `retryEntries.set()` call
3. `src/orchestrator/context.ts` — both `OutcomeContext.queueRetry` and `OrchestratorContext.queueRetry` type signatures
4. `src/orchestrator/orchestrator-delegates.ts` — likely where `queueRetry` is wired up
5. `src/dispatch/types.ts` — `RunAttemptDispatcher.runAttempt()` interface (add `previousPrFeedback?`)
6. Both `AgentRunner` local and `DispatchClient` remote implementations
7. `src/orchestrator/worker-launcher.ts` — `launchWorker()` options and `RunAttemptDispatcher.runAttempt()` call site

The plan's U3 file list only mentions `src/orchestrator/context.ts` and `src/agent-runner/contracts.ts`. It **misses** `src/core/types.ts` (RetryEntry), `src/orchestrator/retry-manager.ts` (queueRetry impl), and `src/dispatch/types.ts` (RunAttemptDispatcher). This is significantly more interface surgery than called out.

**What's missing:** The U3 file list must include `src/core/types.ts` (RetryEntry), `src/orchestrator/retry-manager.ts`, and `src/dispatch/types.ts`. The plan should also account for the `DispatchRequest` type in the data-plane dispatch path — if the data plane receives `previousPrFeedback` it may need to be in the serialized dispatch payload.

**Status:** → Open (scope underestimated, needs correction)

---

### [ISSUE-5] `AgentConfig` type in `src/core/types.ts` must be updated alongside the Zod schema — the plan omits it

**Severity: MEDIUM — TypeScript compile failure**

**My assessment:** Confirmed. `AgentConfig` in `src/core/types.ts` (line 276) is the TypeScript interface that matches the Zod `agentConfigSchema` in `src/config/schemas/agent.ts`. These are maintained in parallel — the Zod schema does not auto-generate the TypeScript type. When the plan adds `autoRetryOnReviewFeedback`, `prMonitorIntervalMs`, and `autoMerge` to `agentConfigSchema`, those fields will appear in the parsed config but `AgentConfig` won't include them. Any code that does `const config: AgentConfig = ...` or reads `config.agent.prMonitorIntervalMs` will fail TypeScript type checking.

The plan's U1 file list says "Modify: `src/config/schemas/agent.ts`" but does **not include** "Modify: `src/core/types.ts`" for `AgentConfig`. The plan only mentions adding `AttemptCheckpointRecord`, `PrRecord`, and `MergePolicy` to `src/core/types.ts` — not updating `AgentConfig`.

**What's missing:** U1 must add "Modify `AgentConfig` interface in `src/core/types.ts`" to its file list to include `autoRetryOnReviewFeedback: boolean`, `prMonitorIntervalMs: number`, and `autoMerge: MergePolicy` (the nested config type, not just the stub).

**Status:** → Open (compile-time failure if unaddressed)

---

### [ISSUE-6] U6 depends on U7, but U7 depends on U6 — circular dependency in implementation units

**Severity: MEDIUM — sequencing risk**

**My assessment:** The dependency graph in the plan states:
- U6 depends on: U1, U5, **U7** (for checkpoint write on PR merge)
- U7 depends on: U1, **U6** (for "pr_merged" checkpoint trigger)

This is a circular dependency between implementation units. U6 (`PrMonitorService`) needs to call `appendCheckpoint("pr_merged")` from U7. U7's `"pr_merged"` checkpoint trigger is written inside `PrMonitorService` from U6.

The resolution is that U7 defines the `appendCheckpoint` interface and table, and U6 calls it — so U7 should be implemented first (infrastructure), then U6 calls into it. But the plan lists U6 before U7 in the dependency graph (U7 → U6) which contradicts the actual sequencing needed. The module dependency graph shows `U7[U7: Checkpoint history] --> U6[U6: PR lifecycle monitor]` which means U7 provides something U6 consumes — consistent with U7 needing to come first or at least concurrently.

The real implementation order should be: U7's schema/port/store additions are self-contained and can be done alongside or before U6. The plan's stated ordering (U6 depends on U7) implies U6 should be implemented after U7, but the header of U6 says "Dependencies: Unit 1, Unit 5, Unit 7" — which is correct. The header of U7 says "Dependencies: Unit 1, Unit 6" — which means they're mutually dependent. This is contradictory and will cause the implementer to be stuck in the wrong order.

**What's missing:** The plan should break the circular dependency by splitting U7 into:
- U7a: Schema, port interface, store implementation, and `appendCheckpoint()` method (no callers yet)  
- U7b: The write points in `PrMonitorService` for `"pr_merged"` trigger  

Then U6 depends on U7a, and U7b depends on U6. Or simply state that U7's `"pr_merged"` trigger is written as part of U6 implementation, and U7's dependency on U6 is specifically that one write site.

**Status:** → Open (sequencing confusion for implementer)

---

### [ISSUE-7] `PrMonitorService` constructor injected with both `db: AttemptStorePort` and `attemptStore: AttemptStorePort` — duplicate field

**Severity: LOW — naming inconsistency**

**My assessment:** In the U6 Approach section, `PrMonitorService` constructor is listed as accepting:
```
{ db: AttemptStorePort, ghClient: GitHubPrClient, eventBus, tracker, workspaceManager, logger, getConfig, attemptStore }
```
Both `db: AttemptStorePort` and `attemptStore` appear as separate fields but appear to be the same type serving the same purpose. Looking at how `SqliteAttemptStore` is named and how the pattern works (the plan itself says "constructor accepts `{ db: AttemptStorePort ... }` ... calls `getOpenPrs()` to get all `status === 'open'` rows"), `db` here appears to be an accidental duplication of `attemptStore`. This will cause confusion at implementation time.

**What's missing:** The constructor signature should be unified — use `attemptStore: AttemptStorePort` consistently (as used everywhere else in the codebase).

**Status:** → Open (minor, fix at implementation)

---

### [ISSUE-8] Auto-retry on review feedback creates a race between `PrMonitorService` and `executeGitPostRun` for the same PR

**Severity: MEDIUM — concurrency gap**

**My assessment:** The plan says `auto_retry_on_review_feedback` causes the PR monitor (Unit 6) to call `queueRetry()` when it detects "CHANGES_REQUESTED." But `executeGitPostRun` in the same run is responsible for the force-push. Consider this sequence:

1. Run completes → creates PR → PR monitor registers it → `executeGitPostRun` returns
2. Meanwhile, PR monitor polls and detects "CHANGES_REQUESTED" (from a reviewer who already commented before the PR was created, or immediately after)
3. `PrMonitorService.poll()` queues a retry
4. The retry launches → `executeGitPostRun` force-pushes to the same branch

The plan guards the auto-archive path with "check `getAttempt(attemptId).status !== 'running'` before triggering archive," but there is no equivalent guard for the auto-retry-on-review path. If a run is still in-flight when the monitor polls and sees "CHANGES_REQUESTED", it will queue a retry that races with the active worker.

Additionally, R15 says "when enabled, detecting 'changes requested' automatically queues a re-run" — but the plan doesn't specify whether the PR monitor also needs to check that `status !== "running"` before queuing that retry. If it doesn't, the same issue can be double-dispatched.

**What's missing:** The U6 `poll()` logic must guard the auto-retry path with a `status !== "running"` check, mirroring the existing auto-archive guard. This needs to be explicit in the approach, not left to implementation intuition.

**Status:** → Open (needs explicit guard in U6 approach)

---

### [ISSUE-9] `getAllPrs()` method referenced in U8 but never added to `AttemptStorePort` in U6

**Severity: LOW — interface inconsistency**

**My assessment:** U8 says: "`GET /api/v1/prs`: calls `deps.attemptStore.getOpenPrs()` (plus all PRs for full history — add `getAllPrs()` method)". The U6 approach lists `getOpenPrs()`, `updatePrRecord()`, `upsertPrRecord()`, `getPrByNumber()` as new methods on `AttemptStorePort`. Neither U6 nor U7 mentions `getAllPrs()`. U8 adds it as a parenthetical "add `getAllPrs()` method" without calling it out in U6's port interface additions. This means the interface and implementation extension are split across two units, making it easy for an implementer to miss the interface addition in U6 or miss the implementation detail in U8.

**What's missing:** Either add `getAllPrs()` explicitly to U6's `AttemptStorePort` additions, or make it clear that U8 is responsible for adding it and testing it. It shouldn't be discovered as a missing method at U8 implementation time.

**Status:** → Open (minor, but easy to miss)

---

### [ISSUE-10] PR body injection places "Changes" heading after or alongside source-issue link — exact format not specified

**Severity: LOW — ambiguity for implementer**

**My assessment:** R7 says "Inject summary into PR body under a 'Changes' heading." U4 says "build the PR body as: source-issue link + optional `## Changes\n\n{summary}` section." The current `createPullRequest` body is:
```
Source issue: ${issue.url}
```
The plan doesn't specify whether the "Changes" section comes before or after this line, whether there's a blank line separator, or what the format looks like when summary is null vs present. This isn't a blocker but will result in inconsistent formatting choices by the implementer.

**What's missing:** A concrete body template, e.g.:
```
Source issue: ${issue.url}

## Changes

${summary}
```

**Status:** → Open (minor, can be resolved at implementation time)

---

### [ISSUE-11] `AttemptStore` (JSONL legacy mode) also implements `AttemptStorePort` — no stub plan for new methods

**Severity: MEDIUM — JSONL mode users get runtime errors**

**My assessment:** Confirmed by reading `src/persistence/sqlite/runtime.ts`. When `RISOLUTO_PERSISTENCE=jsonl`, the system uses `AttemptStore` from `src/core/attempt-store.ts` instead of `SqliteAttemptStore`. `AttemptStore` also implements `AttemptStorePort`. When U6 and U7 add new methods to `AttemptStorePort` (`appendCheckpoint`, `listCheckpoints`, `upsertPrRecord`, `getOpenPrs`, etc.), `AttemptStore` will fail TypeScript compilation unless it also implements them.

The plan says "check `tests/helpers/` for mock stores that may need stub implementations" in the System-Wide Impact section — this is good, but it doesn't mention `src/core/attempt-store.ts` (the JSONL store). The JSONL store needs stub implementations that return no-ops or empty arrays for all new methods.

**What's missing:** U6 and U7 file lists should include "Modify: `src/core/attempt-store.ts` (add no-op stubs for new `AttemptStorePort` methods to maintain JSONL mode compatibility)."

**Status:** → Open (TypeScript compile failure in JSONL mode)

---

### [ISSUE-12] `getPrStatus()` returns `unknown` — the PR monitor's state-change detection relies on unsafe casting

**Severity: MEDIUM — silent runtime bugs**

**My assessment:** Confirmed by reading `src/git/github-pr-client.ts`. `getPrStatus()` currently returns `Promise<unknown>`. The plan says the PR monitor's `poll()` calls `getPrStatus()` and checks if status changed — but to read `.state` or `.merged` from the response, the implementation will need to cast the `unknown` return. Without a typed interface for the GitHub PR response, this is a silent type safety hole that could produce undefined reads or missed state transitions.

The plan adds `getPrReviews()`, `getPrLineComments()`, `closePr()` to `GitHubPrClient` (U3) and `requestAutoMerge()`, `getPrChecksStatus()` (U5) — all similarly returning `unknown` unless explicitly typed. The codebase uses `unknown` and then checks properties manually (see `executeGitPostRun` and its `"html_url" in pullRequest` dance), which is workable but the plan gives no guidance on what type narrowing is expected for the PR monitor's state detection.

**What's missing:** U3/U5 should define typed response interfaces (or at minimum, a `PrStatusResponse` type with `state: "open" | "closed" | "merged"` and `merged: boolean`) to enable type-safe polling logic. The PR monitor's ability to detect state changes correctly depends on this. This should be listed as an explicit deliverable in U3/U6 rather than left as implementation detail.

**Status:** → Open (risk of silent bugs in core PR monitor logic)

---

## Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Completeness** | 6/10 | Files and requirements well-mapped, but U4 mechanism unspecified (no Anthropic SDK), `AgentConfig` type update missing, JSONL store stubs not listed |
| **Sequencing & Dependencies** | 5/10 | U6↔U7 circular dependency, `previousPrFeedback` chain underestimates interface depth, `getAllPrs()` split across units |
| **Risk Coverage** | 6/10 | Good risk table for infra risks; race condition in auto-retry (ISSUE-8) missed; schema migration for `summary` column gap (ISSUE-2) is a real risk not in the table |
| **Feasibility** | 6/10 | All existing file claims verified correct; Anthropic SDK dependency is the key open question; everything else is executable with current stack |
| **Edge Cases** | 7/10 | Good coverage of null/error paths; `getPrStatus()` unknown return type in monitor polling is underspecified; null != null dedup edge case in checkpoints is correctly called out |
| **Clarity** | 7/10 | Approach sections are detailed and well-written; the constructor duplicate field and circular dependency are clarity failures; PR body format is ambiguous |
| **Scope Discipline** | 8/10 | Well-scoped to the requirements; no gold-plating detected; backend-only scope is cleanly enforced |
| **ROI / Effort** | 8/10 | High value — closes the "dark" gap between PR creation and merge/abandon; 8 units is proportionate to 33 requirements |
| **Goal Alignment** | 8/10 | Every unit traces to numbered requirements; R1–R33 coverage is complete |
| **Frontend & UX** | N/A | Backend-only plan |
| **Accessibility & Responsiveness** | N/A | Backend-only plan |

**Overall: 6.7/10**

The plan is not an average of these scores — the schema migration gap (ISSUE-2) is a correctness failure for all existing deployments, and the Anthropic SDK gap (ISSUE-1) is an implementation blocker for U4. These lower the overall score significantly despite strong scores elsewhere.

---

## Verdict: CONDITIONAL GO — 78%

The plan can be executed after addressing:

1. **[ISSUE-1 — BLOCKER]** Specify the exact mechanism for PR summary generation. The recommended path: use `fetch()` against the Anthropic REST API (consistent with how `GitHubPrClient` makes API calls — no SDK, just `Authorization: Bearer ${ANTHROPIC_API_KEY}` header). State that the feature requires `ANTHROPIC_API_KEY` to be set and degrades gracefully (returns null) if not.

2. **[ISSUE-2 — BLOCKER]** Add `ALTER TABLE attempts ADD COLUMN summary TEXT;` as a schema migration step in U1, gated behind `schema_version < 4`, with a `schema_version` bump to 4. Add `database.ts` to U1's file list.

3. **[ISSUE-5 — BLOCKER before compile]** Add `AgentConfig` update to U1's file list.

4. **[ISSUE-11 — BLOCKER before compile]** Add JSONL-mode `AttemptStore` no-op stubs to U6/U7 file lists.

5. **[ISSUE-4 — MEDIUM]** Expand U3 file list to include `src/core/types.ts` (RetryEntry), `src/orchestrator/retry-manager.ts`, and `src/dispatch/types.ts`.

6. **[ISSUE-3 — MEDIUM]** Clarify whether `handleCancelledOrHardFailure` becomes async or uses fire-and-forget for the failure comment.

7. **[ISSUE-6 — MEDIUM]** Resolve the U6↔U7 circular dependency statement by clarifying sequencing explicitly.

8. **[ISSUE-8 — MEDIUM]** Add explicit guard for auto-retry-on-review path in U6's `poll()` approach: check `status !== "running"` before calling `queueRetry()`.

Items 9–12 (ISSUE-7, 9, 10, 12) can be resolved at implementation time without replanning.
