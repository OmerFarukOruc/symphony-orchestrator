# Frontend Refactor — Step 2 Evaluation Inventory

**Created:** 2026-04-09  
**Phase:** Step 2 — Build the frontend evaluation inventory  
**Status:** ✅ Complete

---

## Executive Summary

This inventory maps all 16 routed pages + shared primitives to:

- **Primary JTBD** (jobs-to-be-done)
- **Current UX/design problems** (baseline critique)
- **Component/style dependencies**
- **Related tests** (Vitest + Playwright)
- **Intended refactor depth** (Light/Medium/Substantial)
- **Candidate Impeccable skills** to apply

**Legend:**

- 🟢 Light — polish, copy, micro-adjustments
- 🟡 Medium — structural improvements, pattern normalization
- 🔴 Substantial — information architecture, significant restructure

---

## 1. OPERATE SURFACES (Primary Operator Workflow)

### 1.1 Overview (`/`)

**Files:**

- `frontend/src/pages/overview.ts`, `overview-view.ts`, `overview-hero.ts`, `overview-rows.ts`, `overview-sections.ts`, `overview-empty.ts`, `overview-descriptions.ts`
- `frontend/src/styles/overview.css`
- `frontend/src/components/event-row.ts`, `system-health-badge.ts`, `webhook-health-panel.ts`, `stall-events-table.ts`, `sparkline.ts`

**Primary JTBD:**

- "What's happening right now?" — live system health, active runs, token burn
- "What needs my attention?" — attention zone for issues requiring review
- "How much is this costing?" — session token usage, cost tracking

**Current UX Problems:**

1. **Hero metrics band** — strong concept but could use better visual hierarchy between "Now" vs "Session" metrics
2. **Attention zone** — description text (`overview-descriptions.ts`) is good but could be tighter, more actionable
3. **Collapsible sections** — 6 sections (health, tokens, stalls, recent, terminal) create visual density; peek summaries help but could be more prominent
4. **Token grid** — 5 metrics in a grid; sparkline is good but placement feels tacked-on rather than integrated
5. **Empty state** — `createGettingStartedCard()` exists but dismissal logic is buried; could use better progressive disclosure
6. **Event list** — `overview-events` uses `.overview-list` class but doesn't consistently apply `mc-list-item` patterns
7. **Diff updates** — `setTextWithDiff()` is clever but may cause micro-jank on rapid updates

**Component Dependencies:**

- `mc-toolbar` (hero band)
- `mc-stat-card` (metric cards)
- `mc-section` (collapsible sections)
- `mc-list-item` (event rows, terminal issues)
- `mc-status-chip` (health badges)
- `mc-button` (dismiss, navigate actions)

**Related Tests:**

- Vitest: `overview-descriptions.test.ts`, `logs-data.test.ts` (format utils)
- Playwright Smoke: `overview.smoke.spec.ts` (8 tests)
- Playwright Visual: `overview.visual.spec.ts` (1 baseline: `overview-running.png`)
- Playwright Empty: `empty-states.visual.spec.ts` (`empty-overview.png`)

**Refactor Depth:** 🟡 **Medium**

**Candidate Skills:**

- `/critique` — detailed UX evaluation
- `/distill` — simplify hero band structure
- `/arrange` — improve section hierarchy
- `/clarify` — tighten copy on descriptions, peek summaries
- `/normalize` — apply `mc-list-item` consistently to event rows
- `/harden` — better empty state handling, loading states
- `/polish` — sparkline integration, motion polish
- `/visual-verify` — mandatory

---

### 1.2 Queue (`/queue`, `/queue/:id`)

**Files:**

- `frontend/src/pages/queue.ts`, `queue-view.ts`, `queue-board.ts`, `queue-toolbar.ts`, `queue-state.ts`, `queue-keyboard.ts`, `drag-state.ts`
- `frontend/src/styles/queue.css`, `queue-dnd.css`, `kanban.css`
- `frontend/src/components/issue-inspector.ts`, `state-guide.ts`

**Primary JTBD:**

