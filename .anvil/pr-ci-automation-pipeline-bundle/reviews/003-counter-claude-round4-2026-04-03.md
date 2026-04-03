---
plan: feat: PR/CI Automation Pipeline Bundle
round: 4
mode: counter-review
model: claude-round4
date: 2026-04-03
previous: reviews/002-counter-claude-round2-2026-04-03.md
verdict: CONDITIONAL GO
confidence: 91%
overall_score: 8.1/10
---

## What Works

All twelve original issues from Round 1 have been methodically addressed across rounds 2–3. The codebase grounding in prior reviews was accurate — every file path, interface, and method claim has been verified against live code. The plan itself is solid: the requirements trace is complete, the unit sequencing is sensible, and all three reviewers agree on the general shape of the fix. This round closes the remaining contested and open points with definitive code evidence.

---

## Settled Points (10 items — not re-evaluated)

ISSUE-2, ISSUE-3, ISSUE-4, ISSUE-6, ISSUE-7, ISSUE-8, ISSUE-9, ISSUE-11 settled in rounds 2–3. See ledger for details.

---

## Contested Points

### ISSUE-1: Summary mechanism — codex exec --ephemeral --json

**Verdict**: AGREE with claude-round2 (MEDIUM, not HIGH). Formally settling.

**Their claim (codex-gpt-5, Round 2)**: The broader plan ambiguity around U4's mechanism is the real concern — it says "Claude API call" which is imprecise.

**claude-round2 position**: `codex exec --ephemeral --json` is the right path, reuses existing auth, no new SDK. Severity: MEDIUM (implementation clarification needed, not a blocker).

**My assessment (verified against live binary)**:

Confirmed by running `codex exec --help`. The flags `--ephemeral` and `--json` both exist exactly as claude-round2 claimed:

- `--ephemeral`: "Run without persisting session files to disk" — correct for throwaway summary generation.
- `--json`: "Print events to stdout as JSONL" — correct for programmatic consumption.
- `-o, --output-last-message <FILE>`: Alternative that writes only the final message to a file — potentially cleaner for summary extraction than parsing JSONL stream.

However, I need to push back on one assumption: the plan's U4 approach section (`plan.md` line 356) still says "feeds the diff to a single-turn **Claude API call**" and the function signature shows `generatePrSummary(workspaceDir, defaultBranch, apiKey)` — the `apiKey` parameter is explicitly present. This means the implementer reading the plan will likely reach for a direct REST call, not `codex exec`, because the plan's own approach section contradicts the claimed resolution.

The pattern in `model-list.ts` uses `codex app-server` (JSON-RPC mode), not `codex exec`. The `codex exec` path is a different invocation pattern and the plan's approach section must be updated to use it explicitly, otherwise the `apiKey` parameter will remain in the signature and an implementer will add a direct Anthropic REST dependency.

**Critically**: `codex exec --json` emits JSONL events, not a single response string. The implementer needs to know to filter for the `message.role === "assistant"` event and extract the text content, or use `--output-last-message /dev/stdout` instead. Neither is mentioned in the plan. This is still an ambiguity that will cause implementation variation.

**Recommended fix**: U4 approach must explicitly replace "Claude API call" + `apiKey` parameter with:
```
generatePrSummary(workspaceDir, defaultBranch):
  - Runs: codex exec --ephemeral -o /dev/stdout --sandbox read-only --cd workspaceDir "<prompt with diff content>"
  - Reads: last-message output from stdout (plain text, no JSONL parsing needed with -o flag)
  - Falls back to null on ENOENT or non-zero exit
  - No apiKey parameter — uses operator's existing Codex auth
```

**Status**: → Settled. Severity: MEDIUM. Path is `codex exec` with `--output-last-message`. Plan's approach text must be updated before execution to remove the `apiKey` parameter and replace "Claude API call" with the codex subprocess invocation.

---

### ISSUE-5: AgentConfig type alias drift

**Verdict**: AGREE. Formally settling.

