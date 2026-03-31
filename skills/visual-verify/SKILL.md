---
name: visual-verify
description: >
  TRIGGER MANDATORILY after ANY edit to dashboard-template.ts, logs-template.ts,
  or any file that affects Risoluto's web UI (CSS, templates, HTML generation,
  frontend routes, or static assets). Also trigger when the user mentions UI
  verification, screenshots, dashboard QA, dogfooding, visual regression, layout
  issues, CSS changes, or browser testing — even implicitly (e.g., "check the UI",
  "does it look right", "verify the dashboard"). Do NOT use for generic browser
  automation, non-Risoluto sites, or backend-only debugging without a visual goal.
  This skill is NOT optional after UI changes — it is part of the definition of done.
compatibility: >
  Requires local Risoluto UI at http://127.0.0.1:4000, agent-browser
  (with bundled Chrome via `agent-browser install`), MASTER_KEY env var,
  LINEAR_API_KEY env var, and the repo-root agent-browser.json config.
metadata:
  author: risoluto
  version: 2.1.0
---

# Visual Verify

Use this skill for Risoluto's current web UI surface only:

- Dashboard at `/`
- Logs page at `/logs/:issue_identifier`

Default to **Quick Verify** for a targeted change. Escalate to **Full QA** when the change is broad, release-facing, or the user explicitly wants a dogfood pass.

## Prerequisites

### Automated preflight

Run the preflight script first — it checks everything at once:

```bash
bash skills/visual-verify/scripts/preflight.sh
```

If preflight passes, skip to the workflow. If it fails, fix the reported issues before continuing.

### Manual checks (if preflight is unavailable)

1. **agent-browser is installed:** `command -v agent-browser`
2. **Bundled Chrome is installed:** `agent-browser install` (downloads Chromium for agent-browser)
3. **agent-browser.json** exists at project root (configures headed mode)
4. **Required environment variables** are set:
   - `MASTER_KEY` — used by SecretsStore for encrypted config (any non-empty value works for local QA, e.g. `MASTER_KEY="local-qa-key"`)
   - `LINEAR_API_KEY` — required for workflow polling
   - `LINEAR_PROJECT_SLUG` — optional but recommended
5. **Risoluto UI is running** at `http://127.0.0.1:4000`

### Starting the server

If the UI is not running, start it with **all required env vars**:

```bash
MASTER_KEY="${MASTER_KEY:-local-qa-key}" npm run dev -- ./WORKFLOW.example.md --port 4000
```

Wait for the server to respond before proceeding:

```bash
# Health check — retries for up to 30 seconds
for attempt in $(seq 1 15); do
  curl -sf http://127.0.0.1:4000 > /dev/null 2>&1 && echo "Server ready" && break
  sleep 2
done
```

> **Note:** Use `WORKFLOW.example.md` for QA runs, not `WORKFLOW.md`, to avoid interfering with real Linear issues.

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
agent-browser screenshot --annotate docs/archive/screenshots/before.png
```

The `--annotate` flag overlays numbered labels (`[1]`, `[2]`, …) on interactive elements. Each label maps to a ref (`@e1`, `@e2`) for interaction.

For logs-page verification, navigate from the dashboard into a real issue log view before taking the baseline for that page.

### 2. Reload and capture

```bash
agent-browser reload
agent-browser wait --load networkidle
agent-browser screenshot --annotate docs/archive/screenshots/after.png
```

### 3. Run a pixel diff

```bash
agent-browser diff screenshot --baseline docs/archive/screenshots/before.png -o docs/archive/screenshots/diff.png
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
mkdir -p docs/archive/dogfood-output/screenshots docs/archive/dogfood-output/videos
```

Create `docs/archive/dogfood-output/report.md` from the template at `skills/visual-verify/templates/verification-report-template.md`. Fill in the date, session name, and environment info.

Open the browser session:

```bash
agent-browser --session risoluto-qa open http://127.0.0.1:4000
agent-browser --session risoluto-qa wait --load networkidle
```

Confirm the page loaded by checking for errors immediately:

```bash
agent-browser --session risoluto-qa errors
agent-browser --session risoluto-qa console
```

If errors appear at this stage, record them as **infrastructure issues** in the report and decide whether to continue or abort.

### 2. Orient

Start from the dashboard. Take a baseline screenshot and interactive snapshot:

```bash
agent-browser --session risoluto-qa screenshot --annotate docs/archive/dogfood-output/screenshots/dashboard-main.png
agent-browser --session risoluto-qa snapshot -i
agent-browser --session risoluto-qa errors
agent-browser --session risoluto-qa console
```

Consult `references/dashboard-map.md` for the current selector map.

### 3. Systematic Exploration

Work through each area in order. At each step: screenshot, snapshot, check errors.

#### Step 3a — Kanban Board

Verify all four columns render and cards display correctly:

```bash
agent-browser --session risoluto-qa screenshot --annotate docs/archive/dogfood-output/screenshots/kanban-board.png
agent-browser --session risoluto-qa snapshot -i
```

Check: `#queuedColumn`, `#runningColumn`, `#retryingColumn`, `#completedColumn` exist and show appropriate content.

