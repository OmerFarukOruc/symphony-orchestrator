# Glossary

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
| **Overlay** | Runtime config overrides (via UI) layered on top of the YAML config file. Stored in `ConfigOverlayPort`. |
| **Dispatch** | Priority-sorted queue of issues eligible for worker launch. Sorted by priority, then `createdAt`. |
| **Recovery** | On startup, the orchestrator scans for orphaned attempts and either resumes or marks them failed. See `recovery.ts`. |
| **AgentSession** | Abstraction in `src/agent-runner/agent-session.ts` wrapping a single Codex app-server run lifecycle. |
| **SecretsPort** | Interface (`src/secrets/port.ts`) for reading and writing encrypted secrets. Concrete impl: `SecretsStore`. |
| **TemplateStorePort** | Interface (`src/prompt/port.ts`) for prompt template CRUD. Concrete impl: `PromptTemplateStore`. |
| **AuditLoggerPort** | Interface (`src/audit/port.ts`) for persisting audit events. Concrete impl: `AuditLogger`. |
| **PrStorePort** | Sub-interface of `AttemptStorePort` for PR record persistence. |
| **CheckpointStorePort** | Sub-interface of `AttemptStorePort` for attempt checkpoint state. |
| **AttemptAnalyticsPort** | Sub-interface of `AttemptStorePort` for aggregated attempt analytics queries. |
