---
title: "feat: Notifications bundle"
type: feat
status: locally_verified
date: 2026-04-04
origin: .anvil/notifications-bundle/requirements.md
review-rounds: 1
review-settlements: 4
audit-rounds: 1
audit-verdict: pass
dry-run: false
---

# Notifications Bundle

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this bundle lands, Risoluto operators should be able to do five concrete things they cannot do today. They should be able to deliver notifications through more than one backend, open `/notifications` and see a real persisted timeline instead of a Slack placeholder, accept push-based work from Linear, GitHub, and an authenticated generic trigger endpoint, schedule recurring automations and low-level cron actions, and define alert rules that fan out important runtime events to the right channels with cooldown protection.

The change must be demonstrable in observable ways. A signed webhook should be accepted and reflected in the operator surface without a page reload. A cron automation should record a run result that can be queried later. A notification should persist in SQLite, appear in `/api/v1/notifications`, and render on `/notifications`. A critical alert should route to the configured channels while a repeated event inside the cooldown window should not spam operators.

## Progress

- [x] 2026-04-03 23:59+03:00 Created fresh `.anvil/notifications-bundle/` state and recorded bundle intake.
- [x] 2026-04-04 00:21+03:00 Cleared the preflight blocker after Docker access was restored and reran readiness checks.
- [x] 2026-04-04 00:21+03:00 Wrote planning-ready requirements in `.anvil/notifications-bundle/requirements.md`.
- [x] 2026-04-04 00:27+03:00 Drafted this ExecPlan and advanced the run to a review-ready planning checkpoint.
- [x] 2026-04-04 00:43+03:00 Completed hostile review round 1 and merged four settlements back into the ExecPlan so the run can continue to audit.
- [x] 2026-04-04 01:25+03:00 Implemented Unit 1: config and notification-domain foundation.
- [x] 2026-04-04 01:44+03:00 Implemented Unit 2: persisted notifications, channel expansion, realtime timeline refresh, and the `/notifications` UI.
- [x] 2026-04-04 01:55+03:00 Implemented Unit 3: shared webhook ingress, GitHub push handling, and authenticated trigger dispatch with tracker-backed `create_issue`.
- [x] 2026-04-04 02:02+03:00 Implemented Unit 4: cron scheduler, automation run history, and manual-run APIs.
- [x] 2026-04-04 02:08+03:00 Implemented Unit 5: rule-based alerting, docs alignment, OpenAPI sync, and verification artifact generation.
- [x] 2026-04-04 02:28+03:00 Passed repo gates, Playwright smoke, Playwright visual, and manual visual verification on the real app.
- [ ] Final push remains deferred until there is an explicit git-scope decision for the mixed worktree.

## Surprises & Discoveries

- Observation: the current `/notifications` page is not a notification feed at all; it only checks whether Slack is configured.
  Evidence: `frontend/src/views/notifications-view.ts` renders either “Notifications not configured yet” or “Notifications are configured” and explicitly says delivery history is a future update.

- Observation: the repo already has substantial webhook substrate that should be reused instead of replaced.
  Evidence: `src/http/webhook-handler.ts`, `src/webhook/registrar.ts`, `src/webhook/health-tracker.ts`, and `src/persistence/sqlite/webhook-inbox.ts` already cover signature verification, Linear registration, health state, and durable inbox persistence.

- Observation: the current notification config and UI are Slack-only.
  Evidence: `src/core/types.ts` defines `NotificationConfig` as only `{ slack: ... }`, `src/config/schemas/server.ts` only validates Slack, and `frontend/src/views/settings-section-defs.ts` only exposes Slack webhook/verbosity fields.

- Observation: tracker writes are not yet generalized for push-triggered “create issue” actions.
  Evidence: `src/tracker/port.ts` only exposes fetch, transition, and comment operations; there is no `createIssue()` path today.

- Observation: the current real-time frontend bridge only refreshes on issue lifecycle events, not generic notification changes.
  Evidence: `frontend/src/state/event-source.ts` only auto-polls for `issue.started`, `issue.completed`, `issue.stalled`, and `issue.queued`, and `frontend/src/views/notifications-view.ts` has no live notification subscription path today.

