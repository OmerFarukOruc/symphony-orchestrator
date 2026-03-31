---
plan: "feat: Remove WORKFLOW.md — Full WebUI-First Config"
round: 2
mode: counter-review
model: gpt-5-codex
date: 2026-03-30
previous: /home/oruc/Desktop/workspace/symphony-orchestrator/.anvil/remove-workflow-md/reviews/001-review-claude-2026-03-30.md
verdict: NO-GO
confidence: 85%
overall_score: 4.5/10
---

## What Works

The plan correctly identifies the long-term direction: prompt templates belong in SQLite, per-issue overrides need persistence, and `WORKFLOW.md` should stop being a live runtime dependency. The source-grounding is also mostly real: `database.ts` does still hardcode schema creation, `seedDefaults()` is currently over-credited, and the current CLI really does treat `--log-dir` as the direct archive path.

## Settled Points (7 items)

### Issue 1 — `--log-dir` vs `--data-dir` naming conflict
**Verdict**: AGREE
**Their claim**: The plan defers a required decision about the existing `--log-dir` flag.
**My assessment**: Correct. The current CLI parses `--log-dir` and uses it as the direct `archiveDir` override in `src/cli/index.ts:135-155`; it is not a cosmetic alias today. The plan itself leaves the decision deferred at `plan.md:1010-1017`, so Unit 1 is not executable as written.
**Recommended fix**: Explicitly choose one path in Unit 1: remove `--log-dir`, or keep it as a legacy alias that maps to `dataDir`, not to `archiveDir`.
**Status**: → Settled

### Issue 2 — partial-column UPSERT wording is contradictory
**Verdict**: AGREE
**Their claim**: Unit 5 says `INSERT OR REPLACE` while the risk table says column-level updates.
**My assessment**: Correct. Unit 5 says `upsertModel` and `upsertTemplateId` are `INSERT OR REPLACE` (`plan.md:613-619`), while the risk table later says to avoid full-row replace and use column-level updates. Those two instructions conflict, and following the Approach text would clobber nullable sibling columns.
**Recommended fix**: Rewrite Unit 5 to require `onConflictDoUpdate({ target: issueConfig.identifier, set: { ... } })` style partial updates, with explicit tests that model and template fields do not erase each other.
**Status**: → Settled

### Issue 4 — Unit 6 closure design is internally contradictory
**Verdict**: AGREE
**Their claim**: The plan presents both direct Map capture and `getTemplateOverride()` as viable options.
**My assessment**: Correct. The closure example in Unit 6 reads from `issueTemplateOverrides` directly (`plan.md:684-699`) and then immediately says the cleanest approach is to expose `getTemplateOverride()` on the orchestrator (`plan.md:699-702`). Those are different designs, and only one should remain in the execution plan.
**Recommended fix**: Commit to a single approach. The cleanest version is to add a read method on the orchestrator port and have the resolver call that.
**Status**: → Settled

### Issue 5 — setup-mode check is one-time; overlay PUT does not restart the orchestrator
**Verdict**: AGREE
**Their claim**: The E2E bootstrap assumes `PUT /api/v1/config/overlay` can take a setup-mode process to a running orchestrator.
**My assessment**: Correct, with one nuance. `main()` computes `needsSetup` once before `createServices()` and only conditionally calls `orchestrator.start()` once (`src/cli/index.ts:56-99`). `registerConfigApi()` exposes `PUT /api/v1/config/overlay`, but that handler only mutates the overlay store (`src/config/api.ts:71-94`); it does not call `orchestrator.start()`. The codebase does have setup handlers that start the orchestrator later, for example `POST /api/v1/setup/linear-project` in `src/setup/handlers/linear-project.ts`, but the plan explicitly relies on overlay PUT, not those setup APIs.
**Recommended fix**: Do not rely on overlay PUT as the first-boot escape hatch. Either preseed startup config before spawning, or route the E2E through the setup endpoints that actually transition the process out of setup mode.
**Status**: → Settled