- "What needs attention?" — issue triage, prioritization
- "What's the status?" — workflow column visibility (Backlog, Triage, Queued, etc.)
- "Which issue should I work on?" — filtering, search, keyboard navigation
- "What's the context?" — issue inspector drawer for quick context without leaving board

**Current UX Problems:**

1. **Toolbar density** — `buildQueueToolbar()` creates many filter chips; could benefit from better visual grouping
2. **Drag-and-drop** — `drag-state.ts` works but DnD feedback (drag previews, drop zones) could be more polished
3. **Issue cards** — use `.issue-card` class but inconsistent with `mc-list-item` patterns elsewhere; dual-spine typography not consistently applied
4. **State guide** — `createStateGuide()` is good but placement in `boardWrap` feels disconnected from board
5. **Keyboard nav** — `handleQueueKeyboard()` comprehensive but arrow key navigation between cards could be smoother
6. **Column collapse** — ui.collapsed state works but collapse/expand animation is abrupt
7. **Search** — search input in toolbar; could use better focus styling, clear button
8. **Inspector drawer** — good pattern but z-index, overlay treatment could be more polished

**Component Dependencies:**

- `mc-toolbar` (toolbar container)
- `mc-filter-chip` (filter chips)
- `mc-button` (toolbar actions)
- `issue-card` (custom, should align with `mc-list-item`)
- `mc-drawer` (inspector)
- `mc-status-chip`, `mc-priority-badge` (issue metadata)

**Related Tests:**

- Vitest: `drag-state.test.ts`, `store.test.ts`
- Playwright Smoke: `queue-issue.smoke.spec.ts` (6 tests)
- Playwright Visual: `queue.visual.spec.ts` (1 baseline: `queue-board.png`)
- Playwright Empty: `empty-states.visual.spec.ts` (`empty-queue.png`)

**Refactor Depth:** 🔴 **Substantial**

**Candidate Skills:**

- `/critique` — DnD UX, toolbar density evaluation
- `/distill` — simplify toolbar structure
- `/arrange` — better filter grouping, column hierarchy
- `/normalize` — align issue cards with `mc-list-item` patterns
- `/harden` — DnD edge cases, keyboard nav resilience
- `/adapt` — responsive board layout (currently breaks below 1100px)
- `/polish` — DnD animations, column collapse transitions
- `/visual-verify` — mandatory

---

### 1.3 Issue Detail (`/issues/:id`)

**Files:**

- `frontend/src/pages/issue.ts`, `issue-view.ts`
- `frontend/src/styles/issue.css`, `issue-inspector-rail.css`
- `frontend/src/components/attempt-timeline.ts`, `run-list.ts`, `issue-metadata.ts`

**Primary JTBD:**

- "What's the Linear issue context?" — title, description, assignee, labels
- "What runs have happened?" — run history, attempt summaries
- "What's the agent doing now?" — current run status, live updates

**Current UX Problems:**

1. **Two-column layout** — left: issue metadata + run history, right: inspector rail; works but spacing could be tighter
2. **Run history table** — uses `.attempts-table` class; should use `mc-panel` + `data-table` patterns consistently
3. **Inspector rail** — good pattern but z-index, overlay treatment inconsistent with Queue inspector
4. **Status badges** — dual-spine not consistently applied (some labels use proportional when they should use mono)
5. **Empty run history** — empty state exists but could be more actionable ("No runs yet — start one?")
6. **Loading states** — skeleton loaders present but not consistently applied during initial load

**Component Dependencies:**

- `mc-panel` (containers)
- `data-table` (run history)
- `mc-status-chip`, `mc-priority-badge` (issue metadata)
- `mc-button` (actions)
- `mc-drawer` (inspector rail)

**Related Tests:**

- Playwright Smoke: `issue-actions.smoke.spec.ts` (6 tests), `issue-runs-logs.smoke.spec.ts` (6 tests)
- Playwright Visual: `issue-detail.visual.spec.ts` (2 baselines: `issue-detail-running.png`, `issue-detail-attempts.png`)

**Refactor Depth:** 🟡 **Medium**

**Candidate Skills:**

- `/critique` — layout hierarchy evaluation
- `/arrange` — improve two-column spacing
- `/normalize` — apply `data-table`, `mc-panel` consistently
- `/clarify` — empty state copy, action buttons
- `/harden` — loading states, error handling
- `/visual-verify` — mandatory

