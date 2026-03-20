# Symphony Orchestrator

## Code Search — MANDATORY

**ALWAYS use `mcp__cocoindex-code__search` as your FIRST tool when exploring or understanding code.** Do NOT default to Read or grep for code exploration. The semantic search MCP tool finds code by meaning, not just text — it is faster, cheaper, and more accurate for navigating this codebase.

- **First choice → `mcp__cocoindex-code__search`**: For ANY query about how something works, where code lives, finding implementations, understanding features, or locating related code. Use natural language: *"authentication logic"*, *"retry handling"*, *"HTTP route definitions"*.
- **Fallback → grep/rg**: ONLY for exact string matches (specific function names, variable names, import paths, error message strings).
- **Last resort → Read**: ONLY after search/grep has identified the specific file and line range you need.

```
search(query, limit=5, offset=0, refresh_index=true, languages=["typescript"], paths=["src/*"])
```

---

## Design Context

### Users

Solo developers running autonomous coding agents on their local machines for personal or side projects. They use Symphony to manage work instead of supervising coding agents — they want to start an agent, check on its progress, and trust it's working. Their context is a local development environment, often with multiple terminals and tools open.

### Brand Personality

**Precise, technical, reliable.** Symphony is a tool for engineers who value accuracy and predictability. It doesn't try to be friendly or playful — it's a professional instrument that does its job well. The design should feel like a well-made developer tool: clean, efficient, and trustworthy.

### Aesthetic Direction

- **Visual tone:** Minimal, technical, calm. No flashy animations, gradients, or visual tricks.
- **Theme:** Support both light and dark modes with a toggle.
- **Color palette:** Copper accent (`#c96e4a`) on dark slate backgrounds. The copper provides warmth and distinction while remaining professional and technical. Status colors are semantically meaningful: blue (queued), purple (claimed), green (running), amber (retrying), red (blocked), gray (completed).
- **Shape:** Zero-radius "stitch" aesthetic — sharp corners, clean edges.
- **References:** Developer tools like Linear, Raycast, and the GitHub UI — clean, information-dense but not cluttered, functional over decorative.
- **Anti-references:** Avoid flashy/trendy designs with heavy gradients, playful illustrations, rounded corners, or visual tricks that distract from the core task of monitoring agent status.

### Design Principles

1. **Clarity over cleverness** — Status information should be immediately readable. No ambiguous icons or hidden states.

2. **Technical precision** — Accurate data display with monospace for code/logs, clear visual hierarchy, and no visual tricks.

3. **Calm confidence** — A neutral base palette with purposeful accent color. The UI should feel stable and trustworthy, not exciting or distracting.

4. **Respect the workspace** — Minimal chrome, maximum signal. Solo developers have limited screen real estate — every pixel should earn its place.

5. **Accessible by default** — WCAG AA contrast ratios, clear focus states, keyboard navigation. No accessibility afterthoughts.

### Color System

**Primary brand color:** Copper (`#c96e4a`) — warm, distinctive, reads as technical and precise without being cold. Works harmoniously with the dark slate backgrounds.

**Copper scale:**

- 50: `#f9eee9` (lightest)
- 100: `#f3ddd4`
- 200: `#e8bba9`
- 300: `#da9478`
- 400: `#c96e4a` (primary)
- 500: `#b45837`
- 600: `#9a472b`
- 700: `#7a3520`
- 800: `#5d2a1c` (darkest)

**Semantic status colors:**

- Queued: `#4f7cff` (blue)
- Claimed: `#7c62d6` (purple)
- Running: `#2f9e44` (green)
- Retrying: `#d98a1c` (amber)
- Blocked: `#d94841` (red)
- Completed: `#7b8797` (gray)
- Pending change: `#b45837` (copper dark)

**Dark theme base:**

- Canvas: `#0c1016` (near black)
- Surface: `#121824` (dark slate)
- Elevated: `#182131` (slate)
- Muted: `#1e293b` (lighter slate)
- Border stitch: `#2a3548` (subtle border)
- Text primary: `#e8edf3` (off-white)
- Text secondary: `#8b99a8` (gray-blue)
- Text muted: `#546070` (dark gray)
- Accent: `#c96e4a` (copper)

**Light theme base:**

- Canvas: `#f7f5f1` (warm off-white)
- Surface: `#ffffff` (white)
- Elevated: `#f0ede7` (warm white)
- Muted: `#e8e4dc` (warm gray)
- Border stitch: `#d4cfc7` (warm gray border)
- Text primary: `#1a1f28` (near black)
- Text secondary: `#5a6370` (gray)
- Text muted: `#8b96a3` (light gray)
- Accent: `#9a472b` (copper dark)

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

- Base spacing unit: `4px` (--space-1)
- Border radius: `0px` (zero-radius "stitch" aesthetic)

