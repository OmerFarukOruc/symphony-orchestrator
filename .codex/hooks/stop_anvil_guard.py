#!/usr/bin/env python3
import json
import sys

from anvil_state import load_active_status, repo_root, run_is_complete


def main() -> int:
    payload = json.load(sys.stdin)
    if payload.get("stop_hook_active"):
        return 0

    root = repo_root(payload["cwd"])
    slug, status, _ = load_active_status(root)
    if slug is None or status is None:
        return 0

    if not status.get("active", True):
        return 0

    if run_is_complete(status):
        return 0

    incomplete = any(
        [
            status.get("open_claims", 0) > 0,
            status.get("failed_claims", 0) > 0,
            bool(status.get("pending_phases")),
            bool(status.get("pending_gates")),
            status.get("docs_status") != "complete",
            status.get("tests_status") != "complete",
            status.get("push_status") != "complete",
        ]
    )
    if not incomplete:
        return 0

    reason = (
        f"Anvil run {slug} is not complete. Continue by resolving open claims, "
        f"finishing docs and tests closeout, and rerunning any pending gates. "
        f"Next required action: {status.get('next_required_action', 'unspecified')}."
    )
    print(json.dumps({"decision": "block", "reason": reason}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
