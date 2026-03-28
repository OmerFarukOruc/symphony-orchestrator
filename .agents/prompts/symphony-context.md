# Symphony Context

Project identity, runtime self-discovery commands, and architectural pattern library
for Symphony Orchestrator. Import this file at the top of any agent prompt that needs
accurate knowledge of the codebase.

---

## 1. Identity

### What Symphony Is

Symphony Orchestrator is an autonomous AI agent orchestration platform. It polls an
issue tracker (Linear or GitHub Issues), dispatches Codex CLI workers against each
issue, manages retries and timeouts, persists full attempt history, and serves a
real-time dashboard over HTTP + SSE.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Strict ESM TypeScript (Node.js 22+) |
| HTTP | Express 5 with rate limiting |
| Persistence | SQLite via Drizzle ORM (attempt store, config, audit, secrets) |
| Validation | Zod schemas for config, request bodies, and domain types |
| Templating | LiquidJS (prompt templates) |
| Logging | Pino (structured JSON) |
| Events | In-process typed pub/sub (`TypedEventBus`) + SSE bridge |
| Unit tests | Vitest |
| E2E tests | Playwright (smoke + visual regression suites) |
| Frontend | Vite SPA served from `dist/frontend/` |

### Design Principles

- **Small focused modules** — each file targets <200 LOC; large concerns split across
  helper files rather than growing a single module.
- **Extracted helpers over inheritance** — shared logic lives in standalone functions,
  not base classes.
- **Context interfaces for dependency passing** — constructors accept a typed deps/context
  object, not a DI container.
- **Port interfaces for abstraction** — every subsystem exposes a `*Port` interface;
  consumers depend on the port, adapters implement it.
- **Factory pattern for polymorphism** — per-subsystem factory functions choose the
  correct adapter based on config (e.g. `createTracker()`, `createDispatcher()`).

### Coding Conventions

- 2-space indentation, double quotes, semicolons, `const` by default.
- `.js` extensions in all local TypeScript imports (`import { Foo } from "./foo.js";`).
- `PascalCase` for classes and interfaces, `camelCase` for functions and variables.
- Test files named `*.test.ts`, mirroring the `src/` directory structure under `tests/`.
- `moduleResolution: "NodeNext"` — no path aliases, no barrel-only re-exports for
  cross-module boundaries.

### Repo Coordinates

- **URL**: `https://github.com/OmerFarukOruc/symphony-orchestrator`
- **Epic**: `#9` — Symphony v2 Feature Roadmap

---

## 2. Self-Discovery

**Run these commands at the start of every session and capture the output.**
Use the results as ground truth for all module paths, patterns, and issue references
throughout the session. Do not rely on cached or memorized paths — the codebase evolves.

```bash
# ── Module tree (current file listing) ──
find src/ -type f -name "*.ts" | sort | head -100

# ── Module directory overview ──
find src/ -mindepth 1 -maxdepth 1 -type d | sort

# ── File count per module ──
for dir in src/*/; do echo "$(find "$dir" -name '*.ts' | wc -l) $dir"; done | sort -rn

# ── Recent changes (last 20 commits) ──
git log --oneline -20

# ── Current branch and status ──
git status --short

# ── Port interfaces in use ──
grep -r "interface.*Port" src/ --include="*.ts" -l

# ── Config schemas ──
ls src/config/schemas/

# ── Event channels ──
grep -r "EventMap" src/ --include="*.ts" -l

# ── HTTP routes ──
grep -r "\.route\(" src/http/ --include="*.ts" -l

# ── Test files ──
find tests/ -name "*.test.ts" | sort

# ── Current open issues ──
gh issue list --repo OmerFarukOruc/symphony-orchestrator --limit 100 --state open --json number,title,labels

# ── Epic #9 current state ──
gh issue view 9 --repo OmerFarukOruc/symphony-orchestrator --json body --jq '.body' | head -100

# ── CLAUDE.md conventions (first 50 lines) ──
head -50 CLAUDE.md

# ── Package dependencies ──
cat package.json | jq '.dependencies | keys'
```

---

## 3. Pattern Library

Six architectural patterns that recur throughout the codebase. Each section names
the pattern, explains how it works, and lists the canonical files.

### 3.1 Port Interfaces

The primary abstraction mechanism. Every subsystem defines a TypeScript interface
suffixed with `Port`. Consumers depend on the port; one or more adapter classes
implement it. This keeps orchestration logic decoupled from concrete clients.

| Port | File | Purpose |
|------|------|---------|
| `OrchestratorPort` | `src/orchestrator/port.ts` | Orchestrator lifecycle, snapshot, abort, model update, steer |
| `TrackerPort` | `src/tracker/port.ts` | Issue fetching, state transitions, comments — tracker-agnostic |
| `ConfigOverlayPort` | `src/config/overlay.ts` | Runtime config overlay CRUD + file-watch subscription |
| `AttemptStorePort` | `src/core/attempt-store-port.ts` | Attempt CRUD, event append, aggregate queries |
| `GitIntegrationPort` | `src/git/port.ts` | Composed of `GitWorktreePort` + `GitPostRunPort` + `GithubApiToolClient` |

**Pattern**: Factory creates the correct adapter based on config. All non-factory
code depends on the port interface, never on the concrete class.