---

### 1.4 Runs (`/issues/:id/runs`)

**Files:**

- `frontend/src/pages/runs.ts`, `runs-view.ts`, `runs-table.ts`, `runs-detail.ts`, `runs-compare.ts`, `runs-state.ts`
- `frontend/src/styles/runs.css`

**Primary JTBD:**

- "How did the agent perform?" — run metrics, outcomes, token usage
- "Which run was best?" — run comparison
- "What changed between runs?" — diff viewing

**Current UX Problems:**

1. **Data table** — functional but could use better column alignment, tabular numerals consistently applied
2. **Run comparison** — `runs-compare.ts` exists but UI for side-by-side comparison feels tacked-on
3. **Outcome badges** — use `.outcome-badge` class; should align with `mc-status-chip` patterns
4. **Token metrics** — displayed but not visualized (no sparklines, trend indicators)
5. **Sorting** — table sorting works but sort indicators subtle
6. **Detail panel** — expandable rows work but animation abrupt

**Component Dependencies:**

- `data-table` (run table)
- `mc-status-chip`, `outcome-badge` (status)
- `mc-button` (actions, compare)
- `mc-panel` (detail panel)

**Related Tests:**

- Playwright Smoke: `issue-runs-logs.smoke.spec.ts` (partial coverage)
- Playwright Visual: `runs-detail.visual.spec.ts` (2 baselines: `runs-table.png`, `runs-compare.png`)

**Refactor Depth:** 🟢 **Light**

**Candidate Skills:**

- `/critique` — table readability evaluation
- `/normalize` — tabular numerals, column alignment
- `/polish` — sort indicators, row expansion animation
- `/visual-verify` — mandatory

---

### 1.5 Logs (`/issues/:id/logs`, `/logs/:id`)

**Files:**

- `frontend/src/pages/logs.ts`, `logs-view.ts`, `logs-detail-panel.ts`, `logs-filter-bar.ts`, `logs-data.ts`, `logs-route.ts`
- `frontend/src/styles/logs.css`

**Primary JTBD:**

- "What did the agent do?" — streaming output, tool calls, reasoning
- "Find specific events" — filtering by type, search
- "Understand the flow" — chronological event sequence

**Current UX Problems:**

1. **Streaming performance** — works but rapid updates can cause layout shift
2. **Filter bar** — `logs-filter-bar.ts` functional but visual design feels separate from rest of system
3. **Log rows** — use `.log-row` class; should align with `mc-list-item` patterns
4. **Event type chips** — inconsistent styling (some use `mc-event-chip`, some custom)
5. **Detail panel** — `logs-detail-panel.ts` good but placement, sizing could be more polished
6. **Empty state** — "No logs yet" but could be more contextual
7. **SSE handling** — works but connection state not clearly communicated

**Component Dependencies:**

- `mc-list-item` (log rows — should align)
- `mc-event-chip` (event types)
- `mc-filter-chip` (filter bar)
- `mc-button` (actions)
- `mc-panel` (detail panel)

**Related Tests:**

- Vitest: `logs-data.test.ts`, `log-buffer.test.ts`, `event-source.test.ts`
- Playwright Smoke: `logs-sse.smoke.spec.ts`, `logs-detail.smoke.spec.ts`, `issue-runs-logs.smoke.spec.ts`
- Playwright Empty: `empty-states.visual.spec.ts` (`empty-logs.png`)

**Refactor Depth:** 🟡 **Medium**

**Candidate Skills:**

- `/critique` — streaming UX evaluation
- `/distill` — simplify filter bar
- `/normalize` — align log rows with `mc-list-item`
- `/harden` — SSE edge cases, connection state
- `/polish` — streaming animations, filter transitions
- `/visual-verify` — mandatory

---

### 1.6 Attempt Detail (`/attempts/:id`)

**Files:**

- `frontend/src/pages/attempt.ts`, `attempt-view.ts`, `attempt-utils.ts`
- `frontend/src/styles/attempt.css`

**Primary JTBD:**

