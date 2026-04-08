---
paths:
  - "frontend/**/*"
---

# Design System Reference

Full token definitions, component vocabulary, and brand guidelines are in `.impeccable.md`. Read it before any UI work.

## Key Conventions

- **Component classes**: `mc-*` prefix (e.g., `mc-card`, `mc-badge`, `mc-button`)
- **Color system**: copper brand (`#B87333`), semantic status colors, light/dark themes
- **Typography**: system font stack, 4-level heading hierarchy
- **Tokens**: all values defined as CSS custom properties — do not use hardcoded color/spacing values

## Status Colors

Use semantic color tokens, not raw values:

- `var(--status-running)` — in-progress state
- `var(--status-success)` — completed successfully
- `var(--status-error)` — failed state
- `var(--status-warning)` — degraded/warning state
