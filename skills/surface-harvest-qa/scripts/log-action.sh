#!/usr/bin/env bash
set -euo pipefail

# log-action.sh — Append a structured JSONL entry to the session log
#
# Usage: log-action.sh <log-file> <phase> <surface-id> <action> <result> [errors] [screenshot] [note]

LOG_FILE="${1:?Usage: log-action.sh <log-file> <phase> <surface-id> <action> <result> [errors] [screenshot] [note]}"
PHASE="${2:?}"
SURFACE_ID="${3:?}"
ACTION="${4:?}"
RESULT="${5:?}"
CONSOLE_ERRORS="${6:-0}"
SCREENSHOT="${7:-}"
NOTE="${8:-}"

# Clear stale [] artifact from agent-browser session init
if [[ -f "$LOG_FILE" ]] && [[ "$(tr -d '[:space:]' < "$LOG_FILE" 2>/dev/null)" == "[]" ]]; then
  : > "$LOG_FILE"
fi

TS=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)

# Pass all values via env vars to avoid shell injection
LOG_TS="$TS" LOG_PHASE="$PHASE" LOG_SURFACE="$SURFACE_ID" LOG_ACTION="$ACTION" \
  LOG_RESULT="$RESULT" LOG_ERRORS="$CONSOLE_ERRORS" \
  LOG_SCREENSHOT="$SCREENSHOT" LOG_NOTE="$NOTE" \
  python3 - >> "$LOG_FILE" << 'PYEOF'
import json, os
entry = {
    "ts": os.environ["LOG_TS"],
    "phase": os.environ["LOG_PHASE"],
    "surface_id": os.environ["LOG_SURFACE"],
    "action": os.environ["LOG_ACTION"],
    "result": os.environ["LOG_RESULT"],
    "console_errors_after": int(os.environ.get("LOG_ERRORS") or "0"),
}
if os.environ.get("LOG_SCREENSHOT"):
    entry["screenshot_path"] = os.environ["LOG_SCREENSHOT"]
if os.environ.get("LOG_NOTE"):
    entry["note"] = os.environ["LOG_NOTE"]
print(json.dumps(entry))
PYEOF
