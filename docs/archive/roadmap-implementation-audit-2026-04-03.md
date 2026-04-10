> **⚠️ ARCHIVED** — This is a historical planning artifact from April 2026. It is preserved for context but does not reflect current project state. See [ROADMAP_AND_STATUS.md](../ROADMAP_AND_STATUS.md) for the active roadmap.

# Roadmap Implementation Audit — 2026-04-03

This audit reconciles every roadmap issue listed in GitHub epic `#354` against the current Risoluto codebase (`src/`, `frontend/`, `tests/`) plus shipped implementation docs where they explicitly point to code.

## Method

- `Implemented`: the issue behavior appears shipped in code/tests/docs, even if the GitHub issue is still open.
- `Partial`: meaningful subset or adjacent groundwork exists, but the full issue body is not shipped.
- `No evidence found`: no substantial implementation was found in the current codebase.

## Summary

- Total roadmap issues audited: **93**
- Implemented: **12**
- Partial: **46**
- No evidence found: **35**
- Open issues that look effectively implemented in code: **#276, #278, #299, #303, #318, #326**

## Post-reset Additions

| Issue | GitHub State | Audit | Evidence / Notes |
|---|---|---|---|
| #366 | open | **No evidence found** | No fanout/merge execution path found; workers still run one issue -> one agent. |
| #367 | open | **Partial** | Preflight pieces exist (`src/agent-runner/preflight.ts`, setup/status handlers), but there is no `risoluto doctor` CLI command. |
| #368 | open | **No evidence found** | No dependency graph view or DAG rendering found in `frontend/src`. |
| #369 | open | **No evidence found** | No configurable success-criteria rules found beyond normal stop-signal handling. |
| #373 | open | **Partial** | Container sandboxing exists (`src/agent-runner/docker-session.ts`, `src/docker/spawn.ts`), but there is no `sbx` executor backend. |
| #375 | closed | **Implemented** | Shipped checkpoint store + API (`src/persistence/sqlite/attempt-store-sqlite.ts`, `src/http/checkpoint-handler.ts`). |

## Tier 2