- Observation: outbound URL trust policy is currently specialized to tracker endpoints, GitHub API hosts, and Slack webhook hosts.
  Evidence: `src/config/url-policy.ts` only exports `normalizeTrackerEndpoint()`, `normalizeGitHubApiBaseUrl()`, and `normalizeSlackWebhookUrl()`.

- Observation: the worker execution stack is still issue-first all the way down.
  Evidence: `src/agent-runner/index.ts` requires `issue` plus `workspace`, and `src/orchestrator/workspace-preparation.ts` plus `src/orchestrator/worker-launcher.ts` both require an `Issue` instance and repo-routing context.

- Observation: the new notifications smoke test initially failed because the Playwright API mock only intercepted `/api/v1/notifications` without query parameters, while the page always requests `/api/v1/notifications?limit=...`.
  Evidence: `tests/e2e/mocks/api-mock.ts` needed a query-aware route matcher, and `tests/e2e/specs/smoke/notifications.smoke.spec.ts` needed a more specific unread-stat locator.

## Decision Log

- Decision: keep the bundle grouped, but execute it foundation-first in narrow units.
  Rationale: the roadmap items share the same event-ingress and operator-notification seam, but the implementation still needs staged proof points so regressions can be isolated and verified incrementally.
  Date/Author: 2026-04-04 / Codex

- Decision: preserve `notifications.slack` as a backward-compatible config path and add `notifications.channels[]` as the extensible multi-channel surface.
  Rationale: Slack is already wired through the current config store and Settings UI. Normalizing legacy Slack config into a richer channel list preserves compatibility without freezing the design to one backend forever.
  Date/Author: 2026-04-04 / Codex

- Decision: keep the existing top-level `webhook` section for Linear registration/health semantics and introduce separate top-level `triggers`, `automations`, and `alerts` config sections.
  Rationale: the current `webhook` section already means “Linear webhook integration” in this repo. Reusing that name for unrelated generic triggers would make both docs and code less truthful.
  Date/Author: 2026-04-04 / Codex

- Decision: require only Slack, generic outbound webhook, and desktop notifications in this bundle.
  Rationale: those three channels cover backward compatibility, machine-to-machine fanout, and local operator feedback. Telegram/email/PagerDuty can remain extension points without bloating this run.
  Date/Author: 2026-04-04 / Codex

- Decision: persist notifications in a dedicated SQLite table instead of deriving them from the `recent_events` ring buffer.
  Rationale: the ring buffer is transient telemetry, while this bundle needs read state, durable history, deep links, and API queries that survive restart.
  Date/Author: 2026-04-04 / Codex

- Decision: use `node-cron` as the scheduler dependency for cron-backed triggers and automations.
  Rationale: the roadmap prior art assumes standard cron expressions, and the repository currently has no scheduler dependency. `node-cron` is small, familiar, and adequate for local in-process schedules.
  Date/Author: 2026-04-04 / Codex

- Decision: keep GitHub webhook scope narrow to push-based ingestion and notification truthfulness, not a full PR lifecycle engine.
  Rationale: broader SCM webhook orchestration is tracked by adjacent roadmap issues and would blur the bundle boundary.
  Date/Author: 2026-04-04 / Codex

- Decision: the notification timeline will become real-time through explicit `notification.*` SSE events plus frontend refetch wiring, not by relying on issue lifecycle polling alone.
  Rationale: the current SSE bridge only auto-polls on four issue lifecycle events. `/notifications` needs a truthful notification-specific refresh path if `R5` is going to be met.
  Date/Author: 2026-04-04 / Codex

- Decision: generic outbound webhook channels must pass a dedicated HTTPS plus host-allowlist policy in `src/config/url-policy.ts`.
  Rationale: this repo already treats outbound tracker and Slack destinations as trust-boundary inputs. Generic webhook egress should extend that policy surface, not silently bypass it.
  Date/Author: 2026-04-04 / Codex

- Decision: automation modes must have explicit execution identity instead of assuming the current issue-centric worker stack is tracker-agnostic.
  Rationale: `AgentRunner`, workspace preparation, and worker launch all require a real `Issue` plus repo-routing context today. `report` and `findings` can run as tracker-free automation jobs with explicit repo binding, but `implement` must first resolve or create a real tracker issue before entering the existing worker path.
  Date/Author: 2026-04-04 / Codex

