#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from autoresearch_hook_context import load_hook_context_pointer


MARKER_FILES = (
    "autoresearch-launch.json",
    "autoresearch-runtime.json",
    "autoresearch-state.json",
)
SKILL_ROOT_RELATIVE_CANDIDATES = (
    Path(".agents/skills/codex-autoresearch"),
    Path(".codex/skills/codex-autoresearch"),
)
RESULTS_HEADER_PREFIX = "iteration\tcommit\tmetric\t"
AUTORESEARCH_SKILL_MARKER = "$codex-autoresearch"
AUTORESEARCH_BACKGROUND_MARKER = "This repo is managed by the autoresearch runtime controller."

HOOK_ACTIVE_ENV = "AUTORESEARCH_HOOK_ACTIVE"
HOOK_RESULTS_PATH_ENV = "AUTORESEARCH_HOOK_RESULTS_PATH"
HOOK_STATE_PATH_ENV = "AUTORESEARCH_HOOK_STATE_PATH"
HOOK_LAUNCH_PATH_ENV = "AUTORESEARCH_HOOK_LAUNCH_PATH"
HOOK_RUNTIME_PATH_ENV = "AUTORESEARCH_HOOK_RUNTIME_PATH"


@dataclass(frozen=True)
class HookArtifactPaths:
    results_path: Path
    state_path: Path | None
    launch_path: Path | None
    runtime_path: Path | None


@dataclass(frozen=True)
class HookContext:
    payload: dict[str, object]
    cwd: Path
    repo: Path
    skill_root: Path | None
    artifacts: HookArtifactPaths
    opt_in_env: bool
    transcript_marked: bool
    pointer_active: bool | None

    @property
    def session_is_autoresearch(self) -> bool:
        return self.opt_in_env or self.transcript_marked

    @property
    def has_active_artifacts(self) -> bool:
        if self.pointer_active is False and not self.opt_in_env:
            return False
        paths = self.artifacts
        if paths.launch_path is not None and paths.launch_path.exists():
            return True
        if paths.runtime_path is not None and paths.runtime_path.exists():
            return True
        if paths.state_path is not None and paths.state_path.exists():
            return True
        return results_log_looks_autoresearch(paths.results_path)


def load_input() -> dict[str, object]:
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def manifest_path(script_path: str | Path) -> Path:
    return Path(script_path).resolve().with_name("manifest.json")


