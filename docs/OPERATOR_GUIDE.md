# Operator Guide

This guide explains how to run and operate Symphony as a local service.

## What Symphony does

Symphony polls Linear for candidate issues, creates a workspace per issue, launches `codex app-server` inside that workspace, and keeps a local dashboard plus JSON API up to date with live and archived attempt state.

## Prerequisites

- Node.js 22 or newer
- `LINEAR_API_KEY` in your environment
- A working Codex auth setup for the `codex app-server` command you plan to use

## Choose the right workflow file

- Use `WORKFLOW.example.md` for the portable example setup.
- Use `WORKFLOW.md` only when you want the repository's checked-in live smoke path.

The example workflow assumes an isolated Codex home at `$HOME/.symphony-codex`. Bootstrap it once with:

```bash
cp -R tests/fixtures/codex-home-custom-provider "$HOME/.symphony-codex"
```

## Install and validate

Install dependencies:

```bash
npm install
```

Run the deterministic test suite:

```bash
npm test
```

Build the project:

```bash
npm run build
```

Dry-start the portable workflow:

```bash
node dist/cli.js ./WORKFLOW.example.md
```

If `LINEAR_API_KEY` is missing, Symphony should exit with:

```text
error code=missing_tracker_api_key msg="tracker.api_key is required after env resolution"
```

## Start the service

```bash
node dist/cli.js ./WORKFLOW.example.md --port 4000
```

Then open the dashboard:

- `http://127.0.0.1:4000/`

Or query the state API:

```bash
curl -s http://127.0.0.1:4000/api/v1/state
```

## Runtime behavior

### Polling and work selection

Symphony polls Linear on the configured interval, filters candidate issues, and launches work only for issues that are currently active.

### Workspace lifecycle

Each issue gets its own workspace directory under `workspace.root`. Workspace hooks can run:

- after workspace creation
- before a worker run
- after a worker run
- before workspace removal

Hook execution is bounded by `hooks.timeout_ms`.

### Timeouts and retries

The runtime supports:

- hook timeout via `hooks.timeout_ms`
- Codex JSON-RPC read timeout via `codex.read_timeout_ms`
- total turn timeout via `codex.turn_timeout_ms`
- stall detection via `codex.stall_timeout_ms`
- retry backoff ceiling via `agent.max_retry_backoff_ms`

For safer live proving, it is reasonable to set `codex.turn_timeout_ms` to something short such as `120000`.

### Model overrides

Operators can save a per-issue model override through the dashboard or the API:

```bash
curl -s -X POST http://127.0.0.1:4000/api/v1/MT-42/model \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-5","reasoning_effort":"medium"}'
```

Saved model changes do not interrupt the active worker. They apply on the next run for that issue.

## JSON API

### Snapshot

- `GET /api/v1/state`

Returns queued, running, retrying, and completed views plus aggregate token totals and recent events.

### Manual refresh

- `POST /api/v1/refresh`

Requests an immediate reconciliation pass.

### Issue detail

- `GET /api/v1/:issue_identifier`

Returns current issue detail, recent events, and archived attempts.

### Attempt listing

- `GET /api/v1/:issue_identifier/attempts`

Returns archived attempts plus the current live attempt id.

### Attempt detail

- `GET /api/v1/attempts/:attempt_id`

Returns the archived per-attempt event timeline.

## Archived attempts and logs

By default, Symphony stores runtime archives in a repo-local `.symphony/` directory next to the workflow file unless `--log-dir` is provided.

The archive layout is:

- `attempts/<attempt-id>.json`
- `events/<attempt-id>.jsonl`

This archive allows the dashboard and API to keep showing historical attempt information after a restart.

## Common failure cases

### Missing tracker API key

If `tracker.api_key` resolves to an empty value, startup fails with `missing_tracker_api_key`.

### Missing Codex auth

If the launched `codex app-server` cannot authenticate, `account/read` fails the run early as a startup failure instead of leaving the worker hanging.

### Required MCP startup failure

This is a Codex runtime startup problem rather than a Symphony orchestration bug:

```text
error code=startup_failed msg="thread/start failed because a required MCP server did not initialize"
```

### Invalid external credentials

If the configured Linear token or upstream provider credentials are invalid, Symphony should surface the upstream failure rather than crash the process.

## Trust and auth

Symphony is designed for a local, operator-controlled, high-trust environment. See `docs/TRUST_AND_AUTH.md` for the full trust boundary and auth model.
