# Frontend Refactor — Step 1 Baseline

**Created:** 2026-04-09  
**Phase:** Step 1 — Establish baselines and refactor guardrails  
**Status:** ✅ Complete

---

## 1. Design Context Validation

### .impeccable.md Status: ✅ CURRENT

The `.impeccable.md` file is **comprehensive and current**. No refresh needed via `/impeccable teach`.

**Key validated principles:**

- **Product vision:** "Co-pilot's console" — sustained attention, not intermittent dashboard
- **Brand personality:** Transparent, Partnered, Alive
- **Aesthetic:** Overlap between Claude Code/Codex (partner console) and Linear/Raycast (product craft)
- **Dual-spine typography:** Manrope (UI) + IBM Plex Mono (agent work) + Space Grotesk (display)
- **Both themes first-class:** Light and dark designed in parallel
- **Copper brand color:** `#c96e4a` reserved for primary action, active nav, live indicators
- **Zero-radius stitch:** Square surfaces, 2px only on compact controls
- **Motion = proof of life:** Running agents pulse, idle UI is still

**Anti-references confirmed:**

1. Generic AI product aesthetic (cyan/purple gradients, glassmorphism)
2. Consumer-SaaS warmth (rounded everything, illustrations, emoji)
3. Enterprise admin density dump (endless tabs, no hierarchy)
4. Crypto/trading terminal intensity (flashing, aggressive red/green)

---

## 2. Complete Surface Inventory

### Route Registry (from `frontend/src/main.ts`)

| Route              | Page Module               | Category      | Visual Test                                                  | Smoke Test                                                                                                                                            |
| ------------------ | ------------------------- | ------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                | `overview.ts`             | **Operate**   | ✅ `overview.visual.spec.ts`                                 | ✅ `overview.smoke.spec.ts`                                                                                                                           |
| `/queue`           | `queue.ts`                | **Operate**   | ✅ `queue.visual.spec.ts`                                    | ✅ `queue-issue.smoke.spec.ts`                                                                                                                        |
| `/queue/:id`       | `queue.ts`                | **Operate**   | —                                                            | ✅ `queue-issue.smoke.spec.ts`                                                                                                                        |
| `/issues/:id`      | `issue.ts`                | **Operate**   | ✅ `issue-detail.visual.spec.ts`                             | ✅ `issue-actions.smoke.spec.ts`                                                                                                                      |
| `/issues/:id/runs` | `runs.ts`                 | **Operate**   | ✅ `runs-detail.visual.spec.ts`                              | ✅ `issue-runs-logs.smoke.spec.ts`                                                                                                                    |
| `/issues/:id/logs` | `logs.ts`                 | **Operate**   | —                                                            | ✅ `issue-runs-logs.smoke.spec.ts`                                                                                                                    |
| `/logs/:id`        | `logs.ts`                 | **Operate**   | —                                                            | ✅ `logs-detail.smoke.spec.ts`, `logs-sse.smoke.spec.ts`                                                                                              |
| `/attempts/:id`    | `attempt.ts`              | **Operate**   | ✅ `attempt-detail.visual.spec.ts`                           | —                                                                                                                                                     |
| `/config`          | → `/settings#devtools`    | **Configure** | —                                                            | —                                                                                                                                                     |
| `/secrets`         | → `/settings#credentials` | **Configure** | —                                                            | ✅ `config-secrets.smoke.spec.ts`                                                                                                                     |
| `/settings`        | `settings.ts`             | **Configure** | ✅ `settings.visual.spec.ts`, `settings-tabs.visual.spec.ts` | ✅ `settings-unified.smoke.spec.ts`, `settings-interactions.smoke.spec.ts`, `settings-codex-admin.smoke.spec.ts`, `settings-slack-test.smoke.spec.ts` |
| `/observability`   | `observability.ts`        | **Observe**   | ✅ `observability.visual.spec.ts`                            | —                                                                                                                                                     |
| `/notifications`   | `notifications.ts`        | **Observe**   | —                                                            | ✅ `notifications.smoke.spec.ts`                                                                                                                      |
| `/git`             | `git.ts`                  | **Observe**   | —                                                            | ✅ `git-lifecycle.smoke.spec.ts`                                                                                                                      |
| `/workspaces`      | `workspaces.ts`           | **Observe**   | ✅ `workspaces.visual.spec.ts`                               | —                                                                                                                                                     |
| `/containers`      | `containers.ts`           | **Observe**   | —                                                            | —                                                                                                                                                     |
| `/templates`       | `templates.ts`            | **Configure** | ✅ `templates.visual.spec.ts`                                | ✅ `templates.smoke.spec.ts`                                                                                                                          |
| `/audit`           | `audit.ts`                | **Observe**   | ✅ `audit.visual.spec.ts`                                    | ✅ `audit.smoke.spec.ts`                                                                                                                              |
| `/setup`           | `setup.ts`                | **Configure** | ✅ `setup.visual.spec.ts`                                    | ✅ `setup-wizard.smoke.spec.ts`, `setup-gate.spec.ts`                                                                                                 |
| `/welcome`         | → `/settings`             | **Configure** | —                                                            | —                                                                                                                                                     |
| 404                | inline                    | **System**    | ✅ `error-states.visual.spec.ts`                             | ✅ `error-scenarios.smoke.spec.ts`                                                                                                                    |

