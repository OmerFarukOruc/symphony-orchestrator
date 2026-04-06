# Risoluto

## Project Structure & Module Organization

Core source lives in `src/`. Start with `src/cli/index.ts` for process startup and archive directory setup, `src/orchestrator/orchestrator.ts` for polling, retries, runtime state, and model overrides, and `src/agent-runner/index.ts` for Codex worker execution. HTTP and dashboard behavior live in `src/http/server.ts` and `src/http/routes/` (domain-split route modules). Archived run persistence lives in `src/persistence/sqlite/`, workspace lifecycle in `src/workspace/manager.ts`, and Linear transport in `src/linear/client.ts`.

Tests live in `tests/` and use fixture data from `tests/fixtures/`. Built artifacts are emitted to `dist/`; treat that directory as generated output, not hand-edited source. Runtime docs and operator guidance live in `README.md`, `docs/OPERATOR_GUIDE.md`, `docs/ROADMAP_AND_STATUS.md`, `docs/CONFORMANCE_AUDIT.md`, `docs/RELEASING.md`, and `docs/TRUST_AND_AUTH.md`. `EXECPLAN.md` is the implementation log and should stay factual when behavior changes.

## Build, Test, and Development Commands

Use Node.js 22 or newer.

- `pnpm run build` compiles TypeScript from `src/` into `dist/`.
- `pnpm test` runs the main Vitest suite.
- `pnpm run test:watch` starts Vitest in watch mode for local iteration.
- `pnpm run test:integration` runs the opt-in integration config; set `LINEAR_API_KEY` first when you want real credential coverage.
- `pnpm exec playwright test --project=smoke` runs the Playwright E2E smoke tests (119 tests across 17 spec files) against a Vite dev server with mocked API routes.
- `pnpm exec playwright test --project=visual` runs visual regression tests (4 visual specs with 4 baselines). Use `--update-snapshots` to regenerate reference screenshots.
- `pnpm run dev -- --port 4000` runs the CLI directly through `tsx`.
- `node dist/cli/index.js --port 4000` runs the built service.
- `./scripts/run-e2e.sh` runs the full E2E lifecycle test against real Linear + GitHub APIs (requires credentials + Docker). See `docs/E2E_TESTING.md` for config and usage.

## Pre-commit & Pre-push Checks — MANDATORY

Git hooks enforce local quality gates that mirror CI. **Never bypass them with `--no-verify`.**

### Pre-commit (`.husky/pre-commit`)

Runs `pnpm exec lint-staged` on staged files — applies ESLint auto-fix and Prettier formatting to staged `*.ts` files automatically.

### Pre-push (`.husky/pre-push`)

Runs the full CI-mirror gate before any push is allowed:

1. `pnpm run build` — TypeScript compilation
2. `pnpm run lint` — ESLint checks
3. `pnpm run format` — Prettier auto-fix
4. `pnpm run format:check` — Prettier formatting verification
5. `pnpm test` — Vitest test suite
6. `pnpm run knip` — dead code / unused export analysis
7. `pnpm run jscpd` — duplicate code detection
8. `pnpm exec playwright test --project=smoke` — E2E smoke tests
9. `semgrep scan --config auto --config p/typescript --error` — security scan
10. `pnpm run test:mutation:incremental` — mutation testing *(opt-in: only runs when `RUN_MUTATION=1` is set; skipped by default)*
11. `pnpm run typecheck:coverage` — type coverage (95% threshold)

If any step fails, the push is aborted.

### Agent Verification Checklist

**Before every commit**, agents MUST run at minimum:

```bash
pnpm run build && pnpm run lint && pnpm run format:check && pnpm test
```

If formatting issues are found, fix them with `pnpm run format` before committing. Do not commit code that has not passed all four checks. The pre-push hook enforces this, but agents should catch issues early at commit time to avoid wasted cycles.

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
- `docs/RELEASING.md` captures the release checklist.
- `docs/TRUST_AND_AUTH.md` documents trust boundaries and auth expectations.
- `EXECPLAN.md` remains the implementation log and should not drift into stale roadmap claims.