```
TrackerPort
  ├── LinearTrackerAdapter  (src/tracker/linear-adapter.ts)
  └── GitHubTrackerAdapter  (src/tracker/github-adapter.ts)
```

### 3.2 Config Schemas (Zod)

Each config subsection has its own Zod schema file under `src/config/schemas/`.
Schemas define shape, defaults, and validation. They export via a barrel at
`src/config/schemas/index.ts`.

| Schema file | Exports |
|-------------|---------|
| `tracker.ts` | `trackerConfigSchema` — tracker kind, API keys, state arrays |
| `server.ts` | `serverConfigSchema`, `pollingConfigSchema`, `notificationConfigSchema`, `gitHubConfigSchema`, `repoConfigSchema`, `stateMachineConfigSchema` |
| `agent.ts` | `agentConfigSchema` |
| `codex.ts` | `codexConfigSchema`, `codexProviderSchema`, `sandboxConfigSchema`, `reasoningEffortSchema` |
| `workspace.ts` | `workspaceConfigSchema` |

`ConfigStore` (in `src/config/store.ts`) merges the overlay + secrets into a
validated `ServiceConfig`, watches for overlay file changes, and re-validates
on every mutation.

### 3.3 HTTP Route Registration

All Express routes are registered in `src/http/routes.ts` via `registerHttpRoutes()`.

**Structure**:
- Routes grouped by concern into helper functions (`registerStateAndMetricsRoutes`,
  `registerDocsRoutes`, `registerExtensionApis`, `registerGitRoutes`,
  `registerWorkspaceRoutes`, `registerIssueRoutes`).
- Pattern: `.route("/api/v1/...").get(handler).post(validateBody(schema), handler).all(methodNotAllowed)`
- Request validation: Zod schemas in `src/http/request-schemas.ts` applied via
  `validateBody()` from `src/http/validation.ts`.
- Handlers in separate files under `src/http/` (e.g. `model-handler.ts`,
  `transition-handler.ts`, `attempt-handler.ts`, `git-context.ts`).
- Extension APIs (config, secrets, setup, templates, audit) registered by their
  own `register*Api()` functions imported from their respective modules.

### 3.4 TypedEventBus

Generic typed pub/sub system in `src/core/event-bus.ts`. Type parameter
`TEventMap` maps channel names to payload types, enforcing compile-time safety
on both `emit()` and `on()`.

**Event map**: `SymphonyEventMap` in `src/core/symphony-events.ts` defines all channels:

| Channel | Payload summary |
|---------|----------------|
| `issue.started` | issueId, identifier, attempt number |
| `issue.completed` | issueId, identifier, outcome |
| `issue.stalled` | issueId, identifier, reason |
| `issue.queued` | issueId, identifier |
| `worker.failed` | issueId, identifier, error |
| `model.updated` | identifier, model, source |
| `workspace.event` | issueId, identifier, status |
| `agent.event` | issueId, identifier, type, message, sessionId, timestamp, content |
| `poll.complete` | timestamp, issueCount |
| `system.error` | message, optional context |

**SSE bridge**: `src/http/sse.ts` — `createSSEHandler()` subscribes to the bus
via `onAny()` and streams each emission as a JSON SSE frame to HTTP clients.
Keep-alive comments sent every 30 seconds.

### 3.5 Module Wiring (Factory + DI)

How the system boots and wires dependencies:

1. **Entry**: `src/cli/index.ts` — parses CLI args, resolves archive dir, calls `createServices()`.
2. **Master factory**: `src/cli/services.ts` — `createServices()` instantiates
   persistence, tracker, workspace manager, dispatcher, event bus, notification
   manager, orchestrator, and HTTP server. Returns the assembled service graph.
3. **Per-subsystem factories**:
   - `src/tracker/factory.ts` — `createTracker()` returns `TrackerPort` + optional
     `LinearClient`, choosing `LinearTrackerAdapter` or `GitHubTrackerAdapter`
     based on `config.tracker.kind`.
   - `src/dispatch/factory.ts` — `createDispatcher()` returns a `RunAttemptDispatcher`,
     choosing in-process `AgentRunner` or remote `DispatchClient` based on
     `DISPATCH_MODE` env var.
4. **Dependency injection**: Constructor params with typed deps objects. No DI
   container — explicit wiring in `createServices()`.

### 3.6 Test Structure

| Layer | Location | Runner |
|-------|----------|--------|
| Unit tests | `tests/*.test.ts` (mirrors `src/` structure) | Vitest |
| Test helpers | `tests/helpers.ts` — mock logger, mock response, state builders | — |
| Fixtures | `tests/fixtures/` — static data for deterministic tests | — |
| E2E smoke | `tests/e2e/specs/smoke/*.smoke.spec.ts` | Playwright (`--project=smoke`) |
| E2E visual | `tests/e2e/specs/visual/*.visual.spec.ts` | Playwright (`--project=visual`) |
| Page Objects | `tests/e2e/pages/*.page.ts` — one POM per page, all extend `BasePage` | — |
| Mock API | `tests/e2e/mocks/api-mock.ts` + `scenario-builder.ts` + `data/` | — |

**Conventions**:
- `vi.fn()` for mocks, `beforeEach()` for per-test setup.
- Deterministic data from fixtures and factories — no live services in unit tests.
- `freezeClock(page)` for deterministic timestamps in visual tests.
- `installUnhandledApiGuard(page)` aborts unmocked API calls automatically.
