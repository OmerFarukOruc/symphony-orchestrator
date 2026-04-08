---
version: 1.0.0
last_updated: 2026-04-07
updated_by: Claude (initial creation from frontend source analysis)
surfaces_count: 253
changelog:
  - version: 1.0.0
    date: 2026-04-07
    changes: Initial surface inventory from frontend source analysis of all routes, components, modals, keyboard shortcuts, SSE events, and state variations
---

# Risoluto Surface Seed Inventory

This is the canonical list of known Risoluto UI surfaces. Each entry is a testable unit — a route, component state, modal, keyboard shortcut, or interaction boundary that deserves independent coverage.

The skill loads this seed at Phase 1 and compares against what it discovers in the live app. New surfaces not in the seed get tagged `[DISCOVERED]`. Seed surfaces not found get tagged `[MISSING]`.

## Format

```
SURFACE-<NNN> | <route> | <type> | <description> | <key_interactions>
```

Types: `page`, `section`, `modal`, `drawer`, `form`, `table`, `shortcut`, `sse-event`, `state-variation`, `toast`, `menu`, `chip`, `wizard-step`

---

## Global Chrome (SURFACE-001 to SURFACE-019)

SURFACE-001 | * | section | Sidebar — expanded state | Click nav items, collapse/expand toggle, group collapse, badge counts
SURFACE-002 | * | section | Sidebar — collapsed state | Tooltips visible, icons only, badge hidden
SURFACE-003 | * | section | Header bar | Brand logo, command palette button, refresh button, API docs button, theme toggle
SURFACE-004 | * | modal | Command palette | Ctrl+K open, search input, arrow nav, Enter execute, Escape close, click-outside close
SURFACE-005 | * | section | Command palette — Navigation group | All nav items listed, hotkey badges, click navigates
SURFACE-006 | * | section | Command palette — Quick Actions group | Refresh, Toggle theme, Show shortcuts, API docs, Open current issue runs
SURFACE-007 | * | section | Command palette — Recent Issues group | Up to 8 issues, click opens issue detail
SURFACE-008 | * | section | Command palette — Recent PRs group | Up to 5 PRs, click opens external URL
SURFACE-009 | * | section | Command palette — empty search | Shows "No matching routes, issues, PRs, or actions"
SURFACE-010 | * | modal | Keyboard shortcuts help | ? key opens, Done button closes, 3 sections (Global, Board, Editor)
SURFACE-011 | * | shortcut | g+o → Overview | Two-key combo, 1500ms timeout for second key
SURFACE-012 | * | shortcut | g+q → Board | Navigate to /queue
SURFACE-013 | * | shortcut | g+, → Settings | Navigate to /settings
SURFACE-014 | * | shortcut | g+n → Notifications | Navigate to /notifications
SURFACE-015 | * | shortcut | g+m → Observability | Navigate to /observability
SURFACE-016 | * | shortcut | g+g → Git | Navigate to /git
SURFACE-017 | * | shortcut | g+t → Templates | Navigate to /templates
SURFACE-018 | * | shortcut | g+a → Audit | Navigate to /audit
SURFACE-019 | * | shortcut | g+w → Workspaces | Navigate to /workspaces

## Overview — / (SURFACE-020 to SURFACE-037)