**Both models agreed**: Replace `export interface AgentConfig { ... }` with `export type AgentConfig = z.infer<typeof agentConfigSchema>`.

**My assessment (verified)**:

Confirmed by reading `src/core/types.ts` lines 276–286 and `src/config/schemas/agent.ts`.

The drift is real and already present: `agentConfigSchema` includes `preflightCommands: z.array(z.string()).default([])` (line 15 of `agent.ts`), but `AgentConfig` interface does NOT include `preflightCommands`. This confirms the parallel-maintenance approach is already broken.

The fix `type AgentConfig = z.infer<typeof agentConfigSchema>` is the right call. It eliminates the drift, picks up `preflightCommands` retroactively, and means the three new fields (`autoRetryOnReviewFeedback`, `prMonitorIntervalMs`, `autoMerge`) are automatically included when U1 adds them to the schema. No manual `AgentConfig` update ever needed again.

**One additional concern**: `builders.ts` (`deriveAgentConfig()` function at line 110–125) explicitly maps fields by name. When U1 adds `autoRetryOnReviewFeedback`, `prMonitorIntervalMs`, and `autoMerge` to `agentConfigSchema`, `deriveAgentConfig()` will NOT return those fields — it hardcodes the field list. The `type AgentConfig = z.infer<typeof agentConfigSchema>` fix prevents TypeScript type errors, but the runtime `agent` config object constructed by `deriveAgentConfig()` will be missing the new fields. This means any code that reads `config.agent.prMonitorIntervalMs` will get `undefined` at runtime despite the TypeScript type saying it should be a number with a default.

This is ISSUE-13's concern, verified as real. U1 must update both:
1. `src/core/types.ts` — replace `interface AgentConfig` with `type AgentConfig = z.infer<typeof agentConfigSchema>`.
2. `src/config/builders.ts` — add all three new fields to `deriveAgentConfig()`'s return object.

**Status**: → Settled. Both files required. No remaining disagreement.

---

### ISSUE-10: PR body format

**Verdict**: AGREE. Formally settling.

**Both models agreed**: Add a literal template string to U4.

**My assessment (verified)**:

Confirmed from `github-pr-client.ts` line 74: current body is `issue.url ? \`Source issue: ${issue.url}\` : undefined`. The plan says "source-issue link + optional `## Changes\n\n{summary}`" but gives no concrete template.

The implementer needs an unambiguous template. Based on the current body pattern and standard Markdown, the correct template is:

```typescript
const body = [
  issue.url ? `Source issue: ${issue.url}` : null,
  summary ? `\n## Changes\n\n${summary}` : null,
].filter(Boolean).join("\n") || undefined;
```

This keeps the existing behavior when `summary` is null (backward compatible) and adds the Changes section with a blank line separator when present.

**Status**: → Settled. Add this template explicitly to U4's approach. Low severity, but removes ambiguity.

---

### ISSUE-12: getPrStatus() returns unknown

**Verdict**: AGREE. Formally settling.

**Both models agreed**: Define `PrStatusResponse` interface + type guard as U3 deliverable.

**My assessment (verified)**:

Confirmed from `github-pr-client.ts` lines 106–119. `getPrStatus()` calls `githubRequest()` which returns `Promise<unknown>`. The private `githubRequest()` method is typed `Promise<unknown>` (line 122). Every new method the plan adds to `GitHubPrClient` (`getPrReviews()`, `getPrLineComments()`, `closePr()`, `getPrChecksStatus()`) will also return `unknown` unless explicitly typed at the call site.

The fix: define in U3:
```typescript
export interface PrStatusResponse {
  state: "open" | "closed";
  merged: boolean;
  number: number;
  html_url: string;
  merge_commit_sha: string | null;
}