### Issue 6 — `seedDefaults()` is gated by config rows, not by template rows
**Verdict**: AGREE
**Their claim**: The plan overstates `seedDefaults()` as already solving the template-seeding case.
**My assessment**: Correct. `seedDefaults()` returns immediately when any `config` row exists (`src/config/legacy-import.ts:33-35`), so the later `prompt_templates` emptiness check (`src/config/legacy-import.ts:45-69`) never runs for an upgraded DB that already has config rows. This directly contradicts the plan’s claim that R6 is already handled.
**Recommended fix**: Split config seeding from template seeding, or at minimum change the guard so the default template is seeded whenever `prompt_templates` is empty.
**Status**: → Settled

### Issue 8 — `database.ts` must be in scope, not just `schema.ts`
**Verdict**: AGREE
**Their claim**: Adding the Drizzle schema alone will not create the runtime table.
**My assessment**: Correct. `openDatabase()` executes a hardcoded `CREATE_TABLES_SQL` string in `src/persistence/sqlite/database.ts:18-117`, and that SQL currently ends without any `issue_config` table. Updating `schema.ts` alone would leave runtime creation incomplete.
**Recommended fix**: Add `src/persistence/sqlite/database.ts` to Unit 3's required file list and verification checklist.
**Status**: → Settled

### Issue 11 — operator UX around archive path becomes indirect
**Verdict**: AGREE
**Their claim**: Operators lose a direct way to set the archive/log directory independently.
**My assessment**: Correct, though this is low severity. Today `--log-dir` directly sets `archiveDir` (`src/cli/index.ts:148-153`); under the proposed model, `archiveDir` becomes derived from `dataDir`. That is a reasonable product choice, but it should be explicit in docs and release notes.
**Recommended fix**: Document the changed meaning clearly, or keep a legacy alias if preserving operator workflows matters.
**Status**: → Settled

## Contested Points (4 items)

### Issue 3 — `loadAll()` sync vs async / startup race
**Verdict**: PARTIALLY AGREE
**Their claim**: The plan needs to force a synchronous `loadAll()` or it risks racing `scheduleTick(0)`.
**My assessment**: The ordering note is fair, but the race is overstated. The repo’s SQLite stores use synchronous Drizzle/better-sqlite3 access patterns, for example `PromptTemplateStore.list()` and `.get()` call `.all()` and `.get()` synchronously in `src/prompt/store.ts:52-71`. Unit 5 says only that `loadAll()` "returns all rows" (`plan.md:615`); it does not actually specify a `Promise` or an async path. The right fix is to say "populate override maps before `scheduleTick(0)`," not to treat async store design as the most likely implementation.
**Recommended fix**: Clarify ordering in Unit 5 and keep the store synchronous unless there is a compelling reason to diverge from the repo’s persistence pattern.
**Status**: → Still contested

### Issue 7 — `restartResilience` depends on first-boot persistence state
**Verdict**: PARTIALLY AGREE
**Their claim**: The restart plan omits an important dependency on first-boot DB population.
**My assessment**: Directionally right, but this is downstream of Issue 5 rather than a distinct blocker. Once the first boot is fixed to come up with valid config, restart naturally reuses the same `dataDir` and therefore the same persisted config. The plan’s specific instruction to re-apply overlay after restart (`plan.md:908-910`) is unnecessary or wrong, but the core restart logic is not independently broken in the same way the first-boot path is.
**Recommended fix**: Fold this into the E2E rewrite for Issue 5 instead of treating it as a separate approval gate.
**Status**: → Still contested

### Issue 9 — `OrchestratorContext` / `buildCtx` cascade from `OrchestratorDeps`
**Verdict**: DISAGREE
**Their claim**: Adding `issueConfigStore` to `OrchestratorDeps` requires updating `OrchestratorContext` and `buildCtx`.
**My assessment**: Not by itself. `OrchestratorContext` already exposes `deps: OrchestratorDeps` (`src/orchestrator/context.ts:46-55`), and `buildCtx()` already forwards the entire `deps` object unchanged (`src/orchestrator/orchestrator-delegates.ts:40-50`). If `OrchestratorDeps` grows a new field, that field is already available at `ctx.deps.issueConfigStore` without changing those files. What does need changing is the custom context passed to `updateIssueModelSelection`, which is a separate issue.
**Recommended fix**: Remove `OrchestratorContext` / `buildCtx` from the required file list unless the design intentionally wants `issueConfigStore` as a top-level context property.
**Status**: → Still contested

