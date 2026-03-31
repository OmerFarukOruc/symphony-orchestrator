## Debate Ledger
**Plan**: feat: Remove WORKFLOW.md — Full WebUI-First Config
**Round**: 3
**Status**: FINALIZED 2026-03-30 by claude-sonnet-4-6
**Changelog**: .anvil/remove-workflow-md/reviews/004-finalize-claude-2026-03-30.md

---

### Settled (all models agree)

- **Issue 1 — `--log-dir` vs `--data-dir` naming conflict**: Unit 1 must explicitly decide whether `--log-dir` is removed or retained as a remapped alias; current CLI behaviour makes leaving this implicit unsafe. — settled round 2
- **Issue 2 — partial-column UPSERT wording**: Unit 5 cannot say `INSERT OR REPLACE` while requiring column-level preservation; approach text must use `onConflictDoUpdate` partial updates. — settled round 2
- **Issue 3 — `loadAll()` sync vs async / startup race**: Race is overstated. `IssueConfigStore.loadAll()` will be synchronous (better-sqlite3 pattern). Plan needs only a documentation note that the call must precede `scheduleTick(0)` and that the return type is not a Promise. — settled round 3 (Codex framing wins)
- **Issue 4 — Unit 6 closure design**: Commit to a single resolver design (expose `getTemplateOverride()` on the orchestrator port; remove direct Map capture option). — settled round 2
- **Issue 5 — E2E bootstrap and setup mode**: `PUT /api/v1/config/overlay` does not re-run `needsSetup` logic or start the orchestrator; first-boot E2E must pre-seed config before spawning, or route through setup endpoints. — settled round 2
- **Issue 6 — `seedDefaults` idempotency gap**: `seedDefaults()` exits early on any config row and skips template seeding for upgraded DBs; default template seeding must be split into a separate guard. — settled round 2
- **Issue 7 — `restartResilience` dependency on first-boot state**: Downstream of Issue 5. Once first-boot bootstrap is fixed, restart reuses the persisted DB and no overlay re-PUT is needed. The plan's existing "re-apply overlay after restart" instruction must be removed and replaced with a note that DB state persists. — settled round 3 (Codex framing wins; one-line plan correction required)
- **Issue 8 — `database.ts` `CREATE_TABLES_SQL` omission**: `src/persistence/sqlite/database.ts` must be updated alongside `schema.ts` or the runtime table will not exist. — settled round 2
- **Issue 9 — `OrchestratorContext` / `buildCtx` cascade**: `OrchestratorContext.deps` is already typed as `OrchestratorDeps` and `buildCtx()` forwards the whole object; adding `issueConfigStore` to `OrchestratorDeps` auto-propagates to `ctx.deps.issueConfigStore` without touching `context.ts` or `orchestrator-delegates.ts`. Remove those files from Unit 5 required list. — settled round 3 (Codex wins)
- **Issue 10 — model update context shape**: Real cascade exists but blast radius is narrower than Round 1 stated. Changes needed: (1) add `issueConfigStore` to the anonymous ctx type in `model-selection.ts:27–36`, (2) add it to the inline object at `orchestrator.ts:249–263`. `handleModelUpdate`, `context.ts`, and `orchestrator-delegates.ts` are not in scope. — settled round 3 (Codex framing wins; exact 2-file cascade confirmed)
- **Issue 11 — operator UX around archive path**: New `dataDir → archiveDir` derivation changes operator semantics and needs explicit documentation. — settled round 2
- **Issue 12 — DB-first requirement not actually implemented**: Codex's CRITICAL severity is wrong — `DbConfigStore` already exists in `src/config/db-store.ts` and is fit-for-purpose. Real gap is that the plan does not explicitly sequence "open DB before constructing DbConfigStore before setup validation". Startup ordering note must be added to Unit 1. Severity = MEDIUM. — settled round 3 (Codex identifies real gap; severity and framing corrected by Claude)
- **Issue 13 — legacy `WORKFLOW.md` autodiscovery misses CWD**: `findLegacyWorkflow()` only checks `parent-of-dataDir`; with default `~/.symphony`, it checks `~/WORKFLOW.md` and misses `./WORKFLOW.md` from the working directory. `process.cwd()` must be added as a candidate (or passed as a parameter from the CLI). Severity = MEDIUM. — settled round 3 (Codex is right; Claude confirms and reduces severity from HIGH)

---

### Contested (models disagree)

*(none remaining)*

---

### Open (raised, not yet addressed by all)

*(none remaining)*

---

### Score History

| Round | Version | Model | Completeness | Sequencing | Risk | Feasibility | Edge Cases | Clarity | Scope | ROI | Alignment | Overall | Verdict |
|-------|---------|-------|-------------|------------|------|-------------|-----------|---------|-------|-----|-----------|---------|---------|
| 1 | v1 | claude-sonnet-4-6 | 6 | 7 | 5 | 7 | 5 | 7 | 8 | 8 | 9 | 6.5 | CONDITIONAL GO 78% |
| 2 | v1 | gpt-5-codex | 4 | 4 | 3 | 6 | 4 | 6 | 7 | 7 | 5 | 4.5 | NO-GO 85% |
| 3 | v1 | claude-sonnet-4-6 | 6 | 6 | 5 | 7 | 5 | 6 | 8 | 8 | 7 | 5.5 | CONDITIONAL GO 74% |