| Issue | GitHub State | Audit | Evidence / Notes |
|---|---|---|---|
| #254 | open | **Partial** | Channel abstraction + manager exist, but only Slack ships (`src/notification/channel.ts`, `src/notification/manager.ts`, `src/notification/slack-webhook.ts`). |
| #258 | closed | **Implemented** | Shipped auto-merge policy + GitHub enablement (`src/git/merge-policy.ts`, `src/git/github-pr-client.ts`). |
| #259 | open | **No evidence found** | No Docker multiplexed log-frame parser implementation found. |
| #260 | open | **No evidence found** | No cron/scheduler for recurring actions found. |
| #261 | open | **Partial** | Custom provider config + credential validation exist (`src/config/schemas/codex.ts`, `src/config/validators.ts`), but there is no provider registry/capability catalog. |
| #262 | open | **Partial** | Authenticated webhook receivers exist for Linear refresh flow (`src/http/webhook-handler.ts`, `src/http/routes.ts`), but not generic external job-trigger endpoints. |
| #263 | open | **Partial** | Config is cached and refreshed on overlay/secrets changes (`src/config/store.ts`, `src/config/db-store.ts`), but there is no key-level hot-reload cache layer. |
| #264 | open | **No evidence found** | No GitLab tracker adapter found. |
| #265 | open | **Partial** | Health/watchdog and startup cleanup exist (`src/orchestrator/watchdog.ts`, `src/orchestrator/lifecycle.ts`), but there is no supervisor tree or worker restart supervision. |
| #268 | open | **Partial** | Non-interactive responses are auto-handled for approval/user-input requests (`src/agent/codex-request-handler.ts`), but there is no broader input auto-response policy layer. |
| #270 | open | **No evidence found** | No dry-run/simulation mode found for agent execution. |
| #272 | open | **Partial** | Startup cleanup exists for terminal workspaces (`src/orchestrator/lifecycle.ts`), but not age-based stale-workspace pruning. |
| #273 | open | **Partial** | Rate-limit reads/events + retry delays exist (`src/agent-runner/session-init.ts`, `src/agent-runner/error-classifier.ts`), but there is no central tracker coordinating dispatch. |
| #275 | closed | **Implemented** | Shipped completion writeback comments (`src/orchestrator/worker-outcome/completion-writeback.ts`). |
| #277 | open | **No evidence found** | No heuristic complexity classifier or automatic model-tier routing found. |
| #279 | open | **Partial** | Spend is computed and surfaced (`src/core/model-pricing.ts`, `src/orchestrator/snapshot-builder.ts`), but there is no daily/monthly enforcement. |
| #280 | open | **Partial** | Time-based stall detection exists (`src/orchestrator/stall-detector.ts`), but not state-hash / iteration loop recovery. |
| #281 | open | **Partial** | Some error-specific retry behavior exists (`src/agent-runner/error-classifier.ts`, `src/orchestrator/worker-outcome/retry-paths.ts`), but not the full per-error strategy matrix. |
| #285 | open | **Partial** | A self-review pass exists (`src/agent-runner/self-review.ts`), but not a configurable audit + auto-fix re-audit loop. |
| #287 | open | **Partial** | Phase-like lifecycle events and stall detection exist (`src/orchestrator/workspace-preparation.ts`, `src/orchestrator/stall-detector.ts`), but not phase-specific timeout policy. |
| #288 | open | **No evidence found** | No GitHub webhook lifecycle transition receiver found. |
| #290 | open | **Partial** | A global watchdog health monitor exists (`src/orchestrator/watchdog.ts`), but it does not enforce hard workflow time limits. |
| #294 | open | **Partial** | Secrets/tokens are redacted in event content (`src/core/content-sanitizer.ts`), but full PII hashing/sanitization across attempt store and SSE is not implemented. |
| #296 | open | **Partial** | Input/output pricing exists (`src/core/model-pricing.ts`), but cache/thinking/tool-use pricing categories do not. |
| #297 | open | **No evidence found** | No post-session git metrics extraction found. |
| #298 | open | **No evidence found** | Agent execution is still hard-coded to Codex (`src/agent-runner/index.ts`, `src/agent-runner/docker-session.ts`); there is no multi-agent provider registry. |
| #299 | open | **Implemented** | All four lifecycle hooks are wired with timeout handling (`src/config/builders.ts`, `src/workspace/manager.ts`, `src/agent-runner/index.ts`). |
| #302 | open | **No evidence found** | No telemetry ingestion health API or per-provider ingestion metrics found. |
| #303 | open | **Implemented** | Worker env passing is allowlist-based inside Docker (`src/docker/spawn.ts`, `tests/docker/spawn.test.ts`). |
| #304 | open | **No evidence found** | Current SSE fanout is per-connection `eventBus.onAny` with no subscriber buffers/backpressure control (`src/http/sse.ts`). |
| #305 | open | **No evidence found** | No executor discovery/selection system found; Codex is still the only backend. |
| #306 | open | **Partial** | Operators can steer an active turn (`src/orchestrator/orchestrator.ts`, `src/http/routes.ts`), but there is no queued follow-up prompt after the run finishes. |
| #307 | closed | **Implemented** | Shipped PR monitor service (`src/git/pr-monitor.ts`). |
| #312 | open | **No evidence found** | No provider failover / circuit-breaker routing found. |
| #313 | open | **Partial** | Concurrency limits and queued views exist (`src/orchestrator/worker-launcher.ts`, `src/orchestrator/lifecycle.ts`), but not a dedicated FIFO retry-aware scheduler. |
| #314 | open | **Partial** | Retry/error classification exists (`src/agent-runner/error-classifier.ts`), but not a first-class typed error hierarchy with severity/serialization. |
| #316 | open | **Partial** | Rate-limit signals are surfaced (`src/agent-runner/session-init.ts`, `src/agent-runner/notification-handler.ts`), but there is no proactive sliding-window budget tracker. |
| #318 | open | **Implemented** | Browser SSE reconnect/backoff is shipped (`frontend/src/state/event-source.ts`, `tests/e2e/specs/fullstack/sse-reconnect.fullstack.spec.ts`). |
| #319 | open | **Partial** | Successful runs commit/push before cleanup (`src/git/manager.ts`, `src/orchestrator/git-post-run.ts`), but failed or uncommitted work is not auto-committed before removal. |
| #326 | open | **Implemented** | Core v2 JSON-RPC lifecycle is in place (`src/agent-runner/session-init.ts`, `src/agent-runner/turn-executor.ts`, `src/agent-runner/notification-handler.ts`). |
| #329 | open | **Partial** | Adaptive polling exists around webhook health (`src/webhook/health-tracker.ts`), but not rate-limit-driven tick backoff. |
| #331 | open | **Partial** | Self-review, retries, and stall detection exist (`src/agent-runner/self-review.ts`, `src/orchestrator/stall-detector.ts`), but not an explicit plan-build-review phase runner. |
| #333 | closed | **Implemented** | Shipped PR review feedback ingestion (`src/git/pr-review-ingester.ts`, `src/agent-runner/session-init.ts`). |
| #334 | open | **Partial** | Real-time tool/agent item events are streamed from Codex notifications (`src/agent-runner/notification-handler.ts`), but not via an NDJSON stream parser. |
| #335 | closed | **Implemented** | Shipped PR summary generation (`src/git/pr-summary-generator.ts`). |
| #342 | open | **No evidence found** | No issue-metadata-driven playbook injection system found. |
| #343 | open | **Partial** | Port/factory-based adapter seams exist (`src/tracker/factory.ts`, `src/notification/channel.ts`), but there is no dynamic plugin registry. |
| #344 | open | **Partial** | Several PR/CI reactions ship as discrete features (`src/git/pr-monitor.ts`, `src/git/pr-review-ingester.ts`, `src/git/merge-policy.ts`), but not a configurable reaction engine. |
| #346 | open | **Partial** | Startup cleanup + persisted attempt/checkpoint state exist (`src/orchestrator/lifecycle.ts`, `src/orchestrator/worker-launcher.ts`), but there is no orphan-session resume/repair system. |
| #348 | open | **Partial** | Runtime state, metrics, and health snapshots exist (`src/orchestrator/orchestrator.ts`, `src/orchestrator/watchdog.ts`, `/metrics`), but not file-based observability snapshots. |
| #349 | open | **Partial** | Turn/tool/plan/reasoning activity is surfaced (`src/agent-runner/notification-handler.ts`), but there is no configurable agent activity-state model. |
| #351 | open | **Partial** | Prompt construction is layered across template + issue/workspace/attempt + retry feedback (`src/agent-runner/session-init.ts`, `src/prompt/template-policy.ts`), but not a dedicated layered prompt builder. |
| #352 | open | **No evidence found** | No operator-controlled global dispatch freeze found. |

