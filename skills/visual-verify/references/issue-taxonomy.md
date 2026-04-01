# Issue Taxonomy

Severity levels and exploration checklist for Full QA workflow. Use when categorizing issues found during visual verification.

## Severity Levels

### Critical

Issues that prevent core functionality from working.

- Page doesn't load / blank page / white screen
- JavaScript exceptions that break rendering
- Data not displayed (board empty when issues exist)
- Inspector drawer fails to open
- API responses not rendered
- Setup guard blocks all routes unexpectedly
- SSE connection fails (no live updates)

### High

Issues that significantly degrade usability.

- Layout broken at standard viewports (1280px+)
- Interactive elements non-functional (buttons don't respond, filters don't work)
- Data displayed incorrectly (wrong counts, mismatched issue IDs)
- Missing content that should be visible
- Console errors on page load
- Sidebar navigation broken
- Kanban drag-and-drop non-functional
- Theme toggle doesn't apply

### Medium

Issues that affect polish or secondary functionality.

- Visual regressions (alignment, spacing, colors off)
- Responsive layout issues at tablet/mobile sizes
- Hover/focus states missing or incorrect
- Animation glitches (`.fade-in`, `.expand-in`, `.stagger-item`)
- Inconsistent typography or spacing
- Scrollbar issues
- Truncation problems
- Collapsible sections don't expand/collapse
- Status tint colors incorrect

### Low

Minor cosmetic issues.

- Placeholder text visible in production
- Minor pixel misalignments (1-2px)
- Missing hover cursors
- Inconsistent icon sizing
- Subtle color inconsistencies
- Animation timing slightly off

### Infrastructure

Issues that prevent testing from starting or completing.

- Server fails to start (missing env vars, port conflict)
- `MASTER_KEY` or `LINEAR_API_KEY` not set
- agent-browser not installed or bundled Chrome missing (`agent-browser install`)
- agent-browser session hangs or fails to connect
- Browser crashes or blank page on launch
- Config file (`agent-browser.json`) missing or malformed
- Network/port conflicts

## Exploration Checklist

### Page load

- [ ] Page loads without JavaScript errors
- [ ] Console has no warnings or errors
- [ ] All expected elements are visible
- [ ] Content renders within 3 seconds
- [ ] Setup guard doesn't redirect when server is configured

### Overview (`/`)

- [ ] Hero band renders with metrics grid (`.overview-hero-band`)
- [ ] Live metrics show Running, Queue, Rate limit, Attention
- [ ] Attention zone lists blocking issues (`.overview-attention-zone`)
- [ ] Collapsible sections toggle (health, tokens, stalls, recent, terminal)
- [ ] Getting started card shows for empty state
- [ ] Secondary sidebar renders health and token info

### Queue / Kanban (`/queue`)

- [ ] Board renders with kanban columns (`.kanban-board`)
- [ ] Columns show colored status dots (`.kanban-column-dot`)
- [ ] Column counts match card counts
- [ ] Cards display identifier, title, priority, labels (`.kanban-card`)
- [ ] Card lifecycle steps render correctly
- [ ] Cards have correct visual treatment per `data-status`
- [ ] Empty columns show empty state (`.mc-empty-state`)
- [ ] Toolbar renders (`.mc-toolbar.queue-toolbar`)
- [ ] Drag-and-drop works between columns

### Issue Inspector

- [ ] Opens as drawer on card click (`.issue-inspector.queue-drawer`)
- [ ] Identifier and title populate (`.issue-identifier`, `.issue-title`)
- [ ] Summary strip shows KPIs (`.issue-summary-strip`)
- [ ] Header actions work (Logs, Tracker, Close)
- [ ] Collapsible sections expand (description, retry, steer, activity, attempts)
- [ ] Close button dismisses drawer (`.drawer-close-btn`)
- [ ] Full issue page also works at `/issues/:id`

### Logs page (`/logs/:id`)

- [ ] Breadcrumb renders (`.logs-breadcrumb`)
- [ ] Live/History tabs toggle (`.mc-button-segment`)
- [ ] Type filter chips toggle (`.mc-chip.is-interactive`)
- [ ] Log rows render with color-coded left stripes (`.mc-log-row`)
- [ ] Expandable rows show payload on click
- [ ] Search input filters logs (`.mc-input.logs-search`)
- [ ] Copy button works (`.logs-icon-btn`)
- [ ] Auto-scroll follow toggle works
- [ ] New events indicator appears (`.logs-new-indicator`)

### Setup wizard (`/setup`)

- [ ] Step indicators render (`.setup-step-indicator`)
- [ ] Steps progress correctly
- [ ] Project grid shows selectable cards (`.setup-project-grid`)
- [ ] Form inputs are functional

### App shell

- [ ] Sidebar items navigate correctly (`.sidebar-item`)
- [ ] Active item highlighted (`.sidebar-item.is-active`)
- [ ] Count badges update (`.sidebar-item-badge`)
- [ ] Sidebar collapses/expands (`.sidebar-collapse-toggle`)
- [ ] Header brand renders (`.header-brand`)
- [ ] Command palette opens with Cmd+K (`.header-command-trigger`)
- [ ] Theme toggle works

### Visual design

- [ ] Copper brand accent used correctly (`--interactive-primary: #9a472b`)
- [ ] Status colors match tokens (running=green, retrying=amber, blocked=red)
- [ ] Card stagger animations play (`.stagger-item`)
- [ ] Page transitions are smooth (`.fade-in`)
- [ ] Section expand animations work (`.expand-in`)
- [ ] Dark mode renders correctly (`data-theme="dark"`)
- [ ] Fonts load correctly (Space Grotesk headings, Manrope body, IBM Plex Mono code)

### Responsive

- [ ] Desktop (1920x1080): full layout, all columns visible
- [ ] Laptop (1280x720): all columns visible, may scroll horizontally
- [ ] Tablet (768x1024): usable layout, sidebar may collapse
- [ ] Mobile (375x812): content accessible, may stack

### Infrastructure

- [ ] Server starts without errors
- [ ] `MASTER_KEY` is set in environment
- [ ] `LINEAR_API_KEY` is set in environment
- [ ] agent-browser is installed and bundled Chrome is available
- [ ] `agent-browser.json` config exists at project root
- [ ] Preflight script passes