**Total routed pages:** 16 (+ 404)  
**Visual coverage:** 14/16 (87.5%) — Missing: `/logs/:id`, `/containers`  
**Smoke coverage:** 15/16 (94%) — Missing: `/containers`

---

### Surface Taxonomy (Phased Workstreams)

#### **Operate Surfaces** (Primary operator workflow)

1. **Overview** (`overview.ts`, `overview-view.ts`, `overview-*.ts`)
   - Primary JTBD: "What's happening right now?" — live system health, active runs
   - Components: hero metrics, event streams, run summaries
   - Styles: `overview.css`
   - Refactor depth: **Medium** — solid foundation, needs polish

2. **Queue** (`queue.ts`, `queue-view.ts`, `queue-board.ts`, `queue-toolbar.ts`)
   - Primary JTBD: "What needs attention?" — issue triage, prioritization
   - Components: kanban board, issue cards, drag-drop, toolbar filters
   - Styles: `queue.css`, `queue-dnd.css`, `kanban.css`
   - Refactor depth: **Substantial** — DnD complexity, state management

3. **Issue Detail** (`issue.ts`, `issue-view.ts`)
   - Primary JTBD: "What's the context?" — Linear issue + agent runs
   - Components: issue metadata, run history, inspector rail
   - Styles: `issue.css`, `issue-inspector-rail.css`
   - Refactor depth: **Medium** — solid structure, needs density tuning

4. **Runs** (`runs.ts`, `runs-view.ts`, `runs-table.ts`, `runs-detail.ts`)
   - Primary JTBD: "How did the agent perform?" — run comparison, metrics
   - Components: data tables, attempt summaries, comparison views
   - Styles: `runs.css`
   - Refactor depth: **Light** — functional, needs visual polish

5. **Logs** (`logs.ts`, `logs-view.ts`, `logs-detail-panel.ts`, `logs-filter-bar.ts`)
   - Primary JTBD: "What did the agent do?" — streaming output, filtering
   - Components: log streams, filter bar, detail panels, SSE handling
   - Styles: `logs.css`
   - Refactor depth: **Medium** — streaming performance, filter UX

6. **Attempt Detail** (`attempt.ts`, `attempt-view.ts`)
   - Primary JTBD: "What happened in this run?" — granular trace
   - Components: attempt timeline, tool calls, token usage
   - Styles: `attempt.css`
   - Refactor depth: **Medium** — timeline visualization

---

#### **Configure Surfaces** (System setup + configuration)

7. **Settings** (`settings.ts`, `unified-settings-view.ts`, `features/settings/`)
   - Primary JTBD: "How do I configure Risoluto?" — all config in one place
   - Components: tabs, forms, Codex admin panel, Slack test, credentials
   - Styles: `settings.css`, `unified-settings.css`, `forms.css`
   - Refactor depth: **Substantial** — information architecture, form clarity

