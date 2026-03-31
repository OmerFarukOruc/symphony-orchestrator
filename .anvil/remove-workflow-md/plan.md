
---
title: "feat: Remove WORKFLOW.md — Full WebUI-First Config"
type: feat
status: active
date: 2026-03-30
origin: docs/brainstorms/2026-03-30-remove-workflow-md-requirements.md
finalized: 2026-03-30
finalized-by: claude-sonnet-4-6
---

# feat: Remove WORKFLOW.md — Full WebUI-First Config

## Overview

Symphony currently requires a `WORKFLOW.md` file on disk as its primary config
source. The CLI accepts it as a positional argument, `ConfigStore` file-watches
it with chokidar, and `worker-launcher.ts` reads `workflow.promptTemplate`
directly before every run. This couples every deployment to filesystem state,
prevents headless and containerised operation, and conflicts with the overlay
store and templates DB that already support WebUI-based configuration.

This plan eliminates `WORKFLOW.md` entirely. All config comes from the SQLite
overlay at startup; all prompt templates live in the DB and are editable from
`/templates`. Per-issue model overrides gain persistence via a new
`issue_config` SQLite table. The issue inspector gains a template selector
matching the existing model override UX. Phase 4 of the original draft plan
(template seeding and legacy import of prompt body) is already implemented;
this plan verifies exact boundaries before marking those units done.

## Problem Frame

See origin document for full context. The short version: filesystem-coupled
config prevents containerised, headless, and multi-tenant deployment. The
overlay store, secrets store, templates system, and setup wizard already exist
as the right replacement stack — WORKFLOW.md just hasn't been dethroned yet.

Additionally, per-issue model overrides are currently stored only in the
in-memory `issueModelOverrides` Map and are silently lost on restart. This is a
correctness gap that this change fixes at the same time.

(see origin: docs/brainstorms/2026-03-30-remove-workflow-md-requirements.md)

## Requirements Trace

- R1. Remove the positional `workflowPath` CLI argument; add `--data-dir` flag
  defaulting to `DATA_DIR` env var then `~/.symphony`
- R2. Archive directory becomes `<data-dir>/archives` (was `<parent-of-workflow>/.symphony`)
- R3. `ConfigStore` loads exclusively from the SQLite overlay; removes chokidar
  watcher and all `workflowPath` references
- R4. Config remains reactive: `PUT /api/v1/config/overlay` still triggers
  `ConfigStore.refresh()`
- R5. On startup, auto-discover `WORKFLOW.md` at `<cwd>/WORKFLOW.md` first, then
  `<parent-of-data-dir>/WORKFLOW.md`, and import config + prompt body as a
  one-time idempotent migration
- R6. On fresh install (no templates after legacy import), seed a built-in
  "default" template; `DEFAULT_PROMPT_TEMPLATE` in `src/config/defaults.ts`
  is the seed body (already present)
- R7. Create an `issue_config` SQLite table: `identifier` (PK), `template_id`
  (nullable FK → `prompt_templates.id`), `model` (nullable),
  `reasoning_effort` (nullable)
- R8. At orchestrator startup, load all `issue_config` rows into the in-memory
  `issueModelOverrides` Map and a new `issueTemplateOverrides` Map
- R9. `POST /api/v1/:identifier/model` persists model + reasoning_effort to
  `issue_config` in addition to the in-memory Map
- R10. `POST /api/v1/:identifier/template` stores `template_id` on the
  `issue_config` row; `DELETE /api/v1/:identifier/template` clears it
- R11. `GET /api/v1/:identifier` includes `configured_template_id` and
  `configured_template_name` in `IssueDetail`
- R12. Before launching a worker, resolve the active template: `issue_config`
  override → "default" template → empty string + WARN
- R13. Issue inspector adds a "Template" row to the model settings section with
  a dropdown, "Default" placeholder, and "Applies next run" note
- R14. Delete `WORKFLOW.example.md` and `WORKFLOW.docker.md`
- R15. Update E2E lifecycle test to use `--data-dir` and bootstrap config by
  writing an overlay config file to disk before spawning Symphony (pre-seed
  to bypass setup mode), rather than calling `PUT /api/v1/config/overlay` after
  spawn
- R16. Convert or remove `tests/integration/config-workflow.integration.test.ts`
- R17. Update `README.md`, `docs/OPERATOR_GUIDE.md`, `docs/CONFORMANCE_AUDIT.md`

## Scope Boundaries

- Not in scope: env-var bootstrap for Linear API key / repo — operators use /settings
- Not in scope: template versioning, rollback, or multi-template per issue
- Not in scope: migrating `WORKFLOW.docker.md` content — just delete it
- Not in scope: deprecation period for the positional arg or `--log-dir` — both
  are clean breaks

## Context & Research

### Relevant Code and Patterns

**Already done (verified):**
- `src/config/legacy-import.ts` — `seedDefaults()`, `importLegacyFiles()`,
  `findLegacyWorkflow()` all exist and are fully wired. `seedDefaults()` already
  seeds the "default" template from `DEFAULT_PROMPT_TEMPLATE` in
  `src/config/defaults.ts` when the templates table is empty. `importLegacyFiles`
  is already guarded by `system.legacyImportVersion` and imports `promptBody`
  into the default template row. Phase 4 and most of Phase 3 of the original
  draft are done.
- `src/persistence/sqlite/runtime.ts` — `initPersistenceRuntime()` already calls
  `seedDefaults(db)` then `importLegacyFiles(db, dataDir, logger, workflowPath)`
  in that order. The `workflowPath` option is passed in from `createServices`.
- `src/config/defaults.ts` — `DEFAULT_PROMPT_TEMPLATE` is the canonical seed
  body. No file reading required.

**Must change:**
- `src/cli/index.ts` — `parseCliArgs()` at line 134: positional arg `workflowPath`
  defaults to `"./WORKFLOW.md"`. The `archiveDir` derivation branches on
  `DATA_DIR` env var or `path.dirname(resolvedWorkflowPath)`. Both must change.
  Additionally, `--log-dir` (which currently sets `archiveDir` directly) must
  be removed as a clean break — `archiveDir` is now always `<data-dir>/archives`.
  `workflowPath` is threaded to `ConfigStore` constructor (line 68) and
  `createServices` (line 93). The startup log on line 117 also logs `workflowPath`.
- `src/config/store.ts` — `ConfigStore` constructor takes `workflowPath` as
  first arg. `start()` sets up a chokidar watcher (lines 40-48). `refresh()`
  calls `loadWorkflowDefinition(this.workflowPath)` (line 64). The
  `getWorkflow()` method returns `WorkflowDefinition`; callers must be audited.
- `src/cli/services.ts` — `createServices()` passes `workflowPath` to
  `initPersistenceRuntime`. After this change, the persistence runtime receives
  `dataDir` derived from `--data-dir` only.
- `src/config/builders.ts` — `deriveServiceConfig(workflow, options)` takes a
  `WorkflowDefinition` as first arg. After the change, call it with an empty
  `WorkflowDefinition` (`{ config: {}, promptTemplate: "" }`). The overlay
  already supplies all config via `options.overlay` — this is a safe no-op
  change that confirms the overlay takes full precedence.
- `src/orchestrator/worker-launcher.ts` — `launchWorker()` calls
  `ctx.deps.configStore.getWorkflow()` (line 356) to get `workflow.promptTemplate`.
  This is the main template read path to replace.