- "What happened in this run?" — granular trace, tool calls, token usage
- "How long did each step take?" — timeline visualization
- "What was the outcome?" — success/failure details

**Current UX Problems:**

1. **Timeline visualization** — functional but could use better visual hierarchy, clearer time scale
2. **Tool call cards** — repetitive structure; could be more compact
3. **Token breakdown** — displayed but not visualized (no charts, breakdowns)
4. **Error display** — errors shown but could use better syntax highlighting, copy/paste affordance
5. **Navigation** — breadcrumb exists but could be more prominent

**Component Dependencies:**

- `mc-panel` (containers)
- `mc-status-chip` (step outcomes)
- `mc-button` (actions)
- `data-table` (token breakdown)

**Related Tests:**

- Playwright Visual: `attempt-detail.visual.spec.ts` (2 baselines: `attempt-timeline.png`, `attempt-details.png`)

**Refactor Depth:** 🟡 **Medium**

**Candidate Skills:**

- `/critique` — timeline visualization evaluation
- `/arrange` — improve timeline hierarchy
- `/normalize` — token breakdown table
- `/polish` — timeline animations, step transitions
- `/visual-verify` — mandatory

---

## 2. CONFIGURE SURFACES (System Setup + Configuration)

### 2.1 Settings (`/settings`, `/config`, `/secrets`)

**Files:**

- `frontend/src/pages/settings.ts`, `views/unified-settings-view.ts`
- `frontend/src/features/settings/` (12 files: `settings-view.ts`, `settings-view-render.ts`, `settings-sections.ts`, `settings-forms.ts`, `settings-patches.ts`, `settings-state.ts`, `settings-types.ts`, `settings-paths.ts`, `settings-keyboard.ts`, `settings-helpers.ts`, `settings-section-defs.ts`, `index.ts`)
- `frontend/src/views/codex-admin/` (9 files)
- `frontend/src/styles/settings.css`, `unified-settings.css`, `forms.css`, `secrets.css`

**Primary JTBD:**

- "How do I configure Risoluto?" — all config in one place
- "What credentials are set?" — API keys, webhook URLs
- "How do I customize agent behavior?" — Codex admin panel, models, MCP servers
- "Is Slack integration working?" — Slack test

**Current UX Problems:**

1. **Information architecture** — 8+ sections (DevTools, Credentials, Codex Admin, Notifications, Git, Webhooks, Advanced, Danger); could benefit from better grouping, progressive disclosure
2. **Tab navigation** — tabs work but visual treatment could be more polished; active state not always clear
3. **Form clarity** — forms functional but labels, descriptions, validation could be clearer
4. **Codex admin panel** — comprehensive but dense; could use better section hierarchy, collapsible subsections
5. **Credentials** — sensitive fields masked but could use better show/hide UX, copy-to-clipboard
6. **Validation** — errors shown but inline validation, real-time feedback inconsistent
7. **Keyboard nav** — `settings-keyboard.ts` exists but tab switching could be smoother
8. **Empty states** — some sections have no data; could use better contextual guidance

**Component Dependencies:**

- `mc-panel` (section containers)
- `mc-input`, `mc-select` (form inputs)
- `mc-button` (actions, save, test)
- `mc-badge` (section metadata)
- `mc-tabs` (custom, should align with patterns)
- `toast` (save confirmations, errors)

**Related Tests:**

- Vitest: 8 settings-related tests (`settings-*.test.ts`)
- Playwright Smoke: `settings-unified.smoke.spec.ts`, `settings-interactions.smoke.spec.ts`, `settings-codex-admin.smoke.spec.ts`, `settings-slack-test.smoke.spec.ts`, `config-secrets.smoke.spec.ts`
- Playwright Visual: `settings.visual.spec.ts`, `settings-tabs.visual.spec.ts` (4 baselines total)

**Refactor Depth:** 🔴 **Substantial**

**Candidate Skills:**

- `/critique` — IA evaluation, form clarity
- `/distill` — simplify section structure
- `/arrange` — better grouping, progressive disclosure
- `/clarify` — form labels, descriptions, validation messages
- `/normalize` — align tabs, forms with shared patterns
- `/harden` — validation, error handling, empty states
- `/polish` — tab transitions, form focus states
- `/visual-verify` — mandatory

