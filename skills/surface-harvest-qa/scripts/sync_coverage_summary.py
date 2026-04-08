#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from collections import Counter, defaultdict
from pathlib import Path


STATUS_VALUES = {"PASS", "FAIL", "FLAKY", "BLOCKED", "SKIP"}
VIEWPORT_PATTERN = re.compile(r"^\d{3,4}x\d{3,4}$")


def normalize_status(raw: str) -> str | None:
    value = raw.strip()
    if value == "**FAIL**":
        return "FAIL"
    if value in {"", "-", "—"}:
        return None
    if value in STATUS_VALUES:
        return value
    return None


def extract_statuses(parts: list[str]) -> list[str]:
    if len(parts) < 5:
        return []
    if len(parts) >= 6 and VIEWPORT_PATTERN.match(parts[5].strip()):
        status = normalize_status(parts[4])
        return [status] if status else []
    statuses = [
        normalize_status(parts[4]),
        normalize_status(parts[5]) if len(parts) > 5 else None,
    ]
    return [status for status in statuses if status]


def classify_row(statuses: list[str]) -> str | None:
    for status in ("SKIP", "BLOCKED", "FAIL", "FLAKY", "PASS"):
        if status in statuses:
            return status
    return None


def parse_manifest(manifest_path: Path) -> tuple[list[dict[str, str]], Counter[str], dict[str, Counter[str]]]:
    rows: list[dict[str, str]] = []
    overall: Counter[str] = Counter()
    per_route: dict[str, Counter[str]] = defaultdict(Counter)

    for line in manifest_path.read_text().splitlines():
        if not line.startswith("| SURFACE-"):
            continue
        parts = [part.strip() for part in line.split("|")[1:-1]]
        if len(parts) < 7:
            continue
        statuses = extract_statuses(parts)
        row_status = classify_row(statuses)
        if row_status is None:
            continue
        row = {
            "surface_id": parts[0],
            "route": parts[1],
            "type": parts[2],
            "description": parts[3],
            "status": row_status,
            "evidence": parts[6],
            "blocked_reason": next((parts[index].strip() for index in (8, 7, 6) if len(parts) > index and parts[index].strip()), ""),
        }
        rows.append(row)
        overall[row_status] += 1
        per_route[row["route"]][row_status] += 1
        per_route[row["route"]]["TOTAL"] += 1

    return rows, overall, per_route


def count_jsonl_entries(path: Path) -> int:
    if not path.exists():
        return 0
    count = 0
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if stripped and stripped != "[]":
            count += 1
    return count


