# Risoluto Design System

## Design Context

### Users

Risoluto is for developers and operators running autonomous coding workflows on their own machines. They are usually scanning status quickly, stepping into details only when something needs intervention, and they often work with several terminal and browser surfaces open at once.

Their workflow expectations are:

- status should be legible at a glance
- live state should feel trustworthy, not noisy
- detailed panes should be dense but scannable
- configuration surfaces should feel precise and safe

### Brand Personality

**Precise, calm, reliable.** The product should feel like an instrument panel for serious engineering work: trustworthy, composed, and efficient. Distinctive is good; cute is not.

Risoluto should read as:

- technically credible
- operationally calm
- intentionally designed
- sharp rather than soft

It should not read as:

- playful
- fluffy
- trend-driven
- over-decorated

### Aesthetic Direction

- **Visual tone:** Mission-control UI with restrained warmth, crisp geometry, and dense but readable information layout.
- **Theme:** Light and dark are both supported, but dark is the default operating mode.
- **Accent:** Copper is reserved for brand, active navigation, and primary action. Runtime states use semantic colors instead of brand color.
- **Typography:** Space Grotesk for headings, Manrope for interface/body copy, IBM Plex Mono for logs, identifiers, counters, and badges.
- **Shape:** Sharp edges dominate. Small 2px radii are acceptable for controls; major surfaces should remain squared-off.
- **Motion:** Purposeful and low-amplitude. Motion should clarify live state, transitions, reveal order, or hierarchy.
- **References:** Linear, Raycast, GitHub, terminal-first monitoring tools, and operator dashboards that prize signal over spectacle.
- **Anti-references:** Bubbly SaaS cards, purple gradients, playful illustrations, overly rounded surfaces, and empty-state-heavy consumer UI patterns.

### Design Principles

1. **Operational clarity first** — users should understand state, urgency, and next action in a glance.
2. **Semantic color discipline** — copper signals brand and intent; status colors signal system meaning.
3. **High signal per pixel** — optimize for cramped developer workspaces and fast scanning.
4. **Crisp composition** — use sharp framing, structured spacing, and strong alignment instead of decorative flourish.
5. **Accessibility by default** — keyboard access, durable contrast, and motion restraint are baseline expectations.

## Source Of Truth

The live design system is implemented in `frontend/src/styles/`. Files are organized into layers:

### Foundation Layer

| File | Purpose |
| --- | --- |
| `frontend/index.html` | Font loading (preload + swap) and dark-theme default |
| `design-system.css` | Core palette, theme tokens, semantic status colors, surface hierarchy, typography hierarchy classes, and deprecated legacy components |
| `tokens.css` | App-specific aliases, extended typography scale, tracking/leading tokens, font features, control sizing, shell dimensions, status tint percentages, and tone tokens |
| `primitives.css` | Page structure, utility typography, skeletons, toasts, and shared primitives |
| `components.css` | Shared surfaces (mc-*), buttons, badges, chips, status treatments, and component-level rules |

### Feature Layer

| File | Purpose |
| --- | --- |
| `animations.css` | Keyframe animations and motion utilities |
| `container-queries.css` | Container query breakpoints for responsive components |
| `containers.css` | Container wrapper definitions |
| `forms.css` | Form-specific styling |
| `modal.css` | Modal/dialog component system |
| `palette.css` | Extended palette utilities |

### Polish Layer

| File | Purpose |
| --- | --- |
| `polish-tokens.css` | Polish-specific design tokens |
| `polish-brand.css` | Brand-level polish refinements |
| `polish-delight.css` | Micro-interactions and delight effects |
| `polish-motion.css` | Motion choreography and transition orchestration |
| `hardening.css` | Edge-case hardening (overflow, truncation, empty states, resilience) |

### Page Layer

