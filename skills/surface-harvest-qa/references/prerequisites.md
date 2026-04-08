# Prerequisites — Surface Harvest QA

Before invoking the skill, verify every item in this checklist. The skill will check `GET /api/v1/state` as a preflight — if the app is not running or setup is incomplete, it stops immediately.

## Required App State

### Issues (6 minimum, in distinct states)

| State | Count | Why |
|---|---|---|
| Running | 1 | Tests live log SSE, steer textarea, abort button, kanban "Running" column |
| Queued | 1 | Tests kanban "Queued" column, priority badge |
| Completed | 1 | Tests kanban "Done" column, success badge, recently-finished on Overview |
| Failed | 1 | Tests error badge, attention zone on Overview, retry affordance |
| Retrying | 1 | Tests retry countdown timer, retry schedule section in inspector |
| Stalled | 1 | Tests stall indicator, stall events table on Overview |

Each issue should have a realistic title (not "test123") and belong to a configured Linear project.

### Pull Requests (2 minimum)

| State | Count | Why |
|---|---|---|
| Open | 1 | Tests PR lifecycle badge, Git page "Open pull requests" section |
| Merged | 1 | Tests merged badge, issue workspace section PR link |

### Templates (2 minimum)

| Configuration | Count | Why |
|---|---|---|
| Active (starred) | 1 | Tests active badge (star), "Set Active" disabled state |
| Inactive | 1 | Tests "Set Active" button, template switching, unsaved-change guard |

Both templates should have non-trivial content (multiline, with template variables) to test CodeMirror syntax highlighting and the preview feature.

### Audit Log Entries (5+ minimum)

Entries should span multiple tables:
- At least 1 config change (e.g., polling interval adjustment)
- At least 1 secret change (add/update a key)
- At least 1 template change (create/update a template)

This tests the table filter dropdown, key filter, date range filter, and expandable row detail with previous/new values.

### Notifications (4 minimum)

| Type | Read State | Count | Why |
|---|---|---|---|
| Critical | Unread | 1 | Tests critical severity badge (red), unread indicator |
| Warning | Unread | 1 | Tests warning badge (yellow), filter chips |
| Info | Unread | 1 | Tests info badge (blue), mark-read button |
| Any | Read | 1 | Tests read state styling, "unread only" filter exclusion |

### Workspaces (3 minimum)

| State | Count | Why |
|---|---|---|
| Active | 1 | Tests active status badge, disk size display |
| Orphaned | 1 | Tests "Remove" button (only shows on orphaned), confirm dialog |
| Completed | 1 | Tests completed status styling |

### Secrets (2+ keys)

At least two configured secret keys (e.g., `LINEAR_API_KEY`, `GITHUB_TOKEN`). Tests the credentials section in Settings, redacted value display, add/update/delete flows.

### Repository (1 configured)

One configured repository with:
- At least 3 recent commits
- At least 1 active branch
- A configured identifier prefix and default branch

Tests the Git page: repo cards, commit list, branch list, quick-link buttons.

### Setup Wizard

Must be **completed** (all 5 steps). The setup guard redirects all routes to `/setup` until `configured === true`. Without this, no other surface is reachable.

### Slack Webhook

A configured Slack webhook URL in notification settings. Tests the "Send test" button on the Settings page. The webhook doesn't need to point to a real Slack workspace — the skill just needs the button to be enabled and the API call to respond.

## Runtime Requirements

| Requirement | How to verify |
|---|---|
| Risoluto running | `curl -s http://localhost:<PORT>/api/v1/state \| jq .status` returns data |
| Backend healthy | `GET /api/v1/state` returns 200 with populated snapshot |
| At least 1 running issue | The `running` array in the state snapshot is non-empty |
| SSE endpoint active | `curl -N http://localhost:<PORT>/api/v1/events` starts streaming |

## Quick Verification Script

Run this before invoking the skill:

```bash
PORT=4000  # adjust to your port

echo "=== Preflight Check ==="

# App running?
STATUS=$(curl -sf http://localhost:$PORT/api/v1/state | jq -r '.status // "unreachable"')
echo "App status: $STATUS"

# Setup complete?
CONFIGURED=$(curl -sf http://localhost:$PORT/api/v1/setup/status | jq -r '.configured // false')
echo "Setup configured: $CONFIGURED"

# Issue counts by state
echo "Issues:"
curl -sf http://localhost:$PORT/api/v1/state | jq '{
  running: (.running | length),
  queued: (.queued | length),
  completed: (.completed | length),
  failed: (.failed | length),
  retrying: (.retrying | length)
}'

# Templates
TEMPLATES=$(curl -sf http://localhost:$PORT/api/v1/templates | jq 'length')
echo "Templates: $TEMPLATES"

# Notifications
echo "Notifications:"
curl -sf http://localhost:$PORT/api/v1/notifications | jq '{total: length, unread: [.[] | select(.read == false)] | length}'

# Workspaces
WORKSPACES=$(curl -sf http://localhost:$PORT/api/v1/workspaces | jq 'length')
echo "Workspaces: $WORKSPACES"

# Secrets
SECRETS=$(curl -sf http://localhost:$PORT/api/v1/secrets | jq 'length')
echo "Secrets: $SECRETS"

echo "=== Done ==="
```

## What Happens If Prerequisites Are Missing

The skill will still run, but surfaces that depend on missing data will be marked `BLOCKED` with specific reasons:

| Missing data | Affected surfaces | Status |
|---|---|---|
| No running issue | Live logs, steer section, abort button | BLOCKED: "No running issue — live SSE surfaces untestable" |
| No templates | Template editor, template list, model override template select | BLOCKED: "No templates in store" |
| No notifications | Notification list, severity badges, mark-read | BLOCKED: "No notification data" |
| Setup incomplete | All routes except /setup | BLOCKED: "Setup guard active — all routes redirect to /setup" |

The more complete the data, the higher the coverage rate. Aim for 100% of the checklist.
