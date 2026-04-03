---
title: "feat: Config & validation bundle"
type: feat
status: audit-passed-dry-run
date: 2026-04-03
origin: .anvil/config-validation-bundle/requirements.md
review-rounds: 1
review-settlements: 6
audit-rounds: 1
audit-verdict: PASS
dry-run: true
---

# Config & Validation Bundle

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this bundle lands, Risoluto operators should be able to load old or mixed-shape configuration without silent drift, get early and path-specific validation errors for unknown keys, hot-reload the settings that are actually safe to reload, configure provider behavior through one registry-backed contract instead of scattered special cases, and ensure commits created on the host and inside Docker workers use a predictable git identity.

The behavior must be demonstrable in three ways. First, a legacy `WORKFLOW.md` or overlay patch with mixed snake_case and camelCase keys should normalize and either migrate forward or fail with a precise dotted-path error. Second, a hot-reloadable change such as the PR monitor interval or provider config should invalidate the cached runtime snapshot and update the affected long-lived service. Third, host-side git commands and Docker worker startup should both apply the same resolved git identity chain.

## Progress

- [x] 2026-04-03 13:15+03:00 Created dry-run anvil run state under `.anvil/config-validation-bundle/`.
- [x] 2026-04-03 13:29+03:00 Wrote `.anvil/config-validation-bundle/requirements.md` after intake hardening against current repo architecture.
- [x] 2026-04-03 13:48+03:00 Wrote this ExecPlan and mirrored it to `.anvil/config-validation-bundle/plan.md`.
- [x] 2026-04-03 13:56+03:00 Completed hostile review round 1 and merged 6 settlements into the plan.
- [x] 2026-04-03 14:02+03:00 Completed hostile audit round 1 with PASS verdict; run intentionally paused before finalize/execute.
- [ ] Execute Units 1-6 in dependency order.
- [ ] Run targeted unit and integration suites for config, workflow import, provider setup, git identity, and hot reload.
- [ ] Run repository quality gates: `pnpm run build`, `pnpm run lint`, `pnpm run format:check`, `pnpm test`.
- [ ] Resume the anvil run at `finalize` once implementation is approved.

## Surprises & Discoveries

- Observation: `WORKFLOW.md` is no longer a live runtime config dependency. It only enters the system through `src/config/legacy-import.ts` and `src/workflow/loader.ts`.
  Evidence: `src/cli/index.ts` wires `ConfigStore` from `DbConfigStore.getWorkflow()` plus the overlay store; `loadWorkflowDefinition()` is only referenced by legacy import.

- Observation: `ConfigStore` already caches a last-known-good typed config snapshot and only refreshes on startup, overlay changes, and secret changes.
  Evidence: `src/config/store.ts` stores `this.config`, rejects bad reloads after startup, and logs "config reload rejected; keeping last known good config".

- Observation: one long-lived service still snapshots config at construction time instead of rereading it.
  Evidence: `src/git/pr-monitor.ts` stores `deps.config` in the constructor and uses `setInterval()` with `this.config.prMonitorIntervalMs`.

- Observation: the OpenAI setup path and the docs are currently inconsistent.
  Evidence: `src/setup/handlers/openai-key.ts` auto-writes `codex.provider.name = CLIProxyAPI` with `base_url = http://localhost:8317/v1`, while `README.md` and `docs/OPERATOR_GUIDE.md` describe direct OpenAI API auth as the primary API-key path.

## Decision Log

- Decision: Keep `WORKFLOW.md` strictly in the legacy-import lane and do not reintroduce it as the primary runtime config surface.
  Rationale: Current runtime config is built from DB-backed sections plus overlay data. Planning as if workflow files were still primary would be wrong for this repo and would conflict with the recent "remove workflow" direction already reflected in the code.
  Date/Author: 2026-04-03 / Codex

- Decision: Persist the config schema version under the `system` section, using a key such as `system.configSchemaVersion`, instead of inventing a root-level `configVersion`.
  Rationale: The database persists section JSON documents, not one monolithic root config object. The `system` section already owns metadata such as `selectedTemplateId` and `legacyImportVersion`, so it is the natural place for raw-config schema metadata.
  Date/Author: 2026-04-03 / Codex

- Decision: Treat issue #263 as explicit invalidation and consumer-reload work on top of the existing cached `ServiceConfig` snapshot, not as a brand-new per-key cache.
  Rationale: `ConfigStore` already caches and republishes a typed snapshot. The meaningful gap is that DB-backed config changes and long-lived consumers do not all participate in that invalidation graph yet.
  Date/Author: 2026-04-03 / Codex

