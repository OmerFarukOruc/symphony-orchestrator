# Risoluto

## Project Structure & Module Organization

Core source lives in `src/`. Start with `src/cli/index.ts` for process startup and archive directory setup, `src/orchestrator/orchestrator.ts` for polling, retries, runtime state, and model overrides, and `src/agent-runner/index.ts` for Codex worker execution. HTTP and dashboard behavior live in `src/http/server.ts` and `src/http/routes/`. Archived run persistence lives in `src/core/attempt-store-port.ts` and `src/persistence/sqlite/`, workspace lifecycle in `src/workspace/manager.ts`, and Linear transport in `src/linear/client.ts`.

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

## Refactoring & Modularity Guidelines

Keep classes, modules, and functions focused on a single responsibility. Prefer modular, structured composition that is easy to read, test, and change. Extract well-named helpers or smaller modules when doing so improves testability, reuse, or readability — not solely to reduce line count.

**Cohesion over smallness.** A coherent 280-line file with one clear concern is better than three 90-line files that fragment a single concept. Optimize for how easy a module is to understand, not how short it is.

### Extraction Decision Tree

Before extracting code from a file, walk this checklist in order. Extract only if you reach the "extract" outcome.

1. Does the file mix multiple concerns? If yes → extract the secondary concern into its own module. If no → continue.
2. Is the candidate code called from more than one site, OR does it have independent testability value? If no to both → keep it inline (a named local function is fine). Stop.
3. Would extracting force the reader to jump between files to understand a single linear flow? If yes → keep it inline. Stop.
4. Would the extracted module be under ~30 lines with no realistic reuse? If yes → keep it as a named local function inside the file. Stop.
5. Is it a tightly coupled read-modify-write sequence sharing closure state? If yes → keep it as one block. Stop.
6. All checks passed → extract. Create a well-named module, export the function, and import it from the original file.

The 300-line mark is where mixed concerns typically become painful. Use it as a prompt to run the decision tree above — but a single-concern 400-line file that passes step 1 is fine as-is.

Files containing only type definitions, query strings, or pure constants are exempt from size review.

### Extraction Patterns

- Prefer standalone functions over sub-classes. Extract logic into exported functions that receive dependencies through typed context objects, not through class inheritance. Example: `export async function handleWorkerOutcome(ctx: WorkerOutcomeContext, ...): Promise<void>`.
- Use a context interface when an extracted function needs access to multiple pieces of parent state. Define the interface in a dedicated `context.ts` file. The parent class provides a `ctx()` method that bundles `this.*` references. Keep context interfaces narrow — 6 fields or fewer. If a context is growing beyond that, the extracted function likely needs further decomposition.
- Consolidate shared utilities deliberately. Utilities over ~10 lines appearing in 2+ files should be moved to `src/utils/` and imported from there. Shorter utilities (under ~10 lines) may stay duplicated if they are stable and context-specific — premature consolidation of trivial helpers creates coupling without benefit.

### Long Functions

Long functions must be broken into named helper functions. If a function has multiple phases (e.g., setup → execute → cleanup), each phase should be its own function. Prefer local named functions within the file unless the helper meets the extraction criteria above.

### Module Directory Structure

When a module is large enough to warrant extraction, create a directory for its sub-modules. Cap directory nesting at 3 levels from `src/` (e.g., `src/orchestrator/dispatch/handlers/` is the maximum depth). Deeper nesting signals over-fragmentation — flatten or rethink the decomposition.

Each extracted directory should have an `index.ts` barrel file that re-exports the public API. Internal helpers should not be exported from the barrel. Import convention: external consumers import from the barrel (`./dispatch/index.js`); files within the same directory import directly from the source file (`./handlers/worker.js`) to avoid circular references.

### When Adding New Code

- Before adding code to an existing file, run the extraction decision tree above. If the file already mixes concerns, extract the secondary concern before adding more.
- When implementing a new feature that spans multiple concerns, start by creating separate modules — do not add everything to a single file and plan to "refactor later."
- PRs adding code to files already over 300 lines that mix concerns should include the extraction, not defer it.

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

## Design System

Frontend design tokens, component vocabulary, and brand guidelines in `.impeccable.md`. Consult before any UI work. `mc-*` prefix for all component classes.