| File | Purpose |
| --- | --- |
| `shell.css` / `shell-responsive.css` | App shell, sidebar, header, responsive breakpoints |
| `overview.css` | Dashboard overview panels |
| `queue.css` / `queue-dnd.css` | Issue queue and drag-and-drop |
| `kanban.css` | Kanban board view |
| `logs.css` | Log viewer |
| `settings.css` / `unified-settings.css` | Settings pages |
| `config.css` | Configuration panels |
| `setup.css` / `welcome.css` | Setup wizard and welcome flow |
| `observability.css` | Observability dashboard |
| `issue.css` / `issue-inspector-rail.css` | Issue detail and inspector rail |
| `attempt.css` / `runs.css` | Attempt and run views |
| `workspace.css` | Workspace management |
| `git.css` / `diff.css` | Git status and diff rendering |
| `secrets.css` | Secrets management UI |
| `notifications.css` | Notification toasts and alerts |
| `state-guide.css` | State guide reference |
| `audit.css` | Audit log pages |
| `templates.css` | Template rendering utilities |

Page-specific styles extend the foundation and feature layers but are not the canonical token source.

## Color System

### Brand Accent

Copper is the live brand accent and should be used deliberately.

**Copper scale:**

- `--color-copper-50`: `#f9eee9`
- `--color-copper-100`: `#f3ddd4`
- `--color-copper-200`: `#e8bba9`
- `--color-copper-300`: `#da9478`
- `--color-copper-400`: `#c96e4a`
- `--color-copper-500`: `#b45837`
- `--color-copper-600`: `#9a472b`
- `--color-copper-700`: `#7a3520`
- `--color-copper-800`: `#5d2a1c`

**Interactive brand tokens:**

- `--interactive-primary`: `#8a3f26` (light) / `#cd7350` (dark)
- `--interactive-primary-hover`: `#7a3520` (light) / `#da9478` (dark)
- `--interactive-primary-active`: `#5d2a1c` (light) / `#e8bba9` (dark)
- `--interactive-primary-text`: `#ffffff` (light) / `#0c1016` (dark)

### Accent Usage Rules

Copper is appropriate for:

- primary CTAs
- active navigation state
- command surfaces that need focal emphasis
- key brand moments and selective highlights

Copper should not be used for:

- runtime status semantics
- secondary actions
- decorative borders on arbitrary panels
- replacing warning or error colors

### Semantic Status Colors

The runtime model depends on semantic status tokens:

- Backlog: `--status-backlog` — `#7b8fa8`
- Triage: `--status-triage` — `#8b8fa0`
- Queued: `--status-queued` — `#4f7cff`
- Claimed: `--status-claimed` — `#7c62d6`
- Running: `--status-running` — `#2f9e44`
- Retrying: `--status-retrying` — `#d98a1c`
- Blocked: `--status-blocked` — `#d94841`
- Completed: `--status-completed` — `#3a9e7a`
- Closed: `--status-closed` — `#7a9652`
- Cancelled: `--status-cancelled` — `#b25c6a`
- Duplicate: `--status-duplicate` — `#8a7f94`
- Pending change: `--status-pending-change` — `#b45837`
- Gate: `--status-gate` — `#f59e0b` (defined in `tokens.css`)

Dark mode brightens these slightly for legibility while preserving semantic meaning.

### Severity Scale

Used for issue card borders and priority badges:

- `--severity-critical`: maps to `--status-blocked`
- `--severity-high`: `#d98a1c`
- `--severity-medium`: maps to `--status-queued`
- `--severity-low`: maps to `--text-muted`

### Event-Type Tints

Subtle background tints for activity log rows (8% mix into transparent):

- `--event-tint-config`: queued-tinted
- `--event-tint-start`: running-tinted
- `--event-tint-complete`: completed-tinted
- `--event-tint-error`: blocked-tinted

### Status Tint Percentages

Controls visual intensity of status color blending across the UI:

- `--status-tint-badge-bg`: 18% (20% in dark)
- `--status-tint-badge-border`: 34%
- `--status-tint-surface`: 4%
- `--status-tint-surface-claimed`: 3%
- `--status-tint-list`: 6%
- `--status-tint-list-claimed`: 5%
- `--status-tint-interactive`: 12%

