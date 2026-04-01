# Risoluto UI Map

Element reference for visual verification. Use this when you need current routes, selectors, or page structure for the Risoluto web UI.

## Required Environment

Before the UI can serve, these must be set:

| Variable | Required | Notes |
|---|---|---|
| `MASTER_KEY` | Yes | Any non-empty string for local QA (e.g. `local-qa-key`) |
| `LINEAR_API_KEY` | Yes | API key for Linear integration |
| `LINEAR_PROJECT_SLUG` | Optional | Scopes which Linear project to poll |

**Startup command:**

```bash
MASTER_KEY="${MASTER_KEY:-local-qa-key}" pnpm run dev
```

Default port is 4000 (from WORKFLOW.md server config). Override with `--port`:

```bash
MASTER_KEY="${MASTER_KEY:-local-qa-key}" pnpm run dev --port 4000
```

## Architecture

The frontend is a **Vite + TypeScript SPA** under `frontend/src/`. The backend serves `index.html` via SPA catch-all for any path not matching `/api/*` or `/metrics`.

| Layer | Location |
|---|---|
| Pages | `frontend/src/pages/*.ts` |
| Components | `frontend/src/components/*.ts` |
| UI modules | `frontend/src/ui/*.ts` (shell, sidebar, header, theme, keyboard, command-palette) |
| Styles | `frontend/src/styles/*.css` |
| Design tokens | `frontend/src/styles/design-system.css` + `tokens.css` |
| Router | `frontend/src/router.ts` |
| State | `frontend/src/state/` (polling, event-source) |
| API client | `frontend/src/api.ts` |
| Entry | `frontend/src/main.ts` |

## Routes

### Frontend (SPA)

| Route | Page | Source |
|---|---|---|
| `/` | Overview (dashboard) | `pages/overview.ts` → `overview-view.ts` |
| `/queue` | Kanban board | `pages/queue.ts` → `queue-view.ts` |
| `/queue/:id` | Kanban board with inspector open | `pages/queue.ts` |
| `/issues/:id` | Issue full page | `pages/issue.ts` → `issue-view.ts` |
| `/issues/:id/runs` | Run history | `pages/runs.ts` |
| `/issues/:id/logs` | Structured logs | `pages/logs.ts` → `logs-view.ts` |
| `/logs/:id` | Structured logs (alias) | `pages/logs.ts` → `logs-view.ts` |
| `/attempts/:id` | Single attempt | `pages/attempt.ts` |
| `/observability` | Metrics & charts | `pages/observability.ts` |
| `/settings` | Configuration | `pages/settings.ts` |
| `/notifications` | Alert history | `pages/notifications.ts` |
| `/git` | Git context | `pages/git.ts` |
| `/workspaces` | Workspace management | `pages/workspaces.ts` |
| `/containers` | Container management | `pages/containers.ts` |
| `/templates` | Prompt templates | `pages/templates.ts` |
| `/audit` | Audit log | `pages/audit.ts` |
| `/setup` | Setup wizard | `pages/setup.ts` |
| `/config` | Alias → `/settings#devtools` | |
| `/secrets` | Alias → `/settings#credentials` | |

### API Endpoints (Key)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/state` | GET | Full orchestrator state |
| `/api/v1/events` | GET | SSE event stream |
| `/api/v1/runtime` | GET | Version, feature flags |
| `/api/v1/refresh` | GET | Request state refresh |
| `/api/v1/models` | GET | Available LLM models |
| `/api/v1/transitions` | GET | Available state transitions |
| `/api/v1/:id` | GET | Issue detail |
| `/api/v1/:id/abort` | POST | Abort running issue |
| `/api/v1/:id/model` | POST | Override model |
| `/api/v1/:id/steer` | POST | Send steering message |
| `/api/v1/:id/transition` | POST | Transition issue state |
| `/api/v1/:id/attempts` | GET | List attempts |
| `/api/v1/config` | GET | Effective config |
| `/api/v1/config/overlay` | GET/PUT | Config overlay |
| `/api/v1/secrets` | GET | List secret keys |
| `/api/v1/setup/status` | GET | Setup wizard status |
| `/api/v1/templates` | GET/POST | Prompt templates |
| `/api/v1/audit` | GET | Audit log query |
| `/api/v1/git/context` | GET | Git repository context |
| `/api/v1/workspaces` | GET | List workspaces |
| `/metrics` | GET | Prometheus metrics |
| `/api/v1/openapi.json` | GET | OpenAPI spec |
| `/api/docs` | GET | Swagger UI |