export function isPrStatusResponse(v: unknown): v is PrStatusResponse {
  return typeof v === "object" && v !== null && "state" in v && "merged" in v;
}
```

`PrMonitorService.poll()` in U6 must use this guard before reading `.state` or `.merged`. Without it, `.state` reads on `unknown` will pass TypeScript only with unsafe casts, which are banned by the codebase's code quality rules.

**Status**: → Settled. Explicit deliverable in U3: `PrStatusResponse` interface + `isPrStatusResponse` type guard. Required before U6 can safely read poll results.

---

### ISSUE-13: builders.ts not in U1 file list

**Verdict**: AGREE. HIGH severity. Formally settling.

**Both models agreed**: `builders.ts` is missing from U1's file list.

**My assessment (verified)**:

Confirmed from `src/config/builders.ts` `deriveAgentConfig()` at lines 110–125. The function hardcodes the return object — it explicitly maps `maxConcurrentAgents`, `maxTurns`, `maxRetryBackoffMs`, etc. by name from the raw `agent` record. It does NOT call `agentConfigSchema.parse()` — it manually constructs the `AgentConfig`-typed object field by field.

This means: adding `autoRetryOnReviewFeedback`, `prMonitorIntervalMs`, and `autoMerge` to `agentConfigSchema` (U1's plan) has zero runtime effect until `deriveAgentConfig()` also maps those fields. TypeScript won't catch this even with the `type AgentConfig = z.infer<typeof agentConfigSchema>` fix, because `deriveAgentConfig()` returns a structurally-typed object that will be missing the new fields — TypeScript will flag this as a compile error (the returned object doesn't match `ServiceConfig["agent"]` which is `AgentConfig` which now includes the new fields). So TypeScript WILL catch it, but only at the `deriveServiceConfig()` return statement, not at the `deriveAgentConfig()` call site.

**Practical impact**: If the implementer adds schema fields but forgets `builders.ts`, the build will fail. If they add both correctly, it works. The plan must list `src/config/builders.ts` in U1's file list to prevent this being discovered mid-implementation.

**Status**: → Settled. HIGH severity. `src/config/builders.ts` must be in U1's file list with explicit instruction to add the three new fields to `deriveAgentConfig()`'s return object.

---

### ISSUE-14: Git abstraction gaps for U3/U4

**Verdict**: PARTIALLY AGREE with claude-round2. Formally settling with precision.

**Their claim (codex-gpt-5, Round 2)**: `GitPostRunPort` and `GitManager` need `forcePushIfBranchExists` additions; PR summary injection needs git abstractions.

**claude-round2 position**: PARTIALLY AGREE — the force-push and summary injection are real omissions; the runtime-providers.ts wiring uncertainty is a minor open question.

**My assessment (verified)**:

Reading `src/git/port.ts`, `GitPostRunPort` currently has only two methods: `commitAndPush()` and `createPullRequest()`. The plan (U3) proposes extending `commitAndPush()` to accept `forcePushIfBranchExists?: boolean` option. This is an interface change on `GitPostRunPort` — and `GitManager` implements `GitIntegrationPort` which extends `GitPostRunPort`. Both must be updated.

**Force-push (`forcePushIfBranchExists`)**: Real gap. `GitPostRunPort.commitAndPush()` signature change is required in `src/git/port.ts`. `GitManager.commitAndPush()` implementation must add `--force-with-lease` logic in `pushWithToken()`. U3's file list should include `src/git/port.ts`.

**PR summary injection**: The plan's U4 approach says `generatePrSummary()` uses `child_process.execFile()` for `git diff` and passes the diff content to a `codex exec` subprocess. Neither of these requires a `GitManager` method — they operate on the workspace directory directly. So PR summary generation does NOT require git abstraction changes beyond what's already on `GitPostRunPort`. This part of ISSUE-14 is overclaimed.

**`forcePushIfBranchExists` needs to be in `GitPostRunPort`**: YES — if `PrMonitorService` or any code calls `commitAndPush()` via the port interface, the option must be on the port. But looking at the plan, force-push is called from `executeGitPostRun()` which already has a `GitManager` instance, not just a port reference. This reduces the urgency slightly — the force-push option can be added to `GitManager` directly without modifying the port, and `executeGitPostRun()` can call it via the concrete class. However, the plan's test scenarios mention mocking `GitPostRunPort` for force-push — which requires the option on the port.

**Verdict on ISSUE-14**: The force-push interface change on `GitPostRunPort` is REAL and required. Add `src/git/port.ts` to U3's file list. The PR summary git abstraction gap is NOT real — `generatePrSummary()` uses `child_process.execFile()` directly, no port needed. Severity remains MEDIUM for the port change, LOW for the summary path (resolved).

**Status**: → Settled. `src/git/port.ts` must be in U3's file list for the `forcePushIfBranchExists` option. PR summary generation does not require git port changes.

---

## Open Points

### NEW-1: DispatchRequest missing previousPrFeedback

**Verdict**: REAL. Settling as required fix.

**My assessment (verified)**:

Reading `src/dispatch/types.ts` lines 46–60. `DispatchRequest` currently has: `issue`, `attempt`, `modelSelection`, `promptTemplate`, `workspace`, `config`, `codexRuntimeConfigToml`, `codexRuntimeAuthJsonBase64`, `codexRequiredEnvNames`. It does NOT have `previousThreadId` either — that field only exists on `RunAttemptDispatcher.runAttempt()` (line 35: `previousThreadId?: string | null`).

So the pattern for remote dispatch is: `RunAttemptDispatcher.runAttempt()` carries the runtime parameters (including `previousThreadId`) but `DispatchRequest` (the serialized HTTP payload) does NOT carry `previousThreadId`. This means the `DispatchClient` must bridge between the two: when it calls `runAttempt()` it receives `previousThreadId` but when it builds the `DispatchRequest` it has no field to put it in.

This is a pre-existing gap for `previousThreadId` — not just for `previousPrFeedback`. The conclusion: either both fields are silently dropped in remote dispatch mode (which would mean remote dispatch can never resume threads or inject feedback), or the `DispatchRequest` type needs to be extended for both.

Given the plan adds `previousPrFeedback` following the same pattern as `previousThreadId`, and remote dispatch would need both to work correctly, `DispatchRequest` needs both fields added. This is a REAL omission and should be in U3's fix scope alongside the `RunAttemptDispatcher.runAttempt()` change.

**Recommended fix**: Add to `DispatchRequest`: `previousThreadId?: string | null` and `previousPrFeedback?: string | null`. Add `src/dispatch/types.ts` explicitly to U3's file list (the round 2 settlement of ISSUE-4 referenced it but the ledger note is ambiguous about whether `DispatchRequest` itself is updated — making this explicit).

**Status**: → Settled. Real gap, MEDIUM severity. `DispatchRequest` must include both `previousThreadId` and `previousPrFeedback`.

---

### NEW-2: Double-comment risk in writeCompletionWriteback

**Verdict**: REAL. Settling with precise characterization.

**My assessment (verified)**:

Reading `src/orchestrator/worker-outcome/completion-writeback.ts`. Lines 26–73 show the current implementation:

1. Lines 26–40: Builds `commentBody` unconditionally (for all stop signals).
2. Lines 42–64: State transition block — gated on `stopSignal === "done" && successState`.
3. Lines 66–73: `tracker.createComment()` call — **NOT gated on stop signal** — fires for BOTH `"done"` AND `"blocked"`.

This confirms the double-comment risk is REAL. Currently, `"blocked"` runs already post a completion comment (the `commentBody` which says "**Risoluto agent completed** ✓"). When U2 adds a failure comment branch for `"blocked"`, an implementer who adds the failure comment without removing the existing comment post for `"blocked"` will produce two comments on blocked runs: the existing success-format comment AND the new failure comment.

The plan's U2 approach says "construct a failure comment body... Call `tracker.createComment()` wrapped in try/catch" for the `"blocked"` branch — but it does not explicitly say "replace the existing unified comment path with a branched one." The approach says to add a failure body for blocked, which reads as additive.

**Recommended fix**: U2 approach must explicitly state:

> The existing `tracker.createComment(issue.id, commentBody)` call (line 67 in the current file) must be REPLACED with a branched call:
> - If `stopSignal === "done"`: post the existing success comment body (with turns/cost additions).
> - If `stopSignal === "blocked"`: post the new failure comment body (do NOT post the success body).

This is a "replace, not extend" instruction, not just "add a failure branch."

**Status**: → Settled. LOW severity but concrete fix required. Approach must say "replace" not "add."

---

### NEW-3: Fresh-install trap in schema migration

**Verdict**: REAL. Settling with definitive fix.

**My assessment (verified)**:

SQLite version on this system: **3.50.2** (released 2025-06-28). This is well above 3.37.0, which introduced `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

