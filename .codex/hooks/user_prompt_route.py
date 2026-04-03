#!/usr/bin/env python3
import json
import re
import sys

from anvil_state import load_active_status, repo_root

SKILL_NAME = r"anvil(?:-risoluto|-(?:brainstorm|plan|review|audit|execute|verify))?"
EXPLICIT_SKILL_PATTERNS = [
    rf"(?<![A-Za-z0-9_-])[/$]{SKILL_NAME}\b",
    rf"\b(?:use|run|invoke|call|trigger|start|resume|continue with)\s+(?:the\s+)?{SKILL_NAME}\b",
    rf"\b{SKILL_NAME}\s+skill\b",
]


def wants_anvil(prompt: str, slug: str | None) -> bool:
    lowered = prompt.lower()
    if any(re.search(pattern, prompt, re.IGNORECASE) for pattern in EXPLICIT_SKILL_PATTERNS):
        return True
    return bool(slug and slug.lower() in lowered and re.search(rf"\b{SKILL_NAME}\b", prompt, re.IGNORECASE))


def main() -> int:
    payload = json.load(sys.stdin)
    prompt = payload.get("prompt", "")
    root = repo_root(payload["cwd"])
    slug, status, _ = load_active_status(root)

    if not wants_anvil(prompt, slug):
        return 0

    if status and not status.get("active", True):
        context = (
            f"Explicit anvil-style prompt detected. There is a paused repo-local anvil run at .anvil/{slug}/. "
            "Only resume or route into anvil if the user is clearly asking for that workflow."
        )
    else:
        context = (
            "Explicit anvil-style prompt detected. Prefer the repo-local anvil factory so the run gets durable .anvil state, "
            "planning, review, verification, docs/tests closeout, and a final single push."
        )
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": context,
                }
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