## Security & Configuration Tips

Keep secrets out of committed workflow files; prefer env expansion such as `$LINEAR_API_KEY`. When changing auth, trust, workflow examples, or sandbox behavior, update `docs/TRUST_AND_AUTH.md` and any affected operator docs in the same PR.

## Code Quality Rules

Follow these rules strictly in all new code to prevent recurring quality issues.

### String Manipulation

- **Use `replaceAll()` for global replacements.** Never write `.replace(/pattern/g, ...)` — always use `.replaceAll(/pattern/g, ...)`. The `g` flag with `replace()` is misleading; `replaceAll()` makes intent explicit.
- **Batch `Array#push()` calls.** Merge consecutive `push()` calls into a single `push(a, b, c)` call.

### Type Safety

- **Never union `unknown` with other types.** `unknown | null`, `unknown | string`, etc. are all just `unknown`. Use `unknown` alone.
- **Remove unnecessary type assertions.** If TypeScript already infers the correct type, do not add `as SomeType` casts.
- **Throw `TypeError` for type/validation violations.** Use `new TypeError(...)` instead of `new Error(...)` when the error is about an unexpected type.
- **Prevent `[object Object]` in template literals.** Before embedding a value of type `unknown` or `object` in a template literal, explicitly check `typeof value === "string"` or use `JSON.stringify()` / `String()`.

### Regex Patterns

- **Use `\w` instead of `[A-Za-z0-9_]`.** The shorthand is equivalent and more concise.
- **Avoid duplicate characters in regex classes.** `\w` already includes `_`, so `[\w._-]` should be `[\w.-]`. Audit character classes for overlap with shorthands.

### Naming & Style

- **Prefer `.at(-1)` for last-element access.** Write `arr.at(-1)` instead of `arr[arr.length - 1]`.
- **Name catch parameters `error` or `error_`.** Use `error_` when the parameter shadows an outer `error` variable.
- **Test positive conditions first.** Write `if (x === undefined)` instead of `if (x !== undefined) { ... } else { ... }`.
- **Use top-level `await` in ESM entry points.** Prefer `process.exitCode = await main()` over `main().then(...)`.

### Deprecation & Cleanup

- **Remove deprecated type aliases immediately.** When marking a type as `@deprecated`, migrate all call sites in the same PR — do not leave deprecated references.
- **Avoid `Todo` in comments/examples.** Linters flag any occurrence of `TODO` (case-insensitive). Use alternative wording in JSDoc examples (e.g. `"Triage"` instead of `"Todo"`).

## Watch Mode

When I say "watch mode", call agentation_watch_annotations in a loop.
For each annotation: acknowledge it, make the fix, then resolve it with a summary.
Continue watching until I say stop or timeout is reached.

When writing complex features or significant refactors, use an ExecPlan (as described in .agents/PLANS.md) from design to implementation.

## Architecture Deep Dive

### Module Map

The `src/` directory contains 25+ modules. Here is the dependency hierarchy:

