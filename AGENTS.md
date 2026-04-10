# Risoluto

## Project Structure & Module Organization

Core source lives in `src/`. Start with `src/cli/index.ts` for process startup and archive directory setup, `src/orchestrator/orchestrator.ts` for polling, retries, runtime state, and model overrides, and `src/agent-runner/index.ts` for Codex worker execution. HTTP and dashboard behavior live in `src/http/server.ts` and `src/http/routes.ts`. Archived run persistence lives in `src/core/attempt-store.ts`, workspace lifecycle in `src/workspace/manager.ts`, and Linear transport in `src/linear/client.ts`.

Tests live in `tests/` and use fixture data from `tests/fixtures/`. Built artifacts are emitted to `dist/`; treat that directory as generated output, not hand-edited source. Runtime docs and operator guidance live in `README.md`, `docs/OPERATOR_GUIDE.md`, `docs/ROADMAP_AND_STATUS.md`, `docs/CONFORMANCE_AUDIT.md`, `docs/reference/RELEASING.md`, and `docs/TRUST_AND_AUTH.md`.

## Build, Test, and Development Commands

Use Node.js 22 or newer.

- `pnpm run build` compiles TypeScript from `src/` into `dist/`.
- `pnpm test` runs the main Vitest suite.
- `pnpm run test:watch` starts Vitest in watch mode for local iteration.
- `pnpm run test:integration` runs the opt-in integration config; set `LINEAR_API_KEY` first when you want real credential coverage.
- `pnpm exec playwright test --project=smoke` runs the Playwright E2E smoke tests (21 spec files) against a Vite dev server with mocked API routes.
- `pnpm exec playwright test --project=visual` runs visual regression tests (4 visual specs with 4 baselines). Use `--update-snapshots` to regenerate reference screenshots.
- `pnpm run dev` runs the CLI directly through `tsx`.
- `node dist/cli/index.js --port 4000` runs the built service.
- `./scripts/run-e2e.sh` runs the full E2E lifecycle test against real Linear + GitHub APIs (requires credentials + Docker). See `docs/guides/E2E_TESTING.md` for config and usage.

## Pre-commit & Pre-push Checks — MANDATORY

Git hooks enforce local quality gates. Lint and format are caught at commit time; build, test, and typecheck are caught at push time. Heavy checks (knip, jscpd, playwright) run only in CI.

### Pre-commit (`.husky/pre-commit`)

Runs `pnpm exec lint-staged` on staged files — applies ESLint auto-fix and Prettier formatting to staged `*.ts` files automatically.

### Pre-push (`.husky/pre-push`)

Runs a fast 80/20 gate (~60s) that catches the issues most likely to waste CI minutes:

1. `pnpm run build` — TypeScript compilation
2. `pnpm test` — Vitest test suite
3. `pnpm run typecheck` + `pnpm run typecheck:frontend` — type checking

Lint, format, knip, jscpd, and playwright are handled by pre-commit hooks, Claude `PostToolUse` hooks, or CI (where they run in parallel on clean containers).

**Escape hatches:**
- `SKIP_HOOKS=1 git push` — skip all checks (emergency only)
- `FULL_CHECK=1 git push` — run the full CI-mirror suite locally

If any step fails, the push is aborted.

### Agent Verification Checklist

**Before every commit**, agents MUST run at minimum:

```bash
pnpm run build && pnpm run lint && pnpm run format:check && pnpm test
```

If formatting issues are found, fix them with `pnpm run format` before committing. Do not commit code that has not passed all four checks. The pre-push hook catches build+test+typecheck, but agents should also run lint and format:check early at commit time to avoid wasted cycles.

## Coding Style & Naming Conventions

This repo uses strict ESM TypeScript with `moduleResolution: "NodeNext"`. Follow the existing style: 2-space indentation, double quotes, semicolons, `const` by default, and small focused modules. Use `PascalCase` for classes, `camelCase` for functions and variables, and keep test files named `*.test.ts`.

Match the current import pattern by using `.js` extensions in local TypeScript imports, for example `import { Orchestrator } from "./orchestrator.js";`.

## Testing Guidelines

Add or update Vitest coverage for every behavior change. Prefer deterministic unit tests in `tests/*.test.ts`; use fixtures in `tests/fixtures/` instead of live services where possible. Reserve `tests/live.integration.test.ts` for environment-dependent checks that should skip cleanly when credentials are absent.

**MANDATORY after UI changes:** You MUST invoke `/visual-verify` after editing `dashboard-template.ts`, `logs-template.ts`, any CSS, or any file that affects the Risoluto web UI. Visual verification is part of the definition of done for UI work — do not mark a UI task complete without it.

### Playwright E2E Tests

Dashboard UI changes must be validated with the Playwright E2E suite in `tests/e2e/`. The suite uses Page Object Models in `tests/e2e/pages/`, a full mock API layer in `tests/e2e/mocks/`, and custom fixtures in `tests/e2e/fixtures/test.ts`. Key conventions:

- **Page Object Models**: One POM per page/component in `tests/e2e/pages/`. All extend `BasePage` for shared helpers.
- **Mock API**: `ApiMock` intercepts all `/api/v1/*` routes. Use `ScenarioBuilder` for fluent test setup. Add data factories in `tests/e2e/mocks/data/`.
- **Smoke tests**: `tests/e2e/specs/smoke/*.smoke.spec.ts` — deterministic, no real backend. Run with `--project=smoke`.
- **Visual tests**: `tests/e2e/specs/visual/*.visual.spec.ts` — screenshot comparison. Run with `--project=visual`. Use `--update-snapshots` to regenerate baselines.
- **Clock freezing**: Use `freezeClock(page)` from `tests/e2e/support/clock.ts` before visual tests for deterministic timestamps.
- **Unhandled API guard**: `installUnhandledApiGuard(page)` aborts any unmocked API calls — installed automatically by the fixture.

When behavior changes affect the operator surface, verify both code and docs together. At minimum, keep `README.md` and the relevant `docs/*.md` files aligned with the actual API, trust posture, and runtime behavior.


## Documentation Expectations

Keep the doc set role-oriented:

- `README.md` explains what Risoluto is, what ships now, and how to get started.
- `docs/OPERATOR_GUIDE.md` covers setup, runtime behavior, and common operating tasks.
- `docs/ROADMAP_AND_STATUS.md` is the issue-linked feature roadmap with all planned work across 4 tiers.
- `docs/CONFORMANCE_AUDIT.md` records shipped capabilities, spec conformance, and verified remaining gaps.
- `docs/reference/RELEASING.md` captures the release checklist.
- `docs/TRUST_AND_AUTH.md` documents trust boundaries and auth expectations.

## Security & Configuration Tips

Keep secrets out of committed config files; prefer env expansion such as `$LINEAR_API_KEY`. When changing auth, trust, or sandbox behavior, update `docs/TRUST_AND_AUTH.md` and any affected operator docs in the same PR.

## Watch Mode

When I say "watch mode", call agentation_watch_annotations in a loop.
For each annotation: acknowledge it, make the fix, then resolve it with a summary.
Continue watching until I say stop or timeout is reached.

When writing complex features or significant refactors, use an ExecPlan (as described in .agents/PLANS.md) from design to implementation.
