---
name: risoluto-logs
description: Investigate Risoluto orchestrator runtime history and live local state using the repo-root `./risoluto-logs` helper, archived `.risoluto/` attempt data, and local `http://127.0.0.1:4000/api/v1/*` endpoints. Use this for Risoluto-specific run inspection requests like "check NIN-6", "show retry history", "why did it fail", "inspect attempt abc123", or "is the worker still running", and not for generic repository debugging, generic application logs, or non-Risoluto services.
---

# Risoluto Logs

Use this skill to inspect Risoluto orchestrator runs from evidence, not guesswork. Stay on Risoluto-specific runtime surfaces: the repo-root `./risoluto-logs` helper, the `.risoluto/` archive, and the local HTTP API when live state matters.

This skill is for Risoluto run inspection only. Do not use it for generic repo debugging, generic application logs, or unrelated services just because a user mentioned "logs" or "why did it fail?"

## When to use this skill

- The user wants to inspect what Risoluto did for a specific issue or attempt.
- The user asks about retries, failures, stalls, token usage, model selection, or current worker state for Risoluto.
- The user refers to Risoluto artifacts such as `.risoluto/`, `./risoluto-logs`, an attempt ID, or local `/api/v1/*` runtime endpoints.

Do not use this skill when the task is general code debugging, generic server logs, CI failures, or anything outside Risoluto's own run history and live local API.

## Default workflow

Follow these decision rules unless the user explicitly asks for a different source:

1. **Use `./risoluto-logs` first** for historical issue-centric inspection.
2. **Use direct archive access only if needed**: when the helper is unavailable, when the index is missing, when you must verify raw files, or when the user explicitly asks for raw files.
3. **Use the local HTTP API first for live-state questions** such as `now`, `current`, `still running`, `active`, or `stalled again`.
4. **Report from evidence last** with a concise summary instead of raw dumps.

Keep the source choice aligned to the question:

- For **what happened already**, prefer `./risoluto-logs` or archived `.risoluto/` files.
- For **what is happening now**, prefer the local `/api/v1/*` endpoints, then reconcile with archived history.

Required behavior:

- Name the exact source you used before giving conclusions: the helper command, the archive file path(s), the API endpoint(s), or the combination.
- If live-state evidence is unavailable, say that live state could not be verified and that your answer is archive-only.
- Do not infer current worker state from archived attempt files alone.

Deep reference details, including archive layout, field lists, endpoint notes, event ordering, and fallback mechanics, are in `references/runtime-reference.md`.

## Primary workflow

### 1) "Check issue X"

Start with the helper:

```bash
./risoluto-logs NIN-6
```

This returns JSON for the latest attempt and recent events. From that output:

- identify the attempt ID, start time, status, model, and attempt number
- if status is terminal, inspect `errorCode` and `errorMessage`
- summarize the event timeline instead of dumping the whole JSON unless the user asked for raw output
- name the exact helper invocation you used before giving the summary

### 2) "Show all attempts" or "show retry history"

```bash
./risoluto-logs NIN-6 --attempts
```

Use this to report:

- how many attempts exist
- which one is latest
- whether the issue retried after failures, stalls, or timeouts
- how status, model, or token usage changed across attempts
- the exact helper invocation used to inspect retry history

### 3) "Why did it fail?"

```bash
./risoluto-logs NIN-6 --errors
```

Then quote the relevant failure evidence:

- `errorCode` and `errorMessage` from attempt metadata
- matching `worker_failed`, `worker_stalled`, timeout-related, or other failure events
- the last few meaningful events leading into the failure
- the exact source used for those quotes

Do not speculate from one line alone. Read the attempt metadata and enough surrounding events to explain the sequence that led to the failure.

### 4) "Inspect this attempt"

```bash
./risoluto-logs --attempt <attemptId>
```

Use this when the user already knows the attempt ID or when you found it from issue history and need the attempt-specific view.

Name the exact helper invocation before summarizing the attempt.

### 5) Need a different archive directory

```bash
./risoluto-logs NIN-6 --dir /path/to/.risoluto
```

Use this when Risoluto was started with a custom `--log-dir` or the archive is not under the repo-root default.

If you use `--dir`, include that exact command in the answer so the user can see which archive you inspected.

## Reference pointer

Use `references/runtime-reference.md` when you need deeper lookup material or raw access details, including:

- archive layout and field catalogs
- exact direct-file fallback steps
- local API endpoint notes
- raw file vs API event ordering caveat

If the helper script is unavailable or fails, fall back to the archive files directly using the reference file's direct-file workflow and name the exact file path(s) you inspected. If the question is about live worker state, current retries, or what is happening right now, use the local API path described in the reference file and name the exact endpoint(s) that support the live-state claim. If no API evidence is available, say that live state is unverified.