- `src/persistence/sqlite/schema.ts` — `issue_config` table does not exist.
  Must add it.
- `src/persistence/sqlite/database.ts` — `CREATE_TABLES_SQL` hardcoded DDL must
  be updated with the `issue_config` table definition alongside `schema.ts`.
- `src/orchestrator/orchestrator.ts` — `_state.issueModelOverrides` is a
  `DirtyTrackingMap`. A parallel `issueTemplateOverrides` Map must be added.
  Startup must load both maps from DB.
- `src/orchestrator/model-selection.ts` — `updateIssueModelSelection` only
  writes to the in-memory Map; must also persist to `issue_config`. The
  anonymous `ctx` type at lines 27–36 and the inline object at
  `orchestrator.ts:249–263` must include `issueConfigStore`.
- `src/http/routes.ts` — per-issue template endpoints must be added.
- `src/http/model-handler.ts` — `handleModelUpdate` calls
  `orchestrator.updateIssueModelSelection`; persistence is handled inside that
  function.
- `frontend/src/components/issue-inspector-sections.ts` — `buildModelSection()`
  must gain a template row below the reasoning effort field.
- `frontend/src/api.ts` — two new calls: `postTemplateOverride` and
  `deleteTemplateOverride`.
- `scripts/e2e-lib/` — `phases-startup.ts` writes `WORKFLOW.e2e.md` and passes
  it as a positional arg to `spawnSymphony`. `phases-lifecycle.ts`
  `restartResilience` calls `spawnSymphony` with `WORKFLOW.e2e.md` again. Both
  must change to `--data-dir` + pre-seed config file written to disk before spawn.
- `scripts/e2e-lib/helpers.ts` — `generateWorkflowScaffold()` and
  `spawnSymphony()` signature must change.
- `src/config/legacy-import.ts` — `findLegacyWorkflow()` must check
  `process.cwd()` first (i.e., `<cwd>/WORKFLOW.md`), then fall back to
  `<parent-of-dataDir>/WORKFLOW.md`. Also, `seedDefaults()` must check the
  `prompt_templates` table emptiness independently of whether config rows exist,
  to handle the upgrade path (existing config, no templates).

**chokidar:** Used only in `ConfigStore`. If it is not referenced anywhere else
after this change, it can be removed from `package.json`.

**Idempotency of `importLegacyFiles` (confirmed):** The function is guarded by
`isAlreadyImported()` which checks `system.legacyImportVersion`. If that key is
non-null, the function returns early with `{ imported: false, … }`. Running
twice is safe. On a fresh install with no WORKFLOW.md, it records
`legacyImportVersion: 1` with an empty sources array and returns
`{ imported: false }` — this also prevents repeated file-system probes on every
boot.

**Startup sequence (resolved):** DB open → `DbConfigStore` construction →
setup validation → `initPersistenceRuntime` → `seedDefaults` →
`importLegacyFiles` → `orchestrator.start()`. The DB must be opened first,
before constructing `DbConfigStore` and before setup mode validation runs.
`issue_config` rows are therefore available before the orchestrator reads them.
Loading the Maps during `orchestrator.start()` (not during constructor) is
correct.

**`configStore.getWorkflow()` callers:** Only `worker-launcher.ts` calls it
for `promptTemplate`. The method can be removed from `ConfigStore` once the
template resolution is moved to DB.

### Institutional Learnings

- No `docs/solutions/` entries found directly relevant to this change.

### External References

- None required. All patterns are strongly represented in the codebase.
  `chokidar` removal is a dependency cleanup with no external pattern needed.

## Key Technical Decisions

- **Clean break on positional arg and `--log-dir`**: No deprecation for either.
  The positional arg `workflowPath` is removed entirely. The `--log-dir` flag
  is also removed — `archiveDir` is now always derived as `<data-dir>/archives`.
  Both breaking changes are documented in release notes per R17. Rationale:
  a deprecation period complicates the config store refactor with no benefit.

- **`issue_config` as the persistence layer for both model and template
  overrides**: Rather than separate tables, a single `issue_config` table holds
  `identifier (PK)`, `template_id (nullable FK)`, `model (nullable)`,
  `reasoning_effort (nullable)`. The in-memory Maps remain the hot path; the
  table is only read at startup and written on override. Rationale: same row
  lifecycle, same invalidation point, simpler migration.

- **Startup loading of `issue_config` inside `orchestrator.start()`**: Not in
  the constructor. This ensures the DB is fully seeded and migrated before the
  Maps are populated, and aligns with the existing `seedCompletedClaims` pattern
  that also runs in `start()`. Rationale: constructor runs before
  `initPersistenceRuntime` completes; `start()` is the correct lifecycle hook.

- **Template resolution in `worker-launcher.ts`, not in `AgentRunner`**: The
  template body must be resolved before `runAttempt` is called, because
  `runAttempt` currently accepts `promptTemplate: string`. Adding DB access
  inside `AgentRunner` would introduce a new dependency. Resolving in
  `launchWorker` keeps `AgentRunner` stateless. Rationale: minimal surface
  change.

- **`PromptTemplateStore` injected into orchestrator deps or accessed via a
  resolver**: The orchestrator currently has no reference to `PromptTemplateStore`.
  The cleanest approach is to pass a `resolveTemplate: (identifier: string) =>
  Promise<string>` resolver into `OrchestratorDeps`, implemented in
  `createServices` using the existing `templateStore`. This avoids a circular
  dependency and keeps `OrchestratorDeps` interface-based. The resolver must
  call `orchestrator.getTemplateOverride(identifier)` at call time (not capture
  the Map reference directly) to avoid the closure chicken-and-egg problem where
  the Map does not exist until after `new Orchestrator(deps)` is called. Rationale:
  follows the existing pattern of resolving resources through function closures
  (e.g., `getConfig: () => ServiceConfig`).

- **`ConfigStore` no longer holds `getWorkflow()`**: After the change,
  `ConfigStore` has no workflow. The method is removed. `deriveServiceConfig`
  is called with `{ config: {}, promptTemplate: "" }` — a zero-value
  `WorkflowDefinition`. All real config comes from the overlay. Rationale:
  `WorkflowDefinition.config` is already fully superseded by the overlay; the
  only purpose of the workflow object going forward is the `promptTemplate`
  field, which moves to DB.

- **chokidar removal**: After removing the watcher from `ConfigStore`, chokidar
  has no remaining consumers. Remove the import and, if `package.json` shows it
  as a direct dependency, remove it there too. Rationale: no dead dependencies.

- **E2E bootstrap via pre-seeded config file**: Symphony enters setup mode when
  the DB is empty. Calling `PUT /api/v1/config/overlay` after spawning does not
  bypass setup mode. The E2E test must write the overlay config file to disk
  (e.g., `<dataDir>/config/overlay.yaml` or the equivalent path that
  `DbConfigStore` reads) BEFORE spawning Symphony. This pre-seeds config so
  that setup mode is bypassed on first boot. Rationale: matches how operators
  deploy Symphony in headless/containerised environments.

## Open Questions

### Resolved During Planning

- **Is `importLegacyFiles` idempotent?** Yes. Guarded by
  `system.legacyImportVersion`. Running twice returns early without errors or
  side effects.

