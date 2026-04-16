# Deepen Risoluto Runtime Architecture

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with [.agents/PLANS.md](/home/oruc/Desktop/workspace/risoluto/.agents/PLANS.md).

## Purpose / Big Picture

Risoluto currently works, but several operator-facing behaviors are implemented through shallow modules where the public concept is split across too many files. The result is higher test cost, more drift between the real backend and the Playwright mock layer, and slower iteration on risky changes such as worker startup, retries, live updates, and attempt detail rendering.

After this program is complete, a contributor should be able to change one major behavior at a stable boundary instead of touching a half-dozen seam files. We will prove progress by keeping `pnpm run build`, Vitest boundary tests, and the OpenAPI sync guard green after each milestone. The first visible proof already landed in this branch: the agent-runner lifecycle now has a deeper internal boundary, attempt detail responses now formally include PR summaries, and the E2E mock layer is guarded by real schema parity tests.

## Progress

- [x] (2026-04-14 09:30Z) Stabilized the new agent-runner extraction by fixing the abort bridge so `abort()` with no explicit reason still aborts the active attempt.
- [x] (2026-04-14 09:33Z) Verified the extracted runtime path with `pnpm run build` and targeted Vitest coverage around `tests/agent-runner` and `tests/dispatch`.
- [x] (2026-04-14 09:40Z) Added `tests/agent-runner/attempt-executor.test.ts` to lock in the deeper attempt lifecycle boundary: start failure mapping, early init failure mapping, self-review emission, steer delegation, and abort behavior.
- [x] (2026-04-14 09:41Z) Added `tests/e2e/mocks/api-schema-parity.test.ts` to validate the default runtime snapshot builder, issue detail builder, attempt detail builder, drilldown scenario overrides, checkpoint payloads, and notifications payloads against the real Zod response schemas.
- [x] (2026-04-14 09:43Z) Fixed mock drift uncovered by the parity harness: model source values now use the real `default`/`override` enum and attempt / issue detail events now use the same camelCase event shape as the backend.
- [x] (2026-04-14 09:44Z) Fixed a real backend contract gap uncovered by the parity harness: attempt detail responses and OpenAPI schema now include the agent-authored PR `summary`, matching the operator UI and checked-in OpenAPI spec.
- [x] (2026-04-14 09:45Z) Removed the unused `src/agent-runner/agent-session.ts` wrapper after the new runtime port and attempt executor fully subsumed it.
- [x] (2026-04-14 10:14Z) Added `src/orchestrator/run-lifecycle-coordinator.ts` as the new deep orchestrator runtime boundary. It now owns the stable context, retry coordinator creation, queue refresh, running/retry reconciliation, launch dispatch, recent-event buffering, usage aggregation, and worker completion plumbing.
- [x] (2026-04-14 10:18Z) Rewired `src/orchestrator/orchestrator.ts` to delegate lifecycle work through `RunLifecycleCoordinator`, and reduced `src/orchestrator/orchestrator-delegates.ts` to a thin compatibility wrapper for older tests.
- [x] (2026-04-14 10:22Z) Replaced the old `RetryStateHandle` with `RetryRuntimeContext` so retry behavior depends on the shared orchestrator runtime surface instead of a second overlapping state contract.
- [x] (2026-04-14 10:25Z) Added `tests/orchestrator/run-lifecycle-coordinator.test.ts` to cover the scenario `dispatch -> failed outcome -> retry queued -> retry relaunch` through the new deep boundary.
- [x] (2026-04-14 10:33Z) Re-verified the orchestrator slice and the whole repo with `pnpm run build`, targeted orchestrator Vitest suites, full `pnpm test`, `pnpm run lint`, and `pnpm run format:check`. Lint still reports only the existing non-blocking max-lines warnings.
- [x] (2026-04-14 10:49Z) Routed outcome-view writeback behind the shared runtime surface by adding `buildOutcomeView`, `setDetailView`, and `setCompletedView` to the orchestrator context contracts. `worker-outcome/` handlers and retry failure paths now update views through coordinator-owned sinks instead of mutating the maps directly.
- [x] (2026-04-14 10:55Z) Moved snapshot and issue-detail projection behind `RunLifecycleCoordinator`, so `src/orchestrator/orchestrator.ts` now asks the coordinator for `buildSnapshot()` and `buildIssueDetail()` instead of reassembling `snapshotCallbacks()` over raw state.
- [x] (2026-04-14 10:55Z) Extended `tests/orchestrator/run-lifecycle-coordinator.test.ts` with a read-model boundary scenario and re-verified with `pnpm run build`, full `pnpm test` (`276` files passed, `3740` tests passed, `1` skipped), `pnpm run lint`, and `pnpm run format:check`. Lint still reports only the existing warning-only max-lines inventory.
- [x] (2026-04-14 11:04Z) Moved stop-signal and terminal-path orchestration behind the coordinator by adding coordinator-owned `finalizeStopSignal` and `finalizeTerminalPath` runtime methods. `src/orchestrator/worker-outcome/stop-signal.ts` and `src/orchestrator/worker-outcome/terminal-paths.ts` now dispatch through that runtime surface instead of owning a second implementation path.
- [x] (2026-04-14 11:05Z) Added coordinator boundary tests for blocked stop-signal handling and terminal cleanup auto-commit writeback, then re-verified with `pnpm run build`, full `pnpm test` (`276` files passed, `3742` tests passed, `1` skipped), `pnpm run lint`, and `pnpm run format:check`. Lint still reports only the existing warning-only max-lines inventory.
- [x] (2026-04-14 11:20Z) Removed the remaining worker-outcome compatibility shims by turning `terminal-paths.ts` and `stop-signal.ts` into strict coordinator adapters, added a test harness that attaches the real coordinator finalizers to lightweight outcome contexts, replaced the seam-heavy helper tests with adapter-level coverage, and added a coordinator boundary test for the `DONE` stop-signal + PR-registration path.
- [x] (2026-04-14 11:44Z) Deepened the runtime read-model boundary by introducing `createRuntimeReadModel()` inside `src/orchestrator/snapshot-builder.ts`, teaching `RunLifecycleCoordinator` to own snapshot, issue-detail, and attempt-detail projection through one shared read-model instance, and routing `Orchestrator.getAttemptDetail()` through that boundary.
- [x] (2026-04-14 11:45Z) Migrated the biggest remaining helper-shaped snapshot assertions upward: coordinator tests now cover attempt detail projection, running/completed/queued issue-detail scenarios, archived-event reuse, and live-event fallback, while `tests/orchestrator/snapshot-builder.test.ts` keeps only lower-level math, parsing, and edge-case coverage. Re-verified with `pnpm test -- tests/orchestrator/run-lifecycle-coordinator.test.ts tests/orchestrator/snapshot-builder.test.ts`, then full `pnpm test` (`276` files passed, `3687` tests passed, `1` skipped).
- [x] Milestone 3 is effectively finished: orchestrator launch, retry, completion, stop-signal, terminal cleanup, snapshot projection, issue detail, and attempt detail now all flow through `RunLifecycleCoordinator` and its shared runtime surfaces. The remaining `snapshot-builder.ts` size is an opportunistic cleanup target, not a blocker for the architecture milestone.
- [x] (2026-04-14 11:54Z) Started Milestone 4 by adding `frontend/src/state/runtime-client.ts` as the shared frontend runtime boundary. It now owns polling cadence, stale-banner handling, SSE connection/reconnect behavior, lifecycle-triggered refreshes, and browser-event fanout over one state/store surface.
- [x] (2026-04-14 11:55Z) Rewired `frontend/src/main.ts` to start the unified runtime client, turned `frontend/src/state/polling.ts` and `frontend/src/state/event-source.ts` into compatibility facades, added `tests/frontend/runtime-client.test.ts`, and re-verified with `pnpm run build`, full `pnpm test` (`277` files passed, `3689` tests passed, `1` skipped), `pnpm run lint`, and `pnpm run format:check`. Lint still reports only the existing warning-only inventory.
- [x] (2026-04-14 12:03Z) Landed the second Milestone 4 slice by teaching `runtime-client` to expose runtime-facing state and poll-complete subscriptions, then migrating `frontend/src/views/observability-view.ts`, `frontend/src/views/notifications-view.ts`, `frontend/src/pages/logs-view.ts`, and `frontend/src/components/issue-inspector.ts` off raw window event strings / direct SSE glue and onto the shared runtime boundary.
- [x] (2026-04-14 12:03Z) Re-verified the runtime-client slice with `pnpm run build`, full `pnpm test` (`277` files passed, `3691` tests passed, `1` skipped), `pnpm run lint`, and `pnpm run format:check`. Lint still reports only the existing warning-only max-lines inventory.
- [x] (2026-04-14 12:06Z) Completed the required visual smoke pass for the migrated frontend surfaces. `agent-browser` confirmed the observability, notifications, logs, and issue detail routes rendered the expected headings/content, saved screenshots under `docs/archive/visual-verify/screenshots/`, and reported empty browser `errors` / `console` output during the checks.
- [x] (2026-04-14 12:23Z) Landed the third Milestone 4 slice by migrating `frontend/src/pages/overview-view.ts` and `frontend/src/pages/queue-view.ts` off direct `store` / `state:update` usage. Overview now consumes state and webhook updates through `runtime-client`, and queue now consumes runtime state through `runtime-client` plus route changes through the new `router.subscribe()` boundary instead of parsing raw `router:navigate` window events itself.
- [x] (2026-04-14 12:23Z) Extended the frontend runtime boundary tests with webhook subscription coverage in `tests/frontend/runtime-client.test.ts`, then re-verified with `pnpm run build`, full `pnpm test` (`277` files passed, `3692` tests passed, `1` skipped), `pnpm run lint`, and `pnpm run format:check`. Lint still reports only the existing warning-only max-lines inventory.
- [x] (2026-04-14 12:26Z) Completed the required visual smoke pass for the overview and queue workbench surfaces. `agent-browser` confirmed `/`, `/queue`, and `/queue/NIN-176` rendered the expected overview, board, and drawer content under the new runtime/router boundaries, saved screenshots under `docs/archive/visual-verify/screenshots/`, and reported empty browser `errors` / `console` output during the checks.
- [x] (2026-04-14 12:33Z) Landed the fourth Milestone 4 slice by migrating `frontend/src/views/workspaces-view.ts` and `frontend/src/views/containers-view.ts` off the raw `state:update` seam. Workspaces now refreshes through `runtime-client` state and workspace-event subscriptions, while containers now renders directly from the shared runtime snapshot via `runtime-client` instead of owning its own `/api/v1/state` fetch loop.
- [x] (2026-04-14 12:33Z) Extended `tests/frontend/runtime-client.test.ts` with workspace-event subscription coverage, then re-verified with `pnpm run build`, full `pnpm test` (`277` files passed, `3693` tests passed, `1` skipped), `pnpm run lint`, and `pnpm run format:check`. Lint still reports only the existing warning-only max-lines inventory.
- [x] (2026-04-14 12:35Z) Completed the required visual smoke pass for the workspaces and containers surfaces. `agent-browser` confirmed `/workspaces` and `/containers` rendered the expected headings and runtime-driven content under the new `runtime-client` wiring, saved screenshots under `docs/archive/visual-verify/screenshots/`, and reported empty browser `errors` / `console` output during the checks.
- [x] (2026-04-14 12:38Z) Landed the fifth Milestone 4 slice by migrating `frontend/src/views/git-view.ts` off direct `state:update` usage and moving `frontend/src/views/codex-admin/codex-admin-view.ts` off its raw `risoluto:any-event` listener. Both now consume runtime changes through `runtime-client`, with Codex admin using a new unfiltered runtime-event subscription instead of binding directly to browser event names.
- [x] (2026-04-14 12:38Z) Extended `tests/frontend/runtime-client.test.ts` with generic runtime-event subscription coverage, then re-verified with `pnpm run build`, full `pnpm test` (`277` files passed, `3694` tests passed, `1` skipped), `pnpm run lint`, and `pnpm run format:check`. Lint still reports only the existing warning-only max-lines inventory.
- [x] (2026-04-14 12:40Z) Completed the required visual smoke pass for the git and Codex admin surfaces. `agent-browser` confirmed `/git` rendered the expected runtime-driven sections, saved `docs/archive/visual-verify/screenshots/git-runtime-client.png`, and reported empty browser `errors` / `console` output. It also confirmed `/settings#devtools` rendered the expected `Codex admin unavailable` fallback under the placeholder local env, saved `docs/archive/visual-verify/screenshots/codex-admin-runtime-client.png`, and reported empty browser `errors` / `console` output there as well.
- [x] Milestone 4 is effectively complete for page-level runtime-consumer migration. `runtime-client` now owns the shared frontend runtime data plane for the major operator surfaces, and the remaining raw browser listeners are mostly shared shell/router compatibility seams rather than major feature-consumer blockers.
- [x] (2026-04-14 14:10Z) Started Milestone 5 by deepening the Codex admin read boundary. Added `src/codex/admin-snapshot.ts` and `src/codex/model-catalog.ts`, introduced `/api/v1/codex/admin` as the backend-owned snapshot endpoint for the admin surface, reused the shared model-catalog fallback path in `src/http/routes/system.ts`, and moved `frontend/src/views/codex-admin/codex-admin-view.ts` onto the new `frontend/src/views/codex-admin/codex-admin-client.ts` loader instead of a page-local `Promise.all(...)` over ten API calls.
- [x] (2026-04-14 14:10Z) Added boundary coverage for the new Codex admin surface in `tests/http/codex-routes.test.ts`, `tests/frontend/api.test.ts`, and `tests/frontend/codex-admin-client.test.ts`, regenerated `docs-site/openapi.json`, and re-verified with `pnpm run build`, full `pnpm test` (`278` files passed, `3699` tests passed, `1` skipped), `pnpm run lint` (warning-only existing max-lines inventory), and `pnpm run format:check`.
- [x] (2026-04-14 14:12Z) Completed the required visual smoke pass for the deepened Codex admin surface. `agent-browser` confirmed `/settings#devtools` rendered the expected settings shell plus the `Codex admin unavailable` fallback under placeholder local env, saved `docs/archive/visual-verify/screenshots/codex-admin-control-plane.png`, and reported empty browser `errors` / `console` output during the check.
- [x] (2026-04-14 14:25Z) Landed the second Milestone 5 Codex admin slice by introducing `src/codex/admin-service.ts` as the feature-level mutation/read boundary for account auth, thread actions, MCP actions, and pending-request responses. `src/http/routes/codex.ts` now delegates those route handlers through the shared admin service instead of mirroring request-method strings inline, while the frontend moved the same action vocabulary into `frontend/src/views/codex-admin/codex-admin-client.ts`.
- [x] (2026-04-14 14:25Z) Migrated the remaining Codex admin panels off raw `api.postCodex*` calls. `frontend/src/views/codex-admin/codex-admin-account.ts`, `codex-admin-mcp.ts`, `codex-admin-threads.ts`, and `codex-admin-pending.ts` now depend on the feature client rather than panel-local API glue, and added/updated coverage in `tests/codex/admin-service.test.ts`, `tests/http/codex-routes.test.ts`, `tests/frontend/codex-admin-client.test.ts`, and `tests/frontend/api.test.ts`.
- [x] (2026-04-14 14:26Z) Re-verified the mutation-side Codex admin slice with `pnpm run build`, full `pnpm test` (`279` files passed, `3702` tests passed, `1` skipped), `pnpm run lint` (warning-only existing repo-wide max-lines inventory, `84` warnings), and `pnpm run format:check`.
- [x] (2026-04-14 14:26Z) Completed the required visual smoke pass for the mutation-side Codex admin work. `agent-browser` confirmed `/settings#devtools` still rendered the expected settings shell plus the `Codex admin unavailable` fallback under placeholder local env, saved `docs/archive/visual-verify/screenshots/codex-admin-mutations.png`, and reported empty browser `errors` / `console` output during the check.
- [x] (2026-04-14 14:53Z) Started the unified settings/config editing slice by introducing `frontend/src/features/settings/settings-workbench.ts` as the feature-level workbench boundary. Load, save, revert, mode switching, section visibility, and shared draft state transitions now live behind one settings workbench instead of being split across `settings-view.ts`, `settings-view-render.ts`, and `unified-settings-view.ts`.
- [x] (2026-04-14 14:53Z) Rewired the settings surface around that workbench. `frontend/src/features/settings/settings-view.ts` now consumes the workbench instead of owning its own async orchestration, `frontend/src/views/unified-settings-view.ts` caches a shared workbench rather than raw settings state, and `settings-sections.ts` now renders explicit per-section `Revert` and `Save ...` actions through workbench callbacks rather than relying on helper-shaped keyboard-only save behavior.
- [x] (2026-04-14 14:53Z) Added boundary coverage in `tests/frontend/settings-workbench.test.ts` for the new settings workbench lifecycle (`load -> save -> revert -> mode fallback`) and re-verified with `pnpm run build`, full `pnpm test` (`280` files passed, `3706` tests passed, `1` skipped), `pnpm run lint` (warning-only existing repo-wide max-lines inventory, `84` warnings), and `pnpm run format:check`.
- [x] (2026-04-14 14:53Z) Completed the required visual smoke pass for the unified settings slice. `agent-browser` confirmed `/settings` rendered the new per-section `Revert` and `Save ...` actions in Focused mode, confirmed Advanced mode exposed the expanded settings workbench surface, saved `docs/archive/visual-verify/screenshots/settings-workbench.png` and `docs/archive/visual-verify/screenshots/settings-workbench-advanced.png`, and reported empty browser `errors` / `console` output during the check. `expect` CLI was also installed and exercised against the local app, but both automated runs timed out under this local setup before returning a verdict, so manual browser evidence remains the trusted verification for this slice.
- [x] (2026-04-14 19:10Z) Landed the second unified settings pass by moving the shell-level settings boundary into `frontend/src/features/settings/unified-settings-page.ts`. Legacy `/config` and `/secrets` routing, hash-targeted section selection, advanced-mode forcing for credentials, devtools composition, and compatibility exports now live inside the settings feature boundary instead of being split between `frontend/src/views/unified-settings-view.ts` and wrapper-level helpers.
- [x] (2026-04-14 19:10Z) Added boundary coverage in `tests/frontend/unified-settings-page.test.ts` for legacy path normalization, hash-driven section targeting, and devtools expansion behavior, then re-verified with `pnpm run build`, full `pnpm test` (`281` files passed, `3709` tests passed, `1` skipped), `pnpm run lint` (warning-only existing repo-wide max-lines inventory, `84` warnings), and `pnpm run format:check`.
- [x] (2026-04-14 19:10Z) Completed the required visual smoke pass for the unified settings shell boundary. `agent-browser` confirmed `/settings`, `/settings#credentials`, `/settings#devtools`, `/config`, and `/secrets` all rendered the expected Settings shell, rewrote the legacy routes to `/settings#devtools` and `/settings#credentials`, auto-opened the devtools panel only for devtools-targeted routes, saved screenshots under `docs/archive/visual-verify/screenshots/`, and reported empty browser `errors` / `console` output during the check.
- [x] (2026-04-14 19:27Z) Started the setup/onboarding workflow slice by introducing `frontend/src/features/setup/setup-wizard.ts` as the setup lifecycle boundary. The wizard now owns per-step state, async setup actions, device-auth orchestration, reset behavior, and dashboard handoff behind one feature module instead of spreading that lifecycle across `frontend/src/views/setup-view.ts` and `frontend/src/views/setup-openai-controller.ts`.
- [x] (2026-04-14 19:27Z) Rewired `frontend/src/views/setup-view.ts` into a render-focused shell around that wizard boundary and added `tests/frontend/setup-wizard.test.ts` to cover the main setup scenarios (`initialize -> generate master key`, `verify Linear -> select project`, `save repo route`, and `advance proxy-provider auth`), then re-verified with `pnpm run build`, full `pnpm test` (`282` files passed, `3713` tests passed, `1` skipped), `pnpm run lint` (warning-only existing repo-wide max-lines inventory, `84` warnings), and `pnpm run format:check`.
- [x] (2026-04-14 19:27Z) Completed the required visual smoke pass for the setup wizard boundary. `agent-browser` confirmed `/setup` rendered the expected `Welcome to Risoluto` heading plus all 5 step indicators under the new wizard lifecycle, saved `docs/archive/visual-verify/screenshots/setup-wizard-boundary.png`, and reported empty browser `errors` / `console` output during the check.
- [x] (2026-04-14 20:19Z) Deepened the backend half of setup by introducing `src/setup/setup-service.ts` as the shared onboarding service boundary. Status, master-key creation, Linear project selection/listing, OpenAI/Codex auth persistence, PKCE lifecycle, GitHub token validation, test issue creation, label creation, project creation, and reset now live behind one setup service instead of being split across the `src/setup/handlers/*.ts` family.
- [x] (2026-04-14 20:19Z) Rewired `src/setup/api.ts` to depend on the shared setup service and turned the handler family into thin HTTP adapters. Added `tests/setup/setup-service.test.ts` to cover cross-step service scenarios (`status -> master key -> Linear project -> Codex auth` and reset), then re-verified with `pnpm run build`, full `pnpm test` (`283` files passed, `3715` tests passed, `1` skipped), `pnpm run lint` (warning-only existing repo-wide max-lines inventory, `85` warnings), and `pnpm run format:check`.
- [x] (2026-04-14 20:28Z) Finished the remaining setup backend seams by moving repo-route persistence/listing/deletion and GitHub default-branch detection behind `src/setup/setup-service.ts`. `src/setup/repo-route-handlers.ts` and `src/setup/detect-default-branch.ts` are now thin adapters, `src/setup/api.ts` routes those endpoints through the shared service, and `tests/setup/setup-service.test.ts` now covers repo-route lifecycle plus default-branch fallback through the deep boundary. Re-verified with `pnpm run build` and `pnpm test` (`283` files passed, `3717` tests passed, `1` skipped).
- [x] (2026-04-14 20:40Z) Deepened the logs/live timeline workflow behind `frontend/src/features/logs/logs-timeline.ts`. The new controller now owns mode switching, live/archive refresh, SSE lifecycle subscriptions, buffering, filter/search state, sort/density/follow toggles, expanded payload state, copy-all text, and new-event indicator state. `frontend/src/pages/logs-view.ts` is now a render-focused shell over that controller, and `frontend/src/pages/logs-filter-bar.ts` no longer mutates filter state directly.
- [x] (2026-04-14 20:40Z) Added `tests/frontend/logs-timeline.test.ts` to cover the deep logs boundary (`initialize/load`, `stream merge + unseen count`, and `lifecycle reconcile + archive switch teardown`). Re-verified with `pnpm run build`, full `pnpm test` (`284` files passed, `3720` tests passed, `1` skipped), `pnpm run lint` (warning-only baseline, `85` warnings, `0` errors), and `pnpm run format:check`. UI verification also passed via targeted Playwright smoke coverage on `tests/e2e/specs/smoke/logs-detail.smoke.spec.ts` and `tests/e2e/specs/smoke/logs-sse.smoke.spec.ts` (`15` tests passed). Ad hoc `agent-browser` verification on the live local app produced screenshots but the local runtime navigated away from the intended logs surface, so Playwright smoke served as the reliable visual proof for this slice.
- [x] (2026-04-15 00:32Z) Deepened the queue operator workflow behind `frontend/src/features/queue/queue-workbench.ts`. The new workbench now owns runtime snapshot sync, route-aware inspector selection, refresh throttling, keyboard issue actions, filter/view state mutations, and the queue toolbar’s action vocabulary behind one feature boundary instead of leaving that lifecycle inside `frontend/src/pages/queue-view.ts`.
- [x] (2026-04-15 00:32Z) Rewired `frontend/src/pages/queue-view.ts`, `frontend/src/pages/queue-toolbar.ts`, and `frontend/src/pages/queue-board.ts` into render helpers over the new queue workbench and added `tests/frontend/queue-workbench.test.ts` to cover runtime hydration, route selection, refresh throttling, and keyboard/filter behavior through the deep boundary. Re-verified with `pnpm run build`, full `pnpm test` (`285` files passed, `3723` tests passed, `1` skipped), `pnpm run lint` (warning-only baseline, `85` warnings, `0` errors), and `pnpm run format:check`.
- [x] (2026-04-15 00:32Z) Completed targeted queue surface verification with Playwright smoke coverage on `tests/e2e/specs/smoke/queue-issue.smoke.spec.ts` (`9` tests passed). The queue visual regression spec still reports a baseline diff in the toolbar/state-guide region (`tests/e2e/specs/visual/queue.visual.spec.ts`), so the slice is functionally verified but still needs a follow-up decision on whether the visual change is acceptable baseline drift or a layout regression to fix.
- [x] (2026-04-15 00:58Z) Resolved the remaining queue follow-up by tightening the queue toolbar/header layout into the intended stacked-row composition, re-running smoke coverage, refreshing the queue visual baseline snapshot, and confirming the visual spec now passes cleanly.
- [x] (2026-04-15 00:59Z) Fixed a real Codex control-plane runtime regression surfaced by local `pnpm run dev` logs. `src/codex/runtime-config.ts` now always writes a provider `name` into `config.toml`, falling back to the provider id when config omits a display name, and regression coverage now locks that behavior in `tests/codex/runtime-config.test.ts` plus `tests/codex/runtime-config.integration.test.ts`.
- [x] Milestone 5 is now complete: settings, setup, logs, queue, and Codex admin all have their first deep feature boundaries, and the remaining queue visual-baseline drift is no longer blocking the visual suite.
- [x] (2026-04-15 01:13Z) Started Milestone 6 with the webhook intake family. Added `src/webhook/delivery-workflow.ts` as the shared verified-delivery boundary for “ack now, process async” and “dedupe before acting” flows, rewired `src/http/webhook-handler.ts`, `src/http/github-webhook-handler.ts`, and `src/http/trigger-handler.ts` onto it, and added `tests/webhook/delivery-workflow.test.ts` as the shared boundary harness.
- [x] (2026-04-15 01:13Z) Re-verified the first Milestone 6 slice with `pnpm run build` and webhook-focused coverage. The targeted command triggered the full Vitest suite, which still passed (`286` files passed, `3727` tests passed, `1` skipped), so the new webhook boundary is proven against both narrow and repo-wide checks.
- [x] (2026-04-15 01:29Z) Landed the second Milestone 6 slice by adding `src/github/transport.ts` as the shared GitHub request boundary and rewiring `src/git/github-pr-client.ts` plus `src/github/issues-client.ts` onto it. The new transport now owns GitHub URL building, auth-header assembly, enterprise GraphQL endpoint derivation, and tolerant payload parsing, while the two public clients keep their existing error semantics and header/token behavior.
- [x] (2026-04-15 01:29Z) Re-verified the GitHub transport slice with `pnpm run build`, `pnpm exec vitest run tests/git/github-pr-client.test.ts tests/github/issues-client.test.ts tests/github/issues-client-extended.test.ts tests/git/pr-review-ingester.test.ts tests/git/manager.test.ts` (`5` files passed, `99` tests passed), `pnpm run lint` (warning-only baseline, `83` warnings, `0` errors), and `pnpm run format:check`.
- [x] (2026-04-15 01:47Z) Landed the third Milestone 6 slice on the shared storage side by grouping operator-facing SQLite stores under `PersistenceRuntime.operator`, adding `src/notification/notification-center.ts` as the shared notification/alert-history service boundary for HTTP flows, and adding `src/alerts/alert-pipeline.ts` so event-bus subscription in `src/alerts/engine.ts` is now a thin adapter over one alert workflow module instead of owning cooldown, delivery, and history persistence directly.
- [x] (2026-04-15 01:47Z) Re-verified the storage/workflow slice with `pnpm run build`, `pnpm exec vitest run tests/http/routes.test.ts tests/alerts/engine.test.ts tests/alerts/alert-pipeline.test.ts tests/notification/manager.test.ts tests/notification/notification-center.test.ts tests/http/notifications-handler.test.ts tests/http/alerts-handler.test.ts tests/persistence/sqlite/notification-store.test.ts` (`8` files passed, `103` tests passed), `pnpm run lint` (warning-only baseline, `83` warnings, `0` errors), and `pnpm run format:check`.
- [x] (2026-04-15 01:57Z) Landed the fourth Milestone 6 slice by extracting `src/workspace/lifecycle.ts` as the real workspace ensure/remove/hook/protection boundary and turning `src/workspace/manager.ts` into a thin stable facade over that lifecycle. In parallel, config derivation now flows through `src/config/derivation-pipeline.ts`, with subsection builders moved behind `src/config/section-builders.ts` so `src/config/builders.ts` is now the stable compatibility surface instead of the whole pipeline implementation.
- [x] (2026-04-15 01:57Z) Added direct boundary coverage in `tests/workspace/lifecycle.test.ts` and `tests/config/derivation-pipeline.test.ts`, then re-verified the workspace/config slice with `pnpm run build`, `pnpm exec vitest run tests/workspace/manager.test.ts tests/workspace/manager.integration.test.ts tests/workspace/lifecycle.test.ts tests/config/builders.test.ts tests/config/derivation-pipeline.test.ts tests/config/resolvers.test.ts tests/config/notification-config.test.ts tests/config/webhook.test.ts tests/integration/config-workflow.integration.test.ts` (`7` files passed, `78` tests passed), `pnpm run lint` (warning-only baseline, `82` warnings, `0` errors), and `pnpm run format:check`.
- [x] (2026-04-15 07:05Z) Landed the final Milestone 6 slice by adding `PersistenceRuntime.webhook`, introducing `src/persistence/sqlite/webhook-persistence.ts` plus `src/webhook/runtime.ts`, and rewiring `src/webhook/composition.ts` / `src/cli/services.ts` so webhook inbox persistence, recent-delivery snapshot reads, registrar-driven secret resolution, health tracking, and handler-dependency assembly now live behind one runtime boundary instead of adjacent composition-time objects.
- [x] (2026-04-15 07:06Z) Added direct boundary coverage in `tests/webhook/runtime.test.ts` and `tests/persistence/sqlite/runtime.test.ts`, then re-verified the final webhook/persistence slice with `pnpm run build`, `pnpm exec vitest run tests/webhook/runtime.test.ts tests/persistence/sqlite/runtime.test.ts tests/cli/services.integration.test.ts tests/webhook/registrar.test.ts tests/webhook/health-tracker.test.ts tests/persistence/sqlite/webhook-inbox.test.ts` (`5` files passed, `67` tests passed), `pnpm run lint` (warning-only existing max-lines baseline, `83` warnings, `0` errors), and `pnpm run format:check`.
- [x] Milestone 6 is now complete: webhook intake, GitHub transport, operator-side persistence, workspace lifecycle, config derivation, and the remaining webhook/persistence runtime ownership all sit behind deeper boundaries instead of table- or handler-shaped seams.