- Decision: stop the run at a locally verified final-push checkpoint instead of silently creating a commit in a mixed worktree.
  Rationale: the repository still contains unrelated `.agents/skills/*` edits outside this bundle, and no explicit commit or PR instruction was given. The truthful closeout is “fully implemented and verified locally, final push deferred pending git-scope confirmation.”
  Date/Author: 2026-04-04 / Codex

## Outcomes & Retrospective

The bundle landed locally with the intended user-visible outcomes: multi-channel notifications are typed and configurable, `/notifications` is backed by durable SQLite history and realtime refresh, GitHub plus generic triggers can push work into the system, cron automations persist run history, alert rules fan out with cooldown protection, and the docs/OpenAPI surface reflects the shipped API. Repo gates, Playwright smoke, Playwright visual, and manual browser verification all passed. The only remaining gap is git finalization: no branch, commit, or PR were created because the worktree also contains unrelated `.agents/skills/*` edits that need an explicit scope decision before a final push.

Revision note (2026-04-04): Updated after implementation and verification. Marked Units 1-5 complete, recorded the smoke-mock discovery, and changed the plan status from audit-ready to locally verified with final push deferred.

## Context and Orientation

`src/cli/services.ts` is the main runtime wiring file. It creates the event bus, notification manager, webhook registrar, webhook health tracker, persistence runtime, and orchestrator. If a new subsystem needs to start with the service or subscribe to config changes, this is where it will be instantiated and connected.

`src/cli/notifications.ts` is the existing notification wiring seam. Today it tears down all registered channels and re-registers only Slack from `configStore.getConfig().notifications.slack`. That makes it the right place to evolve from a single Slack channel into a channel-factory-driven registry.

`src/http/routes.ts` exposes the operator API, Server-Sent Events (SSE) stream at `/api/v1/events`, and the existing `/webhooks/linear` endpoint. In this repository, SSE means a single long-lived HTTP response that pushes JSON events to the browser without a reload. New API surfaces for notifications, alerts, automations, and generic trigger ingress should follow the same routing and response-schema patterns already used here.

`src/http/webhook-handler.ts`, `src/webhook/registrar.ts`, `src/webhook/health-tracker.ts`, and `src/persistence/sqlite/webhook-inbox.ts` already form a coherent Linear webhook subsystem. That subsystem verifies signatures, persists verified deliveries before responding, tracks webhook health, and requests targeted refreshes. The plan must extend this substrate rather than duplicate it.

`src/core/types.ts`, `src/config/schemas/server.ts`, `src/config/builders.ts`, and `src/config/normalizers.ts` define how raw operator configuration becomes typed `ServiceConfig`. In this repository, the overlay/config-store path is the live runtime source of truth, while `WORKFLOW.md` is only a legacy import path. New notification, trigger, automation, and alert config must therefore land in the current typed config pipeline, not in parallel JSON files.

`src/config/url-policy.ts` is the existing outbound trust-boundary choke point for configured URLs. Generic notification webhooks should extend that policy file instead of inventing a side-door normalizer or allowing arbitrary egress by accident.

`frontend/src/views/notifications-view.ts` and `frontend/src/pages/notifications.ts` define the current operator-facing Notifications screen. The page is intentionally simple right now, which makes it the correct place to land the new persisted timeline rather than inventing a second notification UI.

`frontend/src/state/event-source.ts` is the browser's live-update bridge. Today it only auto-polls on issue lifecycle events, so `R5` will require explicit notification event handling there instead of assuming the existing lifecycle refresh path is broad enough.

`src/core/risoluto-events.ts` is the typed event-bus contract. `NotificationManager`, webhook health, and the frontend SSE layer all ultimately depend on this event map. New alerting and notification-timeline behavior should extend the event map with explicit event names rather than tunneling everything through untyped metadata blobs.

`src/agent-runner/index.ts`, `src/orchestrator/workspace-preparation.ts`, and `src/orchestrator/worker-launcher.ts` are still issue-first seams. Any automation design that wants to reuse them must first explain where issue identity, repo routing, and workspace truth come from.

## Plan of Work

Start by widening the typed config and notification domain without changing runtime behavior. Add richer notification/channel/trigger/automation/alert types, extend the config builders and schemas, and make the notification wiring code capable of building a registry from the typed config while still honoring legacy Slack config.

