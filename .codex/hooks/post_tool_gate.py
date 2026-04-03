#!/usr/bin/env python3
import json
import re
import sys

from anvil_state import load_active_status, repo_root, write_status


COMMAND_TO_GATE = [
    (r"\bpnpm(?:\s+run)?\s+test:e2e:smoke\b|\b(?:pnpm\s+exec\s+)?playwright\s+test\s+--project=smoke\b", "playwright-smoke"),
    (r"\bpnpm(?:\s+run)?\s+test:e2e:visual\b|\b(?:pnpm\s+exec\s+)?playwright\s+test\s+--project=visual\b", "playwright-visual"),
    (r"\bpnpm(?:\s+run)?\s+build\b", "build"),
    (r"\bpnpm(?:\s+run)?\s+lint\b", "lint"),
    (r"\bpnpm(?:\s+run)?\s+format:check\b", "format:check"),
    (r"\bpnpm(?:\s+run)?\s+test(?:\s|$)", "test"),
]


def load_payload_object(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return {}
    return {}


def extract_exit_code(tool_response) -> int:
    response = load_payload_object(tool_response)
    for key in ("exit_code", "exitCode", "code", "status"):
        value = response.get(key)
        if isinstance(value, int):
            return value
    return 0


def main() -> int:
    payload = json.load(sys.stdin)
    root = repo_root(payload["cwd"])
    slug, status, status_path = load_active_status(root)
    if slug is None or status is None or status_path is None:
        return 0
    if not status.get("active", True):
        return 0

    command = payload.get("tool_input", {}).get("command", "")
    gate_name = None
    for pattern, candidate in COMMAND_TO_GATE:
        if re.search(pattern, command):
            gate_name = candidate
            break
    if gate_name is None:
        return 0

    exit_code = extract_exit_code(payload.get("tool_response"))
    gate_results = status.get("gate_results", {})
    pending = list(status.get("pending_gates", []))

    if exit_code == 0:
        gate_results[gate_name] = "passed"
        pending = [gate for gate in pending if gate != gate_name]
        message = f"Tracked gate passed: {gate_name} for active anvil run {slug}."
    else:
        gate_results[gate_name] = "failed"
        if gate_name not in pending:
            pending.append(gate_name)
        status["last_failure_reason"] = f"{gate_name} failed"
        status["next_required_action"] = f"Inspect the failing {gate_name} output, fix the underlying issue, and rerun the gate."
        message = f"Tracked gate failed: {gate_name} for active anvil run {slug}. Reopen the loop instead of stopping."

    status["gate_results"] = gate_results
    status["pending_gates"] = pending
    write_status(status_path, status, root)

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PostToolUse",
                    "additionalContext": message,
                }
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
