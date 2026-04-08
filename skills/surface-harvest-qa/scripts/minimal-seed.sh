#!/usr/bin/env bash
set -euo pipefail

# minimal-seed.sh — Lightweight API-only seeding when .env.seed is unavailable
#
# Usage: minimal-seed.sh [port]
# Seeds: templates, triggers refresh. Does NOT require API keys.

PORT="${1:-4000}"
BASE="http://localhost:${PORT}/api/v1"

template_count() {
  curl -sf "${BASE}/templates" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else len(d.get('templates',[])))" 2>/dev/null || echo 0
}

# Verify app is running
if ! curl -sf "${BASE}/state" > /dev/null 2>&1; then
  echo "Error: Risoluto not reachable at ${BASE}" >&2
  exit 1
fi

# Check setup
CONFIGURED=$(curl -sf "${BASE}/setup/status" | python3 -c "import json,sys; print(json.load(sys.stdin).get('configured', False))" 2>/dev/null || echo "False")
if [[ "$CONFIGURED" != "True" ]]; then
  echo "BLOCKED: Setup wizard incomplete. Run seed-test-data.sh with API keys first." >&2
  exit 1
fi

# Templates — ensure at least 2
TEMPLATE_COUNT=$(template_count)
if [ "$TEMPLATE_COUNT" -lt 2 ]; then
  REVIEW_BODY=$'Review {{ issue.identifier }}: {{ issue.title }}.\nPriority: {{ issue.priority }}'
  curl -sf -X POST "${BASE}/templates" -H "Content-Type: application/json" \
    -d "{\"id\":\"shqa-review\",\"name\":\"Review Prompt\",\"body\":$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "${REVIEW_BODY}")}" \
    > /dev/null 2>&1 && echo "Seeded template: shqa-review" || echo "Template seed failed (may already exist)"
fi

FINAL_TEMPLATE_COUNT=$(template_count)
if [ "$FINAL_TEMPLATE_COUNT" -ge 2 ]; then
  echo "Template count is coverage-ready: ${FINAL_TEMPLATE_COUNT}"
else
  echo "Template count is still below target: ${FINAL_TEMPLATE_COUNT}"
fi

# Trigger orchestrator refresh
curl -sf -X POST "${BASE}/refresh" > /dev/null 2>&1 && echo "Orchestrator refresh triggered" || true

echo "Minimal seed complete"