Next, add durable notification persistence and turn `/notifications` into a real operator timeline. This requires a dedicated SQLite table, a store abstraction, new API routes and response schemas, frontend API and view types, and an explicit notification-event contract through SSE so the timeline can refetch without a manual reload. The existing Slack delivery path should become one channel among several, not the only operator signal.

Then extend ingress. Keep `/webhooks/linear`, add `/webhooks/github`, and add `/api/v1/webhooks/trigger`. Normalize these paths into one internal trigger/notification model, expand tracker writes where needed, and ensure webhook and polling paths do not create duplicate work.

After ingress is stable, build scheduling and automation on top of a shared scheduler. Persist automation run history so manual inspection, the dashboard, and alerting can all point at the same truth, but keep the execution model honest: `report` and `findings` are tracker-free automation runs with explicit repo binding, while `implement` only hands off into the existing issue-centric worker flow after a real tracker issue exists. Only after that should the alert engine subscribe to runtime events and start evaluating cooldown or routing rules.

Finish by aligning docs and the roadmap with the shipped behavior, then run the required backend, frontend, browser, and lifecycle verification surfaces. Because this bundle touches the web UI, `visual-verify` is mandatory once frontend files are edited.

## Requirements Trace

- **Unit 1** covers `R1`, `R2`, `R3`, `R17`, and `R18` by defining the channel/config model and backward-compatible config normalization.
- **Unit 2** covers `R1`, `R2`, `R3`, `R4`, `R5`, `R6`, `R16`, and part of `R20` by adding persistence, API access, SSE exposure, and the real notification timeline UI.
- **Unit 3** covers `R7`, `R8`, `R9`, `R10`, and part of `R20` by extending ingress and dedup semantics across webhook and trigger paths.
- **Unit 4** covers `R11`, `R12`, `R13`, `R17`, and part of `R20` by adding scheduler-backed cron entries and persisted automation runs.
- **Unit 5** covers `R14`, `R15`, `R18`, `R19`, and the remaining `R20` obligations through alert routing, operator/docs truthfulness, and end-to-end verification.

## Scope Boundaries

This plan does not include Telegram, email, PagerDuty, or a generalized notification marketplace. It does not replace polling with webhook-only orchestration. It does not take ownership of broader PR/CI webhook flows beyond the narrow GitHub ingestion needed here. It also does not require a full dashboard settings editor for every new config branch, as long as the shipped UI and docs remain explicit about how configuration is actually managed.

## Key Technical Decisions

The canonical notification config should become:

    notifications:
      slack:
        webhook_url: $SLACK_WEBHOOK_URL
        verbosity: critical
      channels:
        - type: webhook
          name: ops-webhook
          url: https://hooks.example.com/risoluto
          min_severity: warning
        - type: desktop
          name: local-desktop
          enabled: true

Legacy `notifications.slack` remains supported and is normalized into the channel registry instead of being deleted outright.

Generic outbound webhook channels must additionally satisfy a dedicated URL policy in `src/config/url-policy.ts`: HTTPS only, no inline credentials, and host allowlisting through an environment-backed policy such as `RISOLUTO_ALLOWED_NOTIFICATION_WEBHOOK_HOSTS`. The generic channel should not silently inherit Slack's host rules or permit arbitrary egress by default.

Generic trigger and GitHub push config should live separately from the existing Linear webhook section:

    webhook:
      webhook_url: https://risoluto.example.com/webhooks/linear
      webhook_secret: $LINEAR_WEBHOOK_SECRET

    triggers:
      api_key: $RISOLUTO_TRIGGER_API_KEY
      allowed_actions: ["create_issue", "re_poll", "refresh_issue"]
      github_secret: $GITHUB_WEBHOOK_SECRET
      rate_limit_per_minute: 30

Scheduler-backed workflows should be configuration-driven rather than UI-authored:

    automations:
      - name: nightly-triage
        schedule: "0 2 * * *"
        mode: report
        prompt: "Summarize stale issues and blocked pull requests."
        enabled: true

    alerts:
      rules:
        - name: worker-failures
          type: worker_failed
          severity: critical
          channels: ["slack", "ops-webhook", "local-desktop"]
          cooldown_ms: 300000

