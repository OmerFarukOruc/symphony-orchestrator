# Interaction Taxonomy — Surface Harvest QA

This document defines what "test every interaction" means for each UI element type found in Risoluto. When testing a surface, look up the element types present and execute every applicable atomic interaction.

Not every interaction applies to every instance — use judgment. A disabled button doesn't need a double-click test. A readonly field doesn't need XSS payloads.

## Element Types

### Button

| Interaction | How to test | What to check |
|---|---|---|
| Click | `click @eN` | Expected action fires, no console errors |
| Double-click | `dblclick @eN` | No duplicate action (idempotency) |
| Keyboard Enter | `focus @eN` then `press Enter` | Same result as click |
| Keyboard Space | `focus @eN` then `press Space` | Same result as click |
| Hover | `hover @eN` | Tooltip appears (if defined), cursor changes |
| Focus ring | `press Tab` to reach button | Visible focus indicator, meets WCAG contrast |
| Disabled state | Check `is enabled @eN` | Button is non-interactive when conditions aren't met |

### Link

| Interaction | How to test | What to check |
|---|---|---|
| Click | `click @eN` | Navigates to expected route or opens external URL |
| Keyboard Enter | `focus @eN` then `press Enter` | Same as click |
| Hover | `hover @eN` | Underline or color change, cursor: pointer |
| Focus ring | Tab to link | Visible focus indicator |
| External link | Check `get attr @eN target` | Opens in new tab (`_blank`), has `noopener` |

### Text Input

| Interaction | How to test | What to check |
|---|---|---|
| Focus | `click @eN` or `focus @eN` | Input gains focus ring, placeholder visible |
| Type valid data | `fill @eN "Fix login timeout"` | Value accepted, no validation errors |
| Type empty + submit | `fill @eN ""` then submit form | Validation message appears (if required) |
| Type boundary length | `eval` to fill with 1000+ chars | Input handles overflow (truncates, scrolls, or rejects) |
| Type special chars | `fill @eN "<script>alert(1)</script>"` | Value is sanitized or escaped, no XSS |
| Type unicode/emoji | `fill @eN "Test issue title"` | Renders correctly, no encoding errors |
| Paste | `eval` to set clipboard then `press Control+v` | Same as typing |
| Clear | `press Control+a` then `press Delete` | Input cleared, placeholder reappears |
| Blur validation | `fill @eN "invalid"` then `click` elsewhere | Validation fires on blur (if applicable) |

### Textarea

Same as Text Input, plus:

| Interaction | How to test | What to check |
|---|---|---|
| Multi-line | Type with `\n` chars | Line breaks render correctly |
| Resize handle | Check if resize is enabled via styles | Drag handle works (if applicable) |

### Select / Dropdown

| Interaction | How to test | What to check |
|---|---|---|
| Click to open | `click @eN` | Dropdown panel opens |
| Arrow key navigation | `press ArrowDown` / `press ArrowUp` | Highlight moves through options |
| Enter to select | `press Enter` on highlighted option | Option selected, dropdown closes |
| Escape to close | `press Escape` | Dropdown closes, previous value retained |
| Mouse select | Click on option element | Option selected |

### Checkbox

| Interaction | How to test | What to check |
|---|---|---|
| Click toggle | `click @eN` | State toggles between checked/unchecked |
| Keyboard Space | `focus @eN` then `press Space` | Same as click |
| Label click | Click associated label element | Checkbox toggles |
| Initial state | `is checked @eN` | Correct initial state |

### Search Input

| Interaction | How to test | What to check |
|---|---|---|
| Type + debounce | `type @eN "search term"` then `wait 500` | Results filter after debounce period |
| Clear | Clear input | Results reset to unfiltered state |
| Empty results | Search for nonsense term | Empty state message appears |
| Result highlight | Search for matching term | Matching items shown, non-matching hidden |

### Filter Chips

| Interaction | How to test | What to check |
|---|---|---|
| Click to toggle | `click @eN` | Chip toggles active/inactive, list filters |
| Active state visual | Check CSS classes after click | Active chip has distinct styling |
| Clear all | Click all active chips off, or clear button | All filters removed, full list shown |
| Combination | Activate multiple filters | Filters compose correctly (AND/OR as expected) |

### Collapsible Section

