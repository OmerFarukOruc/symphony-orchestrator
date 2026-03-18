---
name: visual-verify
description: >
  Visually verify Symphony dashboard and logs UI changes using agent-browser
  with Brave in headed mode. Use when the user asks to verify UI, QA the
  dashboard, dogfood the app, take screenshots, compare before and after,
  check CSS or layout changes, inspect visual regressions, or exercise browser
  automation against Symphony's local web UI. Also use after editing
  dashboard-template.ts, logs-template.ts, or other dashboard-facing UI code.
  Do not use this skill for generic browser automation, non-Symphony sites,
  or backend-only debugging without a visual verification goal.
compatibility: >
  Requires local Symphony UI at http://127.0.0.1:4000, agent-browser,
  brave-browser, and the repo-root agent-browser.json config.
metadata:
  author: symphony
  version: 1.1.0
---

# Visual Verify

Use this skill for Symphony's current web UI surface only:

- Dashboard at `/`
- Logs page at `/logs/:issue_identifier`

Default to **Quick Verify** for a targeted change. Escalate to **Full QA** when the change is broad, release-facing, or the user explicitly wants a dogfood pass.

## Prerequisites

Confirm these first:

1. `agent-browser` is installed: `command -v agent-browser`
2. `brave-browser` is available: `command -v brave-browser`
3. `agent-browser.json` exists at project root (configures Brave + headed mode)
4. Symphony UI is running at `http://127.0.0.1:4000`

If the UI is not running:

```bash
npm run dev -- ./WORKFLOW.example.md --port 4000
```

If the request is not about visual confirmation, screenshots, layout, interaction, or browser-driven QA, do not use this skill.

## Quick Verify

Use this for a focused change to the dashboard or logs page. This is the default path.

```
1. Baseline    → Screenshot before changes
2. Change      → Apply or inspect the UI change
3. Reload      → Refresh the page
4. Capture     → Screenshot after changes
5. Diff        → Pixel comparison
6. Decide      → Pass or fail with evidence
```

### 1. Capture a baseline

```bash
mkdir -p archive/screenshots
agent-browser open http://127.0.0.1:4000
agent-browser wait --load networkidle
agent-browser screenshot --annotate archive/screenshots/before.png
```

The `--annotate` flag overlays numbered labels (`[1]`, `[2]`, …) on interactive elements. Each label maps to a ref (`@e1`, `@e2`) for interaction.

For logs-page verification, navigate from the dashboard into a real issue log view before taking the baseline for that page.

### 2. Reload and capture

```bash
agent-browser reload
agent-browser wait --load networkidle
agent-browser screenshot --annotate archive/screenshots/after.png
```

### 3. Run a pixel diff

```bash
agent-browser diff screenshot --baseline archive/screenshots/before.png -o archive/screenshots/diff.png
```

Output includes a mismatch percentage and a diff image with changed pixels highlighted in red.

### 4. Make the call

