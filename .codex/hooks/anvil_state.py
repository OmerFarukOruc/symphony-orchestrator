from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PHASES = [
    "intake",
    "brainstorm",
    "plan",
    "review",
    "audit",
    "finalize",
    "execute",
    "verify",
    "docs-tests-closeout",
    "final-push",
]

PHASE_SET = set(PHASES)
OPEN_CLAIM_STATUSES = {"open", "pending", "reopened"}
FAILED_CLAIM_STATUSES = {"failed"}
PASSED_CLAIM_STATUSES = {"passed"}
ACCEPTED_RISK_STATUSES = {"accepted-risk", "accepted_risk", "accepted risk"}
NOT_APPLICABLE_STATUSES = {"n/a", "na", "not-applicable", "not_applicable"}


def repo_root(cwd: str) -> Path:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0:
        return Path(result.stdout.strip())
    return Path(cwd)


def _string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        items = [str(item).strip() for item in value if str(item).strip()]
        return list(dict.fromkeys(items))
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _count_like(value: Any) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return max(value, 0)
    if isinstance(value, float):
        return max(int(value), 0)
    if isinstance(value, str):
        return 1 if value.strip() else 0
    if isinstance(value, (list, tuple, set, dict)):
        return len(value)
    return 0


def _normalize_claim_status(value: str) -> str:
    return re.sub(r"[\s_]+", "-", value.strip().lower())


def parse_claim_counts(claims_path: Path) -> dict[str, int]:
    counts = {
        "total": 0,
        "open": 0,
        "passed": 0,
        "failed": 0,
        "accepted_risk": 0,
        "not_applicable": 0,
    }
    if not claims_path.exists():
        return counts

    pattern = re.compile(r"^\s*-\s*\[(?P<status>[^\]]+)\]\s+", re.MULTILINE)
    content = claims_path.read_text(encoding="utf-8")
    for match in pattern.finditer(content):
        status = _normalize_claim_status(match.group("status"))
        counts["total"] += 1
        if status in OPEN_CLAIM_STATUSES:
            counts["open"] += 1
        elif status in PASSED_CLAIM_STATUSES:
            counts["passed"] += 1
        elif status in FAILED_CLAIM_STATUSES:
            counts["failed"] += 1
        elif status in ACCEPTED_RISK_STATUSES:
            counts["accepted_risk"] += 1
        elif status in NOT_APPLICABLE_STATUSES:
            counts["not_applicable"] += 1
        else:
            counts["open"] += 1
    return counts


def _normalize_claim_counts(status: dict[str, Any], claims_path: Path) -> dict[str, int]:
    parsed = parse_claim_counts(claims_path)
    if parsed["total"] > 0:
        return parsed

    raw = status.get("claim_counts")
    if isinstance(raw, dict):
        claim_counts = {
            "total": _count_like(raw.get("total")),
            "open": _count_like(raw.get("open", status.get("open_claims"))),
            "passed": _count_like(raw.get("passed")),
            "failed": _count_like(raw.get("failed", status.get("failed_claims"))),
            "accepted_risk": _count_like(raw.get("accepted_risk")),
            "not_applicable": _count_like(raw.get("not_applicable")),
        }
    else:
        claim_counts = {
            "total": 0,
            "open": _count_like(status.get("open_claims")),
            "passed": 0,
            "failed": _count_like(status.get("failed_claims")),
            "accepted_risk": 0,
            "not_applicable": 0,
        }

    minimum_total = (
        claim_counts["open"]
        + claim_counts["passed"]
        + claim_counts["failed"]
        + claim_counts["accepted_risk"]
        + claim_counts["not_applicable"]
    )
    claim_counts["total"] = max(claim_counts["total"], minimum_total)
    return claim_counts


def normalize_status(slug: str, status: dict[str, Any], root: Path) -> dict[str, Any]:
    claims_path = root / ".anvil" / slug / "claims.md"
    pending_phases = _string_list(status.get("pending_phases"))
    raw_pending_gates = _string_list(status.get("pending_gates"))

    phase_names_in_gates = [item for item in raw_pending_gates if item in PHASE_SET]
    pending_gates = [item for item in raw_pending_gates if item not in PHASE_SET]
    pending_phases = [item for item in dict.fromkeys(pending_phases + phase_names_in_gates) if item in PHASE_SET]
    phase = status.get("phase")
    if phase not in PHASE_SET:
        phase = "intake"

    claim_counts = _normalize_claim_counts(status, claims_path)

    last_failure_reason = status.get("last_failure_reason")
    if isinstance(last_failure_reason, str) and not last_failure_reason.strip():
        last_failure_reason = None

    integration_branch = status.get("integration_branch")
    if isinstance(integration_branch, str):
        integration_branch = integration_branch.strip() or None
    elif integration_branch is not None:
        integration_branch = str(integration_branch)

    normalized = {
        "schema_version": 2,
        "slug": slug,
        "phase": phase,
        "phase_status": status.get("phase_status", "pending"),
        "active": bool(status.get("active", True)),
        "review_round": _count_like(status.get("review_round")),
        "audit_round": _count_like(status.get("audit_round")),
        "verify_cycle": _count_like(status.get("verify_cycle")),
        "max_review_rounds": max(_count_like(status.get("max_review_rounds")), 3),
        "max_audit_rounds": max(_count_like(status.get("max_audit_rounds")), 2),
        "max_verify_cycles": max(_count_like(status.get("max_verify_cycles")), 3),
        "pending_phases": pending_phases,
        "pending_gates": pending_gates,
        "gate_results": status.get("gate_results", {}) if isinstance(status.get("gate_results"), dict) else {},
        "claim_counts": claim_counts,
        "open_claims": claim_counts["open"],
        "failed_claims": claim_counts["failed"],
        "docs_status": status.get("docs_status", "pending"),
        "tests_status": status.get("tests_status", "pending"),
        "push_status": status.get("push_status", "not_started"),
        "integration_branch": integration_branch,
        "last_failure_reason": last_failure_reason,
        "next_required_action": status.get("next_required_action", "unspecified"),
        "dry_run": bool(status.get("dry_run", False)),
        "updated_at": status.get("updated_at") or datetime.now(timezone.utc).isoformat(),
    }
    return normalized


def load_active_status(root: Path) -> tuple[str | None, dict[str, Any] | None, Path | None]:
    active_path = root / ".anvil" / "ACTIVE_RUN"
    if not active_path.exists():
        return None, None, None

    slug = active_path.read_text(encoding="utf-8").strip()
    if not slug:
        return None, None, None

    status_path = root / ".anvil" / slug / "status.json"
    if not status_path.exists():
        return slug, None, status_path

    status = normalize_status(slug, json.loads(status_path.read_text(encoding="utf-8")), root)
    return slug, status, status_path


def write_status(status_path: Path, status: dict[str, Any], root: Path) -> dict[str, Any]:
    slug = str(status.get("slug") or status_path.parent.name)
    normalized = normalize_status(slug, status, root)
    normalized["updated_at"] = datetime.now(timezone.utc).isoformat()
    status_path.write_text(json.dumps(normalized, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return normalized


def run_is_complete(status: dict[str, Any]) -> bool:
    return all(
        [
            status.get("phase") in {"final-push", "final-push-ready", "complete"},
            not status.get("pending_phases"),
            not status.get("pending_gates"),
            _count_like(status.get("open_claims")) == 0,
            _count_like(status.get("failed_claims")) == 0,
            status.get("docs_status") == "complete",
            status.get("tests_status") == "complete",
            status.get("push_status") == "complete",
        ]
    )