SURFACE-020 | / | page | Overview — default populated state | Hero metrics, attention zone, sidebar sections
SURFACE-021 | / | section | Hero metrics band | Running count, Queue depth, Rate limit headroom, Attention count, diff animation
SURFACE-022 | / | section | Hero state text | Dynamic prose describing current system moment
SURFACE-023 | / | section | Getting started card (empty queue) | 3-step guide, "Review setup" button, dismiss X button
SURFACE-024 | / | state-variation | Getting started — dismissed | Card hidden, state persisted to localStorage
SURFACE-025 | / | section | Needs action attention zone | Clickable issue rows navigate to /queue/:id
SURFACE-026 | / | state-variation | Attention zone — empty | "Open queue" button shown
SURFACE-027 | / | section | System health panel | SystemHealthBadge + WebhookHealthPanel, collapsible
SURFACE-028 | / | section | Token burn counters | Input/Output/Total tokens, Runtime, Cost
SURFACE-029 | / | section | Recovered stalls table | StallEventsTable rows
SURFACE-030 | / | section | Latest activity | Last 4 EventRow items
SURFACE-031 | / | section | Recently finished | Last 4 terminal issues, clickable → /queue/:id
SURFACE-032 | / | state-variation | Overview — loading | Skeleton overlays on all sections
SURFACE-033 | / | state-variation | Overview — empty (no issues) | Teaching empty states with CTAs
SURFACE-034 | / | section | Collapsible sections | Click to expand/collapse, state persisted to localStorage per section
SURFACE-035 | / | toast | worker-failed SSE toast | "Worker failed: <message>" error toast
SURFACE-036 | / | toast | system-error SSE toast | "System error: <message>" error toast
SURFACE-037 | / | toast | model-updated SSE toast | "Model updated for <identifier>" info toast

## Board — /queue (SURFACE-038 to SURFACE-065)

SURFACE-038 | /queue | page | Board — default populated state | Kanban columns, toolbar, cards
SURFACE-039 | /queue | form | Search input | Type to filter, debounce, clear, empty results
SURFACE-040 | /queue | chip | Stage filter chips | One per workflow column, toggleable, issue count badge
SURFACE-041 | /queue | chip | Priority filter chips | All, Urgent, High, Medium, Low
SURFACE-042 | /queue | form | Sort select | Recently updated, Priority, Token usage
SURFACE-043 | /queue | chip | Density toggle | Compact/comfortable switch
SURFACE-044 | /queue | chip | Show/Hide completed toggle | Toggle completed issues visibility
SURFACE-045 | /queue | section | Refresh button | Triggers API refresh
SURFACE-046 | /queue | section | Kanban columns | One per workflow stage, collapsible
SURFACE-047 | /queue | section | Kanban card | Status chip, identifier, title, priority badge, token count, event chip
SURFACE-048 | /queue | section | Kanban card — click | Opens issue inspector drawer at /queue/:id
SURFACE-049 | /queue | section | Kanban card — drag-drop | Drag between columns, drop zone highlights. Alt+Arrow keyboard alternative available
SURFACE-050 | /queue | state-variation | Board — loading | Board skeleton animation
SURFACE-051 | /queue | state-variation | Board — empty column | Dashed empty state per column
SURFACE-052 | /queue | state-variation | Board — filter empty | "Clear filters" CTA shown
SURFACE-053 | /queue | section | State guide strip | Contextual hints based on current workflow state
SURFACE-054 | /queue | shortcut | j/k — navigate cards | Focus moves between kanban cards
SURFACE-055 | /queue | shortcut | Enter — open focused issue | Opens issue inspector drawer
SURFACE-056 | /queue | shortcut | Shift+Enter — open full page | Opens /issues/:id full page
SURFACE-057 | /queue | shortcut | [/] — move between columns | Focus moves between kanban columns
SURFACE-058 | /queue | shortcut | / — focus search | Focus moves to board search input
SURFACE-059 | /queue | shortcut | f — focus filters | Focus moves to board filters

## Issue Inspector Drawer — /queue/:id (SURFACE-060 to SURFACE-075)