#### Step 3b — Detail Panel

Click a card to open the detail panel:

```bash
agent-browser --session risoluto-qa snapshot -i
# Use the @ref from snapshot to click a card
agent-browser --session risoluto-qa click @e<N>
agent-browser --session risoluto-qa wait 1000
agent-browser --session risoluto-qa snapshot -i
agent-browser --session risoluto-qa screenshot --annotate docs/archive/dogfood-output/screenshots/detail-panel.png
agent-browser --session risoluto-qa errors
```

Check: `#detailPanel` is visible, fields populated (`#detailTitle`, `#detailIdentifier`, `#detailBadges`).

Close the panel:

```bash
agent-browser --session risoluto-qa click "#closeDetailButton"
agent-browser --session risoluto-qa wait 500
```

#### Step 3c — Filter Navigation

Test each filter button:

```bash
# Test Running filter
agent-browser --session risoluto-qa click ".filter-button[data-filter='running']"
agent-browser --session risoluto-qa wait 500
agent-browser --session risoluto-qa screenshot docs/archive/dogfood-output/screenshots/filter-running.png

# Test Retrying filter
agent-browser --session risoluto-qa click ".filter-button[data-filter='retrying']"
agent-browser --session risoluto-qa wait 500
agent-browser --session risoluto-qa screenshot docs/archive/dogfood-output/screenshots/filter-retrying.png

# Test Completed filter
agent-browser --session risoluto-qa click ".filter-button[data-filter='completed']"
agent-browser --session risoluto-qa wait 500
agent-browser --session risoluto-qa screenshot docs/archive/dogfood-output/screenshots/filter-completed.png

# Reset to All
agent-browser --session risoluto-qa click ".filter-button[data-filter='all']"
agent-browser --session risoluto-qa wait 500
```

#### Step 3d — Search

```bash
agent-browser --session risoluto-qa fill "#searchInput" "test"
agent-browser --session risoluto-qa wait 500
agent-browser --session risoluto-qa screenshot docs/archive/dogfood-output/screenshots/search-active.png
agent-browser --session risoluto-qa fill "#searchInput" ""
```

#### Step 3e — Status Bar

```bash
agent-browser --session risoluto-qa screenshot --annotate -s "section" docs/archive/dogfood-output/screenshots/status-bar.png
```

Check: `#queuedCount`, `#runningCount`, `#retryingCount`, `#completedCount`, `#uptimeValue`, `#rateLimitValue` are visible.

#### Step 3f — Logs Page

Navigate to a logs page (use an issue identifier from a card, or attempt a known route):

```bash
agent-browser --session risoluto-qa snapshot -i
# Click the logs link in the detail panel, or navigate directly:
# agent-browser --session risoluto-qa open http://127.0.0.1:4000/logs/<issue_identifier>
agent-browser --session risoluto-qa wait --load networkidle
agent-browser --session risoluto-qa screenshot --annotate docs/archive/dogfood-output/screenshots/logs-page.png
agent-browser --session risoluto-qa snapshot -i
agent-browser --session risoluto-qa errors
agent-browser --session risoluto-qa console
```

Check: `#issueTitle`, `#statusBadge`, `#eventCount`, `#shownCount`, `.filter-btn`, `#copyLogsBtn`, `#autoScrollToggle`.

Navigate back:

```bash
agent-browser --session risoluto-qa click ".back-link"
agent-browser --session risoluto-qa wait --load networkidle
```

#### Step 3g — Responsive Testing

```bash
agent-browser --session risoluto-qa set viewport 1920 1080
agent-browser --session risoluto-qa screenshot docs/archive/dogfood-output/screenshots/viewport-desktop.png

agent-browser --session risoluto-qa set viewport 768 1024
agent-browser --session risoluto-qa screenshot docs/archive/dogfood-output/screenshots/viewport-tablet.png

agent-browser --session risoluto-qa set viewport 375 812
agent-browser --session risoluto-qa screenshot docs/archive/dogfood-output/screenshots/viewport-mobile.png

# Reset to default
agent-browser --session risoluto-qa set viewport 1280 720
```

#### Step 3h — Final Error Check

```bash
agent-browser --session risoluto-qa errors
agent-browser --session risoluto-qa console
```

### 4. Document issues

Document issues as you find them — do not batch them for later.

**For interactive bugs** (require interaction to reproduce):