## Surprises & Discoveries

- Observation: the first new boundary test immediately exposed a real abort bug in the extracted attempt executor.
  Evidence: `createAbortSignalBridge()` originally mixed “detach upstream listener” and “abort active run”, so `ActiveAttempt.abort()` did nothing when called without a reason string.

- Observation: the new schema parity harness exposed backend and mock drift that existing UI smoke tests did not catch.
  Evidence: default mock builders were using `modelSource: "config"` even though the real response schema only allows `"default"` or `"override"`.

- Observation: the parity harness also exposed a real backend documentation mismatch, not just a mock bug.
  Evidence: `frontend/src/views/attempt-view.ts` already rendered `attempt.summary`, mock attempt detail payloads already carried `summary`, but `src/http/response-schemas.ts` and `docs-site/openapi.json` omitted it from attempt detail responses.

- Observation: `src/agent-runner/agent-session.ts` became dead code after the runtime port and attempt executor landed.
  Evidence: `rg -n "AgentSession|agent-session" src tests docs` only returned the file itself before deletion.

- Observation: the retry lifecycle did not actually need a separate state handle once the orchestrator had a real runtime boundary.
  Evidence: `src/orchestrator/retry-coordinator.ts` now accepts `RetryRuntimeContext`, which is just the shared orchestrator runtime surface, and the existing retry and worker-outcome test suites continued to pass without retry-specific adapter code.