- **Is `seedDefaults` idempotent for the template seed?** Yes, after the fix
  in Unit 4. The template-seeding guard must check `prompt_templates` table
  emptiness independently of whether config rows exist. The `onConflictDoNothing`
  also provides a safety net.

- **Does `Phase 4` of the original draft still need work?** Largely no.
  `seedDefaults` seeds the default template from `DEFAULT_PROMPT_TEMPLATE`.
  `importLegacyFiles` imports `promptBody` into the default template row if
  found. What is still needed: remove `workflowPath` from
  `initPersistenceRuntime`'s interface (it will derive from `dataDir`
  exclusively) and ensure `dataDir` is set correctly from the new `--data-dir`
  flag.

- **Is chokidar used anywhere besides `ConfigStore`?** No. The only import is
  at the top of `src/config/store.ts`. Safe to remove entirely once that file
  is updated.

- **What is the exact startup sequence for `issue_config` loading?**
  DB open → `DbConfigStore` construction → setup validation →
  `initPersistenceRuntime` (seeds + migrates) → `orchestrator.start()`.
  Load Maps inside `start()`, after `seedCompletedClaims`, before
  `scheduleTick(0)`.

- **Does `ConfigStore.getWorkflow()` have callers outside `worker-launcher`?**
  No callers found beyond `worker-launcher.ts`. The method is safe to remove.

- **What E2E config payload replaces `WORKFLOW.e2e.md`?** An overlay config
  file written to disk at `<dataDir>/config/overlay.yaml` (or equivalent)
  before Symphony is spawned. The file contains the same section-keyed structure
  consumed by `deriveServiceConfig`. The MASTER_KEY and credential env vars
  continue to be injected as process env.

- **Does `OrchestratorContext` need changes for `issueConfigStore`?**
  No. `OrchestratorContext.deps` is typed as `OrchestratorDeps` and `buildCtx()`
  forwards the whole object. Adding `issueConfigStore` to `OrchestratorDeps`
  auto-propagates to `ctx.deps.issueConfigStore` without touching `context.ts`
  or `orchestrator-delegates.ts`.

### Deferred to Implementation

- **Exact Drizzle schema syntax for `issue_config` FK**: The FK references
  `prompt_templates.id` but must be nullable. Exact Drizzle nullable FK syntax
  to be verified against `schema.ts` patterns at implementation time.

- **Whether to set `allowPositionals: false`** after removing the positional
  arg: currently `parseArgs` has `allowPositionals: true`. After the change,
  setting it to `false` would make passing any positional arg an error — cleaner
  but potentially surprising. Decide at Unit 1 based on whether any other
  positional args are expected.

- **Exact path `DbConfigStore` reads for overlay file**: Confirm the path
  convention at implementation time by checking `src/config/db-store.ts`. The
  E2E pre-seed must write to the same path.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review,
> not implementation specification. The implementing agent should treat it as
> context, not code to reproduce.*

**Config loading flow (before → after):**

```
BEFORE
──────
argv[0] (positional)
  → workflowPath = "./WORKFLOW.md"
  → archiveDir = <parent-of-workflow>/.symphony
  → ConfigStore(workflowPath, …)
       ├─ chokidar.watch(workflowPath)
       └─ refresh() → loadWorkflowDefinition(workflowPath)
                          → deriveServiceConfig(workflow, {overlay})
  → worker-launcher.launchWorker()
       → configStore.getWorkflow().promptTemplate  ← disk read

AFTER
─────
--data-dir flag (or DATA_DIR env or ~/.symphony)
  → dataDir = ~/.symphony
  → archiveDir = dataDir/archives   ← fixed derivation, --log-dir removed
  → open DB → DbConfigStore → setup validation
  → ConfigStore(logger, {overlayStore, secretsStore})  ← no workflowPath
       └─ refresh() → deriveServiceConfig({config:{}, promptTemplate:""}, {overlay})
  → initPersistenceRuntime(dataDir) → seedDefaults → importLegacyFiles
  → orchestrator.start()
       → loadIssueConfigRows() → populate issueModelOverrides + issueTemplateOverrides
       → scheduleTick(0)
  → worker-launcher.launchWorker()
       → resolveTemplate(identifier)  ← DB read via orchestrator.getTemplateOverride()
```

**`issue_config` table and runtime Maps:**

```
issue_config (SQLite)
  identifier       TEXT PK
  template_id      TEXT NULL FK→prompt_templates.id
  model            TEXT NULL
  reasoning_effort TEXT NULL

At orchestrator.start() [before scheduleTick(0)]:
  SELECT * FROM issue_config  [synchronous — better-sqlite3]
    → issueModelOverrides.set(row.identifier, {model, reasoningEffort})   if non-null
    → issueTemplateOverrides.set(row.identifier, row.template_id)         if non-null

On POST /api/v1/:id/model:
  onConflictDoUpdate({ target: [issueConfig.identifier], set: { model, reasoningEffort } })
  + issueModelOverrides.set(…) [existing hot path unchanged]

On POST /api/v1/:id/template:
  onConflictDoUpdate({ target: [issueConfig.identifier], set: { templateId } })
  + issueTemplateOverrides.set(…)

On DELETE /api/v1/:id/template:
  UPDATE issue_config SET template_id=NULL WHERE identifier=?
  + issueTemplateOverrides.delete(…)
```

**Template resolution in `launchWorker`:**

```
resolveTemplate(identifier):
  1. orchestrator.getTemplateOverride(identifier) → templateStore.get(templateId)?.body
  2. templateStore.get("default")?.body
  3. ""  + logger.warn("no template found for …")
```

## Implementation Units

```mermaid
TB
  U1[Unit 1\nCLI + data-dir] --> U2[Unit 2\nConfigStore overlay-only]
  U1 --> U3[Unit 3\nissue_config schema]
  U2 --> U4[Unit 4\nPersistence runtime cleanup]
  U3 --> U5[Unit 5\nOrchestrator persistence]
  U4 --> U5
  U5 --> U6[Unit 6\nTemplate resolution in worker-launcher]
  U6 --> U7[Unit 7\nPer-issue template API]
  U7 --> U8[Unit 8\nIssue inspector UI]
  U2 --> U9[Unit 9\nCleanup + docs + E2E]
  U5 --> U9
```

> *Dependency graph: units to the right depend on units to the left. U1 and U3
> may proceed in parallel. U9 can begin after U2 and U5 are complete.*

---

- [ ] **Unit 1: CLI — Replace positional workflowPath with --data-dir flag**

**Goal:** Remove the positional `workflowPath` argument from the CLI; add
`--data-dir` string option; remove `--log-dir` flag; rederive `archiveDir`
from data-dir only.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `src/cli/index.ts`
- Test: `src/cli/index.test.ts` (create if not present; check for existing unit
  tests in `tests/unit/` matching `cli` pattern)

**Approach:**
- In `parseCliArgs()`, remove `allowPositionals: true` (or set to false) and
  remove the `workflowPath = parsed.positionals[0] ?? "./WORKFLOW.md"` line.
- Add `"data-dir": { type: "string" }` to the options map.
- Derive `dataDir` from `parsed.values["data-dir"] ?? process.env.DATA_DIR ??
  path.join(homedir(), ".symphony")`.
