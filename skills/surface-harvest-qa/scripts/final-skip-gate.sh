#!/usr/bin/env bash
set -euo pipefail

MANIFEST="${1:?Usage: final-skip-gate.sh <surface-manifest.md> [seed-file]}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SEED="${2:-${SKILL_DIR}/references/surface-seed.md}"
BLOCKED_RATIO_MAX="${SURFACE_HARVEST_FINAL_BLOCKED_RATIO_MAX:-0.50}"
PROVEN_RATIO_MIN="${SURFACE_HARVEST_FINAL_PROVEN_RATIO_MIN:-0.60}"

if [[ ! -f "${MANIFEST}" ]]; then
  echo "Error: manifest not found at ${MANIFEST}" >&2
  exit 1
fi

if [[ ! -f "${SEED}" ]]; then
  echo "Error: seed file not found at ${SEED}" >&2
  exit 1
fi

python3 - "${MANIFEST}" "${SEED}" "${BLOCKED_RATIO_MAX}" "${PROVEN_RATIO_MIN}" <<'PY'
from __future__ import annotations

import collections
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


def normalize_status(raw: str) -> str | None:
    value = raw.strip()
    if value == "**FAIL**":
        return "FAIL"
    if value in {"", "-", "—"}:
        return None
    if value in STATUS_VALUES:
        return value
    return None


def extract_statuses(parts: list[str]) -> tuple[list[tuple[str, str]], str]:
    if len(parts) < 5:
        return [], "no reason provided"

    if len(parts) >= 6 and VIEWPORT_PATTERN.match(parts[5].strip()):
        status = normalize_status(parts[4])
        reason = parts[6] if len(parts) > 6 and parts[6].strip() else "no reason provided"
        return ([(parts[5].strip(), status)] if status else []), reason

    statuses: list[tuple[str, str]] = []
    for viewport, raw in (("2560x1440", parts[4]), ("1920x1080", parts[5] if len(parts) > 5 else "")):
        status = normalize_status(raw)
        if status:
            statuses.append((viewport, status))

    reason_candidates = []
    for index in (8, 7, 6):
        if len(parts) > index and parts[index].strip():
            reason_candidates.append(parts[index].strip())
    reason = reason_candidates[0] if reason_candidates else "no reason provided"
    return statuses, reason


def blocked_reason_is_concrete(reason: str) -> bool:
    lowered = reason.lower()
    if not lowered or lowered == "no reason provided":
        return False
    if any(pattern in lowered for pattern in GENERIC_BLOCKED_PATTERNS):
        return False
    return any(hint in lowered for hint in ESCALATION_HINTS)


manifest_path = Path(sys.argv[1])
seed_path = Path(sys.argv[2])
blocked_ratio_max = float(sys.argv[3])
proven_ratio_min = float(sys.argv[4])

skip_reasons: collections.Counter[str] = collections.Counter()
skip_examples: dict[str, list[str]] = collections.defaultdict(list)
weak_blocked_entries: list[str] = []
manifest_ids: set[str] = set()
blocked_count = 0
proven_count = 0

seed_ids = {
    line.split("|")[0].strip()
    for line in seed_path.read_text().splitlines()
    if re.match(r"^SURFACE-\d+\b", line)
}

for line in manifest_path.read_text().splitlines():
    if not line.startswith("| SURFACE-"):
        continue
    parts = [part.strip() for part in line.split("|")[1:-1]]
    if len(parts) < 5:
        continue
    surface_id, route, surface_type, description = parts[:4]
    manifest_ids.add(surface_id)
    statuses, reason = extract_statuses(parts)
    row_statuses = {status for _, status in statuses}

    if row_statuses & PROVEN_STATUSES:
        proven_count += 1
    if "BLOCKED" in row_statuses:
        blocked_count += 1
        if not blocked_reason_is_concrete(reason):
            weak_blocked_entries.append(f"{surface_id} {route} {description} :: {reason}")

    skip_viewports = [viewport for viewport, status in statuses if status == "SKIP"]
    if skip_viewports:
        skip_reasons[reason] += 1
        if len(skip_examples[reason]) < 3:
            viewport_label = ", ".join(skip_viewports)
            skip_examples[reason].append(f"{surface_id} {route} {description} [{viewport_label}]")

missing_seed_ids = sorted(seed_ids - manifest_ids)
total = len(seed_ids) if seed_ids else len(manifest_ids)
blocked_ratio = (blocked_count / total) if total else 0.0
proven_ratio = (proven_count / total) if total else 0.0

errors: list[str] = []
if skip_reasons:
    errors.append("SKIP surfaces remain in the manifest")
if missing_seed_ids:
    errors.append(f"manifest is missing {len(missing_seed_ids)} seeded surface row(s)")
if weak_blocked_entries:
    errors.append(f"{len(weak_blocked_entries)} BLOCKED surface(s) lack concrete escalation evidence")
if blocked_ratio > blocked_ratio_max:
    errors.append(f"BLOCKED ratio {blocked_ratio:.1%} exceeds {blocked_ratio_max:.0%}")
if proven_ratio < proven_ratio_min:
    errors.append(f"proof ratio (PASS+FAIL+FLAKY) {proven_ratio:.1%} is below {proven_ratio_min:.0%}")

if not errors:
    print(
        "PASS: manifest passed closeout quality gates "
        f"(proof ratio {proven_ratio:.1%}, blocked ratio {blocked_ratio:.1%}, "
        f"seed rows {len(manifest_ids)}/{total})"
    )
    raise SystemExit(0)

print("FAIL: manifest failed closeout quality gates")
for error in errors:
    print(f"- {error}")

if skip_reasons:
    print()
    print("SKIP reasons:")
    for reason, count in skip_reasons.most_common():
        print(f"- {count} x {reason}")
        for example in skip_examples[reason]:
            print(f"  - {example}")

if weak_blocked_entries:
    print()
    print("Weak BLOCKED entries:")
    for entry in weak_blocked_entries[:20]:
        print(f"- {entry}")

if missing_seed_ids:
    print()
    print("Missing seeded rows:")
    for surface_id in missing_seed_ids[:20]:
        print(f"- {surface_id}")

raise SystemExit(1)
PY