SURFACE-060 | /queue/:id | drawer | Inspector drawer — slide in | Right panel slides open
SURFACE-061 | /queue/:id | section | Drawer header | Close X button, "Open full issue" button
SURFACE-062 | /queue/:id | section | Issue header | Identifier, title, status chip, updated-at timestamp
SURFACE-063 | /queue/:id | section | Summary strip | Priority, Model, Tokens, Duration stats
SURFACE-064 | /queue/:id | section | Description section | Issue description or "No description" placeholder
SURFACE-065 | /queue/:id | section | Blocked-by list | Clickable identifiers linking to blocking issues
SURFACE-066 | /queue/:id | section | Abort button (when running) | Confirmation dialog, aborts running agent
SURFACE-067 | /queue/:id | section | Steer section (when running) | Textarea to send steering message to agent
SURFACE-068 | /queue/:id | section | Live log section (when running) | Streaming log entries via SSE
SURFACE-069 | /queue/:id | section | Retry schedule (when retrying) | Countdown timer, due-at, attempt number, error reason
SURFACE-070 | /queue/:id | section | Activity section | Last 5 EventRow items, "Open logs" link
SURFACE-071 | /queue/:id | section | Workspace & git section | Path, branch, PR URL, tokens, cost, "Copy workspace" button
SURFACE-072 | /queue/:id | form | Model override form | Model select, reasoning effort select, Save button
SURFACE-073 | /queue/:id | form | Template override form | Template select, Save/clear button, pending change note
SURFACE-074 | /queue/:id | table | Attempts table | Sortable rows, attempt ID, status, timestamps, cost, "Open attempt" links
SURFACE-075 | /queue/:id | state-variation | Inspector — loading | 3 skeleton cards

## Issue Full Page — /issues/:id (SURFACE-076 to SURFACE-082)

SURFACE-076 | /issues/:id | page | Issue detail — full page | All inspector sections in full-page layout
SURFACE-077 | /issues/:id | section | Primary actions row | Abort, "Open logs", "Open tracker" (external link)
SURFACE-078 | /issues/:id | state-variation | Issue — loading | 3 skeleton cards
SURFACE-079 | /issues/:id | state-variation | Issue — error | Empty state with Retry button
SURFACE-080 | /issues/:id | state-variation | Issue — empty attempts | Teaching empty state
SURFACE-081 | /issues/:id | sse-event | Issue lifecycle SSE | Triggers issue re-fetch on state change
SURFACE-082 | /issues/:id | form | Cancel pending change button | Removes pending model/template override

## Run History — /issues/:id/runs (SURFACE-083 to SURFACE-093)

SURFACE-083 | /issues/:id/runs | page | Run history — two-column layout | Attempt list left, detail panel right
SURFACE-084 | /issues/:id/runs | table | Runs table | Rows per attempt, select to load detail
SURFACE-085 | /issues/:id/runs | section | Attempt detail panel | Summary stats, PR summary, JSON config blocks
SURFACE-086 | /issues/:id/runs | section | Compare mode | Spacebar toggle, max 2 attempts, side-by-side diff
SURFACE-087 | /issues/:id/runs | section | "Clear compare" button | Resets compare mode
SURFACE-088 | /issues/:id/runs | section | "Back to issue" button | Navigate back
SURFACE-089 | /issues/:id/runs | shortcut | j/k — navigate run rows | Selection moves between attempts
SURFACE-090 | /issues/:id/runs | shortcut | Enter — open attempt | Navigate to /attempts/:id
SURFACE-091 | /issues/:id/runs | shortcut | Space — toggle compare | Add/remove attempt from comparison
SURFACE-092 | /issues/:id/runs | shortcut | Backspace — back | Navigate back to issue
SURFACE-093 | /issues/:id/runs | shortcut | Escape — clear compare | Clear compare mode

## Logs — /issues/:id/logs (SURFACE-094 to SURFACE-107)