## App Shell

The shell wraps all pages with sidebar + header + content outlet.

| Element | Selector | Description |
|---|---|---|
| App root | `#app` | Root flex container |
| Skip link | `.skip-link` | A11y skip-to-main |
| Sidebar | `.shell-sidebar` | Collapsible nav rail |
| Sidebar item | `.sidebar-item` | Individual nav link |
| Active item | `.sidebar-item.is-active` | Current page |
| Item badge | `.sidebar-item-badge` | Count pill |
| Item hotkey | `.sidebar-hotkey` | Keyboard shortcut hint |
| Collapse toggle | `.sidebar-collapse-toggle` | Expand/collapse sidebar |
| Group header | `.sidebar-group-header` | Section heading |
| Content area | `.shell-content` | Header + outlet container |
| Header | `.shell-header` | Top bar |
| Brand | `.header-brand` | Logo + "Risoluto" text |
| Brand icon | `.header-brand-icon` | Logo SVG |
| Brand name | `.header-brand-name` | "Risoluto" label |
| Env badge | `.header-env-badge` | dev/prod indicator |
| Command trigger | `.header-command-trigger` | Cmd+K palette |
| Header actions | `.header-actions` | Theme toggle, etc. |
| Stale banner | `#stale-banner` | Connection lost warning |
| Outlet | `.shell-outlet` | Scrollable page content |
| Main content | `#main-content` | A11y landmark |
| Route announcer | `.sr-only[role="status"]` | Screen reader route changes |

**Sidebar states:**
- `.shell-sidebar.is-expanded` — sidebar open
- `.sidebar-group.is-collapsed` — group collapsed

## Overview Page (`/`)

Root: `.page.overview-page.fade-in`

| Element | Selector | Description |
|---|---|---|
| Hero band | `.overview-hero-band` | Top narrative strip |
| Hero intro | `.overview-hero-intro` | Title block |
| Hero label | `.overview-hero-label` | "Overview" kicker |
| Hero title | `.overview-hero-title` | Main heading |
| Hero detail | `.overview-hero-detail` | Description |
| Hero state | `.overview-hero-state` | Current moment badge |
| Hero metrics | `.overview-hero-metrics` | 2×2 grid (Running, Queue, Rate limit, Attention) |
| Live metric | `.overview-live-metric` | Individual metric pill |
| Live value | `.overview-live-value` | Large metric number |
| Live label | `.overview-live-label` | Metric label |
| Main grid | `.overview-main-grid` | Attention zone + sidebar |
| Attention zone | `.overview-attention-zone` | Issues needing action |
| Attention count | `.overview-attention-count` | Live count badge |
| Attention list | `.overview-attention-list` | Blocking issue list |
| Attention item | `.overview-attention-item` | Clickable issue row |
| Terminal item | `.overview-terminal-item` | Completed issue row |
| Collapsible section | `.overview-collapsible-section` | Expandable panel (rendered dynamically when data exists) |
| Collapsible header | `.overview-collapsible-header` | Toggle button |
| Collapsible body | `.overview-collapsible-body` | Panel content |
| Secondary sidebar | `.overview-secondary` | Health, tokens, events |
| Token section wrapper | `.overview-token-section` | Wraps collapsible token burn |
| Health section wrapper | `.overview-health-section` | Wraps system health |
| Recent section wrapper | `.overview-recent-section` | Wraps latest activity |
| Stall section wrapper | `.overview-stall-section` | Wraps recovered stalls |
| Terminal section wrapper | `.overview-terminal-section` | Wraps completed/failed |
| Token grid | `.overview-token-grid` | 2×2 token burn metrics |
| Getting started | `.overview-getting-started` | Onboarding card |
| Empty state | `.overview-teaching-empty` | Generic empty |

**Data attributes:**
- `data-sectionId="health|tokens|stalls|recent|terminal"` — collapse tracking
- `data-status="<status>"` — issue status on items
- `aria-expanded="true|false"` — collapsible state