Reading `src/persistence/sqlite/database.ts` lines 18–174:

- `CREATE_TABLES_SQL` runs at line 164 via `sqlite.exec(CREATE_TABLES_SQL)` — this creates ALL tables from scratch on fresh installs, including the `attempts` table WITH all columns defined at that point.
- The version check at lines 170–174 only seeds the version number; it contains no `ALTER TABLE` logic.

When ISSUE-2's fix adds the `summary` column migration:
```typescript
if (!versionRow || versionRow.version < 4) {
  sqlite.exec("ALTER TABLE attempts ADD COLUMN summary TEXT;");
  ...
}
```

This will throw on fresh installs because `CREATE_TABLES_SQL` already includes `summary TEXT` (from the U1 schema change to `schema.ts`) — the column already exists before the `ALTER TABLE` runs.

The pattern `PRAGMA table_info(attempts)` to check column existence first does NOT exist anywhere in this codebase. The cleaner fix given SQLite 3.50.2 (well above 3.37) is simply:

```typescript
sqlite.exec("ALTER TABLE attempts ADD COLUMN IF NOT EXISTS summary TEXT;");
```

This is idempotent: no-op on fresh install (column already exists), applies the column on existing installs (column missing). Zero try/catch needed. Zero PRAGMA check needed.

**No prior `IF NOT EXISTS` or `PRAGMA table_info` patterns exist in the codebase** — `src/persistence/sqlite/database.ts` was the only hit when searching for these patterns, confirming this would be the first. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is the right choice here: it's idempotent, SQLite 3.37+ only (which is satisfied by 3.50.2), and doesn't require adding a new pattern to the codebase.