SURFACE-094 | /issues/:id/logs | page | Logs — default view | Header breadcrumb, control bar, scroll area
SURFACE-095 | /issues/:id/logs | chip | Live/History mode toggle | Segment buttons switching SSE vs REST
SURFACE-096 | /issues/:id/logs | chip | Type filter chips | All + one per event type
SURFACE-097 | /issues/:id/logs | form | Log search input | Filter logs by text
SURFACE-098 | /issues/:id/logs | chip | Sort order toggle | Ascending/descending
SURFACE-099 | /issues/:id/logs | chip | Density toggle | Compact/comfortable
SURFACE-100 | /issues/:id/logs | chip | Auto-follow toggle | Auto-scroll to latest
SURFACE-101 | /issues/:id/logs | chip | Expand payloads toggle | Show/hide JSON payloads
SURFACE-102 | /issues/:id/logs | section | Copy all logs button | Copies all visible logs
SURFACE-103 | /issues/:id/logs | section | Log row — expandable | Click to expand payload
SURFACE-104 | /issues/:id/logs | section | New events indicator | Floating button when scrolled away from live edge
SURFACE-105 | /issues/:id/logs | state-variation | Logs — empty (live mode) | Empty state with CTA
SURFACE-106 | /issues/:id/logs | state-variation | Logs — empty (archive mode) | Different empty state
SURFACE-107 | /issues/:id/logs | sse-event | Live log streaming | Real-time entries via SSE

## Attempt Detail — /attempts/:id (SURFACE-108 to SURFACE-114)

SURFACE-108 | /attempts/:id | page | Attempt detail page | Metadata, PR summary, checkpoints, config
SURFACE-109 | /attempts/:id | section | Metadata section | Issue link, trigger, status, started/ended, duration, cost, model
SURFACE-110 | /attempts/:id | section | PR summary section | Agent-authored bullet list
SURFACE-111 | /attempts/:id | section | Checkpoints section | Expandable cards per checkpoint
SURFACE-112 | /attempts/:id | section | AppServer config section | JSON block
SURFACE-113 | /attempts/:id | section | Breadcrumb navigation | Back to issue link
SURFACE-114 | /attempts/:id | state-variation | Attempt — loading | Skeleton cards

## Settings — /settings (SURFACE-115 to SURFACE-148)

SURFACE-115 | /settings | page | Settings — default view | Left rail, right content, schema badge
SURFACE-116 | /settings | form | Section search input | Filter sections by text
SURFACE-117 | /settings | chip | Standard/Advanced toggle | Mode switch showing different sections
SURFACE-118 | /settings | section | Section rail | Clickable section items, grouped
SURFACE-119 | /settings | section | Tracker section | tracker.project_slug with "Browse" button
SURFACE-120 | /settings | modal | Project picker modal | Lists Linear projects, click to select
SURFACE-121 | /settings | section | Repositories/GitHub section | Repo URL, default branch, identifier prefix
SURFACE-122 | /settings | section | Model provider section | Provider config fields
SURFACE-123 | /settings | section | Sandbox section | Sandbox image, environment config
SURFACE-124 | /settings | section | Agent section | Agent behavior config
SURFACE-125 | /settings | section | Agent timeouts section | Timeout config fields
SURFACE-126 | /settings | section | Workspace section | Workspace path config
SURFACE-127 | /settings | section | Slack section | Webhook URL with "Send test" button
SURFACE-128 | /settings | section | Workflow stages section | Stage definitions
SURFACE-129 | /settings | section | Feature flags section | Boolean toggles
SURFACE-130 | /settings | section | Runtime and paths section | Read-only path display
SURFACE-131 | /settings | section | Credentials section | Secret key/value management
SURFACE-132 | /settings | form | Text field type | String input with Save
SURFACE-133 | /settings | form | Number field type | Numeric input with validation
SURFACE-134 | /settings | form | Select field type | Dropdown with options
SURFACE-135 | /settings | form | List field type | Tag input (add/remove items)
SURFACE-136 | /settings | form | Boolean field type | Toggle switch
SURFACE-137 | /settings | form | JSON field type | JSON textarea with validation
SURFACE-138 | /settings | form | Credential field type | Masked input with reveal
SURFACE-139 | /settings | section | Developer tools (collapsed) | Details element, collapsed by default
SURFACE-140 | /settings#devtools | section | DevTools — tree mode | Override entries list, delete buttons, "Browse available paths"
SURFACE-141 | /settings#devtools | section | DevTools — path mode | Path input, value textarea, Save path button
SURFACE-142 | /settings#devtools | section | DevTools — raw mode | Full JSON textarea, Save raw button
SURFACE-143 | /settings#devtools | section | DevTools — schema panel | All available config paths, click to auto-fill
SURFACE-144 | /settings#devtools | section | DevTools — diff panel | Current overlay vs effective values
SURFACE-145 | /settings#devtools | modal | Delete override confirm | "Remove override" with Cancel + Remove buttons
SURFACE-146 | /settings#credentials | section | Credentials deep link | Hash navigation scrolls to credentials, switches to Advanced mode
SURFACE-147 | /settings | form | Save button per section | Saves section config
SURFACE-148 | /settings | section | Diff preview | Expandable diff showing pending changes

