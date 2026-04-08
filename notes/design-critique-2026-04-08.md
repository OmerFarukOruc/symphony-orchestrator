# Risoluto Dashboard — Design Critique Report

Generated: 2026-04-08
Method: Agentation self-driving annotation pass
Viewport: 2560x1440
Total annotations: 20 (19 placed + 1 bug)

---

## Overview (`/`)

### 1. h1 "Calm control of the queue"
Path: `.page > .overview-hero-band > .overview-hero-intro > .overview-hero-title`

The hero heading 'Calm control of the queue' is evocative but doesn't communicate system state. Pair it with a real-time status pill (e.g. '6 issues need action · 0 running') directly below — like Linear's project header pattern. Gives instant orientation without scanning the page.

### 2. h2 "Needs action"
Path: `.overview-main-grid > .overview-attention-zone > .overview-section-header > .overview-section-title`

The issue cards in 'Needs action' are visually identical — same color, same weight, same density. Group by failure type or add severity-based left-border colors (red for CI failures, amber for stale). Right now 6 items all scream equally, which means nothing actually stands out. Use visual hierarchy to triage for the operator.

### 3. Sidebar nav — "Templates"
Path: `.sidebar-group-items > .sidebar-group-items-inner > .sidebar-item > .sidebar-item-label`

The sidebar groups (OPERATE, CONFIGURE, OBSERVE, SYSTEM) all have equal visual weight — no icons, no active-state indicator beyond highlight. Add left-border accent or filled icon for the active page. Also consider collapsing OBSERVE (7 items) into a scrollable sub-section — it dominates the nav and pushes SYSTEM below the fold on shorter screens.

### 4. h2 "Token burn"
Path: `.overview-secondary > .overview-collapsible-section > .overview-collapsible-header > .overview-section-title`

The three side-panel widgets (System health, Token burn, Recovered stalls) are stacked vertically with identical accordion styling. Use data-viz cards instead — a small sparkline or radial gauge for token burn, a traffic-light indicator for system health. Accordions hide the data behind a click; a glanceable dashboard should surface key numbers at rest, like Datadog's host map tiles.

### 5. Activity log — "Turn diff updated"
Path: `.overview-collapsible-body > .overview-events > .event-row > .event-row-message`

The activity log is a raw chronological feed with no visual differentiation between event types. Add event-type icons (gear for config changes, play for run starts, check for completions, alert for errors) and color-code severity. Currently reads like a terminal log — should read like a timeline. Consider grouping related events (e.g. all events for NIN-163) like GitHub's PR activity view.

### 6. h2 "Recently finished"
Path: `.overview-lower-grid > .overview-collapsible-section > .overview-collapsible-header > .overview-section-title`

Recently finished cards show only title and timestamp — no outcome indicator. Add a success/failure badge or icon (green check, red X) inline with each card. The operator's first question is always 'did it pass?' — that answer should be visible without clicking into the card. Also consider showing duration (e.g. '2m 14s') to build intuition about run health over time.

### 7. Header command bar
Path: `#app > .shell-content > .shell-header > .header-command`

The header bar has 4 icon buttons (search, refresh, API docs, theme toggle) with no labels and no tooltip on hover. The search bar placeholder is excellent ('Search pages, issues, and actions... Ctrl+K') but the other three are icon-only. Add persistent text labels or at minimum aria-described tooltips. Also, the header lacks any branding — no logo, no product name. Even a small 'Risoluto' wordmark at top-left would anchor the page identity.

---

## Board (`/queue`)

### 1. Filter toolbar — search input
Path: `.queue-main-pane > .mc-toolbar > .toolbar-search-row > .mc-input`

The filter toolbar (state tabs + priority buttons + sort + compact/hide/refresh) packs too many controls into one horizontal strip with no visual grouping. Separate state filters from priority filters with a divider or put priority on a second row. The 'all/urgent/high/medium/low' buttons look identical to state tabs — use pill badges with priority-color coding to differentiate the two filter dimensions.

### 2. Empty columns — h3 "No issues in Todo"
Path: `.kanban-column > .kanban-column-body > .mc-empty-state > .mc-empty-state-title`

Empty columns (Todo, In Progress, In Review) just say 'No issues in X' with a bare 'Open overview' link. This is wasted space — collapse empty columns to a single-line summary or show them as thin collapsed lanes in a true Kanban layout. When 3 out of 6 columns are empty, they consume half the viewport for zero information. Linear and Jira both auto-collapse empty swim lanes.

---

## Board — Issue Detail (`/queue/NIN-159`)

### 1. Kanban card
Path: `.kanban-column > .kanban-column-body > .kanban-card > .kanban-card-desc`

Issue cards in the Done column show 25 items in a long vertical list with identical visual treatment. The card-to-detail panel interaction is good, but the cards themselves need visual density control. Show outcome badges (success/error), duration, and token cost inline on the card — the operator should be able to scan without opening each panel. Consider pagination or virtual scrolling for 25+ items.

### 2. Detail panel — sections
Path: Issue detail full page

The detail page packs 5 sections (Description, Activity, Workspace, Model settings, Attempts) into a single-column scroll. The Model settings and Template sections have separate 'Save' buttons — this creates ambiguity about what's persisted. Consolidate into one save action or use auto-save with undo, like Notion's inline editing. The Attempts table columns are also tiny at this width — consider a card layout for attempts instead of a cramped table.

