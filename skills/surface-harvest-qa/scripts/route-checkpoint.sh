#!/usr/bin/env bash
set -euo pipefail

# route-checkpoint.sh — Blocks progression when route proof quality is too weak
#
# Usage: bash route-checkpoint.sh <route> <manifest-file> [seed-file]
#
# Hard-fails when:
# - a seeded surface for the route is missing from the manifest
# - any SKIP remains
# - BLOCKED dominates the route
# - PASS/FAIL/FLAKY proof is below the route floor
# - BLOCKED rows do not record concrete escalation evidence

ROUTE="${1:?Usage: route-checkpoint.sh <route> <manifest-file> [seed-file]}"
MANIFEST="${2:?Usage: route-checkpoint.sh <route> <manifest-file> [seed-file]}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SEED="${3:-${SKILL_DIR}/references/surface-seed.md}"
BLOCKED_RATIO_MAX="${SURFACE_HARVEST_ROUTE_BLOCKED_RATIO_MAX:-0.40}"
PROVEN_RATIO_MIN="${SURFACE_HARVEST_ROUTE_PROVEN_RATIO_MIN:-0.40}"

if [[ ! -f "${MANIFEST}" ]]; then
  echo "Error: manifest not found at ${MANIFEST}" >&2
  exit 1
fi

if [[ ! -f "${SEED}" ]]; then
  echo "Error: seed file not found at ${SEED}" >&2
  exit 1
fi

python3 - "${ROUTE}" "${MANIFEST}" "${SEED}" "${BLOCKED_RATIO_MAX}" "${PROVEN_RATIO_MIN}" <<'PY'
from __future__ import annotations

import re
import sys
from pathlib import Path

STATUS_VALUES = {"PASS", "FAIL", "FLAKY", "BLOCKED", "SKIP"}
PROVEN_STATUSES = {"PASS", "FAIL", "FLAKY"}
VIEWPORT_PATTERN = re.compile(r"^\d{3,4}x\d{3,4}$")
GENERIC_BLOCKED_PATTERNS = (
    "requires additional seeded state",
    "deeper per-surface interaction",
    "destructive mutation",
    "not explicitly tested",
    "would need",
    "unavailable in this run",
    "not executed in this pass",
    "insufficient data",
)
ESCALATION_HINTS = (
    "mock",
    "network route",
    "customevent",
    "dispatch",
    "event injection",
    "harness",
    "chunk import",
    "store",
    "seeded state impossible",
    "destructive",
    "live backend",
)
RECIPES = {
    "sse-event": "Inject via window.dispatchEvent(new CustomEvent(...))",
    "state-variation": "Use network route to mock loading/empty/error state",
    "shortcut": "Click main, press the key sequence, and verify navigation or state change",
    "modal": "Override confirm() if needed, trigger open, verify focus trap and close paths",
    "toast": "Dispatch a CustomEvent, wait briefly, then screenshot and verify the message",
}


def normalize_status(raw: str) -> str | None:
    value = raw.strip()
    if value == "**FAIL**":
        return "FAIL"
    if value in {"", "-", "—"}:
        return None
    if value in STATUS_VALUES:
        return value
    return None


def extract_statuses(parts: list[str]) -> list[tuple[str, str]]:
    if len(parts) < 5:
        return []
    if len(parts) >= 6 and VIEWPORT_PATTERN.match(parts[5].strip()):
        status = normalize_status(parts[4])
        return [(parts[5].strip(), status)] if status else []

    statuses: list[tuple[str, str]] = []
    for viewport, raw in (("2560x1440", parts[4]), ("1920x1080", parts[5] if len(parts) > 5 else "")):
        status = normalize_status(raw)
        if status:
            statuses.append((viewport, status))
    return statuses


def extract_context(parts: list[str]) -> str:
    return " | ".join(chunk.strip() for chunk in parts[6:] if chunk.strip())


def blocked_reason_is_concrete(context: str) -> bool:
    lowered = context.lower()
    if not lowered or lowered == "no reason provided":
        return False
    if any(pattern in lowered for pattern in GENERIC_BLOCKED_PATTERNS):
        return False
    return any(hint in lowered for hint in ESCALATION_HINTS)


