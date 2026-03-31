---
plan: "feat: Remove WORKFLOW.md — Full WebUI-First Config"
round: 3
mode: counter-review
model: claude-sonnet-4-6
date: 2026-03-30
previous: /home/oruc/Desktop/workspace/symphony-orchestrator/.anvil/remove-workflow-md/reviews/002-counter-codex-2026-03-30.md
verdict: CONDITIONAL GO
confidence: 74%
overall_score: 5.5/10
---

## What Works

The plan is grounded in real codebase state and the requirements trace is
accurate. The `DbConfigStore` already exists as a fully-functional DB-backed
config replacement (`src/config/db-store.ts`), and `legacy-import.ts`
`findLegacyWorkflow()` is already implemented — so several of Codex's
CRITICAL/HIGH severity calls turn out to be less dire than stated. However,
two of the four contested points and both open points require plan amendments
before execution, and one contested point resolves cleanly in Codex's favour.

---

## Settled Points (7 items — not re-evaluated)

See ledger. Issues 1, 2, 4, 5, 6, 8, 11 are closed. This review does not
revisit them.

---

## Contested Points

### Issue 3 — `loadAll()` sync vs async / startup race

**Verdict**: PARTIALLY AGREE with Codex — ordering note is correct, race claim is overstated

**Their claim**: The race is overstated because the repo's SQLite stores are
synchronous by pattern; the plan never specified a Promise return type for
`loadAll()`.

**My assessment**: Codex is right. Confirmed by examining `orchestrator.ts`
`start()` (lines 135–147): `scheduleTick(0)` is called *after* the two sync
calls `seedCompletedClaims()` and (where the plan inserts it) `loadAll()`.
The existing `PromptTemplateStore` (confirmed sync via `.all()` and `.get()`)
is the correct pattern precedent. `better-sqlite3` runs all queries
synchronously, so `IssueConfigStore.loadAll()` will have no `await` and
cannot race `scheduleTick(0)`. Round 1 was correct that the *ordering must be
documented*, but the framing of an async race condition was wrong. The fix is
purely documentation: remove any `Promise<...>` return type from the `loadAll()`
spec and add a comment that it must precede `scheduleTick(0)`.

**Recommended fix**: Narrow to a documentation amendment in Unit 5. Not a
blocker.