### Semantic Color Scales

Retained for badge classes and utility use:

- Success: `--color-success-{50,100,500,600,700}` (green)
- Warning: `--color-warning-{50,100,500,600,700}` (amber)
- Danger: `--color-danger-{50,100,500,600,700}` (red)
- Info: `--color-info-{50,100,500,600,700}` (blue)
- Gray: `--color-gray-{50..900}` (neutral)

### Theme Surfaces

**Light theme base:**

- `--bg-base`: `#f7f5f1`
- `--bg-surface`: `#ffffff`
- `--bg-elevated`: `#f0ede7`
- `--bg-muted`: `#e8e4dc`
- `--bg-subtle`: `#e0dbd2`
- `--text-primary`: `#1a1f28`
- `--text-secondary`: `#4a535f` (WCAG AA 6.0:1 on white)
- `--text-muted`: `#5c6570` (WCAG AA 5.1:1 on white)
- `--text-subtle`: `#9ba3ad`
- `--text-accent`: `#9a472b`
- `--border-default`: `#cdc7be`
- `--border-subtle`: `#ddd8d0`
- `--border-muted`: `#ece8e2`
- `--border-strong`: `#ada7a0`

**Dark theme base:**

- `--bg-base`: `#0c1016`
- `--bg-surface`: `#121824`
- `--bg-elevated`: `#182131`
- `--bg-muted`: `#1e293b`
- `--bg-subtle`: `#243040`
- `--text-primary`: `#eaf0f6`
- `--text-secondary`: `#a8b5c3`
- `--text-muted`: `#8ba0b5` (WCAG AA 4.5:1 on dark surfaces)
- `--text-subtle`: `#617181`
- `--text-accent`: `#d4795a` (WCAG AA 4.5:1+ on dark sidebar)
- `--border-default`: `#344658`
- `--border-subtle`: `#263546`
- `--border-muted`: `#1d2838`
- `--border-strong`: `#506980`

### Derived Tone Tokens

`tokens.css` defines semantic background helpers for live, warning, and danger surfaces:

- `--tone-live-bg`: 6% running mix (10% in dark)
- `--tone-warning-bg`: 8% retrying mix (12% in dark)
- `--tone-danger-bg`: 8% blocked mix (12% in dark)
- `--tone-warning-border`: `--status-retrying`
- `--tone-danger-border`: `--status-blocked`

### Brand Signal Seam

`--brand-signal-seam` is a repeating linear gradient used for decorative brand accents — a dashed copper line effect.

## Typography

### Font Families

Fonts are loaded in `frontend/index.html` via `<link rel="preload" as="style">` with `font-display: swap`:

- **Heading:** Space Grotesk (400, 500, 600, 700)
- **Body/UI:** Manrope (400, 500, 600)
- **Monospace:** IBM Plex Mono (400, 500)

Tokenized stacks:

- `--font-heading`: Space Grotesk + system fallback
- `--font-body`: Manrope + system fallback
- `--font-sans`: Manrope + system fallback (alias)
- `--font-mono`: IBM Plex Mono + system fallback

### Font Weights

- `--font-normal`: 400
- `--font-medium`: 500
- `--font-semibold`: 600
- `--font-bold`: 700

### Type Scale

Two layers define the type scale:

**`design-system.css` — base Major Third (1.25) ratio:**

| Token | Size | Use |
| --- | --- | --- |
| `--text-xs` | 12px | Labels |
| `--text-sm` | 14px | Base UI |
| `--text-base` | 16px | Body |
| `--text-md` | 20px | Section titles |
| `--text-lg` | 24px | Lane titles |
| `--text-xl` | 30px | KPI |
| `--text-2xl` | 36px | Display |

**`tokens.css` — app-specific overrides for dashboard density:**

