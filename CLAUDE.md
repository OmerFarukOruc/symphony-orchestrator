# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Code Search — MANDATORY

**ALWAYS use `mcp__cocoindex-code__search` as your FIRST tool when exploring or understanding code.** Do NOT default to Read or grep for code exploration. The semantic search MCP tool finds code by meaning, not just text — it is faster, cheaper, and more accurate for navigating this codebase.

- **First choice → `mcp__cocoindex-code__search`**: For ANY query about how something works, where code lives, finding implementations, understanding features, or locating related code. Use natural language: _"authentication logic"_, _"retry handling"_, _"HTTP route definitions"_.
- **Fallback → grep/rg**: ONLY for exact string matches (specific function names, variable names, import paths, error message strings).
- **Last resort → Read**: ONLY after search/grep has identified the specific file and line range you need.

```
search(query, limit=5, offset=0, refresh_index=true, languages=["typescript"], paths=["src/*"])
```

---

## Architecture Overview

Symphony is an autonomous coding workflow engine. Understanding these layers is essential:

### Execution Pipeline

```
CLI (src/cli/index.ts)
  └─ Orchestrator (src/orchestrator/) — state machine; polling, retries, model selection
        └─ AgentRunner (src/agent-runner/) — per-attempt Docker + turn execution
              └─ Docker session (src/docker/) — container lifecycle, stats
```

- **Orchestrator** is a thin coordinator that delegates to extracted modules: `lifecycle.ts` (state reconciliation), `worker-launcher.ts` (spawning), `watchdog.ts` (timeout), `model-selection.ts`, `snapshot-builder.ts`.
- **AgentRunner** uses `executeTurns` (in `turn-executor.ts`), `initializeSession`, and `docker-session.ts`. It templates prompts via liquidjs and emits lifecycle events to the orchestrator.

### HTTP Layer

`src/http/server.ts` — Fastify 5 with `@fastify/static`, `@fastify/rate-limit`, SSE heartbeats (5 s interval), and Prometheus metrics middleware. Routes live in `src/http/routes.ts`; OpenAPI spec is auto-generated in `src/http/openapi.ts`. A feature-flagged dual-server mode (`FEATURE_FLAG_DUAL_SERVER` in `src/core/feature-flags.ts`) wraps a legacy Express layer alongside Fastify.

### Persistence

`src/db/` — SQLite via Drizzle ORM (`better-sqlite3`). Schema in `src/db/schema.ts`. Three stores: `attempt-store-sqlite.ts`, `config-store-sqlite.ts`, `secrets-store-sqlite.ts`. The public interface (`src/core/attempt-store.ts`) is consumed by the orchestrator; never import the sqlite module directly from outside `src/db/` or `src/persistence/`.

### Shared Package

`packages/shared/src/` is a TypeScript workspace package aliased as `@symphony/shared`. It exports the shared contracts (`contracts.ts`), Zod/TypeBox schemas (`schemas/`), and the `SecretBackend` interface. When changing its exports, rebuild with `pnpm build` — the alias is resolved via `tsconfig.json` paths during development and compiled to `dist/packages/shared/` for production.

### Frontend

`frontend/` — React 19 + TanStack Query v5 + React Router v7, bundled with Vite. Run with `pnpm dev:frontend`. The frontend speaks to the Fastify backend over `GET /api/v1/*`. E2E tests mock these routes via `tests/e2e/mocks/`.

### Observability

Structured logging via pino (`src/core/logger.ts`). Prometheus metrics exposed at `/metrics` via prom-client (`src/observability/prom-client-metrics.ts`). Request tracing with correlation IDs via `src/observability/tracing.ts`.

### Feature Flags

`src/core/feature-flags.ts` — runtime flags loaded from env/config, used to gate in-progress migrations (e.g., the dual-server, secret-store backend). Check `isEnabled(FLAG)` before conditional code paths.

---

## Project Structure & Module Organization