8. **Setup** (`setup.ts`, `setup-view.ts`, `setup-*-step.ts`)
   - Primary JTBD: "How do I get started?" — first-run wizard
   - Components: multi-step wizard, validation, progress
   - Styles: `setup.css`
   - Refactor depth: **Light** — functional, needs progressive disclosure polish

9. **Templates** (`templates.ts`, `templates-view.ts`, `templates-editor.ts`)
   - Primary JTBD: "How do I customize agent behavior?" — prompt templates
   - Components: template list, editor, preview
   - Styles: `templates.css`
   - Refactor depth: **Medium** — editor UX

---

#### **Observe/System Surfaces** (Monitoring + admin)

10. **Observability** (`observability.ts`, `observability-view.ts`, `observability-metrics.ts`)
    - Primary JTBD: "How is the system performing?" — metrics, health
    - Components: metric cards, charts, raw metrics drawer
    - Styles: `observability.css`
    - Refactor depth: **Medium** — dense data presentation

11. **Notifications** (`notifications.ts`, `notifications-view.ts`)
    - Primary JTBD: "What alerts exist?" — webhook config
    - Components: notification list, webhook forms
    - Styles: `notifications.css`
    - Refactor depth: **Light** — simple list + forms

12. **Git** (`git.ts`, `git-view.ts`)
    - Primary JTBD: "How is Git integration working?" — repo status
    - Components: repo list, sync status, webhook config
    - Styles: `git.css`
    - Refactor depth: **Light** — functional

13. **Workspaces** (`workspaces.ts`, `workspaces-view.ts`)
    - Primary JTBD: "Where do agents run?" — Docker workspace mgmt
    - Components: workspace list, lifecycle controls
    - Styles: `workspace.css`
    - Refactor depth: **Light** — functional

14. **Containers** (`containers.ts`, `containers-view.ts`)
    - Primary JTBD: "What containers are active?" — runtime visibility
    - Components: container list, status
    - Styles: (none dedicated)
    - Refactor depth: **Light** — simple list

15. **Audit** (`audit.ts`, `audit-view.ts`)
    - Primary JTBD: "What changed?" — audit trail
    - Components: audit log table, filters
    - Styles: `audit.css`
    - Refactor depth: **Light** — data table

---

### Shared Primitives (Cross-cutting)

| Component           | File(s)                                                    | Refactor Priority                      |
| ------------------- | ---------------------------------------------------------- | -------------------------------------- |
| **App Shell**       | `shell.ts`, `shell.css`, `shell-responsive.css`            | **High** — affects everything          |
| **Sidebar**         | `sidebar.ts`, `nav-items.ts`, `sidebar-badges.ts`          | **High** — primary nav                 |
| **Header**          | `header.ts`                                                | **High** — global actions              |
| **Command Palette** | `command-palette.ts`, `command-palette-data.ts`            | **High** — keyboard power user         |
| **Keyboard Nav**    | `keyboard.ts`, `keyboard-scope.ts`, `keyboard-commands.ts` | **High** — accessibility + power users |
| **Theme Toggle**    | `theme.ts`                                                 | Low — functional                       |
| **Toast**           | `toast.ts`                                                 | Medium — animation polish              |
| **Modals**          | `confirm-modal.ts`, `modal.css`                            | Medium — overlay treatment             |
| **Buttons**         | `buttons.ts`                                               | **High** — used everywhere             |
| **Status Chips**    | `status-chip.ts`, `event-chip.ts`, `priority-badge.ts`     | **High** — semantic meaning            |
| **Tables**          | `table.ts`                                                 | **High** — dense data                  |
| **Skeleton**        | `skeleton.ts`                                              | Medium — loading states                |
| **Icons**           | `icons.ts`                                                 | Low — functional                       |
| **Delight**         | `delight.ts`                                               | Low — micro-interactions               |

---

### CSS Architecture

**Core system (load order matters):**