- Observation: object-literal getters were the wrong implementation tool for the new coordinator because ESLint forbids aliasing `this` inside the builder.
  Evidence: the first coordinator draft triggered `@typescript-eslint/no-this-alias`, and switching to `Object.defineProperties()` preserved the live state view while keeping lint green.

- Observation: once outcome-view writes moved behind the new context methods, the only regression was a stale helper test double rather than a runtime bug.
  Evidence: the first post-refactor full Vitest run failed only in `tests/orchestrator/write-linear-completion.test.ts` with `TypeError: ctx.buildOutcomeView is not a function`; updating that harness restored green without production changes.

- Observation: `Orchestrator` still contained a read-side architecture seam even after launch/retry/completion behavior moved behind the coordinator.
  Evidence: `snapshotCallbacks()` in `src/orchestrator/orchestrator.ts` was still reconstructing model resolution, template lookup, watchdog health, webhook health, and raw state-map access outside the deep runtime boundary.

- Observation: the remaining `worker-outcome` architecture pain was no longer branching logic selection, but side-effect ownership.
  Evidence: `src/orchestrator/worker-outcome/terminal-paths.ts` and `src/orchestrator/worker-outcome/stop-signal.ts` were still owning workspace cleanup, attempt update persistence, PR registration, notifications, completion views, and tracker writeback even after launch/retry/read-model work had moved behind the coordinator. This slice removed that duplicate ownership and left only adapter calls to coordinator-owned finalizers.