## Queue / Kanban Board (`/queue`)

Root: `.page.queue-page.fade-in`

| Element | Selector | Description |
|---|---|---|
| Main pane | `.queue-main-pane` | Toolbar + board container |
| Toolbar | `.mc-toolbar.queue-toolbar` | Filter/control bar |
| Layout | `.queue-layout` | Board + inspector flex |
| Board wrap | `.kanban-board-wrap` | Scrollable wrapper |
| **Board** | `.kanban-board` | Grid of columns |
| **Column** | `.kanban-column` | Stage column |
| Column header | `.kanban-column-header` | Title/count/actions |
| Column dot | `.kanban-column-dot` | Colored status dot |
| Column label | `.kanban-column-label` | Stage name |
| Column count | `.kanban-column-count` | Issue count badge |
| Column toggle | `.kanban-column-toggle` | Collapse button |
| Column body | `.kanban-column-body` | Scrollable cards |
| **Card** | `.kanban-card` | Issue card (button element) |
| Card identifier | `.kanban-card-identifier` | Issue ID (mono) |
| Card title | `.kanban-card-title` | Title (3-line clamp) |
| Card desc | `.kanban-card-desc` | Description (2-line clamp) |
| Card labels | `.kanban-card-labels` | Tag badges |
| Card meta | `.kanban-card-meta` | Priority + status |
| Card retry | `.kanban-card-retry` | Retry count |
| Card lifecycle | `.kanban-card-lifecycle` | Step timeline |
| Lifecycle step | `.kanban-card-lifecycle-step` | Individual step |
| Card footer | `.kanban-card-footer` | Token + timestamp |
| Card hint | `.kanban-card-hint` | Keyboard hint |
| Inspector drawer | `.issue-inspector.queue-drawer.drawer` | Right panel |

**Data attributes:**
- `data-stage="<key>"` — column stage (backlog, todo, in_progress, review, done, blocked, canceled, closed, duplicate, retrying, is-gate). Note: both `canceled` and `cancelled` are normalized to the same stage.
- `data-status="<status>"` — card status (queued, claimed, running, retrying, blocked, completed, pending_change)
- `data-issueId="<identifier>"` — issue identifier on card
- `data-dropAllowed="true|false"` — drop target state

**State classes:**
- `.is-collapsed` — column body hidden
- `.is-drag-over` — drop zone highlight
- `.is-drop-forbidden` — drop zone disabled
- `.is-dragging` — card being dragged (opacity: 0.5)
- `.is-selected` — card selected (border + background)
- `.is-focused` — card keyboard focused
- `.is-compact` / `.is-comfortable` — density mode

**Lifecycle step states:**
- `.is-complete` — green dot
- `.is-current` — animated pulse
- `.is-failed` — red dot
- `.is-pending` — not started

## Issue Inspector

Appears as drawer (`.queue-drawer`) in queue page or full page (`.issue-page`).

Root: `.issue-inspector-shell`

| Element | Selector | Description |
|---|---|---|
| Body | `.issue-inspector.issue-inspector-body` | Scrollable sections |
| Header | `.issue-header.issue-section.mc-panel` | Title + actions |
| Identifier | `.issue-identifier` | Issue ID (e.g. "LIN-123") |
| Title | `.issue-title` | Issue h1 |
| Header meta | `.issue-header-meta` | Status + timestamp |
| Header actions | `.issue-header-actions` | Button group |
| Close button | `.mc-button.is-ghost.drawer-close-btn` | Drawer close (✕) |
| Logs link | `.mc-button.is-primary` | "Open logs" button |
| Tracker link | `.mc-button.is-ghost` | "Open tracker" |
| Summary strip | `.issue-summary-strip` | KPI row (Priority, Model, Tokens, Duration) |
| Summary stat | `.issue-summary-stat` | Individual metric cell |
| Section | `.issue-section.mc-panel.expand-in` | Collapsible section |

## Logs Page (`/logs/:id` or `/issues/:id/logs`)

Root: `.page.logs-page.fade-in`