1. `tokens.css` — app-specific token overrides
2. `polish-tokens.css` — glow, focus ring, z-index
3. `animations.css` — keyframes
4. `polish-motion.css` — GPU-optimized animations
5. `primitives.css` — page, skeleton, toast, drawer, list/rail items, data tables
6. `shell.css` / `shell-responsive.css` — app shell layout
7. `polish-brand.css` — skip link, sr-only, brand glow, scrollbars
8. `polish-delight.css` — micro-delight layer
9. `palette.css` — color utilities
10. `components.css` — `mc-*` component vocabulary (1027 lines)
11. `design-system.css` — base tokens, surface hierarchy, heading classes

**Page-specific sheets (34 files):**
`attempt.css`, `audit.css`, `config.css`, `diff.css`, `forms.css`, `git.css`, `hardening.css`, `issue.css`, `issue-inspector-rail.css`, `kanban.css`, `logs.css`, `modal.css`, `notifications.css`, `observability.css`, `overview.css`, `palette.css`, `queue.css`, `queue-dnd.css`, `runs.css`, `secrets.css`, `settings.css`, `setup.css`, `shell.css`, `shell-responsive.css`, `state-guide.css`, `templates.css`, `unified-settings.css`, `welcome.css`, `workspace.css`

**Refactor opportunity:** Many page-specific styles could be folded into shared primitives if patterns are consolidated.

---

## 3. Test Coverage Baseline

### Vitest Frontend Unit Tests (30 files)

| Module                          | Tests | Coverage Gap |
| ------------------------------- | ----- | ------------ |
| `agentation-island.test.ts`     | ✅    | —            |
| `api.test.ts`                   | ✅    | —            |
| `async-state.test.ts`           | ✅    | —            |
| `audit-state.test.ts`           | ✅    | —            |
| `command-palette-data.test.ts`  | ✅    | —            |
| `drag-state.test.ts`            | ✅    | —            |
| `event-source.test.ts`          | ✅    | —            |
| `events.test.ts`                | ✅    | —            |
| `format.test.ts`                | ✅    | —            |
| `header.test.ts`                | ✅    | —            |
| `icons.test.ts`                 | ✅    | —            |
| `lifecycle-stepper.test.ts`     | ✅    | —            |
| `log-buffer.test.ts`            | ✅    | —            |
| `logs-data.test.ts`             | ✅    | —            |
| `overview-descriptions.test.ts` | ✅    | —            |
| `page.test.ts`                  | ✅    | —            |
| `polling.test.ts`               | ✅    | —            |
| `router.test.ts`                | ✅    | —            |
| `settings-codex-admin.test.ts`  | ✅    | —            |
| `settings-helpers.test.ts`      | ✅    | —            |
| `settings-patches.test.ts`      | ✅    | —            |
| `settings-sections.test.ts`     | ✅    | —            |
| `settings-tabs.test.ts`         | ✅    | —            |
| `settings-view-render.test.ts`  | ✅    | —            |
| `setup-shared.test.ts`          | ✅    | —            |
| `sidebar-badges.test.ts`        | ✅    | —            |
| `single-flight.test.ts`         | ✅    | —            |
| `store.test.ts`                 | ✅    | —            |
| `templates-state.test.ts`       | ✅    | —            |
| `access-token.test.ts`          | ✅    | —            |

**Coverage:** Strong unit coverage for state management, settings, and core utilities.

---

### Playwright E2E Smoke Tests (37 specs)

**Core workflows covered:**

- Setup wizard + gate ✅
- Overview metrics + events ✅
- Command palette ✅
- Queue + issue actions ✅
- Runs + logs navigation ✅
- Settings tabs + interactions ✅
- Config + secrets ✅
- Notifications ✅
- Git lifecycle ✅
- Templates ✅
- Audit log ✅
- Error scenarios ✅
- Sidebar contextual nav ✅

**Missing smoke coverage:**

- `/containers` page
- Observability deep dive
- Workspaces actions

---

### Playwright Visual Regression (14 baselines)