```
Entry Point
  src/cli/index.ts          → parses CLI args, inits config stores, calls createServices()
  src/cli/services.ts       → DI wiring: phased factory functions, instantiates all services

Core (shared by everything)
  src/core/types/           → domain type leaf modules:
    issue.ts                → Issue, IssueState
    attempt.ts              → AttemptRecord, RunOutcome
    runtime.ts              → RuntimeSnapshot, RunningEntry
    config.ts               → ServiceConfig and related shapes
    codex.ts                → Codex-specific config types
    model.ts                → ModelConfig
    workspace.ts            → WorkspaceInfo
    health.ts               → HealthCheck types
    pr.ts                   → PrRecord, PrState
    logger.ts               → LoggerPort
  src/core/types.ts         → barrel re-export of all types/ leaves (backward compat)
  src/core/event-bus.ts     → TypedEventBus<RisolutoEventMap> for publish/subscribe
  src/core/attempt-store-port.ts → AttemptStorePort (composed of sub-interfaces below)
  src/core/lifecycle-events.ts   → event type definitions

Orchestration (the brain)
  src/orchestrator/orchestrator.ts → Orchestrator class: polling, dispatch, worker lifecycle
  src/orchestrator/lifecycle.ts    → reconcileRunningAndRetrying, refreshQueueViews
  src/orchestrator/worker-launcher.ts → launchAvailableWorkers — starts agent workers
  src/orchestrator/port.ts         → OrchestratorPort interface (consumed by HTTP layer)
  src/orchestrator/runtime-types.ts → RunningEntry, RetryRuntimeEntry, OrchestratorDeps

Agent Execution
  src/agent-runner/             → Codex session management, turn execution
  src/agent-runner/agent-session.ts → AgentSession abstraction (wraps a single Codex run)
  src/dispatch/                 → dispatch factory, priority logic
  src/codex/                    → Codex app-server protocol, model list
  src/codex/methods.ts          → centralized RPC method name constants
  src/codex/runtime-config.ts   → PrecomputedRuntimeConfig (extracted from protocol module)

Tracker Adapters (issue trackers)
  src/tracker/port.ts           → TrackerPort interface (includes tracker-tool-provider abstraction)
  src/tracker/factory.ts        → createTracker() — returns {tracker, trackerToolProvider, linearClient}
  src/linear/client.ts          → LinearClient (concrete TrackerPort for Linear)
  src/github/issues-client.ts   → GitHubIssuesClient (concrete TrackerPort for GitHub)

HTTP & Dashboard
  src/http/server.ts            → HttpServer class (Express)
  src/http/routes/              → domain-split route modules (replaces monolithic routes.ts)
  src/http/sse.ts               → Server-Sent Events for live dashboard updates

Infrastructure
  src/config/store.ts           → ConfigStore — YAML config file watching
  src/config/overlay.ts         → ConfigOverlayPort interface + ConfigOverlayStore
  src/persistence/sqlite/       → SQLite schema, attempt store, webhook inbox
  src/workspace/manager.ts      → WorkspaceManager — directory/worktree lifecycle
  src/git/                      → GitManager, PR monitor, repo router
  src/webhook/                  → webhook health tracker, registrar
  src/webhook/composition.ts    → webhook service composition factory
  src/secrets/store.ts          → SecretsStore — concrete SecretsPort implementation
  src/secrets/port.ts           → SecretsPort interface
  src/prompt/store.ts           → PromptTemplateStore (SQLite-backed)
  src/prompt/port.ts            → TemplateStorePort interface
  src/prompt/resolver.ts        → template resolution logic
  src/audit/logger.ts           → AuditLogger (SQLite-backed event log)
  src/audit/port.ts             → AuditLoggerPort interface
  src/utils/retry.ts            → shared retry utility (used by Linear and GitHub clients)
  src/notification/manager.ts   → NotificationManager for run lifecycle alerts

Frontend
  frontend/src/features/settings/ → Settings feature slice (components, hooks, types)
```

### Port Pattern

The codebase uses **port/adapter** architecture. Consumers depend on port interfaces, never on concrete implementations. This enables test doubles and swappable backends.

