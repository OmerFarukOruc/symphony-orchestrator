#!/usr/bin/env bash
# Sync GitHub issue labels for symphony-orchestrator.
# Run: bash scripts/sync-labels.sh

set -euo pipefail

REPO="OmerFarukOruc/symphony-orchestrator"

labels=(
  # Priority
  "P0: critical|b60205|Immediate attention required"
  "P1: high|d93f0b|Should fix this sprint"
  "P2: medium|fbca04|Plan for upcoming sprint"
  "P3: low|0e8a16|Nice to have"
  # Type
  "bug|d73a4a|Something is broken"
  "enhancement|a2eeef|New feature or improvement"
  "chore|e4e669|Maintenance and housekeeping"
  "documentation|0075ca|Documentation updates"
  # Area
  "area: core|5319e7|Orchestrator and agent runner"
  "area: api|1d76db|HTTP API and endpoints"
  "area: dashboard|bfd4f2|Web dashboard UI"
  "area: infra|d4c5f9|CI/CD, tooling, infrastructure"
  # Workflow
  "triage|ededed|Needs initial review"
  "good first issue|7057ff|Good for newcomers"
)

for entry in "${labels[@]}"; do
  IFS='|' read -r name color description <<< "$entry"
  echo "→ $name"
  gh label create "$name" --repo "$REPO" --color "$color" --description "$description" --force 2>/dev/null || true
done

echo "✅ Labels synced."
