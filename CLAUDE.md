# Design Context for Symphony Orchestrator

## Design Context

### Users
Solo developers running autonomous coding agents on their local machines for personal or side projects. They use Symphony to manage work instead of supervising coding agents — they want to start an agent, check on its progress, and trust it's working. Their context is a local development environment, often with multiple terminals and tools open.

### Brand Personality
**Precise, technical, reliable.** Symphony is a tool for engineers who value accuracy and predictability. It doesn't try to be friendly or playful — it's a professional instrument that does its job well. The design should feel like a well-made developer tool: clean, efficient, and trustworthy.

### Aesthetic Direction
- **Visual tone:** Minimal, technical, calm. No flashy animations, gradients, or visual tricks.
- **Theme:** Support both light and dark modes with a toggle.
- **Color palette:** Harmonize the current coral/teal split into a unified palette that reads as precise and technical. Lean toward cooler tones (teal family) with warm accents used sparingly for status and actions.
- **References:** Developer tools like Linear, Raycast, and the GitHub UI — clean, information-dense but not cluttered, functional over decorative.
- **Anti-references:** Avoid flashy/trendy designs with heavy gradients, playful illustrations, or visual tricks that distract from the core task of monitoring agent status.

### Design Principles

1. **Clarity over cleverness** — Status information should be immediately readable. No ambiguous icons or hidden states.

2. **Technical precision** — Accurate data display with monospace for code/logs, clear visual hierarchy, and no visual tricks.

3. **Calm confidence** — A neutral base palette with purposeful accent color. The UI should feel stable and trustworthy, not exciting or distracting.

4. **Respect the workspace** — Minimal chrome, maximum signal. Solo developers have limited screen real estate — every pixel should earn its place.

5. **Accessible by default** — WCAG AA contrast ratios, clear focus states, keyboard navigation. No accessibility afterthoughts.

### Color System

**Primary brand color:** Teal family (`#0f766e` → `#14b8a6`) — reads as technical, precise, and modern.

**Accent colors for status:**
- Success: `#16a34a` (green)
- Warning: `#d97706` (amber)
- Danger: `#dc2626` (red)

**Light theme base:**
- Background: `#fdfbf8` (warm off-white)
- Panel: `#ffffff` (white)
- Border: `#e4d6d3` (warm gray)
- Text: `#0f172a` (near black)
- Muted: `#64748b` (gray-blue)

**Dark theme base:**
- Background: `#0f172a` (near black, inverted)
- Panel: `#1e293b` (dark slate)
- Border: `#334155` (slate gray)
- Text: `#f1f5f9` (off-white)
- Muted: `#94a3b8` (light gray-blue)

### Typography

**UI text:** System sans-serif stack
```
-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
```

**Code/monospace:** System monospace stack
```
ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace
```

### Spacing & Radius

- Base spacing unit: `0.25rem` (4px)
- Border radius: `10-14px` for cards/panels, `6-8px` for buttons/inputs, `999px` for pills/badges

### Components

- **Status pills:** Rounded badges with semantic colors for running/stopped/blocked states
- **Cards:** White panels with subtle borders and consistent padding
- **Buttons:** Clear primary/secondary distinction, teal for primary actions
- **Data display:** Monospace for identifiers, logs, and code; sans-serif for labels and descriptions

---

## Design System

**Location:** `src/ui/`

The design system provides shared CSS tokens and utilities for consistent styling across all Symphony UI surfaces.

### Files

| File | Purpose |
|------|---------|
| `src/ui/design-system.css` | CSS custom properties, reset, and component styles |
| `src/ui/index.ts` | TypeScript utilities, helpers, and token exports |

### Usage in Templates

For inline styles in template strings, reference the CSS custom properties:

```css
background: var(--bg-surface);
color: var(--text-primary);
border: 1px solid var(--border-default);
border-radius: var(--radius-lg);
```

### Theme Toggle

Inject the theme toggle script at the start of HTML templates:

```typescript
import { themeToggleScript, renderThemeToggle } from "./ui/index.js";

// In template HTML:
// 1. Add script in <head> to set initial theme
// 2. Add toggle button in header
```

### Component Classes

**Badges/Pills:**
- `.badge` / `.pill` — Base badge style
- `.badge-identifier` — Mono font for IDs
- `.badge-success` / `.badge-warning` / `.badge-danger` — Semantic colors
- `.badge-priority-high` / `.badge-priority-medium` / `.badge-priority-low`

**Buttons:**
- `.btn` — Base button
- `.btn-primary` — Teal primary action
- `.btn-secondary` — White with border
- `.btn-ghost` — Transparent, text-muted
- `.btn-icon` — Square icon button
- `.filter-group` — Segmented control container
- `.filter-btn` — Filter/tab button

**Cards:**
- `.card` — Base card with shadow
- `.card-interactive` — Cursor pointer + hover shadow
- `.card-highlight` — Brand-colored border
- `.card-warning` — Warning-colored border
- `.card-empty` — Dashed border, muted

**Panels:**
- `.panel` — Slide-out panel
- `.panel-hidden` / `.panel-visible` — Visibility states
- `.panel-header` / `.panel-body` / `.panel-footer`

**Layout:**
- `.sidebar` — Left navigation rail
- `.sidebar-btn` — Icon button for sidebar
- `.header` — Top header with backdrop blur
- `.status-bar` — Monospace metrics bar
- `.kanban-column` — Kanban column container

### CSS Variables

**Colors:**
- `--color-brand-{50-900}` — Teal brand scale
- `--color-success-*` / `--color-warning-*` / `--color-danger-*` / `--color-info-*` — Semantic scales

**Theme Tokens (auto-switch between light/dark):**
- `--bg-base` / `--bg-surface` / `--bg-elevated` / `--bg-muted` / `--bg-subtle`
- `--text-primary` / `--text-secondary` / `--text-muted` / `--text-subtle`
- `--border-default` / `--border-subtle` / `--border-muted`
- `--interactive-primary` / `--interactive-primary-hover` / `--interactive-primary-active`

**Typography:**
- `--font-sans` / `--font-mono`
- `--text-xs` through `--text-2xl`
- `--font-normal` through `--font-bold`

**Spacing:**
- `--space-1` (4px) through `--space-8` (32px)

**Radius:**
- `--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-xl` / `--radius-full`

**Shadows:**
- `--shadow-sm` / `--shadow-md` / `--shadow-lg` / `--shadow-xl` / `--shadow-2xl`

### Migration Notes

When updating existing templates:

1. Replace hard-coded colors with CSS variables
2. Replace coral (`#bb4a31`) with brand teal (`--interactive-primary`)
3. Add theme toggle to headers
4. Use component classes instead of inline styles where possible
5. Ensure dark mode support by using theme tokens instead of absolute values