| Port Interface | Location | Implementations | Wired In |
|---|---|---|---|
| `OrchestratorPort` | `src/orchestrator/port.ts` | `Orchestrator` | `services.ts` → `HttpServer` |
| `TrackerPort` | `src/tracker/port.ts` | `LinearTrackerAdapter`, `GitHubTrackerAdapter` | `tracker/factory.ts` |
| `AttemptStorePort` | `src/core/attempt-store-port.ts` | `SqliteAttemptStore` | `persistence/sqlite/runtime.ts` |
| `PrStorePort` | `src/core/attempt-store-port.ts` | sub-interface of `AttemptStorePort` | `persistence/sqlite/runtime.ts` |
| `AttemptAnalyticsPort` | `src/core/attempt-store-port.ts` | sub-interface of `AttemptStorePort` | `persistence/sqlite/runtime.ts` |
| `CheckpointStorePort` | `src/core/attempt-store-port.ts` | sub-interface of `AttemptStorePort` | `persistence/sqlite/runtime.ts` |
| `ConfigOverlayPort` | `src/config/overlay.ts` | `ConfigOverlayStore` (file), `DbConfigStore` (SQLite) | `cli/index.ts` |
| `GitIntegrationPort` | `src/git/port.ts` | `GitManager` | `services.ts` |
| `RunAttemptDispatcher` | `src/dispatch/types.ts` | Created by `dispatch/factory.ts` | `services.ts` |
| `SecretsPort` | `src/secrets/port.ts` | `SecretsStore` | `cli/index.ts` |
| `TemplateStorePort` | `src/prompt/port.ts` | `PromptTemplateStore` | `services.ts` |
| `AuditLoggerPort` | `src/audit/port.ts` | `AuditLogger` | `services.ts` |

### Dependency Injection Flow

All service wiring happens in `src/cli/services.ts`. The former monolithic `createServices()` is now split into phased factory functions for clarity. The flow:

```
cli/index.ts
  ├─ initializeConfigStores()  → ConfigStore, ConfigOverlayStore, SecretsStore (via SecretsPort)
  ├─ createServices(configStore, overlayStore, secretsPort, archiveDir, logger)
  │    ├─ initPersistenceRuntime()  → {db, attemptStore, prStore, checkpointStore}
  │    ├─ createTracker()           → {tracker: TrackerPort, trackerToolProvider, linearClient}
  │    ├─ new WorkspaceManager()
  │    ├─ createDispatcher()        → agentRunner: RunAttemptDispatcher
  │    ├─ new TypedEventBus()
  │    ├─ composeWebhookServices()  → src/webhook/composition.ts
  │    ├─ resolveTemplate()         → src/prompt/resolver.ts
  │    ├─ new MetricsCollector()    → injectable via DI and shared across HTTP/orchestrator/agent-runner
  │    ├─ new Orchestrator({...deps})
  │    └─ new HttpServer({...deps})
  └─ services.orchestrator.start()  → begins polling loop
```

**Key rule:** If you need a new dependency, add it to `OrchestratorDeps` (in `runtime-types.ts`) and wire it in `createServices()`. Never import concrete implementations inside the orchestrator.

### Orchestrator Tick Flow

The orchestrator runs a polling loop (`tick()`) that drives all dispatch:

```
tick()
  1. tracker.fetchCandidateIssues()       — get active + terminal issues
  2. reconcileRunningAndRetrying()         — sync running workers with latest issue state
     └─ stops workers for terminal/inactive issues
  3. refreshQueueViews()                   — update queue/completed/failed views
     └─ sortIssuesForDispatch()            — priority then createdAt
  4. launchAvailableWorkers()              — start workers up to maxConcurrentAgents
     └─ workspaceManager.ensureWorkspace() — create/reuse workspace
     └─ agentRunner.runAttempt()           — spawn Codex session
  5. schedule next tick (config.polling.intervalMs)
```

Key files: `orchestrator.ts` (loop + state), `lifecycle.ts` (reconcile + queue), `worker-launcher.ts` (launch), `worker-outcome/` (handle completion).

### Event System

`TypedEventBus<RisolutoEventMap>` is the pub/sub backbone. Events are defined in `src/core/risoluto-events.ts`. Key consumers:

- **HttpServer** (SSE) → streams events to the dashboard
- **NotificationManager** → sends lifecycle alerts
- **AuditLogger** → persists events to SQLite
- **WebhookHealthTracker** → tracks webhook delivery health
- **PrMonitorService** → watches PR state changes

## Testing Cheat Sheet

### Unit Test Pattern (Port Mocking)

