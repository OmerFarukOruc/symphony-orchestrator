# Intake -- Config & Validation Bundle

## Request

User request on 2026-04-03: use the repo-local anvil workflow for a fresh dry run of the Config bundle from roadmap epic [#354](https://github.com/OmerFarukOruc/risoluto/issues/354) under the slug `config-validation-bundle-replay-01`, stop after intake, brainstorm, plan, review, and synthesis audit, and do not resume any previous `.anvil` run or execute implementation.

## Source Bundle

- [#261](https://github.com/OmerFarukOruc/risoluto/issues/261) -- LLM provider registry with capability flags and credential validation
- [#263](https://github.com/OmerFarukOruc/risoluto/issues/263) -- Config cache with invalidation for hot-reloadable settings
- [#309](https://github.com/OmerFarukOruc/risoluto/issues/309) -- Versioned config migration with forward-compatible schema chain
- [#325](https://github.com/OmerFarukOruc/risoluto/issues/325) -- Config key alias normalization (snake_case/camelCase compatibility)
- [#330](https://github.com/OmerFarukOruc/risoluto/issues/330) -- Strict WORKFLOW.md validation with unknown key rejection
- [#336](https://github.com/OmerFarukOruc/risoluto/issues/336) -- Tiered git identity resolution chain for Docker workers

## Why This Bundle Belongs Together

All six issues converge on the same seam: how raw operator config enters Risoluto, gets normalized and validated, becomes a cached `ServiceConfig`, and then drives downstream runtime consumers such as Codex provider setup, Docker worker launch, and git operations.

Grouped together, they let one implementation pass harden the full config lifecycle instead of scattering partial fixes across unrelated roadmap slices.

## Current Repo Reality

- Live runtime config is overlay-first and DB-seeded. `src/config/store.ts` caches a typed `ServiceConfig` snapshot and refreshes on overlay or secret changes.
- `WORKFLOW.md` is no longer the primary runtime config surface. It is only used by `src/config/legacy-import.ts` as a one-time bootstrap path via `src/workflow/loader.ts`.
- `src/config/store.ts` already behaves like a coarse config cache, so issue #263 is now gap-closing work around explicit invalidation and consumer reset contracts, not a greenfield cache layer.
- `src/setup/handlers/openai-key.ts` still auto-injects a `CLIProxyAPI` provider preset when an operator pastes an OpenAI key. That behavior conflicts with the current docs, which describe direct OpenAI API auth as the default.
- `src/git/pr-monitor.ts` snapshots `AgentConfig` once at construction time, so at least one long-lived service does not currently honor hot-reloaded config updates.

## Likely Touched Areas

- `src/config/`
- `src/workflow/`
- `src/codex/`
- `src/core/model-pricing.ts`
- `src/git/`
- `src/docker/`
- `src/setup/`
- `README.md`
- `docs/OPERATOR_GUIDE.md`
- `docs/TRUST_AND_AUTH.md`
- `docs/CONFORMANCE_AUDIT.md`
- `tests/config/`, `tests/workflow/`, `tests/setup/`, `tests/git/`, `tests/http/`

## Scope For This Bundle

- Provider registry and provider-aware validation for the current Codex runtime contract
- Versioned raw-config migration chain
- Alias normalization and strict unknown-key rejection
- Explicit invalidation / reload behavior for cached config consumers
- Git identity resolution for both host-side git and Docker workers
- Operator docs and tests required to prove the above behavior

## Explicitly Out Of Scope

- Multi-provider dispatch backends or agent runtime abstraction beyond the existing Codex-centric transport
- Reintroducing `WORKFLOW.md` as a live runtime dependency
- A new settings UI redesign
- GPG signing, SSH commit signing, or identity UX in the dashboard

## Run Slug

`config-validation-bundle-replay-01`