| Token | Size | Use |
| --- | --- | --- |
| `--text-2xs` | 10px | Group headers, type badges |
| `--text-xxs` | 11px | Toolbar labels, table headers |
| `--text-xs` | 12px | Secondary labels |
| `--text-ui` | 13px | Secondary UI text, descriptions |
| `--text-sm` | 14px | Base UI text |
| `--text-sm-plus` | 15px | Subsection headings |
| `--text-base` | 16px | Default body |
| `--text-md` | 18px | Section titles |
| `--text-lg` | 20px | Lane titles |
| `--text-xl` | 24px | KPI numbers |
| `--text-2xl` | 24–30px | Fluid display |
| `--text-hero` | 30–44px | Fluid hero |

The `tokens.css` overrides take precedence in the app. The tighter values are tuned for operational dashboard density.

### Tracking And Leading

Tracking:

- `--tracking-tightest`: -0.03em (hero/KPI, 22px+ headings)
- `--tracking-tight`: -0.02em (headings 20–28px)
- `--tracking-snug`: -0.01em (medium headings 16-20px)
- `--tracking-normal`: 0em (body)
- `--tracking-wide`: 0.02em (mono badges)
- `--tracking-wider`: 0.04em (uppercase mono labels)
- `--tracking-widest`: 0.08em (uppercase identifiers)
- `--tracking-caps`: 0.1em (sidebar headers, all-caps micro)

Leading:

- `--leading-none`: 1 (badges, buttons)
- `--leading-tight`: 1.2 (display numbers, hero)
- `--leading-snug`: 1.35 (card titles)
- `--leading-normal`: 1.5 (body)
- `--leading-relaxed`: 1.6 (code panels, logs)
- `--leading-loose`: 1.65 (long-form reading)

### Font Feature Tokens

- `--font-features-default`: kern, liga, calt
- `--font-features-tabular`: kern, tnum, lnum
- `--font-features-mono-num`: tnum, lnum, zero (slashed zero)
- `--font-features-heading`: kern, liga, calt, ss01

### Typography Hierarchy Classes

`design-system.css` defines a hierarchy of typography utility classes:

**Headings:**

- `.heading-display` — Hero numbers, large metrics (Space Grotesk, hero size, bold, tightest tracking, tabular figures)
- `.heading-section` — Page/section titles (Space Grotesk, xl size, semibold, tight tracking)
- `.heading-card` — Card titles, list headings (Space Grotesk, md size, semibold, snug tracking)
- `.heading-label` — Small section labels (IBM Plex Mono, xs, semibold, uppercase, wider tracking)

**Body:**

- `.text-tertiary` — Metadata, timestamps (xs, muted)
- `.text-identifier` — Issue IDs, code snippets (mono, sm, medium, accent color)
- `.text-metric` — KPI numbers (Space Grotesk, xl, bold, tabular figures)
- `.text-action` — Button text, CTAs (Manrope, base, medium)

### Typography Guidance

- Use Space Grotesk for page titles, section titles, and high-level metrics.
- Use Manrope for most descriptive copy, form labels, and body content.
- Use IBM Plex Mono for issue identifiers, status labels, timestamps, token counts, commands, and log output.
- Use tracking and font-feature tokens for compact, technical UI rather than ad-hoc letter-spacing or numeric styling.

## Spacing, Shape, And Motion

### Spacing

The system uses a 4px base grid:

- `--space-1`: 4px
- `--space-2`: 8px
- `--space-3`: 12px
- `--space-4`: 16px
- `--space-5`: 20px
- `--space-6`: 24px
- `--space-8`: 32px
- `--space-10`: 40px
- `--space-12`: 48px
- `--space-16`: 64px
- `--space-20`: 80px

### Radius

Live radius tokens are intentionally tight:

- `--radius-sm`: 2px
- `--radius-md`: 2px
- `--radius-lg`: 0px
- `--radius-xl`: 0px
- `--radius-full`: 9999px

The visual language should therefore feel sharp and stitched, even when compact controls use slight rounding.

### Control Heights And Icons