## Observability — /observability (SURFACE-149 to SURFACE-159)

SURFACE-149 | /observability | page | Observability — default view | Header actions, metric sections
SURFACE-150 | /observability | section | Instrumentation status strip | Component count, warn/error counts
SURFACE-151 | /observability | section | Service health | Overall health, traces, SSE sessions, HTTP error rate
SURFACE-152 | /observability | section | Throughput | Running, queued, success rate, failure rate
SURFACE-153 | /observability | section | Rate limits | API headroom, rate limit counts
SURFACE-154 | /observability | section | System resources | CPU/memory, poll age, poll cadence
SURFACE-155 | /observability | section | Anomaly section | Detected anomalies list
SURFACE-156 | /observability | drawer | Raw metrics drawer | Slide-in with Prometheus text, close button
SURFACE-157 | /observability | shortcut | r — refresh | Refresh observability data
SURFACE-158 | /observability | shortcut | x — toggle raw drawer | Open/close raw metrics
SURFACE-159 | /observability | state-variation | Observability — waiting for first snapshot | Empty state

## Notifications — /notifications (SURFACE-160 to SURFACE-170)

SURFACE-160 | /notifications | page | Notifications — default view | Stats row, toolbar, notification list
SURFACE-161 | /notifications | section | Stats cards | Total, Unread, Critical, Quieted
SURFACE-162 | /notifications | section | Toolbar | Summary text, filter chips, Mark all read button
SURFACE-163 | /notifications | chip | Filter chips | All activity, Unread only
SURFACE-164 | /notifications | section | Notification row | Severity badge, metadata chips, time, title, message, actions
SURFACE-165 | /notifications | section | Per-row mark-read button | Marks individual notification as read
SURFACE-166 | /notifications | section | Open issue button | Navigate to /queue/:issueId
SURFACE-167 | /notifications | section | Mark all read button | Marks all notifications as read
SURFACE-168 | /notifications | state-variation | Notifications — loading | 4 stat card skeletons + 4 row skeletons
SURFACE-169 | /notifications | state-variation | Notifications — empty | "No notifications" empty state
SURFACE-170 | /notifications | sse-event | Notification SSE prepend | New notification row prepended live

## Git — /git (SURFACE-171 to SURFACE-181)

SURFACE-171 | /git | page | Git — default view | Summary strip, main panel, activity rail
SURFACE-172 | /git | section | Summary strip | Repos, branches, PRs, merged, GitHub connection status
SURFACE-173 | /git | section | Repository cards | Clickable (opens GitHub URL), name, visibility, description, commits
SURFACE-174 | /git | section | Active branches list | Identifier → /queue/:id, branch name, status, PR link
SURFACE-175 | /git | section | Tracked PR lifecycle | Open/merged/closed badges, PR records list
SURFACE-176 | /git | section | Open pull requests | PR number, title, author, branch, time
SURFACE-177 | /git | section | Recent commits rail | SHA + message per repo
SURFACE-178 | /git | section | GitHub API connection status | Connection badge
SURFACE-179 | /git | section | Quick link buttons | "View queue board", "Advanced settings", "Manage credentials"
SURFACE-180 | /git | state-variation | Git — no repos | Empty state with CTA to settings
SURFACE-181 | /git | state-variation | Git — error | Error empty state with Retry

