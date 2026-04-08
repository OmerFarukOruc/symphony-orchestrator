#!/usr/bin/env bash
set -euo pipefail

# generate-report.sh — Builds report.html from run artifacts
#
# Usage: ./generate-report.sh <run-dir>
#
# Reads: surface-manifest.md, issues.md, coverage-summary.md, screenshots/, session.jsonl
# Outputs: report.html (self-contained, screenshots base64-embedded)

RUN_DIR="${1:?Usage: generate-report.sh <run-dir>}"
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ ! -d "$RUN_DIR" ]]; then
  echo "Error: Run directory not found: $RUN_DIR" >&2
  exit 1
fi

command -v python3 >/dev/null 2>&1 || { echo "Error: python3 is required" >&2; exit 1; }

python3 - "$RUN_DIR" "$SKILL_DIR" << 'PYEOF'
import json, sys, base64, re
from pathlib import Path
from datetime import datetime, timezone

RUN_DIR = sys.argv[1]
SKILL_DIR = sys.argv[2] if len(sys.argv) > 2 else ""

run = Path(RUN_DIR)
report_path = run / "report.html"

# ── Read run data ─────────────────────────────────────────────────────────────

coverage_text = (run / "coverage-summary.md").read_text() if (run / "coverage-summary.md").exists() else ""
issues_text = (run / "issues.md").read_text() if (run / "issues.md").exists() else ""
manifest_text = (run / "surface-manifest.md").read_text() if (run / "surface-manifest.md").exists() else ""

# Parse metadata from coverage summary
def extract(pattern, text, default="0"):
    m = re.search(pattern, text)
    return m.group(1) if m else default

target_url = extract(r'(?:App URL|Target|localhost)\S*\s*\|?\s*(http\S+)', coverage_text, "localhost:4000")
start_ts = extract(r'Started\s*\|?\s*(\S+)', coverage_text, "unknown")
end_ts = extract(r'Completed\s*\|?\s*(\S+)', coverage_text, "unknown")

def normalize_status(raw):
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

def extract_manifest_rows(text):
    rows = []
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
        rows.append({
            "surface_id": cols[0],
            "route": cols[1],
            "type": cols[2],
            "description": cols[3],
            "status_2560": normalize_status(cols[4]),
            "status_1920": normalize_status(cols[5]),
            "evidence": cols[6] if len(cols) > 6 else "",
        })
    return rows

manifest_rows = extract_manifest_rows(manifest_text)

if not manifest_rows:
    raise SystemExit("FAIL: report generation parsed zero surface rows from surface-manifest.md")

status_counts = {"PASS": 0, "FAIL": 0, "BLOCKED": 0, "SKIP": 0}
route_totals = {}
for row in manifest_rows:
    status = row["status_2560"] or row["status_1920"] or "SKIP"
    status_counts.setdefault(status, 0)
    status_counts[status] += 1

    route = row["route"] or "/unknown"
    bucket = route_totals.setdefault(route, {"PASS": 0, "FAIL": 0, "BLOCKED": 0, "SKIP": 0})
    bucket.setdefault(status, 0)
    bucket[status] += 1

pass_count = status_counts.get("PASS", 0)
fail_count = status_counts.get("FAIL", 0)
blocked_count = status_counts.get("BLOCKED", 0)
skip_count = status_counts.get("SKIP", 0)
total = len(manifest_rows) or (pass_count + fail_count + blocked_count + skip_count) or 1
pass_pct = round(pass_count / total * 100, 1)
total_count = total

# ── Collect screenshots ───────────────────────────────────────────────────────

screenshots = []
for viewport in ["2560x1440", "1920x1080"]:
    ss_dir = run / viewport / "screenshots"
    if ss_dir.exists():
        for png in sorted(ss_dir.rglob("*.png")):
            rel = png.relative_to(run)
            size_kb = png.stat().st_size // 1024
            b64 = base64.b64encode(png.read_bytes()).decode()
            screenshots.append({
                "path": str(rel),
                "name": png.stem,
                "viewport": viewport,
                "route": png.parent.name,
                "b64": b64,
                "size_kb": size_kb,
            })

# ── Collect session log entries ───────────────────────────────────────────────

