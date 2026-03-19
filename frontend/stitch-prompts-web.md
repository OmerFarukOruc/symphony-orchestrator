# Symphony Orchestrator — Stitch Prompts (Web)

> All prompts assume the theme in [`design.md`](/home/oruc/Desktop/codex/frontend/design.md).
> Use Web mode in Stitch unless a prompt explicitly says otherwise.

## Shared Shell

### `web-shell`

**Idea**
Local operator shell for Symphony Orchestrator, a tool that monitors and controls autonomous coding agents.

**Theme**
Calm premium control plane. Copper signal accents on graphite and slate surfaces. Technical, precise, dense, trustworthy. Use the attached image only for atmosphere and compositional confidence.

**Content**
- Collapsible grouped sidebar with sections `Operate`, `Configure`, `Observe`, `System`
- Top header with brand, local-status badge, command palette trigger, refresh, and theme toggle
- Optional stale-feed banner above content
- Main content outlet sized for dense dashboards

**Navigation**
- Sidebar is primary navigation
- Command palette surfaces routes and high-value actions
- Hidden detail routes should feel connected to the shell, not like a separate app

**Image**
- Use the attached image as a mood reference for contrast, pacing, and material feel only

**First generation prompt**

```text
Design the shared web shell for Symphony Orchestrator, a local-first operator dashboard for autonomous coding agents.

Use the Copper Signal design system: copper accents, deep slate surfaces, warm neutral light mode, Space Grotesk headlines, Manrope body copy, IBM Plex Mono for IDs and machine data, calm 8-16px radii, crisp borders, restrained motion.

Build a premium control-plane shell, not a generic SaaS app. The left side should be a collapsible grouped sidebar with Operate, Configure, Observe, and System sections. The top header should contain the Symphony wordmark, a subtle local-status indicator, a command-palette trigger, refresh, and theme toggle. Include an optional stale-feed warning banner between the header and content area.

The layout should feel dense but breathable, with a strong sense of hierarchy, obvious scan lines, and room for complex dashboards and detail panes. Use the attached image only as an atmosphere reference for compositional confidence and material tone.
```

**Refinement prompts**

- Tighten the sidebar so active states feel unmistakable without using loud fills. Use copper as a precise signal, not a broad highlight.
- Make the command palette trigger feel more like an operator shortcut than a search box. Increase contrast and keyboard affordance.
- Add more visual distinction between header chrome, stale banner, and page content without introducing heavy shadows.

**Variation prompt**

```text
Generate three refined variations of the Symphony web shell. Keep the same information architecture, but explore different levels of density and contrast: one minimal and severe, one warmer and more tactile, and one slightly more editorial while staying technical.
```

**Web to app translation prompt**

```text
Translate this shell into a mobile app shell. Replace the left sidebar with bottom navigation for the most-used monitoring surfaces, reduce the header height, and keep the same Copper Signal identity.
```

## Current Web Screens

### `web-overview`

**Idea**
Mission Control overview page for fast operational scanning.

**Theme**
Operator-first, high-signal, composed like a control room rather than an analytics homepage.

**Content**
- Header copy: `Mission Control`
- KPI band with `Now`, `Token burn`, `Attention`, `Recent changes`
- Lower split with `Latest completed / failed` and `Live event stream`
- Empty states for no interventions, no recent changes, no terminal work, no live events
- Light stale-feed signaling

**Navigation**
- Overview is the landing page from the sidebar
- Attention items and terminal rows should clearly afford drill-in to Queue or issue detail

**Image**
- Use the attached image for framing rhythm, not decorative imagery

**First generation prompt**

```text
Design the Symphony Orchestrator overview page called Mission Control.

This page is the operator nerve center. It should open with a compact title area and then a four-part KPI band: Now, Token burn, Attention, and Recent changes. Under that, create a two-column lower area with Latest completed or failed work on the left and a live event stream on the right.

The page should feel fast to scan: big headings, clear metric rhythm, obvious status chips, and very readable event rows. The Attention card should feel slightly hotter than the rest without becoming red unless the actual data is blocked or failing. Use IBM Plex Mono for identifiers, timestamps, and token numbers.

Keep the layout asymmetric and premium. This is a local engineering instrument, not a BI dashboard.
```

**Refinement prompts**