**Status**: → Settled. LOW severity. The migration must use `ALTER TABLE attempts ADD COLUMN IF NOT EXISTS summary TEXT` rather than `ALTER TABLE attempts ADD COLUMN summary TEXT`. This is an important correctness fix — plain `ALTER TABLE ADD COLUMN` will throw a fatal error on fresh installs and kill the service on startup.

---

## Additional Issues Found

No new issues surfaced during this round. All remaining gaps are captured in the settlements above.

---

## Summary of All Settlements This Round

| Issue | Settlement |
|-------|------------|
| ISSUE-1 | Settled: `codex exec --ephemeral -o /dev/stdout` path; U4 must remove `apiKey` param and replace "Claude API call" text |
| ISSUE-5 | Settled: Replace `interface AgentConfig` with `type AgentConfig = z.infer<typeof agentConfigSchema>` in `src/core/types.ts` |
| ISSUE-10 | Settled: Add explicit body template to U4 approach |
| ISSUE-12 | Settled: `PrStatusResponse` interface + `isPrStatusResponse` type guard as U3 deliverable |
| ISSUE-13 | Settled: `src/config/builders.ts` must be in U1 file list; `deriveAgentConfig()` must return all 3 new fields |
| ISSUE-14 | Settled: `src/git/port.ts` must be in U3 file list for `forcePushIfBranchExists`; PR summary path does NOT need port changes |
| NEW-1 | Settled: `DispatchRequest` must add both `previousThreadId` and `previousPrFeedback` fields |
| NEW-2 | Settled: U2 approach must say "replace" unified comment with branched success/failure paths |
| NEW-3 | Settled: Migration must use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (SQLite 3.37+, system has 3.50.2) |

---

## Revised Scores