- Observation: the coordinator-finalizer test harness was the cleanest migration bridge for Milestone 3.
  Evidence: attaching the real coordinator `finalizeTerminalPath` / `finalizeStopSignal` methods to lightweight `OutcomeContext` fixtures let `handleWorkerOutcome` and retry tests keep their branch coverage while deleting the old helper fallback implementations entirely.

- Observation: once the coordinator owned the read-model entrypoints too, the biggest remaining snapshot assertions could move upward without losing coverage.
  Evidence: completed-issue archived-event reuse, queued live-event fallback, and attempt detail projection now pass through `tests/orchestrator/run-lifecycle-coordinator.test.ts`, while `tests/orchestrator/snapshot-builder.test.ts` can focus on lower-level token math, app-server parsing, and event-cache edge cases.

- Observation: the Codex admin mutation surface had the same shallow shape as the old read side even after the new snapshot endpoint landed.
  Evidence: account auth, thread actions, MCP actions, and pending-request responses were still split between panel-local `api.postCodex*` calls on the frontend and one-endpoint-per-action string dispatch inside `src/http/routes/codex.ts`.

- Observation: keeping the existing HTTP endpoints stable still allowed the architecture to deepen meaningfully.
  Evidence: `src/codex/admin-service.ts` and `frontend/src/views/codex-admin/codex-admin-client.ts` now own the mutation vocabulary without requiring an API-surface rewrite, and route/client tests moved up to those feature boundaries instead of asserting panel-by-panel transport details.

- Observation: the unified settings surface was still hiding workbench behavior behind renderer helpers even after the page looked “feature complete.”
  Evidence: `frontend/src/features/settings/settings-view.ts` owned async load/save orchestration, `settings-view-render.ts` was still mutating loaded state as a side effect, and `unified-settings-view.ts` cached raw settings state separately from the page lifecycle.

- Observation: the new settings slice exposed a real UX gap as well as an architecture seam.
  Evidence: section save behavior existed in code via keyboard shortcuts, but the visible section cards did not expose matching save/revert actions. The new workbench boundary made it straightforward to render explicit per-section actions through one callback surface.

- Observation: `expect` could connect to the local app and ACP adapter, but it did not complete either settings verification run before timeout.
  Evidence: both `expect tui ... --ci` runs reached ACP session creation in `.expect/logs.md`, then timed out after 2-3 minutes without a final verdict. Manual `agent-browser` verification therefore remained the reliable browser evidence for this slice.

- Observation: the remaining unified settings shallowness lived in the shell wrapper, not in the workbench lifecycle itself.
  Evidence: legacy path normalization, hash-targeted deep links, credentials-mode forcing, and devtools composition were all still split across `frontend/src/views/unified-settings-view.ts`, helper utilities, and wrapper-owned cache logic even after `settings-workbench.ts` existed.

- Observation: the setup wizard's biggest frontend seam was lifecycle ownership, not step rendering.
  Evidence: `frontend/src/views/setup-view.ts` was simultaneously owning singleton state, async API workflows, device-auth orchestration, reset logic, step navigation, and DOM rendering. Once those transitions moved into `frontend/src/features/setup/setup-wizard.ts`, the page could become a render shell and the workflow became directly unit-testable.

- Observation: the backend setup shallowness was mostly in duplicated workflow ownership, not in the request parsing itself.
  Evidence: `src/setup/api.ts` was fanning out into a long list of handlers, and the real onboarding behavior lived across `status`, `master-key`, `linear-project`, `openai-key`, `codex-auth`, `pkce-auth`, `github-token`, `test-issue`, `label`, `project`, and `reset` handlers plus shared helper files. Moving that behavior into `src/setup/setup-service.ts` let the handlers become thin HTTP adapters without changing the public setup endpoints.

- Observation: the frontend runtime split was shallow in exactly the way Milestone 4 predicted.
  Evidence: `frontend/src/main.ts` was booting polling and SSE separately, `frontend/src/state/polling.ts` owned fetch cadence plus stale-banner DOM writes, and `frontend/src/state/event-source.ts` separately owned reconnect timing and browser-event dispatch for the same runtime feed.

- Observation: the first batch of feature migrations confirmed that most remaining frontend runtime pain is consumer glue, not transport wiring.
  Evidence: `observability-view`, `notifications-view`, `logs-view`, and `issue-inspector` were each mixing page-local fetch logic with raw `window` event names or direct event-source assumptions, and all four could switch to `runtime-client` subscriptions without changing their user-visible behavior.

- Observation: the overview and queue work confirmed that the remaining operator-surface seams are split across two globals, not one.
  Evidence: `overview-view` was still depending on direct `store` reads plus raw webhook browser events, while `queue-view` was coupling direct store reads with `state:update` and a hand-parsed `router:navigate` event. Finishing this slice required deepening both the runtime subscription surface and the router subscription surface.

- Observation: the queue page was still shallower than Milestone 4 made it look because the page shell owned the operator workflow even after runtime-client migration.
  Evidence: `frontend/src/pages/queue-view.ts` still carried refresh throttling, route-driven inspector state, keyboard actions, toolbar mutation ownership, and runtime synchronization in one render module until the new `queue-workbench` absorbed that behavior.

