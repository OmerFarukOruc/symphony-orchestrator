#!/usr/bin/env python3
import json
import sys

from anvil_state import load_active_status, repo_root


def main() -> int:
    payload = json.load(sys.stdin)
    if payload.get("source") != "resume":
        return 0

    root = repo_root(payload["cwd"])
    slug, status, status_path = load_active_status(root)
    if slug is None:
        return 0
    if status is not None and not status.get("active", True):
        return 0

    if status is None:
        lines = [
            f"Active anvil run: {slug}",
            f"Status file missing: {status_path}",
            "Resume by rebuilding or recreating .anvil/<slug>/status.json before continuing.",
        ]
    else:
        lines = [
            f"Active anvil run: {slug}",
            f"Phase: {status.get('phase', 'unknown')} ({status.get('phase_status', 'unknown')})",
            f"Active loop: {'yes' if status.get('active', True) else 'paused'}",
            f"Open claims: {status.get('open_claims', 0)}",
            f"Failed claims: {status.get('failed_claims', 0)}",
            f"Pending phases: {', '.join(status.get('pending_phases', [])) or 'none'}",
            f"Pending gates: {', '.join(status.get('pending_gates', [])) or 'none'}",
            f"Next required action: {status.get('next_required_action', 'unspecified')}",
        ]
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "SessionStart",
                    "additionalContext": "\n".join(lines),
                }
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