- `archiveDir` becomes `path.resolve(path.join(dataDir, "archives"))`.
  Note: `archiveDir = <data-dir>/archives` is the fixed derivation — the old
  `--log-dir` flag that previously set `archiveDir` directly is removed as a
  clean break.
- Remove `--log-dir` from the options map entirely.
- Remove `workflowPath` and `resolvedWorkflowPath` from the return value.
- Remove `workflowPath` from the `configStore` constructor call at line 68.
- Remove `workflowPath` from the `createServices` call at line 93.
- Remove `workflowPath` from the startup log at line 117; log `dataDir` instead.
- Remove the `SYMPHONY_WORKFLOW_PATH` reference from the
  `/api/v1/runtime` route handler in `src/http/routes.ts` (or set it to empty).
- Startup ordering requirement: open the DB first, before constructing
  `DbConfigStore`, before setup mode validation runs. This ordering must be
  explicit in the startup sequence in `src/cli/index.ts`.

**Patterns to follow:**
- `parsePortValue` for input validation pattern.
- Existing `DATA_DIR` env var handling — keep it as the env-var fallback.

**Test scenarios:**
- Happy path: `parseCliArgs(["--port", "4000"])` resolves `dataDir` to
  `~/.symphony` and `archiveDir` to `~/.symphony/archives` when `DATA_DIR` is
  not set.
- Happy path: `parseCliArgs(["--data-dir", "/tmp/test"])` resolves `archiveDir`
  to `/tmp/test/archives`.
- Happy path: with `DATA_DIR=/tmp/env` set and no `--data-dir` flag, `archiveDir`
  is `/tmp/env/archives`.
- Edge case: `--data-dir` flag takes precedence over `DATA_DIR` env var.
- Edge case: passing `--log-dir` produces an unrecognised flag error (flag is
  removed entirely, not aliased).
- Error path: an invalid `--port` value (`"abc"`) still throws `TypeError` as
  before (existing behavior preserved).
- Integration: `main()` starts without a positional argument and reaches
  `configStore.start()` without throwing (integration test or smoke test).

**Verification:**
- `symphony --port 4000` starts with no arguments and no `WORKFLOW.md` present.
- `--data-dir /tmp/foo` causes logs to show `archiveDir: /tmp/foo/archives`.
- The old positional-arg path (`symphony ./WORKFLOW.md`) is silently ignored or
  produces a clear error if `allowPositionals: false` is chosen.
- `--log-dir` is not accepted by the CLI.

---

- [ ] **Unit 2: ConfigStore — Remove chokidar, become overlay-only**

**Goal:** Strip `ConfigStore` of its `workflowPath` constructor parameter,
chokidar watcher, and `loadWorkflowDefinition` call. `refresh()` calls
`deriveServiceConfig` with an empty `WorkflowDefinition`. Remove `getWorkflow()`.

**Requirements:** R3, R4

**Dependencies:** Unit 1 (removes the `workflowPath` argument that would be
passed to `ConfigStore`)

**Files:**
- Modify: `src/config/store.ts`
- Modify: `src/config/builders.ts` (verify that `deriveServiceConfig` with an
  empty `WorkflowDefinition` and a full overlay produces the correct result —
  no code change expected, but confirm)
- Test: `tests/unit/config/store.test.ts` (create or update)

**Approach:**
- Remove the `workflowPath` constructor parameter entirely.
- Remove `private watcher: FSWatcher | null = null` and all watcher lifecycle
  code in `start()` and `stop()`.
- Remove the chokidar import.
- In `refresh()`, replace `loadWorkflowDefinition(this.workflowPath)` with a
  directly constructed empty `WorkflowDefinition`:
  `const workflow = { config: {}, promptTemplate: "" }`.
- The overlay read (`this.deps?.overlayStore?.toMap()`) is unchanged — it
  already provides all real config.
- Remove the `private workflow: WorkflowDefinition | null = null` field and
  `getWorkflow()` method.
- The `refresh()` error path (`keeping last known good config`) survives, but
  the `workflowPath` log field is replaced with `reason`.
- After removing the chokidar import, check `package.json`/`package-lock.json`:
  if chokidar appears only as a direct dependency and has no other consumers,
  remove it.

**Patterns to follow:**
- The existing `overlayUnsubscribe` / `secretsUnsubscribe` pattern for reactive
  config shows how `refresh()` is already triggered correctly via subscriptions.
  No new trigger mechanism needed.

**Test scenarios:**
- Happy path: `configStore.start()` calls `deriveServiceConfig` with an empty
  workflow and the overlay map; `getConfig()` returns the overlay-derived config.
- Happy path: mutating the overlay store triggers `refresh()` (subscribe
  callback fires), and `getConfig()` reflects the updated value.
- Edge case: `start()` with an empty overlay produces a `ServiceConfig` with
  all-default values (matches `DEFAULT_CONFIG_SECTIONS` baseline).
- Edge case: calling `getWorkflow()` after the method is removed throws a
  compile error (TypeScript catches this — no runtime test needed; confirms
  the removal was complete).
- Error path: if `deriveServiceConfig` throws, the error propagates from
  `start()` (first call); on subsequent `refresh()` calls the last-good config
  is retained and an error is logged.
- Integration: `ConfigStore` starts, `PUT /api/v1/config/overlay` fires,
  subscribe callback triggers `refresh()`, `getConfig()` reflects the new value.

**Verification:**
- No chokidar import remains in `src/config/store.ts`.
- `ConfigStore` constructor no longer accepts `workflowPath`.
- `getWorkflow()` is gone; TypeScript compilation succeeds.
- Config refresh still works after `PUT /api/v1/config/overlay`.

---

- [ ] **Unit 3: Schema — Add `issue_config` table**

**Goal:** Add the `issue_config` Drizzle table definition to the SQLite schema
and update the hardcoded DDL in `database.ts`.

**Requirements:** R7

**Dependencies:** None (parallel with Unit 1)

**Files:**
- Modify: `src/persistence/sqlite/schema.ts`
- Modify: `src/persistence/sqlite/database.ts` (update `CREATE_TABLES_SQL` with
  `issue_config` DDL alongside the Drizzle schema addition)
- Test: `Test expectation: none — schema addition has no behavioral logic; covered
  by runtime integration in Unit 5`

**Approach:**
- Add an `issueConfig` table export using the `sqliteTable` helper, consistent
  with the existing table definitions in `schema.ts`.
- Columns: `identifier` (text, PK), `templateId` (text, nullable, with a FK
  reference to `promptTemplates.id`), `model` (text, nullable),
  `reasoningEffort` (text, nullable, same enum constraint pattern as in the
  `attempts` table).
- Export the table so it can be imported in `legacy-import.ts`,
  `model-selection.ts`, and the new template override handler.
- Update `CREATE_TABLES_SQL` in `src/persistence/sqlite/database.ts` to include
  the `issue_config` CREATE TABLE statement. Both files must be kept in sync —
  failing to update `database.ts` means the runtime table will not exist on a
  fresh DB open.
- No migration file is needed if the project uses `openDatabase` with
  auto-schema creation (verify at implementation time — if migrations are
  managed separately, add a migration entry).

**Patterns to follow:**
- `promptTemplates` table definition for the FK pattern.
- `attempts.reasoningEffort` column for the nullable enum pattern.

**Verification:**
- TypeScript compilation succeeds with the new table export.
- A fresh DB open creates the `issue_config` table (visible in integration
  test in Unit 5).

