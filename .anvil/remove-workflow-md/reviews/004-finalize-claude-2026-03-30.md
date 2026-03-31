---
plan: "feat: Remove WORKFLOW.md — Full WebUI-First Config"
round: finalize
mode: finalize
model: claude-sonnet-4-6
date: 2026-03-30
previous: .anvil/remove-workflow-md/reviews/003-counter-claude-2026-03-30.md
verdict: FINALIZED
confidence: 100%
amendments_applied: 13
---

# Finalize Changelog — 2026-03-30

All 13 settled amendments from the debate ledger applied to `plan.md`.

---

## Amendments Applied

### Issue 1 — `--log-dir` removal (Unit 1)
**Location:** Unit 1 Goal, Approach, Test scenarios, Verification; Operational Notes; Scope Boundaries
**Change:** Explicitly decided to remove `--log-dir` as a clean break (same treatment as the positional arg). Added to Unit 1 approach: "Remove `--log-dir` from the options map entirely." Added test scenario for `--log-dir` rejection. Added to Operational Notes breaking change list: `--log-dir` removed, `archiveDir` is now always `<data-dir>/archives`. Updated Scope Boundaries to name both positional arg and `--log-dir` as clean breaks.

### Issue 2 — partial-column UPSERT (Unit 5)
**Location:** Unit 5 Approach (IssueConfigStore methods), High-Level Technical Design diagram, Risks table
**Change:** Replaced all "INSERT OR REPLACE" wording with explicit `onConflictDoUpdate` calls. `upsertModel` uses `onConflictDoUpdate({ target: [issueConfig.identifier], set: { model, reasoningEffort } })`. `upsertTemplateId` uses `onConflictDoUpdate({ target: [issueConfig.identifier], set: { templateId } })`. Updated System-Wide Impact risk description accordingly.

### Issue 3 — `loadAll()` sync / startup race (Unit 5)
**Location:** Unit 5 Approach, test scenarios, Verification; High-Level Technical Design diagram
**Change:** Documented that `IssueConfigStore.loadAll()` returns a synchronous result (better-sqlite3 pattern; NOT `Promise<IssueConfigRow[]>`). Added explicit note that it must be called BEFORE `scheduleTick(0)`. Updated the Technical Design diagram comment to show "before scheduleTick(0)".

### Issue 4 — closure design (Unit 6)
**Location:** Unit 6 Approach, Key Technical Decisions
**Change:** Committed to one design only: expose `getTemplateOverride(identifier): string | null` on the orchestrator/port and call it inside the resolver at invocation time. Removed the "direct Map reference" option entirely. Updated Key Technical Decisions to explain the chicken-and-egg rationale.

### Issue 5 — E2E setup mode (Unit 9, R15)
**Location:** R15 in Requirements Trace, Unit 9 Approach (E2E section), Key Technical Decisions, Unit 9 test scenarios
**Change:** Corrected the E2E bootstrap approach. `PUT /api/v1/config/overlay` after spawning does NOT bypass setup mode. The E2E test must write an overlay config file to disk BEFORE spawning Symphony. Updated R15, Unit 9 approach, Key Technical Decisions, and added assertion note to risks table.

### Issue 6 — `seedDefaults` idempotency (Unit 4)
**Location:** Unit 4 Goal, Files, Approach, Test scenarios, Verification
**Change:** Added `src/config/legacy-import.ts` to Unit 4 file list. Added explicit `seedDefaults` idempotency fix: template-seeding guard must check `prompt_templates` table emptiness independently of config-row existence. Added upgrade-path test scenario and verification step.

### Issue 7 — `restartResilience` (Unit 9)
**Location:** Unit 9 Approach (`restartResilience` paragraph), test scenarios
**Change:** Removed "re-apply overlay after restart" instruction. Replaced with: "DB state persists across restarts. The restarted Symphony reads `issue_config`, overlay, and templates from the same DB — no re-PUT needed." Updated test scenario to match.

### Issue 8 — `database.ts` DDL (Unit 3)
**Location:** Unit 3 Goal, Files, Approach
**Change:** Added `src/persistence/sqlite/database.ts` to Unit 3 file list. Added explicit instruction: "Update `CREATE_TABLES_SQL` in `database.ts` to include the `issue_config` CREATE TABLE statement." Added note about keeping both files in sync.

### Issue 9 — `OrchestratorContext` cascade (Unit 5)
**Location:** Unit 5 Files, Approach
**Change:** Removed `src/orchestrator/context.ts` and `src/orchestrator/orchestrator-delegates.ts` from Unit 5 file list. Added explanatory note: "`OrchestratorDeps` auto-propagates to `ctx.deps` — those files don't need changes."

### Issue 10 — model update context shape (Unit 5)
**Location:** Unit 5 Approach
**Change:** Added explicit instruction: "The anonymous `ctx` type at lines 27–36 in `model-selection.ts` must include `issueConfigStore`, and the inline object assembled at `orchestrator.ts:249–263` must include it too."

### Issue 11 — archive path docs (Unit 1, Unit 9)
**Location:** Unit 1 Approach, Unit 9 Approach (Docs section), Operational Notes
**Change:** Added note in Unit 1 Approach that `--log-dir` is removed and `archiveDir = <data-dir>/archives` is the fixed derivation. Added to Unit 9 docs section: document the new archive path behavior in OPERATOR_GUIDE including removal of `--log-dir`. Updated Operational Notes to be explicit.

### Issue 12 — DB startup ordering (Unit 1)
**Location:** Unit 1 Approach, Context & Research (startup sequence), Open Questions
**Change:** Added startup ordering requirement to Unit 1 Approach: "Startup ordering requirement: open the DB first, before constructing `DbConfigStore`, before setup mode validation runs." Updated the startup sequence in Context & Research to reflect `DB open → DbConfigStore → setup validation → initPersistenceRuntime → ...`. Updated Open Questions resolved section.

### Issue 13 — `findLegacyWorkflow` CWD (Unit 4, R5)
**Location:** R5 in Requirements Trace, Unit 4 Goal, Files, Approach, Test scenarios, Operational Notes
**Change:** Added `process.cwd()` as a discovery candidate in `findLegacyWorkflow`. R5 updated: "auto-discover `WORKFLOW.md` at `<cwd>/WORKFLOW.md` first, then `<parent-of-data-dir>/WORKFLOW.md`". Unit 4 approach updated with explicit fix description. `src/config/legacy-import.ts` confirmed in Unit 4 file list (also added for Issue 6). Test scenarios added for CWD-first and parent-dir fallback.

---

## Structural Changes

- **Key Technical Decisions**: Added entry for the closure design fix (Issue 4) explaining the `getTemplateOverride()` pattern and why direct Map capture is unsafe.
- **High-Level Technical Design diagram**: Updated "AFTER" section to show correct startup ordering and "before scheduleTick(0)" annotation.
- **Risks table**: Updated two rows (INSERT OR REPLACE → onConflictDoUpdate; added E2E pre-seed path risk).
- **System-Wide Impact**: Updated Integration Coverage paragraph to reflect pre-seeded overlay file and DB-persisted restart behavior.

---

## Sections Preserved Unchanged

- Overview, Problem Frame, Scope Boundaries (except `--log-dir` addition)
- Unit 2 (ConfigStore) — fully unchanged
- Unit 7 (HTTP endpoints) — fully unchanged
- Unit 8 (Frontend) — fully unchanged
- Sources & References (one line added for `database.ts`)
- All test scenarios not explicitly touched by an amendment