- **0% mismatch** — no visible change (may indicate the change didn't apply)
- **Small mismatch in the expected area** — likely pass
- **Large or unexpected mismatch** — investigate, may indicate a regression
- **Console errors or page errors** — fail, even if the diff looks small

Use `agent-browser errors` and `agent-browser console` if the screenshot result is ambiguous.

### 5. Clean up

```bash
agent-browser close
```

## Full QA

Use this after major UI changes, before releases, or when the user asks to "dogfood" or "QA the dashboard".

### 1. Initialize

```bash
mkdir -p dogfood-output/screenshots dogfood-output/videos
cp skills/visual-verify/templates/verification-report-template.md dogfood-output/report.md
agent-browser --session symphony-qa open http://127.0.0.1:4000
agent-browser --session symphony-qa wait --load networkidle
```

### 2. Orient

Start from the dashboard, then verify the logs page for at least one issue if the change could affect cross-page navigation or issue detail behavior. Consult `references/dashboard-map.md` for the current selector map.

```bash
agent-browser --session symphony-qa screenshot --annotate dogfood-output/screenshots/dashboard-main.png
agent-browser --session symphony-qa snapshot -i
agent-browser --session symphony-qa errors
agent-browser --session symphony-qa console
```

### 3. Explore

At each meaningful state or interaction:

```bash
agent-browser --session symphony-qa snapshot -i
agent-browser --session symphony-qa screenshot --annotate dogfood-output/screenshots/{page-name}.png
agent-browser --session symphony-qa errors
agent-browser --session symphony-qa console
```

Check these areas:

- Kanban board: all four columns render, cards display correctly
- Detail panel: opens on card click, shows all fields, model routing works
- Filter nav: All/Running/Retrying/Completed filters work
- Search: filters cards by text
- Status bar: token counts, uptime, rate limit display
- Logs page: title, status badge, filters, counts, copy action, and refresh behavior work
- Responsive behavior: resize viewport and check layout stability

For responsive testing:

```bash
agent-browser --session symphony-qa set viewport 1920 1080
agent-browser --session symphony-qa screenshot dogfood-output/screenshots/desktop.png
agent-browser --session symphony-qa set viewport 768 1024
agent-browser --session symphony-qa screenshot dogfood-output/screenshots/tablet.png
agent-browser --session symphony-qa set viewport 375 812
agent-browser --session symphony-qa screenshot dogfood-output/screenshots/mobile.png
```

### 4. Document issues

Document issues as you find them. Do not batch them for later.

**For interactive bugs** (require interaction to reproduce):

```bash
agent-browser --session symphony-qa record start dogfood-output/videos/issue-{NNN}-repro.webm
# Walk through steps with sleep 1 between actions
agent-browser --session symphony-qa screenshot dogfood-output/screenshots/issue-{NNN}-step-1.png
sleep 1
# ... perform action ...
sleep 1
agent-browser --session symphony-qa screenshot --annotate dogfood-output/screenshots/issue-{NNN}-result.png
sleep 2
agent-browser --session symphony-qa record stop
```

**For static/visible-on-load bugs** (typos, layout glitches):

```bash
agent-browser --session symphony-qa screenshot --annotate dogfood-output/screenshots/issue-{NNN}.png
```

Append each issue to `dogfood-output/report.md` immediately with:

- severity
- page
- summary
- expected vs actual behavior
- screenshot or video evidence

Consult `references/issue-taxonomy.md` for severity levels.

### 5. Wrap up

```bash
agent-browser --session symphony-qa close
```

Update the report summary to reflect actual issue counts and severity breakdown.

## Evidence Rules

- Prefer one clear screenshot over many low-signal captures.
- If the issue is interactive, capture both the triggering step and the result.
- Name whether the finding is on `/` or `/logs/:issue_identifier`.
- If the change is supposed to affect a specific selector or control, name it in the report.
- Report pass or fail from evidence, not vibes.

## Ref Lifecycle

Refs (`@e1`, `@e2`, …) are invalidated when the page changes. Always re-snapshot after:

- Clicking links or buttons that navigate
- Form submissions
- Modal opens/closes
- Any dynamic content loading

```bash
agent-browser click @e5              # Navigates to new content
agent-browser snapshot -i            # MUST re-snapshot
agent-browser click @e1              # Now use new refs
```

## Snapshot Tips

- `snapshot -i` — interactive elements only (buttons, inputs, links)
- `snapshot -i -C` — include cursor-interactive elements (custom clickable divs)
- `snapshot -c` — compact (remove empty structural elements)
- `snapshot -s "#detailPanel"` — scope to a specific element

## DOM-Level Diffing

For non-visual changes (accessibility, structure), use snapshot diffing:

```bash
agent-browser snapshot -i            # Take baseline
agent-browser click @e2              # Perform action
agent-browser diff snapshot          # See DOM changes (+ additions, - removals)
```

## Session Cleanup

Always close sessions when done to avoid leaked daemons:

```bash
agent-browser close                         # Default session
agent-browser --session symphony-qa close   # Named session
```

## References

| Reference | When to read |
|---|---|
| [references/dashboard-map.md](references/dashboard-map.md) | When you need current routes, selectors, or key UI elements for dashboard and logs verification |
| [references/command-reference.md](references/command-reference.md) | When you need the full agent-browser command catalog |
| [references/issue-taxonomy.md](references/issue-taxonomy.md) | When categorizing issues found during Full QA |