| Spec                            | Baselines                                                                                                                           | Status |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `overview.visual.spec.ts`       | `overview-running.png`                                                                                                              | ✅     |
| `queue.visual.spec.ts`          | `queue-board.png`                                                                                                                   | ✅     |
| `issue-detail.visual.spec.ts`   | `issue-detail-running.png`, `issue-detail-attempts.png`                                                                             | ✅     |
| `runs-detail.visual.spec.ts`    | `runs-table.png`, `runs-compare.png`                                                                                                | ✅     |
| `attempt-detail.visual.spec.ts` | `attempt-timeline.png`, `attempt-details.png`                                                                                       | ✅     |
| `settings.visual.spec.ts`       | `settings-tabs.png`                                                                                                                 | ✅     |
| `settings-tabs.visual.spec.ts`  | `settings-devtools.png`, `settings-credentials.png`, `settings-codex.png`                                                           | ✅     |
| `setup.visual.spec.ts`          | `setup-wizard-step1.png`, `setup-wizard-step2.png`, `setup-wizard-step3.png`, `setup-wizard-step4.png`, `setup-wizard-complete.png` | ✅     |
| `templates.visual.spec.ts`      | `templates-list.png`, `templates-editor.png`                                                                                        | ✅     |
| `workspaces.visual.spec.ts`     | `workspaces-list.png`, `workspaces-detail.png`                                                                                      | ✅     |
| `observability.visual.spec.ts`  | `observability-metrics.png`                                                                                                         | ✅     |
| `audit.visual.spec.ts`          | `audit-log.png`                                                                                                                     | ✅     |
| `empty-states.visual.spec.ts`   | `empty-overview.png`, `empty-queue.png`, `empty-logs.png`, `empty-runs.png`                                                         | ✅     |
| `error-states.visual.spec.ts`   | `error-404.png`, `error-api.png`, `error-boundary.png`                                                                              | ✅     |

**Visual coverage:** 26 baselines across 14 specs  
**Missing visual coverage:** Logs detail, Notifications, Git, Containers

---

## 4. Non-Negotiable Guardrails

### Functional Guardrails

- ✅ **Route coverage preserved** — all 16 routes must continue working
- ✅ **Keyboard navigation** — all keyboard shortcuts must remain functional
- ✅ **Command palette reachability** — `Cmd+K` must work from every page
- ✅ **Status semantics** — running, blocked, retrying, claimed, queued, completed meanings unchanged
- ✅ **Core operator workflows** — triage → claim → run → review flow unbroken
- ✅ **SSE + polling** — real-time updates must continue functioning
- ✅ **Theme toggle** — both light/dark fully functional
- ✅ **Setup gate** — unconfigured users still routed to `/setup`

### Accessibility Guardrails

- ✅ **WCAG AA** — 4.5:1 for body text, 3:1 for large text (tokens already tuned)
- ✅ **Focus rings** — 2px copper ring on all interactive elements
- ✅ **Skip links** — keyboard users can skip to main content
- ✅ **ARIA live regions** — route changes announced
- ✅ **Reduced motion** — `prefers-reduced-motion` honored
- ✅ **Touch targets** — minimum 44px (`--control-height-xl`)

### Design System Guardrails

- ✅ **Dual-spine typography** — mono for agent work, proportional for UI
- ✅ **Copper reserved** — brand color for primary action, active nav, live indicators only
- ✅ **Zero-radius stitch** — square surfaces, 2px max on compact controls
- ✅ **Status colors semantic only** — never decorative
- ✅ **Motion = proof of life** — running agents pulse, idle is still
- ✅ **Both themes equal** — no feature that only looks good in one theme

### Test Guardrails

- ✅ **Vitest passes** — `pnpm test` must pass after every change
- ✅ **Smoke tests pass** — `playwright test --project=smoke` must pass
- ✅ **Visual verification** — `/visual-verify` mandatory after CSS/template changes
- ✅ **No unmocked API calls** — E2E tests must not hit real backend

---

## 5. Baseline Critique Observations

### Strengths (Preserve These)

