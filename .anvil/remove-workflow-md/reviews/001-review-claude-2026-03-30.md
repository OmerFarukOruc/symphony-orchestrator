---
plan: "feat: Remove WORKFLOW.md — Full WebUI-First Config"
round: 1
mode: review
model: claude-sonnet-4-6
date: 2026-03-30
previous: none
verdict: CONDITIONAL GO
confidence: 78%
overall_score: 6.5/10
---

## What Works

The plan is well-researched and grounded in the actual codebase. The startup sequence reasoning (constructor vs. `start()` for Map population), the idempotency confirmation for `importLegacyFiles`, and the decision to use a `resolveTemplate` closure over injecting `PromptTemplateStore` directly are all correct and well-motivated. The unit dependency graph is accurate and the parallel execution of U1/U3 is sound.

---

## Issue 1 — `--log-dir` vs `--data-dir` Naming Conflict (BLOCKER)

**Severity:** HIGH — executability gap; the plan as written will silently break the existing `--log-dir` flag.

**Evidence:** `src/cli/index.ts` lines 140 and 149 show that `--log-dir` is the *current* CLI flag for `archiveDir`. The plan says to add `--data-dir` as the new flag for `dataDir` and derive `archiveDir` as `<data-dir>/archives`. This creates two problems:

1. The plan never says what happens to `--log-dir`. The Operational Notes (line 1014–1018 of plan) acknowledge this ambiguity ("verify whether `--log-dir` is also removed or kept as a legacy alias") but *defer the decision entirely*. This is not a detail to defer — the E2E test and any operator script using `--log-dir` will silently get neither flag applied if `--log-dir` is simply left as-is but now points to a different path than `archiveDir`.

2. The existing `archiveDir` derivation (line 148–153 of `index.ts`) uses `--log-dir` to set `archiveDir` *directly* (not `dataDir`). After the change, `archiveDir` comes from `dataDir`. If `--log-dir` is retained as a legacy alias, it must map to `dataDir`, not `archiveDir` — otherwise operators using `--log-dir /some/path` get `archives` placed at `/some/path/archives` instead of `/some/path`.

**Required fix:** Make the decision explicit in the plan. Recommended: remove `--log-dir` entirely (clean break, consistent with the positional arg removal), document it in release notes alongside the positional arg removal. Alternatively: retain `--log-dir` as a deprecated alias mapping to `--data-dir` with a deprecation warning.

---

## Issue 2 — `onConflictDoUpdate` Requires a `target` Column — Partial UPSERT Is Not Native (BLOCKER)

**Severity:** HIGH — the plan's `upsertTemplateId` / `upsertModel` methods are described as "INSERT OR REPLACE" preserving the other columns, but Drizzle's `onConflictDoUpdate` requires `target` to be specified and the `set` payload must be constructed manually. The real risk is the *partial-column update*.

**Evidence:** The plan says (Unit 5, Approach):
> `upsertTemplateId(identifier, templateId)` — INSERT OR REPLACE (only `template_id` column; preserves model columns)

SQLite `INSERT OR REPLACE` is actually `DELETE + INSERT` — it will **null out** `model` and `reasoning_effort` if only `template_id` is provided. The plan acknowledges this risk in the Risks table ("INSERT OR REPLACE clobbers model when only template_id is updated") and says to use separate methods that use "column-level updates, not full-row replace." But the Approach section for Unit 5 still says "INSERT OR REPLACE" for `upsertTemplateId`.