---

- [ ] **Unit 4: Persistence runtime — Remove workflowPath, wire dataDir correctly,
  fix seedDefaults idempotency**

**Goal:** Remove `workflowPath` from `PersistenceRuntimeOptions`; derive
WORKFLOW.md discovery purely from `dataDir` inside `importLegacyFiles`;
fix `seedDefaults` to check template-table emptiness independently; fix
`findLegacyWorkflow` to check `process.cwd()` first.

**Requirements:** R2, R5, R6 (legacy import and seeding already work — this
unit confirms the plumbing is correct after CLI changes and closes two gaps)

**Dependencies:** Unit 1 (removes workflowPath from the call site in
`createServices`)

**Files:**
- Modify: `src/persistence/sqlite/runtime.ts`
- Modify: `src/cli/services.ts`
- Modify: `src/config/legacy-import.ts` (fix `seedDefaults` idempotency gap
  and `findLegacyWorkflow` CWD discovery)
- Test: `tests/unit/persistence/runtime.test.ts` (create or update)

**Approach:**
- Remove `workflowPath?: string | null` from `PersistenceRuntimeOptions`.
- The `importLegacyFiles(db, dataDir, logger)` call loses the `workflowPath`
  argument — `importLegacyFiles` already calls `findLegacyWorkflow(dataDir)`
  internally when no explicit path is given (the `workflowPath` param defaults
  to `null` internally, causing `findLegacyWorkflow` to run).
- In `src/cli/services.ts`, remove the `workflowPath` parameter from
  `createServices` signature and the `initPersistenceRuntime` call.
- **`findLegacyWorkflow` fix (Issue 13):** Update `findLegacyWorkflow` to try
  `process.cwd()` as a discovery candidate first: check `<cwd>/WORKFLOW.md`
  before `<parent-of-dataDir>/WORKFLOW.md`. This ensures that with a default
  `dataDir` of `~/.symphony`, a `WORKFLOW.md` in the user's current working
  directory is discovered correctly (rather than only looking at `~/WORKFLOW.md`).
- **`seedDefaults` idempotency fix (Issue 6):** Split the template-seeding
  guard from the config-row guard. The function must check the `prompt_templates`
  table emptiness independently of whether config rows exist. This prevents the
  upgrade path (existing config rows, no templates) from silently skipping the
  default template seed. Concretely: the template seed block should run whenever
  `prompt_templates` is empty, regardless of whether a `system.legacyImportVersion`
  config row already exists.

**Patterns to follow:**
- `importLegacyFiles` internal `loadWorkflowSource` with `workflowPath = null`
  already calls `findLegacyWorkflow(dataDir)`.

**Test scenarios:**
- Happy path: `initPersistenceRuntime({ dataDir, logger })` (no workflowPath)
  calls `seedDefaults` then `importLegacyFiles`; both succeed on a fresh DB.
- Happy path: when `<cwd>/WORKFLOW.md` exists, `findLegacyWorkflow` returns its
  path (CWD checked first).
- Happy path: when only `<parent-of-dataDir>/WORKFLOW.md` exists, it is still
  discovered as the fallback.
- Happy path (`seedDefaults` upgrade path): DB has config rows but empty
  `prompt_templates`; `seedDefaults` inserts the default template row.
- Edge case: calling `initPersistenceRuntime` twice with the same `dataDir`
  (already-imported DB) — `importLegacyFiles` returns `{ imported: false }`
  without error.
- Edge case: no `WORKFLOW.md` in either CWD or parent — `importLegacyFiles`
  still sets `legacyImportVersion = 1` with empty sources; subsequent calls
  skip the probe.

**Verification:**
- `PersistenceRuntimeOptions` has no `workflowPath` field.
- `createServices` signature drops `workflowPath`.
- A fresh startup with `dataDir = /tmp/test-dir` that has a `WORKFLOW.md` in
  the current working directory successfully imports its config into the overlay
  DB.
- An upgraded DB (config rows present, no templates) gets the default template
  seeded on next startup.

---

- [ ] **Unit 5: Orchestrator — `issue_config` persistence for model overrides +
  startup load**

**Goal:** Create an `IssueConfigStore` (or equivalent module) that wraps
`issue_config` DB operations; load all rows into Maps at orchestrator startup;
persist model overrides on write.

**Requirements:** R7, R8, R9

**Dependencies:** Unit 3 (schema), Unit 4 (runtime)

**Files:**
- Create: `src/persistence/sqlite/issue-config-store.ts`
- Modify: `src/orchestrator/orchestrator.ts`
- Modify: `src/orchestrator/runtime-types.ts` (`OrchestratorDeps`)
- Modify: `src/orchestrator/model-selection.ts` (`updateIssueModelSelection`)
- Test: `tests/unit/persistence/issue-config-store.test.ts`
- Test: `tests/unit/orchestrator/model-selection.test.ts` (update existing)

**Approach:**
- Create `IssueConfigStore` in `src/persistence/sqlite/issue-config-store.ts`
  with methods:
  - `loadAll()` — returns all rows as a synchronous result (better-sqlite3
    pattern; return type is `IssueConfigRow[]`, NOT `Promise<IssueConfigRow[]>`).
    Must be called before `scheduleTick(0)` to avoid any risk of the first tick
    running before overrides are loaded.
  - `upsertModel(identifier, model, reasoningEffort)` — partial-column UPSERT
    using `onConflictDoUpdate({ target: [issueConfig.identifier], set: { model, reasoningEffort } })`.
    Only updates `model` and `reasoningEffort`; preserves `templateId`.
  - `upsertTemplateId(identifier, templateId)` — partial-column UPSERT using
    `onConflictDoUpdate({ target: [issueConfig.identifier], set: { templateId } })`.
    Only updates `template_id`; preserves `model` and `reasoningEffort`.
  - `clearTemplateId(identifier)` — UPDATE SET template_id = NULL
- Add `issueTemplateOverrides: Map<string, string>` to `OrchestratorState`
  (parallel to `issueModelOverrides`), using `DirtyTrackingMap`.
- In `orchestrator.start()`, after `seedCompletedClaims` and BEFORE
  `scheduleTick(0)`, call `issueConfigStore.loadAll()` (synchronous) and
  populate both Maps.
- Add `issueConfigStore: IssueConfigStore` to `OrchestratorDeps`.
- In `updateIssueModelSelection` (in `model-selection.ts`), after setting the
  in-memory Map, call `ctx.deps.issueConfigStore.upsertModel(identifier, model,
  reasoningEffort)`. The anonymous `ctx` type at lines 27–36 must include
  `issueConfigStore`, and the inline object assembled at `orchestrator.ts:249–263`
  must include it too. (`context.ts` and `orchestrator-delegates.ts` do NOT need
  changes — `OrchestratorDeps` auto-propagates to `ctx.deps`.)
- Wire the store in `createServices` using `persistence.db`.

**Patterns to follow:**
- `PromptTemplateStore` in `src/prompt/store.ts` for the DB wrapper pattern.
- `seedCompletedClaims` in `src/orchestrator/lifecycle.ts` for the startup
  load pattern.
- `DirtyTrackingMap` constructor usage in `orchestrator.ts` for the new Map.

**Test scenarios:**
- Happy path (`IssueConfigStore.loadAll`): inserts two rows with different
  identifiers; `loadAll()` returns both synchronously.