| Element | Selector | Description |
|---|---|---|
| Header | `.logs-header` | Breadcrumb + Live/Archive tabs |
| Breadcrumb | `.logs-breadcrumb` | "Queue → ID → Logs" path |
| Mode segment | `.mc-button-segment` | Live/History button group |
| Live button | `.mc-button.is-sm.logs-live-btn` | "Live" tab |
| Controls | `.logs-control` | Filter bar |
| Type chips | `.logs-toolbar-group` | Event type filter chips |
| Search input | `.mc-input.logs-search` | Search text field |
| View actions | `.logs-view-actions` | Sort, density, expand, copy buttons |
| Sort button | `.logs-icon-btn` | Sort toggle (`.is-flipped` when asc) |
| Density button | `.logs-icon-btn` | Compact toggle |
| Auto-scroll button | `.logs-icon-btn` | Follow live toggle |
| Expand button | `.logs-icon-btn` | Expand payloads toggle |
| Copy all button | `.logs-icon-btn` | Copy logs |
| Log scroll area | `.logs-scroll` | Main scrollable area |
| New indicator | `.mc-button.is-ghost.logs-new-indicator` | "↓ New events" button |
| **Log row** | `.mc-log-row` | Individual log entry |
| Row header | `.mc-log-row-header` | Time + type + message |
| Chevron | `.mc-log-chevron` | Expand indicator |
| Timestamp | `.mc-log-time` | ISO time |
| Event chip | `.mc-event-chip` | Type badge |
| Message | `.mc-log-message` | Primary text |
| Payload | `.mc-log-payload` | JSON/text content (hidden by default) |
| Thinking block | `.mc-log-thinking` | Extended thinking display |
| Prose block | `.mc-log-prose` | Agent message prose |
| Diff block | `.mc-log-diff-wrapper` | Diff display |
| Copy button | `.mc-log-copy-btn` | Copy to clipboard |
| Empty state | `.mc-empty-state` | No matching logs |

**Type filter chips:** `.mc-chip.is-interactive` — active state: `.is-active`

**Log row state classes:**
- `.is-expanded` — payload visible
- `.has-payload` — clickable row
- `.is-error` — red left stripe
- `.is-agent` — green left stripe
- `.is-reasoning` — amber left stripe
- `.is-tool` — copper left stripe
- `.is-time-gap` — time gap separator

**Density classes on `.logs-scroll`:**
- `.is-compact` — tight layout
- `.is-comfortable` — spacious layout

## Setup Wizard (`/setup`)

Root: `.page.setup-page.fade-in`

| Element | Selector | Description |
|---|---|---|
| Steps container | `.setup-steps` | Step list |
| Step indicator | `.setup-step-indicator` | Individual step |
| Step dot | `.setup-step-dot` | Circle indicator |
| Step label | `.setup-step-label` | Step name |
| Title | `.setup-title` | Page heading |
| Subtitle | `.setup-subtitle` | Description |
| Callout | `.setup-callout` | Info/warning box |
| Actions | `.setup-actions` | Button group |
| Project grid | `.setup-project-grid` | Project selection |
| Project card | `.setup-project-card` | Selectable item (`.is-selected`) |
| Key display | `.setup-key-display` | API key display |

**Data attributes:**
- `data-step="<step-key>"` — current setup step

## UI Primitives

### Buttons

| Class | Purpose |
|---|---|
| `.mc-button` | Base button |
| `.is-primary` | Primary action (copper) |
| `.is-ghost` | Transparent/secondary |
| `.is-sm` | Small (32px height) |
| `.is-lg` | Large (44px height) |
| `.is-disabled` | Disabled state |
| `.is-active` | Active toggle |

### Badges & Chips

| Class | Purpose |
|---|---|
| `.mc-badge` | Inline label |
| `.mc-chip` | Toggle chip |
| `.mc-chip.is-interactive` | Clickable filter chip |
| `.mc-chip.is-active` | Active filter |
| `.mc-event-chip` | Log event type badge |

### Forms

| Class | Purpose |
|---|---|
| `.mc-input` | Text input |
| `.mc-button-segment` | Button toggle group |

### Surfaces

| Class | Purpose |
|---|---|
| `.mc-panel` | Card/panel surface |
| `.mc-strip` | Banner strip |
| `.mc-container` | Generic container |
| `.mc-list-item` | List row |
| `.mc-empty-state` | Empty placeholder |

### Status Variants (on `.mc-strip`, `.mc-container`, `.mc-list-item`)

