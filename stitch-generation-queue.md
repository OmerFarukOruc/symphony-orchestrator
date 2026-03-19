# Symphony Design System — Stitch Generation Queue

> Project ID: `10124126697819880987`
> Theme: Symphony Precision — copper `#C96E4A`, dark `#0C1016`, 0px corners

---

## ✅ Completed Screens (4)

1. **Mission Control (Overview)** — `screens/7b05cb5ada0346deb3697ef8f902382c`
2. **Queue Board (Kanban)** — `screens/4f372759d848457db4bd489f01a2d948`
3. **Issue Detail** — `screens/e74249ea5eca4fcdba7e3e51f4ee97f9`
4. **Logs Viewer** — `screens/8750450d94894305b038d9dc9fbad9a6`

---

## 🔄 Pending Screens (13)

### Page 5: Run History

**Route**: `/issues/:id/runs`

```
Design a run history page for Symphony orchestrator showing all attempt runs for a specific issue. Left column: attempts table with checkbox (for compare), #, Status, Duration, Model, Tokens columns. Right column: detail panel for selected attempt OR compare view when 2 selected. Include keyboard navigation (j/k to navigate, Space to toggle compare). Dark theme, copper #C96E4A accent, 0px corners, Inter font.
```

### Page 6: Attempt Detail

**Route**: `/attempts/:id`

```
Design an attempt detail page for Symphony orchestrator. Show header with issue identifier and run number. Summary strip with Status, Duration, Started, Ended, Model, Tokens. Sections: Workspace & Git (path, branch, PR link), Model Routing (model, reasoning effort, source), Thread & Turn IDs, Error section (if failed, red left border), Events Timeline. Dark theme, copper accent, 0px corners.
```

### Page 7: Planner

**Route**: `/planner`

```
Design an AI planner interface for Symphony orchestrator. Three states: Input (goal textarea, max issues input, labels input, Generate button), Review (plan cards with titles, acceptance criteria, dependencies, side rail with dependency graph), Execute modal. Include action buttons: Regenerate, Execute Plan. Dark theme, copper accent, 0px corners.
```

### Page 8: Config Overlay

**Route**: `/config`

```
Design a config overlay editor for Symphony orchestrator. Three-column layout: Left (Schema rail, 240px, tree view of config schema), Center (Overlay editor with path/raw mode toggle), Right (Diff panel showing changes). Include delete confirmation modal. Dark theme, copper accent, 0px corners.
```

### Page 9: Secrets

**Route**: `/secrets`

```
Design a secrets management page for Symphony orchestrator. Show table with Key name, Created timestamp, Actions. Include bulk actions toolbar, trust explanation aside, add secret modal, delete confirmation modal (must type key name). Values are write-only, never displayed. Dark theme, copper accent, 0px corners.
```

### Page 10: Observability

**Route**: `/observability`

```
Design an observability dashboard for Symphony orchestrator. Four section groups: Service health (4 metric cards with sparklines), Operational trends (4 cards with sparklines), Rates and limits (4 cards), Anomalies (4 list-based cards). Include instrumentation status banner, raw metrics drawer. Dark theme, copper accent, 0px corners.
```

### Page 11: Settings

**Route**: `/settings`

```
Design a settings page for Symphony orchestrator. Two-column layout: Left (section navigation rail, 200px), Right (section cards with form fields). Each field has label, description, input, default hint. Include section diff (expandable), save per section button. Dark theme, copper accent, 0px corners.
```

### Page 12: All Runs (Global)

**Route**: `/runs`

```
Design a global runs page for Symphony orchestrator. Show aggregate stat row (Total runs, Success rate, Avg duration, Total tokens). Toolbar with search, filters (Status, Model, Date range), sort selector. Full-width runs table with Issue, Run #, Status, Duration, Model, Tokens, Started columns. Pagination at bottom. Dark theme, copper accent, 0px corners.
```

### Page 13: Notifications Center

**Route**: `/notifications`

```
Design a notifications center for Symphony orchestrator. Filter bar with channel chips (All, Slack, System, Alerts), status filter, date range. Notification timeline with date group headers. Each row shows channel icon, title, detail, timestamp, delivery status badge. Expandable webhook delivery details. Dark theme, copper accent, 0px corners.
```

### Page 14: Git & Pull Requests

**Route**: `/git`

```
Design a Git and Pull Requests page for Symphony orchestrator. Summary strip with Active branches, Open PRs, Merged today, Failed git ops. PR table with Issue, Branch, PR, Status, Checks, Updated, Actions columns. Collapsible git operations log below. Dark theme, copper accent, 0px corners.
```

### Page 15: Workspace Manager

**Route**: `/workspaces`

```
Design a workspace manager page for Symphony orchestrator. Summary row with Total, Active, Stale workspaces, Disk usage. Workspace table with Status (dot indicator), Workspace key, Issue, Path, Size, Last activity, Actions. Workspace detail drawer (480px, slides from right). Delete confirmation modal. Dark theme, copper accent, 0px corners.
```

### Page 16: Docker Containers

**Route**: `/containers`

```
Design a Docker container monitoring page for Symphony orchestrator. Summary row with Running, Stopped, Errored, Avg CPU. Container cards grid (2 columns) with name/ID, status chip, issue link, CPU/Memory gauges, uptime, actions (View logs, Restart, Stop). Dark theme, copper accent, 0px corners.
```

