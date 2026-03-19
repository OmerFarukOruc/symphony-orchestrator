# Symphony Orchestrator — Stitch Prompts (App / Mobile)

> All prompts assume the theme in [`design.md`](/home/oruc/Desktop/codex/frontend/design.md).
> Use App mode in Stitch for this file.

## Shared App Shell

### `app-shell`

**First generation prompt**

```text
Design the mobile app shell for Symphony Orchestrator, a local-first operator tool for autonomous coding agents.

Use the Copper Signal design system: copper accents, dark slate surfaces, warm neutral light mode, Space Grotesk headlines, Manrope body copy, IBM Plex Mono for machine data, calm 8-16px radii, crisp borders, restrained motion.

This mobile shell should not try to reproduce the desktop sidebar. Build a compact top bar, bottom navigation for the most-used monitoring surfaces, and a strong system for sheets and drill-in detail screens. The app should feel like a serious monitoring and intervention instrument for technical operators.
```

## Current App Screens

### `app-overview`

**First generation prompt**

```text
Design the Symphony Mission Control overview screen for mobile.

Keep the same current web information architecture, but translate it into stacked, scan-friendly sections: Now, Token burn, Attention, Recent changes, Latest completed or failed, and Live event stream. The page should feel dense but readable in one-handed use. Put the hottest signals first and keep the rest as compact stacked cards or strips.
```

**Refinement prompts**

- Tighten the top of the screen so the operator sees the most important live counts before scrolling.
- Make the live event stream easy to scan in short vertical bursts.

### `app-queue`

**First generation prompt**

```text
Design the Symphony Queue screen for mobile.

Replace the desktop kanban layout with a stage-aware queue list. Use a segmented control or stage tabs at the top, then a vertically stacked issue list with high-signal cards showing identifier, title, status, retry or blocked signals, model context, and freshness. Filters such as priority, sort, and density should open in a compact sheet rather than occupying permanent width.
```

**Refinement prompts**

- Make stage switching fast and thumb-friendly.
- Improve the issue cards so they still feel like serious operator objects, not generic mobile list tiles.

### `app-issue-detail`

**First generation prompt**

```text
Design the mobile Issue Detail screen for Symphony Orchestrator.

Stack the same desktop sections in a mobile-friendly order: header identity, summary strip, description and blockers, run and workspace and git, model routing, activity, and attempts. Use a sticky top area or bottom action bar for Logs, Runs, and future intervention actions. The page should feel like a powerful pocket control surface.
```

### `app-logs`

**First generation prompt**

```text
Design the mobile Logs screen for Symphony Orchestrator.

Keep live and archive modes in one screen with a small mode switcher near the top. Show event-type chips in a horizontally scrollable row, then a vertically stacked event timeline with expandable payloads. Make payload expansion work well in constrained width and preserve heavy IBM Plex Mono usage for timestamps and structured data.
```

### `app-runs`

**First generation prompt**

```text
Design the mobile Run History screen for Symphony Orchestrator.

Use a vertical list of runs as the primary surface. Each row should show run number, status, timing, model, tokens, and error signal. Selecting a run opens a detailed summary view. Two selected runs should open a compare sheet or compare screen with changed values clearly highlighted.
```

### `app-attempt-detail`

**First generation prompt**

```text
Design the mobile Attempt Detail screen for Symphony Orchestrator.

This is a compact archived-run detail screen. Show summary strip, workspace and git context, model routing, thread and turn IDs, and an optional error section. Make it feel archival, precise, and easy to scan on a phone.
```

### `app-planner`

**First generation prompt**

```text
Design the mobile Planner flow for Symphony Orchestrator.

Start with a guided goal form, then move into a review list of generated issues, then a confirmation step before execution. The screen should feel like a focused drafting workflow, not a shrunken desktop board. Keep dependencies understandable in a narrow layout.
```

### `app-config`

**First generation prompt**

```text
Design the mobile Config Overlay screen for Symphony Orchestrator.

Do not copy the desktop three-column layout. Convert it into a guided technical editor with tabs or segmented modes for Schema and Help, Overlay editing, and Effective diff. The operator should always know whether they are viewing live effective config or persistent override state.
```

### `app-secrets`

**First generation prompt**

```text
Design the mobile Secrets screen for Symphony Orchestrator.

Show a key-only secrets list, a clear explanation of write-once behavior, and bottom-sheet flows for adding or deleting a secret. The page should feel secure and controlled, not like a generic settings list.
```

### `app-observability`

**First generation prompt**

```text
Design the mobile Observability screen for Symphony Orchestrator.

Start with instrumentation status, then stack Service health, Operational trends, Rates and limits, and Anomalies in that order. Use compact technical cards rather than broad charts. Give anomalies the strongest emphasis and keep raw metrics accessible as a sheet or drill-in screen.
```

### `app-settings`

**First generation prompt**

```text
Design the mobile Settings screen for Symphony Orchestrator.

Organize grouped sections such as Tracker, Model provider and auth, Sandbox, Notifications, Runtime and paths, and Feature flags. Include search and compact diff awareness, but keep the flow curated and touch-friendly. The page should feel guided rather than raw.
```

## Future App Screens

### `app-readiness-environment`

```text
Design a mobile Readiness and Environment screen for Symphony Orchestrator.

This is a setup and validation checklist for auth, provider readiness, Docker, workflow file, tracker connectivity, and first smoke-run status. Build it as a high-trust operator onboarding flow that can be checked quickly from a phone.
```

### `app-live-feed`

```text
Design a mobile Live Agent Feed screen for Symphony Orchestrator.

Show active sessions, heartbeat or presence, current step, recent tool activity, and fast drill-in to one issue or run. Prioritize scan speed and clear status over long-form detail.
```

### `app-costs`

```text
Design a mobile Cost and Budget screen for Symphony Orchestrator.

Show daily spend, issue-level cost hotspots, budget caps, and near-limit alerts. Keep the page sober, precise, and easy to scan.
```

### `app-auth-health`

```text
Design a mobile Auth and Provider Health screen for Symphony Orchestrator.

Summarize current auth mode, provider routing, secret presence, tracker health, and common failure states in a compact confidence dashboard for operators.
```

### `app-intervention`

```text
Design a mobile Intervention screen for Symphony Orchestrator.

Support safe operator actions such as sending instructions, retrying, pausing, and reviewing pending overrides. The page should emphasize action safety, confirmation, and issue context.
```

### `app-alerts`

```text
Design a mobile Alerts screen for Symphony Orchestrator.

Show blocked issues, stalled workers, provider failures, and budget alerts in a compact, triageable feed with strong prioritization and obvious next actions.
```

## App Translation Rules

- Preserve the same page order and product story as web
- Translate wide splits into stacked cards, sheets, and step-based flows
- Keep the most important monitoring signals above the fold
- Use bottom sheets for destructive actions, compare mode, filters, and raw data
- Keep IBM Plex Mono anywhere the operator is reading IDs, timestamps, logs, or structured metrics