- Decision: Keep the canonical persisted raw config close to the current stored shape, which is section-based and mostly snake_case, while accepting camelCase and structural aliases at ingress.
  Rationale: The existing overlay paths, setup handlers, tests, and parts of the settings surface already assume the current raw shape. A full canonical-storage rewrite would explode the bundle beyond its stated config-hardening scope.
  Date/Author: 2026-04-03 / Codex

- Decision: Model Anthropic and Google as registry-backed provider presets layered on top of the current Codex runtime transport, not as new dispatcher backends.
  Rationale: This bundle is about config and validation. The current runtime still renders one provider block via `src/codex/runtime-config.ts`; a true multi-provider dispatcher belongs to separate runtime roadmap work.
  Date/Author: 2026-04-03 / Codex

- Decision: Attach per-repo git identity overrides to the existing `repos[]` config shape instead of inventing a separate `workspace.repoOverrides` map.
  Rationale: Repo routing already lives in `repos[]`. Reusing that structure keeps routing and identity metadata aligned and avoids an unnecessary second lookup table.
  Date/Author: 2026-04-03 / Codex

## Outcomes & Retrospective

This is a dry-run plan, not an implementation report. The useful outcome today is that the bundle has been hardened against stale assumptions, split into executable units, reviewed, and audit-passed without writing production code yet.

The main lesson from planning is that this bundle is less about adding isolated features and more about reconciling architecture drift. Several issue briefs still assume a workflow-first, greenfield config stack. The repo is already overlay-first, partially cached, and Codex-runtime-centric. The plan therefore focuses on making the existing architecture explicit and reliable instead of layering new abstractions on top of inaccurate assumptions.

## Context and Orientation

The config system has three raw-config entry points and one typed-config publication point.

`src/config/legacy-import.ts` is the one-time migration path from legacy files into SQLite-backed config sections. It uses `src/workflow/loader.ts` to parse `WORKFLOW.md`, merges any overlay YAML it finds, and writes section JSON into the `config` table. That path still matters because several tests, docs, and bootstrap stories rely on it, but it is not the main runtime path anymore.

`src/config/overlay.ts` owns the live file-backed overlay. It watches `archives/config/overlay.yaml`, reloads it on change, and publishes an in-memory raw config map through `ConfigOverlayPort`.

`src/config/db-store.ts` owns the DB-backed section map and prompt-template metadata. It already caches both the reconstructed raw map and the derived `ServiceConfig`, but the main `ConfigStore` does not currently subscribe to DB-backed config changes; it only re-reads the DB-backed map when one of its other refresh triggers fires.

`src/config/store.ts` is the typed-config publication point. It merges the DB/workflow raw map with the overlay raw map, derives a typed `ServiceConfig` through `src/config/builders.ts`, validates dispatch-critical settings with `src/config/validators.ts`, and exposes a last-known-good snapshot to the rest of the app.

The provider-related runtime seam is spread across `src/codex/runtime-config.ts`, `src/codex/model-list.ts`, `src/core/model-pricing.ts`, `src/setup/handlers/openai-key.ts`, and `src/http/routes.ts`. Today there is no single provider registry module. Instead, provider behavior is inferred from a custom `codex.provider` object and from direct OpenAI fallbacks inside `runtime-config.ts`.

The git-identity seam is spread across `src/git/manager.ts`, `src/cli/runtime-providers.ts`, `src/docker/spawn.ts`, and the workspace lifecycle code. There is no single "git identity" abstraction yet, so host-side commits and Docker worker git configuration are both implicit and incomplete.

Two terms are important in this plan:

"Raw config map" means the section-based JSON/YAML structure before Risoluto turns it into typed camelCase objects. This is the shape stored in the DB `config` table and the overlay YAML.

"Typed config snapshot" means the `ServiceConfig` instance returned by `ConfigStore.getConfig()`. That is the object the orchestrator, HTTP routes, setup flows, and other services actually read at runtime.

## Requirements Trace

