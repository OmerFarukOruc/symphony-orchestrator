# T1 Repo audit: Risoluto testing reality

## 1) Executive summary

Risoluto has a **large and genuinely multi-layered test suite on disk**, with strong evidence of unit, integration, contract, property, Playwright smoke, Playwright visual, Playwright fullstack, live-provider, load, mutation, and manual end-to-end lifecycle coverage. Repo evidence shows **substantial depth around HTTP contracts, orchestrator behavior, persistence adapters, setup flows, workspace lifecycle, and mocked UI flows**.

The important correction is that **the regularly enforced path is much narrower than the total inventory**. The default local/PR-critical path is mainly `pnpm test` + integration + smoke; several meaningful suites are **present but not part of the default gate**, especially `tests/frontend/*.test.ts`, `tests/http/load.test.ts`, `tests/agent-runner/agent-runner.test.ts`, Playwright visual/fullstack, live-provider smoke, mutation, and the real `./scripts/run-e2e.sh` lifecycle test.

The biggest repo-grounded risk is not “there are no tests”; it is **coverage shape and execution shape mismatch**: some of the most operationally critical paths (agent execution, git post-run/PR creation, webhook route registration, observability coverage reporting) are either low-covered in the checked-in coverage artifact, excluded from default coverage accounting, or not part of the standard pre-push/PR path.

> Limitation: no pasted external LLM summaries were present in this thread. Section 5 therefore compares current repo reality against the repo’s own summary-like claims (`README.md`, `AGENTS.md`, `tests/AGENTS.md`) and likely LLM-repeatable claims. If you paste the external summaries later, they can be checked line-by-line against this audit.

---

## 2) Evidence table

| Finding | Repo evidence | Verdict |
|---|---|---|
| Default local gate is narrower than total test inventory | `.husky/pre-push` runs `pnpm run build`, `pnpm test`, `pnpm run typecheck`, `pnpm run typecheck:frontend`; it does **not** run `pnpm run test:frontend`, Playwright, load, mutation, or live suites | **Verified** |
| PR CI runs default Vitest + smoke + integration, but not frontend unit tests | `.github/workflows/ci.yml` runs `pnpm exec vitest run --reporter=verbose --coverage`, `pnpm exec playwright test --project=smoke`, and `pnpm run test:integration`; no `pnpm run test:frontend` call found | **Verified** |
| Frontend unit tests exist as a separate suite | `vitest.frontend.config.ts` includes `tests/frontend/**/*.test.ts`; `tests/frontend/` contains 28 test files | **Verified** |
| Frontend unit tests are not part of default `pnpm test` | `vitest.config.ts` includes only `tests/**/*.test.ts` with no frontend-specific config; `package.json` exposes separate `test:frontend` script | **Verified** |
| A major agent-runner test file exists but is excluded from default test and mutation configs | `tests/agent-runner/agent-runner.test.ts` exists; `vitest.config.ts` excludes it; `vitest.mutation.config.ts` also excludes it | **Verified** |
| Load tests exist but are manual-only | `tests/http/load.test.ts` exists; `package.json` exposes `test:load`; `vitest.config.ts` excludes it; no CI wiring found | **Verified** |
| Visual regression and fullstack Playwright suites exist, but only run nightly/manual in CI | `playwright.config.ts` defines `smoke` and `visual`; `playwright.fullstack.config.ts` defines `fullstack`; `.github/workflows/ci.yml` runs visual/fullstack only on `schedule` or `workflow_dispatch` | **Verified** |
| Live integration tests exist and are nightly/manual only | `vitest.live.config.ts` includes `tests/integration/live/**/*.integration.test.ts`; `.github/workflows/ci.yml` runs `pnpm run test:integration:live` only on nightly/manual triggers | **Verified** |
| Mutation testing exists, but is advisory rather than gating | `.github/workflows/mutation.yml` has `continue-on-error: true`; `package.json` exposes `test:mutation`; `stryker.config.json` scopes only selected backend files and ignores `frontend` | **Verified** |
| Quarantine system exists but is currently unused | `tests/helpers/quarantine.ts`, `scripts/quarantine.ts`, `scripts/quarantine-heal.ts` exist; `quarantine.json` currently contains `[]` | **Verified** |
| Checked-in coverage artifact shows weak coverage in several critical backend paths | `coverage/coverage-final.json` exists (mtime `2026-04-06 21:49:37 +0300`); low coverage includes `src/agent-runner/index.ts` 3.4%, `src/orchestrator/git-post-run.ts` 22.9%, `src/http/routes/webhooks.ts` 29.4%, `src/git/pr-summary-generator.ts` 12.3%, `src/alerts/history-store.ts` 40%, `src/agent-runner/agent-session.ts` 0% | **Verified from local artifact** |
| Coverage artifact is not a full map of current test reality | 15 `src/` files are absent from `coverage/coverage-final.json`, including `src/cli/runtime-providers.ts`, `src/setup/device-auth.ts`, `src/prompt/api.ts`, `src/dispatch/server.ts`, `src/observability/hub.ts`; some of these have tests on disk | **Verified** |
| Repo docs contain stale test counts/claims | `AGENTS.md`, `tests/AGENTS.md`, and `README.md` contain outdated counts and paths (details in section 5) | **Verified** |