Core source lives in `src/`. Start with `src/cli/index.ts` for process startup and archive directory setup, `src/orchestrator/orchestrator.ts` for polling, retries, runtime state, and model overrides, and `src/agent-runner/index.ts` for Codex worker execution. HTTP and dashboard behavior live in `src/http/server.ts` and `src/http/routes.ts`. Archived run persistence lives in `src/core/attempt-store.ts`, workspace lifecycle in `src/workspace/manager.ts`, and Linear transport in `src/linear/client.ts`.

Tests live in `tests/` and use fixture data from `tests/fixtures/`. Built artifacts are emitted to `dist/`; treat that directory as generated output, not hand-edited source. Runtime docs and operator guidance live in `README.md`, `WORKFLOW.example.md`, `WORKFLOW.md`, `docs/OPERATOR_GUIDE.md`, `docs/ROADMAP_AND_STATUS.md`, `docs/CONFORMANCE_AUDIT.md`, `docs/RELEASING.md`, and `docs/TRUST_AND_AUTH.md`. `EXECPLAN.md` is the implementation log and should stay factual when behavior changes.

---

## Build, Test, and Development Commands

Use Node.js 24 or newer.

- `pnpm build` — compiles TypeScript from `src/` and `packages/shared/` into `dist/`.
- `pnpm dev -- ./WORKFLOW.example.md` — run the CLI directly through `tsx`.
- `pnpm dev:frontend` — start the Vite frontend dev server.
- `node dist/cli/index.js ./WORKFLOW.example.md --port 4000` — run the built service.
- `pnpm test` — runs the main Vitest suite.
- `pnpm test:watch` — starts Vitest in watch mode for local iteration.
- `pnpm test -- tests/path/to/specific.test.ts` — run a single test file.
- `pnpm test:integration` — opt-in integration config; set `LINEAR_API_KEY` first when you want real credential coverage.
- `pnpm exec playwright test --project=smoke` — runs the Playwright E2E smoke tests (37 tests) against a Vite dev server with mocked API routes.
- `pnpm exec playwright test --project=visual` — runs visual regression tests (3 baselines). Use `--update-snapshots` to regenerate reference screenshots.
- `pnpm lint` — ESLint check. `pnpm lint:fix` — auto-fix ESLint issues.
- `pnpm format` — apply Prettier formatting. `pnpm format:check` — verify without writing.
- `pnpm knip` — dead code / unused export analysis.

---

## Pre-commit & Pre-push Checks — MANDATORY

Git hooks enforce local quality gates that mirror CI. **Never bypass them with `--no-verify`.**

### Pre-commit (`.husky/pre-commit`)

Runs `pnpm exec lint-staged` on staged files — applies ESLint auto-fix and Prettier formatting to staged `*.ts` files automatically.

### Pre-push (`.husky/pre-push`)

Runs the full CI-mirror gate before any push is allowed:

1. `pnpm build` — TypeScript compilation
2. `pnpm lint` — ESLint checks
3. `pnpm format:check` — Prettier formatting verification
4. `pnpm test` — Vitest test suite
5. `pnpm knip` — dead code / unused export analysis

If any step fails, the push is aborted.

### Agent Verification Checklist

**Before every commit**, agents MUST run at minimum:

```bash
pnpm build && pnpm lint && pnpm format:check && pnpm test
```

If formatting issues are found, fix them with `pnpm format` before committing.

---

## Coding Style & Naming Conventions

This repo uses strict ESM TypeScript with `moduleResolution: "NodeNext"`. Follow the existing style: 2-space indentation, double quotes, semicolons, `const` by default, and small focused modules. Use `PascalCase` for classes, `camelCase` for functions and variables, and keep test files named `*.test.ts`.

Match the current import pattern by using `.js` extensions in local TypeScript imports, for example `import { Orchestrator } from "./orchestrator.js";`.

---

## Testing Guidelines

Add or update Vitest coverage for every behavior change. Prefer deterministic unit tests in `tests/*.test.ts`; use fixtures in `tests/fixtures/` instead of live services where possible. Reserve `tests/live.integration.test.ts` for environment-dependent checks that should skip cleanly when credentials are absent.

### Playwright E2E Tests

