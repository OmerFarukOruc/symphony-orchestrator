# Risoluto — Implementation Log

This file records completed milestones and architecture changes in chronological order. It is the factual implementation log — do not add aspirational roadmap claims here. For planned work see `docs/ROADMAP_AND_STATUS.md`.

---

## Architecture Refactor — 15-unit program (2026-04)

A parallel 15-unit refactor that cleaned up module boundaries, decomposed monolithic files, and introduced explicit port interfaces for infrastructure concerns.

### What changed

**Core types split**
`src/core/types.ts` is now a barrel re-exporting from leaf modules under `src/core/types/`:
`issue.ts`, `attempt.ts`, `runtime.ts`, `config.ts`, `codex.ts`, `model.ts`, `workspace.ts`, `health.ts`, `pr.ts`, `logger.ts`.
The barrel itself is retained for backward compatibility.

**Codex module**
`src/codex/methods.ts` centralises all RPC method name constants.
`PrecomputedRuntimeConfig` moved to `src/codex/runtime-config.ts`.

**Shared retry utility**
`src/utils/retry.ts` — shared exponential-backoff retry helper consumed by both Linear and GitHub clients.

**New port interfaces**
Three explicit infrastructure ports were introduced:
- `SecretsPort` at `src/secrets/port.ts`
- `TemplateStorePort` at `src/prompt/port.ts`
- `AuditLoggerPort` at `src/audit/port.ts`

**`AttemptStorePort` decomposed**
The monolithic `AttemptStorePort` was decomposed into three narrower sub-interfaces:
`PrStorePort`, `AttemptAnalyticsPort`, `CheckpointStorePort`.
All three are declared alongside `AttemptStorePort` in `src/core/attempt-store-port.ts`.

**`services.ts` decomposed**
`src/cli/services.ts` moved from a single `createServices()` function to phased factory functions.
- Webhook service composition extracted to `src/webhook/composition.ts`.
- Template resolution extracted to `src/prompt/resolver.ts`.

**HTTP routes split**
`src/http/routes.ts` replaced by domain-split modules under `src/http/routes/`.

**`AgentSession` abstraction**
`src/agent-runner/agent-session.ts` wraps the lifecycle of a single Codex app-server run.
Tracker tool-provider abstraction added to `TrackerPort`, while `linearClient` remains limited to webhook infrastructure wiring.

**Metrics**
`MetricsCollector` is now injectable via DI and shared through service wiring.

**Frontend**
Settings UI feature-sliced to `frontend/src/features/settings/`.

### Units

| Unit | Scope |
|------|-------|
| 1 | Core types split into leaf modules |
| 2 | Codex methods constants + runtime-config extraction |
| 3 | Shared retry utility |
| 4 | SecretsPort interface |
| 5 | TemplateStorePort interface |
| 6 | AuditLoggerPort interface |
| 7 | AttemptStorePort decomposition |
| 8 | services.ts phased factory refactor |
| 9 | Webhook composition extraction |
| 10 | Template resolver extraction |
| 11 | HTTP routes domain split |
| 12 | AgentSession abstraction |
| 13 | Tracker tool-provider abstraction |
| 14 | MetricsCollector DI injection |
| 15 | Docs convergence (this unit) |
