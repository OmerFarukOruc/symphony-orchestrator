#!/usr/bin/env bash
set -euo pipefail

# seed-test-data.sh — Seeds Risoluto with ALL test data for surface-harvest-qa
#
# Usage:
#   LINEAR_API_KEY=lin_api_xxx OPENAI_API_KEY=oruc-api-key GITHUB_TOKEN=ghp_xxx \
#     ./seed-test-data.sh [port] [repo-url]
#
# Arguments:
#   port       — Risoluto port (default: 4000)
#   repo-url   — GitHub repo URL (default: https://github.com/OmerFarukOruc/sentinel-test-arena)
#
# Required env vars:
#   LINEAR_API_KEY  — Linear API key for project access
#   OPENAI_API_KEY  — API key for model provider (OpenAI or compatible)
#   GITHUB_TOKEN    — GitHub PAT (validated against api.github.com/user)
#
# Optional env vars (all auto-detected from running instance if not set):
#   OPENAI_BASE_URL     — Custom OpenAI-compatible endpoint
#   OPENAI_PROVIDER_NAME — Provider display name
#   CODEX_MODEL         — Default model for agent runs
#   CODEX_REASONING     — Default reasoning effort
#   LINEAR_PROJECT_SLUG — Skip project picker, use this slug directly
#   SLACK_WEBHOOK_URL   — Configure Slack notifications
#   SKIP_SETUP          — Set to 1 to skip setup wizard (already completed)
#
# This script seeds data exclusively via the Risoluto API.
# Attempts, notifications, PRs, and audit entries are created organically
# by the orchestrator when it processes the test issues created here.
# NEVER insert directly into SQLite — fake IDs break startup recovery.

PORT="${1:-4000}"
REPO_URL="${2:-${REPO_URL:-}}"
BASE="http://localhost:${PORT}/api/v1"

# Model provider defaults — read from running instance if available, fall back to env vars
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
HOUR_AGO=$(date -u -d "-1 hour" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)
TWO_HOURS_AGO=$(date -u -d "-2 hours" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-2H +%Y-%m-%dT%H:%M:%SZ)
YESTERDAY=$(date -u -d "-1 day" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-1d +%Y-%m-%dT%H:%M:%SZ)

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[seed]${NC} $1"; }
ok()   { echo -e "${GREEN}  ✓${NC} $1"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $1"; }
fail() { echo -e "${RED}  ✗${NC} $1"; }

template_count() {
  curl -sf "${BASE}/templates" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else len(d.get('templates',[])))" 2>/dev/null || echo 0
}

create_template() {
  local template_id="${1:?template id required}"
  local template_name="${2:?template name required}"
  local template_body="${3:?template body required}"
  local response
  local http_code
  local response_body

  response=$(curl -sS -w '\n%{http_code}' -X POST "${BASE}/templates" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"${template_id}\",\"name\":\"${template_name}\",\"body\":$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "${template_body}")}") || {
    warn "Template ${template_id} request failed before an HTTP response was returned"
    return 1
  }

  http_code=$(printf '%s\n' "$response" | tail -n 1)
  response_body=$(printf '%s\n' "$response" | sed '$d')

  case "$http_code" in
    201)
      ok "Template: ${template_id}"
      return 0
      ;;
    409)
      ok "Template already exists: ${template_id}"
      return 0
      ;;
    *)
      warn "Template ${template_id} failed (HTTP ${http_code})"
      if [[ -n "$response_body" ]]; then
        echo "    ${response_body}"
      fi
      return 1
      ;;
  esac
}

# ── Preflight ──────────────────────────────────────────────────────────────────

log "Checking Risoluto at localhost:${PORT}..."
if ! curl -sf "${BASE}/state" > /dev/null 2>&1; then
  fail "Risoluto not reachable at ${BASE}/state"
  echo "  Start it with: pnpm run dev -- --port ${PORT}"
  exit 1
fi
ok "Risoluto is running"

