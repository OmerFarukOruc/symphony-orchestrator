#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# autopilot.sh — Autonomous Turbo Pipeline Orchestrator
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Usage:
#   ./scripts/autopilot.sh <pipeline-name> [options]
#
# Pipelines (defined in .pipeline/config.yml):
#   audit-and-fix    — Audit codebase, evaluate, apply P0/P1 fixes, polish
#   full-lifecycle   — Full audit → fix → polish → changelog → ship
#   review-only      — Deep code review without making changes
#   investigate      — Autonomous bug investigation
#   plan-and-implement — Spec → plan → implement → finalize
#
# Options:
#   --dry-run        Don't actually run claude, just show what would run
#   --budget <N>     Override max budget in USD (default: from config)
#   --branch <name>  Create and switch to a branch before running
#   --notify         Send desktop notification on completion
#   --issue <desc>   Issue description (for investigate pipeline)
#   --feature <desc> Feature description (for plan-and-implement pipeline)
#
# Examples:
#   ./scripts/autopilot.sh audit-and-fix
#   ./scripts/autopilot.sh full-lifecycle --budget 20 --branch auto/weekly-cleanup
#   ./scripts/autopilot.sh investigate --issue "Login fails with SSO tokens"
#   ./scripts/autopilot.sh audit-and-fix --dry-run
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PIPELINE_DIR="$PROJECT_DIR/scripts/.pipeline"
RUNS_DIR="$PIPELINE_DIR/runs"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

# Default tools to allow in headless mode
ALLOWED_TOOLS="Read,Edit,Bash,Agent,Skill,MultiEdit,TodoRead,TodoWrite"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Parse Arguments ─────────────────────────────────────────────
PIPELINE_NAME="${1:-}"
DRY_RUN=false
BUDGET_OVERRIDE=""
BRANCH=""
NOTIFY=false
ISSUE_DESC=""
FEATURE_DESC=""

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=true; shift ;;
    --budget)    BUDGET_OVERRIDE="$2"; shift 2 ;;
    --branch)    BRANCH="$2"; shift 2 ;;
    --notify)    NOTIFY=true; shift ;;
    --issue)     ISSUE_DESC="$2"; shift 2 ;;
    --feature)   FEATURE_DESC="$2"; shift 2 ;;
    *)           echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
done

if [[ -z "$PIPELINE_NAME" ]]; then
  echo -e "${BOLD}Autopilot — Autonomous Turbo Pipeline Orchestrator${NC}"
  echo ""
  echo "Usage: $0 <pipeline-name> [options]"
  echo ""
  echo "Available pipelines:"
  echo "  audit-and-fix       Audit and auto-fix P0/P1 issues"
  echo "  full-lifecycle      Full audit → fix → polish → ship"
  echo "  review-only         Deep review, no changes"
  echo "  investigate         Autonomous bug investigation"
  echo "  plan-and-implement  Spec → plan → implement → finalize"
  echo ""
  echo "Options:"
  echo "  --dry-run           Show what would run without executing"
  echo "  --budget <N>        Override max budget in USD"
  echo "  --branch <name>     Create a branch before running"
  echo "  --notify            Desktop notification on completion"
  echo "  --issue <desc>      Issue description (for investigate)"
  echo "  --feature <desc>    Feature description (for plan-and-implement)"
  exit 0
fi

# ── Pipeline Definitions ────────────────────────────────────────
# Hard-coded here for reliability (no YAML parser dependency).
# Mirrors .pipeline/config.yml but in shell-native format.

declare -a PHASE_NAMES=()
declare -a PHASE_PROMPTS=()
declare -a PHASE_ON_FAIL=()
declare -a PHASE_CONTINUE=()
declare -a PHASE_TIMEOUT=()
MAX_BUDGET=15