---

## 3) Verified current test inventory

### A. Core scripts and configs

- **Default unit/primary Vitest**: `pnpm test`
  - Config: `vitest.config.ts`
  - Includes: `tests/**/*.test.ts`
  - Excludes: `tests/**/*.integration.test.ts`, `tests/http/load.test.ts`, `tests/agent-runner/agent-runner.test.ts`
- **Integration Vitest**: `pnpm run test:integration`
  - Config: `vitest.integration.config.ts`
  - Includes integration-style files under `tests/**/*.integration.test.ts` and `tests/integration/**/*.test.ts`
  - Excludes: `tests/integration/live/**`
- **Frontend-only Vitest**: `pnpm run test:frontend`
  - Config: `vitest.frontend.config.ts`
  - Includes: `tests/frontend/**/*.test.ts`
- **Live integration Vitest**: `pnpm run test:integration:live`
  - Config: `vitest.live.config.ts`
  - Includes: `tests/integration/live/**/*.integration.test.ts`
- **Load tests**: `pnpm run test:load`
  - Config: `vitest.load.config.ts`
  - Includes: `tests/http/load.test.ts`
- **Mutation testing**: `pnpm run test:mutation`
  - Config: `stryker.config.json` + `vitest.mutation.config.ts`
- **Playwright smoke**: `pnpm run test:e2e:smoke` or `pnpm exec playwright test --project=smoke`
  - Config: `playwright.config.ts`
- **Playwright visual**: `pnpm run test:e2e:visual`
  - Config: `playwright.config.ts`
- **Playwright fullstack**: `pnpm run test:e2e:fullstack`
  - Config: `playwright.fullstack.config.ts`
- **Manual real lifecycle E2E**: `./scripts/run-e2e.sh`
  - Wrapper for: `scripts/e2e-lifecycle.ts`
  - Documented in: `docs/E2E_TESTING.md`

### B. Inventory counts from repo inspection

Direct file counts collected from the repo:

- `tests/` total files: **408**
- `tests/**/*.test.ts` matched by default unit config after current excludes: **260 files**
- `tests/frontend/*.test.ts`: **28 files**
- `tests/**/*.property.test.ts`: **9 files**
- Playwright smoke spec files: **20** (`tests/e2e/specs/smoke/`)
- Playwright visual spec files: **14** (`tests/e2e/specs/visual/`)
- Visual snapshot PNGs committed: **28**
- Playwright fullstack spec files: **4** (`tests/e2e/specs/fullstack/`)
- Live integration spec files: **3** (`tests/integration/live/`)

### C. Verified suite categories and representative paths

#### 1. Unit tests
Strong backend unit presence across most subsystems, e.g.:
- `tests/orchestrator/orchestrator.test.ts`
- `tests/http/server.test.ts`
- `tests/git/manager.test.ts`
- `tests/tracker/github-adapter.test.ts`
- `tests/linear/client.test.ts`
- `tests/setup/device-auth.test.ts`
- `tests/observability/metrics.test.ts`
- `tests/workflow/loader.test.ts`

#### 2. Integration tests
Real filesystem / real HTTP / real SQLite style tests exist, e.g.:
- `tests/setup/handlers.integration.test.ts`
- `tests/http/openapi-contracts.integration.test.ts`
- `tests/http/server-branches.integration.test.ts`
- `tests/orchestrator/restart-recovery.integration.test.ts`
- `tests/workspace/manager.integration.test.ts`
- `tests/core/attempt-store.integration.test.ts`
- `tests/integration/sqlite-runtime.integration.test.ts`
- `tests/integration/config-workflow.integration.test.ts`

