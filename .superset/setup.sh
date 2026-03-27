#!/usr/bin/env bash
set -euo pipefail

echo "🎼 Symphony Orchestrator — workspace setup"

# ── 1. Copy .env from root if the worktree doesn't have one ──
if [ ! -f .env ]; then
  if [ -f "$SUPERSET_ROOT_PATH/.env" ]; then
    echo "  ↳ Copying .env from root repo"
    cp "$SUPERSET_ROOT_PATH/.env" .env
  elif [ -f .env.example ]; then
    echo "  ↳ No .env found — copying .env.example as .env (edit it!)"
    cp .env.example .env
  fi
fi

# ── 2. Install dependencies ──
echo "  ↳ Installing dependencies with pnpm"
pnpm install --frozen-lockfile

# ── 3. Build TypeScript + Frontend ──
echo "  ↳ Building project"
pnpm run build

echo "✅ Setup complete for workspace: ${SUPERSET_WORKSPACE_NAME:-default}"