**Status**: → Settled (Codex's framing wins; ordering note stays in the plan)

---

### Issue 7 — `restartResilience` dependency on first-boot state

**Verdict**: PARTIALLY AGREE with Codex — it is downstream of Issue 5, but
the plan still needs one explicit sentence

**Their claim**: This is a consequence of Issue 5, not a standalone gap. Once
first-boot bootstrap is fixed, restart naturally reuses the same persisted DB.

**My assessment**: Codex is correct on the causal chain. But the plan's
explicit instruction to "re-apply overlay after restart" (`plan.md:908-910`)
is still wrong and misleads the implementer. With an already-seeded DB, the
restart does *not* need a config PUT — the DB already has the config rows from
first boot, `DbConfigStore.refresh()` will succeed, and `validateDispatch()`
will pass. Leaving "re-apply overlay after restart" in the plan text is an
active error (it implies the overlay is still necessary post-boot), and it
points back to the same misunderstanding that grounds Issue 5. One sentence
replacing that instruction is required.

**Recommended fix**: Remove the "re-apply overlay after restart" instruction
from the `restartResilience` section. Replace with: "No overlay PUT needed on
restart — the DB is already seeded from first boot; `DbConfigStore.refresh()`
reads current rows directly." This is a one-line plan edit, not a standalone
approval gate.

**Status**: → Settled (Codex's framing wins; one-line plan correction required)

---

### Issue 9 — `OrchestratorContext` / `buildCtx` cascade

**Verdict**: AGREE with Codex — `OrchestratorDeps` auto-propagates

**Their claim**: `OrchestratorContext.deps` is already typed as `OrchestratorDeps`
(`context.ts:54`), and `buildCtx()` forwards the full `deps` object unchanged
(`orchestrator-delegates.ts:49`). Adding `issueConfigStore` to `OrchestratorDeps`
makes it available at `ctx.deps.issueConfigStore` without changing `context.ts`
or `orchestrator-delegates.ts`.

**My assessment**: Confirmed by reading both files. `OrchestratorContext` at
line 54 of `context.ts` declares `deps: OrchestratorDeps`. `buildCtx()` at
line 49 of `orchestrator-delegates.ts` sets `deps` to the incoming `deps`
parameter directly — no field enumeration, no spread that would drop new
fields. Any new field added to `OrchestratorDeps` is immediately accessible at
`ctx.deps.<field>` everywhere `OrchestratorContext` is consumed.

Round 1's claim that `buildCtx` and `context.ts` require edits was wrong.
Those files only need changes if the design intentionally promotes
`issueConfigStore` to a top-level context property (e.g. `ctx.issueConfigStore`
alongside `ctx.getConfig`). The plan does not propose that, so Codex is right.

**Recommended fix**: Remove `context.ts` and `orchestrator-delegates.ts` from
the Unit 5 required-file list unless top-level promotion is explicitly chosen.

**Status**: → Settled (Codex wins)

---

### Issue 10 — `handleModelUpdate` / context-shape cascade

**Verdict**: PARTIALLY AGREE with Codex — blast radius is narrower than Round 1 stated, but the cascade is real

**Their claim**: The real change surface is the custom ctx type in
`model-selection.ts` and the inline object in `orchestrator.ts`. `handleModelUpdate`
in `model-handler.ts` is not the choke point.

**My assessment**: Confirmed by reading `model-selection.ts` lines 27–36 and
`orchestrator.ts` lines 249–263. The `ctx` passed to `updateIssueModelSelection`
is an inline anonymous object constructed at the `orchestrator.ts` call site —
not `this.ctx()`, not `OrchestratorContext`. It has exactly 7 fields:
`getConfig`, `getIssueDetail`, `issueModelOverrides`, `runningEntries`,
`retryEntries`, `pushEvent`, `requestRefresh`. The `model-handler.ts` route
(`handleModelUpdate`) calls `orchestrator.updateIssueModelSelection()` on the
port, which then constructs that inline object internally. So `model-handler.ts`
is *not* in the blast radius.

The real cascade is:
1. Add `issueConfigStore` to the anonymous ctx type in `model-selection.ts:27–36`
2. Add `issueConfigStore: ...` to the inline object at `orchestrator.ts:249–263`
3. `OrchestratorDeps` must include `issueConfigStore` (so `this.deps.issueConfigStore`
   is available inside `updateIssueModelSelection`)

That is 3 specific edits in 2 files — narrower than Round 1's "cascade to
OrchestratorContext" framing, but *real* and must remain in the plan.

**Recommended fix**: Update Unit 5 file list to include `model-selection.ts`
(ctx type update) and `orchestrator.ts` (inline object update). Remove
`context.ts` and `orchestrator-delegates.ts`. This is a documentation
correction, not a new blocker.

**Status**: → Settled (Codex's narrower blast-radius framing wins; exact 3-edit
cascade documented above replaces Round 1's broader claim)

---

## Open Points

### Issue 12 — DB-first requirement not actually implemented

**Verdict**: DISAGREE with Codex — the plan does implement DB-first; `DbConfigStore`
already exists and is the intended replacement

**Their claim (CRITICAL)**: R3 says config should come from SQLite overlay, but
the plan keeps `ConfigStore` backed by file-based `ConfigOverlayStore`. Also,
`ConfigStore` and setup-mode validation run before `initPersistenceRuntime`.

**My assessment**: This is the most important issue to resolve carefully,
because Codex's severity label ("CRITICAL") is based on a partial read of the
codebase and plan.

**What the codebase actually shows:**

1. `src/config/db-store.ts` exists and is complete — `DbConfigStore` implements
   both `ConfigOverlayPort` and the `ConfigStore`-compatible surface
   (`getWorkflow()`, `getConfig()`, `getMergedConfigMap()`, `validateDispatch()`).
   It reads exclusively from the SQLite `config` table, derives `ServiceConfig`
   via `deriveServiceConfig()`, and reacts to mutations via its own `notify()`
   path. It does NOT use `chokidar` or file system watches.

2. The plan at `plan.md:109–118` explicitly says `ConfigStore` must change:
   "The `workflowPath` is threaded to `ConfigStore` constructor... The `getWorkflow()`
   method returns `WorkflowDefinition`; callers must be audited." Unit 3 (schema)
   and the unlabelled CLI unit are specifically about routing through
   `DbConfigStore` instead of `ConfigStore`. The plan's intent is clear.

3. The startup ordering issue Codex raises IS real: currently `main()` in
   `index.ts` instantiates `ConfigOverlayStore` and `ConfigStore` *before*
   `createServices()` / `initPersistenceRuntime()` (line 44–73 vs 93). After the
   change, if `DbConfigStore` requires `SymphonyDatabase`, and `SymphonyDatabase`
   comes from `initPersistenceRuntime`, the startup order must flip. The plan
   does not explicitly sequence this ("persistence init → DB config store
   construction → setup validation"). This is a real gap, but it is a
   **sequencing gap in the plan**, not evidence that the plan intends to keep
   `ConfigOverlayStore` as the live backing store.

**Summary**: Codex's CRITICAL label is wrong — `DbConfigStore` exists and the
plan targets it. But Codex surfaces a genuine sequencing gap: the plan does not
explicitly say "initialize persistence before constructing `DbConfigStore`",
even though that ordering is required. The plan needs one explicit sequencing
note in the CLI/startup section.

**Recommended fix**: Add to Unit 1 (CLI changes): "Initialize persistence
(`initPersistenceRuntime`) before constructing `DbConfigStore` and before
setup validation. The startup sequence becomes: parse args → open DB → seed
defaults → legacy import → construct `DbConfigStore` → validate dispatch →
`createServices`." This is a documentation gap, not a CRITICAL blocker, because
the pattern is already established by `createServices()` calling
`initPersistenceRuntime` before returning.

**Status**: → Settled (Codex's severity is wrong; real gap is a startup
sequencing note; plan severity = MEDIUM, not CRITICAL)

---

### Issue 13 — Legacy `WORKFLOW.md` autodiscovery misses current default usage

**Verdict**: AGREE with Codex — this is a genuine plan gap, but lower severity than HIGH

**Their claim**: The plan only searches `<parent-of-data-dir>/WORKFLOW.md`.
The current CLI default (`./WORKFLOW.md` from the working directory) is the
migration path most existing operators will use.

**My assessment**: Confirmed by reading `findLegacyWorkflow()` in
`legacy-import.ts` lines 205–223. The function checks only:
- `path.join(path.dirname(dataDir), "WORKFLOW.md")`
- `path.join(path.dirname(dataDir), "WORKFLOW.yaml")`
- `path.join(path.dirname(dataDir), "WORKFLOW.yml")`

With the default `--data-dir ~/.symphony`, `path.dirname("~/.symphony")` is
`~`, meaning it checks `~/WORKFLOW.md`. The current CLI default is
`./WORKFLOW.md` (the CWD). For a user who has `WORKFLOW.md` at
`~/projects/myapp/WORKFLOW.md` and runs Symphony from that directory, the
legacy import will silently miss their file.

However, the severity is lower than HIGH for two reasons:

1. The plan explicitly calls this out in R5: "auto-discover `WORKFLOW.md` at
   `<parent-of-data-dir>/WORKFLOW.md`". This is a *deliberate design choice*,
   not an oversight — the intent is that `dataDir` is always adjacent to (or
   inside) the project root. The assumption is that `--data-dir ./.symphony`
   (project-local) rather than `~/.symphony` (global) would be the common case,
   making parent-of-dataDir the project root.

2. `importLegacyFiles` accepts an explicit `workflowPath` parameter that callers
   can pass, and `initPersistenceRuntime` already threads the CLI's positional
   arg through. Under the new design, the CLI could pass `process.cwd()` as an
   additional search location to `findLegacyWorkflow()`.

The gap is real: with the default `~/.symphony`, existing `./WORKFLOW.md` files
will not be auto-discovered. R5's claim that "operators do not need to do
anything manually" is false for the default-path case. The plan needs either:
- (a) Add `process.cwd()` as a fallback search location in `findLegacyWorkflow()`
- (b) Scope R5 to "project-local `--data-dir` setups only" and acknowledge
  that global `~/.symphony` users must run an explicit import command

Option (a) is one line in `findLegacyWorkflow()` and preserves the zero-friction
migration promise. Option (b) is a weaker migration story.

**Recommended fix**: Add `process.cwd()` as a third candidate in
`findLegacyWorkflow()` — or, more precisely, pass `process.cwd()` as an
additional `searchDirs` parameter so callers (the CLI) can inject the CWD
without hardcoding it in the library function.

**Status**: → Settled (Codex is right the gap exists; severity = MEDIUM not HIGH;
recommended fix is additive)

---

## Additional Issues Found

No new issues found that are not already in the ledger. The codebase evidence
from this round resolves or narrows every contested and open item without
surfacing additional gaps.

One minor observation: `ConfigStore` in `store.ts` still takes `workflowPath`
as a required first constructor argument (line 21–28). After the change to
`DbConfigStore`, `ConfigStore` either gets removed entirely or its constructor
signature changes. The plan's Unit 2/3 task list should confirm disposal or
preservation of `ConfigStore` — it is currently listed as "must change" but the
exact fate (delete vs. keep for tests) is unresolved. This is a LOW-severity
documentation gap, not a new blocker.

---

## Revised Scores

| Dimension | Round 1 (claude-sonnet-4-6) | Round 2 (gpt-5-codex) | Round 3 (claude-sonnet-4-6) | Delta R2→R3 |
|-----------|----|----|----|----|
| Completeness | 6 | 4 | 6 | +2 |
| Sequencing & Dependencies | 7 | 4 | 6 | +2 |
| Risk Coverage | 5 | 3 | 5 | +2 |
| Feasibility | 7 | 6 | 7 | +1 |
| Edge Cases | 5 | 4 | 5 | +1 |
| Clarity | 7 | 6 | 6 | 0 |
| Scope Discipline | 8 | 7 | 8 | +1 |
| ROI / Effort Ratio | 8 | 7 | 8 | +1 |
| Goal Alignment | 9 | 5 | 7 | +2 |
| **Overall** | **6.5** | **4.5** | **5.5** | **+1.0** |

**Overall: 5.5/10**

Rationale: Codex's CRITICAL label on Issue 12 was overcorrected — `DbConfigStore`
exists and is fit-for-purpose. But the plan does have three concrete gaps now
confirmed as real: startup sequencing (Issue 12), CWD discovery (Issue 13), and
the `restartResilience` misleading instruction (Issue 7). Once those are
addressed, the score rises to ~7/10 and the plan is CONDITIONAL GO.

---

## Verdict

**CONDITIONAL GO — 74%**

The strategic direction is sound and the implementation substrate (DbConfigStore,
legacy-import.ts, issue_config schema shape) is well-understood. The plan is
close to executable. Six amendments are required before starting:

1. **(Was Issue 3)** Document `loadAll()` as synchronous in Unit 5; confirm it
   precedes `scheduleTick(0)`. No code change required; documentation only.

2. **(Was Issue 7)** Remove the "re-apply overlay after restart" instruction
   from `restartResilience`. Replace with a note that DB persistence survives
   restart and no re-PUT is needed.

3. **(Was Issue 9/10)** Correct the Unit 5 file list: remove `context.ts` and
   `orchestrator-delegates.ts`; add `model-selection.ts` (ctx type addition)
   and `orchestrator.ts` (inline object at lines 249–263).

4. **(Was Issue 12)** Add an explicit startup sequencing note to Unit 1: DB
   must be opened and seeded before `DbConfigStore` is constructed and before
   setup validation runs. This sequence already exists in `createServices()` but
   the plan does not say it explicitly.

5. **(Was Issue 13)** Add `process.cwd()` as an additional candidate in
   `findLegacyWorkflow()` (or pass it as a parameter from the CLI), so the common
   `./WORKFLOW.md` usage pattern is caught by the migration.

6. **(New LOW)** Confirm the fate of `ConfigStore` (delete or keep for tests) in
   the Unit 2/3 file disposition notes.

---

## Debate Ledger

See `/home/oruc/Desktop/workspace/symphony-orchestrator/.anvil/remove-workflow-md/ledger.md`
for the Round 3 state.