## Workspaces — /workspaces (SURFACE-182 to SURFACE-189)

SURFACE-182 | /workspaces | page | Workspaces — default view | Stats cards, workspace list
SURFACE-183 | /workspaces | section | Stats cards | Total, Active, Orphaned, Disk usage
SURFACE-184 | /workspaces | section | Workspace row | Key, issue title link, status badge, disk size, last-modified
SURFACE-185 | /workspaces | section | Remove button (orphaned only) | confirm() dialog + DELETE API call
SURFACE-186 | /workspaces | state-variation | Workspaces — loading | 4 stat cards + 5 skeleton rows
SURFACE-187 | /workspaces | state-variation | Workspaces — empty | Empty hint
SURFACE-188 | /workspaces | sse-event | Workspace SSE re-fetch | risoluto:workspace-event triggers list refresh
SURFACE-189 | /workspaces | section | Issue link navigation | Click issue title → /queue/:id

## Containers — /containers (SURFACE-190 to SURFACE-193)

SURFACE-190 | /containers | page | Containers — agents running | "Containers are active" + "View observability" CTA
SURFACE-191 | /containers | state-variation | Containers — queue empty | "No containers running" + "Open board" + "View observability"
SURFACE-192 | /containers | state-variation | Containers — error | "Could not load container status" + Retry
SURFACE-193 | /containers | state-variation | Containers — loading | Skeleton card

## Templates — /templates (SURFACE-194 to SURFACE-206)

SURFACE-194 | /templates | page | Templates — default view | Left rail, right editor pane
SURFACE-195 | /templates | section | Template list | Clickable items with name + active badge
SURFACE-196 | /templates | form | New template form | ID input, name input, Create/Cancel buttons
SURFACE-197 | /templates | form | Template name input | Editable name field
SURFACE-198 | /templates | section | CodeMirror editor | Code editing with syntax highlighting
SURFACE-199 | /templates | section | Save button | Saves template content
SURFACE-200 | /templates | section | Set Active button | Marks template as active (★)
SURFACE-201 | /templates | section | Preview button | Renders template, shows preview panel
SURFACE-202 | /templates | section | Delete button | confirm() dialog before deletion
SURFACE-203 | /templates | modal | Unsaved change guard | confirm() when switching templates with unsaved changes
SURFACE-204 | /templates | shortcut | Ctrl+S — save template | Keyboard save shortcut
SURFACE-205 | /templates | shortcut | Ctrl+Shift+P — preview | Keyboard preview shortcut (disabled if dirty)
SURFACE-206 | /templates | state-variation | Templates — empty editor | "Select a template..." placeholder

## Audit Log — /audit (SURFACE-207 to SURFACE-216)

SURFACE-207 | /audit | page | Audit log — default view | Filter bar, table, pagination
SURFACE-208 | /audit | section | Live indicator | Dot + "N entries" badge
SURFACE-209 | /audit | form | Table filter select | All/Config/Secrets/Templates
SURFACE-210 | /audit | form | Key filter input | Text input with 300ms debounce
SURFACE-211 | /audit | form | Date range filters | From date, To date inputs
SURFACE-212 | /audit | section | Clear filters button | Resets all filters
SURFACE-213 | /audit | table | Audit table | Timestamp, Table, Key, Operation badge, Actor, chevron expand
SURFACE-214 | /audit | section | Expandable row detail | Previous value, New value, Request ID, Full timestamp, Path
SURFACE-215 | /audit | section | Pagination | Prev/Next buttons, "Page X of Y"
SURFACE-216 | /audit | sse-event | Audit SSE live rows | risoluto:audit-mutation prepends live rows on page 0

## Setup Wizard — /setup (SURFACE-217 to SURFACE-237)