| Interaction | How to test | What to check |
|---|---|---|
| Click to expand | `click @eN` (header) | Content area expands, aria-expanded toggles |
| Click to collapse | `click @eN` again | Content area collapses |
| Persisted state | Collapse, navigate away, navigate back | Section remains collapsed (localStorage) |
| Keyboard Enter | `focus @eN` then `press Enter` | Same as click |

### Modal / Dialog

| Interaction | How to test | What to check |
|---|---|---|
| Trigger open | Click trigger element | Modal appears with animation |
| Focus trap | `press Tab` repeatedly inside modal | Focus cycles within modal, doesn't escape |
| Escape to close | `press Escape` | Modal closes |
| Click outside | `click` on overlay/backdrop | Modal closes |
| Confirm button | `click` confirm | Action executes, modal closes |
| Cancel button | `click` cancel | No action, modal closes |
| Overlay backdrop | Check backdrop is visible | Semi-transparent overlay covers content behind |

### Drawer (Side Panel)

| Interaction | How to test | What to check |
|---|---|---|
| Trigger open | Click trigger element | Drawer slides in from edge |
| Close button | `click` close (X) button | Drawer slides out |
| Escape | `press Escape` | Drawer closes |
| Content interaction | Interact with elements inside drawer | All elements work as expected |

### Kanban Card

| Interaction | How to test | What to check |
|---|---|---|
| Click | `click @eN` | Opens issue inspector drawer |
| Drag start | `drag @eN @eM` | Card detaches, drop zone highlights |
| Drop | Complete drag to target column | Card moves to new column, state updates |
| Keyboard j/k | `press j` / `press k` | Focus moves between cards |
| Keyboard Enter | `press Enter` on focused card | Opens issue inspector |
| Keyboard [/] | `press [` / `press ]` | Focus moves between columns |

### Table Row

| Interaction | How to test | What to check |
|---|---|---|
| Click to select | `click` on row | Row highlights, detail panel updates |
| Expandable detail | `click` expand chevron | Row expands with detail content |
| Sort headers | `click` column header | Table re-sorts, sort indicator updates |
| Keyboard navigation | `press j` / `press k` | Selection moves between rows |

### Tab / Segment Control

| Interaction | How to test | What to check |
|---|---|---|
| Click to switch | `click @eN` | Tab activates, content panel swaps |
| Active indicator | Check styling | Active tab has distinct underline/background |
| Content swap | Switch tabs back and forth | Correct content shown for each tab |

### Toast Notification

| Interaction | How to test | What to check |
|---|---|---|
| Trigger | Perform action that shows toast | Toast appears with correct message |
| Auto-dismiss | Wait for timeout | Toast disappears after delay |
| Severity variants | Trigger success/error/info/warning toasts | Correct color/icon per severity |

### Keyboard Shortcut

| Interaction | How to test | What to check |
|---|---|---|
| Press combo | `press "<combo>"` | Expected action executes |
| No conflict | Press combo in various contexts | Doesn't conflict with browser shortcuts |
| Ignored in inputs | Focus an input, then press shortcut | Shortcut does NOT fire (types character instead) |

### SSE Live Event

| Interaction | How to test | What to check |
|---|---|---|
| Trigger event | Call API endpoint that causes event | SSE fires |
| UI update | After event, check DOM | New content appears (row, counter, toast) |
| No page reload | Verify URL didn't change | Update is in-place, not full reload |

If the event only rerenders the current store state, first mutate the relevant in-browser store data, then dispatch the CustomEvent and verify the UI changed because of the event-driven rerender.

### Confirm Dialog (native)

| Interaction | How to test | What to check |
|---|---|---|
| Trigger | Click destructive action button | `confirm()` dialog appears |
| Accept | `dialog accept` | Destructive action completes |
| Dismiss | `dialog dismiss` | Action is cancelled, state unchanged |

### Browser-local State Forcing

Use this only when a seeded or live route keeps racing past the state you need.

| Interaction | How to test | What to check |
|---|---|---|
| Install page-local harness | `eval` a narrow fetch/store/router override | Real backend state stays untouched |
| Force empty snapshot | Mutate in-browser runtime snapshot, then dispatch `state:update` | Empty-state UI appears without a full reload |
| Force retry/running issue | Seed one synthetic issue into the live board/detail store | Route-only sections render and stay stable long enough to verify |
| Force rerender event | Change store data, then dispatch the route's CustomEvent | UI updates from the new in-browser state |

