# Symphony Orchestrator — Stitch Iteration Playbook

## Generation Order

1. Generate `web-shell` first.
2. Generate current primary web pages in this order:
   - `web-overview`
   - `web-queue-board`
   - `web-issue-detail`
   - `web-logs`
   - `web-runs`
   - `web-planner`
   - `web-config-overlay`
   - `web-secrets`
   - `web-observability`
   - `web-settings`
3. Generate current detail states:
   - `web-queue-issue-drawer`
   - `web-runs-compare`
   - `web-attempt-detail`
   - `web-planner-execute-modal`
   - `web-config-delete-modal`
   - `web-secrets-add-modal`
   - `web-secrets-delete-modal`
   - `web-observability-raw-drawer`
4. Generate future near-term web pages.
5. Translate the current web pages into app/mobile.
6. Generate future app/mobile pages.

## Stitch Workflow

### First Pass

- Start broad and screen-level.
- Use the prompt exactly as written in the prompt files.
- Do not try to perfect the first generation.
- In early passes, prefer structural correctness over decorative polish.

### Second Pass

- Run one major refinement at a time.
- Prioritize:
  - hierarchy
  - scan speed
  - action clarity
  - status readability
  - empty states
  - dense technical tables and timelines

### Third Pass

- Use variations for exploration where the layout feels too ordinary.
- Recommended pattern:
  - 3 web shell variations
  - 2 overview variations
  - 3 queue variations
  - 2 observability variations
  - 2 future live-feed variations
  - 2 cost-analytics variations

## Creative Range Guidance

- `Refined`:
  - shared shell
  - current screens that already have a strong IA in code
  - detail states and modals
- `Creative`:
  - future pages
  - live feed
  - cost analytics
  - automation center
  - browser side panel

## Cross-Screen Edit Prompts

Use these after the first generation to make the system feel coherent.

### Hierarchy Pass

```text
Apply a hierarchy pass across all current Symphony dashboard screens. Increase the contrast between page title, section title, metric value, label, and supporting text. Make status chips and operator actions easier to scan without introducing loud fills or generic SaaS styling.
```

### Density Pass

```text
Increase information density across the Symphony dashboard while keeping the layout breathable. Reduce wasted chrome, tighten card spacing, improve table row rhythm, and make technical data easier to compare at a glance.
```

### Navigation Consistency Pass

```text
Align the navigation behavior and visual hierarchy across the Symphony shell, Queue, Issue Detail, Logs, Runs, Planner, Config, Secrets, Observability, and Settings. Make the app feel like one coherent control plane with clear drill-in paths.
```

### Action Hierarchy Pass

```text
Refine the action hierarchy across all Symphony screens. Primary actions should feel unmistakable, secondary actions should stay available but quieter, and destructive actions should feel serious and explicit. Do this without relying on bright warning colors except where the action or data truly warrants it.
```

### Typography Pass

```text
Refine typography across the Symphony dashboard. Make Space Grotesk headings feel compact and engineered, Manrope body copy calmer and more readable, and IBM Plex Mono more intentional for IDs, timestamps, logs, and metrics.
```

## Per-Screen Fix Patterns

### If Overview feels generic

```text
Rework the Mission Control overview so it feels like an operator console, not a dashboard template. Strengthen the distinction between live status, intervention risk, and passive historical information.
```

### If Queue feels like generic kanban

```text
Make the Queue board more specific to Symphony. Increase the sense of workflow pressure, retry state, blocked work, and machine context inside issue cards and column headers.
```

### If Issue Detail feels too long

```text
Refactor the Symphony Issue Detail page to improve scan speed. Keep all existing sections, but tighten vertical rhythm, improve section ordering, and make model-routing and attempts easier to parse quickly.
```

### If Logs feels noisy

```text
Reduce noise in the Symphony Logs screen. Improve timestamp alignment, event-type hierarchy, payload affordances, and long-session readability while preserving technical depth.
```

### If Runs compare is weak

```text
Strengthen the compare state in Symphony Run History. Make changed values more obvious, reduce redundant chrome, and make the right-side compare panel feel like a true postmortem tool.
```

### If Config or Settings feels too auto-generated

```text
Refine Symphony Config and Settings so they feel deliberately curated for operators. Preserve the technical depth, but improve grouping, labels, field rhythm, and the distinction between editable values, diff previews, and underlying config paths.
```

### If Observability becomes chart-heavy

```text
Reduce generic chart dashboard patterns in Symphony Observability. Replace vanity graphs with compact, high-signal operational widgets, source labels, anomaly emphasis, and stronger text explanations.
```

## Web To App Translation Prompts

### Shared Translation Prompt

```text
Translate these Symphony web screens into app/mobile versions. Do not simply resize the desktop layouts. Replace wide splits with stacked cards, sheets, segmented controls, and guided steps. Keep the same Copper Signal identity and operator tone.
```

### Monitoring Translation Prompt

```text
Translate Mission Control, Queue, Logs, Runs, Attempt Detail, and Observability into a monitoring-first mobile app. Prioritize scan speed, thumb reach, and compressed technical readability.
```

### Admin Translation Prompt

```text
Translate Planner, Config Overlay, Secrets, and Settings into focused mobile administration flows. Use guided steps, bottom sheets, and curated grouping instead of desktop multi-column editing.
```

## Acceptance Checklist

- Shared shell feels coherent before page-level polish
- Every current page in the screen manifest has at least one generated screen
- Current detail states are represented, not hand-waved away
- Future screens are clearly labeled as future in Stitch project naming
- App/mobile screens are translated, not resized
- Status colors remain semantically stable across all surfaces
- IBM Plex Mono appears wherever machine data matters
- The final result feels like a premium local operator console, not a generic AI dashboard