log_entries = []
for viewport in ["2560x1440", "1920x1080"]:
    log_file = run / viewport / "logs" / "session.jsonl"
    if log_file.exists():
        for line in log_file.read_text().strip().split("\n"):
            if line.strip() and line.strip() not in ("[]", ""):
                try:
                    entry = json.loads(line)
                    entry["viewport"] = viewport
                    log_entries.append(entry)
                except json.JSONDecodeError:
                    pass

# ── Parse issues ──────────────────────────────────────────────────────────────

issues = []
current_issue = None
for line in issues_text.split("\n"):
    if line.startswith("## Issue") or line.startswith("## ISSUE"):
        if current_issue:
            issues.append(current_issue)
        current_issue = {"title": line.lstrip("#").strip(), "body": ""}
    elif current_issue is not None:
        current_issue["body"] += line + "\n"
if current_issue:
    issues.append(current_issue)

# ── Build per-route breakdown from manifest ───────────────────────────────────

route_sections = []
for route_name in sorted(route_totals, key=lambda value: (value != "*", value)):
    counts = route_totals[route_name]
    route_sections.append({
        "route": route_name,
        "pass": counts.get("PASS", 0),
        "fail": counts.get("FAIL", 0),
        "blocked": counts.get("BLOCKED", 0),
        "skip": counts.get("SKIP", 0),
    })

if not route_sections:
    raise SystemExit("FAIL: report generation produced zero routes from surface-manifest.md")

# ── Build HTML ────────────────────────────────────────────────────────────────

gauge_class = "high" if pass_pct >= 70 else ("mid" if pass_pct >= 40 else "low")
gauge_offset = 314 - (314 * pass_pct / 100)

def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

def badge_class_for_result(result):
    normalized = (result or "").strip().upper()
    if normalized in {"SUCCESS", "PASS"}:
        return "pass"
    if normalized in {"FAIL", "FAILED", "ERROR"}:
        return "fail"
    if normalized == "BLOCKED":
        return "blocked"
    if normalized in {"SKIP", "SKIPPED"}:
        return "skip"
    return "viewport"

# Screenshot gallery HTML
ss_html = ""
for ss in screenshots:
    ss_html += f'''
    <div class="screenshot-card" data-viewport="{ss['viewport']}">
      <img src="data:image/png;base64,{ss['b64']}" alt="{esc(ss['name'])}" loading="lazy">
      <div class="screenshot-meta">
        <span class="badge badge-viewport">{ss['viewport'].split('x')[0]}</span>
        <span>{esc(ss['name'])}</span>
        <span class="text-muted">{ss['size_kb']}KB</span>
      </div>
    </div>'''

# Route breakdown HTML
routes_html = ""
for route in route_sections:
    routes_html += f'''
    <tr>
      <td>{esc(route["route"])}</td>
      <td class="col-pass">{route["pass"]}</td>
      <td class="col-fail">{route["fail"]}</td>
      <td class="col-blocked">{route["blocked"]}</td>
      <td class="col-skip">{route["skip"]}</td>
    </tr>'''

# Issues HTML
issues_html = ""
for issue in issues:
    title = esc(issue["title"])
    body = esc(issue["body"].strip())
    issues_html += f'''
    <details class="issue-card">
      <summary class="issue-summary">{title}</summary>
      <pre class="issue-body">{body}</pre>
    </details>'''

# Session log HTML
log_html = ""
for entry in log_entries:
    ts = entry.get("ts", "")
    short_ts = ts[11:19] if len(ts) > 19 else ts
    surface = entry.get("surface_id", "")
    action = esc(entry.get("action", ""))
    result = entry.get("result", "")
    note = esc(entry.get("note", ""))
    vp = entry.get("viewport", "").split("x")[0]
    result_class = badge_class_for_result(result)
    log_html += f'''
    <tr>
      <td class="col-ts">{short_ts}</td>
      <td><span class="badge badge-viewport">{vp}</span></td>
      <td class="col-surface">{surface}</td>
      <td>{action}</td>
      <td><span class="badge badge-{result_class}">{result}</span></td>
      <td class="text-muted">{note}</td>
    </tr>'''

now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