- Observation: the queue smoke suite stayed green after the workbench refactor, but the visual snapshot still moved in the toolbar/state-guide region.
  Evidence: `tests/e2e/specs/smoke/queue-issue.smoke.spec.ts` passed all `9` queue flows after the refactor, while `tests/e2e/specs/visual/queue.visual.spec.ts` reported a `0.03` image diff ratio against the existing `queue-board.png` baseline.

- Observation: once the queue toolbar returned to the intended stacked-row composition, the remaining visual mismatch was baseline drift rather than an active regression.
  Evidence: queue smoke coverage stayed green, direct `agent-browser` verification on `http://127.0.0.1:4000/queue` showed the expected controls and no browser errors, and regenerating the queue visual snapshot immediately produced a clean rerun of `tests/e2e/specs/visual/queue.visual.spec.ts`.

- Observation: the containers surface was shallower than it first looked because it was bypassing the shared runtime boundary entirely.
  Evidence: `frontend/src/views/containers-view.ts` was re-fetching `/api/v1/state` and then listening to `state:update` only to trigger another fetch, even though the exact same snapshot already lived in the shared app store. Moving it to `runtime-client.getAppState()` plus `subscribeState()` removed a redundant transport hop as well as the browser-global listener.

- Observation: Codex admin no longer fit the simple “state subscription” pattern, but it still had the same architectural smell.
  Evidence: `frontend/src/views/codex-admin/codex-admin-view.ts` was not depending on `state:update`; instead it listened directly to `risoluto:any-event` and reimplemented event filtering inside the view. Adding a generic runtime-event subscription to `runtime-client` let that feature depend on the shared data plane without changing its refresh behavior.

- Observation: after the git and Codex admin migrations, the remaining Milestone 4 browser-global listeners are mostly shell-level seams instead of page-level operator features.
  Evidence: raw `router:navigate` listeners now primarily live in shared shell utilities like `frontend/src/main.ts`, `frontend/src/utils/page.ts`, and `frontend/src/ui/sidebar.ts`, while the largest feature consumers have already moved onto `runtime-client` and `router.subscribe()`.

- Observation: the Codex admin page’s real shallow seam was its read-model assembly, not only its event refresh path.
  Evidence: `frontend/src/views/codex-admin/codex-admin-view.ts` was fetching capabilities, account, rate limits, models, threads, features, collaboration modes, MCP status, and pending requests through ten separate API calls and then reconstructing the dashboard shape locally. Replacing that fan-out with a backend-owned `/api/v1/codex/admin` snapshot collapsed the same operator concept behind one stable boundary.

- Observation: the deepened snapshot endpoint preserved the expected placeholder-env fallback behavior for local QA.
  Evidence: during visual verification, `/settings#devtools` still rendered `Codex admin unavailable` with empty browser `errors` / `console` output while the backend logged expected local-environment auth/config noise (`LINEAR_API_KEY=dummy`, control-plane startup warnings). That indicates the UI fallback path still works even when the underlying control plane is not fully available.

- Observation: Codex runtime config still had a robustness gap outside the main admin/control-plane architecture slice.
  Evidence: local `pnpm run dev` logs showed `config.toml:5:1: missing field 'name'` from the Codex control-plane app-server path. The root cause was `buildConfigToml()` treating `codex.provider.name` as optional even though the downstream config schema requires each provider table to include `name`.

- Observation: the three webhook entrypoints shared the same intake lifecycle even though they exposed different HTTP behaviors.
  Evidence: Linear and GitHub both did “persist verified delivery -> skip duplicates -> accept immediately -> async process,” while the trigger route did the same dedupe insert before acting synchronously. Pulling that logic into `src/webhook/delivery-workflow.ts` reduced repeated inbox handling without forcing the handlers to share unrelated auth or payload parsing code.

- Observation: GitHub transport consolidation needed a lower-level shared boundary than a one-size-fits-all client merge.
  Evidence: `GitHubPrClient` intentionally throws raw `GitHubApiError`s, lower-case `authorization` headers, and hard-fails on missing token env vars, while `GitHubIssuesClient` intentionally wraps transport/HTTP/JSON failures in `GitHubIssuesClientError`, uses `Authorization`, and still sends `Bearer ` when no token is configured. A shared request transport preserved those contracts while still deleting duplicate URL/header/auth logic.

- Observation: the notification/alert seam was split in two directions at once: workflow logic was shallow in `AlertEngine`, and storage ownership was shallow in service bootstrap.
  Evidence: `src/alerts/engine.ts` previously owned event filtering, cooldown, delivery, and alert-history writeback directly, while `src/cli/services.ts` separately instantiated `NotificationStore`, `AutomationStore`, and `AlertHistoryStore` as loose table-oriented objects. Pulling workflow into `src/alerts/alert-pipeline.ts` and grouping those stores under `PersistenceRuntime.operator` deepened both seams in the same pass.

- Observation: the workspace architecture pain was less about path math than about lifecycle ownership.
  Evidence: `src/workspace/manager.ts` previously owned strategy selection, directory/worktree creation, transient cleanup, hook execution, and pre-removal protection in one broad class, while `src/orchestrator/workspace-preparation.ts` had to treat that broad surface as one dependency. Extracting `src/workspace/lifecycle.ts` made the lifecycle itself the module boundary and left the manager as a compatibility facade.

- Observation: the config derivation seam was mostly orchestration drift rather than subsection logic bugs.
  Evidence: subsection builder logic was already mostly coherent, but the end-to-end flow from merged raw config map to final `ServiceConfig` was still hidden inside `src/config/builders.ts` along with the low-level section builders. Splitting `src/config/derivation-pipeline.ts` from `src/config/section-builders.ts` made the derivation passes explicit without changing the stable `deriveServiceConfig()` entrypoint.

## Decision Log

- Decision: keep the public `AgentRunner.runAttempt()` contract stable while deepening the architecture behind it.
  Rationale: orchestrator callers and dispatch code are already broad enough; we get immediate architectural value by collapsing internal lifecycle seams without forcing a cross-system API migration first.
  Date/Author: 2026-04-14 / Codex

- Decision: introduce the `CodexRuntimePort` and `AttemptExecutor` as the first deep module boundary in the program.
  Rationale: agent startup, initialization, turn execution, self-review, shutdown, and lifecycle failure mapping were spread across too many files and tests. This boundary lets us test the full attempt lifecycle with a fake runtime instead of mocking peer modules.
  Date/Author: 2026-04-14 / Codex

- Decision: add schema parity tests in `tests/e2e/mocks/` before touching more frontend runtime architecture.
  Rationale: the Playwright mock layer is effectively a second API implementation. We need a guardrail before deeper frontend refactors, otherwise we risk “green” UI tests that validate invalid payloads.
  Date/Author: 2026-04-14 / Codex

- Decision: treat missing `attempt.summary` in attempt detail responses as a backend contract bug and fix the real view/schema instead of weakening the new parity tests.
  Rationale: the operator UI already consumes the summary, the mock layer already modeled it, and the backend has the underlying data. The schema needed to catch up to shipped behavior.
  Date/Author: 2026-04-14 / Codex

- Decision: delete `src/agent-runner/agent-session.ts` after verifying no live references remained.
  Rationale: leaving an unused hollow wrapper would preserve the exact shallow-module pattern this program is meant to remove.
  Date/Author: 2026-04-14 / Codex

- Decision: introduce `RunLifecycleCoordinator` as the stable orchestrator runtime boundary instead of attempting a one-shot rewrite of `Orchestrator`.
  Rationale: the biggest current backend pain is the launch/retry/completion lifecycle being scattered across context construction, worker launch helpers, and retry coordination. A deep runtime coordinator gives us one place to evolve that lifecycle while keeping the public `Orchestrator` API stable.
  Date/Author: 2026-04-14 / Codex

- Decision: keep `src/orchestrator/orchestrator-delegates.ts` only as a compatibility shim for older tests while migrating the real behavior to `src/orchestrator/run-lifecycle-coordinator.ts`.
  Rationale: this keeps the branch low-risk and preserves local test ergonomics, while making it clear that the new coordinator is the source of truth for future Milestone 3 work.
  Date/Author: 2026-04-14 / Codex

- Decision: replace `RetryStateHandle` with `RetryRuntimeContext` instead of inventing a second lifecycle abstraction.
  Rationale: the old split encoded the same state in two shapes. Reusing the shared orchestrator runtime surface removes duplication and keeps retry behavior anchored to the same boundary used by launch and outcome handling.
  Date/Author: 2026-04-14 / Codex

- Decision: route outcome detail/completed view writes through `OutcomeContext.buildOutcomeView`, `setDetailView`, and `setCompletedView` instead of letting outcome handlers mutate runtime maps directly.
  Rationale: the coordinator should own the write-side projection surface just as it owns launch and retry lifecycle state. This keeps view writeback behavior behind the same deep module boundary and makes helper tests depend on a stable runtime contract instead of concrete map mutation.
  Date/Author: 2026-04-14 / Codex

- Decision: move snapshot and issue-detail projection behind `RunLifecycleCoordinator` while keeping snapshot caching and wire serialization in `Orchestrator`.
  Rationale: the coordinator now owns the runtime read-model assembly, but `Orchestrator` still benefits from owning cache invalidation and HTTP-facing serialization. This deepens the lifecycle boundary without forcing a one-shot redesign of snapshot caching.
  Date/Author: 2026-04-14 / Codex

- Decision: finish the stop-signal / terminal-path migration by deleting the remaining fallback logic from the helper exports and teaching tests to attach the coordinator’s real finalizers instead.
  Rationale: keeping two implementations alive was no longer buying safety; it was preserving the exact shallow seam this milestone is meant to remove. The test-harness route keeps `handleWorkerOutcome` and retry coverage intact while moving the behavior source of truth fully behind the coordinator.
  Date/Author: 2026-04-14 / Codex