- R1-R5 are primarily owned by Unit 3, with test proof in Unit 6.
- R6-R8 are primarily owned by Unit 2, with operator docs in Unit 5.
- R9-R14 are primarily owned by Unit 1, with ingress enforcement in Unit 5 and proof in Unit 6.
- R15-R17 are primarily owned by Unit 4, with docs in Unit 5 and proof in Unit 6.
- R18-R20 are primarily owned by Units 5 and 6, but every implementation unit must preserve backward compatibility with the current setup wizard and overlay API unless the plan explicitly changes the operator contract.

## Scope Boundaries

This bundle does not add a new agent runtime abstraction, a new multi-provider dispatcher, or a new dashboard UX flow. It also does not make `WORKFLOW.md` primary again, does not add commit-signing support, and does not require frontend work by default.

If execution later decides that the new provider or git-identity settings must be exposed in `frontend/src/`, that is a scope extension. Reopen review before doing that work and treat the run as UI-touching so `visual-verify` becomes mandatory.

## Key Technical Decisions

The first decision is to separate raw-config hardening from typed-config derivation. The raw layer should normalize aliases, run migrations, and reject unknown keys before `deriveServiceConfig()` starts coercing values. That keeps `builders.ts` focused on producing a typed `ServiceConfig` instead of becoming the dumping ground for alias and migration logic.

The second decision is to make the cache boundary explicit. `ConfigStore` already behaves like a cache, but it is not yet a first-class invalidation hub. This plan treats `ConfigStore` as the authoritative typed snapshot publisher and requires DB-backed config sources and long-lived consumers to participate in its invalidation graph.

The third decision is to keep provider registry work honest to the current runtime contract. The registry can still model named providers such as OpenAI, Anthropic, and Google, but it must describe how each preset maps to the actual `codex.provider` transport that Risoluto can render today. Unsupported direct transports should fail fast in validation, not sit in the registry as fake capabilities.

The fourth decision is to treat git identity as a shared runtime dependency rather than a Docker-only concern. The same resolution chain must feed host-side `git commit` calls and Docker worker startup to avoid split-brain attribution.

The fifth decision is to keep canonical persisted raw config close to the current stored section shape while accepting broader alias input. That preserves compatibility with the existing overlay API, setup handlers, and tests and keeps this bundle from turning into a full storage-format rewrite.

## Implementation Units

### Unit 1 -- Raw Config Contract, Alias Normalization, and Version Chain

Goal: create one explicit pipeline that takes a raw config map from any ingress point, normalizes aliases, migrates versioned shapes forward, and strictly validates the canonical raw result before typed derivation begins.

Owned files: create `src/config/raw-schema.ts`, create `src/config/raw-config.ts`, create `src/config/migrations/index.ts`, create `src/config/migrations/v1-to-v2.ts`, update `src/config/defaults.ts`, update `src/config/builders.ts`, update `src/config/validators.ts`, create `tests/config/raw-schema.test.ts`, create `tests/config/raw-config.test.ts`, update `tests/workflow/loader.test.ts`, update `tests/workflow/config.test.ts`.

Dependencies: none.

Execution target: the raw-config ingress pipeline used by overlay reload, legacy import, config API writes, and DB-backed refresh.

Verification surface: a versionless or `v1` raw config map gains `system.configSchemaVersion`, mixed snake_case and camelCase aliases normalize to one canonical raw shape, and unknown keys produce aggregated dotted-path errors.

Tests impact: add dedicated raw-schema and raw-config unit tests; update workflow-loader and workflow-config tests to assert alias normalization, migration, and strict unknown-key behavior.

Docs impact: no end-user doc edits in this unit, but any new raw version key or alias table must be captured later in Unit 5.

Implementation notes: keep the raw contract focused on the stored/raw shape, not the typed `ServiceConfig` shape. The canonical persisted form should stay compatible with current overlay keys such as `codex.provider.base_url`, `codex.auth.source_home`, and `agent.max_turns`. Structural aliases such as `polling.intervalMs` and camelCase path variants should normalize into that canonical raw shape before validation.

### Unit 2 -- Cache Invalidation and Hot-Reload Contracts

Goal: turn the existing `ConfigStore` snapshot into an explicit invalidation hub and wire long-lived consumers into it so hot-reloadable settings actually take effect.

Owned files: update `src/config/store.ts`, update `src/config/db-store.ts`, update `src/config/index.ts`, update `src/cli/index.ts`, update `src/cli/services.ts`, update `src/cli/notifications.ts`, update `src/git/pr-monitor.ts`, update `src/codex/model-list.ts`, update `tests/config/store.test.ts`, update `tests/config/db-store.test.ts`, update `tests/cli/notifications.test.ts`, update `tests/cli/services.test.ts`, create `tests/git/pr-monitor.test.ts`.

