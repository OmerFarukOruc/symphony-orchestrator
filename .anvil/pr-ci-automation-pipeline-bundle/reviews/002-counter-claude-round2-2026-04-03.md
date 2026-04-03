---
plan: feat: PR/CI Automation Pipeline Bundle
round: 2
mode: counter-review
model: claude-round2
date: 2026-04-03
previous: reviews/001-review-claude-2026-04-03.md
verdict: CONDITIONAL GO
confidence: 85%
overall_score: 7.4/10
---

## What Works

Round 1 was methodical and codebase-grounded — all 12 issues are real observations, not hallucinated claims. The HIGH severity calls (ISSUE-1, ISSUE-2) correctly identified the two genuine pre-execution blockers. The structural concerns (ISSUE-4, ISSUE-5, ISSUE-11) are valid compile-time risks that will surface immediately on `pnpm run build`. The plan itself remains well-structured and the requirements trace is solid enough that addressing these issues does not require a rewrite — it requires targeted additions.

---

## Settled Points (0 items — carried from Round 1 ledger)

All 12 issues are Open from Round 1. Evaluating all 12 below.

---

## Open Points

### [ISSUE-1] No Anthropic SDK — PR summary generation mechanism unspecified

**Verdict**: DISAGREE on severity; AGREE on the gap

**Their claim**: The plan calls for "a Claude API call" but `@anthropic-ai/sdk` is not in `package.json`, making U4 a blocker.

