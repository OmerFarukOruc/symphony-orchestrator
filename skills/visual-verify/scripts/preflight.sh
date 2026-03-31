#!/usr/bin/env bash
# visual-verify preflight check
# Verifies all prerequisites for running the visual-verify skill.
# Exit 0 = all checks pass, exit 1 = one or more failed.
#
# Usage:
#   bash skills/visual-verify/scripts/preflight.sh [--port PORT]
#
# Environment:
#   MASTER_KEY        — required (any non-empty value for local QA)
#   LINEAR_API_KEY    — required for workflow polling
#   PORT              — server port to check (default: 4000, overridden by --port)

set -euo pipefail

PORT="${PORT:-4000}"
FAIL=0

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAIL=1; }

echo "visual-verify preflight check"
echo "=============================="
echo ""

# 1. agent-browser
echo "Tools:"
if command -v agent-browser > /dev/null 2>&1; then
  pass "agent-browser found: $(command -v agent-browser)"
else
  fail "agent-browser not found — install: npm install -g agent-browser"
fi

# 2. Bundled Chrome (agent-browser uses its own Chromium)
if agent-browser install --dry-run > /dev/null 2>&1; then
  pass "Bundled Chrome available (via agent-browser)"
else
  fail "Bundled Chrome not available — run: agent-browser install"
fi

# 3. agent-browser.json
echo ""
echo "Config:"
if [[ -f "agent-browser.json" ]]; then
  pass "agent-browser.json exists at project root"
else
  fail "agent-browser.json missing — create it at project root (see skill docs)"
fi

# 4. Environment variables
echo ""
echo "Environment:"
if [[ -n "${MASTER_KEY:-}" ]]; then
  pass "MASTER_KEY is set"
else
  fail "MASTER_KEY is not set — export MASTER_KEY=\"local-qa-key\""
fi

if [[ -n "${LINEAR_API_KEY:-}" ]]; then
  pass "LINEAR_API_KEY is set"
else
  fail "LINEAR_API_KEY is not set — required for workflow polling"
fi

if [[ -n "${LINEAR_PROJECT_SLUG:-}" ]]; then
  pass "LINEAR_PROJECT_SLUG is set"
else
  echo "  ~ LINEAR_PROJECT_SLUG is not set (optional but recommended)"
fi

# 5. Server availability
echo ""
echo "Server (port ${PORT}):"
if curl -sf "http://127.0.0.1:${PORT}" > /dev/null 2>&1; then
  pass "Risoluto UI is responding at http://127.0.0.1:${PORT}"
elif command -v python3 > /dev/null 2>&1 && python3 -c "
import urllib.request, sys
try:
    urllib.request.urlopen('http://127.0.0.1:${PORT}', timeout=3)
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; then
  pass "Risoluto UI is responding at http://127.0.0.1:${PORT}"
else
  fail "Risoluto UI not responding at http://127.0.0.1:${PORT}"
  echo "       Start with: MASTER_KEY=\"\${MASTER_KEY:-local-qa-key}\" npm run dev -- ./WORKFLOW.example.md --port ${PORT}"
fi

# Summary
echo ""
echo "=============================="
if [[ "$FAIL" -eq 0 ]]; then
  echo "All checks passed — ready to run visual-verify"
  exit 0
else
  echo "Some checks failed — fix the issues above before continuing"
  exit 1
fi
