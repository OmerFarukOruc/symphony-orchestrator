# Symphony Orchestrator — Screen Manifest

> Design target inventory for the Stitch prompt pack.
> `current` means shipped in the SPA today. `future` means recommended for design exploration.

## Web — Current

| screen_id | status | kind | route_or_parent | notes |
| --- | --- | --- | --- | --- |
| `web-shell` | current | page-shell | app root | shared sidebar, header, stale banner, command entry, shell chrome |
| `web-overview` | current | page | `/` | Mission Control with KPI strip, attention, recent changes, terminal issues, live event stream |
| `web-queue-board` | current | page | `/queue` | search, filters, sort, density, workflow columns, issue cards |
| `web-queue-issue-drawer` | current | drawer | `/queue/:id` | queue board with right-side issue inspector open |
| `web-issue-detail` | current | detail | `/issues/:id` | full-page issue inspector |
| `web-logs` | current | page | `/issues/:id/logs` and `/logs/:id` | one screen with live/archive modes, search, chips, payload expansion |
| `web-runs` | current | page | `/issues/:id/runs` | issue-scoped run history with table/detail master-detail layout |
| `web-runs-compare` | current | state | `web-runs` | two-run comparison state |
| `web-attempt-detail` | current | detail | `/attempts/:id` | archived attempt metadata and error state |
| `web-planner` | current | page | `/planner` | goal form, editable plan cards, dependency rail, result panel |
| `web-planner-execute-modal` | current | modal | `web-planner` | execution confirmation with dependency strip |
| `web-config-overlay` | current | page | `/config` | schema rail, editor, diff pane, tree/path/raw modes |
| `web-config-delete-modal` | current | modal | `web-config-overlay` | delete one persistent overlay path |
| `web-secrets` | current | page | `/secrets` | secret key list plus encryption/trust aside |
| `web-secrets-add-modal` | current | modal | `web-secrets` | add secret flow |
| `web-secrets-delete-modal` | current | modal | `web-secrets` | destructive confirmation flow |
| `web-observability` | current | page | `/observability` | service health, trends, rates and limits, anomalies |
| `web-observability-raw-drawer` | current | drawer | `web-observability` | raw `/metrics` payload |
| `web-settings` | current | page | `/settings` | grouped settings, section rail, search, diff and underlying-path states |

## Web — Future Near-Term

| screen_id | status | kind | route_or_parent | notes |
| --- | --- | --- | --- | --- |
| `web-readiness-environment` | future | page | future | onboarding and validation wizard for auth, Docker, workflow, and smoke checks |
| `web-global-runs-explorer` | future | page | future | true top-level runs archive to replace the current `/runs-placeholder` mismatch |
| `web-attempt-event-timeline` | future | detail | future | archived per-attempt event view inside run inspection |
| `web-auth-provider-health` | future | page | future | auth mode, provider wiring, Linear access, secret presence, and live health checks |
| `web-runtime-service-status` | future | page | future | runtime metadata, workflow path, data dir, feature flags, provider summary |
| `web-docker-workspace-health` | future | page | future | sandbox image, resource state, container outcomes, workspace lifecycle |
| `web-live-agent-feed` | future | page | future | session-centric live feed and subagent drill-down |
| `web-cost-budget-analytics` | future | page | future | token-to-cost visibility, caps, alerts, and per-model spend |
| `web-intervention-console` | future | page | future | mid-session send, retry-now, pause/resume, scoped operator actions |

## Web — Future Roadmap

| screen_id | status | kind | route_or_parent | notes |
| --- | --- | --- | --- | --- |
| `web-prompt-analytics` | future | page | future | prompt quality, issue generation quality, and planning analytics |
| `web-automation-center` | future | page | future | repo routing, GitHub automation, PR creation, notification outcomes |
| `web-alerts-center` | future | page | future | grouped incidents, thresholds, and operator follow-up |
| `web-approvals-inbox` | future | page | future | reactions, approvals, and future approval-driven agent actions |
| `web-interactive-workspace` | future | page | future | browser-accessible workspace and terminal view |
| `web-fleet-operations` | future | page | future | multi-host and fleet health overview |
| `web-browser-side-panel` | future | page | future | lightweight command surface for quick task dispatch |

## App / Mobile — Current

| screen_id | status | kind | route_or_parent | notes |
| --- | --- | --- | --- | --- |
| `app-shell` | current | page-shell | app root | compact header plus bottom navigation for monitoring-first use |
| `app-overview` | current | page | translation of `/` | stacked Mission Control cards optimized for scan speed |
| `app-queue` | current | page | translation of `/queue` | queue list and stage pivots instead of wide kanban |
| `app-issue-detail` | current | detail | translation of `/issues/:id` | stacked issue sections and action bar |
| `app-logs` | current | page | translation of logs routes | live/archive timeline in a vertical mobile format |
| `app-runs` | current | page | translation of `/issues/:id/runs` | list-first run history with compare sheet |
| `app-attempt-detail` | current | detail | translation of `/attempts/:id` | compact archived attempt summary |
| `app-planner` | current | page | translation of `/planner` | focused drafting and review flow |
| `app-config` | current | page | translation of `/config` | guided config editor rather than three visible columns |
| `app-secrets` | current | page | translation of `/secrets` | secure list with bottom-sheet add/delete flows |
| `app-observability` | current | page | translation of `/observability` | stacked metrics and anomalies |
| `app-settings` | current | page | translation of `/settings` | searchable grouped settings cards |

## App / Mobile — Future

| screen_id | status | kind | route_or_parent | notes |
| --- | --- | --- | --- | --- |
| `app-readiness-environment` | future | page | future | phone-friendly setup checklist and validation |
| `app-live-feed` | future | page | future | monitoring-first live agent surface |
| `app-costs` | future | page | future | per-day and per-issue budget visibility |
| `app-auth-health` | future | page | future | auth, provider, and secret readiness summary |
| `app-intervention` | future | page | future | safe operator actions on one issue or run |
| `app-alerts` | future | page | future | actionable alert inbox |