---

### 2.2 Setup (`/setup`)

**Files:**

- `frontend/src/pages/setup.ts`, `views/setup-view.ts`, `setup-shared.ts`
- `frontend/src/views/setup-openai-step.ts`, `setup-linear-step.ts`, `setup-github-step.ts`, `setup-repo-step.ts`, `setup-master-key-step.ts`, `setup-done-step.ts`, `setup-openai-controller.ts`
- `frontend/src/styles/setup.css`

**Primary JTBD:**

- "How do I get started?" — first-run wizard
- "What do I need to configure?" — Linear, GitHub, OpenAI, repo setup
- "Am I done?" — progress indication, completion state

**Current UX Problems:**

1. **Multi-step wizard** — works but step indicators could be more prominent
2. **Progressive disclosure** — steps shown sequentially but could use better "why this matters" context
3. **Validation** — form validation works but error messages could be more helpful
4. **Completion state** — `setup-done-step.ts` good but could use better "what's next" guidance
5. **Loading states** — API calls during setup; spinners functional but could be more polished
6. **Copy tone** — functional but could be warmer, more encouraging without losing professionalism

**Component Dependencies:**

- `mc-panel` (step containers)
- `mc-input` (form fields)
- `mc-button` (next, back, skip)
- `mc-status-chip` (step completion)
- `toast` (errors, confirmations)

**Related Tests:**

- Vitest: `setup-shared.test.ts`, `lifecycle-stepper.test.ts`
- Playwright Smoke: `setup-wizard.smoke.spec.ts`, `setup-gate.spec.ts`
- Playwright Visual: `setup.visual.spec.ts` (5 baselines: one per step + complete)

**Refactor Depth:** 🟢 **Light**

**Candidate Skills:**

- `/critique` — wizard flow evaluation
- `/clarify` — step descriptions, error messages
- `/harden` — validation, loading states
- `/polish` — step transitions, progress indicators
- `/visual-verify` — mandatory

---

### 2.3 Templates (`/templates`)

**Files:**

- `frontend/src/pages/templates.ts`, `views/templates-view.ts`, `templates-editor.ts`, `templates-state.ts`
- `frontend/src/styles/templates.css`

**Primary JTBD:**

- "How do I customize agent behavior?" — prompt templates
- "What templates exist?" — template list
- "How do I edit?" — editor UX, preview

**Current UX Problems:**

1. **Template list** — functional but could use better visual hierarchy
2. **Editor** — textarea-based; could use better syntax highlighting, line numbers
3. **Preview** — exists but placement, sizing could be more polished
4. **Save workflow** — works but could use better unsaved changes warning
5. **Empty state** — "No templates" but could be more actionable

**Component Dependencies:**

- `mc-panel` (containers)
- `mc-button` (actions)
- `mc-input` (editor)
- `toast` (save confirmations)

**Related Tests:**

- Vitest: `templates-state.test.ts`
- Playwright Smoke: `templates.smoke.spec.ts`
- Playwright Visual: `templates.visual.spec.ts` (2 baselines: `templates-list.png`, `templates-editor.png`)

**Refactor Depth:** 🟡 **Medium**

**Candidate Skills:**

- `/critique` — editor UX evaluation
- `/arrange` — list + editor layout
- `/harden` — unsaved changes warning
- `/polish` — editor focus states, save animations
- `/visual-verify` — mandatory

---

## 3. OBSERVE/SYSTEM SURFACES (Monitoring + Admin)

### 3.1 Observability (`/observability`)

**Files:**

- `frontend/src/pages/observability.ts`, `views/observability-view.ts`, `observability-metrics.ts`, `observability-sections.ts`, `observability-state.ts`, `observability-raw-drawer.ts`, `observability-keyboard.ts`
- `frontend/src/styles/observability.css`

**Primary JTBD:**

- "How is the system performing?" — metrics, health checks
- "What are the trends?" — metric history, charts
- "Debug performance" — raw metrics, detailed views

**Current UX Problems:**