Automation entries must declare enough identity to make workspace and tracker behavior truthful. `report` and `findings` modes need an explicit repo binding so a tracker-free run still knows which workspace or repo context to use. `implement` mode must additionally specify how a real tracker issue is obtained before the existing worker launcher is reused.

Persisted notifications should use a dedicated table with stable fields for type, severity, title, message, href, metadata, read state, created timestamp, and optional delivery-status summary. Delivery attempts can remain lightweight at first by storing per-send outcomes inside metadata rather than creating a second table in the first implementation pass.

## Implementation Units

### Unit 1: Config and Notification-Domain Foundation

Goal: widen the typed config surface and define the richer notification primitives without yet changing external behavior.

- Owned files: `src/core/types.ts`, `src/core/notification-types.ts`, `src/config/schemas/server.ts`, `src/config/schemas/index.ts`, `src/config/builders.ts`, `src/config/normalizers.ts`, `src/config/defaults.ts`, `src/config/url-policy.ts`, `src/cli/notifications.ts`, `frontend/src/views/settings-section-defs.ts`
- Dependencies: existing `NotificationManager` and Slack config behavior in `src/cli/notifications.ts`
- Execution target: make `ServiceConfig` capable of expressing channels, triggers, automations, and alerts while normalizing legacy Slack-only config into the richer shape and enforcing a dedicated trust-boundary policy for generic outbound webhook destinations
- Verification surface: config parsing/unit tests only; no UI behavior changes beyond keeping Settings truthful
- Tests impact: update `tests/config/normalizers.test.ts`, update `tests/config/webhook.test.ts`, update `tests/config/url-policy.test.ts`, create `tests/config/notification-config.test.ts`, update `tests/cli/notifications.test.ts`
- Docs impact: none yet beyond leaving notes in the plan

This unit should introduce explicit TypeScript types for persisted notification records, channel definitions, trigger config, automation config, and alert-rule config. It should also define the normalization rule that turns `notifications.slack` into one logical channel entry so the rest of the runtime can stop special-casing Slack, and it should add a dedicated normalization path for generic outbound webhook URLs instead of letting that egress surface bypass the repo's existing URL-policy seam.

### Unit 2: Persisted Notifications, Channel Expansion, and Timeline UI

Goal: make notifications durable and operator-visible, then expand delivery beyond Slack.

- Owned files: `src/notification/channel.ts`, `src/notification/manager.ts`, `src/notification/slack-webhook.ts`, `src/notification/webhook-channel.ts`, `src/notification/desktop.ts`, `src/core/risoluto-events.ts`, `src/persistence/sqlite/schema.ts`, `src/persistence/sqlite/database.ts`, `src/persistence/sqlite/runtime.ts`, `src/persistence/sqlite/notification-store.ts`, `src/http/routes.ts`, `src/http/openapi-paths.ts`, `src/http/response-schemas.ts`, `frontend/src/api.ts`, `frontend/src/types.ts`, `frontend/src/state/event-source.ts`, `frontend/src/state/polling.ts`, `frontend/src/views/notifications-view.ts`, `frontend/src/pages/notifications.ts`, `src/cli/services.ts`, `src/cli/notifications.ts`
- Dependencies: Unit 1 config/domain shapes
- Execution target: persist typed notifications, expose them through `/api/v1/notifications`, render them on `/notifications`, and carry notification create or read-state changes through explicit SSE events so the timeline updates without a manual reload; register Slack, generic webhook, and desktop channels through one factory/wiring path
- Verification surface: backend API tests, frontend view tests, Playwright fullstack/visual coverage, and `visual-verify` because frontend files under `frontend/src/` will change
- Tests impact: update `tests/notification/channel.test.ts`, update `tests/notification/manager.test.ts`, update `tests/notification/slack-webhook.test.ts`, create `tests/notification/webhook-channel.test.ts`, create `tests/notification/desktop.test.ts`, create `tests/persistence/sqlite/notification-store.test.ts`, create `tests/http/notifications-api.integration.test.ts`, update `tests/http/sse.test.ts`, update `tests/http/sse-contracts.integration.test.ts`, create `tests/frontend/notifications-view.test.ts`, create `tests/e2e/specs/fullstack/notifications-timeline.fullstack.spec.ts`, create `tests/e2e/specs/visual/notifications.visual.spec.ts`
- Docs impact: `docs/OPERATOR_GUIDE.md` will later need a notification timeline walkthrough and multi-channel config example

