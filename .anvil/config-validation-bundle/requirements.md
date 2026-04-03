# Config & Validation Bundle

## Problem Frame

Risoluto's configuration story is now split across several layers: seeded defaults in SQLite, a file-backed overlay, a one-time legacy `WORKFLOW.md` import path, and runtime consumers that assume the config they receive is already normalized, valid, and current. The six bundled issues all point at the same operator pain: configuration is still too easy to get subtly wrong, too easy to let drift across layers, and not explicit enough about which changes hot-reload safely.

The bundle should leave Risoluto with one hardened raw-config pipeline: ingest old and new config shapes, normalize aliases, migrate forward, reject unknown keys with clear paths, publish a stable cached `ServiceConfig`, and make downstream consumers such as provider setup, Docker worker launch, and git automation behave consistently.

## Requirements

- **R1.** Introduce a shared provider registry that owns provider metadata, model catalogs, default model selection, capability flags, and credential requirements for the current Codex runtime contract.
- **R2.** The provider registry must support at least named entries for OpenAI, Anthropic, Google, and the existing custom-provider path, but it must only expose routing behavior that the current `codex` runtime can actually render and validate.
- **R3.** Provider selection and model validation must move out of ad hoc checks in `src/config/validators.ts` and into registry-backed validation helpers.
- **R4.** Provider-aware validation must fail fast with actionable messages when a provider preset requires missing credentials, unsupported transport assumptions, or an invalid model id.
- **R5.** The bundle must preserve backward compatibility for the current `codex.auth.mode` flows (`api_key` and `openai_login`) and for existing `codex.provider` overlay data that already works today.
- **R6.** Formalize the existing config cache boundary so Risoluto serves a last-known-good `ServiceConfig` snapshot instead of re-deriving raw config opportunistically across long-lived services.
- **R7.** Overlay writes, DB-backed config writes, secret mutations, and config migrations must all invalidate or rebuild the cached config snapshot through one explicit contract.
- **R8.** Long-lived services that depend on hot-reloadable settings must either re-read config on change or declare themselves restart-required with an explicit warning.
- **R9.** Add a versioned raw-config migration chain that upgrades older config maps forward before the typed `ServiceConfig` derivation step runs.
- **R10.** The version marker must fit the repo's current section-based config storage. It must not assume a monolithic root object that the DB does not actually persist.
- **R11.** Alias normalization must accept both snake_case and camelCase inputs, plus the legacy structural aliases already implied by the issue research, before strict validation runs.
- **R12.** Unknown keys must be rejected after alias normalization with full dotted-path error messages that show operators exactly what input was rejected.
- **R13.** Strict validation applies to the raw-config entry points that still exist in this repo: legacy `WORKFLOW.md` import, overlay file reload, API patch ingestion, and test/e2e-generated fixture config.
- **R14.** The bundle must not reintroduce `WORKFLOW.md` as the primary runtime config source. It remains a legacy bootstrap path only.
- **R15.** Add a tiered git identity resolution chain: per-repo override first, detected host git identity second, and global workspace fallback third.
- **R16.** Git identity resolution must require both `user.name` and `user.email`; partial identities must fall through to the next tier instead of partially applying.
- **R17.** The resolved git identity must be applied to host-side git operations and to Docker worker startup so commit attribution stays consistent everywhere.
- **R18.** The OpenAI setup flow must no longer silently hardcode provider behavior that conflicts with the operator docs. Provider setup must become explicit and registry-backed.
- **R19.** Update operator-facing documentation to explain the canonical raw-config shape, alias support, strict validation, migration behavior, provider presets, and git identity resolution.
- **R20.** Add or update deterministic test coverage for provider registry lookups, migration steps, alias normalization, strict unknown-key rejection, cache invalidation, hot-reload behavior, and git identity resolution.

## Success Criteria

- A mixed snake_case / camelCase config input normalizes to one canonical raw shape and validates without ambiguous field handling.
- An unknown key such as `codex.provider.baseURLTypo` is rejected with a full path-based error before it can silently persist.
- A v1-style legacy config can be imported or loaded, migrated to the latest raw schema version, and still produce a valid `ServiceConfig`.
- Hot-reloadable config changes update the cached runtime snapshot and the specific long-lived consumers that depend on them.
- Provider configuration errors are surfaced at config time instead of first failing inside a worker container.
- Git commits created on the host and inside workers use the same resolved identity chain.
- All changed behavior is covered by unit or integration tests and documented for operators.

## Scope Boundaries

- No new multi-provider dispatcher or non-Codex agent backend support
- No reintroduction of `WORKFLOW.md` as a first-class runtime config file
- No new dashboard UX flow beyond what is required to keep existing setup/config behavior truthful
- No GPG signing or commit-signing workflows
- No frontend visual redesign

## Key Decisions

- **Overlay-first runtime stays intact.** The bundle hardens the current overlay/DB runtime path instead of reverting to workflow-first config.
- **Canonical persisted raw config stays close to today's stored shape.** Alias support broadens accepted input, but the stored raw map should remain compatible with the existing overlay paths, setup handlers, and tests.
- **Issue #263 is gap-closing work.** The repo already has a coarse cached config snapshot; the missing piece is explicit invalidation and consumer reload coverage.
- **Provider registry remains runtime-truthful.** The bundle may model named providers beyond direct OpenAI, but it cannot pretend the current Codex transport supports a dispatcher architecture that does not exist yet.
- **Git identity must be end-to-end.** Solving only Docker or only host-side git would leave attribution drift unresolved.

## Dependencies / Assumptions

- The current overlay API remains the primary write path for operator-edited config.
- `ConfigStore` remains the main typed-config publisher for orchestrator services.
- `DbConfigStore` remains the backing store for seeded defaults, legacy imports, and prompt-template metadata.
- Existing setup routes and docs are allowed to change when they conflict with the new registry-backed truth.

## Outstanding Questions

### Resolve Before Planning

_(none -- the product-level framing is concrete enough to plan)_

### Deferred To Planning

- Decide whether the raw schema version lives under `system.configSchemaVersion`, `system.rawConfigVersion`, or another system-scoped key that works for section-based DB storage.
- Decide whether alias normalization persists the canonical form on write or only normalizes transiently during refresh.
- Decide whether `/api/v1/models` is enough operator surface for provider metadata or whether a dedicated provider endpoint is warranted.
- Decide which long-lived services besides `PrMonitorService` need explicit reload hooks instead of passive `getConfig()` calls.
- Decide how much of the existing setup flow should be rewritten now versus documented as advanced overlay-only configuration.