1. **Metric cards** — functional but could use better visual hierarchy, trend indicators
2. **Raw metrics drawer** — dense data; could use better formatting, filtering
3. **Keyboard nav** — `observability-keyboard.ts` exists but could be more comprehensive
4. **Empty states** — metrics may be unavailable; could use better contextual guidance
5. **Refreshing** — auto-refresh works but refresh state not clearly communicated

**Component Dependencies:**

- `mc-stat-card` (metric cards)
- `mc-panel` (containers)
- `mc-button` (actions, refresh)
- `mc-drawer` (raw metrics)
- `data-table` (raw metrics)

**Related Tests:**

- Playwright Visual: `observability.visual.spec.ts` (1 baseline: `observability-metrics.png`)

**Refactor Depth:** 🟡 **Medium**

**Candidate Skills:**

- `/critique` — dense data presentation
- `/arrange` — metric card layout
- `/normalize` — data table formatting
- `/harden` — empty states, refresh indicators
- `/polish` — chart animations, loading states
- `/visual-verify` — mandatory

---

### 3.2 Notifications (`/notifications`)

**Files:**

- `frontend/src/pages/notifications.ts`, `views/notifications-view.ts`
- `frontend/src/styles/notifications.css`

**Primary JTBD:**

- "What alerts exist?" — webhook configuration
- "How do I test?" — Slack test, webhook test

**Current UX Problems:**

1. **Webhook list** — simple list; functional but could use better status indicators
2. **Test workflow** — works but could use better feedback during test
3. **Empty state** — "No webhooks" but could be more actionable

**Component Dependencies:**

- `mc-list-item` (webhook list)
- `mc-button` (test, delete)
- `mc-status-chip` (webhook status)
- `toast` (test results)

**Related Tests:**

- Playwright Smoke: `notifications.smoke.spec.ts`

**Refactor Depth:** 🟢 **Light**

**Candidate Skills:**

- `/critique` — list UX evaluation
- `/clarify` — test workflow copy
- `/harden` — test feedback, error handling
- `/visual-verify` — optional (no visual baseline)

---

### 3.3 Git (`/git`)

**Files:**

- `frontend/src/pages/git.ts`, `views/git-view.ts`
- `frontend/src/styles/git.css`

**Primary JTBD:**

- "How is Git integration working?" — repo status, sync state
- "What's the webhook status?" — GitHub webhook health

**Current UX Problems:**

1. **Repo list** — functional but could use better sync status indicators
2. **Webhook status** — shown but could be more prominent
3. **Sync actions** — buttons work but could use better loading states

**Component Dependencies:**

- `mc-list-item` (repo list)
- `mc-button` (sync actions)
- `mc-status-chip` (sync status)
- `toast` (sync results)

**Related Tests:**

- Playwright Smoke: `git-lifecycle.smoke.spec.ts`

**Refactor Depth:** 🟢 **Light**

**Candidate Skills:**

- `/critique` — status visibility
- `/harden` — sync loading states
- `/polish` — sync animations
- `/visual-verify` — optional (no visual baseline)

---

### 3.4 Workspaces (`/workspaces`)

**Files:**

- `frontend/src/pages/workspaces.ts`, `views/workspaces-view.ts`
- `frontend/src/styles/workspace.css`

**Primary JTBD:**

- "Where do agents run?" — Docker workspace management
- "What's the lifecycle?" — create, start, stop, delete

**Current UX Problems:**

1. **Workspace list** — functional but could use better status indicators
2. **Lifecycle controls** — buttons work but could use better confirmation for destructive actions
3. **Empty state** — "No workspaces" but could be more actionable

**Component Dependencies:**

- `mc-list-item` (workspace list)
- `mc-button` (lifecycle actions)
- `mc-status-chip` (workspace status)
- `toast` (action results)
- `confirm-modal` (destructive actions)

**Related Tests:**

- Playwright Visual: `workspaces.visual.spec.ts` (2 baselines: `workspaces-list.png`, `workspaces-detail.png`)

**Refactor Depth:** 🟢 **Light**

**Candidate Skills:**

- `/harden` — confirmation modals, error handling
- `/polish` — lifecycle animations
- `/visual-verify` — mandatory

---

### 3.5 Containers (`/containers`)