```bash
agent-browser --session risoluto-qa record start docs/archive/dogfood-output/videos/issue-NNN-repro.webm
# Walk through steps with sleep 1 between actions
agent-browser --session risoluto-qa screenshot docs/archive/dogfood-output/screenshots/issue-NNN-step-1.png
sleep 1
# ... perform action ...
sleep 1
agent-browser --session risoluto-qa screenshot --annotate docs/archive/dogfood-output/screenshots/issue-NNN-result.png
sleep 2
agent-browser --session risoluto-qa record stop
```

**For static/visible-on-load bugs** (typos, layout glitches):

```bash
agent-browser --session risoluto-qa screenshot --annotate docs/archive/dogfood-output/screenshots/issue-NNN.png
```

Append each issue to `docs/archive/dogfood-output/report.md` immediately with:

- severity (consult `references/issue-taxonomy.md`)
- page (`/` or `/logs/:issue_identifier`)
- element (ID or selector)
- summary
- expected vs actual behavior
- screenshot or video evidence filename

### 5. Wrap up

```bash
agent-browser --session risoluto-qa close
```

Update the report summary to reflect actual issue counts and severity breakdown. Set the overall verdict: pass (0 critical/high), conditional pass, or fail.

## Annotation-Driven QA (Agentation)

This project ships with [Agentation](https://www.agentation.com/mcp) (`agentation-mcp` MCP server) for browser-to-agent annotation feedback. Use it as a complement to Quick Verify or Full QA when you want the human to point at specific elements in the live UI.

### Prerequisites

- `agentation-mcp` is configured as an MCP server (see `opencode.json` or your agent's MCP config)
- Risoluto UI is running at `http://127.0.0.1:4000`

### Watch Mode (hands-free annotation loop)

The human annotates elements in the browser toolbar; the agent picks them up automatically:

```
1. Agent calls  agentation_watch_annotations  (blocks until annotations appear)
2. New annotations arrive → agent receives a batch
3. For each annotation:
   a. agentation_acknowledge  — mark as seen
   b. Make the code fix
   c. agentation_resolve      — mark as done (annotation disappears from browser)
4. Loop back to step 1
```

This is already wired into `AGENTS.md` — tell the agent "watch mode" and it enters this loop.

### Critique Mode (agent self-review)

The agent opens a headed browser, scrolls through the page, and creates annotations on your behalf:

```bash
# Prompt the agent with:
Critique the UI at http://127.0.0.1:4000
```

The agent will navigate the page, identify 5-8 design issues (hierarchy, spacing, typography, navigation, CTAs), and submit annotations through the toolbar. You review them in the browser and decide what to fix.

### When to use which workflow

| Workflow | Best for |
|---|---|
| Quick Verify | Single targeted change, before/after pixel diff |
| Full QA | Release readiness, broad UI changes, dogfooding |
| Watch Mode | Iterative human→agent feedback on live UI |
| Critique Mode | Agent-driven design review, catching polish issues |

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
agent-browser --session risoluto-qa close   # Named session
```

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Server won't start | Missing `MASTER_KEY` | Set `MASTER_KEY="local-qa-key"` in env before starting |
| Server won't start | Missing `LINEAR_API_KEY` | Ensure `LINEAR_API_KEY` is exported in your shell |
| Connection refused on :4000 | Server didn't start or crashed | Check `/tmp/risoluto-qa-dev.log` or terminal output for errors |
| Port already in use | Another instance running | Kill existing: `lsof -ti:4000 \| xargs kill` |
| agent-browser hangs | Stale session | Run `agent-browser session list` then close stale sessions |
| Screenshots are empty/blank | Page not loaded | Add `agent-browser wait --load networkidle` before screenshot |
| `zsh: read-only variable` | Used `status` as var name | Use `rc` or `result` — `status` is reserved in zsh |
| `snapshot` returns no refs | All elements are non-interactive | Use `snapshot` without `-i`, or use `snapshot -i -C` |

## Agent Compatibility

This skill uses **`agent-browser` CLI commands** run via bash/shell. All commands in this document are designed to be run in a terminal.

**Shell compatibility:** All examples avoid zsh reserved words (`status`, `precmd`, `preexec`). Loop variables use `attempt`, `rc`, `ok` instead of `status`.

**File operations:** When the skill says "create a file from the template", use whatever file-creation tool your agent provides (bash `cp`, `write_to_file`, `apply_patch`, etc.). The important thing is that the file gets created with the template content.

**Screenshot paths:** Quick Verify uses `docs/archive/screenshots/` (matches `agent-browser.json`'s `screenshotDir`). Full QA uses `docs/archive/dogfood-output/screenshots/` (explicitly set in each command).

## References

| Reference | When to read |
|---|---|
| [references/dashboard-map.md](references/dashboard-map.md) | When you need current routes, selectors, or key UI elements for dashboard and logs verification |
| [references/command-reference.md](references/command-reference.md) | When you need the full agent-browser command catalog |
| [references/issue-taxonomy.md](references/issue-taxonomy.md) | When categorizing issues found during Full QA |