```typescript
import { describe, expect, it, vi, afterEach } from "vitest";
import { Orchestrator } from "../../src/orchestrator/orchestrator.js";
import {
  createIssue,
  createConfig,
  createConfigStore,
  createAttemptStore,
  createIssueConfigStore,
  createLogger,
  createResolveTemplate,
} from "./orchestrator-fixtures.js";
import type { TrackerPort } from "../../src/tracker/port.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("does the thing", async () => {
  vi.useFakeTimers();

  // 1. Create test data with factory functions
  const issue = { ...createIssue("In Progress"), id: "issue-1", identifier: "MT-01" };

  // 2. Mock ports with vi.fn()
  const tracker = {
    fetchCandidateIssues: vi.fn(async () => [issue]),
    fetchIssueStatesByIds: vi.fn(async () => [issue]),
    fetchIssuesByStates: vi.fn(async () => []),
  } as unknown as TrackerPort;

  const agentRunner = {
    runAttempt: vi.fn(async () => ({
      kind: "success",
      threadId: null,
      turnId: null,
      turnCount: 1,
    })),
  };

  // 3. Instantiate with createXxx() helpers from fixtures
  const orchestrator = new Orchestrator({
    attemptStore: createAttemptStore(),
    configStore: createConfigStore(createConfig()),
    tracker,
    workspaceManager: { ensureWorkspace: vi.fn(async (id) => ({ path: `/tmp/${id}`, workspaceKey: id, createdNow: true })), removeWorkspace: vi.fn() },
    agentRunner,
    issueConfigStore: createIssueConfigStore(),
    logger: createLogger(),
    resolveTemplate: createResolveTemplate(),
  });

  await orchestrator.start();
  await vi.advanceTimersByTimeAsync(0);

  // 4. Assert
  expect(tracker.fetchCandidateIssues).toHaveBeenCalled();
  await orchestrator.stop();
});
```

### Fixture Factories

Test fixtures live in `tests/<module>/<module>-fixtures.ts`. Pattern:

```typescript
// Minimal valid domain object — override fields per test
export function createIssue(state = "In Progress"): Issue {
  return {
    id: "issue-1",
    identifier: "MT-42",
    title: "Test issue",
    description: null,
    priority: 1,
    state,
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: "2026-03-15T00:00:00Z",
    updatedAt: "2026-03-16T00:00:00Z",
  };
}

// Config factory with full required shape
export function createConfig(): ServiceConfig { /* ... */ }

// Store factories return minimal port implementations
export function createAttemptStore(): AttemptStorePort { /* ... */ }
export function createConfigStore(config: ServiceConfig): ConfigStore { /* ... */ }
```

### E2E Test Pattern (Playwright)

```typescript
import { test, expect } from "../fixtures/test.js";

test("dashboard shows running issues", async ({ page, apiMock }) => {
  // 1. Build scenario with fluent API
  await apiMock.setScenario(
    ScenarioBuilder.withRunningAttempts(2).withCompletedAttempts(1),
  );

  // 2. Navigate using Page Object Model
  const dashboard = new DashboardPage(page);
  await dashboard.navigateTo();

  // 3. Assert UI state
  await expect(dashboard.runningCount).toHaveText("2");
});
```

## Common Modification Patterns

### Adding a New API Endpoint

1. **Define request/response schema** in `src/http/request-schemas.ts` (Zod)
2. **Create handler** in `src/http/<feature>-handler.ts`
3. **Register route** in the appropriate domain module under `src/http/routes/`
4. **Update OpenAPI spec** in `src/http/openapi.ts`
5. **Wire deps** — handler receives `OrchestratorPort` and other ports via `HttpRouteDeps`
6. **Test** — add unit test in `tests/http/` + smoke E2E in `tests/e2e/specs/smoke/`

### Adding a New Tracker Adapter

