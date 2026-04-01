# Visual Verification Report

**Target:** Risoluto UI (`http://127.0.0.1:4000`)
**Date:** YYYY-MM-DD
**Session:** risoluto-qa
**Type:** Quick Verify / Full QA (delete one)

## Prerequisites

- [ ] Preflight script passed (`bash .claude/skills/visual-verify/scripts/preflight.sh`)
- [ ] Server responding at target URL
- [ ] No console errors on initial page load

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| Infrastructure | 0 |
| **Total** | **0** |

**Verdict:** PASS / CONDITIONAL PASS / FAIL (delete two)

## Environment

- Browser: Bundled Chromium (headed mode via agent-browser)
- Viewport: 1280x720 (default)
- Commit: (run `git rev-parse --short HEAD`)
- MASTER_KEY: set (do not log the value)
- LINEAR_API_KEY: set/unset
- Port: 4000
- Node version: (run `node --version`)

## Baseline

- Screenshot: `screenshots/overview-main.png`
- Console errors at load: (none / list)

## Areas Verified

### Overview (`/`)
- [ ] Hero band renders with live metrics
- [ ] Attention zone lists blocking issues
- [ ] Collapsible sections toggle
- Screenshot: `screenshots/overview-hero.png`

### Queue / Kanban Board (`/queue`)
- [ ] Board renders with columns and cards
- [ ] Column dots show correct status colors
- [ ] Cards display identifier, title, labels
- Screenshot: `screenshots/kanban-board.png`

### Issue Inspector
- [ ] Opens as drawer on card click
- [ ] Identifier, title, summary strip populate
- [ ] Close button works
- Screenshot: `screenshots/inspector-drawer.png`

### Logs Page (`/logs/:id`)
- [ ] Breadcrumb and header render
- [ ] Type filter chips toggle
- [ ] Log rows display with color-coded stripes
- [ ] Search filters logs
- [ ] Copy button works
- Screenshot: `screenshots/logs-page.png`

### Setup Wizard (`/setup`)
- [ ] Step indicators render
- [ ] Steps are navigable
- Screenshot: `screenshots/setup-wizard.png`

### Settings (`/settings`)
- [ ] Page renders
- [ ] Config sections display
- Screenshot: `screenshots/settings-page.png`

### App Shell
- [ ] Sidebar navigation works
- [ ] Header brand and command palette render
- [ ] Theme toggle works

### Responsive
- [ ] Desktop (1920x1080): full layout
- [ ] Tablet (768x1024): usable layout
- [ ] Mobile (375x812): content accessible
- Screenshots: `screenshots/viewport-*.png`

### Theme
- [ ] Light mode renders correctly
- [ ] Dark mode renders correctly
- Screenshots: `screenshots/theme-*.png`

## Findings

### ISSUE-001

- **Severity:** Critical / High / Medium / Low / Infrastructure
- **Page:** (route path, e.g. `/queue`)
- **Element:** (class or selector, e.g. `.kanban-card`)
- **Summary:** (one-line description)
- **Screenshots:**
  - Before: `screenshots/issue-001-before.png`
  - After: `screenshots/issue-001-after.png`
  - Diff: `screenshots/issue-001-diff.png`
- **Repro Video:** `videos/issue-001-repro.webm` (or N/A for static issues)
- **Repro Steps:**
  1. Navigate to ...
  2. Click ...
  3. Observe ...
- **Expected:** (what should happen)
- **Actual:** (what actually happens)

(Copy this template for each additional issue)

## Conclusion

- [ ] All changes verified successfully
- [ ] Issues found — see findings above
- [ ] Pixel diff: X% mismatch (expected / unexpected)
