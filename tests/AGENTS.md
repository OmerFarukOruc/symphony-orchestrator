# TESTS KNOWLEDGE BASE

**Generated:** 2026-03-23 | **Branch:** main

## OVERVIEW

Symphony uses two test suites:

- **Vitest** — 783 unit + integration tests for backend orchestrator modules
- **Playwright** — 37 E2E smoke tests + 3 visual regression baselines for the dashboard frontend

## STRUCTURE

```
tests/
├── *.test.ts                # Vitest unit tests (one per src module)
├── integration/             # Opt-in integration tests (require credentials)
├── fixtures/
│   ├── mock-codex-server.mjs       # JSON-RPC mock for agent-runner
│   └── symphony-archive-sandbox/   # Archive fixture data
└── e2e/
    ├── fixtures/test.ts             # Custom Playwright fixture (apiMock)
    ├── mocks/
    │   ├── api-mock.ts              # Route interceptor (18 endpoints)
    │   ├── scenario-builder.ts      # Fluent builder for test scenarios
    │   ├── data/                    # Typed fixture factories (6 files)
    │   └── scenarios/               # Pre-built complex scenarios
    ├── pages/                       # Page Object Models (7 POMs)
    │   ├── base.page.ts             # Shared helpers
    │   ├── setup.page.ts            # Setup wizard
    │   ├── app-shell.page.ts        # Sidebar, header, navigation
    │   ├── overview.page.ts         # Metrics, events, health
    │   ├── queue.page.ts            # Kanban board
    │   ├── issue.page.ts            # Issue detail & attempts
    │   ├── config.page.ts           # Config & secrets
    │   └── command-palette.component.ts
    ├── specs/
    │   ├── smoke/                   # 37 deterministic tests
    │   │   ├── setup-gate.spec.ts        (4 tests)
    │   │   ├── overview.smoke.spec.ts    (8 tests)
    │   │   ├── command-palette.smoke.spec.ts (7 tests)
    │   │   ├── queue-issue.smoke.spec.ts (6 tests)
    │   │   ├── issue-runs-logs.smoke.spec.ts (6 tests)
    │   │   └── config-secrets.smoke.spec.ts  (6 tests)
    │   └── visual/                  # 3 screenshot baselines
    │       ├── setup.visual.spec.ts
    │       ├── overview.visual.spec.ts
    │       └── queue.visual.spec.ts
    └── support/
        ├── clock.ts                 # Time freezing utility
        ├── screenshot.css           # Animation suppression
        ├── screenshot-css.ts        # Shared CSS loader
        └── unhandled-api.ts         # Unmocked route fail-fast
```

## WHERE TO LOOK

| Task                     | Location                                                                | Notes                        |
| ------------------------ | ----------------------------------------------------------------------- | ---------------------------- |
| Add unit test            | `tests/<module>.test.ts`                                                | Mirror src/ module name      |
| Add integration test     | `tests/integration/`                                                    | Guard with env var checks    |
| Add fixture data         | `tests/fixtures/`                                                       | JSON/JSONL for archive tests |
| Add E2E smoke test       | `tests/e2e/specs/smoke/*.smoke.spec.ts`                                 | Use POM + ScenarioBuilder    |
| Add E2E visual test      | `tests/e2e/specs/visual/*.visual.spec.ts`                               | Freeze clock, inject CSS     |
| Add E2E Page Object      | `tests/e2e/pages/*.page.ts`                                             | Extend BasePage              |
| Add E2E mock data        | `tests/e2e/mocks/data/*.ts`                                             | Export builder function      |
| Add E2E scenario         | `tests/e2e/mocks/scenarios/*.ts`                                        | Compose with builders        |
| Vitest config            | `vitest.config.ts` (unit), `vitest.integration.config.ts` (integration) | Root level                   |
| Playwright config        | `playwright.config.ts`                                                  | Root level                   |

## VITEST CONVENTIONS

- **Builder functions**: `createIssue()`, `createConfig()`, `createAttempt(overrides)` — accept partial overrides
- **Mock stores**: Factory functions returning `vi.fn()` for all methods
- **Temp dirs**: Create via `mkdtemp()`, push to array, clean in `afterEach`
- **Async assertions**: Use custom `waitFor()` polling helper (50 attempts × 10ms)
- **Fake timers**: `vi.useFakeTimers()` + `vi.advanceTimersByTime()` for time-dependent code
- **Env vars**: Snapshot `process.env` before, restore in `afterEach`
- **No test IDs**: Tests use descriptive strings, not numeric IDs

## PLAYWRIGHT CONVENTIONS

- **Page Object Models**: One POM per page in `tests/e2e/pages/`. All extend `BasePage` for `goto()`, `waitForPageContent()`.
- **Mock API**: `ApiMock` intercepts all `/api/v1/*` routes. Use `ScenarioBuilder` for fluent scenario setup.
- **Fixture**: Import `{ test, expect }` from `tests/e2e/fixtures/test.ts` — provides `apiMock` fixture.
- **Clock**: Use `freezeClock(page)` before `goto()` for deterministic timestamps in visual tests.
- **Unhandled guard**: `installUnhandledApiGuard(page)` aborts any unmocked API calls (auto-installed).
- **Strict locators**: Always use `.first()`, `{ exact: true }`, or specific CSS selectors to avoid Playwright strict-mode violations.
- **Visual CSS**: Import `screenshotCss` from `tests/e2e/support/screenshot-css.ts` to suppress animations.

## ANTI-PATTERNS

- Do NOT import from `src/` using relative paths — use package-style imports
- Do NOT leave temp directories uncleaned — always use the `afterEach` cleanup pattern
- Do NOT use `as unknown as Type` for mocks — use the established factory functions
- Do NOT skip integration tests silently — guard with explicit env var checks
- Do NOT use `page.getByText()` without `.first()` or `{ exact: true }` — strict mode will fail

## COMMANDS

```bash
npm test                   # Unit tests only (Vitest, 783 tests)
npm run test:integration   # Integration tests (needs LINEAR_API_KEY)
npm run coverage           # Unit tests with V8 coverage
npx playwright test --project=smoke   # E2E smoke (37 tests, ~7s)
npx playwright test --project=visual  # Visual regression (3 baselines)
npx playwright test --project=visual --update-snapshots  # Regenerate baselines
```

## NOTES

- Coverage thresholds: 60% statements/lines, 50% branches, 55% functions
- Integration config excludes unit tests and vice versa
- `mock-codex-server.mjs` is a standalone executable (ESM) — not imported, spawned as process
- E2E tests run against Vite dev server (port 5173) with fully mocked API routes — no backend needed
- Visual snapshots are in `tests/e2e/specs/visual/*.spec.ts-snapshots/` — committed to git
- CI runs E2E smoke sharded across 3 runners with merged HTML reports
