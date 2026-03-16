# Symphony

Symphony is a local orchestration service for Linear-driven coding work. It polls Linear issues, creates one filesystem workspace per issue, launches `codex app-server` inside that workspace, and exposes a local dashboard plus JSON API so an operator can see what is running, what retried, and what each attempt did.

This repository already contains a usable `v0.1.0` codebase: workflow loading and reload fallback, Linear polling, workspace lifecycle hooks, Codex worker orchestration, retry and stall handling, per-issue model overrides, archived attempt persistence under `.symphony/`, and a local dashboard/API for runtime visibility.

## What ships in v0.1.0

- Local single-host orchestration for Linear issues
- One workspace per issue with lifecycle hooks and cleanup
- Configurable polling, retry backoff, hook timeout, read timeout, turn timeout, and stall timeout
- Local dashboard at `/` and JSON API under `/api/v1/*`
- Per-issue saved model overrides that apply on the next run instead of interrupting the active worker
- Archived attempt summaries and per-attempt event timelines persisted under `.symphony/`
- Strict TypeScript implementation with deterministic Vitest coverage and an opt-in live integration suite

## Current scope and known gap

Symphony is currently a local, single-host operator tool. The largest remaining roadmap gap is upstream-style multi-host worker distribution over SSH; local orchestration, archived attempts, and operator-facing visibility are already implemented in this repository.

## Quick start

Use Node.js 22 or newer.

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

Dry-start with the portable example workflow:

```bash
node dist/cli.js ./WORKFLOW.example.md
```

If `LINEAR_API_KEY` is missing, startup should fail clearly instead of crashing:

```text
error code=missing_tracker_api_key msg="tracker.api_key is required after env resolution"
```

Start the local service and dashboard:

```bash
node dist/cli.js ./WORKFLOW.example.md --port 4000
```

Then visit `http://127.0.0.1:4000/` or query the state API:

```bash
curl -s http://127.0.0.1:4000/api/v1/state
```

## Workflow files

- `WORKFLOW.example.md` is the portable example for normal local setup.
- `WORKFLOW.md` is the checked-in live smoke workflow used in this repository.

The checked-in live workflow points at `bin/codex-app-server-live`. That wrapper seeds a repo-local isolated `CODEX_HOME` from `tests/fixtures/codex-home-custom-provider`, copies `auth.json` from `~/.codex`, and exports `OPENAI_API_KEY` from that file so local live runs avoid inherited skill noise while still authenticating successfully against the configured local Codex provider path.

If you want the generic isolated-home setup used by `WORKFLOW.example.md`, bootstrap it once first:

```bash
cp -R tests/fixtures/codex-home-custom-provider "$HOME/.symphony-codex"
```

## Runtime surfaces

### Dashboard

- `GET /` renders the local operator dashboard.

### JSON API

- `GET /api/v1/state` returns the current queued, running, retrying, and completed snapshot with aggregate token usage.
- `POST /api/v1/refresh` requests an immediate orchestration refresh.
- `GET /api/v1/:issue_identifier` returns current issue detail, recent events, and archived attempts.
- `GET /api/v1/:issue_identifier/attempts` returns archived attempts plus the current live attempt id.
- `GET /api/v1/attempts/:attempt_id` returns the archived event stream for a specific attempt.
- `POST /api/v1/:issue_identifier/model` saves a per-issue model override.

Example model override request:

```bash
curl -s -X POST http://127.0.0.1:4000/api/v1/MT-42/model \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-5","reasoning_effort":"medium"}'
```

Saved model changes apply on the next run rather than interrupting a worker that is already active.

Example `/api/v1/state` response shape:

```json
{
  "generated_at": "2026-03-15T23:30:00Z",
  "counts": { "running": 1, "retrying": 1 },
  "queued": [],
  "running": [],
  "retrying": [],
  "completed": [],
  "codex_totals": {
    "input_tokens": 1200,
    "output_tokens": 400,
    "total_tokens": 1600,
    "seconds_running": 18.4
  },
  "rate_limits": null,
  "recent_events": []
}
```

## Archived attempts

Symphony persists attempt summaries and per-attempt event streams under the repo-local archive directory. By default the CLI uses a `.symphony/` directory next to the workflow file unless `--log-dir` is provided.

This archive powers:

- issue detail attempt history
- attempt detail API responses
- dashboard retry/run inspection after a restart

## Live proving notes

For a safer live proving setup, set `codex.turn_timeout_ms` in the workflow to a short value such as `120000` so a runaway turn is interrupted after two minutes.

An example success-oriented log line looks like:

```text
level=info msg="worker retry queued" issue_id=abc123 issue_identifier=MT-882 attempt=2 delay_ms=10000 reason="turn_failed"
```

## Opt-in live integration test

When you have valid credentials:

```bash
LINEAR_API_KEY=... npm run test:integration
```

The integration suite is designed to skip explicitly when required external inputs are absent.

## Docs map

- `docs/OPERATOR_GUIDE.md` — day-to-day setup and operations guide
- `docs/ROADMAP_AND_STATUS.md` — shipped scope, current status, and remaining gap summary
- `docs/RELEASING.md` — release preparation checklist for future tags
- `docs/TRUST_AND_AUTH.md` — trust boundary and auth model
- `WORKFLOW.example.md` — portable example workflow
- `WORKFLOW.md` — checked-in live smoke workflow for this repo
- `EXECPLAN.md` — internal execution history and implementation log

## Files to know first

- `src/cli.ts` — startup, validation, archive directory selection, and shutdown
- `src/orchestrator.ts` — polling, reconciliation, retries, runtime snapshot building, and model overrides
- `src/agent-runner.ts` — Codex app-server client and dynamic tool handling
- `src/http-server.ts` — dashboard and API routes
- `src/attempt-store.ts` — archived attempt and event persistence
- `src/workspace-manager.ts` — workspace creation, hooks, and cleanup

## Trust posture

The recommended `v0.1` operating mode is intentionally high trust and local-only. Symphony decides when to launch work and which workspace to use; Codex decides how each turn executes; the configured provider or proxy decides how the actual model call is routed. See `docs/TRUST_AND_AUTH.md` for the full trust and auth model.