---

## Settings (`/settings`)

### 1. Save buttons
Path: `.settings-group > .form-grid > .form-field > #settings-hint-tracker-terminal_states`

Settings page has 6 separate Save buttons (Save tracker, Save repository, Save provider, Save sandbox, Save agent, Save Slack) — a fragmented persistence model. The operator has to remember which section they changed. Consolidate to a single floating 'Save all changes' button or use dirty-state indicators per section with a unified save. The Focused/Advanced toggle is good but needs a visual cue showing which mode is active.

### 2. h3 "Repositories" — JSON textarea
Path: `#settings-repositories-github > .settings-group > .settings-group-heading > h3`

The repository config is a raw JSON textarea — this is a developer escape hatch, not a user interface. Replace with a structured form: repo URL field, branch dropdown, identifier prefix input, with an 'Add repository' button for multiples. The placeholder hint shows the old schema format which doesn't match the actual saved value. Raw JSON forces operators to understand schema, handle syntax errors, and cross-reference docs.

### 3. h3 "Container" — security settings
Path: `#settings-sandbox > .settings-group > .settings-group-heading > h3`

The Container/Sandbox section mixes security-critical settings (approval policy, sandbox mode) with infrastructure details (image name, env vars, network domains) in a flat list. Security choices like 'Never - auto-approve everything' deserve a warning treatment — a red/amber highlight or confirmation dialog. Currently it looks identical to picking a container image name. The approval policy dropdown is the most dangerous setting on this page and should visually communicate that weight.

---

## Templates (`/templates`)

### 1. Template editor
Path: `.page > .mc-strip > div > .page-title`

The template editor is a plain textarea with no syntax highlighting for Jinja2 variables ({{ issue.identifier }}, {% if %}). Add syntax highlighting or at minimum colorize template variables — the operator needs to distinguish static text from dynamic placeholders at a glance. Also add a variable reference panel showing available variables (issue.title, issue.description, etc.) so the operator doesn't have to guess or check docs.

---

## Observability (`/observability`)

### 1. Metric grid layout
Path: `.page > .mc-strip > div > .page-title`

This page has 20+ metric panels in a flat grid with no visual hierarchy — everything looks equally important. Apply a Grafana-style approach: pin 3-4 'golden signals' (active runs, error rate, token burn, poll freshness) at top as large hero cards, then group the rest in collapsible sections. Currently the operator has to visually scan 20 tiles to answer 'is my system healthy?' — that answer should be above the fold in one glance.

---

## Notifications (`/notifications`)

### 1. Notification list
Path: `.page > .mc-strip > div > .page-title`

This is an unbounded flat list of 60+ identical notification cards with no grouping, no pagination, and no timestamp visible in the snapshot. Group related events by issue (claimed + launched + completed = one lifecycle group), add time separators ('Today', '1h ago'), and paginate or virtualize. The 'Mark all read' button appears twice. Every card is an h2 heading — that's a semantic hierarchy problem and makes screen reader navigation painful.

---

## Git & Repositories (`/git`)

### 1. Empty sections
Path: `.page > .mc-strip > div > .page-title`

The Git page has sections for Repositories, Active branches, Tracked PRs, and GitHub API, but they appear mostly empty with just section headings. The 'Quick links' at the bottom (View queue board, Advanced settings, Manage credentials) feel tacked on — they should be inline actions within each section or integrated into the relevant panels. If the sections are empty because no data exists yet, show instructive empty states explaining what will appear here and how to configure it.

---

## Containers (`/containers`)

### 1. Empty state
Path: `.page > .mc-strip > div > .page-title`

The empty state is just 'No containers running' with orphaned links. Design a proper empty state: show the container image name from settings, a visual indicator of readiness (Docker available? Image built?), and a primary CTA to start a run. The 'Open board' and 'View observability' links feel disconnected — this page should explain what containers are in the Risoluto context and what will appear here when agents are running.

---

## Workspaces (`/workspaces`)

### 1. Workspace cards
Path: `.page > .mc-strip > div > .page-title`

25 workspace cards all titled 'Risoluto smoke test' with bare 'Remove' buttons and no distinguishing metadata. Add the issue identifier (NIN-xxx), workspace path, creation timestamp, and disk usage to each card. A 'Remove all' or 'Clean stale' bulk action is needed — individually removing 25 workspaces is tedious. Also show workspace status (active vs orphaned) with visual indicators.

---

## Audit Log (`/audit-log`)

### BUG: Route returns 404

The sidebar nav includes an "Audit Log" button that navigates to `/audit-log`, but this route returns a "Page not found" error. This is a shipped nav link pointing to a dead route — either implement the page or remove the nav item.

---

## Cross-cutting themes

| Theme | Pages affected | Priority |
|-------|---------------|----------|
| **No visual hierarchy** — everything screams equally | Notifications, Observability, Board, Overview | High |
| **Missing empty states** — bare headings instead of guidance | Git, Containers, Board columns | High |
| **Fragmented persistence** — multiple Save buttons | Settings, Issue Detail | Medium |
| **Identical card density** — no inline metadata | Workspaces, Board, Notifications, Overview | Medium |
| **No sidebar active indicator** | All pages | Medium |
| **No branding** — no logo or product name in header | All pages | Low |