- Increase hierarchy between the four KPI cards so `Now` and `Attention` feel slightly more important than `Token burn` and `Recent changes`.
- Make the live event stream denser and more readable for long sessions. Improve timestamp alignment and event-type chips.
- Redesign the empty states so they teach the operator what the system is waiting for instead of looking generic.

**Variation prompt**

```text
Generate two refined variations of Mission Control: one with tighter control-room density and one with slightly more breathing room and editorial spacing. Keep the same sections and operator tone.
```

**Web to app translation prompt**

```text
Translate Mission Control into a mobile dashboard. Stack the KPI cards vertically, keep the two lower sections as scrollable panels, and preserve the information hierarchy without relying on a wide desktop grid.
```

### `web-queue-board`

**Idea**
Primary workflow board showing issues across Symphony workflow columns.

**Theme**
Quiet but powerful operational board. The cards should feel sortable, inspectable, and alive.

**Content**
- Search input
- Stage chips
- Priority chips
- Sort control
- Density toggle
- Show or hide completed toggle
- Refresh control
- Workflow columns with per-column counts and empty states
- Issue cards with identifier, title, status, retry signals, model, and timestamps

**Navigation**
- Queue is the main triage surface from the sidebar
- Clicking a card opens a drawer state; an alternate action opens a full issue page

**Image**
- Use the reference image only to influence layout confidence and tonal contrast

**First generation prompt**

```text
Design the Symphony Queue page as a premium kanban-style operations board.

At the top, create a dense toolbar with search, stage filters, priority filters, sort, density toggle, completed toggle, and refresh. Below it, show horizontally scrollable workflow columns with clear headers, counts, and operator-friendly empty states.

Each issue card should feel like a precise unit of work, not a sticky note. Show identifier, title, status, retry pressure, model context, and freshness. Terminal columns should be collapsible and visually quieter than active columns. The board should support compact and comfortable density modes.

This page needs to feel like the core working surface for a technical operator.
```

**Refinement prompts**

- Make active columns feel more “in play” than terminal columns using contrast, density, and subtle color differences rather than loud fills.
- Strengthen the visual distinction between blocked, retrying, and pending-change cards without making the board noisy.
- Improve the toolbar so filters read as a deliberate operator instrument rather than a generic chip row.

**Variation prompt**

```text
Generate three variations of the Queue board: one more minimal, one more control-room dense, and one slightly more tactile with stronger card framing. Keep the same IA and status semantics.
```

**Web to app translation prompt**

```text
Translate the Queue board into a mobile-first issue queue. Replace wide kanban columns with a stage switcher and vertically stacked issue list cards. Keep filters accessible as a sheet or compact toolbar.
```

### `web-queue-issue-drawer`

**First generation prompt**

```text
Design the Queue page with the issue inspector drawer open on the right.

Keep the queue board visible and active on the left, but allocate a strong, elegant detail drawer on the right. The drawer should show issue identifier, title, status, key summary stats, description and blockers, run and workspace context, model routing and overrides, recent activity, and attempts. It should feel like deep operational context rather than a generic side panel.

Balance the visual weight carefully so the board still feels present while the drawer becomes the current focus.
```

**Refinement prompts**

- Increase the feeling that the drawer is a serious operator workspace, not a transient tooltip.
- Reduce visual clutter in the summary strip and make the model-routing area easier to understand.

### `web-issue-detail`

**First generation prompt**

```text
Design the full-page Issue Detail screen for Symphony Orchestrator.

This page should feel like the authoritative operational record for one issue. Include a strong header with identifier, title, status, updated time, logs link, runs link, and external Linear link. Follow it with a summary strip for priority, workflow state, model, reasoning, override source, and retry ETA.

Then design five major sections: Description and blockers, Run and workspace and git, Model routing and operator override form, Activity, and Attempts. The model override area should be especially clear, because it affects future runs without interrupting the current worker.

The page must feel deep, trustworthy, and easy to scan during incident response.
```

**Refinement prompts**

- Improve the header actions so Logs, Runs, and Linear are clearly secondary to the issue identity.
- Make the summary strip feel more compact and machine-readable.
- Tighten the Activity and Attempts sections so they feel like living operational evidence rather than long generic lists.

**Web to app translation prompt**

