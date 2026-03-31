---
date: 2026-03-30
topic: remove-workflow-md
---

# Remove WORKFLOW.md — Full WebUI-First Config

## Problem Frame

Symphony's primary config source is a `WORKFLOW.md` file on disk. This couples deployments to
filesystem state, prevents headless and containerized operation, and conflicts with the overlay
store and templates system that already supports WebUI-based configuration. The goal is to
eliminate `WORKFLOW.md` as a required artifact and make the SQLite overlay + templates DB the
single source of truth for all configuration.

Additionally, per-issue model overrides are currently in-memory only and lost on restart — a
correctness gap that this change fixes by co-locating them with template overrides in a new
persistent `issue_config` table.

## Config Loading Flow (Before → After)

```
BEFORE
──────
CLI positional arg ──► workflowPath ──► ConfigStore
                                           ├─ chokidar file watcher (live reload)
                                           └─ loadWorkflowDefinition()
                                                └─► deriveServiceConfig(workflow, overlay)
                                                        └─► AgentRunner (workflow.promptTemplate)

AFTER
─────
CLI --data-dir ──► SQLite overlay ──► ConfigStore
                                         └─ refresh() on startup + on PUT /api/v1/config/overlay
                                              └─► deriveServiceConfig({}, overlay)
                                                      └─► AgentRunner
                                                               └─► resolve template from DB
                                                                     (issue_config → default → warn)
```

## Requirements

**CLI**

- R1. Remove the positional `workflowPath` argument — clean break, no deprecation period
- R2. Add `--data-dir` string option (default: `DATA_DIR` env var, then `~/.risoluto`)
- R3. Archive directory is `<data-dir>/archives`

**Config Loading**

- R4. `ConfigStore` loads config exclusively from the SQLite overlay at startup; removes chokidar
  file watcher and all `workflowPath` references
- R5. Config remains reactive: changes via `PUT /api/v1/config/overlay` still trigger
  `ConfigStore.refresh()`

**Legacy Migration (one-time)**

- R6. On startup, auto-discover `WORKFLOW.md` at `<parent-of-data-dir>/WORKFLOW.md` (existing
  `findLegacyWorkflow` logic)
- R7. If found: import config fields to overlay AND import `promptTemplate` body as the "default"
  template (both steps are idempotent — existing `importLegacyFiles` already does this)
- R8. Migration idempotency: running twice produces the same result without errors

**Template Seeding**

- R9. On fresh install (no templates in DB after legacy import), seed a built-in "default" template
  with a minimal prompt hardcoded in `src/` (not read from `WORKFLOW.example.md`)
- R10. The seeded default template is immediately visible in `/templates`

**Per-Issue Config (new SQLite table)**

- R11. Create an `issue_config` SQLite table: columns `identifier` (PK), `template_id` (nullable
  FK → `prompt_templates.id`), `model` (nullable), `reasoning_effort` (nullable)
- R12. At orchestrator startup, load all `issue_config` rows into the existing in-memory override
  Maps (so the in-memory Maps remain the hot path for resolution)
- R13. `POST /api/v1/:identifier/model` writes model + reasoning_effort to `issue_config` in
  addition to the in-memory Map (making model overrides persistent across restarts)

**Per-Issue Template Override API**

- R14. `POST /api/v1/:identifier/template` — stores `template_id` on the `issue_config` row
- R15. `DELETE /api/v1/:identifier/template` — clears `template_id` (reverts to "default" on next
  run)
- R16. `GET /api/v1/:identifier` — includes `configured_template_id` and `configured_template_name`
  in `IssueDetail`
- R17. Template override applies to the next run, not the active worker (same semantics as model
  override)

**Agent Runner**

- R18. Before launching, resolve the active template:
  1. `issue_config.template_id` override for this identifier
  2. "default" template (by ID)
  3. Empty string with a logged `WARN` if neither exists
- R19. Inject the resolved template body as the Codex prompt (replacing the current
  `workflow.promptTemplate` read)

**Issue Inspector UI**

- R20. Add a "Template" row to the model settings section (below Reasoning Effort)
- R21. Dropdown populated from `GET /api/v1/templates`; shows "Default" when no override is set
- R22. Selecting a template calls `POST /api/v1/:identifier/template`; a "Clear" action calls
  `DELETE /api/v1/:identifier/template`
- R23. Shows "Applies next run" note (consistent with model override UX)

**Cleanup**

- R24. Delete `WORKFLOW.example.md` and `WORKFLOW.docker.md`
- R25. Update `scripts/e2e-lib/phases-lifecycle.ts` — remove `workflowPath`, start Symphony with
  `--data-dir`, bootstrap initial config via `PUT /api/v1/config/overlay` in the lifecycle test
- R26. Convert `tests/integration/config-workflow.integration.test.ts` to test overlay-based config
  derivation, or remove it if it has no remaining coverage value
- R27. Update `README.md`, `docs/OPERATOR_GUIDE.md`, `docs/CONFORMANCE_AUDIT.md` to remove all
  `WORKFLOW.md` references and document the `--data-dir` flag and WebUI bootstrap flow

## Success Criteria

- `symphony --port 4000` (no args) starts successfully: seeds default template, /templates shows it
- `symphony --data-dir /tmp/test/.risoluto` with a `WORKFLOW.md` in `/tmp/test/` imports config +
  prompt body on first run, does nothing on second run
- Per-issue template override set via UI survives a Symphony restart
- Per-issue model override set via UI survives a Symphony restart (new behavior)
- Smoke and E2E tests pass

## Scope Boundaries

- **Not in scope**: env var bootstrap for Linear API key / repo — operators configure via /settings
  (WebUI only)
- **Not in scope**: template versioning, rollback, or multi-template per issue
- **Not in scope**: migrating `WORKFLOW.docker.md` content — just delete it

## Key Decisions

- **Clean break** on positional arg removal: no deprecation period, document in release notes
- **Persist both** template_id and model+reasoning_effort in `issue_config` (same migration)
- **Bootstrap**: WebUI-only (/settings or setup wizard)
- **Seed body**: minimal prompt hardcoded in `src/`, not loaded from any file

## Dependencies / Assumptions

- `findLegacyWorkflow()` and `importLegacyFiles()` already handle the migration logic — plan must
  verify the exact idempotency behavior before extending
- The template CRUD API (`/api/v1/templates/*`) is already fully built — no new template endpoints
  needed beyond the per-issue override pair
- `seedDefaults()` already exists in `src/persistence/sqlite/runtime.ts` — Phase 4 of the original
  plan is largely already done

## Outstanding Questions

### Resolve Before Planning
*(none — all blocking decisions resolved above)*

### Deferred to Planning

- [Affects R12][Technical] What is the exact startup sequence for loading `issue_config` into the
  orchestrator Maps? Does it run before or after legacy import?
- [Affects R25][Technical] What test fixture replaces `WORKFLOW.e2e.md` in the E2E lifecycle test?
  The test needs a known config payload to `PUT /api/v1/config/overlay` at bootstrap time.
- [Affects R4][Technical] Is chokidar used anywhere besides the WORKFLOW.md watcher? If not,
  remove the package dependency entirely.
- [Affects R7-R8][Needs research] Verify exact idempotency behavior of current `importLegacyFiles`:
  does it skip if config overlay already has values, or overwrite unconditionally?