# Read current config from the running instance — use as defaults instead of hardcoding
LIVE_CONFIG=$(curl -sf "${BASE}/config" 2>/dev/null || echo "{}")
LIVE_MODEL=$(echo "$LIVE_CONFIG" | python3 -c "import json,sys; c=json.load(sys.stdin); print(c.get('codex',{}).get('model',''))" 2>/dev/null || echo "")
LIVE_REASONING=$(echo "$LIVE_CONFIG" | python3 -c "import json,sys; c=json.load(sys.stdin); print(c.get('codex',{}).get('reasoning_effort','') or c.get('codex',{}).get('reasoningEffort',''))" 2>/dev/null || echo "")
LIVE_PROVIDER_NAME=$(echo "$LIVE_CONFIG" | python3 -c "import json,sys; c=json.load(sys.stdin); p=c.get('codex',{}).get('provider',{}); print(p.get('id','') or p.get('name','') if p else '')" 2>/dev/null || echo "")
LIVE_BASE_URL=$(echo "$LIVE_CONFIG" | python3 -c "import json,sys; c=json.load(sys.stdin); p=c.get('codex',{}).get('provider',{}); print(p.get('base_url','') or p.get('baseUrl','') if p else '')" 2>/dev/null || echo "")

# Priority: env var > live config > fail
CODEX_MODEL="${CODEX_MODEL:-${LIVE_MODEL}}"
CODEX_REASONING="${CODEX_REASONING:-${LIVE_REASONING:-high}}"
OPENAI_PROVIDER_NAME="${OPENAI_PROVIDER_NAME:-${LIVE_PROVIDER_NAME}}"
OPENAI_BASE_URL="${OPENAI_BASE_URL:-${LIVE_BASE_URL}}"

if [[ -n "$LIVE_MODEL" ]]; then
  ok "Read config from running instance: model=${CODEX_MODEL} provider=${OPENAI_PROVIDER_NAME}"
elif [[ -n "$CODEX_MODEL" ]]; then
  ok "Using env vars: model=${CODEX_MODEL} provider=${OPENAI_PROVIDER_NAME}"
else
  fail "No model config found. Either:"
  echo "  1. Configure Risoluto first (setup wizard or config overlay), OR"
  echo "  2. Set env vars: CODEX_MODEL, OPENAI_BASE_URL, OPENAI_PROVIDER_NAME"
  exit 1
fi

for var in LINEAR_API_KEY OPENAI_API_KEY GITHUB_TOKEN; do
  if [[ -z "${!var:-}" ]]; then
    fail "Missing required env var: ${var}"
    exit 1
  fi
done
ok "All required API keys present"

# ── Part 1: API-based seeding ─────────────────────────────────────────────────