**Files:**

- `frontend/src/pages/containers.ts`, `views/containers-view.ts`
- (No dedicated CSS file — uses global patterns)

**Primary JTBD:**

- "What containers are active?" — runtime visibility
- "What's the status?" — container health, resource usage

**Current UX Problems:**

1. **Simple list** — functional but basic; no dedicated styling
2. **No visual baseline** — missing from visual regression suite
3. **No smoke tests** — missing from E2E coverage

**Component Dependencies:**

- `mc-list-item` (container list)
- `mc-status-chip` (container status)
- `mc-panel` (containers)

**Related Tests:**

- None (coverage gap)

**Refactor Depth:** 🟢 **Light** (but add tests)

**Candidate Skills:**

- `/critique` — basic UX evaluation
- `/normalize` — align with `mc-list-item` patterns
- `/harden` — add smoke + visual tests
- `/visual-verify` — recommended (add baseline)

---

### 3.6 Audit (`/audit`)

**Files:**

- `frontend/src/pages/audit.ts`, `views/audit-view.ts`, `audit-state.ts`
- `frontend/src/styles/audit.css`

**Primary JTBD:**

- "What changed?" — audit trail
- "Who changed it?" — user, timestamp, action

**Current UX Problems:**

1. **Data table** — functional but could use better column alignment, filtering
2. **Timestamp formatting** — works but could be more readable (relative time)
3. **Empty state** — "No audit events" but could be more contextual

**Component Dependencies:**

- `data-table` (audit log)
- `mc-button` (filters, export)
- `mc-filter-chip` (filters)

**Related Tests:**

- Vitest: `audit-state.test.ts`
- Playwright Smoke: `audit.smoke.spec.ts`
- Playwright Visual: `audit.visual.spec.ts` (1 baseline: `audit-log.png`)

**Refactor Depth:** 🟢 **Light**

**Candidate Skills:**

- `/critique` — table readability
- `/normalize` — column alignment, tabular numerals
- `/polish` — filtering, sorting
- `/visual-verify` — mandatory

---

## 4. SHARED PRIMITIVES (Cross-Cutting)

### 4.1 App Shell

**Files:**

- `frontend/src/ui/shell.ts`, `shell.css`, `shell-responsive.css`
- `frontend/src/ui/sidebar.ts`, `sidebar-badges.ts`, `nav-items.ts`
- `frontend/src/ui/header.ts`
- `frontend/src/ui/command-palette.ts`, `command-palette-data.ts`

**Primary JTBD:**

- Navigation — primary routes accessible
- Context — where am I?
- Global actions — theme toggle, settings access
- Power user — command palette (`Cmd+K`)

**Current UX Problems:**

1. **Sidebar** — collapsed/expanded works but transition could be smoother; tooltip on collapsed items good
2. **Header** — functional but could use better visual hierarchy
3. **Command palette** — comprehensive but could use better fuzzy matching, recent commands
4. **Responsive** — `shell-responsive.css` exists but some breakpoints feel arbitrary
5. **Active nav** — copper accent good but could be more prominent
6. **Keyboard nav** — `keyboard.ts` comprehensive but some shortcuts conflict

**Component Dependencies:**

- `mc-button` (header actions)
- `mc-badge` (sidebar badges)
- `mc-list-item` (nav items — should align)
- `mc-drawer` (command palette)
- `toast` (notifications)

**Related Tests:**

- Vitest: `header.test.ts`, `sidebar-badges.test.ts`, `command-palette-data.test.ts`
- Playwright Smoke: `command-palette.smoke.spec.ts`, `sidebar-contextual-nav.smoke.spec.ts`

**Refactor Depth:** 🔴 **Substantial** (affects everything)

**Candidate Skills:**

- `/critique` — navigation IA, command palette UX
- `/distill` — simplify shell structure
- `/arrange` — sidebar + header layout
- `/normalize` — nav items with `mc-list-item`
- `/harden` — keyboard conflicts, responsive edge cases
- `/adapt` — responsive breakpoints
- `/polish` — transitions, active states
- `/visual-verify` — mandatory

---

### 4.2 Buttons

**Files:**