- Happy path (`upsertModel`): calling twice with the same identifier updates
  the row rather than inserting a duplicate; `templateId` is preserved.
- Happy path (`upsertTemplateId`): sets `template_id` for an identifier that
  has no existing row (auto-creates); a second call updates it; `model` and
  `reasoningEffort` are preserved.
- Happy path (`clearTemplateId`): after setting, clearing sets `template_id`
  to NULL; `loadAll()` returns the row with `templateId: null`.
- Edge case: `loadAll()` on an empty table returns `[]`.
- Edge case: `upsertModel` with `reasoningEffort = null` stores NULL correctly.
- Integration (`model override persistence`): call `orchestrator.updateIssueModelSelection`;
  verify `issue_config` row is written; restart a fresh orchestrator with the
  same DB; verify `issueModelOverrides` is populated from the DB row on `start()`.
- Integration (`startup load`): DB has two `issue_config` rows; `orchestrator.start()`
  populates `issueModelOverrides` with both; `resolveModelSelection` returns
  the override for a known identifier.

**Verification:**
- Model override set via API survives an orchestrator restart (DB-backed).
- `issueTemplateOverrides` Map is populated at startup from DB rows.
- `updateIssueModelSelection` writes to DB in addition to the Map.
- `loadAll()` return type is not a Promise (synchronous better-sqlite3 call).

---

- [ ] **Unit 6: Worker launcher — Resolve template from DB before launch**

**Goal:** Replace `configStore.getWorkflow().promptTemplate` in `launchWorker`
with a DB-backed template resolution function injected into `LaunchContext`.

**Requirements:** R12

**Dependencies:** Unit 5 (issueTemplateOverrides Map), Unit 2 (getWorkflow()
removed)

**Files:**
- Modify: `src/orchestrator/worker-launcher.ts`
- Modify: `src/orchestrator/runtime-types.ts` (`OrchestratorDeps`)
- Modify: `src/cli/services.ts` (wire the resolver)
- Test: `tests/unit/orchestrator/worker-launcher.test.ts` (update existing)

**Approach:**
- Add `resolveTemplate: (identifier: string) => Promise<string>` to
  `OrchestratorDeps` (and therefore to `LaunchContext`).
- In `launchWorker`, replace the `getWorkflow()` call:
  ```
  const promptTemplate = await ctx.resolveTemplate(issue.identifier);
  ```
- Add `getTemplateOverride(identifier: string): string | null` as a method on
  the orchestrator (exposed on the port). The resolver calls this method at
  invocation time, not at closure-creation time, to avoid capturing a Map
  reference that does not exist until after `new Orchestrator(deps)` is called.
- In `createServices`, implement the resolver as a closure:
  ```
  resolveTemplate: async (identifier) => {
    const templateId = orchestrator.getTemplateOverride(identifier);
    if (templateId) {
      const t = templateStore.get(templateId);
      if (t) return t.body;
    }
    const def = templateStore.get("default");
    if (def) return def.body;
    logger.warn({ identifier }, "no prompt template found — using empty string");
    return "";
  }
  ```

**Patterns to follow:**
- `resolveModelSelection` as the reference pattern for reading from the
  orchestrator state in a closure.
- `PromptTemplateStore.get(id)` for the DB read.

**Test scenarios:**
- Happy path: identifier has a `template_id` override in `issueTemplateOverrides`;
  `resolveTemplate` returns that template's body.
- Happy path: no override; "default" template exists; returns default body.
- Edge case: override template_id points to a deleted template; falls through
  to "default".
- Edge case: no override and no "default" template; returns `""` and a WARN is
  logged.
- Integration: `launchWorker` passes the resolved template body as
  `promptTemplate` to `agentRunner.runAttempt`; verify the arg is non-empty
  when a default template exists.

**Verification:**
- `configStore.getWorkflow()` is no longer called anywhere in the codebase.
- A fresh install (DB has seeded default template) launches workers with the
  seeded template body.
- A per-issue override is applied to the next worker launch for that identifier.

---

- [ ] **Unit 7: HTTP — Per-issue template override API endpoints**

**Goal:** Add `POST /api/v1/:identifier/template` and
`DELETE /api/v1/:identifier/template`; include `configured_template_id` and
`configured_template_name` in `GET /api/v1/:identifier` response.

**Requirements:** R10, R11

**Dependencies:** Unit 5 (IssueConfigStore, issueTemplateOverrides Map)

**Files:**
- Create: `src/http/template-override-handler.ts`
- Modify: `src/http/routes.ts`
- Modify: `src/orchestrator/port.ts` (add `updateIssueTemplateOverride` and
  `clearIssueTemplateOverride`, and `getTemplateOverride`)
- Modify: `src/orchestrator/orchestrator.ts` (implement the new port methods)
- Modify: `src/core/types.ts` (add `configuredTemplateId`, `configuredTemplateName`
  to `RuntimeIssueView`)
- Modify: `src/orchestrator/snapshot-builder.ts` / issue-detail builder
  (populate the new fields)
- Test: `tests/unit/http/template-override-handler.test.ts`

**Approach:**
- `POST /api/v1/:identifier/template` body: `{ template_id: string }`. Validate
  that `template_id` references an existing template (404 if not found, 404 if
  identifier not known to orchestrator). On success: call
  `orchestrator.updateIssueTemplateOverride(identifier, templateId)` which
  writes to DB and updates the Map. Return 202 with `{ updated: true,
  applies_next_attempt: true }`.
- `DELETE /api/v1/:identifier/template`: call
  `orchestrator.clearIssueTemplateOverride(identifier)`. Return 200 with
  `{ cleared: true }`.
- `GET /api/v1/:identifier` (`getIssueDetail`): the detail view must include
  `configuredTemplateId` (from `issueTemplateOverrides.get(identifier)`) and
  `configuredTemplateName` (looked up from `templateStore.get(id)?.name`).
  These fields are nullable.
- Add `OrchestratorPort` methods: `updateIssueTemplateOverride(identifier,
  templateId)`, `clearIssueTemplateOverride(identifier)`, and
  `getTemplateOverride(identifier): string | null`.

**Patterns to follow:**
- `handleModelUpdate` in `src/http/model-handler.ts` for the POST handler pattern.
- `registerTemplateApi` in `src/prompt/api.ts` for the route registration pattern.
- `validateBody` middleware for body validation.
- `methodNotAllowed` helper for `.all()` fallback.

**Test scenarios:**
- Happy path (`POST`): valid identifier + valid `template_id` → 202,
  `issueTemplateOverrides` updated, DB row written.
- Happy path (`DELETE`): identifier with existing override → 200, override
  cleared in Map and DB.
- Happy path (`GET`): issue with `template_id` override → detail includes
  `configured_template_id` and `configured_template_name`.
- Happy path (`GET`): issue with no override → both fields are `null`.
- Error path (`POST`): unknown identifier → 404.
- Error path (`POST`): known identifier but unknown `template_id` → 404 with
  `template_not_found` code.
- Error path (`POST`): missing `template_id` in body → 400 with validation error.
- Error path (`DELETE`): unknown identifier → 404.
- Integration: set template override via `POST`; call `GET` on same identifier;
  verify `configured_template_id` matches; restart orchestrator; verify override
  survives (loaded from DB on startup).

