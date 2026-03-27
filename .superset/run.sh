#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Symphony Orchestrator — starting dev server"

# Run the TypeScript dev server with hot-reload
# This watches src/ and restarts on changes via tsx
exec pnpm run dev