Dependencies: Unit 1.

Execution target: typed config publication, invalidation wiring, and long-lived services that depend on hot-reloadable settings.

Verification surface: DB-backed config changes trigger `ConfigStore` refresh without requiring an unrelated overlay or secret change; `PrMonitorService` picks up interval changes or logs that restart is required; model-list cache invalidation happens when provider-relevant config changes.

Tests impact: extend store and service wiring tests to cover DB-store subscriptions, invalidation propagation, last-known-good retention, and PR monitor interval reload behavior.

Docs impact: document which settings hot-reload and which still require restart, especially `server.port`.

Implementation notes: the cleanest seam is to make the DB-backed workflow source subscribe-able instead of forcing callers to poll it through `getWorkflow()`. `ConfigStore` should subscribe to overlay, secrets, and workflow-source changes through one interface. `PrMonitorService` should stop storing a frozen `AgentConfig` and instead consume a getter or refresh callback. `src/codex/model-list.ts` should export an explicit invalidation helper rather than depending on time-based expiry alone.

### Unit 3 -- Provider Registry, Setup Truth, and Runtime Validation

Goal: centralize provider metadata and provider-aware validation so setup flows, runtime config generation, model listing, and pricing all tell the same truth.

Owned files: create `src/codex/provider-registry.ts`, update `src/core/types.ts`, update `src/core/model-pricing.ts`, update `src/codex/runtime-config.ts`, update `src/codex/model-list.ts`, update `src/config/validators.ts`, update `src/orchestrator/model-selection.ts`, update `src/http/routes.ts`, update `src/http/response-schemas.ts`, update `src/setup/handlers/openai-key.ts`, create `tests/codex/provider-registry.test.ts`, update `tests/codex/runtime-config.test.ts`, update `tests/config/validators.test.ts`, update `tests/setup/openai-key-handler.test.ts`, update `tests/http/setup-api.integration.test.ts`.

Dependencies: Unit 1. Unit 2 should land before any hot-reload-sensitive registry invalidation hooks are wired.

Execution target: provider selection, provider validation, runtime config rendering, setup wizard truth, and model/price metadata publication.

Verification surface: valid provider presets resolve to the expected runtime config, unsupported provider/runtime combinations fail at validation time, `/api/v1/models` returns registry-backed metadata, and OpenAI key setup no longer silently forces a `CLIProxyAPI` preset unless the operator explicitly selected that path.

Tests impact: add registry-specific unit tests, extend runtime-config and validator coverage, and update setup handler tests to match the new explicit provider behavior.

Docs impact: explain provider presets, direct OpenAI vs login-backed auth, and how named presets map onto the existing `codex.provider` transport.

Implementation notes: keep the registry honest. OpenAI direct remains a real built-in path. Anthropic and Google can still be first-class registry entries, but their entries must describe the current transport requirement instead of pretending Risoluto already owns native backends. `src/core/model-pricing.ts` should stop acting like the de facto model catalog; pricing should become a companion table keyed by registry model ids.

### Unit 4 -- Git Identity Resolution Across Host and Docker

Goal: resolve git identity once per target repo and apply it consistently on the host and inside worker containers.

Owned files: create `src/git/identity.ts`, update `src/core/types.ts`, update `src/config/raw-schema.ts`, update `src/config/builders.ts`, update `src/cli/runtime-providers.ts`, update `src/git/manager.ts`, update `src/docker/spawn.ts`, create `tests/git/identity.test.ts`, update `tests/git/manager.test.ts`, create `tests/docker/spawn.test.ts`.

Dependencies: Unit 1, because raw config and typed config both need new fields.

Execution target: git identity lookup, host-side git commands, Docker worker startup, and route-aware repo metadata.

Verification surface: per-repo override beats host detection; host detection beats global fallback; partial identities fall through; Docker startup script writes `git config --global user.name` and `user.email` only when a full identity exists; host-side commits use `git -c user.name=... -c user.email=...`.

Tests impact: add unit tests for the resolution chain and extend git manager tests to assert identity-bearing command arguments.

Docs impact: document global and per-repo identity config, and clarify that the bundle does not add GPG signing.

Implementation notes: use the existing `repos[]` config entries as the per-repo override home by extending them with an optional `git_identity` block. Add a global `workspace.git_identity` fallback. The resolution algorithm should be `repo override -> host git config -> global fallback -> null`. Applying identity only in Docker is not enough.

