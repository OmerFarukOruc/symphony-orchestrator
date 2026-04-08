---
paths:
  - "src/**/*"
---

# Architecture Reference

## Module Map

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
  src/codex/runtime-config.ts   → PrecomputedRuntimeConfig

Tracker Adapters (issue trackers)
  src/tracker/port.ts           → TrackerPort interface
  src/tracker/factory.ts        → createTracker() — returns {tracker, trackerToolProvider, linearClient}
  src/linear/client.ts          → LinearClient (concrete TrackerPort for Linear)
  src/github/issues-client.ts   → GitHubIssuesClient (concrete TrackerPort for GitHub)

HTTP & Dashboard
  src/http/server.ts            → HttpServer class (Express)
  src/http/routes/              → domain-split route modules
  src/http/sse.ts               → Server-Sent Events for live dashboard updates

Infrastructure
  src/config/store.ts           → ConfigStore — YAML config file watching
  src/config/overlay.ts         → ConfigOverlayPort interface + ConfigOverlayStore
  src/persistence/sqlite/       → SQLite schema, attempt store, webhook inbox
  src/workspace/manager.ts      → WorkspaceManager — directory/worktree lifecycle
  src/git/                      → GitManager, PR monitor, repo router
  src/webhook/composition.ts    → webhook service composition factory
  src/secrets/store.ts          → SecretsStore — concrete SecretsPort implementation
  src/prompt/store.ts           → PromptTemplateStore (SQLite-backed)
  src/audit/logger.ts           → AuditLogger (SQLite-backed event log)
  src/notification/manager.ts   → NotificationManager for run lifecycle alerts

Frontend
  frontend/src/features/settings/ → Settings feature slice (components, hooks, types)
```

## Port Pattern

Consumers depend on port interfaces, never on concrete implementations.

| Port Interface | Location | Implementations | Wired In |
|---|---|---|---|
| `OrchestratorPort` | `src/orchestrator/port.ts` | `Orchestrator` | `services.ts` → `HttpServer` |
| `TrackerPort` | `src/tracker/port.ts` | `LinearTrackerAdapter`, `GitHubTrackerAdapter` | `tracker/factory.ts` |
| `AttemptStorePort` | `src/core/attempt-store-port.ts` | `SqliteAttemptStore` | `persistence/sqlite/runtime.ts` |
| `ConfigOverlayPort` | `src/config/overlay.ts` | `ConfigOverlayStore` (file), `DbConfigStore` (SQLite) | `cli/index.ts` |
| `GitIntegrationPort` | `src/git/port.ts` | `GitManager` | `services.ts` |
| `SecretsPort` | `src/secrets/port.ts` | `SecretsStore` | `cli/index.ts` |
| `TemplateStorePort` | `src/prompt/port.ts` | `PromptTemplateStore` | `services.ts` |
| `AuditLoggerPort` | `src/audit/port.ts` | `AuditLogger` | `services.ts` |

**Key rule:** Add new dependencies to `OrchestratorDeps` (`src/orchestrator/runtime-types.ts`) and wire in `createServices()`. Never import concrete implementations inside the orchestrator.

## DI Flow

```
cli/index.ts
  ├─ initializeConfigStores()  → ConfigStore, ConfigOverlayStore, SecretsStore
  └─ createServices(...)
       ├─ initPersistenceRuntime()  → {db, attemptStore, prStore, checkpointStore}
       ├─ createTracker()           → {tracker, trackerToolProvider, linearClient}
       ├─ new WorkspaceManager()
       ├─ createDispatcher()        → agentRunner: RunAttemptDispatcher
       ├─ new TypedEventBus()
       ├─ composeWebhookServices()
       ├─ resolveTemplate()
       ├─ new MetricsCollector()
       ├─ new Orchestrator({...deps})
       └─ new HttpServer({...deps})
```

## Orchestrator Tick Flow

```
tick()
  1. tracker.fetchCandidateIssues()       — get active + terminal issues
  2. reconcileRunningAndRetrying()         — sync workers with latest issue state
  3. refreshQueueViews()                   — update queue/completed/failed views
  4. launchAvailableWorkers()              — start workers up to maxConcurrentAgents
  5. schedule next tick (config.polling.intervalMs)
```

Key files: `orchestrator.ts` (loop + state), `lifecycle.ts` (reconcile + queue), `worker-launcher.ts` (launch).

## Event System

`TypedEventBus<RisolutoEventMap>` is the pub/sub backbone. Events defined in `src/core/risoluto-events.ts`.

Key consumers: `HttpServer` (SSE → dashboard), `NotificationManager` (lifecycle alerts), `AuditLogger` (SQLite persistence), `WebhookHealthTracker`, `PrMonitorService`.