### Issue 10 — `handleModelUpdate` / context-shape cascade
**Verdict**: PARTIALLY AGREE
**Their claim**: The model update path needs broader context-shape changes.
**My assessment**: The narrow `ctx` object in `src/orchestrator/model-selection.ts:27-36` absolutely must gain access to persistence if Unit 5 persists overrides, and the inline object passed from `src/orchestrator/orchestrator.ts:249-263` must be updated accordingly. But `handleModelUpdate()` itself is not the choke point; it only calls `orchestrator.updateIssueModelSelection()` through the port in `src/http/model-handler.ts:12-24`. So the underlying dependency is real, but the blast radius is smaller than Round 1 states.
**Recommended fix**: Scope this to `model-selection.ts` and the orchestrator call site unless the implementation later chooses to route the DB write through `this.ctx()`.
**Status**: → Still contested

## Additional Issues Found

### Issue 12 — DB-first requirement is not actually implemented by the proposed units
**Severity**: CRITICAL
**My assessment**: R3 says `ConfigStore` should load "exclusively from the SQLite overlay" (`plan.md:47-48`), but the implementation units keep `ConfigStore` backed by `overlayStore` and merely replace the workflow object with `{ config: {}, promptTemplate: "" }` (`plan.md:320-322`, `plan.md:440-501`). In the real codebase, `ConfigOverlayStore` is still file-backed YAML with a chokidar watcher (`src/config/overlay.ts:22-57`), while `DbConfigStore` already exists specifically to serve DB-first config (`src/config/db-store.ts:1-125`). This is not just wording drift: `main()` starts the overlay store and config store, validates dispatch, and decides setup mode before it even calls `createServices()` / `initPersistenceRuntime()` (`src/cli/index.ts:45-93`), so any legacy import into SQLite happens too late to affect first-boot startup. As written, the plan neither satisfies R3 nor fully solves the filesystem-coupled startup problem it claims to solve.
**Recommended fix**: Rebase Units 1-4 around `DbConfigStore`. Initialize persistence first, construct a DB-backed config/overlay store from `persistence.db`, and perform startup validation against that DB-backed state. If the design intentionally keeps a file-backed overlay, then R3, the Overview, and the migration story must be rewritten because the current plan over-promises.
**Status**: → Open

### Issue 13 — legacy `WORKFLOW.md` autodiscovery no longer matches current default usage
**Severity**: HIGH
**My assessment**: The current CLI defaults to `./WORKFLOW.md` from the working directory (`src/cli/index.ts:144`), which is the migration source existing operators are most likely to have. The plan changes discovery to only `<parent-of-data-dir>/WORKFLOW.md` (`plan.md:51-52`, `plan.md:566-589`, `plan.md:1003-1006`). With the proposed default `--data-dir ~/.symphony`, that means discovery checks `~/WORKFLOW.md`, not the project-local file current users actually rely on. The "operators do not need to do anything manually" claim is therefore false for the current default usage pattern.
**Recommended fix**: Expand legacy discovery to include the old default location (`./WORKFLOW.md`, and possibly the process cwd) during the migration release, or stop claiming automatic migration and require an explicit one-time import command.
**Status**: → Open

## Revised Scores

| Dimension | Round 1 (claude-sonnet-4-6) | Round 2 (gpt-5-codex) | Delta |
|-----------|-----------------------------|------------------------|-------|
| Completeness | 6 | 4 | -2 |
| Sequencing & Dependencies | 7 | 4 | -3 |
| Risk Coverage | 5 | 3 | -2 |
| Feasibility | 7 | 6 | -1 |
| Edge Cases | 5 | 4 | -1 |
| Clarity | 7 | 6 | -1 |
| Scope Discipline | 8 | 7 | -1 |
| ROI / Effort Ratio | 8 | 7 | -1 |
| Goal Alignment | 9 | 5 | -4 |
| **Overall** | **6.5** | **4.5** | **-2.0** |

## Debate Ledger

See `/home/oruc/Desktop/workspace/symphony-orchestrator/.anvil/remove-workflow-md/ledger.md` for the Round 2 state.