case "$PIPELINE_NAME" in
  audit-and-fix)
    MAX_BUDGET=15
    PHASE_NAMES=("audit" "evaluate" "apply" "polish")
    PHASE_PROMPTS=(
      "Run /audit on the entire codebase. Focus on correctness, security, test coverage, and code quality."
      "Read .turbo/audit.md and /evaluate-findings — assess each finding, run devil's advocate, reconcile, and output the final prioritized list."
      "Run /apply-findings for all P0 and P1 items only. Skip P2 and P3. For skipped items, run /note-improvement."
      "Run /polish-code — stage, format, lint, test, simplify, review, smoke-test. Re-run if changes were made, up to 3 cycles."
    )
    PHASE_ON_FAIL=("stop" "stop" "continue" "continue")
    PHASE_CONTINUE=("false" "true" "true" "false")
    PHASE_TIMEOUT=(30 15 30 45)
    ;;

  full-lifecycle)
    MAX_BUDGET=25
    PHASE_NAMES=("audit" "evaluate-and-apply" "finalize")
    PHASE_PROMPTS=(
      "Run /audit on the entire codebase."
      "Read .turbo/audit.md. Run /evaluate-findings, then /apply-findings for P0 and P1 items."
      "Run /finalize — this will run /polish-code (phase 1), /update-changelog (phase 2), /self-improve (phase 3), and commit+PR (phase 4)."
    )
    PHASE_ON_FAIL=("stop" "continue" "stop")
    PHASE_CONTINUE=("false" "true" "false")
    PHASE_TIMEOUT=(30 30 60)
    ;;

  review-only)
    MAX_BUDGET=8
    PHASE_NAMES=("review" "evaluate")
    PHASE_PROMPTS=(
      "Run /review-code on all changed files (git diff main). This will fan out to /review-test-coverage, /review-correctness, /review-security, /review-quality, /review-api-usage, and /peer-review."
      "Run /evaluate-findings on the review results. Assess each finding, devil's advocate, reconcile."
    )
    PHASE_ON_FAIL=("stop" "stop")
    PHASE_CONTINUE=("false" "true")
    PHASE_TIMEOUT=(30 15)
    ;;

  investigate)
    MAX_BUDGET=10
    if [[ -z "$ISSUE_DESC" ]]; then
      echo -e "${RED}Error: --issue <description> is required for the investigate pipeline${NC}"
      exit 1
    fi
    PHASE_NAMES=("investigate")
    PHASE_PROMPTS=(
      "Run /investigate on this issue: $ISSUE_DESC"
    )
    PHASE_ON_FAIL=("stop")
    PHASE_CONTINUE=("false")
    PHASE_TIMEOUT=(45)
    ;;

  plan-and-implement)
    MAX_BUDGET=30
    if [[ -z "$FEATURE_DESC" ]]; then
      echo -e "${RED}Error: --feature <description> is required for the plan-and-implement pipeline${NC}"
      exit 1
    fi
    PHASE_NAMES=("spec" "review-spec" "plan" "implement")
    PHASE_PROMPTS=(
      "Run /create-spec for the following feature: $FEATURE_DESC"
      "Run /review-spec on the generated spec."
      "Run /create-prompt-plan, then /review-prompt-plan, then /pick-next-prompt, then /plan-style, then /review-plan."
      "Run /code-style to establish style, then implement the plan. When done, run /finalize."
    )
    PHASE_ON_FAIL=("stop" "stop" "stop" "stop")
    PHASE_CONTINUE=("false" "true" "true" "false")
    PHASE_TIMEOUT=(20 15 30 60)
    ;;

  *)
    echo -e "${RED}Unknown pipeline: $PIPELINE_NAME${NC}"
    echo "Run '$0' without arguments to see available pipelines."
    exit 1
    ;;
esac

# Apply budget override
if [[ -n "$BUDGET_OVERRIDE" ]]; then
  MAX_BUDGET="$BUDGET_OVERRIDE"
fi

# ── Setup ───────────────────────────────────────────────────────
RUN_DIR="$RUNS_DIR/$PIPELINE_NAME/$TIMESTAMP"
mkdir -p "$RUN_DIR"

log() {
  local level="$1"
  shift
  local msg="$*"
  local ts
  ts="$(date '+%H:%M:%S')"
  echo -e "${ts} [${level}] ${msg}" | tee -a "$RUN_DIR/pipeline.log"
}

# ── Pre-flight ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${CYAN}  🤖 Autopilot — $PIPELINE_NAME${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  📂 Project:   ${BLUE}$PROJECT_DIR${NC}"
echo -e "  💰 Budget:    ${GREEN}\$${MAX_BUDGET} USD${NC}"
echo -e "  📊 Phases:    ${YELLOW}${#PHASE_NAMES[@]}${NC} (${PHASE_NAMES[*]})"
echo -e "  📁 Run dir:   ${BLUE}$RUN_DIR${NC}"
echo -e "  🌿 Branch:    ${BRANCH:-$(git -C "$PROJECT_DIR" branch --show-current)}"
if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "  ⚠️  Mode:      ${YELLOW}DRY RUN${NC}"
fi
echo ""

log "${GREEN}START${NC}" "Pipeline '$PIPELINE_NAME' starting with budget \$${MAX_BUDGET}"