**My assessment**: The original reviewer correctly identifies the SDK gap, but misses a cleaner alternative already proven in the codebase: `codex exec`. The `codex` CLI binary is the runtime this system already depends on as a foundational dependency. `codex exec --ephemeral --json --output-last-message /dev/stdout "<prompt>"` can run a single-turn, no-sandbox task with no additional dependencies, no new API key (reuses the operator's existing Codex/OpenAI auth), and no Docker. This matches the pattern already used in `src/codex/model-list.ts` which spawns `codex app-server` to query models via JSON-RPC.

The plan's description "separate lightweight Codex invocation, capped at 1 turn" is actually more consistent with `codex exec` than with a raw Anthropic API call. The plan's use of the phrase "Claude API call" is imprecise — what it means operationally is "call the configured LLM via the Codex runtime" which is exactly what `codex exec` does.

This changes the severity from BLOCKER to AMBIGUITY:
- No new dependency needed
- No new API key needed (Codex auth already configured)
- The implementation is `spawn("codex", ["exec", "--ephemeral", "--json", prompt], { stdin: diffContent })`

**What still needs to be resolved**: U4's approach section must explicitly state that `generatePrSummary()` uses `codex exec --ephemeral --json` (not a raw REST call) and pipes the diff via stdin. The `apiKey` parameter in the function signature should be removed since Codex uses its own auth. Graceful degradation when `codex` binary is absent (same ENOENT check as model-list.ts).

**Recommended fix**: Update U4 approach to: "Use `codex exec --ephemeral --json` subprocess, piping `git diff` output via stdin. Reuses existing Codex auth. Returns null when binary unavailable (ENOENT) or on any error."

**Status**: → Settled (path is clear, clarification needed but not a blocker)

---

### [ISSUE-2] Schema migration gap — `summary` column on existing `attempts` table

**Verdict**: AGREE

**Their claim**: `CREATE TABLE IF NOT EXISTS` does not add new columns to existing tables; the `summary` column needs an `ALTER TABLE` migration with a `schema_version` bump.

**My assessment**: Confirmed by direct inspection of `src/persistence/sqlite/database.ts`. The schema initialization is `sqlite.exec(CREATE_TABLES_SQL)` where `CREATE_TABLES_SQL` uses `CREATE TABLE IF NOT EXISTS` for all tables. There is a `schema_version` table (currently seeded at version 3 with `INSERT OR REPLACE INTO schema_version ... VALUES (3, ...)`) but there is **zero migration logic** — no `IF versionRow.version < N` branching that runs `ALTER TABLE` statements. The current version bump is just a seed, not a migration gate.

This means on any existing deployment with the `attempts` table already present:
- `CREATE TABLE IF NOT EXISTS attempts (...)` is a no-op (correct)
- The `summary` column from the Drizzle schema definition is never added to the existing physical table
- When `updateAttempt()` or `createAttempt()` includes `summary` in the Drizzle `.set()` call, Drizzle will silently include the column in the SQL — and SQLite will throw `table attempts has no column named summary`

The existing pattern has never needed `ALTER TABLE` before because all prior changes were new tables. This is the first additive column change.

**Additional finding**: The `database.ts` version logic does not actually gate migrations. It only seeds the version number. A proper fix requires adding a version-gated migration block:

```typescript
if (!versionRow || versionRow.version < 4) {
  sqlite.exec("ALTER TABLE attempts ADD COLUMN summary TEXT;");
  sqlite.prepare("INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)")
        .run(4, new Date().toISOString());
}
```

U1 must add `database.ts` to its file list with this migration block.

**Status**: → Settled (AGREE — must be fixed before execution)

---

### [ISSUE-3] `handleCancelledOrHardFailure` sync→async ambiguity

**Verdict**: PARTIALLY AGREE

**Their claim**: The function is synchronous; adding async tracker calls is ambiguous — must clarify whether it becomes async or fires-and-forgets.

**My assessment**: Confirmed that `handleCancelledOrHardFailure` is declared `function handleCancelledOrHardFailure(...): void` (synchronous). The call sites in `index.ts` call it without `await`. The Plan's approach says it calls `writeFailureWriteback()` — an async function that wraps `tracker.createComment()`.

However, the correct resolution is clear from the existing codebase pattern: `handleContinuationExhausted` in `retry-paths.ts` is already `async` and is called with `await` at its call sites. The pattern is established — functions that need async tracker calls become async, call sites get `await`. This is not a dangerous ambiguity, it's a one-line change to two call sites in `index.ts`.

The reviewer's concern about test verifiability is valid but not blocking — the test can `await` the promise directly since `handleCancelledOrHardFailure` would return `Promise<void>` after becoming async.

**Recommended fix**: State explicitly in U2: "`handleCancelledOrHardFailure` becomes `async function` returning `Promise<void>`. Update both call sites in `index.ts` to `await handleCancelledOrHardFailure(...)`."

**Status**: → Settled (resolution is clear; medium issue closed)

---

### [ISSUE-4] `queueRetry` interface surgery underestimated

**Verdict**: AGREE

**Their claim**: The plan lists only `context.ts` and `agent-runner/contracts.ts` but the full chain also includes `src/core/types.ts` (RetryEntry), `src/orchestrator/retry-manager.ts`, and `src/dispatch/types.ts`.

**My assessment**: Confirmed by code inspection. In `src/core/types.ts` (line 48–57), `RetryEntry` has only `threadId?: string | null` — no `previousPrFeedback`. In `src/orchestrator/retry-manager.ts`, `queueRetry()` sets `retryEntries.set(issue.id, { ..., threadId: metadata?.threadId ?? null, ... })` — no `previousPrFeedback`. In `src/dispatch/types.ts`, `RunAttemptDispatcher.runAttempt()` takes `previousThreadId?: string | null` but no `previousPrFeedback`. In `src/agent-runner/index.ts`, `runAttempt()` takes `previousThreadId?: string | null` as its thread-resume mechanism.

However, I challenge part of the reviewer's file list. `src/orchestrator/runtime-types.ts` defines `RetryRuntimeEntry = RetryEntry & { issue; workspaceKey }` — this does NOT need a change because `previousPrFeedback` would be on `RetryEntry` itself, and `RetryRuntimeEntry` extends it structurally. Also `src/orchestrator/orchestrator-delegates.ts` referenced by the reviewer — this file does not exist in the codebase (checked); the retry wiring is in `orchestrator.ts` directly.

**Additional precision**: The `DispatchRequest` type in `dispatch/types.ts` does NOT include `previousThreadId` — it's only in `RunAttemptDispatcher.runAttempt()` interface. So `previousPrFeedback` for the dispatch path follows the same pattern: add to `RunAttemptDispatcher.runAttempt()` input and `DispatchRequest`, then the dispatch client and server both pass it through.

**Status**: → Settled (AGREE — U3 file list needs `src/core/types.ts`, `src/orchestrator/retry-manager.ts`, `src/dispatch/types.ts`)

---

### [ISSUE-5] `AgentConfig` TypeScript type not updated

**Verdict**: DISAGREE on root cause; AGREE on symptom

**Their claim**: `AgentConfig` in `src/core/types.ts` is maintained in parallel with `agentConfigSchema` in `src/config/schemas/agent.ts` and must be updated manually.

**My assessment**: Confirmed that `AgentConfig` at line 276–286 of `src/core/types.ts` is a manually maintained `interface` — it is NOT derived from `z.infer<typeof agentConfigSchema>`. It currently has `maxConcurrentAgents`, `maxTurns`, `maxRetryBackoffMs`, `maxContinuationAttempts`, `successState`, `stallTimeoutMs` — but does NOT have `preflightCommands` despite that field existing in `agentConfigSchema`. This means the interface is already drifted — `preflightCommands` was added to the schema at some point and not added to the interface.

This is a stronger finding than the reviewer stated: the parallel maintenance is already broken. The proper fix for U1 is NOT to add to the manual `AgentConfig` interface, but to replace `AgentConfig` with `type AgentConfig = z.infer<typeof agentConfigSchema>` — which would resolve the existing drift and prevent future drift. This is a small change that eliminates an entire class of future bugs.

**Recommended fix**: U1 should replace `export interface AgentConfig { ... }` in `src/core/types.ts` with `import type { agentConfigSchema } from "../config/schemas/agent.js"; export type AgentConfig = z.infer<typeof agentConfigSchema>;`. This requires no further manual maintenance and catches the existing `preflightCommands` gap.

**Status**: → Settled (AGREE on compile failure risk; recommended fix is stronger than original)

---

### [ISSUE-6] U6↔U7 circular dependency

**Verdict**: PARTIALLY AGREE

**Their claim**: U6 and U7 have a circular dependency in the implementation unit ordering.

**My assessment**: This is a sequencing documentation problem, not a true circular module dependency. The actual call graph is:
- U7 provides: `appendCheckpoint()` method on `AttemptStorePort` + SQLite implementation (pure infrastructure)
- U6 (`PrMonitorService`) calls `appendCheckpoint("pr_merged")` from U7's infrastructure

These are two different concerns. U7 defines the **interface and store** — it has no dependency on U6. U6 **calls** U7's store method — U6 depends on U7. The plan's dependency list for U7 that says "Unit 6 (for 'pr_merged' checkpoint trigger)" is mislabeled — the `"pr_merged"` trigger is written in `PrMonitorService` (U6), not in U7. U7 only needs to define the `"pr_merged"` string in the `CheckpointTrigger` union type.

The correct reading is:
- U7 defines `CheckpointTrigger` (includes `"pr_merged"` as a string literal)
- U6 writes the checkpoint; U6 therefore depends on U7's interface/store being done first
- U7's only "dependency" on U6 is the write site being in `pr-monitor.ts` (a U6 file)

This is **not circular**. It's U7 (schema + port + store) before U6 (monitor that calls the store). The implementation order is: U7a (schema + port + store), then U6, then write the `"pr_merged"` checkpoint trigger inside U6's `PrMonitorService` which already depends on U7a.

The plan's stated ordering `U7 → U6` in the module graph is correct. The claim that U7 depends on U6 is a misreading of the plan's dependency list. But the dependency list IS confusingly written and should be clarified.

**Recommended fix**: Change U7's "Dependencies" line from "Unit 1, Unit 6" to "Unit 1 only — the `pr_merged` write point is implemented in U6 as a caller of U7's store method." Remove the false U7→U6 dependency.

**Status**: → Settled (not a real circular dependency; documentation needs correction)

---

### [ISSUE-7] Duplicate `db`/`attemptStore` in `PrMonitorService` constructor

**Verdict**: AGREE

**Their claim**: The constructor signature lists both `db: AttemptStorePort` and `attemptStore` as separate fields.

**My assessment**: Confirmed in the plan's U6 approach section: `{ db: AttemptStorePort, ghClient: GitHubPrClient, eventBus, tracker, workspaceManager, logger, getConfig, attemptStore }`. The rest of the codebase uses `attemptStore: AttemptStorePort` exclusively (confirmed in `OrchestratorDeps` in `runtime-types.ts`). The `db` naming appears to be a copy-paste artifact from internal thinking about the SQLite layer. Only `attemptStore: AttemptStorePort` should be present.

**Status**: → Settled (trivial fix, confirmed)

---

### [ISSUE-8] Auto-retry race condition — no guard for `status !== "running"` in auto-retry path

**Verdict**: AGREE

**Their claim**: `PrMonitorService.poll()` needs a `status !== "running"` guard on the auto-retry path, mirroring the auto-archive guard.

**My assessment**: The plan's poll logic says: on merge, check `getAttempt(attemptId).status !== 'running'` before triggering archive. But for the auto-retry-on-review path triggered by "CHANGES_REQUESTED", no equivalent guard is mentioned. This is a legitimate race: if the first run is still in progress (status `running`) and a reviewer already left "CHANGES_REQUESTED" from a previous PR (which the monitor knows about), the monitor could queue a retry while the worker is running. The `queueRetry()` function in `retry-manager.ts` does call `ctx.claimIssue(issue.id)` which would prevent a second claim — but only if the running worker already holds the claim. If the running worker released its claim at some intermediate point (not expected but possible in edge cases), the guard is the correct defense.

This is a medium-severity gap in the plan's specification. The fix is one line in the U6 approach section: `if (attemptRecord.status === "running") return; // skip retry queue if still in flight`.

**Status**: → Settled (AGREE — U6 approach needs explicit guard)

---

### [ISSUE-9] `getAllPrs()` split across U6/U8

**Verdict**: AGREE

**Their claim**: U8 adds `getAllPrs()` as a parenthetical but U6 doesn't include it in the `AttemptStorePort` additions.

**My assessment**: Confirmed in the plan. U6's `AttemptStorePort` extension lists `upsertPrRecord`, `getOpenPrs`, `updatePrRecord`, `getPrByNumber` — no `getAllPrs`. U8 adds it as "calls `deps.attemptStore.getOpenPrs()` (plus all PRs for full history — add `getAllPrs()` method)" as a parenthetical. This interface addition needs to live in U6 where the rest of the PR port methods are defined, not discovered at U8 time.

**Status**: → Settled (trivial, add to U6 file list)

---

### [ISSUE-10] PR body format unspecified

**Verdict**: AGREE

**Their claim**: No concrete template for PR body with "Changes" heading.

**My assessment**: Confirmed. The plan says "source-issue link + optional `## Changes\n\n{summary}`" without specifying the exact separator, blank lines, or template when summary is null. This is a low-severity implementation ambiguity. The U4 approach should include a literal template string.

**Status**: → Settled (low severity, can close with one-line template in U4)

---

### [ISSUE-11] JSONL-mode `AttemptStore` not in U6/U7 file lists

**Verdict**: PARTIALLY AGREE — severity overstated

**Their claim**: `src/core/attempt-store.ts` implements `AttemptStorePort` and will fail TypeScript compilation when new methods are added.

**My assessment**: The claim is technically correct but the framing is misleading. `AttemptStore` does NOT formally declare `implements AttemptStorePort` — confirmed by grepping. TypeScript uses structural typing, so it only fails compilation when `AttemptStore` is assigned to a variable typed as `AttemptStorePort`. Looking at `runtime.ts`:

```typescript
const store = new AttemptStore(dataDir, storeLogger);
return { ..., attemptStore: store, ... };
```

The return type is `PersistenceRuntime` which has `attemptStore: AttemptStorePort`. So the structural assignment IS checked at compile time via the return type annotation. This WILL fail TypeScript compilation when new methods are added to `AttemptStorePort` that `AttemptStore` doesn't implement.

However, JSONL mode is clearly marked as `// Legacy JSONL mode — no shared DB` and `RISOLUTO_PERSISTENCE=jsonl` is not referenced anywhere in `src/` or `tests/` except the runtime itself. It is effectively a dead code path that exists only for backward compatibility during migration. No tests exercise it. No documentation mentions it.

The correct resolution is simpler than adding stubs: add `implements AttemptStorePort` to `AttemptStore` and add no-op stubs that `throw new Error("not supported in JSONL mode")` — which is more honest than returning empty arrays that silently swallow data. But the reviewer is right that this needs to be in the U6/U7 file lists.

**Recommended fix**: Add to U6 file list: "Modify `src/core/attempt-store.ts` (add no-op stubs throwing `Error('PR tracking not supported in JSONL mode')`). Add `implements AttemptStorePort`."

**Status**: → Settled (AGREE on fix needed, PARTIALLY AGREE on severity)

---

### [ISSUE-12] `getPrStatus()` returns `unknown` — unsafe casting in PR monitor

**Verdict**: AGREE

**Their claim**: `getPrStatus()` returns `Promise<unknown>`, making the PR monitor's state-change detection type-unsafe.

**My assessment**: Confirmed. `getPrStatus()` in `github-pr-client.ts` returns `Promise<unknown>` (line 111). The entire `githubRequest()` private method returns `Promise<unknown>`. The monitor's `poll()` needs to read `.state` (string: "open"|"closed") and `.merged` (boolean) from this response. Without type narrowing, this is a runtime landmine.

The codebase precedent is the `"html_url" in pullRequest` guard in git-post-run, which narrows `unknown` by property existence check. But for the monitor, the state detection must be robust — incorrect narrowing means missed merges or false-positive archive/cleanup triggers.

**Additional finding**: The plan adds `getPrReviews()`, `getPrLineComments()`, `getPrChecksStatus()` all similarly returning `unknown`. A typed `GitHubPrResponse` interface (or at minimum a narrow type guard) should be an explicit U3 deliverable, not left implicit.

**Recommended fix**: U3 should include "Define `PrStatusResponse` interface: `{ state: 'open' | 'closed'; merged: boolean; number: number; html_url: string }` with a type guard `isPrStatusResponse(v: unknown): v is PrStatusResponse`." U6's poll uses this guard.

**Status**: → Settled (AGREE — explicit deliverable needed in U3)

---

## Additional Issues Found

### [NEW-1] `DispatchRequest` does not include `previousPrFeedback` — data plane dispatch gap

**Severity: MEDIUM**

Beyond ISSUE-4's list of files, I note that `DispatchRequest` in `dispatch/types.ts` (the serialized payload sent from control plane to data plane when using remote dispatch) does NOT include `previousThreadId` either — that field only exists on `RunAttemptDispatcher.runAttempt()`. Checking the `DispatchClient` in `dispatch/client.ts`: it constructs a `DispatchRequest` to POST to the data plane, and the data plane's `dispatch/server.ts` receives it. The `previousPrFeedback` string needs to be in `DispatchRequest` too, otherwise remote-dispatch mode silently loses the feedback. This is an extension of ISSUE-4 but specific enough to call out separately. U3 must update `DispatchRequest` as well.

---

### [NEW-2] `writeCompletionWriteback` already has partial R1 implementation — risk of double-commenting

**Severity: LOW**

Reading `src/orchestrator/worker-outcome/completion-writeback.ts`: the function already builds a comment body with tokens and duration, and already calls `tracker.createComment()`. The plan's U2 adds `turnCount` and `cost` to this same comment. This is straightforward additive work. However, the function currently posts the comment for ALL stop signals (both `"done"` and `"blocked"`), then R2 wants a distinct failure comment for `"blocked"`. The existing code has no `if (stopSignal === "done")` gate around the comment post — it posts for both. The U2 approach separates this correctly (success comment vs. failure comment), but the implementer must ensure they replace the unified comment path with a branched one, not add a second comment post that fires alongside the existing one. The plan says "In the `'blocked'` branch: construct a failure comment body" — which implies the existing comment path is still there for success and a new failure path is added for blocked. But the current code posts for BOTH with the same body. U2 needs to clarify that the unified comment is replaced with: success comment (done) OR failure comment (blocked), not both.

---

### [NEW-3] Schema version seeding logic has an off-by-one for future migrations

**Severity: LOW**

The current `database.ts` migration gate is `if (!versionRow || versionRow.version < 3)` which runs the version-3 seed. When ISSUE-2's fix adds a version-4 migration block gated by `versionRow.version < 4`, the existing `< 3` block will also run on fresh DBs (which have no version row). This is fine since the `< 3` block is idempotent. But the structure means both blocks run sequentially on fresh installations: `< 3` seeds to 3, then `< 4` upgrades to 4 and runs `ALTER TABLE`. The `CREATE TABLE IF NOT EXISTS attempts` in `CREATE_TABLES_SQL` runs BEFORE the version checks — so on a fresh install, the `attempts` table exists WITH the `summary` column (from `CREATE_TABLES_SQL`) by the time the `ALTER TABLE` migration runs. This means the migration will throw `duplicate column name: summary` on fresh installs. The fix: the `ALTER TABLE` must be wrapped in a try/catch or guarded by checking column existence first (e.g., `PRAGMA table_info(attempts)` before running the ALTER).

---

## Revised Scores

| Dimension | Round 1 | Round 2 | Delta | Notes |
|-----------|---------|---------|-------|-------|
| **Completeness** | 6/10 | 7/10 | +1 | U4 blocker resolved (codex exec path), but NEW-2 and NEW-3 add minor gaps |
| **Sequencing & Dependencies** | 5/10 | 7/10 | +2 | U6↔U7 is not a real circular dep; ISSUE-4 depth is confirmed but solvable |
| **Risk Coverage** | 6/10 | 6/10 | 0 | ISSUE-2 migration fix now includes a NEW-3 fresh-install trap; net neutral |
| **Feasibility** | 6/10 | 8/10 | +2 | codex exec path removes the SDK blocker entirely; remaining issues are interface additions |
| **Edge Cases** | 7/10 | 7/10 | 0 | NEW-2 double-comment risk is the main addition; existing edge cases confirmed |
| **Clarity** | 7/10 | 7/10 | 0 | Circular dep clarification helps; NEW-2 and NEW-3 add ambiguity elsewhere |
| **Scope Discipline** | 8/10 | 8/10 | 0 | Still clean |
| **ROI / Effort** | 8/10 | 8/10 | 0 | Unchanged |
| **Goal Alignment** | 8/10 | 8/10 | 0 | Unchanged |
| **Frontend & UX** | N/A | N/A | — | Backend-only |
| **Accessibility & Responsiveness** | N/A | N/A | — | Backend-only |

**Overall: 7.4/10**

The plan moves from 6.7 to 7.4 after resolving the key ambiguities. The primary score drivers: feasibility improves significantly (codex exec removes the alleged blocker), sequencing improves (circular dep was a documentation problem not a real one). The remaining gap is the migration trap (NEW-3), the double-comment risk (NEW-2), and the unresolved interface depth (ISSUE-4, now extended by NEW-1).

---

## Debate Ledger

*(See updated ledger.md)*