if [[ "${SKIP_SETUP:-0}" != "1" ]]; then
  log "Running setup wizard..."

  SETUP_STATUS=$(curl -sf "${BASE}/setup/status" | python3 -c "import json,sys; print(json.load(sys.stdin).get('configured', False))" 2>/dev/null || echo "False")
  if [[ "$SETUP_STATUS" == "True" ]]; then
    ok "Setup already completed — skipping"
  else
    # Master key
    curl -sf -X POST "${BASE}/setup/master-key" -H "Content-Type: application/json" -d '{}' > /dev/null 2>&1 && ok "Master key generated" || warn "Master key may already exist"

    # Linear API key
    curl -sf -X POST "${BASE}/secrets/LINEAR_API_KEY" -H "Content-Type: application/json" -d "{\"value\": \"${LINEAR_API_KEY}\"}" > /dev/null 2>&1 && ok "LINEAR_API_KEY stored" || warn "LINEAR_API_KEY may exist"

    # OpenAI key (with custom provider support for CLIProxyAPI / openai-cpa)
    OPENAI_PAYLOAD="{\"key\": \"${OPENAI_API_KEY}\""
    if [[ -n "${OPENAI_BASE_URL}" ]]; then
      OPENAI_PAYLOAD+=", \"provider\": {\"baseUrl\": \"${OPENAI_BASE_URL}\", \"name\": \"${OPENAI_PROVIDER_NAME}\"}"
    fi
    OPENAI_PAYLOAD+="}"
    curl -sf -X POST "${BASE}/setup/openai-key" -H "Content-Type: application/json" -d "${OPENAI_PAYLOAD}" > /dev/null 2>&1 && ok "OpenAI key set (provider: ${OPENAI_PROVIDER_NAME}, base: ${OPENAI_BASE_URL})" || warn "OpenAI key setup returned error"

    # GitHub token
    curl -sf -X POST "${BASE}/setup/github-token" -H "Content-Type: application/json" -d "{\"token\": \"${GITHUB_TOKEN}\"}" > /dev/null 2>&1 && ok "GitHub token set" || warn "GitHub token setup returned error"

    # Linear project
    if [[ -n "${LINEAR_PROJECT_SLUG:-}" ]]; then
      SLUG_ID="$LINEAR_PROJECT_SLUG"
    else
      SLUG_ID=$(curl -sf "${BASE}/setup/linear-projects" | python3 -c "
import json, sys
data = json.load(sys.stdin)
projects = data if isinstance(data, list) else data.get('projects', [])
print(projects[0].get('slugId', '') if projects else '')
" 2>/dev/null || echo "")
      if [[ -z "$SLUG_ID" ]]; then
        CREATE_RESULT=$(curl -sf -X POST "${BASE}/setup/create-project" -H "Content-Type: application/json" -d '{"name": "Surface QA Test"}' 2>&1)
        SLUG_ID=$(echo "$CREATE_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('project',{}).get('slugId',''))" 2>/dev/null || echo "")
      fi
    fi
    [[ -n "$SLUG_ID" ]] && curl -sf -X POST "${BASE}/setup/linear-project" -H "Content-Type: application/json" -d "{\"slugId\": \"${SLUG_ID}\"}" > /dev/null 2>&1 && ok "Linear project: ${SLUG_ID}" || warn "Linear project selection issue"

    # Repo route — only if REPO_URL is provided
    if [[ -n "${REPO_URL}" ]]; then
      curl -sf -X POST "${BASE}/setup/repo-route" -H "Content-Type: application/json" -d "{\"repoUrl\": \"${REPO_URL}\", \"identifierPrefix\": \"SQA\", \"defaultBranch\": \"main\"}" > /dev/null 2>&1 && ok "Repository configured: ${REPO_URL}" || warn "Repo route issue"
    else
      LIVE_REPO=$(echo "$LIVE_CONFIG" | python3 -c "import json,sys; r=json.load(sys.stdin).get('repos',[]); print(r[0].get('repo_url','') if r else '')" 2>/dev/null || echo "")
      if [[ -n "$LIVE_REPO" ]]; then
        ok "Using existing repo route: ${LIVE_REPO}"
      else
        warn "No REPO_URL set and no repos configured — skipping repo route"
      fi
    fi
  fi
fi

# Templates
log "Creating templates..."
DEFAULT_AGENT_BODY=$'You are an autonomous agent working on {{ issue.identifier }}: {{ issue.title }}.\n{% if issue.description %}\n\n{{ issue.description }}\n{% endif %}\n\nWork in {{ workspace.path }}. Fix the issue, write tests, and submit a PR.'
CAREFUL_REVIEW_BODY=$'Review {{ issue.identifier }}: {{ issue.title }}.\nPriority: {{ issue.priority }}\n\nIdentify root cause, make the minimal fix, and verify it with tests.'

create_template "default-agent" "Default Agent Prompt" "${DEFAULT_AGENT_BODY}" || true
create_template "careful-review" "Careful Review Prompt" "${CAREFUL_REVIEW_BODY}" || true

FINAL_TEMPLATE_COUNT=$(template_count)
if [[ "${FINAL_TEMPLATE_COUNT}" -ge 2 ]]; then
  ok "Template count is coverage-ready: ${FINAL_TEMPLATE_COUNT}"
else
  warn "Template count is still below the prerequisite target: ${FINAL_TEMPLATE_COUNT}"
fi

# Secrets
log "Creating secrets..."
curl -sf -X POST "${BASE}/secrets/ANTHROPIC_API_KEY" -H "Content-Type: application/json" -d '{"value":"sk-ant-placeholder-for-surface-qa"}' > /dev/null 2>&1 && ok "Secret: ANTHROPIC_API_KEY" || warn "exists"
curl -sf -X POST "${BASE}/secrets/SLACK_WEBHOOK_URL" -H "Content-Type: application/json" -d "{\"value\":\"${SLACK_WEBHOOK_URL:-https://hooks.slack.com/services/T00/B00/placeholder}\"}" > /dev/null 2>&1 && ok "Secret: SLACK_WEBHOOK_URL" || warn "exists"

# Config overlay — only set Slack + model if not already configured
EXISTING_MODEL=$(echo "$LIVE_CONFIG" | python3 -c "import json,sys; print(json.load(sys.stdin).get('codex',{}).get('model',''))" 2>/dev/null || echo "")
if [[ -z "$EXISTING_MODEL" ]]; then
  log "Configuring model + provider defaults (first-time setup)..."
  curl -sf -X PUT "${BASE}/config/overlay" -H "Content-Type: application/json" -d "{
    \"notifications\":{\"slack\":{\"webhookUrl\":\"${SLACK_WEBHOOK_URL:-https://hooks.slack.com/services/T00/B00/placeholder}\",\"channel\":\"#risoluto-alerts\"}},
    \"codex\":{\"model\":\"${CODEX_MODEL}\",\"reasoningEffort\":\"${CODEX_REASONING}\",\"provider\":{\"id\":\"${OPENAI_PROVIDER_NAME}\",\"name\":\"${OPENAI_PROVIDER_NAME}\",\"baseUrl\":\"${OPENAI_BASE_URL}\",\"wireApi\":\"responses\",\"requiresOpenaiAuth\":false,\"envKey\":\"OPENAI_API_KEY\"}}
  }" > /dev/null 2>&1 && ok "Config overlay: model=${CODEX_MODEL} provider=${OPENAI_PROVIDER_NAME}" || warn "Config overlay issue"
