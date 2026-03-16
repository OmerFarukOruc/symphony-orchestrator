#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec docker build --pull -f "$SCRIPT_DIR/Dockerfile.sandbox" -t symphony-codex:latest "$SCRIPT_DIR"
