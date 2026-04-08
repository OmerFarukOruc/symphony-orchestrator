#!/usr/bin/env bash
set -euo pipefail

MANIFEST="${1:?Usage: seed-coverage-gate.sh <surface-manifest.md> [seed-file]}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SEED="${2:-${SKILL_DIR}/references/surface-seed.md}"

if [[ ! -f "${MANIFEST}" ]]; then
  echo "Error: manifest not found at ${MANIFEST}" >&2
  exit 1
fi

if [[ ! -f "${SEED}" ]]; then
  echo "Error: seed file not found at ${SEED}" >&2
  exit 1
fi

python3 - "${MANIFEST}" "${SEED}" <<'PY'
from __future__ import annotations

import sys
import re
from pathlib import Path

manifest_path = Path(sys.argv[1])
seed_path = Path(sys.argv[2])

manifest_ids = {
    line.split("|")[1].strip()
    for line in manifest_path.read_text().splitlines()
    if line.startswith("| SURFACE-")
}
seed_ids = {
    line.split("|")[0].strip()
    for line in seed_path.read_text().splitlines()
    if re.match(r"^SURFACE-\d+\b", line)
}

missing = sorted(seed_ids - manifest_ids)
if missing:
    print("FAIL: manifest is missing seeded surfaces")
    for surface_id in missing[:50]:
        print(f"- {surface_id}")
    if len(missing) > 50:
        print(f"- ... and {len(missing) - 50} more")
    raise SystemExit(1)

print(f"PASS: manifest includes all {len(seed_ids)} seeded surfaces")
PY