def load_manifest(script_path: str | Path) -> dict[str, object]:
    path = manifest_path(script_path)
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def resolve_git_repo(cwd: Path) -> Path | None:
    completed = subprocess.run(
        ["git", "-C", str(cwd), "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        return None
    repo = Path(completed.stdout.strip())
    return repo if repo.exists() else None


def resolve_repo(cwd: Path) -> Path:
    repo = resolve_git_repo(cwd)
    if repo is not None:
        return repo
    return cwd


def resolve_repo_relative(repo: Path, raw: str | None, default_name: str) -> Path:
    candidate = Path(raw) if raw else Path(default_name)
    if not candidate.is_absolute():
        candidate = repo / candidate
    return candidate.expanduser().resolve()


def results_log_looks_autoresearch(results_path: Path) -> bool:
    if not results_path.exists():
        return False
    try:
        lines = results_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return False
    for line in lines[:20]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        return stripped.startswith(RESULTS_HEADER_PREFIX)
    return False


def valid_skill_root(path: Path | None) -> Path | None:
    if path is None:
        return None
    resolved = path.expanduser().resolve()
    if not resolved.exists():
        return None
    if not (resolved / "SKILL.md").exists():
        return None
    helper = resolved / "scripts" / "autoresearch_supervisor_status.py"
    if not helper.exists():
        return None
    return resolved


def resolve_skill_root(cwd: Path, manifest: dict[str, object]) -> Path | None:
    for base in (cwd, *cwd.parents):
        for relative in SKILL_ROOT_RELATIVE_CANDIDATES:
            candidate = valid_skill_root(base / relative)
            if candidate is not None:
                return candidate

    home = Path.home()
    for relative in SKILL_ROOT_RELATIVE_CANDIDATES:
        candidate = valid_skill_root(home / relative)
        if candidate is not None:
            return candidate

    fallback = manifest.get("skill_root_fallback")
    if isinstance(fallback, str):
        return valid_skill_root(Path(fallback))
    return None


def env_truthy(name: str) -> bool:
    value = os.environ.get(name, "")
    return value.strip().lower() in {"1", "true", "yes", "on", "enabled"}


def _coalesce_path(
    *,
    repo: Path,
    env_name: str,
    pointer_path: Path | None,
    default_name: str,
) -> Path:
    raw = os.environ.get(env_name)
    if raw:
        return resolve_repo_relative(repo, raw, default_name)
    if pointer_path is not None:
        return pointer_path
    return resolve_repo_relative(repo, None, default_name)


def resolve_artifact_paths(repo: Path) -> tuple[HookArtifactPaths, bool | None]:
    pointer = load_hook_context_pointer(repo)
    return HookArtifactPaths(
        results_path=_coalesce_path(
            repo=repo,
            env_name=HOOK_RESULTS_PATH_ENV,
            pointer_path=pointer.results_path if pointer is not None else None,
            default_name="research-results.tsv",
        ),
        state_path=_coalesce_path(
            repo=repo,
            env_name=HOOK_STATE_PATH_ENV,
            pointer_path=pointer.state_path if pointer is not None else None,
            default_name="autoresearch-state.json",
        ),
        launch_path=_coalesce_path(
            repo=repo,
            env_name=HOOK_LAUNCH_PATH_ENV,
            pointer_path=pointer.launch_path if pointer is not None else None,
            default_name="autoresearch-launch.json",
        ),
        runtime_path=_coalesce_path(
            repo=repo,
            env_name=HOOK_RUNTIME_PATH_ENV,
            pointer_path=pointer.runtime_path if pointer is not None else None,
            default_name="autoresearch-runtime.json",
        ),
    ), (pointer.active if pointer is not None else None)


def payload_transcript_path(payload: dict[str, object]) -> Path | None:
    raw = payload.get("transcript_path")
    if not isinstance(raw, str) or not raw.strip():
        return None
    return Path(raw).expanduser().resolve()


def iter_text_fields(value: Any) -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "text" and isinstance(item, str):
                found.append(item)
            else:
                found.extend(iter_text_fields(item))
    elif isinstance(value, list):
        for item in value:
            found.extend(iter_text_fields(item))
    return found


def rollout_line_texts(value: Any) -> list[str]:
    if not isinstance(value, dict):
        return []
    if value.get("type") != "response_item":
        return []
    payload = value.get("payload")
    if not isinstance(payload, dict):
        return []
    if payload.get("type") != "message":
        return []
    if payload.get("role") not in {"user", "assistant"}:
        return []
    return iter_text_fields(payload.get("content"))


def transcript_indicates_autoresearch_session(transcript_path: Path | None) -> bool:
    if transcript_path is None or not transcript_path.exists():
        return False
    try:
        with transcript_path.open("r", encoding="utf-8", errors="ignore") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                for text in rollout_line_texts(payload):
                    stripped = text.lstrip()
                    if stripped.startswith(AUTORESEARCH_SKILL_MARKER):
                        return True
                    if stripped.startswith(AUTORESEARCH_BACKGROUND_MARKER):
                        return True
    except OSError:
        return False
    return False


def build_context(script_path: str | Path) -> HookContext | None:
    payload = load_input()
    cwd_value = payload.get("cwd")
    if not isinstance(cwd_value, str) or not cwd_value:
        return None

    cwd = Path(cwd_value).expanduser().resolve()
    manifest = load_manifest(script_path)
    repo = resolve_repo(cwd)
    transcript_path = payload_transcript_path(payload)
    artifacts, pointer_active = resolve_artifact_paths(repo)

    return HookContext(
        payload=payload,
        cwd=cwd,
        repo=repo,
        skill_root=resolve_skill_root(cwd, manifest),
        artifacts=artifacts,
        opt_in_env=env_truthy(HOOK_ACTIVE_ENV),
        transcript_marked=transcript_indicates_autoresearch_session(transcript_path),
        pointer_active=pointer_active,
    )
