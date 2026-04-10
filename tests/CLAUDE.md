# Tests

> Detailed reference: [AGENTS.md](./AGENTS.md)

## Quick Reference

- **Vitest**: ~3700 tests in `tests/<module>/*.test.ts` mirroring `src/`
- **Playwright smoke**: 22 specs in `tests/e2e/specs/smoke/`
- **Playwright visual**: 19 specs in `tests/e2e/specs/visual/`

## Commands

```bash
pnpm test                                    # Vitest suite
pnpm run test:integration                    # Needs LINEAR_API_KEY
pnpm exec playwright test --project=smoke    # E2E smoke
pnpm exec playwright test --project=visual   # Visual regression
pnpm exec playwright test --project=visual --update-snapshots  # Regen baselines
```

## Writing Tests

### Unit Tests

```bash
tests/<module>/<feature>.test.ts   # Mirror src/ module path
```

- Use builder functions (`createIssue()`, `createConfig()`, etc.) for test data
- Use `vi.fn()` factory functions for mock stores
- Clean temp dirs in `afterEach`; restore `process.env` snapshots
- Import from `../../src/<module>/<file>.js` (ESM `.js` extensions)

### E2E Tests

```bash
tests/e2e/specs/smoke/*.smoke.spec.ts    # Deterministic, mocked API
tests/e2e/specs/visual/*.visual.spec.ts  # Screenshot comparison
```

- Import `{ test, expect }` from `tests/e2e/fixtures/test.ts`
- Use `ScenarioBuilder` + data factories from `tests/e2e/mocks/data/`
- Page Object Models in `tests/e2e/pages/` — extend `BasePage`
- Visual tests: `freezeClock(page)` before `goto()`, import `screenshotCss`
- Always use `.first()` or `{ exact: true }` with locators (strict mode)

## Anti-Patterns

- No bare relative imports — use `../../src/<module>/<file>.js`
- No `as unknown as Type` — use factory functions
- No `page.getByText()` without `.first()` or `{ exact: true }`
- No inline test data — use existing data factories
- No uncleaned temp dirs — always `afterEach` cleanup

## MANDATORY

After UI changes: run `/visual-verify` before marking done.