- Decision: treat `createRuntimeReadModel()` plus coordinator-owned read-model scenario tests as the Milestone 3 finish line, while leaving compatibility wrappers in `snapshot-builder.ts` temporarily in place.
  Rationale: the architectural goal of the milestone was to move orchestrator read/write lifecycle behavior behind one deeper boundary, not to force a risky one-shot deletion of every legacy export. Once snapshot, issue detail, and attempt detail all flowed through the coordinator and the largest helper-shaped assertions moved to boundary tests, the milestone’s main leverage target was met.
  Date/Author: 2026-04-14 / Codex

- Decision: start Milestone 4 with a `runtime-client` orchestrator module and keep `polling.ts` / `event-source.ts` as thin compatibility facades during migration.
  Rationale: the user-facing breakage risk is in boot flow and page subscriptions, not in the existence of the old module names. Centralizing the behavior first gives the frontend one runtime source of truth without forcing a one-shot rewrite of every consumer.
  Date/Author: 2026-04-14 / Codex

- Decision: add `router.subscribe()` as a low-level navigation boundary while keeping the existing `router:navigate` browser event for compatibility.
  Rationale: the queue workbench still needed route-awareness, but parsing raw custom-event payloads inside page code preserved the exact shallow module pattern this milestone is trying to remove. The new subscription API lets feature code depend on the router object directly while avoiding a risky one-shot migration of every existing listener.
  Date/Author: 2026-04-14 / Codex

- Decision: let runtime-backed read-only pages render from `runtime-client` state directly instead of keeping page-local `api.getState()` loops when no page-specific endpoint is needed.
  Rationale: Milestone 4 is about deepening the frontend runtime boundary, not just renaming listeners. When a surface only needs the global runtime snapshot, keeping its own fetch loop preserves duplicate transport logic and makes the shared state plane shallower than it needs to be.
  Date/Author: 2026-04-14 / Codex

- Decision: add an unfiltered runtime-event subscription to `runtime-client` instead of letting event-driven pages bind directly to `risoluto:any-event`.
  Rationale: the later Milestone 4 work showed that not every operator surface is state-driven; some are event-driven. A shared subscription surface still gives those pages a deeper dependency than raw browser event strings and keeps the frontend runtime plane centralized.
  Date/Author: 2026-04-14 / Codex

- Decision: migrate Milestone 4 consumers page-by-page onto `runtime-client` subscriptions before deleting compatibility facades.
  Rationale: operator pages are where raw browser event strings and mixed api/store/SSE glue currently leak. Moving those consumers first deepens the real feature boundary while keeping `polling.ts` and `event-source.ts` available as low-risk migration shims.
  Date/Author: 2026-04-14 / Codex

- Decision: treat Milestone 4 as effectively complete once the remaining page-level runtime consumers moved behind `runtime-client`, even if a few shared shell/router compatibility listeners still remain.
  Rationale: the milestone target was to deepen the runtime data plane for feature code, not to force a risky one-shot deletion of every compatibility event in the app shell. The remaining cleanup is now small shared-infrastructure work, so the next architectural leverage is in the deeper operator/control-plane milestones.
  Date/Author: 2026-04-14 / Codex

- Decision: start the Codex admin/control-plane architecture work with a backend-owned admin snapshot plus a frontend admin client instead of trying to collapse every admin mutation route at once.
  Rationale: the worst current shallowness was on the read side, where the page itself was orchestrating ten different API calls and owning the view-model assembly. Moving that aggregation behind `/api/v1/codex/admin` creates a deeper boundary immediately, keeps the existing mutation endpoints stable, and gives later work a cleaner place to pull account/thread/MCP actions behind feature-level services.
  Date/Author: 2026-04-14 / Codex

- Decision: deepen the Codex admin mutation path behind `src/codex/admin-service.ts` and `frontend/src/views/codex-admin/codex-admin-client.ts` before attempting any endpoint consolidation.
  Rationale: the highest leverage was to stop mirroring the shallow route surface in both the backend route file and the frontend panels. Centralizing the mutation vocabulary first keeps compatibility stable, reduces panel-local transport glue, and leaves any future endpoint cleanup as an incremental follow-on instead of a risky prerequisite.
  Date/Author: 2026-04-14 / Codex

- Decision: consolidate GitHub transport incrementally under the existing public clients instead of merging every GitHub-facing class in one step.
  Rationale: the duplicated REST transport logic was the cleanest seam to remove first, but the PR client and issues client still intentionally differ in token fallback, auth-header casing, and error wrapping. A shared request transport gives us the architecture win now while keeping `GitHubPrClient`, `GitHubIssuesClient`, and the `gh`-based review ingester stable for the next Milestone 6 passes.
  Date/Author: 2026-04-15 / Codex

- Decision: deepen the notification/alert area with one operator-facing service plus one alert workflow boundary, rather than collapsing every store interface into a brand-new port in one pass.
  Rationale: the biggest leverage was to stop splitting notification timeline reads, Slack test dispatch, alert-history reads, and alert rule execution across handlers, bootstrap wiring, and the engine itself. `NotificationCenter` and `AlertPipeline` give the backend two deeper boundaries immediately, while `PersistenceRuntime.operator` removes table-oriented store construction from the main service bootstrap without forcing a disruptive API rewrite first.
  Date/Author: 2026-04-15 / Codex

- Decision: extract workspace lifecycle and config derivation as explicit implementation modules while keeping `WorkspaceManager` and `deriveServiceConfig()` stable as compatibility facades.
  Rationale: both areas already had broad caller surfaces and lots of existing tests. The highest-leverage, lowest-risk move was to deepen the internal boundaries first so future changes land in `workspace/lifecycle.ts` and `config/derivation-pipeline.ts` rather than spreading across the public compatibility layers.
  Date/Author: 2026-04-15 / Codex

- Decision: finish Milestone 6 with a webhook-domain persistence surface plus a dedicated webhook runtime boundary, while keeping `initWebhookInfrastructure()` and the service-level webhook fields stable for callers.
  Rationale: the remaining shallow seam was no longer the receiver handlers; it was the fact that inbox persistence, health tracking, registration, secret refs, and handler wiring were still assembled as sibling helpers over a table-oriented store. `PersistenceRuntime.webhook` and `src/webhook/runtime.ts` deepen that lifecycle without forcing a risky rewrite of CLI boot or route contracts.
  Date/Author: 2026-04-15 / Codex

- Decision: introduce a `settings-workbench` boundary before touching section-definition cleanup or unified-settings hash routing.
  Rationale: the highest-value seam was the missing lifecycle owner for `load -> edit -> save -> revert -> mode fallback`. Creating that workbench first let the page and unified wrapper become thinner immediately, created a place for boundary tests, and made visible save/revert actions a straightforward follow-on instead of another renderer-side special case.
  Date/Author: 2026-04-14 / Codex

- Decision: move the unified settings shell into `frontend/src/features/settings/unified-settings-page.ts` and keep `frontend/src/views/unified-settings-view.ts` as a thin compatibility export.
  Rationale: the workbench lifecycle was already deeper, but the route-aware shell behavior was still split across a wrapper boundary. Pulling the shell into the feature folder collapses deep-link routing, legacy path rewriting, and devtools composition behind one settings module while preserving stable imports for the rest of the app.
  Date/Author: 2026-04-14 / Codex

- Decision: introduce `frontend/src/features/setup/setup-wizard.ts` as the first deep frontend boundary for the setup workflow while keeping `frontend/src/views/setup-view.ts` as the rendering shell.
  Rationale: the setup page's risk lived in lifecycle and branching logic, not in the step card markup. Pulling the workflow into a dedicated wizard boundary makes the setup lifecycle testable without DOM coupling and keeps follow-on backend/API cleanup incremental instead of forcing a one-shot wizard rewrite.
  Date/Author: 2026-04-14 / Codex

- Decision: introduce `src/setup/setup-service.ts` as the shared backend onboarding boundary while keeping the existing `/api/v1/setup/*` routes and handler files stable.
  Rationale: the highest-value backend seam was the duplicated workflow ownership spread across route registration and many handler modules. Pulling the onboarding operations behind one service deepens the module immediately, preserves the existing HTTP contract, and leaves the remaining route-specific parsing endpoints as incremental follow-on work instead of a risky one-shot API rewrite.
  Date/Author: 2026-04-14 / Codex

- Decision: refresh the queue visual snapshot once smoke coverage, browser verification, and the regenerated visual run agreed on the new toolbar/header steady state.
  Rationale: after the toolbar returned to the intended stacked-row composition, continuing to chase the old snapshot would have optimized for stale pixels rather than the stabilized UI. Updating the baseline was the lower-risk move once functional and visual evidence aligned.
  Date/Author: 2026-04-15 / Codex

- Decision: harden `buildConfigToml()` by always emitting a provider `name`, falling back to the provider id when config omits a display name.
  Rationale: the control-plane app-server treats provider `name` as required, and local runtime logs proved that allowing it to be absent created a real boot-time regression. The fallback preserves compatibility without forcing a broader config-schema migration.
  Date/Author: 2026-04-15 / Codex

- Decision: start Milestone 6 with the webhook intake family instead of jumping straight to GitHub transport or config derivation.
  Rationale: that slice closes three listed Milestone 6 items at once in a low-risk way: verified webhook handler consolidation, webhook ingestion workflow deepening, and the first persistence-by-domain step around webhook deliveries. It also has strong existing test coverage, which makes it the safest place to start the milestone without reopening prior frontend work.
  Date/Author: 2026-04-15 / Codex

## Outcomes & Retrospective

