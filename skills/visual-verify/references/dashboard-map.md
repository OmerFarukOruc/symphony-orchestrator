# Risoluto Dashboard Map

Element reference for visual verification. Use this when you need current routes, selectors, or page structure for the Risoluto web UI.

## Required Environment

Before the dashboard can serve, these must be set:

| Variable | Required | Notes |
|---|---|---|
| `MASTER_KEY` | Yes | Any non-empty string for local QA (e.g. `local-qa-key`) |
| `LINEAR_API_KEY` | Yes | API key for Linear integration |
| `LINEAR_PROJECT_SLUG` | Optional | Scopes which Linear project to poll |

**Workflow files:**
- `WORKFLOW.example.md` — safe for QA runs, won't affect real issues
- `WORKFLOW.md` — production workflow, use only for real runs

## Pages

| Route | Description | Template source |
|---|---|---|
| `/` | Main kanban dashboard | `src/dashboard-template.ts` |
| `/logs/:issue_identifier` | Structured log viewer for a specific issue | `src/logs-template.ts` |

There is no current `/ops` page in the live route surface. Do not plan visual verification around it unless the repo adds that route back.

## Dashboard (`/`) — Key Elements

### Layout

| Element | ID/Selector | Description |
|---|---|---|
| Sidebar | `body > aside` | Navigation rail on the left edge |
| Main area | `main` | Flex column containing header, status bar, board |
| Header | `header` | Title, filter nav, search, refresh button |
| Status bar | `section` (first) | Counts, tokens, uptime, rate limit |
| Board | `#boardScroll` | Horizontal scroll container for kanban columns |
| Detail panel | `#detailPanel` | Slide-in panel from right (fixed position) |

### Kanban Columns

| Column | Heading ID | Container ID | Dot color |
|---|---|---|---|
| Queued | `#queuedHeading` | `#queuedColumn` | Blue |
| Running | `#runningHeading` | `#runningColumn` | Green (pulsing) |
| Retrying | `#retryingHeading` | `#retryingColumn` | Amber |
| Completed | `#completedHeading` | `#completedColumn` | Slate |

### Filter Navigation

| Element | ID/Selector | Description |
|---|---|---|
| Filter container | `#filterNav` | Pill-style button group |
| All filter | `.filter-button[data-filter="all"]` | Shows all issues |
| Running filter | `.filter-button[data-filter="running"]` | Running only |
| Retrying filter | `.filter-button[data-filter="retrying"]` | Retrying only |
| Completed filter | `.filter-button[data-filter="completed"]` | Completed only |

### Status Bar

| Element | ID | Content |
|---|---|---|
| Queued count | `#queuedCount` | Format: `0Q` |
| Running count | `#runningCount` | Format: `0R` |
| Retrying count | `#retryingCount` | Format: `0E` |
| Completed count | `#completedCount` | Format: `0C` |
| Input tokens | `#inputTokensBar` | Format: `IN 0` |
| Output tokens | `#outputTokensBar` | Format: `OUT 0` |
| Total tokens | `#totalTokensBar` | Format: `TTL 0` |
| Uptime | `#uptimeValue` | Duration string |
| Rate limit | `#rateLimitValue` | Status indicator |
| Timestamp | `#generatedAtCompact` | Time string |

### Issue Cards

| Element | Class | Description |
|---|---|---|
| Card container | `.issue-card` | Click to open detail panel |
| Running card | `.issue-card-running` | Has primary-colored border |
| Retrying card | `.issue-card-retrying` | Has amber border |
| Card header | `.issue-head` | ID badge + priority tag |
| Issue ID | `.issue-id` | Mono font, pill-shaped |
| Priority | `.issue-priority` | high/medium/low variants |
| Title | `.issue-title` | Bold, clamped to 2 lines |
| Labels | `.issue-labels` | Flex-wrap label chips |
| Meta | `.issue-meta` | Timestamp, note, warning |

### Detail Panel (`#detailPanel`)

| Element | ID | Description |
|---|---|---|
| Identifier | `#detailIdentifier` | Issue ID display |
| External link | `#detailExternalLink` | Opens issue in Linear |
| Close button | `#closeDetailButton` | Dismisses panel |
| Badges | `#detailBadges` | Status + priority badges |
| Title | `#detailTitle` | Full issue title |
| Creator | `#detailCreator` | Issue creator name |
| Agent | `#detailAgent` | Assigned worker name |
| Workspace | `#detailWorkspace` | Workspace path (mono) |
| Labels | `#detailLabels` | Issue labels |
| Model input | `#detailModelInput` | Text input for model override |
| Reasoning select | `#detailReasoningSelect` | Dropdown for reasoning level |
| Turns | `#detailTurns` | Turn count display |
| Tokens | `#detailTokens` | Token usage display |
| Duration | `#detailDuration` | Run duration display |
| Activity log | `#detailActivity` | Event timeline |
| Retry history | `#detailRetryHistory` | Previous attempt records |
| Save model button | `#pauseButton` | Saves model routing changes |
| Refresh button | `#refreshDetailButton` | Refreshes detail data |
| Logs link | `#focusLogsButton` | Opens structured logs page |

### Other Controls

| Element | ID | Description |
|---|---|---|
| Search input | `#searchInput` | Text search for agents |
| Refresh button | `#refreshButton` | Refreshes dashboard state |

## Logs Page (`/logs/:issue_identifier`) — Key Elements

### Header

| Element | ID/Selector | Description |
|---|---|---|
| Back link | `.back-link` | Returns to dashboard |
| Issue title | `#issueTitle` | Current issue title |
| Status badge | `#statusBadge` | Current issue status |
| Auto-scroll toggle | `#autoScrollToggle` | Keeps logs pinned to newest entries |
| Copy Logs button | `#copyLogsBtn` | Copies the filtered event stream |

### Filters And Counts

| Element | ID/Selector | Description |
|---|---|---|
| Filter buttons | `.filter-btn[data-filter]` | Filters by event type |
| Event count | `#eventCount` | Total visible non-noise events |
| Shown count | `#shownCount` | Count after applying the active filter |

### Log Surface

| Element | ID/Selector | Description |
|---|---|---|
| Log container | `#logContainer` | Main rendered event list |
| Scroll anchor | `#scrollAnchor` | Auto-scroll target near the bottom |
| Scroll to bottom button | `#scrollToBottom` | Appears when the user is not near the bottom |

## CSS Design Tokens

```css
--primary: #bb4a31;       /* Brand rust-red */
--background: #fdfbf8;    /* Warm off-white */
--panel: #ffffff;          /* Card/panel white */
--border: #e4d6d3;        /* Warm border */
--text: #0f172a;           /* Near-black text */
--muted: #64748b;          /* Secondary text */
--success: #16a34a;        /* Green status */
--warning: #d97706;        /* Amber warning */
--danger: #dc2626;         /* Red error */
--mono: ui-monospace, ...  /* Code font stack */
--sans: -apple-system, ... /* UI font stack */
```

## Visual Characteristics to Verify

- **Dot grid background** on the board area (radial-gradient pattern)
- **Glassmorphism** header (backdrop-filter blur)
- **Pill-shaped** filter buttons with active state shadow
- **Card shadows** intensify on hover
- **Running cards** have primary-colored border glow
- **Detail panel** slides in from right with 300ms ease transition
- **Status indicator** green dot with pulse animation in sidebar
- **Logs page badges and filter pills** preserve the same warm palette and contrast