# Create branch if requested
if [[ -n "$BRANCH" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "  ${YELLOW}[DRY RUN]${NC} Would create branch: $BRANCH"
  else
    log "${BLUE}BRANCH${NC}" "Creating branch: $BRANCH"
    git -C "$PROJECT_DIR" checkout -b "$BRANCH" 2>/dev/null || git -C "$PROJECT_DIR" checkout "$BRANCH"
  fi
fi

# ── Execute Phases ──────────────────────────────────────────────
SESSION_ID=""
TOTAL_PHASES=${#PHASE_NAMES[@]}
PASSED=0
FAILED=0
SKIPPED=0

for i in "${!PHASE_NAMES[@]}"; do
  phase_name="${PHASE_NAMES[$i]}"
  phase_prompt="${PHASE_PROMPTS[$i]}"
  phase_on_fail="${PHASE_ON_FAIL[$i]}"
  phase_continue="${PHASE_CONTINUE[$i]}"
  phase_timeout="${PHASE_TIMEOUT[$i]}"
  phase_num=$((i + 1))

  echo -e "${BOLD}${BLUE}──── Phase ${phase_num}/${TOTAL_PHASES}: ${phase_name} ────${NC}"
  log "${BLUE}PHASE${NC}" "Starting phase ${phase_num}/${TOTAL_PHASES}: ${phase_name}"

  # Build the claude command
  CMD=(
    claude -p "$phase_prompt"
    --allowedTools "$ALLOWED_TOOLS"
    --output-format json
    --max-turns 50
  )

  # Continue from previous session if requested
  if [[ "$phase_continue" == "true" && -n "$SESSION_ID" ]]; then
    CMD+=(--resume "$SESSION_ID")
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "  ${YELLOW}[DRY RUN]${NC} Would execute:"
    echo "    ${CMD[*]}"
    echo ""
    PASSED=$((PASSED + 1))
    continue
  fi

  # Execute with timeout
  phase_start=$(date +%s)
  PHASE_OUTPUT="$RUN_DIR/phase-${phase_num}-${phase_name}.json"

  log "${CYAN}EXEC${NC}" "Running: claude -p \"${phase_prompt:0:80}...\""

  set +e
  timeout "${phase_timeout}m" "${CMD[@]}" > "$PHASE_OUTPUT" 2>&1
  EXIT_CODE=$?
  set -e

  phase_end=$(date +%s)
  phase_duration=$((phase_end - phase_start))

  # Extract session ID for continuation
  if [[ -f "$PHASE_OUTPUT" ]]; then
    NEW_SESSION_ID=$(jq -r '.session_id // empty' "$PHASE_OUTPUT" 2>/dev/null || true)
    if [[ -n "$NEW_SESSION_ID" ]]; then
      SESSION_ID="$NEW_SESSION_ID"
    fi
  fi

  if [[ $EXIT_CODE -eq 0 ]]; then
    PASSED=$((PASSED + 1))
    log "${GREEN}PASS${NC}" "Phase '${phase_name}' completed in ${phase_duration}s"
    echo -e "  ${GREEN}✓${NC} Phase '${phase_name}' passed (${phase_duration}s)"
  elif [[ $EXIT_CODE -eq 124 ]]; then
    # Timeout
    FAILED=$((FAILED + 1))
    log "${RED}TIMEOUT${NC}" "Phase '${phase_name}' timed out after ${phase_timeout}m"
    echo -e "  ${RED}✗${NC} Phase '${phase_name}' timed out after ${phase_timeout}m"
    if [[ "$phase_on_fail" == "stop" ]]; then
      log "${RED}ABORT${NC}" "Pipeline stopped due to timeout (on_fail=stop)"
      SKIPPED=$((TOTAL_PHASES - phase_num))
      break
    fi
  else
    FAILED=$((FAILED + 1))
    log "${RED}FAIL${NC}" "Phase '${phase_name}' failed with exit code ${EXIT_CODE} (${phase_duration}s)"
    echo -e "  ${RED}✗${NC} Phase '${phase_name}' failed (exit ${EXIT_CODE}, ${phase_duration}s)"
    if [[ "$phase_on_fail" == "stop" ]]; then
      log "${RED}ABORT${NC}" "Pipeline stopped (on_fail=stop)"
      SKIPPED=$((TOTAL_PHASES - phase_num))
      break
    else
      log "${YELLOW}CONTINUE${NC}" "Continuing despite failure (on_fail=continue)"
    fi
  fi

  echo ""
done

# ── Summary ─────────────────────────────────────────────────────
TOTAL_END=$(date +%s)
echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${CYAN}  Pipeline Results: $PIPELINE_NAME${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${GREEN}✓ Passed:${NC}  $PASSED"
echo -e "  ${RED}✗ Failed:${NC}  $FAILED"
echo -e "  ${YELLOW}○ Skipped:${NC} $SKIPPED"
echo -e "  📁 Logs:     $RUN_DIR/"
echo ""

log "${BOLD}DONE${NC}" "Pipeline '$PIPELINE_NAME' finished: ${PASSED} passed, ${FAILED} failed, ${SKIPPED} skipped"

# Write machine-readable summary
cat > "$RUN_DIR/summary.json" << EOF
{
  "pipeline": "$PIPELINE_NAME",
  "timestamp": "$TIMESTAMP",
  "budget_usd": $MAX_BUDGET,
  "phases_total": $TOTAL_PHASES,
  "phases_passed": $PASSED,
  "phases_failed": $FAILED,
  "phases_skipped": $SKIPPED,
  "success": $([ "$FAILED" -eq 0 ] && echo "true" || echo "false"),
  "branch": "$(git -C "$PROJECT_DIR" branch --show-current)",
  "run_dir": "$RUN_DIR"
}
EOF

# Desktop notification
if [[ "$NOTIFY" == "true" ]]; then
  if command -v notify-send &>/dev/null; then
    if [[ $FAILED -eq 0 ]]; then
      notify-send "🤖 Autopilot Complete" "Pipeline '$PIPELINE_NAME' finished — all $PASSED phases passed" --urgency=normal
    else
      notify-send "🤖 Autopilot Failed" "Pipeline '$PIPELINE_NAME' — $FAILED phases failed" --urgency=critical
    fi
  fi
fi

# Exit with appropriate code
if [[ $FAILED -gt 0 ]]; then
  exit 1
fi
exit 0