#### 3. Contract tests
There is explicit contract-focused testing, not just behavior tests:
- HTTP structural snapshots: `tests/http/api-contracts.test.ts`
- OpenAPI response validation via AJV against runtime spec: `tests/http/openapi-contracts.integration.test.ts`
- OpenAPI checked-in file sync: `tests/http/openapi-sync.test.ts`
- Persistence adapter contracts: `tests/persistence/attempt-store-contract.test.ts` + `tests/persistence/attempt-store-contract.ts`

#### 4. Property-based tests
Fast-check property tests exist in multiple areas:
- `tests/state/machine.property.test.ts`
- `tests/state/machine-properties.test.ts`
- `tests/config/coercion.property.test.ts`
- `tests/config/resolvers.property.test.ts`
- `tests/core/content-sanitizer.property.test.ts`
- `tests/core/model-pricing.property.test.ts`
- `tests/core/signal-detection.property.test.ts`
- `tests/orchestrator/retry-manager.property.test.ts`
- `tests/workspace/paths.property.test.ts`

#### 5. Frontend logic unit tests
Separate frontend logic suite exists under `tests/frontend/`, e.g.:
- `tests/frontend/router.test.ts`
- `tests/frontend/api.test.ts`
- `tests/frontend/page.test.ts`
- `tests/frontend/settings-tabs.test.ts`
- `tests/frontend/store.test.ts`
- `tests/frontend/templates-state.test.ts`

#### 6. Playwright smoke (mocked API, Vite dev server)
Representative specs:
- `tests/e2e/specs/smoke/overview.smoke.spec.ts`
- `tests/e2e/specs/smoke/setup-gate.spec.ts`
- `tests/e2e/specs/smoke/templates.smoke.spec.ts`
- `tests/e2e/specs/smoke/webhook-dashboard.smoke.spec.ts`
- `tests/e2e/specs/smoke/issue-runs-logs.smoke.spec.ts`
- `tests/e2e/specs/smoke/settings-unified.smoke.spec.ts`

These use POMs and mock APIs from:
- `tests/e2e/pages/`
- `tests/e2e/mocks/`
- `tests/e2e/fixtures/test.ts`

#### 7. Playwright visual regression
Representative specs:
- `tests/e2e/specs/visual/overview.visual.spec.ts`
- `tests/e2e/specs/visual/queue.visual.spec.ts`
- `tests/e2e/specs/visual/settings.visual.spec.ts`
- `tests/e2e/specs/visual/workspaces.visual.spec.ts`
- `tests/e2e/specs/visual/attempt-detail.visual.spec.ts`

Snapshots are committed under directories like:
- `tests/e2e/specs/visual/overview.visual.spec.ts-snapshots/`
- `tests/e2e/specs/visual/settings.visual.spec.ts-snapshots/`

#### 8. Playwright fullstack
Real backend + built frontend setup exists:
- Config: `playwright.fullstack.config.ts`
- Setup: `tests/e2e/setup/fullstack-server.ts`
- Specs:
  - `tests/e2e/specs/fullstack/issue-lifecycle.fullstack.spec.ts`
  - `tests/e2e/specs/fullstack/api-error-handling.fullstack.spec.ts`
  - `tests/e2e/specs/fullstack/sse-reconnect.fullstack.spec.ts`
  - `tests/e2e/specs/fullstack/webhook-to-ui.fullstack.spec.ts`

#### 9. Live-provider / credentialed integration tests
Repo contains environment-gated live tests:
- `tests/integration/live/linear-live.integration.test.ts`
- `tests/integration/live/github-live.integration.test.ts`
- `tests/integration/live/docker-live.integration.test.ts`
- guard/skip helper: `tests/integration/live.integration.test.ts`

#### 10. Load / performance tests
- `tests/http/load.test.ts` uses `autocannon`
- Validates `/api/v1/state`, `/api/v1/runtime`, `/metrics`, `/api/v1/refresh`, `/api/v1/:id`