### Page 17: Welcome / Onboarding

**Route**: `/welcome`

```
Design a welcome/onboarding page for Symphony orchestrator. Centered layout with "Symphony" wordmark, tagline, version. Setup checklist with 4 steps (Create workflow, Set up credentials, Configure environment, Start orchestrating). Code block with start command. Resources section with 3 link cards. Dark theme, copper accent, 0px corners.
```

---

## Shared Components to Generate

### Status Chip

```
Design a status chip component for Symphony orchestrator. Size variants: default (22px height), small (18px). Anatomy: optional left dot indicator, text, background at 12% opacity, border at 25% opacity. Status colors: Queued #4F7CFF, Claimed #7C62D6, Running #2F9E44, Retrying #D98A1C, Blocked #D94841, Completed #7B8797. Running has pulse animation on dot. 0px corners.
```

### Metric Card

```
Design a metric/KPI card for Symphony orchestrator. Flexible width, min-height 100px. Background #121824, border #2A3548. Top row: title (Inter 600 12px muted) + source badge. Primary value: Inter 700 28px white, health-colored. Secondary text muted. Optional sparkline at bottom (36px height, SVG line). Loading state with skeleton shimmer. 0px corners.
```

### Empty State

```
Design an empty state component for Symphony orchestrator. Centered, max-width 400px. Icon (48x48, muted 50% opacity), title (Inter 600 16px), description (Inter 400 13px muted), optional action button (copper background). No illustrations. 0px corners.
```

### Modal Dialog

```
Design a modal dialog for Symphony orchestrator. Overlay: #0C1016 at 70%. Panel: #121824, border #2A3548, centered. Header with title and close button. Body scrollable. Footer with secondary/primary/destructive buttons. Animation: opacity + scale on enter. Confirmation variant with text input. 0px corners.
```

### Form Elements

```
Design form inputs for Symphony orchestrator. Text input: 36px height, #182131 background, #2A3548 border, focus shifts to copper. Textarea: same styling, resizable. Select: chevron icon, dropdown panel. Toggle switch: 36x20px. Toggle button group. Checkbox: 16x16 square. All 0px corners, Inter font.
```

### Data Table

```
Design a data table for Symphony orchestrator. Header row: Inter 600 12px uppercase, border-bottom 2px. Data rows: alternating #0C1016/#121824 backgrounds, hover #182131. Cell variants: text, mono, number (right-aligned), status, link, actions. Pagination at bottom. Loading state with skeleton rows. 0px corners.
```

### Skeleton Loading

```
Design skeleton loading placeholders for Symphony orchestrator. Background #182131, shimmer sweep animation. Bar heights: heading 24px, body 14px, small 12px, stat 28px, sparkline 36px. Card skeleton matches real card. Table row skeleton 40px height. Stagger animation 100ms between elements. 0px corners.
```

---

## Global Shell Components

### Sidebar Navigation

```
Design a collapsible sidebar for Symphony orchestrator. Collapsed: 48px width, icon rail with 20px icons. Expanded: 220px width, icon + label. Groups: Operate (4), Configure (3), Observe (1), System (1). Active item: copper text + 2px left border. Collapse toggle at bottom. Background #1E293B. 0px corners.
```

### Top Header Bar

```
Design a top header bar for Symphony orchestrator. Height 48px, background #121824. Left: "Symphony" brand (Inter 700 16px). Center: command palette trigger with search placeholder, Ctrl+K hint. Right: refresh, theme toggle, keyboard shortcuts buttons. All buttons 32x32. 0px corners.
```

### Command Palette

```
Design a command palette overlay for Symphony orchestrator. Backdrop: #0C1016 at 70%. Panel: 560px wide, #121824 background. Search input at top (48px height). Results list: rows with icon, route name, description, shortcut badge. Keyboard navigation with arrow keys. Selected row: copper left border. 0px corners.
```

### Toast Notifications

```
Design a toast notification system for Symphony orchestrator. Position: bottom-right, stack upward. Width 360px, background #182131. Left accent border (3px) colored by type: Success green, Error red, Warning amber, Info blue. Auto-dismiss 5s with progress bar. Animation: slide in/out. 0px corners.
```

---

## How to Generate

1. Open Stitch: https://stitch.withgoogle.com/
2. Open project `10124126697819880987`
3. Use "Generate from text" with each prompt above
4. Or use MCP: `stitch_generate_screen_from_text(projectId="10124126697819880987", prompt="...")`

---

## Design Theme Settings

| Property        | Value                  |
| --------------- | ---------------------- |
| Primary Color   | `#C96E4A` (Copper)     |
| Secondary Color | `#1E293B` (Slate)      |
| Neutral Color   | `#0C1016` (Near-black) |
| Corner Radius   | `0px` (Sharp)          |
| Font            | Inter                  |
| Color Mode      | Dark                   |

### Status Palette

| Status    | Hex       |
| --------- | --------- |
| Queued    | `#4F7CFF` |
| Claimed   | `#7C62D6` |
| Running   | `#2F9E44` |
| Retrying  | `#D98A1C` |
| Blocked   | `#D94841` |
| Completed | `#7B8797` |

### Surface Scale

| Layer    | Hex       |
| -------- | --------- |
| Canvas   | `#0C1016` |
| Surface  | `#121824` |
| Elevated | `#182131` |
| Muted    | `#1E293B` |
| Border   | `#2A3548` |
