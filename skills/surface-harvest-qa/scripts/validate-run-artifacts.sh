#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: validate-run-artifacts.sh <run-dir> \
  [--seed-file <seed-file>] \
  [--require-viewport-log <viewport>]... \
  [--require-page-screenshots <viewport>]...

Hard-fails a surface-harvest run when the retained artifacts are inconsistent.
Current checks:
- manifest contains at least one surface row and at least one route
- required viewport logs exist and contain at least one JSONL entry
- required page-level screenshots exist for requested viewports
- captured step logs under meta/ do not contain "command not found"
- report.html exists, includes per-route data, and matches manifest totals
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

RUN_DIR="$1"
shift

SEED_FILE=""
declare -a REQUIRED_VIEWPORTS=()
declare -a PAGE_SCREENSHOT_VIEWPORTS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed-file)
      if [[ $# -lt 2 ]]; then
        usage
        exit 1
      fi
      SEED_FILE="$2"
      shift 2
      ;;
    --require-viewport-log)
      if [[ $# -lt 2 ]]; then
        usage
        exit 1
      fi
      REQUIRED_VIEWPORTS+=("$2")
      shift 2
      ;;
    --require-page-screenshots)
      if [[ $# -lt 2 ]]; then
        usage
        exit 1
      fi
      PAGE_SCREENSHOT_VIEWPORTS+=("$2")
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

REQUIRED_VIEWPORTS_CSV="$(IFS=,; echo "${REQUIRED_VIEWPORTS[*]}")"
PAGE_SCREENSHOT_VIEWPORTS_CSV="$(IFS=,; echo "${PAGE_SCREENSHOT_VIEWPORTS[*]}")"

python3 - "${RUN_DIR}" "${SEED_FILE}" "${REQUIRED_VIEWPORTS_CSV}" "${PAGE_SCREENSHOT_VIEWPORTS_CSV}" <<'PY'
from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path


def normalize_status(raw: str) -> str | None:
    cleaned = re.sub(r"[*_`]", "", raw or "").strip().upper()
    if cleaned in {"", "—", "-", "N/A"}:
        return None
    aliases = {
        "PASSED": "PASS",
        "FAILED": "FAIL",
        "BLOCK": "BLOCKED",
        "BLOCKER": "BLOCKED",
        "SKIPPED": "SKIP",
    }
    return aliases.get(cleaned, cleaned)


def parse_manifest_rows(text: str) -> list[dict[str, str | None]]:
    rows: list[dict[str, str | None]] = []
    in_surface_table = False
    for line in text.splitlines():
        if line.startswith("| Surface ID |"):
            in_surface_table = True
            continue
        if line.startswith("| SURFACE-"):
            in_surface_table = True
        if not in_surface_table:
            continue
        if not line.startswith("|"):
            if rows:
                break
            continue
        if re.match(r"^\|\s*-+\s*\|", line):
            continue
        cols = [col.strip() for col in line.split("|")[1:-1]]
        if len(cols) < 6 or not cols[0].startswith("SURFACE-"):
            continue
        rows.append(
            {
                "surface_id": cols[0],
                "route": cols[1],
                "status_2560": normalize_status(cols[4]),
                "status_1920": normalize_status(cols[5]) if len(cols) > 5 else None,
            }
        )
    return rows


def classify_row(row: dict[str, str | None]) -> str:
    statuses = [row.get("status_2560"), row.get("status_1920")]
    for status in ("SKIP", "BLOCKED", "FAIL", "FLAKY", "PASS"):
        if status in statuses:
            return status
    return "SKIP"


def count_jsonl_entries(path: Path) -> int:
    if not path.exists():
        return 0
    count = 0
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if stripped and stripped != "[]":
            count += 1
    return count


def extract_metric(report_text: str, label: str) -> int | None:
    pattern = re.compile(
        rf'<div class="metric"><div class="metric-value(?: [^"]+)?">(\d+)</div><div class="metric-label">{re.escape(label)}</div></div>'
    )
    match = pattern.search(report_text)
    return int(match.group(1)) if match else None


def parse_seed_page_ids(seed_path: Path) -> list[str]:
    if not seed_path.exists():
        return []
    page_ids: list[str] = []
    for line in seed_path.read_text().splitlines():
        if not line.startswith("SURFACE-"):
            continue
        parts = [part.strip() for part in line.split("|")]
        if len(parts) < 4:
            continue
        surface_id, route, surface_type, description = parts[:4]
        if surface_type != "page":
            continue
        if route in {"/unknown", "/config", "/secrets", "/welcome"}:
            continue
        if "alias" in description.lower():
            continue
        page_ids.append(surface_id)
    return page_ids


run_dir = Path(sys.argv[1]).resolve()
seed_file_arg = sys.argv[2]
required_viewports = [item for item in sys.argv[3].split(",") if item]
page_screenshot_viewports = [item for item in sys.argv[4].split(",") if item]

errors: list[str] = []

if not run_dir.is_dir():
    errors.append(f"run directory not found: {run_dir}")
else:
    manifest_path = run_dir / "surface-manifest.md"
    summary_path = run_dir / "coverage-summary.md"
    report_path = run_dir / "report.html"
    meta_dir = run_dir / "meta"

    if not manifest_path.exists():
        errors.append(f"missing manifest: {manifest_path}")
        manifest_rows: list[dict[str, str | None]] = []
    else:
        manifest_rows = parse_manifest_rows(manifest_path.read_text())
        if not manifest_rows:
            errors.append("manifest parsed zero surface rows")

    route_names = {str(row["route"]).strip() for row in manifest_rows if str(row["route"]).strip()}
    if not route_names:
        errors.append("manifest produced zero routes")

    for viewport in required_viewports:
        log_path = run_dir / viewport / "logs" / "session.jsonl"
        if count_jsonl_entries(log_path) == 0:
            errors.append(f"required viewport log is empty: {log_path}")

    if meta_dir.exists():
        for captured_log in sorted(meta_dir.rglob("*")):
            if not captured_log.is_file():
                continue
            if captured_log.suffix.lower() not in {".log", ".txt"}:
                continue
            text = captured_log.read_text(errors="replace")
            if re.search(r"(^|: )command not found", text, flags=re.IGNORECASE | re.MULTILINE):
                errors.append(f"captured command output contains 'command not found': {captured_log}")

    if not summary_path.exists():
        errors.append(f"missing coverage summary: {summary_path}")

    if not report_path.exists():
        errors.append(f"missing report: {report_path}")
    else:
        report_text = report_path.read_text(errors="replace")
        if "No per-route data found in surface-manifest.md" in report_text:
            errors.append("report rendered zero routes")

        manifest_counts = Counter(classify_row(row) for row in manifest_rows)
        expected_metrics = {
            "Total Surfaces": len(manifest_rows),
            "Pass": manifest_counts.get("PASS", 0),
            "Fail": manifest_counts.get("FAIL", 0),
            "Blocked": manifest_counts.get("BLOCKED", 0),
            "Skipped": manifest_counts.get("SKIP", 0),
        }
        for label, expected in expected_metrics.items():
            actual = extract_metric(report_text, label)
            if actual is None:
                errors.append(f"report is missing metric '{label}'")
                continue
            if actual != expected:
                errors.append(f"report metric mismatch for {label}: expected {expected}, got {actual}")

    if page_screenshot_viewports:
        seed_path = Path(seed_file_arg) if seed_file_arg else run_dir / "surface-seed.md"
        seed_page_ids = parse_seed_page_ids(seed_path)
        if not seed_page_ids:
            errors.append(f"could not load seeded page surfaces from {seed_path}")
        else:
            for viewport in page_screenshot_viewports:
                screenshot_dir = run_dir / viewport / "screenshots"
                screenshot_names = {path.name for path in screenshot_dir.rglob("*.png")} if screenshot_dir.exists() else set()
                missing_page_ids = [surface_id for surface_id in seed_page_ids if not any(surface_id in name for name in screenshot_names)]
                if missing_page_ids:
                    errors.append(
                        f"viewport {viewport} is missing seeded page screenshots for {len(missing_page_ids)} page surface(s)"
                    )

if errors:
    print("FAIL: retained run artifacts are inconsistent")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print("PASS: retained run artifacts passed validation")
PY