**Verification:**
- `POST /api/v1/PROJ-1/template` returns 202 and the DB row is written.
- `GET /api/v1/PROJ-1` returns `configured_template_id` after override is set.
- `DELETE /api/v1/PROJ-1/template` clears the override; subsequent `GET`
  returns null fields.

---

- [ ] **Unit 8: Frontend — Issue inspector template selector**

**Goal:** Add a "Template" select row to the model settings section of the
issue inspector, below Reasoning Effort, matching the existing model override UX.

**Requirements:** R13

**Dependencies:** Unit 7 (template override API endpoints must exist)

**Files:**
- Modify: `frontend/src/components/issue-inspector-sections.ts`
  (`buildModelSection`)
- Modify: `frontend/src/api.ts` (add `postTemplateOverride`, `deleteTemplateOverride`)
- Modify: `frontend/src/types.ts` (add `configuredTemplateId`,
  `configuredTemplateName` to `IssueDetail`)
- Test: `Test expectation: none — frontend component tests are not present in
  this codebase; covered by manual verification and E2E smoke`

**Approach:**
- In `frontend/src/api.ts` add:
  - `postTemplateOverride(id, templateId)` → `POST /api/v1/{id}/template`
  - `deleteTemplateOverride(id)` → `DELETE /api/v1/{id}/template`
  - `getTemplates()` already exists.
- In `buildModelSection`:
  - Add a `templateSelect` control below the `effortSelect`.
  - On mount, call `api.getTemplates()` to populate options; include a "Default"
    option (value `""`) as the first entry.
  - Pre-select from `detail.configuredTemplateId ?? ""`.
  - Add a "Clear template" button that calls `api.deleteTemplateOverride(detail.identifier)`.
  - The save button calls `api.postTemplateOverride(detail.identifier, templateSelect.value)`
    when a template is selected, or `api.deleteTemplateOverride` when value is `""`.
  - Show "Applies next run" note (identical text and placement to the model
    override note).
- Extend the `IssueDetail` type with optional `configuredTemplateId: string | null`
  and `configuredTemplateName: string | null`.

**Patterns to follow:**
- `modelSelect` / `effortSelect` construction pattern in `buildModelSection`.
- `api.getModels()` call pattern for populating the template dropdown
  asynchronously.
- `detail.modelChangePending` note pattern for the "Applies next run" copy.

**Test scenarios:**
- Test expectation: none — no frontend unit test infrastructure exists for
  component logic. Manual verification: open issue inspector for a known issue,
  confirm the Template row appears below Reasoning Effort, selecting a template
  calls the POST endpoint, clearing calls the DELETE endpoint.

**Verification:**
- Issue inspector renders a "Template" select field below Reasoning Effort.
- Selecting a template and saving sets `configured_template_id` on the issue
  (confirm via subsequent GET).
- Clearing the override reverts to "Default" (confirm via subsequent GET showing
  null fields).
- "Applies next run" note is visible.

---

- [ ] **Unit 9: Cleanup — Delete files, update tests, E2E, and docs**

**Goal:** Delete legacy workflow example files; convert/remove the integration
test; update E2E lifecycle test to use `--data-dir` + pre-seeded config file;
update documentation.

**Requirements:** R14, R15, R16, R17

**Dependencies:** Unit 2 (ConfigStore no longer reads WORKFLOW.md), Unit 5
(model overrides are persisted, so E2E restart-resilience test remains valid)

**Files:**
- Delete: `WORKFLOW.example.md`
- Delete: `WORKFLOW.docker.md`
- Modify or Delete: `tests/integration/config-workflow.integration.test.ts`
- Modify: `scripts/e2e-lib/helpers.ts` (`generateWorkflowScaffold` → removal
  or replacement; `spawnSymphony` signature change)
- Modify: `scripts/e2e-lib/phases-startup.ts` (`startSymphony` phase)
- Modify: `scripts/e2e-lib/phases-lifecycle.ts` (`restartResilience` phase)
- Modify: `scripts/e2e-lib/types.ts` (if `E2EConfig` references workflow file
  fields that no longer apply)
- Modify: `README.md`
- Modify: `docs/OPERATOR_GUIDE.md`
- Modify: `docs/CONFORMANCE_AUDIT.md`

**Approach:**

*Integration test (`config-workflow.integration.test.ts`):*
The current test has three cases: (1) parses `WORKFLOW.example.md` front matter,
(2) verifies fixture codex-home dirs, (3) checks Liquid placeholders in
`WORKFLOW.example.md`. Cases 1 and 3 become invalid after file deletion. Case 2
is unrelated to WORKFLOW.md and should survive. Options: (a) delete the test
file entirely if codex-home fixture coverage exists elsewhere; (b) replace cases
1 and 3 with overlay-based config derivation tests (e.g., `deriveServiceConfig`
with a full overlay map produces the expected `ServiceConfig`). Recommended:
keep the file but replace the WORKFLOW.md-dependent cases with overlay config
derivation tests.

*E2E lifecycle test:*
- Symphony enters setup mode on an empty DB. `PUT /api/v1/config/overlay` after
  spawning does NOT bypass setup mode. The E2E test must write an overlay config
  file to disk (e.g., `<dataDir>/config/overlay.yaml` or the equivalent path
  that `DbConfigStore` reads) BEFORE spawning Symphony. This pre-seeds config
  so that setup mode is bypassed on first boot.
- Replace `generateWorkflowScaffold(config)` + `writeFile(workflowPath)` in
  `phases-startup.ts` with: write the pre-seed overlay file to disk, then spawn
  Symphony with `--data-dir <reportDir>/.symphony --port <port>`.
- The MASTER_KEY env var injection and credential env vars are unchanged.
- In `helpers.ts`, replace `generateWorkflowScaffold` with
  `buildOverlayPayload(config): Record<string, unknown>` that returns the
  equivalent section-keyed JSON/YAML object for writing to disk.
- Update `spawnSymphony(port, dataDir, reportDir, extraEnv)` — replace the
  `workflowPath` positional with `--data-dir <dataDir>`.
- In `restartResilience` (`phases-lifecycle.ts`): DB state persists across
  restarts. The restarted Symphony reads `issue_config`, overlay, and templates
  from the same DB — no re-PUT needed. Update the `spawnSymphony` call to use
  `--data-dir` only; remove any "re-apply overlay after restart" logic.
- Remove the `WORKFLOW.e2e.md` write entirely. No WORKFLOW.md file write needed
  anywhere in the E2E suite.

*Docs:*
- `README.md`: replace all `WORKFLOW.md` references with `--data-dir` / WebUI
  bootstrap instructions.
- `docs/OPERATOR_GUIDE.md`: document `--data-dir` flag, default path
  (`~/.symphony`), the fixed archive path derivation (`<data-dir>/archives`,
  replacing the old `--log-dir` flag which is removed), the legacy
  auto-import behaviour, and the one-time migration story.
- `docs/CONFORMANCE_AUDIT.md`: remove any WORKFLOW.md claims; add overlay-first
  config and `issue_config` persistence notes.

**Patterns to follow:**
- Confirm the exact path `DbConfigStore` reads for overlay file, then write the
  pre-seed file to that path in the E2E startup helper.

**Test scenarios:**
- Integration (config-workflow test, replacement): `deriveServiceConfig` with
  a full overlay map and no workflow config returns a `ServiceConfig` with all
  overlay values applied.
