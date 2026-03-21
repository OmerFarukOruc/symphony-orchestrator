# Issue Taxonomy

Severity levels and exploration checklist for Full QA workflow. Use when categorizing issues found during dashboard testing.

## Severity Levels

### Critical

Issues that prevent core functionality from working.

- Dashboard doesn't load / blank page
- JavaScript exceptions that break rendering
- Data not displayed (all columns empty when data exists)
- Detail panel fails to open
- API responses not rendered

### High

Issues that significantly degrade usability.

- Layout broken at standard viewports (1280px+)
- Interactive elements non-functional (buttons don't respond, filters don't work)
- Data displayed incorrectly (wrong counts, mismatched issue IDs)
- Missing content that should be visible
- Console errors on page load

### Medium

Issues that affect polish or secondary functionality.

- Visual regressions (alignment, spacing, colors off)
- Responsive layout issues at tablet/mobile sizes
- Hover/focus states missing or incorrect
- Animation glitches
- Inconsistent typography or spacing
- Scrollbar issues
- Truncation problems

### Low

Minor cosmetic issues.

- Placeholder text visible in production
- Minor pixel misalignments (1-2px)
- Missing hover cursors
- Inconsistent icon sizing
- Subtle color inconsistencies

### Infrastructure

Issues that prevent testing from starting or completing.

- Server fails to start (missing env vars, port conflict)
- `MASTER_KEY` or `LINEAR_API_KEY` not set
- agent-browser not installed or bundled Chrome missing (`agent-browser install`)
- agent-browser session hangs or fails to connect
- Browser crashes or blank page on launch
- Config file (`agent-browser.json`) missing or malformed
- Network/port conflicts

## Exploration Checklist

### Page load

- [ ] Page loads without JavaScript errors
- [ ] Console has no warnings or errors
- [ ] All expected elements are visible
- [ ] Content renders within 3 seconds

### Kanban board

- [ ] All four columns visible and correctly labeled
- [ ] Column headings show correct counts
- [ ] Cards display ID, title, priority, labels
- [ ] Cards have correct visual treatment per state (running glow, retrying amber)
- [ ] Empty state cards show placeholder text

### Interactions

- [ ] Filter buttons switch active state
- [ ] Filter actually hides/shows correct cards
- [ ] Search input filters cards by text
- [ ] Card click opens detail panel
- [ ] Detail panel close button works
- [ ] Refresh button updates data

### Detail panel

- [ ] All fields populate when card is selected
- [ ] External link opens correct URL
- [ ] Model input is editable
- [ ] Reasoning dropdown has all options
- [ ] Activity log displays events
- [ ] Retry history section populates when applicable
- [ ] Save Model and Refresh Detail buttons work
- [ ] Logs link navigates to correct logs page

### Logs page

- [ ] Issue title and status badge populate
- [ ] Event and shown counts update as filters change
- [ ] Filter buttons switch active state and narrow the stream correctly
- [ ] Copy Logs button succeeds without UI breakage
- [ ] Auto-scroll toggle behaves predictably
- [ ] Refresh repaints data without console or page errors

### Status bar

- [ ] Token counts display and update
- [ ] Uptime value is sensible
- [ ] Rate limit indicator shows current state
- [ ] Timestamp updates on refresh

### Visual design

- [ ] Dot grid background renders cleanly
- [ ] Header glass effect (backdrop blur) visible
- [ ] Card shadows appear on hover
- [ ] Transitions are smooth (detail panel slide-in)
- [ ] Colors match design tokens (primary: #bb4a31)
- [ ] Fonts load correctly (system font stack)

### Responsive

- [ ] Desktop (1920x1080): full layout, all columns visible
- [ ] Laptop (1280x720): all columns visible, may scroll horizontally
- [ ] Tablet (768x1024): usable layout
- [ ] Mobile (375x812): content accessible, may stack

### Infrastructure

- [ ] Server starts without errors
- [ ] `MASTER_KEY` is set in environment
- [ ] `LINEAR_API_KEY` is set in environment
- [ ] agent-browser is installed and bundled Chrome is available
- [ ] `agent-browser.json` config exists at project root
- [ ] Preflight script (`scripts/preflight.sh`) passes

