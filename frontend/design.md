# Symphony Precision — Design System

Theme: **Symphony Precision** — copper-accented, dark-mode-first, sharp-cornered operational command interface.

## Core Principles

1. **Operational density** — pack information without clutter
2. **Copper as signal** — `#C96E4A` accent marks active/primary states only
3. **Status speaks first** — every issue and attempt leads with its status
4. **Dark-first precision** — `#0C1016` canvas, `#121824` surfaces
5. **Sharp geometry** — 0px corners everywhere, no exceptions
6. **Progressive disclosure** — overview → detail, never all at once

## Palette

| Role | Hex | Usage |
|------|-----|-------|
| Primary (Copper) | `#C96E4A` | Active states, primary actions, focus rings |
| Secondary (Slate) | `#1E293B` | Elevated surfaces, cards, sidebar bg |
| Tertiary (Blue) | `#4F7CFF` | Links, informational badges, queued status |
| Neutral (Near-black) | `#0C1016` | Canvas, deepest background |

### Status Colors
| Status | Hex |
|--------|-----|
| Queued | `#4F7CFF` |
| Claimed | `#7C62D6` |
| Running | `#2F9E44` |
| Retrying | `#D98A1C` |
| Blocked | `#D94841` |
| Completed | `#7B8797` |

## Typography

- **UI**: Inter 400/500/600/700/800 (Google Fonts CDN)
- **Code/Mono**: system monospace (`ui-monospace, "SF Mono", …`)

## Spacing

Base unit: 4px. Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80.

## Elevation

No drop shadows. Elevation is achieved via:
- Border color shifts (subtle → default → strong)
- Background color steps (canvas → surface → elevated → muted)

## Key Dimensions

- Header height: 48px
- Sidebar collapsed: 48px, expanded: 220px
- Icons: 20×20
- Minimum button height: 34px

## Component Patterns

- **Status chips**: 12% opacity colored backgrounds, no radius
- **Active sidebar item**: copper 2px left border
- **Toast**: left 3px accent border, stacked bottom-right
- **Form inputs**: copper focus ring via box-shadow
- **Toggles**: square track, copper when active
- **Keycaps**: bordered inline badges for keyboard shortcuts
- **Gauge bars**: 6px horizontal bars for resource metrics