**Drizzle version 0.45.2 (confirmed installed) does support `onConflictDoUpdate`** — but it requires `target: [issueConfig.identifier]` and an explicit `set: { templateId: ... }` payload. The `set` field must list only the columns to update; the primary key is excluded; other columns are *implicitly preserved by SQLite* (because it's an UPDATE, not a REPLACE). This works correctly.

The plan's **description** is right (separate methods, column-level) but the **approach text** contradicts it by saying "INSERT OR REPLACE." This will cause a bug if the implementer follows the Approach literally instead of the Risk mitigation. The plan needs the Approach text corrected to explicitly say `onConflictDoUpdate({ target: [identifier], set: { templateId: ... } })`.

---

## Issue 3 — Unit 5 Startup Sequence: Workers Can Launch Before Maps Are Populated (HIGH)

**Severity:** HIGH — race condition in the startup sequence.

**Evidence:** `src/orchestrator/orchestrator.ts` lines 135–147:

```typescript
async start(): Promise<void> {
  if (this._state.running) return;
  this._state.running = true;
  this.markStateDirty();
  this.watchdog.start();
  await cleanupTerminalWorkspaces(this._state, this.deps);
  seedCompletedClaims({ ... });
  this.scheduleTick(0);  // ← fires a tick immediately (delay=0)
}
```

`scheduleTick(0)` posts a microtask/setTimeout(0) that triggers the first poll cycle. The plan says to load `issue_config` rows "after `seedCompletedClaims`" in `start()`. If the DB load is `await issueConfigStore.loadAll()`, that is async. But `scheduleTick(0)` fires on the next event loop iteration — which is *before* the `await` resolves if `loadAll()` takes even one I/O tick.

Concretely:
```
start():
  seedCompletedClaims()         // sync — OK
  await issueConfigStore.loadAll()  // yields — event loop free
  // scheduleTick(0) fires HERE, before loadAll resolves
  this.scheduleTick(0)          // too late
```

If the implementer puts `loadAll()` *before* `scheduleTick(0)`, this is safe. If they put it after (matching the stated "after `seedCompletedClaims`"), the tick could race the Map population.

**Note:** `better-sqlite3` is **synchronous** — `loadAll()` will be synchronous too. So if `IssueConfigStore.loadAll()` uses `db.select().from(issueConfig).all()` (synchronous Drizzle call), there is **no race**. But the plan describes `loadAll()` as returning a `Promise` (from the test scenarios: "returns all rows"). This ambiguity must be resolved: either `loadAll()` is sync (correct for better-sqlite3) or the plan must place it before `scheduleTick(0)` with an explicit ordering note.

**Required fix:** Clarify in Unit 5 that `loadAll()` is synchronous (it uses better-sqlite3 which is sync throughout the codebase — confirmed by existing `PromptTemplateStore` using `.all()` synchronously). Remove the `Promise<...>` return type from the `loadAll()` spec. Document that the call must precede `scheduleTick(0)`.

---

## Issue 4 — Unit 6 Closure Captures `issueTemplateOverrides` Before It Exists (HIGH)

**Severity:** HIGH — the closure design has a chicken-and-egg problem.

**Evidence:** The plan says (Unit 6, Approach):
```typescript
resolveTemplate: async (identifier) => {
  const templateId = issueTemplateOverrides.get(identifier) ?? null;
  ...
}
```
where `issueTemplateOverrides` is "the Map from the orchestrator state."

But `OrchestratorDeps` (defined in `src/orchestrator/runtime-types.ts`) is passed to `new Orchestrator(deps)` in `createServices`. The `issueTemplateOverrides` Map lives inside `_state`, which is created *inside* the `Orchestrator` constructor — it does not exist until `new Orchestrator(deps)` is called.

The plan's proposed solution is: "expose a `getTemplateOverride(identifier): string | null` method on the orchestrator and call it inside the resolver." If this method is exposed, the closure captures the orchestrator reference (which is created before `resolveTemplate` is invoked), and the Map is read at call time — this is safe.

However the plan says **both**:
1. Pass `issueTemplateOverrides` Map reference directly (first paragraph of Unit 6 Approach)
2. Expose `getTemplateOverride()` on the orchestrator (last paragraph of Unit 6 Approach)

These are contradictory. Option 1 is impossible before construction; option 2 works. The plan defers resolution ("cleanest approach: expose `getTemplateOverride`") but leaves both options in the text, creating ambiguity for the implementer.

**Required fix:** Commit to option 2. Remove the direct Map reference option. Add `getTemplateOverride(identifier: string): string | null` to the list of `OrchestratorPort` additions (it is not currently in the Unit 7 port additions list).

---

## Issue 5 — E2E Bootstrap: Setup Mode vs. Overlay PUT (HIGH)

**Severity:** HIGH — the plan's E2E bootstrap assumes the overlay PUT works unconditionally, but it only does if Symphony does NOT start in setup mode.

**Evidence:**

The current E2E test bypasses setup mode by including a real `project_slug` in `WORKFLOW.e2e.md`, which makes `validateDispatch()` pass. After the change, Symphony starts with `--data-dir` and **no config at all** in a fresh DB. With an empty overlay:
- `configStore.getConfig()` returns a `ServiceConfig` with empty/default values
- `validateDispatch()` will fail with `missing_tracker_api_key` or `missing_tracker_project_slug`
- This triggers `needsSetup = true` in `main()` (line 76–89 of `index.ts`)
- In setup mode, `orchestrator.start()` is **NOT called** (line 98–100 of `index.ts`)

Now the E2E plan says: "spawn Symphony with `--data-dir`, wait for HTTP ready at `/api/v1/setup/status` or `/api/v1/state`, then call `PUT /api/v1/config/overlay`."

The problem: `PUT /api/v1/config/overlay` is registered unconditionally (`registerConfigApi` is called when `configStore && configOverlayStore` exist — confirmed in `routes.ts` lines 351–357). **So the PUT itself succeeds.** But after the PUT, the plan says "the orchestrator is live, not in setup mode." There is a missing step: **after the PUT, something must trigger re-evaluation of `needsSetup`**. In the current code, `needsSetup` is evaluated once at startup and never re-checked. The PUT triggers `ConfigStore.refresh()` via subscription, which updates `getConfig()`, but `needsSetup` is a local variable in `main()` that is already set. **`orchestrator.start()` will never be called.**

The E2E test currently gates on `/api/v1/state` returning 200 with `generated_at` — which requires the orchestrator to be running. With the new approach, `/api/v1/state` would return 200 (the route is always registered) but `generated_at` may be stale or the orchestrator may be stopped.

**Required fix:** The plan needs to account for this. Options:
- (a) Inject initial config via env vars before first boot so Symphony starts in normal mode, then the overlay PUT is for subsequent config changes only.
- (b) Make `main()` reactive to `needsSetup` — when the overlay PUT resolves `validateDispatch()`, trigger `orchestrator.start()`. This is a non-trivial code change not currently scoped.
- (c) The E2E test injects MASTER_KEY + a minimal overlay YAML on disk *before* spawning Symphony, so the first boot passes `validateDispatch()`. This is essentially the same as the current approach but using the overlay file instead of WORKFLOW.md.

Option (c) is the least invasive. The plan should specify it.

---

## Issue 6 — `seedDefaults` Idempotency Check Is Config-Table-Level, Not Template-Level (MEDIUM)

**Severity:** MEDIUM — subtle correctness gap.

**Evidence:** `src/config/legacy-import.ts` lines 33–35:
```typescript
export function seedDefaults(db: SymphonyDatabase): void {
  const existing = db.select().from(config).limit(1).all();
  if (existing.length > 0) return;   // ← early return on ANY config row
```

The default template seed (lines 46–69) is inside the same early-return guard. This means: if the operator has already run a *previous* version of Symphony (config table has rows) but the `prompt_templates` table is empty (e.g., they wiped templates manually or migrated from a version before templates existed), `seedDefaults` will **not** seed the default template. On first boot with the new version, `resolveTemplate` will fall through to `""` + WARN for every worker launch.

The plan notes that "on fresh install (no templates after legacy import), seed a built-in 'default' template" (R6) and says `seedDefaults` handles this. But `seedDefaults` will not run the template seed if the config table already has rows. The plan should add a separate guard (or split `seedDefaults` into two idempotent phases) that seeds the template unconditionally if `prompt_templates` is empty.

---

## Issue 7 — `restartResilience` E2E Phase Uses Hardcoded `WORKFLOW.e2e.md` Path (MEDIUM)

**Severity:** MEDIUM — the plan specifies updating `restartResilience` to use `--data-dir`, but the current code at `phases-lifecycle.ts` line 476–478 reconstructs the workflow path as:
```typescript
const workflowPath = path.join(ctx.reportDir, "WORKFLOW.e2e.md");
ctx.symphonyProcess = spawnSymphony(ctx.symphonyPort, workflowPath, ctx.reportDir, buildSymphonyEnv(ctx));
```
After the change, this `workflowPath` no longer exists. But the plan says to re-apply overlay after restart: "PUT `PUT /api/v1/config/overlay` after restart to restore config before the poll check." This suffers from the same setup mode problem as Issue 5. After restart with a fresh-but-existing DB (from the first run), the DB has config rows, so `validateDispatch()` should pass (config was imported on first boot). This means restart is safe — but only because the first boot already populated the DB.

The plan does not explicitly state this dependency ("restart works because DB is already seeded from first boot"). This must be documented to avoid implementer confusion.

---

## Issue 8 — `database.ts` `CREATE_TABLES_SQL` Must Add `issue_config` Table (MEDIUM)

**Severity:** MEDIUM — the plan says to add the table to `schema.ts` (Drizzle ORM schema) but does not mention `database.ts`.

**Evidence:** `src/persistence/sqlite/database.ts` contains a hardcoded `CREATE_TABLES_SQL` string (lines 18–117) with `CREATE TABLE IF NOT EXISTS` for every table. The `openDatabase` function runs this SQL directly. The Drizzle schema in `schema.ts` is used for type-safe queries but does NOT auto-create tables from Drizzle definitions — the raw SQL in `database.ts` does.

The plan says: "No migration file is needed if the project uses `openDatabase` with auto-schema creation (verify at implementation time)." The implementer will verify and find that `database.ts` must also be updated. But the plan does not list `database.ts` as a file to modify in Unit 3. If the implementer only updates `schema.ts`, the `issue_config` table will not exist at runtime and all queries will throw.

**Required fix:** Add `src/persistence/sqlite/database.ts` to the Unit 3 file list as a required modification.

---

## Issue 9 — `OrchestratorContext` Does Not Expose `resolveTemplate` to `launchWorker` (MEDIUM)

**Severity:** MEDIUM — Unit 6 adds `resolveTemplate` to `OrchestratorDeps`, but `launchWorker` receives an `OrchestratorContext`, not `OrchestratorDeps` directly.

**Evidence:** `src/orchestrator/context.ts` defines `OrchestratorContext`. `launchWorker` at line 356 uses `ctx.deps.configStore.getWorkflow()`. After the change, it would use `ctx.deps.resolveTemplate(...)` — but `ctx.deps` is `OrchestratorDeps`, and the plan adds `resolveTemplate` to `OrchestratorDeps`. This works correctly since `ctx.deps` is passed through.

However, `buildCtx` (in `orchestrator-delegates.ts`) constructs the `OrchestratorContext` by spreading `deps` as a sub-object. The `resolveTemplate` function will be available at `ctx.deps.resolveTemplate` — which is fine. But the plan should explicitly note this access path, since `ctx.resolveTemplate` (top-level on context) would not exist without also adding it to `OrchestratorContext`. The current code at `launchWorker` line 356 uses `ctx.deps.configStore.getWorkflow()`, so using `ctx.deps.resolveTemplate` is consistent. This is a documentation gap, not a blocker.

---

## Issue 10 — `handleModelUpdate` Context Shape Does Not Include `issueConfigStore` (MEDIUM)

**Severity:** MEDIUM — the plan says `updateIssueModelSelection` should call `ctx.issueConfigStore.upsertModel(...)`, but the current `ctx` passed to `updateIssueModelSelection` (in `model-selection.ts`) is a narrow interface with 7 specific fields — it does not include `issueConfigStore`.

**Evidence:** `src/orchestrator/model-selection.ts` lines 28–41: the `ctx` parameter is an anonymous object type with `getConfig`, `getIssueDetail`, `issueModelOverrides`, `runningEntries`, `retryEntries`, `pushEvent`, `requestRefresh`. Adding `issueConfigStore` to this narrow interface requires updating both the function signature *and* every call site that constructs this object (in `orchestrator.ts`, which calls `updateIssueModelSelection` via `updateIssueModelSelection(this.ctx(), ...)`).

The `this.ctx()` method returns an `OrchestratorContext` which does not currently include `issueConfigStore`. This means the orchestrator's call site will not compile until `OrchestratorContext` also gains `issueConfigStore`. This is a cascade the plan does not track explicitly — Unit 5 must also update `OrchestratorContext` (in `context.ts`), `buildCtx` (in `orchestrator-delegates.ts`), and the `model-selection.ts` ctx type.

---

## Issue 11 — `--data-dir` and `archiveDir` Semantics May Confuse Operators (LOW)

**Severity:** LOW — UX/doc concern.

**Evidence:** After the change, `dataDir` is `~/.symphony` (where `symphony.db` lives) and `archiveDir` is `~/.symphony/archives` (where logs and config live). The flag is called `--data-dir`, which points to `dataDir`. But in the current code, `archiveDir` was the flag-configurable path (`--log-dir`). Operators who want to control the location of run logs (the `archives/` subdirectory) now have no direct flag — they control it indirectly through `--data-dir`. This is a reasonable design but must be documented explicitly in the operator guide.

---

## Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Completeness | 6/10 | Unit 3 missing `database.ts`; Unit 6 closure ambiguity; Unit 5 Map population ordering unresolved |
| Sequencing & Dependencies | 7/10 | Graph is correct; cascade to `OrchestratorContext` from Unit 5 not tracked |
| Risk Coverage | 5/10 | Issue 5 (setup mode E2E gap) and Issue 2 (INSERT OR REPLACE vs column upsert) are known but inadequately resolved |
| Feasibility | 7/10 | All changes are within the team's grasp; no external blockers |
| Edge Cases | 5/10 | Startup race (sync vs async loadAll), seedDefaults idempotency gap, and E2E setup mode gap all need explicit handling |
| Clarity | 7/10 | Well-written overall; Unit 6 closure approach is contradictory |
| Scope Discipline | 8/10 | No gold-plating; scope boundaries are clear |
| ROI / Effort | 8/10 | High value, reasonably contained effort |
| Goal Alignment | 9/10 | Every unit traces to a requirement |

**Overall: 6.5/10** — The strategic direction is sound and the research is thorough, but four HIGH-severity issues must be resolved before execution is safe. The setup mode / E2E bootstrap gap is the most dangerous because it invalidates the primary integration verification path.

---

## Verdict

**CONDITIONAL GO — 78%**

The plan is executable after resolving:
1. Commit to a decision on `--log-dir` (remove or alias) — add to Unit 1
2. Correct Unit 5 Approach text to use `onConflictDoUpdate` with named columns, not "INSERT OR REPLACE"
3. Confirm `loadAll()` is synchronous (it will be with better-sqlite3); document it precedes `scheduleTick(0)`
4. Commit to `getTemplateOverride()` method on orchestrator in Unit 6; remove the direct Map reference option
5. Fix the E2E bootstrap strategy to account for setup mode on first boot (Issue 5) — the simplest fix is writing a minimal overlay YAML to `<dataDir>/config/overlay.yaml` on disk before spawning Symphony in the E2E test, mirroring the current WORKFLOW.e2e.md approach
6. Add `database.ts` to the Unit 3 file list

Issues 6 (seedDefaults gap), 9, and 10 are implementation details that a careful implementer will discover at compile time; they are not blocking for plan approval.
