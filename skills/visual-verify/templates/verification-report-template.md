# Visual Verification Report

**Target:** Symphony Dashboard (`http://127.0.0.1:4000`)
**Date:** YYYY-MM-DD
**Session:** symphony-qa
**Type:** Quick Verify / Full QA (delete one)

## Prerequisites

- [ ] Preflight script passed (`bash skills/visual-verify/scripts/preflight.sh`)
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
- Dashboard version: (run `git rev-parse --short HEAD`)
- MASTER_KEY: set (do not log the value)
- LINEAR_API_KEY: set/unset
- Workflow file: WORKFLOW.example.md
- Port: 4000
- Node version: (run `node --version`)

## Baseline

- Screenshot: `screenshots/dashboard-main.png`
- Console errors at load: (none / list)

## Areas Verified

### Page Load
- [ ] Page loads without JavaScript errors
- [ ] All expected elements visible
- [ ] Content renders within 3 seconds

### Kanban Board
- [ ] All four columns visible and labeled
- [ ] Cards display correctly
- Screenshot: `screenshots/kanban-board.png`

### Detail Panel
- [ ] Opens on card click
- [ ] All fields populate
- [ ] Close button works
- Screenshot: `screenshots/detail-panel.png`

### Filter Navigation
- [ ] All/Running/Retrying/Completed filters work
- Screenshots: `screenshots/filter-*.png`

### Search
- [ ] Search filters cards by text
- Screenshot: `screenshots/search-active.png`

### Status Bar
- [ ] Token counts, uptime, rate limit display
- Screenshot: `screenshots/status-bar.png`

### Logs Page
- [ ] Title and status badge populate
- [ ] Filter buttons work
- [ ] Copy Logs button works
- [ ] Auto-scroll toggle works
- Screenshot: `screenshots/logs-page.png`

### Responsive
- [ ] Desktop (1920x1080): all columns visible
- [ ] Tablet (768x1024): usable layout
- [ ] Mobile (375x812): content accessible
- Screenshots: `screenshots/viewport-*.png`

## Findings

### ISSUE-001

- **Severity:** Critical / High / Medium / Low / Infrastructure
- **Page:** Dashboard / Logs
- **Element:** (ID or selector)
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