```text
Translate the full Issue Detail page into a mobile detail screen with a sticky top action bar, stacked summary cards, and bottom sheets for secondary actions.
```

### `web-logs`

**First generation prompt**

```text
Design the Logs screen for Symphony Orchestrator.

This screen is a real-time and archived event timeline for a single issue. Include a breadcrumb, a dense control bar with dynamic event-type chips, search, live or archive mode toggle, auto-scroll toggle, expand payloads toggle, copy visible logs, and a subtle refreshing indicator.

The main body should be a readable timeline with precise timestamps, event-type chips, concise messages, and expandable structured payloads. Make long sessions readable. Archive mode should feel slightly more settled and historical than live mode, but the two modes should clearly belong to the same screen.

Use IBM Plex Mono heavily for timestamps and payloads. The page should feel like something an engineer can read for hours.
```

**Refinement prompts**

- Increase the readability of structured payloads without turning them into giant code blocks.
- Differentiate live mode and archive mode using tone and microcopy rather than layout fragmentation.
- Make the “new events” jump affordance more obvious when the operator has scrolled away from the live bottom.

**Web to app translation prompt**

```text
Translate the Logs screen into a mobile timeline. Keep search and the live or archive mode toggle sticky, and make payload expansion work as accordion rows or bottom sheets.
```

### `web-runs`

**First generation prompt**

```text
Design the Run History screen for Symphony Orchestrator as a desktop master-detail experience.

The left side is a run table for one issue. The right side is a context panel that shows either a run summary or a two-run comparison. The table should support compare selection, highlight the current live run when present, and show status, timing, model, reasoning, tokens, and error signals.

The right-side detail should feel like a concise postmortem summary, not a raw dump. When two runs are selected, switch the right side into a side-by-side compare mode with changed values clearly emphasized.

This page should feel highly analytical and trustworthy.
```

**Refinement prompts**

- Make compare mode feel intentional and powerful rather than like a table trick.
- Improve the detail column so one selected run reads like a compact archived briefing.
- Increase visual distinction between historical runs and the current live run.

**Web to app translation prompt**

```text
Translate Run History into mobile. Use a vertical run list as the main surface, then open run summary or run compare in a stacked detail flow.
```

### `web-runs-compare`

**First generation prompt**

```text
Design the Run History screen in its compare state, with two runs selected and a strong comparison panel on the right.

Changed metrics should be obvious at a glance. Compare timing, status, model, reasoning, tokens, workspace context, and error outcomes. The compare surface should feel like a true operator tool for postmortem analysis, not a side-by-side marketing feature.
```

### `web-attempt-detail`

**First generation prompt**

```text
Design the archived Attempt Detail screen for Symphony Orchestrator.

This is a deep detail page for one archived run. Include a header with issue identifier and run number, a summary strip, workspace and git context, model routing, thread and turn IDs, and an optional error section. The page should feel archival, exact, and machine-readable.

Use monospace heavily for IDs, paths, timestamps, and routing metadata. Keep the page elegant, not dumpy.
```

**Refinement prompts**

- Make the summary strip easier to scan under pressure.
- Give the optional error section a stronger incident feel without overwhelming the rest of the page.

### `web-planner`

**First generation prompt**

```text
Design the Planner page for Symphony Orchestrator.

This page turns a deployment goal into editable, dependency-aware issues before they are created in Linear. Include a goal form with max issues and labels, a clear generate or regenerate action, editable issue cards, a dependency-aware side rail, and a result panel for created issues.

The planner should feel like an operator drafting session: serious, editable, structured, and optimistic. Avoid generic AI-assistant vibes. The editable issue cards should feel like compact planning objects with title, summary, priority, labels, and dependency information.
```

**Refinement prompts**

- Make the side rail feel more like a planning navigator than a secondary list.
- Improve the editable issue cards so they feel structured and dependency-aware, not like generic cards with form fields.
- Increase the visual distinction between input, review, executing, and result states.

**Web to app translation prompt**

```text
Translate Planner into a mobile drafting flow with a guided form first, then a reorderable list of issues, then a confirmation step.
```

### `web-planner-execute-modal`

**First generation prompt**

