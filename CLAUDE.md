# Risoluto — Working Contract

This file is the default contract for any AI agent working in this repo. It assumes strict TypeScript, ESM with `NodeNext` resolution, pnpm, Node 22+.

## Four Principles

Every change made here should pass all four. If a rule below seems to conflict with one of these, the principle wins.

### 1. Think Before Coding

Read the code that already exists before adding new code. Search for the function, port, store, or client that probably already does what you need — this repo has a lot of well-factored seams (see Architecture). If you can't describe the change in one sentence of plain English, you don't understand it yet. For anything non-trivial, plan first (see `.agents/PLANS.md` for ExecPlan format); for simple fixes, at least name the root cause before editing.

### 2. Simplicity First

Prefer the smallest change that solves the stated problem. Reuse `TrackerPort` instead of threading `LinearClient` through new code. Add a case to an existing switch instead of introducing a new abstraction. Three similar lines beat a premature helper. No speculative generality, no placeholder hooks for imagined future needs, no half-implementations.

### 3. Surgical Changes

Touch only what the task requires. A bug fix is not a refactor; a refactor is not a rewrite. Don't reorganize imports, rename unrelated variables, or "while-I'm-here" cleanups in the same diff — they blow up review cost and hide the real change. One logical change per commit. If you discover unrelated drift, note it and raise it separately.

### 4. Goal-Driven Execution

Validate against the real user-visible outcome, not the task description. A green test suite is not proof the feature works — for UI changes, that means `/visual-verify` in the browser; for orchestrator changes, that means confirming the event actually reaches the dashboard; for Linear integration changes, that means the round-trip comment/state-transition lands. If you can't verify end-to-end, say so explicitly instead of claiming success.

## Architecture at a Glance

| Area | Entry files |
|------|-------------|
| Process entry & wiring | `src/cli/index.ts`, `src/cli/services.ts` |
| Orchestrator (poll, retry, state) | `src/orchestrator/orchestrator.ts`, `src/orchestrator/worker-launcher.ts`, `src/orchestrator/worker-outcome/*` |
| Agent session (Docker + turn loop) | `src/agent-runner/index.ts`, `docker-session.ts`, `turn-executor.ts` |
| JSON-RPC wire layer to Codex | `src/agent/json-rpc-connection.ts`, `src/agent/codex-request-handler.ts` |
| HTTP + SSE + dashboard API | `src/http/server.ts`, `routes.ts`, `sse.ts` |
| Persistence (SQLite) | `src/persistence/sqlite/*`, `src/core/attempt-store.ts` |
| Tracker abstraction (Linear ⇆ GitHub Issues) | `src/tracker/port.ts`, `linear-adapter.ts`, `github-adapter.ts`, `factory.ts` |
| Transport clients | `src/linear/client.ts`, `src/github/issues-client.ts`, `src/git/github-pr-client.ts` |
| Workspaces, Git, Docker | `src/workspace/manager.ts`, `src/git/*`, `src/docker/spawn.ts` |
| Control/data plane split | `src/dispatch/*` (enabled with `DISPATCH_MODE=remote`) |
| Frontend SPA (vanilla Web Components) | `frontend/src/main.ts`, `frontend/src/router.ts`, `frontend/src/pages/*`, `frontend/src/components/*` |

**Data flow:** tracker poll (or webhook) → `Orchestrator.tick()` → `worker-launcher` filters + claims → `WorkspaceManager.prepareForAttempt` → `AttemptStore.createAttempt` → dispatcher (local `AgentRunner` or remote HTTP) → `docker-session` boots Codex in container → `JsonRpcConnection` drives turn loop → `completion-writeback` posts comment and transitions issue state → events stream through `TypedEventBus` → SSE fans out to dashboard clients.

**Non-obvious things to know before editing:**

- `src/agent/` and `src/agent-runner/` are **different directories**. `agent/` is the JSON-RPC wire protocol; `agent-runner/` is the session lifecycle. Don't conflate them.
- Stop signals are string literals (`RISOLUTO_STATUS: DONE`, `RISOLUTO_STATUS: BLOCKED`) scanned out of agent output by `src/core/signal-detection.ts`. They are not JSON-RPC signals.
- Polling interval is gated by webhook health — see `getEffectivePollingInterval()` in `orchestrator.ts`. A broken webhook silently changes the polling rate.
- Codex config rewrites localhost URLs to `host.docker.internal` so the container can reach the host (`src/codex/runtime-config.ts`).
- `DirtyTrackingMap` / `DirtyTrackingSet` in `orchestrator.ts` invalidate the snapshot cache on mutation. Any new collection on `OrchestratorState` must be wrapped, or SSE fan-out will go stale.
- The orchestrator talks to trackers **only through `TrackerPort`**, never directly to `LinearClient`. New tracker features should extend the port, not reach around it.
- The UI is a vanilla Web Components SPA — no React, no JSX, no virtual DOM. State lives in `frontend/src/state/store.ts`; events are dispatched as `CustomEvent` on `globalThis`.

## Commands You'll Use