#### 11. Mutation testing
Mutation scope is explicitly configured in `stryker.config.json`.
It targets selected backend modules such as:
- `src/config/*`
- `src/core/*`
- `src/state/*`
- `src/orchestrator/*` subset
- `src/git/*` subset
- `src/http/*` subset
- `src/persistence/sqlite/*` subset

It explicitly ignores `frontend` and several other directories.

#### 12. Quarantine / healing system
- Runtime skip hook: `tests/helpers/quarantine.ts`
- CLI manager: `scripts/quarantine.ts`
- Nightly healer: `scripts/quarantine-heal.ts`
- Current state: `quarantine.json` is empty

### D. What is actually enforced where

#### Local pre-push (`.husky/pre-push`)
Runs:
```bash
pnpm run build
pnpm test
pnpm run typecheck
pnpm run typecheck:frontend
```

#### CI on PRs/pushes (`.github/workflows/ci.yml`)
Runs:
- build
- lint + format
- `pnpm exec vitest run --reporter=verbose --coverage`
- knip
- typecheck
- Playwright smoke shards
- `pnpm run test:integration` on PRs and on `main`
- docker build smoke

#### Nightly/manual CI only
Runs:
- `pnpm exec playwright test --config playwright.fullstack.config.ts`
- `pnpm exec playwright test --project=visual`
- `pnpm run test:integration:live`
- quarantine healing

#### Present but not wired into normal gate
- `pnpm run test:frontend`
- `pnpm run test:load`
- `pnpm run test:docker`
- `./scripts/run-e2e.sh`
- `pnpm run test:mutation` as a blocking gate

---

## 4) Critical blind spots and risky low-coverage areas

### A. Frontend unit suite is real, but not part of the normal gate

**Why it matters:** there are 28 frontend unit test files under `tests/frontend/`, but neither local pre-push nor PR CI appears to run `pnpm run test:frontend`.

**Evidence:**
- `vitest.frontend.config.ts`
- `package.json` (`test:frontend`)
- `.husky/pre-push`
- `.github/workflows/ci.yml` (no `test:frontend` invocation found)

**Risk:** frontend logic regressions can slip through while backend/default suites stay green.

### B. Core agent execution path is under-covered in the checked-in coverage artifact, and one key test file is excluded by default

**High-risk files from `coverage/coverage-final.json`:**
- `src/agent-runner/agent-session.ts` — **0% statements**
- `src/agent-runner/index.ts` — **3.4% statements / 0% branches**
- `src/agent-runner/docker-session.ts` — **69% statements / 50% branches**

**Counter-evidence / nuance:** `tests/agent-runner/agent-runner.test.ts` exists and is substantial, but it is explicitly excluded from `vitest.config.ts` and `vitest.mutation.config.ts`.

**Risk:** the execution path that actually starts and drives Codex workers is not protected by the default suite at the level its importance suggests.

### C. Git post-run / PR generation path is thinly covered

Low-covered artifact entries:
- `src/git/pr-summary-generator.ts` — **12.3% statements / 4.8% branches**
- `src/orchestrator/git-post-run.ts` — **22.9% statements / 17.1% branches**

These paths affect:
- PR summary generation
- commit/push/PR creation
- auto-merge request flow

**Risk:** operator-visible delivery failures may survive the main gate even when core orchestrator logic is tested.

### D. Webhook route registration and related ingress paths remain a risk surface

Low-covered artifact entry:
- `src/http/routes/webhooks.ts` — **29.4% statements / 16.7% branches**

There are meaningful webhook tests elsewhere:
- `tests/orchestrator/restart-recovery.integration.test.ts`
- fullstack webhook flows in `tests/e2e/specs/fullstack/`

But the checked-in coverage artifact still identifies route-registration-level gaps.

**Risk:** signed ingress, limiter wiring, and registration logic are operationally important and deserve stronger default coverage confidence.

### E. Coverage reporting itself has blind spots

15 source files are absent from `coverage/coverage-final.json` altogether:
- `src/audit/api.ts`
- `src/cli/index.ts`
- `src/cli/runtime-providers.ts`
- `src/core/types.ts`
- `src/dispatch/entrypoint.ts`
- `src/dispatch/server.ts`
- `src/dispatch/types.ts`
- `src/observability/health.ts`
- `src/observability/hub.ts`
- `src/observability/snapshot.ts`
- `src/orchestrator/context.ts`
- `src/orchestrator/runtime-types.ts`
- `src/prompt/api.ts`
- `src/setup/device-auth.ts`
- `src/state/defaults.ts`

