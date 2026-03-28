# Symphony runtime reference

Use this file only when the main `SKILL.md` workflow is not enough. It keeps the deep lookup material out of the early read path.

## Source selection rules

- Use `./symphony-logs` first for historical issue inspection.
- Use raw archive files only when the helper is unavailable, the index is missing, you need raw verification, or the user explicitly asked for raw files.
- Use the local API first for live-state questions such as `now`, `current`, `still running`, `active`, or `stalled again`.
- Always name the exact helper command, archive file path(s), or API endpoint(s) that support your answer.
- If API evidence is unavailable, say live state could not be verified and that your answer is archive-only.
- Never infer current worker state from archive files alone.

## Storage layout

Symphony persists attempt and event data in a **SQLite database** (`symphony.db`) under the data directory, which defaults to `.symphony/` next to the workflow file. Startup can override that with `--log-dir` or `DATA_DIR`, and the helper script can override it with `--dir`.

```text
.symphony/
├── symphony.db               # SQLite database (attempts, events, issue index)
├── symphony.db-shm           # WAL shared-memory file
├── symphony.db-wal           # Write-ahead log
├── config/                   # Operator config overlay (YAML)
├── secrets.enc               # AES-encrypted credential store
├── secrets.audit.log         # Secret access audit trail
├── master.key                # Encryption master key
└── codex-auth/               # Codex login tokens
```

The database uses Drizzle ORM with WAL mode and contains three tables:

- **`attempts`** — one row per agent execution attempt
- **`attempt_events`** — individual events per attempt (one row per event)
- **`issue_index`** — materialized index mapping issue identifiers to latest attempt state

> Legacy JSONL archives (`attempts/*.json` + `events/*.jsonl`) are automatically migrated into SQLite on first startup via `SqliteAttemptStore.migrateFromArchive()`.

## Attempt metadata columns

The `attempts` table contains the durable run summary. Important columns include:

- `attempt_id`, `issue_id`, `issue_identifier`, `title`
- `workspace_key`, `workspace_path`
- `status` (`running`, `completed`, `failed`, `timed_out`, `stalled`, `cancelled`, `paused`)
- `attempt_number`, `started_at`, `ended_at`
- `model`, `reasoning_effort`, `model_source`
- `thread_id`, `turn_id`, `turn_count`
- `error_code`, `error_message`
- `input_tokens`, `output_tokens`, `total_tokens`
- `pull_request_url`, `stop_signal`

## Event columns

The `attempt_events` table stores individual events. Each row includes:

- `id` (auto-increment), `attempt_id`, `timestamp`
- `issue_id`, `issue_identifier`, `session_id`
- `type`, `message`
- optional `content`, `input_tokens`, `output_tokens`, `total_tokens`, `metadata` (JSON)

Common event types include:

- `item_started` / `item_completed` for reasoning steps, commands, file changes, or tool activity
- `turn_completed` with token usage
- `rate_limits_updated`
- `worker_stalled`
- `worker_failed`
- `model_selection_updated`

## Direct SQLite fallback

If the helper script is unavailable or fails, query the database directly.

When you use this path, report the exact query you ran.

### Query attempts for an issue

```bash
sqlite3 .symphony/symphony.db "SELECT attempt_id, status, model, started_at, ended_at FROM attempts WHERE issue_identifier = 'NIN-6' ORDER BY started_at DESC;"
```

### Query events for an attempt

```bash
sqlite3 .symphony/symphony.db "SELECT timestamp, type, message FROM attempt_events WHERE attempt_id = '<attemptId>' ORDER BY timestamp;"
```

### Narrow to failures

```bash
sqlite3 .symphony/symphony.db "SELECT timestamp, type, message FROM attempt_events WHERE attempt_id = '<attemptId>' AND (type LIKE '%fail%' OR type LIKE '%error%' OR type LIKE '%stall%') ORDER BY timestamp;"
```

### Fallback: legacy JSONL archives

If `symphony.db` does not exist (pre-migration installations), fall back to the legacy flat-file layout:

1. scan `.symphony/attempts/*.json` for attempt records matching the target issue
2. collect their `attemptId` values
3. read `.symphony/events/{attemptId}.jsonl` for the event stream

When you take this fallback path, tell the user you are reading legacy archive files because the SQLite database is not present.

## Local API endpoint notes

Default local server examples:

```bash
curl http://127.0.0.1:4000/api/v1/state
curl http://127.0.0.1:4000/api/v1/NIN-6
curl http://127.0.0.1:4000/api/v1/NIN-6/attempts
curl http://127.0.0.1:4000/api/v1/attempts/<attemptId>
```

Use each endpoint deliberately:

- `/api/v1/state` -> full runtime snapshot: running, retrying, queued, completed, token totals, recent events
- `/api/v1/NIN-6` -> one issue detail plus recent events and archived attempts
- `/api/v1/NIN-6/attempts` -> all attempts for the issue plus `current_attempt_id`
- `/api/v1/attempts/<attemptId>` -> one attempt record plus `events`

When you use the API for live-state claims, name the exact endpoint in the answer. If the API cannot be reached, say live state is unverified rather than inferring it from archive history.

## Event ordering caveat

Be careful about event ordering:

- SQLite queries with `ORDER BY timestamp` return events in chronological order
- The `SqliteAttemptStore.getEvents()` method orders by `timestamp ASC` (chronological)
- API responses from `/api/v1/attempts/<id>` return events in chronological order
- Legacy `.jsonl` files are written in chronological order (later lines are newer)

When summarizing events, always confirm the ordering of your data source. Do not mix orderings from different sources.

## Round-two sandbox benchmark note

This skill was rerun against the controlled archive fixture at `tests/fixtures/symphony-archive-sandbox/.symphony` using the same three eval prompts already tracked in `evals/evals.json`, with baseline vs with-skill comparisons judged under the tighter provenance-focused expectations.

Result summary:

- The skill retained a clear advantage under the stricter rubric.
- Baseline answers were generally correct, but the with-skill answers were more consistent about naming exact evidence sources and separating archive history from live-state claims.
- The strongest gains were on `MT-42` and `NIN-3`, where the skill reliably listed exact archive sources and explicitly stated when live state could not be verified from archive-only evidence.
- `NIN-6` also improved in a meaningful way because the with-skill answer used a repeatable provenance contract instead of a plain descriptive summary.

Practical takeaway: the current workflow and reporting guidance still hold up when grading explicitly rewards exact provenance, archive-only labeling, and strict separation between historical evidence and current worker-state claims.
