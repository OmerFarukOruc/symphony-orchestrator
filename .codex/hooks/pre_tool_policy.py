#!/usr/bin/env python3
import json
import re
import sys

from anvil_state import load_active_status, repo_root, run_is_complete


DENY_PATTERNS = {
    r"\bgit\s+reset\s+--hard\b": "Destructive reset is blocked during an active anvil run.",
    r"\bgit\s+checkout\s+--\b": "Direct checkout discard is blocked during an active anvil run.",
    r"\bgh\s+pr\s+create\b": "Creating a PR is blocked during an active anvil run. Finish the factory loop first.",
    r"\bgit\s+worktree\s+add\b": "Use the managed worktree flow from anvil-execute instead of raw git worktree add.",
    r"\brm\s+-rf\b.*\.anvil\b": "Deleting .anvil state is blocked during an active anvil run.",
}


def push_allowed(status) -> bool:
    if not status:
        return False
    if run_is_complete(status):
        return True
    phase = status.get("phase")
    if phase not in {"final-push", "final-push-ready"}:
        return False
    if status.get("open_claims", 0) != 0:
        return False
    if status.get("failed_claims", 0) != 0:
        return False
    if status.get("pending_phases"):
        return False
    if status.get("pending_gates"):
        return False
    if status.get("docs_status") != "complete":
        return False
    if status.get("tests_status") != "complete":
        return False
    return True


def deny(reason: str) -> int:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }
        )
    )
    return 0


def main() -> int:
    payload = json.load(sys.stdin)
    command = payload.get("tool_input", {}).get("command", "")
    root = repo_root(payload["cwd"])
    slug, status, _ = load_active_status(root)

    if slug and re.search(r"\bgit\s+push\b", command) and not push_allowed(status):
        return deny("git push is blocked until the active anvil run reaches the final push phase and all claims and gates are closed.")

    if not slug:
        return 0
    if status and run_is_complete(status):
        return 0

    for pattern, reason in DENY_PATTERNS.items():
        if re.search(pattern, command):
            return deny(reason)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
