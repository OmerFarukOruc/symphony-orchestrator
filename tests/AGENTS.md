# TESTS KNOWLEDGE BASE

**Generated:** 2026-03-17 | **Commit:** a115526 | **Branch:** main

## OVERVIEW

Vitest 4.1.0 unit + integration tests for Symphony orchestrator modules.

## STRUCTURE

```
tests/
├── *.test.ts           # Unit tests (one per src module)
├── integration/        # Opt-in integration tests (require credentials)
└── fixtures/
    ├── mock-codex-server.mjs   # JSON-RPC mock for agent-runner
    └── symphony-archive-sandbox/  # Archive fixture data
```

## WHERE TO LOOK

| Task                 | Location                                                                | Notes                        |
| -------------------- | ----------------------------------------------------------------------- | ---------------------------- |
| Add unit test        | `tests/<module>.test.ts`                                                | Mirror src/ module name      |
| Add integration test | `tests/integration/`                                                    | Guard with env var checks    |
| Add fixture data     | `tests/fixtures/`                                                       | JSON/JSONL for archive tests |
| Test config          | `vitest.config.ts` (unit), `vitest.integration.config.ts` (integration) | Root level                   |

## CONVENTIONS

- **Builder functions**: `createIssue()`, `createConfig()`, `createAttempt(overrides)` — accept partial overrides
- **Mock stores**: Factory functions returning `vi.fn()` for all methods
- **Temp dirs**: Create via `mkdtemp()`, push to array, clean in `afterEach`
- **Async assertions**: Use custom `waitFor()` polling helper (50 attempts × 10ms)
- **Fake timers**: `vi.useFakeTimers()` + `vi.advanceTimersByTime()` for time-dependent code
- **Env vars**: Snapshot `process.env` before, restore in `afterEach`
- **No test IDs**: Tests use descriptive strings, not numeric IDs

## ANTI-PATTERNS

- Do NOT import from `src/` using relative paths — use package-style imports
- Do NOT leave temp directories uncleaned — always use the `afterEach` cleanup pattern
- Do NOT use `as unknown as Type` for mocks — use the established factory functions
- Do NOT skip integration tests silently — guard with explicit env var checks

## COMMANDS

```bash
npm test              # Unit tests only
npm run test:integration  # Integration tests (needs LINEAR_API_KEY)
npm run coverage      # Unit tests with V8 coverage
```

## NOTES

- Coverage thresholds: 60% statements/lines, 50% branches, 55% functions
- Integration config excludes unit tests and vice versa
- `mock-codex-server.mjs` is a standalone executable (ESM) — not imported, spawned as process