route = sys.argv[1]
manifest_path = Path(sys.argv[2])
seed_path = Path(sys.argv[3])
blocked_ratio_max = float(sys.argv[4])
proven_ratio_min = float(sys.argv[5])

seed_surface_ids: set[str] = set()
for line in seed_path.read_text().splitlines():
    if not re.match(r"^SURFACE-\d+\b", line):
        continue
    parts = [part.strip() for part in line.split("|")]
    if len(parts) < 2:
        continue
    if parts[1] == route:
        seed_surface_ids.add(parts[0])

manifest_surface_ids: set[str] = set()
skip_entries: list[dict[str, str]] = []
weak_blocked_entries: list[dict[str, str]] = []
blocked_count = 0
proven_count = 0

for line in manifest_path.read_text().splitlines():
    if not line.startswith("| SURFACE-"):
        continue
    parts = [part.strip() for part in line.split("|")[1:-1]]
    if len(parts) < 5:
        continue
    surface_id, surface_route, surface_type, description = parts[:4]
    if surface_route != route:
        continue

    manifest_surface_ids.add(surface_id)
    statuses = extract_statuses(parts)
    row_statuses = {status for _, status in statuses}
    context = extract_context(parts)

    if row_statuses & PROVEN_STATUSES:
        proven_count += 1
    if "BLOCKED" in row_statuses:
        blocked_count += 1
        if not blocked_reason_is_concrete(context):
            weak_blocked_entries.append(
                {
                    "surface_id": surface_id,
                    "surface_type": surface_type,
                    "description": description,
                    "context": context or "no context provided",
                }
            )

    skip_viewports = [viewport for viewport, status in statuses if status == "SKIP"]
    if skip_viewports:
        skip_entries.append(
            {
                "surface_id": surface_id,
                "surface_type": surface_type,
                "description": description,
                "reason": context or "no reason provided",
                "viewports": ", ".join(skip_viewports),
                "recipe": RECIPES.get(surface_type, "Navigate, expand the subsurface, screenshot it, and verify the rendered content."),
            }
        )

missing_seed_ids = sorted(seed_surface_ids - manifest_surface_ids)
route_total = len(seed_surface_ids) or len(manifest_surface_ids)
blocked_ratio = (blocked_count / route_total) if route_total else 0.0
proven_ratio = (proven_count / route_total) if route_total else 0.0

errors: list[str] = []
if missing_seed_ids:
    errors.append(f"missing {len(missing_seed_ids)} seeded surface row(s)")
if skip_entries:
    errors.append(f"{len(skip_entries)} surface(s) still marked SKIP")
if weak_blocked_entries:
    errors.append(f"{len(weak_blocked_entries)} BLOCKED surface(s) lack concrete escalation evidence")
if blocked_ratio > blocked_ratio_max:
    errors.append(f"BLOCKED ratio {blocked_ratio:.1%} exceeds {blocked_ratio_max:.0%}")
if proven_ratio < proven_ratio_min:
    errors.append(f"proof ratio (PASS+FAIL+FLAKY) {proven_ratio:.1%} is below {proven_ratio_min:.0%}")

if not errors:
    print(
        f"PASS: route {route} cleared. "
        f"Proof ratio {proven_ratio:.1%}, blocked ratio {blocked_ratio:.1%}, "
        f"seed rows present {len(manifest_surface_ids)}/{route_total}."
    )
    raise SystemExit(0)

print(f"FAIL: route checkpoint failed for {route}")
for error in errors:
    print(f"- {error}")

if missing_seed_ids:
    print()
    print("Missing seeded surface rows:")
    for surface_id in missing_seed_ids[:20]:
        print(f"  - {surface_id}")

if skip_entries:
    print()
    print("SKIP entries:")
    for entry in skip_entries[:20]:
        print(f"  - {entry['surface_id']} ({entry['surface_type']}): {entry['description']} [{entry['viewports']}]")
        print(f"    Reason given: {entry['reason']}")
        print(f"    Recipe: {entry['recipe']}")

if weak_blocked_entries:
    print()
    print("Weak BLOCKED entries:")
    for entry in weak_blocked_entries[:20]:
        print(f"  - {entry['surface_id']} ({entry['surface_type']}): {entry['description']}")
        print(f"    Context: {entry['context']}")

raise SystemExit(1)
PY