1. **Implement `TrackerPort`** in `src/tracker/<name>-adapter.ts`
2. **Create client** in `src/<name>/client.ts` for the raw API; use `src/utils/retry.ts` for retry logic
3. **Add factory branch** in `src/tracker/factory.ts` → `createTracker()`
4. **Extend `ServiceConfig`** in `src/core/types/config.ts` with new tracker kind
5. **Update config validation** in `src/config/builders.ts`
6. **Test** — mock the TrackerPort methods in `tests/orchestrator/orchestrator-fixtures.ts`

### Extending the Orchestrator

1. **Add to `OrchestratorDeps`** in `src/orchestrator/runtime-types.ts` if new dependency
2. **Wire in `createServices()`** in `src/cli/services.ts`
3. **If new tick behavior** → modify `lifecycle.ts` (reconcile/queue) or `worker-launcher.ts` (launch)
4. **If new state** → add to `OrchestratorState` in `orchestrator-delegates.ts`
5. **If new snapshot data** → update `snapshot-builder.ts` and `src/http/route-helpers.ts`
6. **Test** — use `tests/orchestrator/orchestrator-fixtures.ts` factories

### Adding a New Event

1. **Define event** in `src/core/risoluto-events.ts` → add to `RisolutoEventMap`
2. **Emit** via `eventBus.emit("eventName", payload)` at the source
3. **Consume** — subscribe in the relevant service (`httpServer`, `notificationManager`, etc.)
4. **Test** — use `TypedEventBus` directly in tests, no mocking needed

## Glossary

| Term | Meaning |
|---|---|
| **Tick** | One orchestrator polling cycle (fetch → reconcile → dispatch → launch) |
| **Port** | Interface contract (e.g., `TrackerPort`, `OrchestratorPort`). Never import concrete implementations through ports. |
| **Claim** | An issue claimed by a running worker. Tracked in `runningMap` keyed by issue identifier. |
| **Attempt** | A single agent session for an issue. Recorded in `AttemptStorePort`. Has `attemptId`, `startedAt`, `endedAt`, `outcome`. |
| **RunOutcome** | The result of an agent attempt: `success`, `error`, `cancelled`, `timeout`, `stall` |
| **Snapshot** | `RuntimeSnapshot` — serialized orchestrator state served via `/api/v1/state` |
| **Stall** | A worker that hasn't produced events within `stallTimeoutMs`. Detected by `StallDetector`. |
| **Workspace** | A directory or git worktree created for an issue. Managed by `WorkspaceManager`. |
| **Overlay** | Runtime config overrides (via UI) that layer on top of the YAML config file. Stored in `ConfigOverlayPort`. |
| **Dispatch** | Priority-sorted queue of issues eligible for worker launch. Sorted by priority, then `createdAt`. |
| **Recovery** | On startup, the orchestrator scans for orphaned attempts and either resumes or marks them failed. See `recovery.ts`. |
| **AgentSession** | Abstraction in `src/agent-runner/agent-session.ts` wrapping a single Codex app-server run lifecycle (connect → turns → close). |
| **SecretsPort** | Interface (`src/secrets/port.ts`) for reading and writing encrypted secrets. Concrete impl: `SecretsStore`. |
| **TemplateStorePort** | Interface (`src/prompt/port.ts`) for prompt template CRUD. Concrete impl: `PromptTemplateStore`. |
| **AuditLoggerPort** | Interface (`src/audit/port.ts`) for persisting audit events. Concrete impl: `AuditLogger`. |
| **PrStorePort** | Sub-interface of `AttemptStorePort` for PR record persistence. |
| **CheckpointStorePort** | Sub-interface of `AttemptStorePort` for attempt checkpoint state. |
| **AttemptAnalyticsPort** | Sub-interface of `AttemptStorePort` for aggregated attempt analytics queries. |

## Design System Reference

Frontend design tokens, color system, component vocabulary, and brand guidelines are documented in `.impeccable.md`. Consult it before any UI work. Key points:

- Component classes use `mc-*` prefix (e.g., `mc-card`, `mc-badge`)
- Color system: copper brand (`#B87333`), semantic status colors, light/dark themes
- Typography: system font stack, 4-level heading hierarchy
- All tokens defined as CSS custom properties