- Integration (config-workflow test, preserved): fixture codex-home dir
  contains expected structure (case 2 unchanged).
- E2E integration: `startSymphony` phase writes pre-seed overlay file, spawns
  with `--data-dir`, and `GET /api/v1/state` returns 200 with `generated_at`
  (orchestrator is live, not in setup mode).
- E2E integration: `restartResilience` restarts with same `--data-dir`; DB
  state persists; confirmed-completed issue is not re-dispatched (no overlay
  re-PUT required).

**Verification:**
- `WORKFLOW.example.md` and `WORKFLOW.docker.md` are deleted.
- `config-workflow.integration.test.ts` passes with no reference to
  `WORKFLOW.example.md`.
- E2E lifecycle test passes without creating any `WORKFLOW.*.md` file.
- `README.md` contains no `WORKFLOW.md` references.
- `docs/OPERATOR_GUIDE.md` documents `--data-dir`, archive path derivation,
  and removal of `--log-dir`.

---

## System-Wide Impact

- **Interaction graph:** `ConfigStore.start()` no longer triggers a file watch.
  Config reactivity now comes exclusively from `overlayStore.subscribe()` and
  `secretsStore.subscribe()` — both already wired. `worker-launcher.ts` gains
  an async `resolveTemplate` call before launching; this is on the hot path for
  every worker launch. The template DB read is a single SQLite `SELECT` and is
  fast. `OrchestratorPort` gains two new methods; `OrchestratorPort` consumers
  (HTTP routes, tests) must be updated.

- **Error propagation:** If `resolveTemplate` throws (unexpected DB error), the
  exception propagates from `launchWorker` through `handleWorkerPromise`, which
  already handles launch errors. The issue will not be claimed but will appear
  in the next poll cycle. This is consistent with the existing workspace
  preparation error path.

- **State lifecycle risks:** `issue_config` uses `onConflictDoUpdate`
  (partial-column UPSERT) semantics — no cross-column clobber risk. The
  in-memory Maps are the authoritative hot path; the DB is the durable backup.
  A crash between writing to the Map and writing to DB (if they are not atomic)
  means the DB may lag by one operation, but the next startup will reload from
  DB — only the in-flight write is lost, not historical state. For model
  overrides, this is acceptable (matches existing ephemeral behavior).

- **API surface parity:** `OrchestratorPort` is the single interface for the
  HTTP layer. Adding `updateIssueTemplateOverride`, `clearIssueTemplateOverride`,
  and `getTemplateOverride` to the port is a non-breaking extension (existing
  callers are unaffected). `ConfigStore` loses `getWorkflow()` — callers must
  be fully audited at Unit 2 time (currently only `worker-launcher.ts`).

- **Integration coverage:** The E2E lifecycle test provides the critical
  cross-layer proof: Symphony starts without WORKFLOW.md (pre-seeded overlay
  file written before spawn), seeds the default template, dispatches a real
  issue, restarts, and confirms the override persists (DB state read on restart,
  no re-PUT needed). Unit tests alone cannot prove this chain.

- **Unchanged invariants:** The `PUT /api/v1/config/overlay` reactive refresh
  path is unchanged. The template CRUD API (`/api/v1/templates/*`) is
  unchanged. `seedDefaults()` and `importLegacyFiles()` are not modified beyond
  the targeted fixes in Unit 4. `AgentRunner.runAttempt()` signature is
  unchanged — it still receives `promptTemplate: string`; only the caller
  changes. The `reasoningEffort` and `model` fields on `issueModelOverrides`
  are unchanged; Unit 5 only adds persistence and a parallel template Map.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `ConfigStore.getWorkflow()` has undiscovered callers | Grep for `getWorkflow` before closing Unit 2; TypeScript will also flag missing method at compile time |
| `onConflictDoUpdate` partial-column UPSERT: wrong column set in `set` payload | Implement separate `upsertModel` and `upsertTemplateId` with explicit `set` payloads naming only the columns each method owns |
| E2E pre-seed overlay path doesn't match `DbConfigStore` read path | Confirm the exact path from `src/config/db-store.ts` before writing the E2E helper; add an assertion that setup mode is NOT active after spawn |
| chokidar removal breaks an undiscovered import | Grep for `chokidar` across the repo before removing from package.json; compiler will catch type errors |
| Template override resolves stale templateId (template deleted after override set) | `resolveTemplate` falls through to "default" if the templateId row no longer exists — this is the correct behavior and should be tested explicitly |
| `seedDefaults` on upgraded DB skips template seed | Fixed in Unit 4: template-seeding guard is now independent of config-row existence |
| `findLegacyWorkflow` misses CWD on default `~/.symphony` dataDir | Fixed in Unit 4: `process.cwd()` is checked as first candidate |
| `WorkflowDefinition` type still referenced throughout codebase | The type stays in `src/core/types.ts`; `ConfigStore` just uses `{ config: {}, promptTemplate: "" }` directly. The type is only removed when no more callers depend on it — defer removal to post-migration cleanup |

## Documentation / Operational Notes

- **Migration story**: Operators with an existing `WORKFLOW.md` get a one-time
  auto-import on first boot with the new version. They do not need to do
  anything manually. Log line `INFO imported WORKFLOW.md config` confirms the
  import ran. On second boot, `legacyImportVersion = 1` skips the probe.
  `findLegacyWorkflow` checks `<cwd>/WORKFLOW.md` first, then
  `<parent-of-dataDir>/WORKFLOW.md`.

- **Breaking change notice for release notes**: (1) The positional `workflowPath`
  argument is removed — any start scripts using `symphony ./WORKFLOW.md` must
  remove the positional arg. (2) The `--log-dir` flag is removed — operators
  using `--log-dir` must switch to `--data-dir`. The archive directory is now
  always `<data-dir>/archives`.

- **Operator Guide**: Must document `symphony --data-dir ~/.symphony` as the
  canonical start command, the fixed archive path (`<data-dir>/archives`),
  removal of `--log-dir`, the WebUI setup flow, and the legacy auto-import.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-30-remove-workflow-md-requirements.md](docs/brainstorms/2026-03-30-remove-workflow-md-requirements.md)
- Related code: `src/config/legacy-import.ts` — `seedDefaults`, `importLegacyFiles`, `findLegacyWorkflow`
- Related code: `src/config/defaults.ts` — `DEFAULT_PROMPT_TEMPLATE`
- Related code: `src/persistence/sqlite/runtime.ts` — `initPersistenceRuntime`
- Related code: `src/persistence/sqlite/database.ts` — `CREATE_TABLES_SQL`
- Related code: `src/orchestrator/worker-launcher.ts` — `launchWorker` (template read path)
- Related code: `src/orchestrator/model-selection.ts` — `updateIssueModelSelection`
- Related code: `src/http/model-handler.ts` — model override handler (pattern for template handler)
- Related code: `src/prompt/store.ts` — `PromptTemplateStore` (pattern for `IssueConfigStore`)
- Related code: `scripts/e2e-lib/phases-startup.ts` — E2E bootstrap (to be replaced)
- Related code: `scripts/e2e-lib/phases-lifecycle.ts` — `restartResilience` (to be updated)
- Existing draft: `/home/oruc/Desktop/remove-workflow-md-plan.md`