### CodeMirror Editor

| Interaction | How to test | What to check |
|---|---|---|
| Type code | `click` editor, then `keyboard type "..."` | Text appears with syntax highlighting |
| Save shortcut | `press Control+s` | Template saves (API call fires) |
| Preview shortcut | `press Control+Shift+p` | Preview panel renders |
| Undo | `press Control+z` | Last edit undone |

### Copy Button

| Interaction | How to test | What to check |
|---|---|---|
| Click | `click @eN` | Content copied to clipboard |
| Verify | `eval` to read `navigator.clipboard` | Clipboard contains expected value |
| Visual feedback | Check button text/icon change | "Copied!" confirmation shown |

### Pagination

| Interaction | How to test | What to check |
|---|---|---|
| Next page | `click` next button | Content advances, page indicator updates |
| Previous page | `click` prev button | Content goes back |
| Boundary (first) | On page 1, check prev button | Prev is disabled |
| Boundary (last) | On last page, check next button | Next is disabled |
| Page indicator | Read text | Shows "Page X of Y" correctly |

### Badge / Counter

| Interaction | How to test | What to check |
|---|---|---|
| Initial count | Read badge text | Shows correct number |
| Live update | Trigger state change, check badge | Counter updates without page reload |
| Zero state | Clear all items | Badge hides or shows "0" |

## SSE Event Simulation

The frontend dispatches all SSE events as `window.CustomEvent`. To test SSE-driven surfaces without a live backend stream, inject events via `eval`:

| Surface type | CustomEvent name | Example detail payload |
|---|---|---|
| Toast (worker-failed) | `risoluto:worker-failed` | `{ error: "timeout", identifier: "NIN-1" }` |
| Toast (system-error) | `risoluto:system-error` | `{ message: "disk full" }` |
| Toast (model-updated) | `risoluto:model-updated` | `{ identifier: "NIN-1", model: "gpt-5.4" }` |
| Issue lifecycle | `risoluto:issue-lifecycle` | `{ type: "issue.completed", identifier: "NIN-1" }` |
| Notification prepend | `risoluto:notification-created` | `{ notification: { id, type, severity, title, message, read, created_at } }` |
| Workspace refresh | `risoluto:workspace-event` | `{ identifier: "NIN-1", status: "created" }` |
| Audit live row | `risoluto:audit-mutation` | `{ tableName, key, operation, actor, timestamp }` |
| Webhook health | `risoluto:webhook-health-changed` | `{ oldStatus: "ok", newStatus: "degraded" }` |
| Log entry (live mode) | `risoluto:agent-event` | `{ issueId, identifier, type, message, sessionId, timestamp }` |

**Verification:** After dispatch, wait 500ms, re-snapshot. Check for: toast visible, new row in list, counter incremented, panel re-rendered.

## State Variation Testing via Network Mocking

Use `agent-browser network route` to force loading, empty, and error states:

| State | Method | Cleanup |
|---|---|---|
| Loading skeleton | `network route "*/api/v1/<endpoint>" --delay 10000` then navigate | `network unroute` |
| Empty state | `network route "*/api/v1/<endpoint>" --body '[]'` then navigate | `network unroute` |
| Error state | `network route "*/api/v1/<endpoint>" --abort` then navigate | `network unroute` |

Always `network unroute` after screenshotting to restore normal behavior.

## Dialog Interception

Native `confirm()` dialogs block automation. Override before triggering:

```
eval 'window.confirm = () => true'   # auto-accept
# ... trigger the action that calls confirm() ...
eval 'delete window.confirm'          # restore
```

This pattern works for: template unsaved-change guard, credential reset, workspace delete, template delete.

## Adversarial Additions

For every input element (text input, textarea, search, CodeMirror), also test:

| Test | Input | What to check |
|---|---|---|
| XSS script tag | `<script>alert(1)</script>` | Value escaped, no script execution |
| XSS event handler | `<img onerror=alert(1) src=x>` | No DOM injection |
| SQL-like | `'; DROP TABLE issues; --` | No backend error (if submitted) |
| Very long string | 10,000 character input | No crash, graceful truncation or scroll |
| Unicode edge cases | `\u0000`, `\uFFFF`, RTL text | No encoding errors |
| Rapid submit | Click submit 5 times in 1 second | Only one action fires (debounce) |