SURFACE-217 | /setup | page | Setup wizard — step indicator | 5 clickable steps, done/active/upcoming states, animated connectors
SURFACE-218 | /setup | wizard-step | Step 1: Credentials (fresh) | Generated key display, "Copy key" button, "Generate new key", Continue
SURFACE-219 | /setup | wizard-step | Step 1: Credentials (already set) | Confirmation badge, Continue, danger zone "Reset all credentials"
SURFACE-220 | /setup | modal | Reset credentials confirm | confirm() warning all secrets cleared
SURFACE-221 | /setup | wizard-step | Step 2: Linear | API key input, "Verify" button, status badge
SURFACE-222 | /setup | section | Linear project picker | Team/project list from API, "Create new project"
SURFACE-223 | /setup | section | Create test issue sub-action | Creates a test issue in Linear
SURFACE-224 | /setup | section | Create label sub-action | Creates a label in Linear
SURFACE-225 | /setup | wizard-step | Step 3: Repository | Repo URL, default branch, identifier prefix, "Show advanced" toggle
SURFACE-226 | /setup | section | Advanced repo config | Dynamic repo routing configuration
SURFACE-227 | /setup | wizard-step | Step 4: OpenAI — API key tab | Text input + "Verify" button
SURFACE-228 | /setup | wizard-step | Step 4: OpenAI — Device auth tab | User code, verification URI, countdown, polling, cancel, manual fallback
SURFACE-229 | /setup | section | Custom provider fields | Provider name, base URL, token
SURFACE-230 | /setup | wizard-step | Step 5: GitHub | Token input + Save + Skip option
SURFACE-231 | /setup | section | Done step | Success animations, "Continue to overview" button
SURFACE-232 | /setup | section | Step navigation | Continue/Back buttons per step
SURFACE-233 | /setup | section | Step indicator click navigation | Click any completed/upcoming step to jump

## 404 — unknown routes (SURFACE-234 to SURFACE-235)

SURFACE-234 | /unknown | page | 404 page | "Page not found" heading
SURFACE-235 | /unknown | section | Back to overview link | Click navigates to /

## Alias Routes (SURFACE-236 to SURFACE-238)

SURFACE-236 | /config | page | Config alias → /settings#devtools | Redirects via history.replaceState
SURFACE-237 | /secrets | page | Secrets alias → /settings#credentials | Redirects via history.replaceState
SURFACE-238 | /welcome | page | Welcome alias → /settings | Router.navigate redirect

## Theme (SURFACE-239 to SURFACE-240)

SURFACE-239 | * | section | Dark theme | Default theme, all surfaces render correctly
SURFACE-240 | * | section | Light theme | Toggle via header button, all surfaces render correctly

## SSE System Events (SURFACE-241 to SURFACE-246)

SURFACE-241 | * | sse-event | risoluto:worker-failed | Error toast shown
SURFACE-242 | * | sse-event | risoluto:system-error | Error toast shown
SURFACE-243 | * | sse-event | risoluto:model-updated | Info toast shown
SURFACE-244 | * | sse-event | risoluto:webhook-health-changed | Webhook health panel re-renders on Overview
SURFACE-245 | * | sse-event | risoluto:webhook-received | Overview re-renders
SURFACE-246 | * | sse-event | risoluto:poll-complete | Observability data reload triggers

## Additional Shortcuts (SURFACE-247 to SURFACE-253)

SURFACE-247 | * | shortcut | g+d → Containers | Navigate to /containers
SURFACE-248 | * | shortcut | g+s → Credentials | Navigate to /settings#credentials
SURFACE-249 | * | shortcut | g+c → Developer tools | Navigate to /settings#devtools
SURFACE-250 | * | shortcut | g+u → Setup | Navigate to /setup
SURFACE-251 | * | shortcut | g+r → Current issue runs | Navigate to current issue's run history (contextual)
SURFACE-252 | * | shortcut | Ctrl+K → Command palette | Opens command palette overlay
SURFACE-253 | * | shortcut | Escape → close overlay | Closes any open modal/palette/drawer

---

**Total surfaces: 253**

This count will grow during dynamic discovery as the skill finds interactive elements, state variations, and sub-surfaces not captured here.