| Class | Visual |
|---|---|
| `.is-status-running` | 3px green left border + tint + pulse |
| `.is-status-blocked` | 3px red left border + tint + pulse |
| `.is-status-retrying` | 2px amber left border + tint |
| `.is-status-claimed` | 2px purple left border + tint + pulse |
| `.is-status-queued` | No border accent |
| `.is-status-completed` | No border accent |

### Modal Dialog

| Class | Purpose |
|---|---|
| `.modal-root` | Container (`[hidden]` when closed) |
| `.modal-backdrop` | Dismissible overlay |
| `.modal-panel` | Dialog box (`.modal-sm` / `.modal-md` / `.modal-lg`) |
| `.modal-header` | Title + close |
| `.modal-title` | h2 |
| `.modal-body` | Content |
| `.modal-footer` | Action buttons |

### Empty State

| Class | Purpose |
|---|---|
| `.mc-empty-state` | Container |
| `.mc-empty-state-icon` | Large icon |
| `.mc-empty-state-kicker` | Small label |
| `.mc-empty-state-title` | Heading |
| `.mc-empty-state-detail` | Description |

**Data attribute:** `data-emptyVariant="default|queue|terminal|events|attention|error|network"`

## CSS Design Tokens

### Brand Colors

```css
--color-copper-500: #b45837;    /* Primary brand */
--color-copper-600: #9a472b;    /* Interactive default */
--interactive-primary: #9a472b; /* Light theme CTA */
```

### Surfaces (Light Theme)

```css
--bg-base: #f7f5f1;        /* App background */
--bg-surface: #ffffff;      /* Card/panel white */
--bg-elevated: #f0ede7;     /* Elevated surface */
--bg-muted: #e8e4dc;        /* Muted surface */
```

### Text (Light Theme)

```css
--text-primary: #1a1f28;    /* Near-black text */
--text-secondary: #545e6b;  /* Secondary text */
--text-muted: #717b88;      /* Muted text */
--text-accent: #9a472b;     /* Copper accent text */
```

### Borders (Light Theme)

```css
--border-default: #cdc7be;  /* Standard border */
--border-subtle: #ddd8d0;   /* Subtle border */
--border-strong: #ada7a0;   /* Emphasis border */
```

### Status Colors

```css
--status-queued: #4f7cff;     /* Blue */
--status-claimed: #7c62d6;    /* Purple */
--status-running: #2f9e44;    /* Green */
--status-retrying: #d98a1c;   /* Amber */
--status-blocked: #d94841;    /* Red */
--status-completed: #3a9e7a;  /* Teal green */
--status-cancelled: #b25c6a;  /* Muted red */
--status-backlog: #7b8fa8;    /* Slate */
--status-gate: #f59e0b;       /* Amber (distinct from retrying) */
```

### Semantic Scales

```css
--color-success-600: #16a34a;  /* Green */
--color-warning-600: #d97706;  /* Amber */
--color-danger-600: #dc2626;   /* Red */
--color-info-600: #2563eb;     /* Blue */
```

### Typography

```css
--font-heading: "Space Grotesk", ...;
--font-body: "Manrope", ...;
--font-mono: "IBM Plex Mono", ...;
```

### Shell Dimensions

```css
--sidebar-width-collapsed: 56px;
--sidebar-width-expanded: 220px;
--header-height: 48px;
```

## Visual Characteristics to Verify

- **Sidebar** — collapsible nav rail, copper accent on active item, count badges
- **Header** — brand wordmark, env badge, command palette trigger (Cmd+K)
- **Overview hero** — 2×2 live metrics grid, attention zone, collapsible sections
- **Kanban columns** — colored status dots, card lifecycle timelines, drag-and-drop
- **Cards** — identifier, title, labels, priority badge, lifecycle steps
- **Inspector drawer** — slides in from right, summary strip with KPIs
- **Logs page** — type filter chips, expandable rows with color-coded left stripes
- **Setup wizard** — step indicator dots, project selection grid
- **Status tints** — running (green pulse), blocked (red pulse), retrying (amber), claimed (purple)
- **Theme** — supports light and dark modes via `data-theme="dark"`
- **Animations** — `.fade-in` page transitions, `.expand-in` sections, `.stagger-item` cards