```text
Design the Planner execute-confirmation modal for Symphony Orchestrator.

The modal should summarize how many issues will be created, which labels will be applied, and how the dependency chain is ordered. Make the dependency strip visually legible and operator-friendly. This is a serious confirmation step, not a decorative popup.
```

### `web-config-overlay`

**First generation prompt**

```text
Design the Config Overlay page for Symphony Orchestrator as a three-pane operator editor.

The left rail is Schema and Help, the center is the overlay editor, and the right side is Effective Config and Diff. The center editor must support tree, path, and raw modes. The page should feel safe, technical, and legible for operators editing live local orchestration config.

Make sensitive paths visibly redacted, make the diff pane trustworthy, and make mode switching feel deliberate. This screen should be one of the most technical surfaces in the product.
```

**Refinement prompts**

- Increase clarity between effective config and persistent override so operators do not confuse them.
- Make redacted values still feel structurally understandable.
- Improve the three-pane balance so the schema rail stays helpful without overpowering the editor.

### `web-config-delete-modal`

**First generation prompt**

```text
Design a destructive confirmation modal for removing one config overlay path in Symphony Orchestrator.

The modal should clearly explain that only the persistent override is removed, not the underlying default. Keep it concise, technical, and trustworthy.
```

### `web-secrets`

**First generation prompt**

```text
Design the Secrets page for Symphony Orchestrator.

This is a trust-first secret management screen. The main content is a list of secret keys, never values. Alongside it, show a clear explanation of the encryption boundary and write-only behavior. The page must feel secure, calm, and explicit about what the operator can and cannot see.

Support strong add and delete affordances without making the screen feel dangerous.
```

**Refinement prompts**

- Strengthen the “write once, never shown again” message without turning the page into a warning wall.
- Make the keys table feel more operational and less like a CRUD admin table.

### `web-secrets-add-modal`

**First generation prompt**

```text
Design the Add Secret modal for Symphony Orchestrator.

Include fields for secret key and secret value, with clear write-once framing and a serious but calm confirmation posture. This should feel secure and operator-focused, not consumer-friendly.
```

### `web-secrets-delete-modal`

**First generation prompt**

```text
Design the Delete Secret confirmation modal for Symphony Orchestrator.

Require typed confirmation of the key name. Keep the modal terse, high-confidence, and explicit about destruction.
```

### `web-observability`

**First generation prompt**

```text
Design the Observability page for Symphony Orchestrator.

This page correlates current snapshot health, Prometheus counters, and browser-side trends. Start with an instrumentation-status strip, then create four section groups: Service health, Operational trends, Rates and limits, and Anomalies. Each group should contain small high-signal widgets that explain what the operator needs to know, not vanity charts.

The page should feel analytical and rigorous. Use source labeling per widget so operators can tell whether a metric comes from the current snapshot, backend counters, or client trends.
```

**Refinement prompts**

- Replace any generic chart-heavy feeling with denser, more operational widgets.
- Make anomalies more legible and more obviously actionable.
- Increase clarity between current-state metrics and rolling trends.

**Web to app translation prompt**

```text
Translate Observability into a mobile monitoring screen with stacked sections, high-priority anomalies first, and an accessible raw-data escape hatch.
```

### `web-observability-raw-drawer`

**First generation prompt**

```text
Design the raw metrics drawer for Symphony Observability.

This drawer shows the raw `/metrics` Prometheus text payload. Keep it readable, machine-oriented, and clearly subordinate to the main Observability page while still useful for advanced inspection.
```

### `web-settings`

**First generation prompt**

```text
Design the Settings page for Symphony Orchestrator.

This screen is a grouped settings experience built on top of config and overlay data. Include a left rail of grouped sections, a search-driven toolbar, section cards, live diff previews, and optional underlying path reveals. The page should feel more guided and operator-friendly than the raw Config Overlay page, while still clearly technical.

Default grouped sections should feel like product categories: Tracker, Model provider and auth, Sandbox, Repositories and GitHub, Notifications, Workflow stages, Feature flags, and Runtime and paths.
```

**Refinement prompts**

- Make the section rail feel more helpful and navigable during long settings sessions.
- Improve the card layout so grouped settings feel curated rather than auto-generated.
- Increase the visual distinction between save actions, diff toggles, and underlying-path reveals.

## Future Web Screens

### `web-readiness-environment`