html = f'''<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Surface Harvest QA — {esc(target_url)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
:root {{
  --font-heading: "Space Grotesk", -apple-system, BlinkMacSystemFont, sans-serif;
  --font-body: "Manrope", -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --copper-400: #c96e4a;
  --status-pass: #2f9e44; --status-fail: #d94841; --status-blocked: #d98a1c; --status-skipped: #6b737e;
  --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px; --space-8: 32px;
}}
[data-theme="dark"] {{
  --canvas: #0c1016; --surface: #121824; --elevated: #182131;
  --muted: #1e293b; --text-1: #e8edf3; --text-2: #a3b0be; --text-3: #7a8796; --text-4: #617181;
  --accent: var(--copper-400); --border: #314052; --border-muted: #1b2535;
}}
html {{ font-size: 14px; }}
body {{ font-family: var(--font-body); background: var(--canvas); color: var(--text-1); line-height: 1.5; }}
.report {{ max-width: 1400px; margin: 0 auto; padding: var(--space-8) var(--space-6); }}
h1 {{ font-family: var(--font-heading); font-size: 2rem; font-weight: 700; color: var(--text-1); margin-bottom: var(--space-2); }}
h1 span {{ color: var(--accent); }}
h2 {{ font-family: var(--font-heading); font-size: 1.3rem; font-weight: 600; margin: var(--space-8) 0 var(--space-4); border-bottom: 1px solid var(--border-muted); padding-bottom: var(--space-2); }}
.meta {{ display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-6); color: var(--text-3); font-size: 0.85rem; margin-bottom: var(--space-8); }}
.meta dt {{ display: inline; color: var(--text-4); }}
.meta dd {{ display: inline; color: var(--text-2); margin-right: var(--space-2); }}

/* Dashboard */
.dashboard {{ display: grid; grid-template-columns: 180px 1fr; gap: var(--space-8); margin-bottom: var(--space-8); align-items: start; }}
.gauge {{ display: flex; flex-direction: column; align-items: center; gap: var(--space-3); }}
.gauge svg {{ width: 140px; height: 140px; transform: rotate(-90deg); }}
.gauge-track {{ fill: none; stroke: var(--muted); stroke-width: 10; }}
.gauge-fill {{ fill: none; stroke-width: 10; stroke-linecap: round; stroke-dasharray: 314; transition: stroke-dashoffset 1s; }}
.gauge-fill.high {{ stroke: var(--status-pass); }}
.gauge-fill.mid {{ stroke: var(--status-blocked); }}
.gauge-fill.low {{ stroke: var(--status-fail); }}
.gauge-label {{ font-family: var(--font-heading); font-size: 2.4rem; font-weight: 700; }}
.gauge-sub {{ font-size: 0.75rem; color: var(--text-3); }}
.metrics {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--space-3); }}
.metric {{ background: var(--surface); border: 1px solid var(--border-muted); padding: var(--space-4); }}
.metric-value {{ font-family: var(--font-heading); font-size: 1.8rem; font-weight: 700; }}
.metric-label {{ font-size: 0.75rem; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; }}

/* Badges */
.badge {{ display: inline-block; padding: 2px 8px; font-size: 0.75rem; font-weight: 600; border-radius: 2px; }}
.badge-pass {{ background: #2f9e4418; color: var(--status-pass); }}
.badge-fail {{ background: #d9484118; color: var(--status-fail); }}
.badge-blocked {{ background: #d98a1c18; color: var(--status-blocked); }}
.badge-skip {{ background: #6b737e18; color: var(--status-skipped); }}
.badge-success {{ background: #2f9e4418; color: var(--status-pass); }}
.badge-error {{ background: #d9484118; color: var(--status-fail); }}
.badge-viewport {{ background: var(--elevated); color: var(--text-2); }}

/* Tables */
table {{ width: 100%; border-collapse: collapse; font-size: 0.85rem; }}
th {{ text-align: left; padding: var(--space-2) var(--space-3); border-bottom: 2px solid var(--border); color: var(--text-3); font-weight: 600; }}
td {{ padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-muted); }}
.col-pass {{ color: var(--status-pass); }}
.col-fail {{ color: var(--status-fail); }}
.col-blocked {{ color: var(--status-blocked); }}
.col-skip {{ color: var(--status-skipped); }}
.col-ts {{ font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-3); white-space: nowrap; }}
.col-surface {{ font-family: var(--font-mono); font-size: 0.8rem; white-space: nowrap; }}
.text-muted {{ color: var(--text-4); font-size: 0.8rem; }}

/* Issues */
.issue-card {{ background: var(--surface); border: 1px solid var(--border-muted); margin-bottom: var(--space-3); }}
.issue-summary {{ padding: var(--space-3) var(--space-4); cursor: pointer; font-weight: 600; }}
.issue-summary:hover {{ background: var(--elevated); }}
.issue-body {{ padding: var(--space-4); font-family: var(--font-mono); font-size: 0.8rem; white-space: pre-wrap; color: var(--text-2); border-top: 1px solid var(--border-muted); max-height: 600px; overflow-y: auto; }}

/* Screenshots */
.screenshot-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: var(--space-4); }}
.screenshot-card {{ background: var(--surface); border: 1px solid var(--border-muted); overflow: hidden; }}
.screenshot-card img {{ width: 100%; height: auto; display: block; }}
.screenshot-meta {{ padding: var(--space-2) var(--space-3); display: flex; align-items: center; gap: var(--space-2); font-size: 0.8rem; color: var(--text-2); }}

/* Footer */
.footer {{ margin-top: var(--space-8); padding-top: var(--space-4); border-top: 1px solid var(--border-muted); display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-4); }}

@media print {{
  body {{ background: white; color: #1a1a1a; }}
  .screenshot-card img {{ max-height: 300px; object-fit: contain; }}
}}
</style>
</head>
<body>
<div class="report">

<h1>Surface Harvest <span>QA</span></h1>
<dl class="meta">
  <dt>Target</dt><dd>{esc(target_url)}</dd>
  <dt>Started</dt><dd>{esc(start_ts)}</dd>
  <dt>Completed</dt><dd>{esc(end_ts)}</dd>
  <dt>Screenshots</dt><dd>{len(screenshots)}</dd>
  <dt>Log entries</dt><dd>{len(log_entries)}</dd>
</dl>

<div class="dashboard">
  <div class="gauge">
    <svg viewBox="0 0 120 120">
      <circle class="gauge-track" cx="60" cy="60" r="50"/>
      <circle class="gauge-fill {gauge_class}" cx="60" cy="60" r="50" stroke-dashoffset="{gauge_offset:.0f}"/>
    </svg>
    <div class="gauge-label">{pass_pct:.0f}%</div>
    <div class="gauge-sub">pass rate</div>
  </div>
  <div class="metrics">
    <div class="metric"><div class="metric-value">{total}</div><div class="metric-label">Total Surfaces</div></div>
    <div class="metric"><div class="metric-value col-pass">{pass_count}</div><div class="metric-label">Pass</div></div>
    <div class="metric"><div class="metric-value col-fail">{fail_count}</div><div class="metric-label">Fail</div></div>
    <div class="metric"><div class="metric-value col-blocked">{blocked_count}</div><div class="metric-label">Blocked</div></div>
    <div class="metric"><div class="metric-value col-skip">{skip_count}</div><div class="metric-label">Skipped</div></div>
  </div>
</div>

<h2>Per-Route Breakdown</h2>
<table>
  <thead><tr><th>Route</th><th>PASS</th><th>FAIL</th><th>BLOCKED</th><th>SKIP</th></tr></thead>
  <tbody>{routes_html if routes_html else '<tr><td colspan="5" class="text-muted">No per-route data found in surface-manifest.md</td></tr>'}</tbody>
</table>

<h2>Issues ({len(issues)})</h2>
{issues_html if issues_html else '<p class="text-muted">No issues found.</p>'}

<h2>Screenshots ({len(screenshots)})</h2>
<div class="screenshot-grid">{ss_html if ss_html else '<p class="text-muted">No screenshots captured.</p>'}</div>

<h2>Session Log ({len(log_entries)} entries)</h2>
<table>
  <thead><tr><th>Time</th><th>VP</th><th>Surface</th><th>Action</th><th>Result</th><th>Note</th></tr></thead>
  <tbody>{log_html if log_html else '<tr><td colspan="6" class="text-muted">No log entries.</td></tr>'}</tbody>
</table>

<div class="footer">
  <span>Surface Harvest QA &middot; Risoluto</span>
  <span>Generated {now}</span>
</div>

</div>
</body>
</html>'''

report_path.write_text(html)
size_kb = report_path.stat().st_size // 1024
print("Report generated: " + str(report_path))
print("  Size: " + str(size_kb) + "KB")
print("  Screenshots embedded: " + str(len(screenshots)))
print("  Issues: " + str(len(issues)))
print("  Log entries: " + str(len(log_entries)))
print("  Routes: " + str(len(route_sections)))
print("")
print("Open in browser: file://" + str(report_path.resolve()))
PYEOF
