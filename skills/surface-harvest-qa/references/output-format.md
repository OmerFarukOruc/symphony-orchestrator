# Output Format Reference

## Directory Structure

```
.context/surface-harvest/
├── run-<TIMESTAMP>/
│   ├── surface-manifest.md       # Unified manifest (both viewports)
│   ├── coverage-summary.md       # Detailed per-route breakdown
│   ├── issues.md                 # All findings with fix context
│   ├── report.html               # Self-contained HTML report
│   ├── meta/                     # Captured helper output for strict validation
│   ├── 2560x1440/
│   │   ├── logs/session.jsonl
│   │   ├── screenshots/<route>/<SURFACE-ID>-<desc>.png
│   │   └── videos/<route>/<SURFACE-ID>-<flow>.webm
│   └── 1920x1080/
│       ├── logs/session.jsonl
│       ├── screenshots/<route>/<route>-1920x1080.png
│       └── videos/
├── latest -> run-<TIMESTAMP>/
└── seed-updates.log
```

## surface-manifest.md Format

Every seed surface gets its own row:

```markdown
| Surface ID | Route | Type | Description | 2560x1440 | 1920x1080 | Evidence |
|---|---|---|---|---|---|---|
| SURFACE-001 | * | section | Sidebar expanded | PASS | PASS | screenshot |
| SURFACE-042 | /queue | form | Sort select | FAIL | FAIL | screenshot + console |
```

## issues.md Entry Format

Each FAIL surface gets a full entry:

```markdown
## Issue #N: <title>

**Severity**: High/Medium/Low
**Surface**: SURFACE-XXX
**Viewport**: [2560x1440] / [1920x1080] / [BOTH]

### Reproduction steps
1. Navigate to ...
2. Click ...
3. Observe: ...

### Expected behavior
<what should happen>

### Actual behavior
<what actually happens>

### Console error
```
<full error + stack trace if any>
```

### Root cause hypothesis
<best guess at why>

### Likely fix location
<file:line>

### Evidence
- Screenshot: <path>
- Session log: <line reference>
```

## coverage-summary.md Sections

1. Run metadata (target URL, viewports, timestamps, command/screenshot counts)
2. Aggregate coverage (PASS/FAIL/BLOCKED/SKIP counts and percentages)
3. Per-route breakdown table
4. Adversarial test results
5. Self-healing log (failures recovered)
6. Blocked coverage with "what would unblock it"
7. Seed drift (new [DISCOVERED] / [MISSING] surfaces)

Closeout is incomplete until `validate-run-artifacts.sh` passes. In particular:

- any captured helper log under `meta/` that contains `command not found` is fatal
- any required viewport log with zero JSONL entries is fatal
- any required viewport missing seeded page screenshots is fatal
- any manifest that drops seeded rows is fatal
- any closeout where `BLOCKED` dominates without concrete escalation evidence is fatal
- any generated report that renders zero routes or mismatches manifest totals is fatal

## session.jsonl Line Format

```json
{
  "ts": "ISO-8601",
  "phase": "discover|test|layout-check",
  "surface_id": "SURFACE-042",
  "action": "click @e7",
  "result": "success|error|timeout",
  "console_errors_after": 0,
  "screenshot_path": "screenshots/queue/SURFACE-042-sort.png",
  "note": "optional context"
}
```