### Unit 5 -- Operator-Facing Validation, API Enforcement, and Docs

Goal: make the raw-config hardening visible and trustworthy to operators by validating overlay writes up front and updating the docs to match the shipped behavior.

Owned files: update `src/config/api.ts`, update `README.md`, update `docs/OPERATOR_GUIDE.md`, update `docs/TRUST_AND_AUTH.md`, update `docs/CONFORMANCE_AUDIT.md`, update `docs/E2E_TESTING.md`, update `tests/http/setup-api.integration.test.ts`, update `tests/config/legacy-import.integration.test.ts`, update `tests/workflow/loader.integration.test.ts`.

Dependencies: Units 1-4.

Execution target: overlay API validation, operator documentation, and config fixture stories used by tests and setup flows.

Verification surface: invalid overlay patches are rejected before persistence, docs and setup behavior agree about API-key provider defaults, and legacy import docs describe `WORKFLOW.md` as bootstrap-only instead of live config.

Tests impact: integration tests for overlay-write failures and legacy import path errors should assert the new path-based messages and version/migration behavior.

Docs impact: this unit owns the operator-facing explanation of aliases, strict unknown-key rejection, migration behavior, provider presets, hot reload vs restart-required settings, and git identity resolution.

Implementation notes: `src/config/api.ts` should validate incoming patches against the raw-config pipeline before calling `ConfigOverlayPort.applyPatch()` or `set()`. Keep the returned errors aggregated so operators do not get trapped in one-failure-at-a-time loops.

### Unit 6 -- Regression Sweep and Final Acceptance

Goal: prove the bundle end to end with targeted unit and integration coverage, then run the repo gates that a shipping change would require.

Owned files: update `tests/config/store.test.ts`, update `tests/config/db-store.test.ts`, update `tests/config/validators.test.ts`, update `tests/config/legacy-import.test.ts`, update `tests/config/legacy-import.integration.test.ts`, update `tests/workflow/loader.test.ts`, update `tests/workflow/loader.integration.test.ts`, update `tests/workflow/config.test.ts`, update `tests/setup/openai-key-handler.test.ts`, update `tests/http/setup-api.integration.test.ts`, update `tests/git/manager.test.ts`, update `tests/cli/notifications.test.ts`, plus every new test file introduced in Units 1-4.

Dependencies: Units 1-5.

Execution target: targeted regression proof, integration proof, and repository quality gates.

Verification surface: all new behavior is covered by deterministic tests, and the repo still passes build, lint, format, and unit test gates after the bundle lands.

Tests impact: this is the closeout unit, so it owns gap-filling tests that were missed during earlier units.

Docs impact: none beyond confirming that the docs updated in Unit 5 still match the code after test-driven adjustments.

Implementation notes: resist the urge to defer tests until the very end. Use this unit to close residual gaps, not to write the full test suite from scratch after all code is done.

## Concrete Steps

1. Implement Unit 1 from `/home/oruc/Desktop/workspace/risoluto`.

    `pnpm test -- tests/workflow/loader.test.ts tests/workflow/config.test.ts tests/config/raw-schema.test.ts tests/config/raw-config.test.ts`

   Expect the new raw-contract tests to cover alias normalization, version upgrades, and strict unknown-key errors.

2. Implement Unit 2 and rerun the focused hot-reload suites.

    `pnpm test -- tests/config/store.test.ts tests/config/db-store.test.ts tests/cli/notifications.test.ts tests/cli/services.test.ts tests/git/pr-monitor.test.ts`

   Expect DB-backed config changes and overlay/secrets updates to trigger snapshot invalidation without losing the last-known-good config.

3. Implement Unit 3 and validate setup/runtime/provider behavior.

    `pnpm test -- tests/codex/provider-registry.test.ts tests/codex/runtime-config.test.ts tests/config/validators.test.ts tests/setup/openai-key-handler.test.ts`

   Expect provider presets, default models, credential validation, and setup handler behavior to align.

4. Implement Unit 4 and run the git and Docker identity tests.

    `pnpm test -- tests/git/identity.test.ts tests/git/manager.test.ts tests/docker/spawn.test.ts`

   Expect the same resolved identity chain to show up in host-side git commands and Docker worker startup.