- `frontend/src/ui/buttons.ts`

**Current State:**

- `buttonClassName()` — builds `mc-button` classes
- `createIconButton()` — icon-only button factory
- Tones: `default`, `ghost`, `primary`, `danger`
- Sizes: `sm`, `lg`

**Problems:**

1. **Missing variants** — no `is-command` (commanding CTA) treatment in factory
2. **Icon sizing** — `iconSize` prop exists but not consistently used
3. **Hint support** — `.mc-button-hint` exists in CSS but not in button factory

**Refactor Depth:** 🟢 **Light**

**Candidate Skills:**

- `/normalize` — add missing variants
- `/polish` — hint support, icon sizing

---

### 4.3 Status Chips + Badges

**Files:**

- `frontend/src/ui/status-chip.ts`, `priority-badge.ts`, `event-chip.ts`

**Current State:**

- `statusChip()` — creates `.mc-status-chip` with dot + label
- `priorityBadge()` — creates priority badges
- `eventChip()` — creates event type chips

**Problems:**

1. **Inconsistent patterns** — three separate files; could be unified
2. **Dual-spine** — not consistently applied (some labels proportional, should be mono)
3. **Size variants** — `.is-sm`, `.is-lg` exist in CSS but not in factories

**Refactor Depth:** 🟢 **Light**

**Candidate Skills:**

- `/distill` — unify chip/badge factories
- `/normalize` — dual-spine application
- `/polish` — size variants

---

### 4.4 Tables

**Files:**

- `frontend/src/ui/table.ts`

**Current State:**

- `dataTable()` — creates `.data-table` with zebra striping, mono header

**Problems:**

1. **Column alignment** — not configurable (left/right/center)
2. **Tabular numerals** — applied to headers but not consistently to data cells
3. **Sorting** — sort indicators exist but not in factory
4. **Responsive** — wide tables break on small screens

**Refactor Depth:** 🟡 **Medium**

**Candidate Skills:**

- `/normalize` — tabular numerals, column alignment
- `/adapt` — responsive table handling
- `/polish` — sort indicators

---

### 4.5 Skeleton Loaders

**Files:**

- `frontend/src/ui/skeleton.ts`

**Current State:**

- `skeletonLine()`, `skeletonBlock()`, `skeletonCard()`, `skeletonColumn()`, `skeletonLogList()`, `skeletonLogRow()`

**Problems:**

1. **Inconsistent usage** — not all pages use skeletons during loading
2. **Animation** — shimmer exists but not always applied

**Refactor Depth:** 🟢 **Light**

**Candidate Skills:**

- `/normalize` — consistent skeleton usage
- `/polish` — shimmer animation

---

## 5. REFACTOR SEQUENCE RECOMMENDATION

**Phase 4 (Shell + Primitives) — 1-2 weeks:**

1. Buttons, Status Chips (quick wins)
2. Tables, Skeleton (medium)
3. App Shell, Command Palette (substantial — do last in phase)

**Phase 5 (Operate) — 3-4 weeks:**

1. Overview (anchor — sets pattern)
2. Queue (most complex — allocate time)
3. Issue Detail, Runs, Logs, Attempt (parallelizable)

**Phase 6 (Configure) — 2-3 weeks:**

1. Settings (most complex — IA work)
2. Setup, Templates (parallelizable)

**Phase 7 (Observe) — 1-2 weeks:**

1. Observability (most complex — dense data)
2. Notifications, Git, Workspaces, Containers, Audit (parallelizable)

**Phase 8 (Consolidation) — 1 week:**

1. Pattern extraction (`/extract`)
2. Dead code removal
3. Docs updates
4. Visual baseline reconciliation

---

## 6. TESTING STRATEGY PER PHASE

**Before each phase:**

- Run full test suite: `pnpm test && pnpm exec playwright test`
- Capture baseline visual snapshots if needed

**During each phase:**

- Update unit tests for changed components
- Update smoke tests for changed selectors/workflows
- Run `/visual-verify` after each surface

**After each phase:**

- Full test suite pass required
- Visual baseline updates committed
- Docs updated if operator behavior changed

---

**End of Step 2 Evaluation Inventory**
