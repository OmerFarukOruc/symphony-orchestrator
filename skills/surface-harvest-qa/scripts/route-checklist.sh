#!/usr/bin/env bash
set -euo pipefail

# route-checklist.sh — Generates a per-route test checklist from surface-seed.md
#
# Usage: bash route-checklist.sh <route> [seed-file]
#
# Given a route like "/queue" or "/issues/:id/logs", extracts all surfaces
# for that route from the seed file and prints a checklist with the test
# recipe for each surface type.
#
# The agent runs this BEFORE testing each route to get a focused list of
# exactly what needs testing. This prevents "forgetting" surfaces mid-run.

ROUTE="${1:?Usage: route-checklist.sh <route> [seed-file]}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SEED="${2:-${SKILL_DIR}/references/surface-seed.md}"

if [[ ! -f "$SEED" ]]; then
  echo "Error: seed file not found at $SEED" >&2
  exit 1
fi

# Extract surfaces matching this route
# Seed format: SURFACE-NNN | <route> | <type> | <description> | <interactions>
echo "=== Checklist for route: ${ROUTE} ==="
echo ""

COUNT=0
while IFS='|' read -r sid sroute stype sdesc sinteractions; do
  sid=$(echo "$sid" | xargs)
  sroute=$(echo "$sroute" | xargs)
  stype=$(echo "$stype" | xargs)
  sdesc=$(echo "$sdesc" | xargs)

  # Match route — handle wildcards (*) and parameterized routes
  case "$sroute" in
    "$ROUTE"|"$ROUTE/"|\*) ;;  # exact match or global (*)
    *) continue ;;
  esac

  COUNT=$((COUNT + 1))

  # Print surface with its type-specific test recipe
  case "$stype" in
    page|section|form|table|chip|drawer|menu|wizard-step)
      echo "[ ] ${sid} | ${stype} | ${sdesc}"
      echo "    → Navigate, screenshot, verify content renders"
      ;;
    shortcut)
      echo "[ ] ${sid} | ${stype} | ${sdesc}"
      echo "    → click 'main', press key sequence, verify URL/state change"
      ;;
    sse-event)
      echo "[ ] ${sid} | ${stype} | ${sdesc}"
      echo "    → eval 'window.dispatchEvent(new CustomEvent(\"risoluto:...\", {detail:{...}}))'"
      echo "    → wait 500ms, snapshot, verify toast/row/update appeared"
      ;;
    state-variation)
      echo "[ ] ${sid} | ${stype} | ${sdesc}"
      echo "    → network route to mock loading/empty/error, navigate, screenshot, network unroute"
      ;;
    modal)
      echo "[ ] ${sid} | ${stype} | ${sdesc}"
      echo "    → If native confirm(): eval 'window.confirm = () => true' before triggering"
      echo "    → Trigger open, verify focus trap, Escape closes"
      ;;
    toast)
      echo "[ ] ${sid} | ${stype} | ${sdesc}"
      echo "    → Dispatch CustomEvent, wait 500ms, screenshot toast"
      ;;
    *)
      echo "[ ] ${sid} | ${stype} | ${sdesc}"
      echo "    → Test per interaction-taxonomy.md"
      ;;
  esac
  echo ""
done < <(grep "^SURFACE-" "$SEED")

echo "=== Total surfaces for ${ROUTE}: ${COUNT} ==="
echo ""
echo "After testing all surfaces above, run the checkpoint:"
echo "  bash ${SKILL_DIR}/scripts/route-checkpoint.sh ${ROUTE} <manifest-file>"