The first execution wave succeeded, and the second wave now gives the backend a matching deep boundary for orchestrator lifecycle work. Risoluto now has a deeper agent-runner lifecycle boundary, a parity harness for the E2E mock API layer, a corrected attempt-detail summary contract, and a `RunLifecycleCoordinator` that owns launch, retry, reconciliation, worker completion plumbing, outcome-view sinks, snapshot / issue-detail / attempt-detail projection, and the concrete stop-signal / terminal-path side effects behind one stable interface. The old worker-outcome helper files are now strict adapters into that boundary instead of alternate implementations.

What remains is the rest of the multi-cluster migration. Milestone 3 is now effectively complete rather than just de-risked: `Orchestrator` is thinner on both the write side and the read side, retry lifecycle duplication is reduced, helper-level view mutations are behind the coordinator, the worker-outcome stop-signal / terminal-path logic no longer exists in two places, and the largest snapshot/detail assertions now live at the coordinator boundary. Milestone 4 is also effectively complete for page-level runtime-consumer migration: the frontend now has a `runtime-client` source of truth for polling, SSE, reconnect, stale-state handling, snapshot/store fanout, state subscriptions, poll-complete notifications, webhook subscriptions, workspace-event subscriptions, and generic runtime-event subscriptions, and the observability, notifications, logs, issue-inspector, overview, queue, workspaces, containers, git, and Codex admin surfaces now depend on that boundary rather than direct store access, page-local state polling, or raw browser-global runtime listeners. Queue route-awareness also now has a first-class `router.subscribe()` boundary instead of forcing page code to parse navigation custom events directly. The remaining raw browser listeners are concentrated in shared shell compatibility code rather than the main operator pages.

Milestone 5 now has three operator-facing boundaries in place. The Codex admin surface no longer assembles its own dashboard view-model from ten endpoint calls; the backend owns that read model through `src/codex/admin-snapshot.ts` and `/api/v1/codex/admin`, while the frontend depends on `frontend/src/views/codex-admin/codex-admin-client.ts` as the feature-level loader. The mutation side follows the same pattern: `src/codex/admin-service.ts` owns the action vocabulary for account auth, thread actions, MCP operations, and pending-request responses, `src/http/routes/codex.ts` delegates through that service, and the frontend panels no longer mirror the backend with raw `api.postCodex*` calls. Setup is now similarly deep on both sides: the frontend wizard owns the lifecycle through `frontend/src/features/setup/setup-wizard.ts`, while the backend onboarding workflow now routes status, auth, repo routing, project selection, test issue creation, and default-branch detection through `src/setup/setup-service.ts` instead of spreading that concept across route registration and helper-shaped handler modules.

The unified settings/config editing surface has now moved further into that same deep-module pattern. `frontend/src/features/settings/settings-workbench.ts` owns the workbench lifecycle for load/save/revert/mode transitions, `frontend/src/features/settings/unified-settings-page.ts` now owns legacy route normalization, deep-link section targeting, credentials/devtools shell composition, and compatibility-state caching, and `frontend/src/views/unified-settings-view.ts` is reduced to a thin export shim. The visible settings cards also expose explicit section-level save/revert actions through that boundary.

The setup/onboarding workflow now has both halves of its first deepening pass. On the frontend, `frontend/src/features/setup/setup-wizard.ts` owns the wizard's step state, async setup actions, provider/auth branching, device-auth lifecycle, reset behavior, and dashboard handoff, while `frontend/src/views/setup-view.ts` is primarily responsible for rendering the step shells and indicator UI around that feature-owned lifecycle. On the backend, `src/setup/setup-service.ts` now owns the shared onboarding operations for status, key persistence, auth flows, project creation, smoke-test creation, and reset, while the `src/setup/handlers/*.ts` files have become thin request/response adapters and `src/setup/api.ts` now depends on that shared service boundary rather than passing raw deps into each handler.

What remains in Milestone 5 is therefore the cleanup and proof work around the now-deepened operator workbenches rather than setup-specific backend seams. Unified settings no longer looks like the highest-leverage blocker. Logs/live timeline and queue now both sit behind dedicated controller/workbench boundaries, so the next Milestone 5 move is either to resolve the queue visual-baseline drift or to finish any remaining thin Codex/settings shell cleanup if that offers a better leverage/risk tradeoff.

## Context and Orientation

Risoluto has two major runtime halves that matter for this program.

The first half is the backend work engine. `src/orchestrator/orchestrator.ts` owns polling, snapshots, and the public orchestrator API. `src/orchestrator/run-lifecycle-coordinator.ts` now owns the shared launch/retry/completion runtime boundary behind that API. `src/agent-runner/index.ts` is the dispatch surface that starts a Codex worker attempt. `src/workspace/manager.ts` owns workspace preparation and hooks. `src/persistence/sqlite/` stores attempts, notifications, checkpoints, and webhook inbox records. `src/http/` exposes the operator API and OpenAPI spec.

The second half is the operator surface. `frontend/src/api.ts` fetches backend data, `frontend/src/state/` manages polling and event streams, and the pages and views under `frontend/src/pages/` and `frontend/src/views/` render queue, logs, issue detail, settings, setup, and admin surfaces. The Playwright mock layer in `tests/e2e/mocks/` is important because it behaves like a second copy of the API contract.

This program covers 15 workstreams that should be treated as one coordinated architecture effort rather than unrelated cleanup:

1. Orchestrator lifecycle engine.
2. Agent attempt execution service.
3. Setup and onboarding workflow.
4. Frontend runtime data plane.
5. Unified settings and config editing surface.
6. SQLite persistence runtime grouped by domain.
7. Webhook ingestion and replay pipeline.
8. Notification and alert pipeline.
9. Workspace lifecycle boundary.
10. Queue workbench feature.
11. Logs and live timeline feature.
12. Codex control-plane admin surface.
13. GitHub transport consolidation.
14. Config derivation pipeline.
15. Verified webhook handler family consolidation.

The important architectural rule is that we are not chasing smaller files. We are creating deeper modules with smaller public interfaces that hide more lifecycle complexity internally. The new `src/agent-runner/attempt-executor.ts` and `src/agent-runner/docker-runtime.ts` are the reference example for this approach.

## Plan of Work

Milestone 1 is compatibility harnesses. Before deeper refactors, add tests that protect public behavior at the boundary. That now exists for agent-runner lifecycle behavior and for the E2E API mock layer. Keep extending this pattern whenever a shallow module cluster is about to change.

Milestone 2 is the agent-runner lifecycle deepening. This milestone is already partially complete. The stable entrypoint remains `src/agent-runner/index.ts`, but the real lifecycle now lives in `src/agent-runner/attempt-executor.ts`, `src/agent-runner/codex-runtime-port.ts`, and `src/agent-runner/docker-runtime.ts`. Continue this milestone by keeping `AgentRunner` thin, retiring any remaining hollow wrappers, and migrating future tests toward `AttemptExecutor` or `AgentRunner.runAttempt()` boundary scenarios instead of peer-module mocking.

Milestone 3 is the orchestrator lifecycle engine, and it is now effectively complete. `src/orchestrator/run-lifecycle-coordinator.ts` owns the stable runtime context, retry coordinator creation, queue refresh, running/retry reconciliation, launch dispatch, recent-event buffering, usage accounting, worker completion plumbing, and the shared runtime read-model boundary for snapshot, issue-detail, and attempt-detail projection. `src/orchestrator/orchestrator.ts` now delegates to that boundary and `src/orchestrator/orchestrator-delegates.ts` is only a compatibility shim.

Any follow-on work in this area should be treated as cleanup, not milestone-critical architecture. The safest remaining cleanup is to further shrink `src/orchestrator/snapshot-builder.ts` by folding compatibility wrappers or extracting low-level parsing helpers once there is a clear benefit. New behavior in this area should keep landing as coordinator/scenario tests rather than reopening helper-level seams.

Milestone 4 is the frontend runtime client, and it is now effectively complete for the major page-level consumers. `frontend/src/state/runtime-client.ts` owns polling cadence, stale tracking, SSE connection management, reconnect logic, lifecycle-triggered refreshes, and browser-event dispatch over the shared store. `frontend/src/main.ts` now starts that client directly, while `frontend/src/state/polling.ts` and `frontend/src/state/event-source.ts` remain as migration-safe facades.

Any follow-on Milestone 4 work should be treated as shell cleanup rather than feature-blocking architecture. The remaining raw listeners are mostly shared compatibility seams such as app-shell navigation utilities. They can be migrated opportunistically to `router.subscribe()` or folded away when there is a clear cleanup win, but they are no longer the highest-leverage architecture target.

Milestone 5 is operator-facing workflow deepening. Unify the settings workbench, queue workbench, logs timeline, setup wizard, and Codex admin surface so each behaves as a deeper feature module with one state model and one API-facing boundary instead of multiple render helpers and ad hoc route glue.

The Codex admin surface now has both halves of that boundary: the read side is behind a single backend snapshot and frontend loader, and the mutation side is behind `src/codex/admin-service.ts` plus `frontend/src/views/codex-admin/codex-admin-client.ts`. The unified settings/config editing slice now has both of its first-pass boundaries: `frontend/src/features/settings/settings-workbench.ts` owns the main workbench lifecycle and section actions, while `frontend/src/features/settings/unified-settings-page.ts` owns the route-aware shell behavior and devtools composition. `frontend/src/views/unified-settings-view.ts` is now only a compatibility export. The setup/onboarding workflow also now has its first frontend boundary: `frontend/src/features/setup/setup-wizard.ts` owns the wizard lifecycle while `frontend/src/views/setup-view.ts` has become the renderer.

The next highest-leverage Milestone 5 move is to deepen the backend setup/onboarding workflow so the HTTP layer depends on one feature-level service boundary instead of separate route-registration glue and provider-specific handler branches. After the setup backend, the likely next operator-surface targets are logs or queue, depending on which workflow still carries the higher helper/test burden.