else
  ok "Config already has model=${EXISTING_MODEL} — not overwriting"
fi

# Test issues + label
log "Creating test issues in Linear..."
for i in 1 2 3; do
  curl -sf -X POST "${BASE}/setup/create-test-issue" > /dev/null 2>&1 && ok "Test issue ${i}" || warn "Test issue ${i} failed"
  sleep 1  # Linear API enforces ~1 req/sec per token — do not remove
done
curl -sf -X POST "${BASE}/setup/create-label" > /dev/null 2>&1 && ok "Label created" || warn "Label exists"

# Trigger refresh
curl -sf -X POST "${BASE}/refresh" > /dev/null 2>&1 && ok "Orchestrator refresh queued" || warn "Refresh failed"

# ── Wait for orchestrator to process ──────────────────────────────────────────

log "Waiting for orchestrator to pick up test issues..."
echo "  The orchestrator will dispatch agents to the test issues created above."
echo "  This generates real attempts, notifications, events, and audit entries."

# Poll until at least one issue appears in the state
MAX_WAIT=60
WAITED=0
while [[ $WAITED -lt $MAX_WAIT ]]; do
  TOTAL=$(curl -sf "${BASE}/state" | python3 -c "
import json, sys
d = json.load(sys.stdin)
total = sum(len(d.get(k, [])) for k in ['running', 'queued', 'completed', 'failed', 'retrying'])
print(total)
" 2>/dev/null || echo "0")
  if [[ "$TOTAL" -gt 0 ]]; then
    ok "Orchestrator has ${TOTAL} issues in flight"
    break
  fi
  sleep 5
  WAITED=$((WAITED + 5))
  echo -ne "\r  Waiting... ${WAITED}s / ${MAX_WAIT}s"
done
echo ""

if [[ $WAITED -ge $MAX_WAIT ]]; then
  warn "Timed out waiting for orchestrator — issues may still be processing"
fi

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
log "Seed complete! Final state:"
echo ""

STATE=$(curl -sf "${BASE}/state" 2>&1 || echo "{}")
echo "$STATE" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    for key in ['running', 'queued', 'completed', 'failed', 'retrying']:
        items = d.get(key, [])
        print(f'  {key}: {len(items)}')
except Exception as e:
    print(f'  State parse error: {e}')
" 2>/dev/null

TEMPLATES=$(curl -sf "${BASE}/templates" 2>&1 || echo "[]")
T_COUNT=$(echo "$TEMPLATES" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else len(d.get('templates',[])))" 2>/dev/null || echo "?")
SECRETS=$(curl -sf "${BASE}/secrets" 2>&1 || echo "[]")
S_COUNT=$(echo "$SECRETS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else len(d.get('keys',[])))" 2>/dev/null || echo "?")
NOTIFS=$(curl -sf "${BASE}/notifications" 2>&1 || echo "[]")
N_COUNT=$(echo "$NOTIFS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else len(d.get('notifications',[])))" 2>/dev/null || echo "?")

echo "  templates: ${T_COUNT}"
echo "  secrets: ${S_COUNT}"
echo "  notifications: ${N_COUNT}"

echo ""
echo -e "${GREEN}Seeded via API:${NC}"
echo "  ✓ Setup wizard (5 steps)"
echo "  ✓ 2 prompt templates"
echo "  ✓ 4+ secrets"
echo "  ✓ Slack webhook config"
echo "  ✓ 3 test issues in Linear"
echo "  ✓ Orchestrator processing triggered"
echo ""
echo -e "${CYAN}Note:${NC} Attempts, notifications, PRs, and audit entries are"
echo "  created organically by the orchestrator as it processes issues."
echo "  Run /surface-harvest-qa after at least one issue has completed."
echo ""
echo -e "${CYAN}Ready to run:${NC}"
echo "  /surface-harvest-qa"
