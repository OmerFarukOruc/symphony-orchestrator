# Tests

> See also: [CLAUDE.md](./CLAUDE.md) for the concise agent-facing reference.

## Overview

Risoluto uses three test layers:

- **Vitest** — ~3700 unit + integration tests for backend orchestrator modules (`tests/`)
- **Playwright smoke** — 22 spec files of deterministic E2E tests for the dashboard (`tests/e2e/specs/smoke/`)
- **Playwright visual** — 19 screenshot-comparison specs with 18 baseline sets (`tests/e2e/specs/visual/`)

## Structure

```
tests/
├── AGENTS.md                        # This file (detailed knowledge base)
├── CLAUDE.md                        # Concise agent reference (linked)
├── helpers.ts                       # Shared test helpers
├── <module>/                        # Vitest unit tests, mirrors src/<module>/
│   └── *.test.ts
├── integration/                     # Opt-in integration tests (require credentials)
├── fixtures/
│   ├── mock-codex-server.mjs        # JSON-RPC mock for agent-runner (spawned, not imported)
│   └── risoluto-archive-sandbox/    # Archive fixture data
├── e2e/
│   ├── fixtures/test.ts             # Custom Playwright fixture (apiMock)
│   ├── mocks/
│   │   ├── api-mock.ts              # Route interceptor (~24KB, all endpoints)
│   │   ├── scenario-builder.ts      # Fluent builder for test scenarios
│   │   ├── data/                    # Typed fixture factories (9 files)
│   │   │   ├── attempts.ts
│   │   │   ├── checkpoint.ts
│   │   │   ├── config.ts
│   │   │   ├── git-context.ts
│   │   │   ├── issue-detail.ts
│   │   │   ├── pr.ts
│   │   │   ├── runtime-snapshot.ts
│   │   │   ├── secrets.ts
│   │   │   └── setup-status.ts
│   │   └── scenarios/               # Pre-built complex scenarios
│   ├── pages/                       # Page Object Models (9 POMs)
│   │   ├── base.page.ts             # Shared helpers (goto, waitForPageContent)
│   │   ├── app-shell.page.ts        # Sidebar, header, navigation
│   │   ├── command-palette.component.ts
│   │   ├── config.page.ts           # Config & secrets
│   │   ├── issue.page.ts            # Issue detail & attempts
│   │   ├── logs.page.ts             # Log viewer
│   │   ├── overview.page.ts         # Metrics, events, health
│   │   ├── queue.page.ts            # Kanban board
│   │   └── setup.page.ts            # Setup wizard
│   ├── specs/
│   │   ├── smoke/                   # 22 deterministic spec files
│   │   └── visual/                  # 19 screenshot-comparison specs
│   └── support/
│       ├── clock.ts                 # Time freezing utility
│       ├── screenshot.css           # Animation suppression
│       ├── screenshot-css.ts        # Shared CSS loader
│       └── unhandled-api.ts         # Unmocked route fail-fast
└── <module>/                        # 34 test subdirectories mirroring src/
    ├── agent/
    ├── agent-runner/
    ├── alerts/
    ├── automation/
    ├── cli/
    ├── codex/
    ├── config/
    ├── core/
    ├── dispatch/
    ├── docker/
    ├── frontend/
    ├── git/
    ├── github/
    ├── http/
    ├── linear/
    ├── notification/
    ├── observability/
    ├── orchestrator/
    ├── persistence/
    ├── prompt/
    ├── secrets/
    ├── setup/
    ├── state/
    ├── tracker/
    ├── utils/
    ├── webhook/
    ├── workflow/
    └── workspace/
```

## Where to Look

| Task                     | Location                                                                | Notes                        |
| ------------------------ | ----------------------------------------------------------------------- | ---------------------------- |
| Add unit test            | `tests/<module>/*.test.ts`                                              | Mirror src/ module path      |
| Add integration test     | `tests/integration/`                                                    | Guard with env var checks    |
| Add fixture data         | `tests/fixtures/`                                                       | JSON/JSONL for archive tests |
| Add E2E smoke test       | `tests/e2e/specs/smoke/*.smoke.spec.ts`                                 | Use POM + ScenarioBuilder    |
| Add E2E visual test      | `tests/e2e/specs/visual/*.visual.spec.ts`                               | Freeze clock, inject CSS     |
| Add E2E Page Object      | `tests/e2e/pages/*.page.ts`                                             | Extend BasePage              |
| Add E2E mock data        | `tests/e2e/mocks/data/*.ts`                                             | Export builder function      |
| Add E2E scenario         | `tests/e2e/mocks/scenarios/*.ts`                                        | Compose with builders        |
| Vitest config            | `vitest.config.ts` (unit), `vitest.integration.config.ts` (integration) | Root level                   |
| Playwright config        | `playwright.config.ts`                                                  | Root level                   |