### Components

- **Status chips:** Sharp badges with semantic colors for running/stopped/blocked states
- **Cards/Panels:** Bordered surfaces with subtle background shifts, zero radius
- **Buttons:** Clear primary/secondary distinction, copper accent for primary actions
- **Data display:** Monospace for identifiers, logs, and code; sans-serif for labels and descriptions

---

## Design System

**Location:** `frontend/src/styles/`

The design system provides shared CSS tokens and utilities for consistent styling across all Symphony UI surfaces.

### Files

| File                                 | Purpose                                     |
| ------------------------------------ | ------------------------------------------- |
| `frontend/src/styles/tokens.css`     | Design tokens (colors, spacing, typography) |
| `frontend/src/styles/primitives.css` | Base UI primitives and utility classes      |
| `frontend/src/styles/components.css` | Component-specific styles                   |

### Usage in Templates

For inline styles in template strings, reference the CSS custom properties:

```css
background: var(--bg-surface);
color: var(--text-primary);
border: 1px solid var(--border-stitch);
border-radius: var(--radius-sm);
```

### Theme Toggle

Theme toggle functionality is implemented in the frontend application using CSS custom properties and JavaScript.

### Component Classes

**Surface Hierarchy:**

- `.mc-command`, `.mc-live-panel`, `.mc-status-primary` — Primary commanding surfaces (accent left border)
- `.mc-panel`, `.mc-stat-card`, `.mc-toolbar`, `.mc-strip` — Secondary standard containers
- `.mc-drawer`, `.mc-empty-state`, `.mc-metadata` — Tertiary subtle surfaces
- `.mc-elevated` — Elevated surface (bg-elevated)
- `.mc-sunken` — Sunken surface (bg-muted)
- `.mc-container` — Status-aware container with left border accent

**Badges/Chips:**

- `.mc-badge`, `.mc-chip` — Base badge/chip
- Size: `.is-sm`, `.is-lg`
- Status: `.is-status-{queued,running,retrying,blocked,completed,claimed}`
- Priority: `.is-priority-{urgent,high,medium,low}`
- Event: `.is-event-{agent,system,error,state-change}`
- Interactive: `.is-interactive` with `.is-active`

**Buttons:**

- `.mc-button` — Base button
- Size: `.is-sm`, `.is-lg`
- Style: `.is-primary`, `.is-ghost`
- Icon: `.is-icon-only` with `.mc-button-icon`
- Segmented: `.mc-button-segment` with `.is-active`
- Command: `.is-command` with `.mc-button-hint`

**Rail/List Items:**

- `.mc-list-item`, `.mc-rail-item` — Selectable row items
- Size: `.is-sm`, `.is-md`, `.is-lg`
- Font: `.is-mono`, `.is-body`
- Icon: `.has-icon` with `.mc-list-item-icon`
- Status: `.is-status-{queued,running,retrying,blocked,completed,claimed}`

**Layout:**

- `.page` — Page container
- `.page-section` — Page section with `.is-primary` variant
- `.page-header` — Page header with `.is-primary` variant
- `.page-body` — Page body container
- `.mc-layout` — Mission control layouts: `.is-split`, `.is-triple`, `.is-command`
- `.mc-lane` — Operational lane with `.is-primary`, `.is-sidebar` variants
- `.mc-strip` — Horizontal strip with status variants

**Code/Log Panels:**

- `.mc-code-panel`, `.mc-log-panel`, `.mc-raw-panel` — Code display surfaces
- `.mc-code-block` — Inline code block
- `.mc-log-row` — Log entry row

### CSS Variables

**Colors:**

- `--color-copper-{50-800}` — Copper brand scale
- `--status-{queued,claimed,running,retrying,blocked,completed,pending-change}` — Semantic status colors

**Theme Tokens:**

- `--bg-canvas` / `--bg-surface` / `--bg-elevated` / `--bg-muted`
- `--border-stitch` / `--border-subtle` / `--border-strong`
- `--text-primary` / `--text-secondary` / `--text-muted` / `--text-accent`

**Typography:**

- `--font-heading` — Space Grotesk
- `--font-body` — Manrope
- `--font-mono` — IBM Plex Mono
- `--text-2xs` (10px) through `--text-hero` (clamp 28-42px)

**Spacing:**

- `--space-1` (4px) through `--space-10` (40px) — Base scale
- `--space-12` (48px) through `--space-24` (96px) — Generous section gaps

**Control Heights:**

- `--control-height-xs` (28px) through `--control-height-xl` (44px)

**Icon Sizes:**

- `--icon-size-xs` (12px) through `--icon-size-xl` (24px)

**Stroke Widths:**

- `--stroke-default` (1px) / `--stroke-accent` (2px) / `--stroke-emphasis` (3px)
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