```bash
# Runtime
pnpm run dev -- --port 4000          # tsx watch on src/cli/index.ts
node dist/cli/index.js --port 4000   # built service
pnpm run dev:frontend                # Vite dev server (proxies /api to :4000)

# Build
pnpm run build                       # tsc + vite build (frontend → dist/frontend)

# Tests
pnpm test                            # Vitest unit suite (default)
pnpm run test:watch
pnpm run test:integration            # opt-in; set LINEAR_API_KEY for live coverage
pnpm run test:frontend               # frontend unit tests
pnpm exec playwright test --project=smoke     # E2E smoke (mocked API)
pnpm exec playwright test --project=visual    # visual regression
pnpm exec playwright test --project=visual --update-snapshots   # regen baselines
pnpm run test:mutation:incremental   # Stryker (opt-in / nightly)
./scripts/run-e2e.sh                 # full lifecycle against real Linear+GitHub

# Quality
pnpm run lint | lint:fix
pnpm run format | format:check
pnpm run typecheck | typecheck:frontend | typecheck:coverage
pnpm run knip                        # dead-code / unused-export analysis
```

## Quality Gates — Never Bypass

Git hooks and CI mirror each other. Never `--no-verify`. Never `SKIP_HOOKS=1` to "get unstuck" — diagnose the failure.

| Hook | What runs |
|------|-----------|
| `pre-commit` | `lint-staged`: ESLint fix + Prettier on staged `*.ts` |
| `commit-msg` | `commitlint` — conventional commits, enforced scope enum |
| `pre-push` (default) | `build` + `test` + `typecheck` + `typecheck:frontend` |
| `pre-push` (`FULL_CHECK=1`) | Adds `lint`, `format:check`, `knip`, Playwright smoke, semgrep, `typecheck:coverage` |
| `post-merge` | Auto-runs Prettier to absorb GitHub-side formatting drift |

**Minimum before every commit:**

```bash
pnpm run build && pnpm run lint && pnpm run format:check && pnpm test && pnpm run typecheck
```

**Allowed commit scopes** (enforced by `commitlint`):
`orchestrator`, `http`, `cli`, `core`, `workspace`, `linear`, `git`, `docker`, `config`, `persistence`, `dashboard`, `setup`, `secrets`, `agent`, `ci`, `frontend`, `e2e`, `deps`, `release`.

## Coding Rules

Style: 2-space indent, double quotes, semicolons, `const` by default, `PascalCase` for types/classes, `camelCase` for everything else, test files named `*.test.ts`. Local imports keep the `.js` extension (NodeNext ESM): `import { Orchestrator } from "./orchestrator.js";`.

Recurring fixes — write the good form first time:

- `arr.replaceAll(/re/g, …)` — never `.replace()` with the `/g` flag.
- Batch `Array#push()` into one call with multiple args.
- Never union `unknown` with other types; `unknown | null` is just `unknown`.
- Drop redundant `as` casts when TS already infers correctly.
- `throw new TypeError(...)` for type/validation violations; plain `Error` otherwise.
- Guard against `[object Object]` in template literals — `typeof` check, `String()`, or `JSON.stringify()`.
- `\w` over `[A-Za-z0-9_]`; audit regex character classes for duplication with shorthands.
- `arr.at(-1)` over `arr[arr.length - 1]`.
- Name the catch binding `error`, or `error_` when it shadows an outer `error`.
- Test positive conditions first: `if (x === undefined)` over `if (x !== undefined) { ... } else { ... }`.
- Use top-level `await` in ESM entry points: `process.exitCode = await main()`.
- When you mark a type `@deprecated`, migrate all call sites in the same PR.
- Never write `TODO` (linter catches it case-insensitively). Use `"Triage"` or rephrase.

## Testing Contract

- Every behavior change ships with Vitest coverage. Prefer deterministic unit tests with fixtures in `tests/fixtures/` over live services.
- `tests/live.integration.test.ts` is reserved for credential-dependent checks; it must skip cleanly when secrets are absent.
- **UI changes are not done until `/visual-verify` runs.** Trigger after any edit under `frontend/src/**` or any backend file that changes HTML / API responses rendered by the UI. Part of DoD, not optional.
- Dashboard changes also need Playwright E2E coverage: POMs in `tests/e2e/pages/` (extend `BasePage`), mocks via `ApiMock` + `ScenarioBuilder` in `tests/e2e/mocks/`, fixtures in `tests/e2e/fixtures/test.ts`. Use `freezeClock(page)` before visual tests for deterministic timestamps.
- Visual snapshot regeneration is explicit (`--update-snapshots`) — never auto-accept diffs.

## Docs to Keep Truthful

| File | Purpose |
|------|---------|
| `README.md` | What Risoluto is, what ships today, quickstart |
| `docs/OPERATOR_GUIDE.md` | Setup, runtime behavior, common ops |
| `docs/ROADMAP_AND_STATUS.md` | Issue-linked feature roadmap |
| `docs/CONFORMANCE_AUDIT.md` | Shipped capabilities vs. spec vs. verified gaps |
| `docs/RELEASING.md` | Release checklist |
| `docs/TRUST_AND_AUTH.md` | Trust boundaries, auth posture |
| `EXECPLAN.md` | Implementation log — factual, never aspirational |

Changes to auth, trust, workflow examples, or sandbox behavior must update `docs/TRUST_AND_AUTH.md` (and any affected operator docs) in the same PR.

## Security & Config

Keep secrets out of committed workflow files — prefer env expansion like `$LINEAR_API_KEY`. The data plane uses base64-encoded auth material inside `PrecomputedRuntimeConfig` so the remote process doesn't need disk-side credentials; don't log that payload.

## Watch Mode

When the user says **"watch mode"**, call `agentation_watch_annotations` in a loop. For each annotation: acknowledge → make the fix → resolve with a summary. Continue until the user says stop or the timeout is reached.

## Planning Complex Work

Non-trivial features or significant refactors go through an ExecPlan per `.agents/PLANS.md` — design, then implementation. Apply the four principles to the plan itself: small, surgical, goal-driven, and thought through before any code is written.