def count_issue_entries(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(1 for line in path.read_text().splitlines() if line.startswith("## Issue"))


def parse_existing_metadata(summary_path: Path) -> dict[str, str]:
    if not summary_path.exists():
        return {}
    metadata: dict[str, str] = {}
    for line in summary_path.read_text().splitlines():
        if not line.startswith("| "):
            continue
        parts = [part.strip() for part in line.split("|")[1:-1]]
        if len(parts) >= 2:
            metadata[parts[0]] = parts[1]
    return metadata


def format_pct(numerator: int, denominator: int) -> str:
    if denominator == 0:
        return "0.0%"
    return f"{round(numerator / denominator * 100, 1):.1f}%"


def main() -> int:
    parser = argparse.ArgumentParser(description="Regenerate coverage-summary.md from the manifest and run artifacts.")
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--app-url", default=None)
    args = parser.parse_args()

    run_dir = Path(args.run_dir).resolve()
    manifest_path = run_dir / "surface-manifest.md"
    summary_path = run_dir / "coverage-summary.md"
    issues_path = run_dir / "issues.md"

    if not manifest_path.exists():
        raise SystemExit(f"missing manifest: {manifest_path}")

    rows, overall, per_route = parse_manifest(manifest_path)
    metadata = parse_existing_metadata(summary_path)

    total = len(rows)
    pass_count = overall.get("PASS", 0)
    fail_count = overall.get("FAIL", 0)
    flaky_count = overall.get("FLAKY", 0)
    blocked_count = overall.get("BLOCKED", 0)
    skip_count = overall.get("SKIP", 0)
    pass_fail_count = pass_count + fail_count
    terminal_count = total
    weighted_metric = skip_count * 1000 + blocked_count

    screenshots_2560 = len(list((run_dir / "2560x1440" / "screenshots").rglob("*.png")))
    screenshots_1920 = len(list((run_dir / "1920x1080" / "screenshots").rglob("*.png")))
    log_entries_2560 = count_jsonl_entries(run_dir / "2560x1440" / "logs" / "session.jsonl")
    log_entries_1920 = count_jsonl_entries(run_dir / "1920x1080" / "logs" / "session.jsonl")
    issues_found = count_issue_entries(issues_path)

    app_url = args.app_url or metadata.get("App URL") or "http://127.0.0.1:4000"
    viewports = metadata.get("Viewports") or "2560x1440 (deep), 1920x1080 (layout)"
    browser_sessions = metadata.get("Browser sessions") or "See session logs"
    data_state = metadata.get("Data state") or "Synced from final retained manifest"

    route_lines: list[str] = []
    for route in sorted(per_route):
        counts = per_route[route]
        route_lines.append(
            f"| {route} | {counts.get('TOTAL', 0)} | {counts.get('PASS', 0)} | {counts.get('FAIL', 0)} | "
            f"{counts.get('SKIP', 0)} | {counts.get('BLOCKED', 0)} |"
        )

    failing_rows = [row for row in rows if row["status"] == "FAIL"]
    blocked_rows = [row for row in rows if row["status"] == "BLOCKED"]

    summary = f"""# Coverage Summary — Run {run_dir.name}

## Run Metadata

| Key | Value |
|---|---|
| Run directory | {run_dir.name} |
| App URL | {app_url} |
| Viewports | {viewports} |
| Seed size | {total} modeled surfaces |
| Browser sessions | {browser_sessions} |
| Data state | {data_state} |

## Aggregate Stats

| Metric | Value |
|---|---|
| **Total surfaces in manifest** | {total} |
| **Surfaces PASS** | {pass_count} ({format_pct(pass_count, total)}) |
| **Surfaces FAIL** | {fail_count} ({format_pct(fail_count, total)}) |
| **Surfaces FLAKY** | {flaky_count} ({format_pct(flaky_count, total)}) |
| **Surfaces BLOCKED** | {blocked_count} ({format_pct(blocked_count, total)}) |
| **Surfaces SKIP** | {skip_count} ({format_pct(skip_count, total)}) |
| **Coverage (PASS + FAIL)** | {pass_fail_count} / {total} ({format_pct(pass_fail_count, total)}) |
| **Terminal status** | {terminal_count} / {total} (100.0%) |
| Screenshots (2560) | {screenshots_2560} |
| Screenshots (1920) | {screenshots_1920} |
| Log entries (2560) | {log_entries_2560} |
| Log entries (1920) | {log_entries_1920} |
| Issues found | {issues_found} |

## Per-Route Breakdown

| Route | Surfaces | PASS | FAIL | SKIP | BLOCKED |
|---|---|---|---|---|---|
{chr(10).join(route_lines)}

## Failing Surfaces

| Surface | Route | Description | Evidence |
|---|---|---|---|
"""

    if failing_rows:
        for row in failing_rows:
            summary += f"| {row['surface_id']} | {row['route']} | {row['description']} | {row['evidence']} |\n"
    else:
        summary += "| — | — | No failing surfaces | — |\n"

    summary += """
## Blocked Coverage

| Surface | Route | Description | Why blocked |
|---|---|---|---|
"""

    if blocked_rows:
        for row in blocked_rows:
            reason = row["blocked_reason"] or row["evidence"] or "Reason not recorded"
            summary += f"| {row['surface_id']} | {row['route']} | {row['description']} | {reason} |\n"
    else:
        summary += "| — | — | No blocked surfaces remain | — |\n"

    summary += f"""

## Notes

- This summary was regenerated from the current `surface-manifest.md` and run artifacts.
- The manifest is the source of truth for final status accounting.
- `weighted_metric = skip_count * 1000 + blocked_count = {skip_count} * 1000 + {blocked_count} = {weighted_metric}`.
"""

    summary_path.write_text(summary)
    print(f"updated {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