- `--control-height-xs`: 28px
- `--control-height-sm`: 32px
- `--control-height-md`: 36px
- `--control-height-lg`: 40px
- `--control-height-xl`: 44px

- `--icon-size-xs`: 12px
- `--icon-size-sm`: 14px
- `--icon-size-md`: 16px
- `--icon-size-lg`: 20px
- `--icon-size-xl`: 24px

### Badge And Chip Dimensions

- `--badge-dot-size`: 6px
- `--badge-padding-default`: 3px 8px
- `--badge-padding-sm`: 2px 6px
- `--badge-padding-lg`: 4px 10px

### Shell Dimensions

- `--sidebar-width-collapsed`: 56px
- `--sidebar-width-expanded`: 220px
- `--header-height`: 48px
- `--dashboard-h2-size`: 18px (maps to `--text-md`)
- `--dashboard-h3-size`: 15px (maps to `--text-sm-plus`)
- `--dashboard-number-lg`: 32–44px fluid
- `--dashboard-panel-min-height`: 15rem

### Stroke Widths, Shadows, And Motion

- `--stroke-default`: 1px
- `--stroke-accent`: 2px
- `--stroke-emphasis`: 3px

Shadows (light / dark have distinct values for appropriate depth perception):

- `--shadow-sm`
- `--shadow-md`
- `--shadow-lg`
- `--shadow-xl`

Motion durations:

- `--motion-instant`: 120ms
- `--motion-fast`: 180ms
- `--motion-medium`: 260ms
- `--motion-slow`: 420ms

Easing curves:

- `--ease-out-quart`: `cubic-bezier(0.25, 1, 0.5, 1)`
- `--ease-out-quint`: `cubic-bezier(0.22, 1, 0.36, 1)`
- `--ease-out-expo`: `cubic-bezier(0.16, 1, 0.3, 1)`

Motion should support hierarchy, feedback, and live-state awareness. Avoid decorative animation patterns that compete with operational data.

## Surface Hierarchy

The design system defines a three-tier surface hierarchy:

### Primary Surface — Commanding Presence

Used for command panels, live data displays, and primary actions. Highest visual weight with copper accent border and subtle elevation.

- `--surface-primary-bg`: `--bg-surface` (light) / blended elevated-surface (dark)
- `--surface-primary-border`: `--border-strong`
- `--surface-primary-border-accent`: `--text-accent`
- `--surface-primary-accent-width`: 3px
- `--surface-primary-shadow`: `--shadow-sm` (light) / deeper shadow (dark)

### Standard Surface — Default Containers

Used for list items, content cards, toolbars. Balanced, readable, no accent.

- `--surface-standard-bg`: `--bg-surface`
- `--surface-standard-border`: `--border-default`
- `--surface-standard-shadow`: none

### Quiet Surface — Supporting Content

Used for metadata, secondary info, empty states. Minimal visual presence.

- `--surface-quiet-bg`: `--bg-muted`
- `--surface-quiet-border`: transparent
- `--surface-quiet-shadow`: none

**Hierarchy rules:**

1. Primary surfaces should draw the eye first.
2. Standard surfaces provide the main content structure.
3. Quiet surfaces should never compete for attention.
4. Never nest same-tier surfaces (e.g., primary within primary).

## Shared Component Vocabulary

### Surface Classes

**Primary commanding surfaces:**

- `.mc-command`
- `.mc-live-panel`
- `.mc-status-primary`

**Standard containers:**

- `.mc-panel`
- `.mc-stat-card`
- `.mc-toolbar`
- `.mc-strip`

**Quiet support surfaces:**

- `.mc-drawer`
- `.mc-empty-state`
- `.mc-metadata`
- `.mc-sunken`
- `.mc-elevated`

**Status-aware containers:**

- `.mc-container`
- status variants like `.is-status-running`, `.is-status-blocked`, `.is-status-retrying`, `.is-status-claimed`

### Buttons

**Canonical button base:**

- `.mc-button`

**Variants:**

- `.is-primary`
- `.is-ghost`
- `.is-danger`