The `NotificationManager` should stop being “send only” and become the orchestration point for both persistence and best-effort channel delivery. Persist first, then fan out, then record delivery summaries so the timeline and APIs can surface what happened. This unit must also emit explicit notification events onto the typed event bus and SSE stream so the frontend can refetch the timeline without pretending that issue lifecycle polling covers notification mutations.

### Unit 3: Shared Webhook Ingress, GitHub Push Handling, and Generic Trigger Dispatch

Goal: unify ingress behavior so external systems can push work or notifications into Risoluto without bypassing validation or duplicating poll-based work.

- Owned files: `src/http/routes.ts`, `src/http/request-schemas.ts`, `src/http/response-schemas.ts`, `src/http/webhook-handler.ts`, `src/http/webhook-types.ts`, `src/http/github-webhook-handler.ts`, `src/http/trigger-handler.ts`, `src/tracker/port.ts`, `src/tracker/github-adapter.ts`, `src/tracker/linear-adapter.ts`, `src/github/issues-client.ts`, `src/linear/client.ts`, `src/persistence/sqlite/webhook-inbox.ts`, `src/cli/services.ts`, `src/orchestrator/orchestrator.ts`
- Dependencies: Unit 1 config surface; Unit 2 notification persistence if ingress should create typed notifications immediately
- Execution target: preserve `/webhooks/linear`, add `/webhooks/github`, add `/api/v1/webhooks/trigger`, and normalize all ingress into one internal dispatch path with dedup-safe behavior
- Verification surface: request-schema tests, handler tests, inbox tests, fullstack webhook-to-UI coverage, and lifecycle/E2E proof
- Tests impact: update `tests/http/webhook-handler.test.ts`, create `tests/http/github-webhook-handler.test.ts`, create `tests/http/trigger-handler.test.ts`, update `tests/persistence/sqlite/webhook-inbox.test.ts`, update `tests/webhook/health-tracker.test.ts`, create `tests/tracker/github-create-issue.test.ts`, create `tests/tracker/linear-create-issue.test.ts`, update `tests/e2e/specs/fullstack/webhook-to-ui.fullstack.spec.ts`
- Docs impact: `docs/TRUST_AND_AUTH.md` and `docs/OPERATOR_GUIDE.md` need webhook auth and trigger examples

This unit must add `createIssue()` or an equivalent tracker-write method to `TrackerPort` so authenticated generic triggers can create work on the configured tracker without reaching around the tracker abstraction. That expansion is not optional if `create_issue` remains in the allowlist surface. GitHub webhook support should focus on issue or label events that matter for push-based ingestion, not full PR state replication.

### Unit 4: Cron Scheduler and Automation Run History

Goal: add recurring execution on top of a shared scheduler, then persist the outcomes so operators can inspect what happened.

- Owned files: `package.json`, `pnpm-lock.yaml`, `src/core/types.ts`, `src/core/risoluto-events.ts`, `src/orchestrator/orchestrator.ts`, `src/orchestrator/runtime-types.ts`, `src/automation/types.ts`, `src/automation/scheduler.ts`, `src/automation/runner.ts`, `src/cli/services.ts`, `src/persistence/sqlite/schema.ts`, `src/persistence/sqlite/database.ts`, `src/persistence/sqlite/automation-store.ts`, `src/http/routes.ts`, `src/http/request-schemas.ts`, `src/http/response-schemas.ts`, `frontend/src/api.ts`, `frontend/src/types.ts`
- Dependencies: Unit 1 config surface, Unit 3 trigger normalization, existing agent-runner/orchestrator wiring
- Execution target: register cron-backed tasks at startup, support `implement` / `report` / `findings` automation modes through an explicit automation-run identity model, and persist run history plus findings/report output. `report` and `findings` remain tracker-free but require repo binding; `implement` must first resolve or create a real tracker issue before handing off to the existing issue-centric worker flow
- Verification surface: scheduler unit tests, automation API tests, precondition coverage for repo or issue identity, and lifecycle/E2E proof that scheduled work executes through the real runtime
- Tests impact: create `tests/automation/scheduler.test.ts`, create `tests/automation/runner.test.ts`, create `tests/automation/execution-contract.test.ts`, create `tests/http/automation-api.integration.test.ts`, create `tests/orchestrator/automation-wiring.test.ts`
- Docs impact: `docs/OPERATOR_GUIDE.md` needs automation configuration, repo-binding requirements, implement-mode preconditions, and manual-trigger guidance