Dashboard UI changes must be validated with the Playwright E2E suite in `tests/e2e/`. The suite uses Page Object Models in `tests/e2e/pages/`, a full mock API layer in `tests/e2e/mocks/`, and custom fixtures in `tests/e2e/fixtures/test.ts`. Key conventions:

- **Page Object Models**: One POM per page/component in `tests/e2e/pages/`. All extend `BasePage` for shared helpers.
- **Mock API**: `ApiMock` intercepts all `/api/v1/*` routes. Use `ScenarioBuilder` for fluent test setup. Add data factories in `tests/e2e/mocks/data/`.
- **Smoke tests**: `tests/e2e/specs/smoke/*.smoke.spec.ts` — deterministic, no real backend. Run with `--project=smoke`.
- **Visual tests**: `tests/e2e/specs/visual/*.visual.spec.ts` — screenshot comparison. Run with `--project=visual`. Use `--update-snapshots` to regenerate baselines.
- **Clock freezing**: Use `freezeClock(page)` from `tests/e2e/support/clock.ts` before visual tests for deterministic timestamps.
- **Unhandled API guard**: `installUnhandledApiGuard(page)` aborts any unmocked API calls — installed automatically by the fixture.

When behavior changes affect the operator surface, verify both code and docs together. At minimum, keep `README.md`, workflow examples, and the relevant `docs/*.md` files aligned with the actual API, trust posture, and runtime behavior.

---

## Documentation Expectations

Keep the doc set role-oriented:

- `README.md` explains what Symphony is, what ships now, and how to get started.
- `docs/OPERATOR_GUIDE.md` covers setup, runtime behavior, and common operating tasks.
- `docs/ROADMAP_AND_STATUS.md` is the issue-linked feature roadmap with all planned work across 4 tiers.
- `docs/CONFORMANCE_AUDIT.md` records shipped capabilities, spec conformance, and verified remaining gaps.
- `docs/RELEASING.md` captures the release checklist.
- `docs/TRUST_AND_AUTH.md` documents trust boundaries and auth expectations.
- `EXECPLAN.md` remains the implementation log and should not drift into stale roadmap claims.

---

## Security & Configuration Tips

Keep secrets out of committed workflow files; prefer env expansion such as `$LINEAR_API_KEY`. When changing auth, trust, workflow examples, or sandbox behavior, update `docs/TRUST_AND_AUTH.md` and any affected operator docs in the same PR.

---

## Browser Automation

Use `agent-browser` for web automation. See `skills/visual-verify/SKILL.md` for the full visual-verify workflow.

**When to use:** After editing `dashboard-template.ts`, `logs-template.ts`, or any file that affects the Symphony web UI. Also use when asked to "dogfood", "QA", "visual check", or "screenshot" the dashboard.

**Chrome:** `agent-browser` uses its own bundled Chrome (installed via `agent-browser install`). No custom browser path needed.

For general web browsing and QA, use the `/browse` skill from gstack (see global `~/.claude/CLAUDE.md`).

---

## Semantic Code Search (CocoIndex)

This project is indexed with [cocoindex-code](https://github.com/cocoindex-io/cocoindex-code) using the `nomic-ai/CodeRankEmbed` embedding model (137M params, ~1 GB VRAM, GPU-accelerated, 8192-token context). An MCP server (`ccc mcp`) exposes a `search` tool for semantic code search.

**Re-indexing:** If files have been added or changed significantly, the index auto-refreshes on search. To manually rebuild: `ccc reset && ccc index` from the project root.

---

## Additional Rules

Code quality and modularity rules live in `.claude/rules/` and are loaded automatically:

- `.claude/rules/sonarcloud.md` — SonarCloud prevention rules for string manipulation, type safety, regex, naming, and deprecation.
- `.claude/rules/modularity.md` — File/function size limits, extraction patterns, and module directory structure.

---

## Watch Mode

When I say "watch mode", call agentation_watch_annotations in a loop.
For each annotation: acknowledge it, make the fix, then resolve it with a summary.
Continue watching until I say stop or timeout is reached.

When writing complex features or significant refactors, use an ExecPlan (as described in `.agents/PLANS.md`) from design to implementation.