**Size modifiers:**

- `.is-sm`
- `.is-lg`

**Interaction modifiers and helpers:**

- `.is-icon-only`
- `.is-command`
- `.mc-button-icon`
- `.mc-button-hint`
- `.mc-button-segment`

Legacy button class names like `mc-button-ghost`, `mc-button-secondary`, `mc-btn`, `.btn`, `.btn-primary`, `.btn-ghost`, and `.btn-icon` should not be introduced in new code. Existing deprecated classes remain in `design-system.css` for backward compatibility.

### Badges And Chips

**Canonical classes:**

- `.mc-badge`
- `.mc-chip`

**Modifiers:**

- size: `.is-sm`, `.is-lg`
- status: `.is-status-*`
- priority: `.is-priority-*`
- event: `.is-event-*`
- interactive: `.is-interactive`, `.is-active`

Mono typography is expected for identifiers, compact labels, and operational chips.

Legacy badge classes (`.badge`, `.pill`, `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-info`) are deprecated in `design-system.css`. Use `.mc-badge` with `.is-status-*` modifiers instead.

### Layout And Page Rhythm

**Page-level primitives:**

- `.page`
- `.page-section`
- `.page-body`
- `.page-header`
- `.page-title`
- `.page-subtitle`

**Action/layout helpers:**

- `.mc-actions`
- `.mc-inline`
- `.mc-toolbar-group`
- `.mc-toolbar-section`
- `.mc-toolbar-label`

### Code, Logs, And Empty States

- `.mc-code-panel`
- `.mc-log-panel`
- `.mc-raw-panel`
- `.mc-log-row`
- `.mc-empty-state`

Logs, timestamps, identifiers, and counters should lean on mono typography and semantic runtime color rather than brand accent.

## Usage In Templates

For inline or template-driven styling, always prefer the shared token layer:

```css
background: var(--bg-surface);
color: var(--text-primary);
border: 1px solid var(--border-default);
border-left: var(--stroke-emphasis) solid var(--text-accent);
font-family: var(--font-body);
```

For buttons and chips, prefer shared classes over page-local reinvention:

```html
<button class="mc-button is-primary">Save</button>
<button class="mc-button is-ghost is-sm">Cancel</button>
<button class="mc-button is-ghost is-icon-only is-sm" aria-label="Refresh"></button>
<span class="mc-chip is-status-running">Running</span>
```

For typography hierarchy, use the predefined classes:

```html
<h1 class="heading-section">Dashboard</h1>
<h2 class="heading-card">Active Runs</h2>
<span class="heading-label">Status</span>
<span class="text-identifier">NIN-42</span>
<span class="text-metric">1,247</span>
```

## Theme And Runtime Behavior

- Theme is controlled via `data-theme` and CSS custom properties.
- Dark mode is the default starting theme (set on `<html>` in `index.html`).
- Theme-specific behavior should be implemented by token overrides, not duplicate component rules whenever possible.
- Operator-facing pages should maintain parity across light and dark themes.
- Shadows have distinct light/dark values — dark mode uses heavier shadows to maintain depth perception against dark backgrounds.

## Migration Notes

When updating existing templates or refactoring UI:

1. Replace hard-coded colors with CSS variables.
2. Replace legacy button classes (`.btn`, `.btn-primary`) with the shared `mc-button` + modifier system.
3. Replace legacy badge classes (`.badge`, `.pill`) with `mc-badge` / `mc-chip`.
4. Prefer semantic status tokens for runtime meaning instead of copper.
5. Use shared surface classes instead of inventing near-duplicate panel patterns.
6. Preserve dark mode parity by using theme tokens instead of absolute colors.
7. Keep command surfaces sharp, information-dense, and operational.
8. Use status tint percentage tokens instead of hard-coded `color-mix()` percentages.
9. Use typography hierarchy classes (`.heading-section`, `.text-identifier`, etc.) instead of ad-hoc font styling.
10. Update this document whenever the live token system materially changes.