The scheduler must be idempotent on config reload: stop removed tasks, keep stable identities for unchanged tasks, and register new tasks without orphaning old timers. Automation history belongs in SQLite so the dashboard and alert engine can both reference the same durable source of truth. The critical review settlement here is execution honesty: tracker-free `report` and `findings` runs need explicit repo binding, while `implement` cannot claim reuse of the issue-centric launcher until a real tracker issue exists.

### Unit 5: Rule-Based Alert Engine, Docs Alignment, and Verification Closeout

Goal: evaluate runtime events against alert rules, route them through the channel registry, and finish the operator/docs/test proof for the full bundle.

- Owned files: `src/notification/alert-types.ts`, `src/notification/alert-engine.ts`, `src/notification/manager.ts`, `src/core/risoluto-events.ts`, `src/cli/services.ts`, `src/http/routes.ts`, `src/http/response-schemas.ts`, `frontend/src/api.ts`, `frontend/src/types.ts`, `frontend/src/views/notifications-view.ts`, `README.md`, `docs/OPERATOR_GUIDE.md`, `docs/TRUST_AND_AUTH.md`, `docs/CONFORMANCE_AUDIT.md`, `docs/ROADMAP_AND_STATUS.md`, `EXECPLAN.md`
- Dependencies: Units 2 through 4
- Execution target: alert rules subscribe to the event bus, persist/route typed notifications with cooldown suppression, expose alert history API, and bring docs plus roadmap status in line with the shipped behavior
- Verification surface: unit tests for rule evaluation, SSE/event tests, Playwright timeline checks, `visual-verify`, full quality gates, and `./scripts/run-e2e.sh`
- Tests impact: create `tests/notification/alert-engine.test.ts`, update `tests/http/sse.test.ts`, update `tests/http/sse-contracts.integration.test.ts`, update `tests/orchestrator/lifecycle-events.test.ts`, update the new fullstack and visual notification specs from Unit 2
- Docs impact: all listed docs plus roadmap issue accounting

This unit is where operator truthfulness is finalized. If the Settings UI still does not expose every new config branch, the docs and Notifications screen must say exactly how operators configure channels, triggers, automations, and alert rules in the overlay/API path.

## Concrete Steps

From `/home/oruc/Desktop/workspace/risoluto` implement and validate in this order:

    pnpm test tests/config/notification-config.test.ts tests/config/normalizers.test.ts tests/config/webhook.test.ts tests/config/url-policy.test.ts tests/cli/notifications.test.ts

    pnpm test tests/notification/channel.test.ts tests/notification/manager.test.ts tests/notification/slack-webhook.test.ts tests/notification/webhook-channel.test.ts tests/notification/desktop.test.ts tests/persistence/sqlite/notification-store.test.ts tests/http/notifications-api.integration.test.ts tests/http/sse.test.ts tests/http/sse-contracts.integration.test.ts

    pnpm test tests/http/webhook-handler.test.ts tests/http/github-webhook-handler.test.ts tests/http/trigger-handler.test.ts tests/persistence/sqlite/webhook-inbox.test.ts tests/webhook/health-tracker.test.ts tests/tracker/github-create-issue.test.ts tests/tracker/linear-create-issue.test.ts

    pnpm add node-cron

    pnpm test tests/automation/scheduler.test.ts tests/automation/runner.test.ts tests/automation/execution-contract.test.ts tests/http/automation-api.integration.test.ts tests/orchestrator/automation-wiring.test.ts

    pnpm test tests/notification/alert-engine.test.ts tests/http/sse.test.ts tests/http/sse-contracts.integration.test.ts tests/orchestrator/lifecycle-events.test.ts

    pnpm run test:frontend
    pnpm exec playwright test --config playwright.fullstack.config.ts tests/e2e/specs/fullstack/webhook-to-ui.fullstack.spec.ts tests/e2e/specs/fullstack/notifications-timeline.fullstack.spec.ts
    pnpm exec playwright test --project=visual tests/e2e/specs/visual/notifications.visual.spec.ts
    pnpm run build
    pnpm run lint
    pnpm run format:check
    pnpm run typecheck
    pnpm run typecheck:frontend
    pnpm test
    ./scripts/run-e2e.sh