5. Implement Unit 5 and run the integration-facing config ingress tests.

    `pnpm run test:integration -- tests/config/legacy-import.integration.test.ts tests/workflow/loader.integration.test.ts tests/http/setup-api.integration.test.ts`

   Expect invalid overlay input to fail before persistence and legacy-import behavior to reflect the new migration/validation rules.

6. Close Unit 6 with repository gates.

    `pnpm run build`

    `pnpm run lint`

    `pnpm run format:check`

    `pnpm test`

   If one of the earlier targeted test commands revealed additional uncovered regressions, add those tests before treating this unit as complete.

## Validation and Acceptance

Acceptance is behavioral, not structural.

A legacy config file with no explicit config schema version must import successfully, pick up `system.configSchemaVersion`, and derive a valid `ServiceConfig` when its fields are otherwise valid. A mixed-shape overlay patch must either normalize into the canonical raw shape or return an aggregated 400 response naming the exact invalid paths. Unknown keys must not silently persist.

Changing a hot-reloadable config surface must invalidate the cached runtime snapshot and update the affected consumer. At minimum, prove this for the cached config publisher itself and for `PrMonitorService`. If a config surface still requires restart, the code and docs must say so explicitly.

Provider validation must move earlier in the lifecycle. Invalid provider/model combinations or missing provider credentials must fail before a worker container launches. The OpenAI setup path must become explicit and truthful: direct OpenAI stays direct unless the operator picked a proxy-backed preset.

Git identity must be provable on both sides of the boundary. Host-side git commands should include the resolved `user.name` and `user.email` overrides when a full identity exists. Docker worker startup should configure the same identity before the agent runs. Missing or partial identity must preserve current behavior instead of writing half-configured git state.

## Idempotence and Recovery

The raw-config migration chain must be forward-only and idempotent. Re-running it on already-current config must produce the same canonical raw map without additional writes. Only persist the bumped schema version after normalization and validation succeed.

Overlay and DB-backed config writes must remain atomic. If validation fails, keep the previous persisted data and the previous last-known-good typed snapshot. `ConfigStore` already has the correct recovery pattern for bad refreshes; extend that pattern instead of bypassing it.

Git identity application must be additive. When no full identity is available, do nothing and preserve today's behavior. Do not write partial `git config` state.

## Artifacts and Notes

Important planning artifacts for this dry run live here:

- `.anvil/config-validation-bundle/intake.md`
- `.anvil/config-validation-bundle/requirements.md`
- `.anvil/config-validation-bundle/ledger.md`
- `.anvil/config-validation-bundle/reviews/review-round-1.md`
- `.anvil/config-validation-bundle/reviews/hostile-audit-round-1.md`

Three concrete repo facts shaped this plan:

    1. `src/config/store.ts` already caches a typed config snapshot.
    2. `src/git/pr-monitor.ts` still snapshots config at construction time.
    3. `src/setup/handlers/openai-key.ts` still auto-injects `CLIProxyAPI`.

Those are the main reasons this bundle is framed as architecture reconciliation instead of greenfield feature work.

## Interfaces and Dependencies

Create `src/config/raw-schema.ts` with a strict schema over the stored raw config shape and an error formatter that can emit full dotted paths for unknown keys and invalid values.

Create `src/config/raw-config.ts` with one orchestration entry point that deep-clones input, applies alias normalization, runs the version chain from `src/config/migrations/index.ts`, validates the canonical raw shape, and returns the canonical raw map plus version metadata.

Create `src/codex/provider-registry.ts` with a registry type that can answer four questions without reaching into ad hoc code paths: "what provider is this?", "what is its default model?", "what credentials does it require?", and "what capabilities does this model advertise?" Keep the registry keyed by stable ids and keep pricing data separate from display metadata.

Create `src/git/identity.ts` with a small abstraction for `GitIdentity` resolution and application. It should accept repo context plus access to host git config and return either a full `{ name, email }` pair or `null`.

Update `src/config/store.ts` and `src/config/db-store.ts` so DB-backed config changes can participate in the same invalidation graph as overlay and secret changes. A subscribe-able workflow source is the simplest path.

Update `src/git/pr-monitor.ts` so it does not freeze `AgentConfig` forever. A getter or restart-on-change hook is enough; do not introduce a broader service container just for this bundle.

Change note (2026-04-03, Codex): initial dry-run ExecPlan created from an anvil intake/brainstorm/plan/review/audit pass for issues #261, #263, #309, #325, #330, and #336. No implementation work was executed.
