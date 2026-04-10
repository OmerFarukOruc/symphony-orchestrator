---
paths:
  - "tests/**/*"
  - "**/*.test.ts"
---

# Testing Reference

## Unit Test Pattern (Port Mocking)

```typescript
import { describe, expect, it, vi, afterEach } from "vitest";
import { Orchestrator } from "../../src/orchestrator/orchestrator.js";
import {
  createIssue, createConfig, createConfigStore,
  createAttemptStore, createIssueConfigStore, createLogger, createResolveTemplate,
} from "./orchestrator-fixtures.js";
import type { TrackerPort } from "../../src/tracker/port.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("does the thing", async () => {
  vi.useFakeTimers();
  const issue = { ...createIssue("In Progress"), id: "issue-1", identifier: "MT-01" };

  const tracker = {
    fetchCandidateIssues: vi.fn(async () => [issue]),
    fetchIssueStatesByIds: vi.fn(async () => [issue]),
    fetchIssuesByStates: vi.fn(async () => []),
  } as unknown as TrackerPort;

  const agentRunner = {
    runAttempt: vi.fn(async () => ({ kind: "success", threadId: null, turnId: null, turnCount: 1 })),
  };

  const orchestrator = new Orchestrator({
    attemptStore: createAttemptStore(),
    configStore: createConfigStore(createConfig()),
    tracker, agentRunner,
    workspaceManager: {
      ensureWorkspace: vi.fn(async (id) => ({ path: `/tmp/${id}`, workspaceKey: id, createdNow: true })),
      removeWorkspace: vi.fn(),
    },
    issueConfigStore: createIssueConfigStore(),
    logger: createLogger(),
    resolveTemplate: createResolveTemplate(),
  });

  await orchestrator.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(tracker.fetchCandidateIssues).toHaveBeenCalled();
  await orchestrator.stop();
});
```

## Fixture Factories

Fixtures live in `tests/<module>/<module>-fixtures.ts`. Minimal valid domain object — override fields per test.

```typescript
export function createIssue(state = "In Progress"): Issue {
  return {
    id: "issue-1", identifier: "MT-42", title: "Test issue", description: null,
    priority: 1, state, branchName: null, url: null, labels: [], blockedBy: [],
    createdAt: "2026-03-15T00:00:00Z", updatedAt: "2026-03-16T00:00:00Z",
  };
}
export function createConfig(): ServiceConfig { /* ... */ }
export function createAttemptStore(): AttemptStorePort { /* ... */ }
export function createConfigStore(config: ServiceConfig): ConfigStore { /* ... */ }
```

## E2E Test Pattern (Playwright)

```typescript
import { test, expect } from "../fixtures/test.js";

test("dashboard shows running issues", async ({ page, apiMock }) => {
  await apiMock.setScenario(ScenarioBuilder.withRunningAttempts(2).withCompletedAttempts(1));
  const dashboard = new DashboardPage(page);
  await dashboard.navigateTo();
  await expect(dashboard.runningCount).toHaveText("2");
});
```

## Playwright Conventions

- **POMs**: One per page/component in `tests/e2e/pages/`. All extend `BasePage`.
- **Mock API**: `ApiMock` intercepts all `/api/v1/*` routes. Use `ScenarioBuilder` for setup. Data factories in `tests/e2e/mocks/data/`.
- **Smoke tests**: `tests/e2e/specs/smoke/*.smoke.spec.ts` — deterministic, no real backend. Run with `--project=smoke`.
- **Visual tests**: `tests/e2e/specs/visual/*.visual.spec.ts` — screenshot comparison. Run with `--project=visual`. Use `--update-snapshots` to regenerate.
- **Clock freezing**: `freezeClock(page)` from `tests/e2e/support/clock.ts` before visual tests for deterministic timestamps.
- **Unhandled API guard**: `installUnhandledApiGuard(page)` aborts unmocked API calls — installed automatically by the fixture.

## ESM mocking gotchas

- **Never `vi.doMock` Node built-ins** (`node:path`, `node:fs`, `node:os`, etc.) in ESM — non-deterministic under Vitest's ESM loader. Inject function parameters instead (e.g. `relativeFn`, `resolveFn`) and pass real impls from call sites. Surfaced in the paths.ts test flake fixed during the v1 rewrite (2026-04-09).