## Question-to-action mapping

- **"check NIN-6"** → run `./risoluto-logs NIN-6`, identify the latest attempt, summarize status and recent events
- **"show me the logs"** → if the issue is known, start with `./risoluto-logs <ISSUE>`; if the issue is ambiguous, identify the target before reading logs
- **"why did it fail?"** → run `./risoluto-logs <ISSUE> --errors`, inspect `errorCode` / `errorMessage`, then quote the relevant failure events
- **"what happened with that worker?"** → if it may still be active, check `/api/v1/state` or `/api/v1/<ISSUE>` first; otherwise use the archive/helper path
- **"show retry history"** → run `./risoluto-logs <ISSUE> --attempts`
- **"inspect attempt abc123"** → run `./risoluto-logs --attempt abc123`
- **"what model did it use?"** → inspect attempt metadata fields `model`, `reasoningEffort`, and `modelSource`, plus `model_selection_updated` events if present
- **"how many tokens did it burn?"** → inspect `tokenUsage` on the attempt record and any per-turn `usage` fields in events

## Reporting guidance

When you answer the user, prefer a concise debugging report instead of raw JSON.

Your report must make provenance explicit. The user should be able to tell exactly whether each conclusion came from the helper, raw archive files, or the live API.

Use this structure unless the user asked for raw output:

### Investigation summary

- **Source used:** exact helper invocation, exact archive file path(s), exact API endpoint(s), or a combination
- **Live-state basis:** say whether live state was verified from the API, or explicitly say `live state could not be verified from archive-only evidence`
- **Issue / attempt:** identifier, attempt ID, attempt number when available
- **Status:** running, completed, failed, timed out, stalled, cancelled, etc.
- **Timing:** startedAt, endedAt, and whether the run still appears active
- **Failure evidence:** exact `errorCode` and `errorMessage` if present
- **Timeline:** the important event sequence in plain language
- **Usage / model details:** token usage and model selection when relevant
- **Next step:** retry, inspect workspace, fix auth/config, or follow up on a specific failure

### What to include

- State the exact command, file path, or endpoint that supports your conclusion.
- State clearly which attempt you are looking at.
- Quote the exact `errorCode` and `errorMessage` if the attempt failed.
- Summarize what the agent did, especially commands, reasoning, or file-change events when present in `content`.
- Mention token usage when the user asks about cost or long-running turns.
- Mention how many attempts exist if there were retries.
- If your answer is archive-only, say so explicitly.

### What not to do

- Do not guess the root cause without reading the evidence.
- Do not claim a worker is still running, stalled again, active, or current from archive files alone.
- Do not omit the exact source behind a conclusion.
- Do not blur archive history with live-state claims.
- Do not say `still running` or `not running` unless the API supports it, or you clearly say live state is unverified.
- Do not stop after one missing file if another supported path exists.
- Do not dump huge JSON blobs when a short evidence-based explanation is enough.

## Edge cases

- **No `.risoluto/` directory** → tell the user Risoluto has not created a data directory yet and they may need to run the service first or point you at the correct `--log-dir`.
- **No `risoluto.db`** → check for legacy JSONL archives (`attempts/*.json` + `events/*.jsonl`). If neither exists, tell the user no archive data is available.
- **Attempt exists but no events in `attempt_events`** → explain that the worker may have crashed or failed before emitting useful events; then rely on `error_code` and `error_message` from the `attempts` table.
- **Multiple attempts for one issue** → show the latest first and mention the total number of attempts.
- **Worker may still be running** → use the HTTP API for live state rather than relying only on archived files. If the API is unavailable, say live state could not be verified.
- **Unknown issue or attempt** → say which lookup path failed: helper, archive index, attempt scan, or HTTP API.

## Examples

**Example 1**

User: `check issue NIN-6`

Action: run `./risoluto-logs NIN-6`, inspect `latestAttempt`, summarize the latest run, and mention if older attempts exist.

**Example 2**

User: `why did it fail?`

Action: run `./risoluto-logs NIN-6 --errors`, read the latest attempt metadata, quote `errorCode` / `errorMessage`, and connect them to the last meaningful failure events.

**Example 3**

User: `is the worker still running or did it stall again?`

Action: check `curl http://127.0.0.1:4000/api/v1/state` first for live status, then reconcile that with the archived attempt history.

**Example 4**

User: `the helper script is broken, inspect the raw risoluto files for NIN-3`

Action: query `risoluto.db` directly with `sqlite3` — look up the attempt in the `attempts` table, then query `attempt_events` for its event stream. If `risoluto.db` is absent, fall back to legacy JSONL files (`attempts/*.json` + `events/*.jsonl`).