Some are intentionally excluded from coverage accounting in `vitest.config.ts`, but some are simply absent from the current artifact. Since tests exist for some related areas (for example `tests/setup/device-auth.test.ts`, `tests/observability/hub.test.ts`), the checked-in coverage artifact is **not a reliable complete map of current execution**.

**Risk:** decision-making based only on the checked-in coverage artifact would misstate actual protected/unprotected areas.

### F. Nightly/manual suites hold real value but are not protecting PRs

The following are useful but not part of ordinary PR gating:
- Playwright visual regression
- Playwright fullstack
- live-provider smoke
- mutation testing
- manual real lifecycle `./scripts/run-e2e.sh`
- load tests

**Risk:** regressions in rendering, browser+backend coupling, live credentials, mutation resistance, and system throughput can land unless someone explicitly runs those suites or waits for nightlies.

### G. Repo test metadata/docs are stale enough to mislead planning

Because counts and paths in `AGENTS.md`, `tests/AGENTS.md`, and `README.md` are outdated, anyone relying on those summaries will misjudge:
- which suites exist
- how many smoke/visual specs exist
- what file paths to use for live tests
- which thresholds actually apply

**Risk:** engineering planning, agent prompts, and review expectations can be based on false assumptions.

---

## 5) Discrepancies versus the pasted LLM summaries

No pasted external summaries were included in this task payload. The repo **does** contain summary-style claims that an LLM would likely repeat, and several are now false or at least not repo-verifiable.

### A. `AGENTS.md` smoke/visual counts are stale

`AGENTS.md` claims:
- smoke: **“114 tests across 16 spec files”**
- visual: **“4 visual specs with 4 baselines”**

Current repo reality from file inspection:
- smoke spec files present: **20** under `tests/e2e/specs/smoke/`
- visual spec files present: **14** under `tests/e2e/specs/visual/`
- visual snapshot PNGs committed: **28**

**Verdict:** **Falsified / stale**.

### B. `AGENTS.md` references a live-test path that does not exist

`AGENTS.md` says:
- “Reserve `tests/live.integration.test.ts` for environment-dependent checks”

Current repo reality:
- `tests/live.integration.test.ts` does **not** exist
- live-related files are:
  - `tests/integration/live.integration.test.ts`
  - `tests/integration/live/linear-live.integration.test.ts`
  - `tests/integration/live/github-live.integration.test.ts`
  - `tests/integration/live/docker-live.integration.test.ts`

**Verdict:** **Falsified**.

### C. `tests/AGENTS.md` command/count/threshold summaries are stale

`tests/AGENTS.md` claims:
- `npm test` unit tests only (**783 tests**)
- smoke: **37 tests**
- visual: **3 baselines**
- coverage thresholds: **60 statements/lines, 50 branches, 55 functions**

Current repo reality:
- package manager/scripts are `pnpm`, not primarily `npm`
- `vitest.config.ts` thresholds are **82 statements / 73 branches / 82 functions / 82 lines**
- smoke/visual file inventory is materially larger than documented there

**Verdict:** **Falsified / stale**.

### D. `README.md` badge claim `tests-2904 passing` is not repo-verifiable by inspection

`README.md` advertises:
- `tests-2904 passing`

Repo-grounded audit result:
- the repo clearly has many tests, but this exact pass count is **not verifiable from file inspection alone**
- no current machine-readable summary in the repo proves that exact number
- local artifact directories (`playwright-report/`, `test-results/`, `coverage/`) exist, but they do not establish the README badge value as current truth

**Verdict:** **Unverified / likely stale until re-measured**.

### E. If an LLM summary said “frontend tests are part of the normal test gate,” that would be false

Repo evidence says:
- `tests/frontend/*.test.ts` exist
- `pnpm run test:frontend` exists
- but no default local/PR gate invokes it

**Verdict:** **Falsified**.

### F. If an LLM summary said “all important tests run under `pnpm test`,” that would be false

Excluded or separate suites include:
- `tests/agent-runner/agent-runner.test.ts`
- `tests/http/load.test.ts`
- `tests/frontend/*.test.ts`
- Playwright smoke/visual/fullstack
- live integration
- mutation
- manual lifecycle E2E

**Verdict:** **Falsified**.