## Tier 3

| Issue | GitHub State | Audit | Evidence / Notes |
|---|---|---|---|
| #255 | open | **No evidence found** | No skill/plugin loading system found beyond pruning pre-existing `.agents/skills` symlinks. |
| #269 | open | **No evidence found** | No terminal ANSI dashboard implementation found. |
| #271 | open | **Partial** | Agent-available tracker/tool calls exist (`src/agent-runner/session-helpers.ts`, `src/agent/codex-request-handler.ts`), but they are dynamic tools rather than MCP server tools and GitHub GraphQL is absent. |
| #274 | open | **Partial** | Workspace prep already cleans transient artifacts (`src/workspace/manager.ts`), but there is no broader configurable artifact-cleanup pattern set. |
| #276 | open | **Implemented** | Dispatch skips blocked todo issues via blocker-state checks (`src/orchestrator/dispatch.ts`, `src/orchestrator/worker-launcher.ts`). |
| #278 | open | **Implemented** | Attempt events/timelines are persisted and exposed (`src/core/attempt-store.ts`, `src/persistence/sqlite/attempt-store-sqlite.ts`, `GET /api/v1/attempts/:attempt_id`). |
| #282 | open | **Partial** | Notification severity, dedupe, and channel abstraction exist (`src/notification/manager.ts`), but there is no rule engine or extra channel implementations. |
| #283 | open | **Partial** | Tracker ports/adapters already abstract backends (`src/tracker/port.ts`, `src/tracker/factory.ts`), but there is no self-registering adapter registry/capability layer. |
| #284 | open | **No evidence found** | No human approval-gate checkpoints found. |
| #286 | open | **No evidence found** | No cron-scheduled automation workflow system found. |
| #291 | open | **No evidence found** | No automated merge-conflict-resolution step found. |
| #292 | open | **Partial** | Typed runtime events are exposed to the dashboard (`src/orchestrator/orchestrator-delegates.ts`, `frontend/src/state/event-source.ts`), but they are not persisted as a notification inbox with read/unread state. |
| #293 | open | **No evidence found** | No shared-branch sequential project-build workflow found. |
| #295 | open | **No evidence found** | No provider admin API analytics reconciliation found. |
| #300 | open | **Partial** | The runner can expose hardcoded extra tools and detect MCP startup failure (`src/agent-runner/session-helpers.ts`, `src/agent/codex-request-handler.ts`), but there is no configurable MCP registry. |
| #308 | open | **No evidence found** | No cross-platform desktop / OS notification implementation found. |
| #309 | open | **Partial** | Migration infrastructure exists for persistence and legacy import (`src/persistence/sqlite/migrator.ts`, `src/config/legacy-import.ts`), but not a versioned config schema chain. |
| #310 | open | **No evidence found** | No WebSocket + JSON Patch transport found. |
| #311 | open | **No evidence found** | No MCP server exposing Risoluto itself found. |
| #315 | open | **Partial** | Linear webhook ingestion is shipped (`src/http/webhook-handler.ts`, `src/webhook/registrar.ts`), but GitHub/custom push ingestion is not. |
| #317 | open | **Partial** | Single-instance repo routing by label/prefix exists (`src/git/repo-router.ts`, `src/cli/runtime-providers.ts`), but not full multi-project routing by project/tag/config blocks. |
| #325 | open | **Partial** | Some snake_case/camelCase aliases are accepted (`src/config/builders.ts`, `src/http/request-schemas.ts`), but there is no complete normalization layer. |
| #327 | open | **No evidence found** | No retry-capacity reservation logic found in dispatch. |
| #330 | open | **No evidence found** | No strict WORKFLOW raw-schema validator with unknown-key rejection found; the work appears only in planning docs. |
| #332 | open | **Partial** | Docker session/container lifecycle exists (`src/agent-runner/docker-session.ts`, `src/docker/spawn.ts`), but there is no persistent sandbox template/snapshot recovery. |
| #336 | open | **No evidence found** | No tiered git identity resolution chain found. |
| #337 | open | **No evidence found** | No ephemeral file injection / pre-push cleanup system found. |
| #339 | open | **No evidence found** | No URL content resolution pipeline found. |
| #341 | open | **Partial** | Preflight commands and hardcoded dynamic tools exist (`src/agent-runner/preflight.ts`, `src/agent-runner/session-helpers.ts`), but there is no declarative tool-capability system. |
| #345 | open | **No evidence found** | No LLM-driven task decomposition / subtask fanout found. |
| #347 | open | **Partial** | PR lifecycle events are handled via polling (`src/git/pr-monitor.ts`) and review ingestion, but not SCM webhook events. |
| #350 | open | **Partial** | `repos[]` routing and repo-specific workspaces exist (`src/git/repo-router.ts`, `src/workspace/manager.ts`), but not full per-project config partitions under one orchestrator. |

## Tier 4

| Issue | GitHub State | Audit | Evidence / Notes |
|---|---|---|---|
| #257 | open | **No evidence found** | No cluster/role-based multi-agent orchestration found. |
| #340 | open | **No evidence found** | No dedicated browser capability module for workers found. |

## Notes

- This is a code-first audit, not a label-first audit. An open GitHub issue can still be effectively shipped if the behavior now exists in code.
- Several config-bundle issues (`#309`, `#325`, `#330`, `#336`) currently show planning activity in `docs/plans/2026-04-03-003-feat-config-validation-bundle-execplan.md`, but the shipped code does not yet match the full planned scope.
- The strongest roadmap drift is in multi-agent fanout, config-hardening follow-ups, MCP/registry work, and dashboard graphing: those items are still largely backlog despite adjacent infrastructure.