Milestone 6 is now complete. SQLite adapters are grouped more by domain workflow, verified webhook receiver patterns are shared, notification delivery/history behavior is deeper, workspace lifecycle and config derivation each have explicit implementation boundaries, GitHub transport logic is centralized, and the remaining webhook persistence/runtime ownership now lives behind one runtime surface instead of composition-time helper seams.

## Concrete Steps

All commands below run from `/home/oruc/Desktop/workspace/risoluto`.

The commands already used to validate the first wave were:

    pnpm run build
    pnpm test -- tests/agent-runner tests/dispatch
    pnpm test -- tests/agent-runner/attempt-executor.test.ts tests/e2e/mocks/api-schema-parity.test.ts tests/http/openapi-sync.test.ts

The commands used to validate the orchestrator lifecycle slice were:

    pnpm test -- tests/orchestrator/run-lifecycle-coordinator.test.ts tests/orchestrator/orchestrator.test.ts tests/orchestrator/orchestrator-advanced.test.ts tests/orchestrator/worker-launcher.test.ts tests/orchestrator/worker-outcome.test.ts tests/orchestrator/retry-coordinator.test.ts tests/orchestrator/orchestrator-delegates.test.ts
    pnpm run lint
    pnpm run format:check
    pnpm test

The expected result is a successful TypeScript build, a successful frontend Vite production build, and passing Vitest output ending with:

    Test Files  282 passed
    Tests       3713 passed | 1 skipped

When the OpenAPI schema changes, regenerate the checked-in artifact before rerunning `tests/http/openapi-sync.test.ts`:

    node -e "const fs=require('node:fs'); const { getOpenApiSpec } = require('./dist/http/openapi.js'); fs.writeFileSync('docs-site/openapi.json', JSON.stringify(getOpenApiSpec(), null, 2) + '\n');"

The next contributor should keep pushing Milestone 5 rather than returning to runtime transport cleanup. The strongest next move is now the backend setup/onboarding workflow: pull `src/setup/api.ts`, the `src/setup/handlers/*.ts` family, and provider-specific request branches behind a deeper setup service boundary that matches the new frontend wizard lifecycle. Unified settings is now in a good enough state to leave for opportunistic cleanup unless a specific helper seam becomes painful again. Only return to `src/orchestrator/snapshot-builder.ts` if there is a clear cleanup win that does not re-fragment the new coordinator boundary.

## Validation and Acceptance

This architecture program is only considered healthy when these acceptance checks hold after every milestone:

`Backend correctness`: `pnpm run build` passes, including frontend build, with no TypeScript errors.

`Boundary verification`: the targeted Vitest suites for the milestone pass. For the current backend milestones that means the new attempt executor tests, the E2E API schema parity test, the OpenAPI sync guard, and `tests/orchestrator/run-lifecycle-coordinator.test.ts`.

`Observable operator behavior`: attempt detail responses must include PR summaries when available, the operator UI must still be able to render issue activity and attempt detail state from the mock layer, and the checked-in OpenAPI spec must match runtime generation exactly.

`Architectural outcome`: after each milestone, there should be at least one public boundary test that would have failed before the refactor and now protects the deeper module.

## Idempotence and Recovery

This program is intentionally additive first and subtractive second. Add the compatibility harness, then deepen the module behind the stable surface, then remove dead wrappers only after `rg` confirms there are no references and the build stays green.

If a milestone stops halfway through:

- Re-read this ExecPlan and the files named in the relevant milestone.
- Run `git status --short` to separate this work from unrelated user changes such as `.claude/settings.json`, `risoluto-architecture.html`, and `skills/architecture-diagram/`.
- Re-run `pnpm run build` first. TypeScript failures are usually the fastest signal for incomplete boundary changes.
- Re-run only the milestone’s narrow Vitest slice before running the full suite.

Updating `docs-site/openapi.json` is safe and repeatable. Rebuild first so `dist/http/openapi.js` reflects the current source tree, then rewrite the artifact from runtime generation.

## Artifacts and Notes

Important files changed in the first execution wave:

- `src/agent-runner/index.ts`
- `src/agent-runner/attempt-executor.ts`
- `src/agent-runner/codex-runtime-port.ts`
- `src/agent-runner/docker-runtime.ts`
- `src/http/response-schemas.ts`
- `src/codex/admin-service.ts`
- `src/codex/admin-snapshot.ts`
- `src/codex/model-catalog.ts`
- `frontend/src/features/settings/settings-workbench.ts`
- `src/orchestrator/context.ts`
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/orchestrator-delegates.ts`
- `src/orchestrator/retry-coordinator.ts`
- `src/orchestrator/run-lifecycle-coordinator.ts`
- `src/orchestrator/snapshot-builder.ts`
- `tests/agent-runner/attempt-executor.test.ts`
- `tests/codex/admin-service.test.ts`
- `tests/e2e/mocks/api-schema-parity.test.ts`
- `tests/frontend/settings-workbench.test.ts`
- `tests/frontend/codex-admin-client.test.ts`
- `tests/orchestrator/write-linear-completion.test.ts`
- `tests/orchestrator/run-lifecycle-coordinator.test.ts`
- `tests/http/codex-routes.test.ts`
- `tests/e2e/mocks/data/runtime-snapshot.ts`
- `tests/e2e/mocks/data/issue-detail.ts`
- `tests/e2e/mocks/data/attempts.ts`
- `tests/e2e/mocks/scenarios/issue-drilldown.ts`
- `docs-site/openapi.json`

Representative proof from the first wave:

    rg -n "AgentSession|agent-session" src tests docs
    # Before deletion: only src/agent-runner/agent-session.ts matched.

    pnpm test -- tests/agent-runner/attempt-executor.test.ts tests/e2e/mocks/api-schema-parity.test.ts tests/http/openapi-sync.test.ts
    # Result: passing after the attempt-detail summary contract and OpenAPI artifact were aligned.

Representative proof from the orchestrator slice:

    pnpm test -- tests/orchestrator/run-lifecycle-coordinator.test.ts tests/orchestrator/orchestrator.test.ts tests/orchestrator/orchestrator-advanced.test.ts tests/orchestrator/worker-launcher.test.ts tests/orchestrator/worker-outcome.test.ts tests/orchestrator/retry-coordinator.test.ts tests/orchestrator/orchestrator-delegates.test.ts
    # Result: passing after the new coordinator drove dispatch -> failure -> retry -> relaunch through one runtime boundary.

    pnpm run lint
    # Result: 0 errors, existing repo-wide structural warnings only.

Revision note (2026-04-14 / Codex): created the initial umbrella ExecPlan after completing the first architecture wave, then updated it after the orchestrator runtime-coordinator refactor so future contributors can continue Milestone 3 from the repo alone without needing chat history.

Revision note (2026-04-14 10:55Z / Codex): updated the plan after the coordinator absorbed outcome-view sinks and snapshot / issue-detail projection, and after full verification passed again with the new `3740`-test baseline.

Revision note (2026-04-14 11:05Z / Codex): updated the plan after stop-signal and terminal-path side effects moved behind coordinator-owned runtime methods, with helper exports left as compatibility shims for the moment, and after full verification passed with the `3742`-test baseline.

Revision note (2026-04-14 11:20Z / Codex): updated the plan after deleting the remaining stop-signal / terminal-path fallback implementations, replacing them with strict coordinator adapters plus a coordinator-finalizer test harness, and after the Vitest baseline moved to `3703` passing tests as the old seam-heavy helper suites were intentionally collapsed.

## Interfaces and Dependencies

The current deepened boundary for agent execution must keep these interfaces stable:

In `src/agent-runner/codex-runtime-port.ts`, keep:

    export interface CodexRuntimePort {
      start(input: RuntimeStartInput): Promise<CodexRuntimeSession>;
    }

    export interface CodexRuntimeSession {
      initialize(input: RuntimeInitInput): Promise<RuntimeInitResult>;
      execute(input: RuntimeExecuteInput): Promise<RunOutcome>;
      review(threadId: string, signal: AbortSignal, timeoutMs: number): Promise<SelfReviewResult | null>;
      steer(message: string): Promise<boolean>;
      shutdown(signal: AbortSignal): Promise<void>;
      getThreadId(): string | null;
      getFatalFailure(): { code: string; message: string } | null;
    }

In `src/agent-runner/attempt-executor.ts`, keep:

    export interface AttemptExecutor {
      launch(input: AttemptLaunchInput): Promise<ActiveAttempt>;
    }

    export interface ActiveAttempt {
      outcome: Promise<RunOutcome>;
      steer(message: string): Promise<boolean>;
      abort(reason?: string): void;
    }

In `src/orchestrator/snapshot-builder.ts` and `src/http/response-schemas.ts`, attempt detail responses must continue to expose:

    summary?: string | null

because the operator attempt detail screen renders the agent-authored PR summary when present.

In `src/orchestrator/run-lifecycle-coordinator.ts`, keep:

    export interface RunLifecycleCoordinator {
      getContext(): OrchestratorContext;
      cleanupTerminalWorkspaces(): Promise<void>;
      reconcileRunningAndRetrying(): Promise<boolean>;
      refreshQueueViews(candidateIssues?: Issue[]): Promise<void>;
      launchAvailableWorkers(candidateIssues?: Issue[]): Promise<void>;
    }

In `src/orchestrator/context.ts`, keep retry behavior anchored to the shared runtime surface via:

    export type RetryRuntimeContext = Pick<
      OrchestratorContext,
      "runningEntries" | "retryEntries" | "detailViews" | "completedViews" |
      "isRunning" | "getConfig" | "claimIssue" | "releaseIssueClaim" |
      "hasAvailableStateSlot" | "markDirty" | "notify" | "pushEvent" |
      "resolveModelSelection" | "launchWorker"
    >

so `src/orchestrator/retry-coordinator.ts` does not grow a second overlapping lifecycle state contract.
