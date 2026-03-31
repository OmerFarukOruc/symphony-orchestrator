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

The live design system is implemented in `frontend/`:

| File                                    | Purpose                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `frontend/index.html`                   | Font loading and dark-theme default                                                       |
| `frontend/src/styles/design-system.css` | Core palette, theme tokens, semantic status colors, and base component system             |
| `frontend/src/styles/tokens.css`        | App-specific aliases, typography scale, spacing, motion, control sizing, shell dimensions |
| `frontend/src/styles/primitives.css`    | Page structure, utility typography, skeletons, toasts, and shared primitives              |
| `frontend/src/styles/components.css`    | Shared surfaces, buttons, badges, chips, status treatments, and component-level rules     |

Page-specific styles like `shell.css`, `settings.css`, `queue.css`, `logs.css`, and `workspace.css` extend these primitives but are not the canonical token source.

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

- `--interactive-primary`
- `--interactive-primary-hover`
- `--interactive-primary-active`
- `--interactive-primary-text`

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

- Backlog: `--status-backlog`
- Triage: `--status-triage`
- Queued: `--status-queued`
- Claimed: `--status-claimed`
- Running: `--status-running`
- Retrying: `--status-retrying`
- Blocked: `--status-blocked`
- Completed: `--status-completed`
- Closed: `--status-closed`
- Cancelled: `--status-cancelled`
- Duplicate: `--status-duplicate`
- Pending change: `--status-pending-change`
- Gate: `--status-gate`

Dark mode brightens these slightly for legibility while preserving semantic meaning.

### Theme Surfaces

**Light theme base:**

- `--bg-base`: `#f7f5f1`
- `--bg-surface`: `#ffffff`
- `--bg-elevated`: `#f0ede7`
- `--bg-muted`: `#e8e4dc`
- `--bg-subtle`: `#e0dbd2`
- `--text-primary`: `#1a1f28`
- `--text-secondary`: `#5a6370`
- `--text-muted`: `#8b96a3`
- `--text-subtle`: `#adb5bf`
- `--text-accent`: `#9a472b`
- `--border-default`: `#d4cfc7`
- `--border-subtle`: `#e0dbd2`
- `--border-muted`: `#ece8e2`
- `--border-strong`: `#b8b2aa`

**Dark theme base:**

- `--bg-base`: `#0c1016`
- `--bg-surface`: `#121824`
- `--bg-elevated`: `#182131`
- `--bg-muted`: `#1e293b`
- `--bg-subtle`: `#243040`
- `--text-primary`: `#e8edf3`
- `--text-secondary`: `#a3b0be`
- `--text-muted`: `#7a8796`
- `--text-subtle`: `#617181`
- `--text-accent`: `#c96e4a`
- `--border-default`: `#314052`
- `--border-subtle`: `#233143`
- `--border-muted`: `#1b2535`
- `--border-strong`: `#4a5d73`

### Derived Tone Tokens

`tokens.css` defines semantic background helpers for live, warning, and danger surfaces:

- `--tone-live-bg`
- `--tone-warning-bg`
- `--tone-danger-bg`
- `--tone-warning-border`
- `--tone-danger-border`

These should be preferred over one-off `color-mix()` expressions when the meaning matches.

## Typography

### Font Families

Current fonts are loaded in `frontend/index.html`:

- **Heading:** Space Grotesk
- **Body/UI:** Manrope
- **Monospace:** IBM Plex Mono

Tokenized stacks:

- `--font-heading`
- `--font-body`
- `--font-sans`
- `--font-mono`

### Type Scale

The live system includes both baseline and app-specific sizes:

- `--text-2xs` (10px)
- `--text-xxs` (11px)
- `--text-xs` (12px)
- `--text-ui` (13px)
- `--text-sm` (14px)
- `--text-sm-plus` (15px)
- `--text-md` (16px)
- `--text-lg` (18px)
- `--text-xl` (20px)
- `--text-2xl` (responsive)
- `--text-hero` (responsive)

Additional typography tokens cover:

- tracking: `--tracking-tightest` through `--tracking-caps`
- leading: `--leading-none` through `--leading-loose`
- font features: default, tabular, mono-number, and heading settings

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

### Stroke Widths, Shadows, And Motion

- `--stroke-default`: 1px
- `--stroke-accent`: 2px
- `--stroke-emphasis`: 3px

- `--shadow-sm`
- `--shadow-md`
- `--shadow-lg`
- `--shadow-xl`

- `--motion-instant`
- `--motion-fast`
- `--motion-medium`
- `--motion-slow`
- `--ease-out-quart`
- `--ease-out-quint`
- `--ease-out-expo`

Motion should support hierarchy, feedback, and live-state awareness. Avoid decorative animation patterns that compete with operational data.

## Shared Component Vocabulary

### Surface Hierarchy

**Primary commanding surfaces:**

- `.mc-command`
- `.mc-live-panel`
- `.mc-status-primary`

These use stronger framing and accent treatment.

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

Legacy button class names like `mc-button-ghost`, `mc-button-secondary`, and `mc-btn` should not be introduced in new code.

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

## Theme And Runtime Behavior

- Theme is controlled via `data-theme` and CSS custom properties.
- Dark mode is the default starting theme.
- Theme-specific behavior should be implemented by token overrides, not duplicate component rules whenever possible.
- Operator-facing pages should maintain parity across light and dark themes.

## Migration Notes

When updating existing templates or refactoring UI:

1. Replace hard-coded colors with CSS variables.
2. Replace legacy button classes with the shared `mc-button` + modifier system.
3. Prefer semantic status tokens for runtime meaning instead of copper.
4. Use shared surface classes instead of inventing near-duplicate panel patterns.
5. Preserve dark mode parity by using theme tokens instead of absolute colors.
6. Keep command surfaces sharp, information-dense, and operational.
7. Update this document whenever the live token system materially changes.