```text
Design a Readiness and Environment page for Symphony Orchestrator.

This is a setup and validation wizard for a local-first autonomous agent system. It should guide the operator through auth mode selection, provider readiness, Docker image availability, workflow file validity, tracker connectivity, secret presence, and a first smoke-run checklist. Present it as a serious control-plane onboarding screen, not a playful setup wizard.
```

### `web-global-runs-explorer`

```text
Design a top-level Global Runs Explorer for Symphony Orchestrator.

This page should unify archived runs across issues. Include powerful filters, status and outcome breakdowns, searchable run rows, compare affordances, and fast entry into attempt detail and issue context. It should feel like a durable operational archive.
```

### `web-attempt-event-timeline`

```text
Design an Attempt Event Timeline view for Symphony Orchestrator.

This is a deep archival timeline for one attempt, combining structured events, timestamps, content snippets, and error context. Make it feel like a postmortem-quality forensic surface.
```

### `web-auth-provider-health`

```text
Design an Auth and Provider Health page for Symphony Orchestrator.

Show current auth mode, provider routing, secret presence, Linear connectivity, Codex runtime readiness, and common misconfiguration failure states. The page should build operator confidence before runs begin.
```

### `web-runtime-service-status`

```text
Design a Runtime and Service Status page for Symphony Orchestrator.

This page should surface workflow path, archive data directory, feature flags, provider summary, service version, and local-only trust posture. It should read like a concise service identity card for the running Symphony instance.
```

### `web-docker-workspace-health`

```text
Design a Docker and Workspace Health page for Symphony Orchestrator.

Show sandbox image details, resource limits, recent container outcomes, OOM or timeout indicators, workspace root status, and issue-workspace lifecycle health. This should feel like infrastructure telemetry for the operator.
```

### `web-live-agent-feed`

```text
Design a Live Agent Feed page for Symphony Orchestrator.

This is a richer real-time surface than the current event stream. Include active sessions, heartbeat or presence signals, current step, recent tool activity, and drill-down into subagent or child task context. The page should feel alive but disciplined.
```

### `web-cost-budget-analytics`

```text
Design a Cost and Budget Analytics page for Symphony Orchestrator.

Translate token usage into clear cost views by issue, model, and day. Include budget caps, near-limit alerts, and operator-facing explanations of spend spikes. Keep the page rigorous and useful, not finance-themed.
```

### `web-intervention-console`

```text
Design an Intervention Console page for Symphony Orchestrator.

This page should let operators send mid-session instructions, queue retry-now actions, pause or resume work, and review pending overrides. Treat it as a high-trust operator tool with strong action hierarchy and careful confirmation patterns.
```

### `web-prompt-analytics`

```text
Design a Prompt Analytics page for Symphony Orchestrator.

Show planning quality, issue-generation quality, prompt patterns, failure clusters, and prompt-to-outcome signals. Keep it technical and evidence-driven.
```

### `web-automation-center`

```text
Design an Automation Center page for Symphony Orchestrator.

Include repository routing, GitHub automation state, PR creation outcomes, and notification delivery status. This should feel like the operations panel for Symphony’s integrations and automations.
```

### `web-alerts-center`

```text
Design an Alerts Center page for Symphony Orchestrator.

Organize cost alerts, stalled workers, blocked issues, missing instrumentation, and provider failures into a clear, triageable incident inbox.
```

### `web-approvals-inbox`

```text
Design an Approvals and Reactions inbox for Symphony Orchestrator.

Show future approval-driven actions, review gates, and operator decisions. Make it feel like a serious control surface for supervised autonomy.
```

### `web-interactive-workspace`

```text
Design an Interactive Workspace page for Symphony Orchestrator.

This page combines issue context with a browser-accessible workspace and terminal view. Keep the layout highly structured, technical, and security-conscious.
```

### `web-fleet-operations`

```text
Design a Fleet Operations page for Symphony Orchestrator.

Show multiple hosts, worker capacity, health, workload distribution, and failure concentration in one technical overview screen.
```

### `web-browser-side-panel`

```text
Design a lightweight browser side panel for Symphony Orchestrator.

This is a compact command surface for creating tasks, checking status, and jumping back into the main control plane. Keep it narrow, efficient, and immediately useful.
```