### G. If an LLM summary said “visual/fullstack regression is part of PR CI,” that would be false

Repo evidence:
- `.github/workflows/ci.yml` runs visual/fullstack only on `schedule` or `workflow_dispatch`

**Verdict:** **Falsified**.

---

## 6) Recommended immediate repo-specific priorities

These are intentionally repo-specific and based only on repository evidence.

### Priority 1 — Put frontend unit tests into an enforced path

**Reason:** `tests/frontend/*.test.ts` is a meaningful suite that is currently separate from both pre-push and PR CI.

**Minimum concrete action:**
- add `pnpm run test:frontend` to either:
  - `.husky/pre-push`, or
  - `.github/workflows/ci.yml` PR jobs, or
  - both

**Why now:** this is the cleanest “existing tests, not enforced” gap in the repo.

### Priority 2 — Stop excluding `tests/agent-runner/agent-runner.test.ts` from the default quality story, or explicitly replace it

**Reason:** the most operationally critical backend surface has the worst checked-in coverage numbers:
- `src/agent-runner/index.ts` 3.4%
- `src/agent-runner/agent-session.ts` 0%

Yet a substantial test file already exists:
- `tests/agent-runner/agent-runner.test.ts`

**Minimum concrete action:**
- either include this test in a regularly enforced suite, or
- split/stabilize it into smaller default-safe tests and make that explicit

### Priority 3 — Make coverage reporting trustworthy for current code

**Reason:** the checked-in coverage artifact omits 15 source files and underreports/obscures some currently tested areas.

**Minimum concrete action:**
- regenerate coverage from the current default suite and stop treating the committed artifact as canonical unless it is refreshed automatically
- explicitly distinguish:
  - files intentionally excluded from coverage accounting
  - files untested
  - files tested outside the default coverage job

### Priority 4 — Strengthen default coverage around git post-run and webhook ingress

**Reason:** low-covered operational files include:
- `src/orchestrator/git-post-run.ts`
- `src/git/pr-summary-generator.ts`
- `src/http/routes/webhooks.ts`

These affect:
- PR creation/summarization
- auto-merge requests
- webhook ingress registration

**Minimum concrete action:**
- add/expand tests that exercise these through the default or integration suite already used by PR CI

### Priority 5 — Refresh stale testing documentation so agents and humans stop repeating false counts

**Files to update first:**
- `AGENTS.md`
- `tests/AGENTS.md`
- `README.md`

**What to fix:**
- smoke spec counts
- visual spec/baseline counts
- live-test file paths
- current enforced-vs-optional suite boundaries
- coverage threshold statements

### Priority 6 — Decide which manual/nightly suites should become PR-relevant for changed surfaces

This repo already has working suites for:
- visual regression
- fullstack E2E
- live integration
- load
- mutation
- manual lifecycle E2E

**Minimum concrete action:** define which changed files should trigger which suite, instead of leaving them mostly nightly/manual.

### Priority 7 — Fix CI/test workflow inconsistencies while touching the test pipeline

Repo inconsistency observed:
- `.github/workflows/ci.yml` release and docker-push jobs reference `needs: [build-and-test, integration]`, but the visible workflow defines separate `build`, `test`, etc., not a `build-and-test` job.

**Reason to care here:** stale workflow wiring undermines confidence in repo-level testing claims.

---

## Useful command references

```bash
# Default backend/unit path
pnpm test

# Integration path used in CI
pnpm run test:integration

# Frontend logic tests (currently separate)
pnpm run test:frontend

# Smoke UI tests used in CI
pnpm run test:e2e:smoke

# Visual regression (nightly/manual CI)
pnpm run test:e2e:visual

# Real backend + built frontend browser tests (nightly/manual CI)
pnpm run test:e2e:fullstack

# Live provider smoke (nightly/manual CI)
pnpm run test:integration:live

# Manual load test
pnpm run test:load

# Mutation test
pnpm run test:mutation

# Real lifecycle end-to-end script
./scripts/run-e2e.sh
```

## Bottom line

The repo’s **actual testing surface is broad and serious**, but the **enforced surface is materially narrower than the inventory suggests**. The most immediate repo-grounded improvements are to **wire the existing frontend suite into the gate, stop sidelining the agent-runner path, refresh stale test docs, and make current coverage reporting trustworthy enough to drive decisions**.