1. **Tokenized design system** — excellent foundation with `tokens.css`, `design-system.css`, `components.css`
2. **Component vocabulary** — `mc-*` classes provide consistent naming (`mc-button`, `mc-panel`, `mc-badge`)
3. **Surface hierarchy** — Primary/Standard/Quiet tiers well-defined
4. **Status treatment** — unified pattern for running/blocked/retrying/claimed states
5. **Test coverage** — strong Vitest + Playwright coverage already in place
6. **Keyboard support** — comprehensive keyboard nav system already implemented
7. **Theme support** — both light/dark implemented with proper tokens

### Areas for Refinement (Opportunities)

1. **Page-specific CSS drift** — 34 page-specific stylesheets; some patterns should be consolidated into shared primitives
2. **Information architecture in Settings** — many sections, could benefit from better progressive disclosure
3. **Dense data presentation** — Observability, Audit, Runs tables could use better hierarchy
4. **Empty/error states** — covered visually, but some pages could use better in-context guidance
5. **Responsive behavior** — `shell-responsive.css` exists, but some pages don't adapt well below 1100px
6. **Loading states** — skeleton loaders exist but aren't consistently applied
7. **Form validation UX** — settings forms work, but error handling could be clearer
8. **Visual consistency** — some buttons, badges, chips have minor inconsistencies across pages
9. **Motion polish** — animations functional, but some could be GPU-optimized
10. **Copy tone** — some microcopy could be tighter, more consistent with "Transparent, Partnered, Alive"

### Known Legacy Drift (To Remove)

From `design-system.css` `@deprecated` comments:

- `.badge`, `.pill` → use `.mc-badge`
- `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-info` → use `.mc-badge.is-status-*`
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-icon` → use `.mc-button`
- `.card`, `.card-interactive`, `.card-highlight`, `.card-warning`, `.card-empty` → use `.mc-panel`
- `.input`, `.select`, `.textarea` → use `.mc-input`
- `.status-dot`, `.status-dot-*` → use `.mc-badge.has-dot`

---

## 6. Refactor Phases Summary

| Phase                           | Surfaces                                                             | Estimated Effort | Risk Level               |
| ------------------------------- | -------------------------------------------------------------------- | ---------------- | ------------------------ |
| **Phase 4:** Shell + Primitives | App shell, sidebar, header, command palette, buttons, badges, tables | **High**         | **High** (cross-cutting) |
| **Phase 5:** Operate            | Overview, Queue, Issue, Runs, Logs, Attempt                          | **High**         | Medium                   |
| **Phase 6:** Configure          | Settings, Setup, Templates                                           | **Medium**       | Low                      |
| **Phase 7:** Observe            | Observability, Notifications, Git, Workspaces, Containers, Audit     | **Medium**       | Low                      |
| **Phase 8:** Consolidation      | Pattern extraction, docs, dead code removal                          | **Low**          | Low                      |

---

## 7. Acceptance Criteria (Per Phase)

Each phase must satisfy:

- ✅ **Critique/audit findings improved** — measurable design quality gains
- ✅ **No broken route workflows** — all routes functional post-refactor
- ✅ **Tests updated** — unit + smoke + visual tests pass
- ✅ **Visual verification** — `/visual-verify` invoked and passed
- ✅ **Docs updated** — `README.md`, `docs/OPERATOR_GUIDE.md` reflect changes
- ✅ **Both themes verified** — light + dark look correct
- ✅ **Keyboard nav preserved** — all shortcuts still work
- ✅ **WCAG AA maintained** — contrast ratios verified

---

## Next Steps

**Step 2:** Build detailed evaluation inventory — group surfaces into workstreams, document JTBD, current problems, component dependencies, and intended refactor depth for each.

**Skills to invoke before editing:**

- `/critique` — detailed design quality evaluation
- `/audit` — accessibility + performance + anti-pattern scan
- `/impeccable` — validate alignment with design context
- Then: `/distill`, `/arrange`, `/typeset`, `/clarify`, `/normalize`, `/harden`, `/adapt`, `/optimize`, `/polish`, `/extract` (as needed per phase)
- Always: `/visual-verify` after UI changes

---

**End of Step 1 Baseline**