Expected signs of success:

    - config tests prove legacy Slack config still works while richer channel/trigger/automation/alert config parses cleanly.
    - notification API tests show persisted notifications can be listed and marked read.
    - webhook tests show Linear, GitHub, and generic triggers all validate/authenticate correctly and do not double-dispatch.
    - automation tests show cron entries register cleanly and persist run results.
    - frontend and Playwright tests show `/notifications` renders a real timeline and updates without a page reload.
    - lifecycle E2E proves the bundle still works with real external wiring.

## Validation and Acceptance

Acceptance for the channel and timeline work is behavioral. Configure Slack plus a generic webhook or desktop channel, emit a notification-producing event, and observe three outcomes: a persisted record appears in `/api/v1/notifications`, `/notifications` renders it, and the configured outbound channels receive it without blocking the runtime.

Acceptance for the ingress work is behavioral. Send a signed Linear webhook, a signed GitHub webhook, and an authenticated `POST /api/v1/webhooks/trigger` request. Each request should be accepted only when its auth is valid, should produce one normalized internal action, and must not cause duplicate dispatch when the same issue is also visible to polling.

Acceptance for scheduling is behavioral. Start the service with an enabled cron entry and at least one automation entry, wait for the schedule to fire, and then observe a persisted automation run plus any resulting notifications or alert events in the API and UI.

Acceptance for alerting is behavioral. Emit the same critical event twice inside the cooldown window and verify the first delivery creates an alert while the second is suppressed from outbound fanout but still remains observable in the system’s state/history as appropriate.

Because the bundle edits `frontend/src/`, run `visual-verify` after the UI work lands. Because the bundle touches webhook ingress, external tracker writes, and scheduled execution, finish with `./scripts/run-e2e.sh` in a credentialed environment rather than treating unit tests as sufficient proof.

## Idempotence and Recovery

Database changes must be additive and restart-safe. New tables for notifications and automation history should be created with the same migration style already used in `src/persistence/sqlite/database.ts`, so restarting the service after a partial implementation does not corrupt existing state.

Config reload must remain idempotent. Rewiring notification channels should first tear down or replace prior registrations, and the scheduler must stop removed cron tasks before registering new ones. Repeated webhook deliveries must continue to rely on durable dedup via the inbox store rather than in-memory assumptions.

Desktop delivery and outbound webhook delivery are best-effort side effects. Failures there must not roll back persisted notifications or crash orchestrator flows. The durable notification record should exist even if one channel fails.

If a mid-implementation branch leaves the UI ahead of the API or vice versa, rerun the targeted tests from the corresponding unit before moving on. Do not skip directly to the full suite because the smaller tests are the fastest way to prove the seam you just touched.

## Artifacts and Notes

The intended new operator APIs are:

    GET  /api/v1/notifications
    POST /api/v1/notifications/:id/read
    POST /api/v1/notifications/read-all
    GET  /api/v1/alerts
    GET  /api/v1/automations
    POST /api/v1/automations/:name/run
    POST /api/v1/webhooks/trigger
    POST /webhooks/github
    POST /webhooks/linear

The intended notification payload shape is:

    {
      "id": "notif_123",
      "type": "run_completed",
      "severity": "info",
      "title": "Run completed",
      "message": "NIN-42 finished successfully",
      "href": "/issue/NIN-42",
      "read": false,
      "createdAt": "2026-04-04T00:00:00.000Z",
      "metadata": {
        "issueIdentifier": "NIN-42",
        "deliveredChannels": ["slack", "ops-webhook"]
      }
    }

The most important execution rule for this bundle is to extend the current seams instead of inventing parallel ones. Reuse the existing webhook inbox, SSE channel, config builders, and notification manager. The shipped behavior should feel like Risoluto grew one coherent notifications/alerts/automation system, not like several unrelated subsystems were stapled on at once.

Revision note: 2026-04-04 / Codex — initial ExecPlan drafted from `.anvil/notifications-bundle/requirements.md` after preflight passed.
Revision note: 2026-04-04 / Codex — hostile review round 1 settlements folded in for real-time notification refresh, outbound webhook URL policy, automation execution identity, and trigger write truthfulness.
