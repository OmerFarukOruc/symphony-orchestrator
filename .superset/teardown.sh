#!/usr/bin/env bash
set -euo pipefail

echo "🧹 Symphony Orchestrator — workspace teardown"

# ── Stop docker services if running ──
if [ -f docker-compose.yml ] && command -v docker &>/dev/null; then
  echo "  ↳ Stopping Docker services"
  docker compose down --remove-orphans 2>/dev/null || true
fi

# ── Clean build artifacts ──
echo "  ↳ Removing build artifacts"
rm -rf dist/ node_modules/

echo "✅ Teardown complete for workspace: ${SUPERSET_WORKSPACE_NAME:-default}"
