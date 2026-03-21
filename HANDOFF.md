# Symphony Orchestrator — Design System Cleanup Handoff

## Project Context

Symphony Orchestrator is a TypeScript/Node.js project that manages Codex worker execution with a web dashboard. The frontend is vanilla TypeScript (no framework) with CSS, served by an HTTP server. The codebase lives at `/home/oruc/Desktop/codex/`.

**Build/test commands:**

- `npm run build` — compiles TypeScript
- `npm test` — runs Vitest suite (670/672 pass, 2 pre-existing failures unrelated to changes)

---

## What Was Done (Completed)

We ran a **4-phase design system cleanup** to consolidate two parallel CSS systems (old generic classes vs new `mc-*` prefixed classes).

### Phase 1: Deduplication & Tokenization

- Removed ~70 lines of duplicate CSS definitions
- Tokenized hard-coded pixel values to CSS variables (`var(--control-height-sm)`, `var(--control-height-md)`)
- Replaced hard-coded dark badge colors with `color-mix()` + semantic `--status-*` tokens

**Files changed:** `frontend/src/styles/components.css`, `frontend/src/styles/primitives.css`, `frontend/src/styles/shell.css`, `frontend/src/styles/design-system.css`

### Phase 2: Shell Consolidation

- Migrated `frontend/src/shell/header.ts` from legacy classes (`header-action-btn`, `header-command-trigger`) to `mc-button` system
- Removed standalone CSS definitions that duplicated mc-button styles
- Kept only shell-specific overrides (accent hover, responsive breakpoints)

**Files changed:** `frontend/src/styles/shell.css`, `frontend/src/shell/header.ts`

### Phase 3: Component Extraction

Created 7 new shared utility files:

| File                                   | Purpose                                                    |
| -------------------------------------- | ---------------------------------------------------------- |
| `frontend/src/utils/async-state.ts`    | Generic async state (loading/error/data)                   |
| `frontend/src/utils/render-guards.ts`  | Single-call render with loading/error/empty/content guards |
| `frontend/src/utils/dom.ts`            | Shared `isTypingTarget()` helper                           |
| `frontend/src/ui/keyboard-scope.ts`    | Auto-cleanup keyboard binding lifecycle                    |
| `frontend/src/ui/keyboard-commands.ts` | Key→action map builder                                     |
| `frontend/src/ui/confirm-modal.ts`     | Confirmation modal with variants                           |
| `frontend/src/ui/overlay.ts`           | Drawer/modal/palette overlay primitive                     |

Migrated `frontend/src/views/settings-view.ts` and `frontend/src/views/config-view.ts` to use these utilities.

### Phase 4: Structural Cleanup

- **4.1:** Unified `settings-rail-item` and `config-rail-item` onto `mc-rail-item` system (`frontend/src/styles/settings.css`, `frontend/src/styles/config.css`)
- **4.2:** Removed misleading `--border-strong` override in `frontend/src/styles/tokens.css`
- **4.3:** Added deprecation comments to old classes (`.btn`, `.card`, `.input`, `.badge`, `.status-dot`) in `frontend/src/styles/design-system.css`
- **4.4:** Consolidated `@media (prefers-reduced-motion: reduce)` blocks from 5 files into `frontend/src/styles/animations.css`

---

## What's Left (TODO)

### Legacy Class Migration

**14 TypeScript files** still reference old CSS class names instead of the new `mc-*` system. The old CSS definitions cannot be removed until all callers are updated.

**Classes to migrate:**

| Old Class        | New Class           |
| ---------------- | ------------------- |
| `status-chip`    | `mc-status-chip`    |
| `filter-chip`    | `mc-filter-chip`    |
| `event-chip`     | `mc-event-chip`     |
| `inline-badge`   | `mc-inline-badge`   |
| `priority-badge` | `mc-priority-badge` |

**How to find them:**

```bash
grep -rn "status-chip\|filter-chip\|event-chip\|inline-badge\|priority-badge" frontend/src/ --include="*.ts"
```

**Migration steps:**

1. Grep for all occurrences of the old class names
2. Replace each with the `mc-*` equivalent
3. Run `npm run build` to verify compilation
4. Run `npm test` to check for regressions (some tests may assert on class names — update them)
5. After ALL callers are migrated, remove the old CSS definitions from `frontend/src/styles/design-system.css`

**Risk: Low.** The old and new classes define the same styles. Renaming is mechanical — no visual changes expected.

**Estimated effort:** ~30 minutes

---

## Key Files Reference

| Path                                    | Role                                                   |
| --------------------------------------- | ------------------------------------------------------ |
| `frontend/src/styles/design-system.css` | Main design system — has old deprecated classes at top |
| `frontend/src/styles/components.css`    | Component styles (mc-\* system)                        |
| `frontend/src/styles/shell.css`         | App shell/layout styles                                |
| `frontend/src/styles/tokens.css`        | CSS custom properties (design tokens)                  |
| `frontend/src/styles/animations.css`    | All animation keyframes + reduced-motion               |
| `.impeccable.md`                        | Design context doc (copper brand, stitch aesthetic)    |
| `DESIGN_CLEANUP.md`                     | Full cleanup plan with all phases documented           |

## Design System Context

- **Brand color:** Copper `#c96e4a`
- **Aesthetic:** "Stitch" — zero border-radius, sharp edges, technical
- **Token prefix:** `--mc-*` for new tokens, `--control-height-*` for sizing
- **Naming convention:** `mc-{component}` with `is-{variant}` modifiers (e.g., `mc-button is-ghost is-icon-only`)