| Dimension | Round 1 | Round 2 | Round 4 | Delta (R2→R4) | Notes |
|-----------|---------|---------|---------|---------------|-------|
| **Completeness** | 6/10 | 7/10 | 8/10 | +1 | builders.ts gap (ISSUE-13) and DispatchRequest gap (NEW-1) now settled with fixes; all 9 contested/open items have concrete resolutions |
| **Sequencing & Dependencies** | 5/10 | 7/10 | 8/10 | +1 | ISSUE-14 port gap resolved: git/port.ts now correctly in U3 scope; no remaining sequencing ambiguity |
| **Risk Coverage** | 6/10 | 6/10 | 7/10 | +1 | NEW-3 fresh-install trap resolved with IF NOT EXISTS; NEW-2 double-comment risk settled with explicit "replace" instruction |
| **Feasibility** | 6/10 | 8/10 | 8/10 | 0 | Unchanged; codex exec path removes SDK blocker, all remaining items are interface additions |
| **Edge Cases** | 7/10 | 7/10 | 8/10 | +1 | NEW-3 fresh-install trap was a concrete startup crash; now resolved; NEW-1 remote dispatch feedback loss resolved |
| **Clarity** | 7/10 | 7/10 | 8/10 | +1 | ISSUE-10 template now explicit; ISSUE-1 codex exec invocation now precise; ISSUE-13 builder requirement now explicit |
| **Scope Discipline** | 8/10 | 8/10 | 8/10 | 0 | Still clean |
| **ROI / Effort** | 8/10 | 8/10 | 8/10 | 0 | Unchanged |
| **Goal Alignment** | 8/10 | 8/10 | 9/10 | +1 | NEW-1 DispatchRequest fix ensures remote dispatch mode actually delivers feedback end-to-end; goal of review-feedback loop now fully aligned |
| **Frontend & UX** | N/A | N/A | N/A | — | Backend-only |
| **Accessibility & Responsiveness** | N/A | N/A | — | — | Backend-only |

**Overall: 8.1/10**

The plan has reached execution-ready state. All contested and open items are settled with code-verified fixes. The remaining work is updating the plan text itself (U4 approach text, U1/U3 file lists, U2 "replace not add" instruction) before handing to the implementer.

---

## Verdict: CONDITIONAL GO — 91%

The plan is ready to execute provided the following plan-text updates are made before implementation begins (none require replanning — all are clarifications to existing units):

1. **U1 file list**: Add `src/config/builders.ts`. Add to approach: "extend `deriveAgentConfig()` to map `autoRetryOnReviewFeedback`, `prMonitorIntervalMs`, and `autoMerge` from the raw `agent` record."

2. **U1 approach**: Replace `export interface AgentConfig` with `type AgentConfig = z.infer<typeof agentConfigSchema>` in `src/core/types.ts`. Remove manual field list from `AgentConfig`.

3. **U1 migration**: Use `ALTER TABLE attempts ADD COLUMN IF NOT EXISTS summary TEXT` (not bare `ADD COLUMN`) to prevent fresh-install startup crash.

4. **U3 file list**: Add `src/git/port.ts`. Add `src/dispatch/types.ts` explicitly for `DispatchRequest` extension (both `previousThreadId` and `previousPrFeedback`).

5. **U3 approach for `DispatchRequest`**: State explicitly that `DispatchRequest` gains `previousThreadId?: string | null` and `previousPrFeedback?: string | null`.

6. **U3 deliverable**: Define `PrStatusResponse` interface and `isPrStatusResponse()` type guard.

7. **U4 approach**: Replace "Claude API call" / `apiKey` parameter with `codex exec --ephemeral -o /dev/stdout` subprocess invocation pattern. Remove `apiKey` from `generatePrSummary()` signature.

8. **U4 approach**: Add explicit PR body template (source-issue link + conditional Changes section).

9. **U2 approach**: Add explicit "replace the existing unified `tracker.createComment()` call with a branched success/failure call — do not add a second comment post alongside the existing one."