## Vitest Conventions

- **Builder functions**: `createIssue()`, `createConfig()`, `createAttempt(overrides)` — accept partial overrides
- **Mock stores**: Factory functions returning `vi.fn()` for all methods
- **Temp dirs**: Create via `mkdtemp()`, push to array, clean in `afterEach`
- **Async assertions**: Use custom `waitFor()` polling helper (50 attempts × 10ms)
- **Fake timers**: `vi.useFakeTimers()` + `vi.advanceTimersByTime()` for time-dependent code
- **Env vars**: Snapshot `process.env` before, restore in `afterEach`
- **No test IDs**: Tests use descriptive strings, not numeric IDs
- **Import style**: Use package-style imports (`../../src/<module>/<file>.js`), never bare relative paths

## Playwright Conventions

- **Page Object Models**: One POM per page in `tests/e2e/pages/`. All extend `BasePage` for `goto()`, `waitForPageContent()`.
- **Mock API**: `ApiMock` intercepts all `/api/v1/*` routes. Use `ScenarioBuilder` for fluent scenario setup.
- **Fixture**: Import `{ test, expect }` from `tests/e2e/fixtures/test.ts` — provides `apiMock` fixture.
- **Clock**: Use `freezeClock(page)` before `goto()` for deterministic timestamps in visual tests.
- **Unhandled guard**: `installUnhandledApiGuard(page)` aborts any unmocked API calls (auto-installed by fixture).
- **Strict locators**: Always use `.first()`, `{ exact: true }`, or specific CSS selectors — strict mode rejects ambiguous matches.
- **Visual CSS**: Import `screenshotCss` from `tests/e2e/support/screenshot-css.ts` to suppress animations.
- **Visual snapshots**: Stored in `tests/e2e/specs/visual/*.spec.ts-snapshots/` — committed to git.

## Anti-Patterns

- Do NOT import from `src/` using bare relative paths — use `../../src/<module>/<file>.js`
- Do NOT leave temp directories uncleaned — always use the `afterEach` cleanup pattern
- Do NOT use `as unknown as Type` for mocks — use the established factory functions
- Do NOT skip integration tests silently — guard with explicit env var checks
- Do NOT use `page.getByText()` without `.first()` or `{ exact: true }` — strict mode will fail
- Do NOT hardcode test data inline — use the existing data factories in `tests/e2e/mocks/data/`

## Commands

```bash
pnpm test                                              # Vitest suite (~3700 tests)
pnpm run test:watch                                    # Watch mode
pnpm run test:integration                              # Integration (needs LINEAR_API_KEY)
pnpm run coverage                                      # Unit tests with V8 coverage
pnpm exec playwright test --project=smoke              # E2E smoke (22 specs)
pnpm exec playwright test --project=visual             # Visual regression (19 specs)
pnpm exec playwright test --project=visual --update-snapshots  # Regenerate baselines
```

## Configuration

| Config file                      | Purpose                                          |
| -------------------------------- | ------------------------------------------------ |
| `vitest.config.ts`               | Unit test config (excludes integration, fixtures) |
| `vitest.integration.config.ts`   | Integration tests only                           |
| `playwright.config.ts`           | Smoke + visual projects, Vite dev server          |
| `playwright.fullstack.config.ts` | Full-stack E2E against real backend               |

## Notes

- Coverage thresholds: 60% statements/lines, 50% branches, 55% functions
- Integration config excludes unit tests and vice versa
- `mock-codex-server.mjs` is a standalone executable (ESM) — spawned as process, not imported
- E2E tests run against Vite dev server (port 5173) with fully mocked API routes — no backend needed
- CI runs E2E smoke sharded across 3 runners with merged HTML reports
- Visual snapshot baselines must be regenerated with `--update-snapshots` after intentional UI changes
