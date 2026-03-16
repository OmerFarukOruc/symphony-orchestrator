# 🛠️ Operator Guide

> Day-to-day setup and operations reference for Symphony Orchestrator.

---

## 🎵 What Symphony Does

Symphony polls Linear for candidate issues, creates a workspace per issue, launches `codex app-server` inside that workspace, and keeps a local dashboard plus JSON API up to date with live and archived attempt state.

---

## 📋 Prerequisites

| Requirement | Details |
|-------------|---------|
| **Node.js** | v22 or newer |
| **Docker** | Docker Engine installed and running (`docker info` should succeed) |
| **Linear API key** | `LINEAR_API_KEY` in your environment |
| **Codex auth** | Working auth setup for your `codex app-server` command |

---

## 📄 Choose the Right Workflow File

| File | When to use |
|------|-------------|
| `WORKFLOW.example.md` | Portable example setup (recommended for getting started) |
| `WORKFLOW.md` | Repository's checked-in live smoke path |

> [!TIP]
> The example workflow assumes an isolated Codex home at `$HOME/.symphony-codex`. Bootstrap it once with:
> ```bash
> cp -R tests/fixtures/codex-home-custom-provider "$HOME/.symphony-codex"
> ```

---

## 📦 Install and Validate

```bash
# Install dependencies
npm install

# Run the deterministic test suite
npm test

# Build the project
npm run build

# Build the Docker sandbox image
bash bin/build-sandbox.sh

# Dry-start the portable workflow
node dist/cli.js ./WORKFLOW.example.md
```

If `LINEAR_API_KEY` is missing, Symphony exits with:

```text
error code=missing_tracker_api_key msg="tracker.api_key is required after env resolution"
```

---

## ▶️ Start the Service

```bash
node dist/cli.js ./WORKFLOW.example.md --port 4000
```

- 🖥️ **Dashboard**: [http://127.0.0.1:4000/](http://127.0.0.1:4000/)
- 📡 **API**: `curl -s http://127.0.0.1:4000/api/v1/state`

---

## ⚙️ Runtime Behavior

### 🔄 Polling and Work Selection

Symphony polls Linear on the configured interval, filters candidate issues, and launches work only for issues that are currently active.

### 📁 Workspace Lifecycle

Each issue gets its own workspace directory under `workspace.root`. Hooks run at these stages:

```mermaid
flowchart LR
    A["📁 Created"] -->|after_create| B["🔧 Before Run"]
    B -->|before_run| C["🤖 Worker Active"]
    C -->|after_run| D["🧹 Before Removal"]
    D -->|before_remove| E["🗑️ Cleaned Up"]

    style A fill:#059669,stroke:#047857,color:#fff
    style C fill:#2563eb,stroke:#1d4ed8,color:#fff
    style E fill:#6b7280,stroke:#4b5563,color:#fff
```

Hook execution is bounded by `hooks.timeout_ms`.

### ⏱️ Timeouts and Retries

| Knob | Config Key | Purpose |
|------|-----------|---------|
| Hook timeout | `hooks.timeout_ms` | Max time for any lifecycle hook |
| Read timeout | `codex.read_timeout_ms` | JSON-RPC read timeout |
| Turn timeout | `codex.turn_timeout_ms` | Total time for a single turn |
| Stall timeout | `codex.stall_timeout_ms` | Detect long-silent workers |
| Retry backoff | `agent.max_retry_backoff_ms` | Ceiling for retry delay |

> [!TIP]
> For safer live proving, set `codex.turn_timeout_ms` to something short like `120000` (2 minutes).

### 🐳 Docker Sandbox

Symphony runs the Codex agent inside a Docker container by default using the `codex-universal` base image. This provides process isolation, resource limits, and security hardening.

**Key runtime behavior:**

| Property | How |
|----------|-----|
| **Path identity** | All host paths are bind-mounted at their same absolute path inside the container |
| **Host permissions** | Container runs as your UID/GID — no ownership drift |
| **Writable HOME** | A persistent named volume is mounted at `/home/agent` for npm/pip/git caches |
| **Resource limits** | Memory, CPU, and tmpfs are configurable via `codex.sandbox.resources` |
| **OOM detection** | Exit code 137 with `OOMKilled=true` is surfaced as `container_oom` (retryable) |

**Container lifecycle on abort/shutdown:**

```mermaid
flowchart LR
    A["⚡ Abort Signal"] -->|docker stop --time=5| B["SIGTERM"]
    B -->|5s grace| C["SIGKILL"]
    C --> D["inspect OOMKilled"]
    D --> E["docker rm"]

    style A fill:#dc2626,stroke:#b91c1c,color:#fff
    style E fill:#059669,stroke:#047857,color:#fff
```

**Configuration:** See `codex.sandbox` in `WORKFLOW.example.md` for all available settings.

> [!WARNING]
> Named Docker volumes (build caches) survive container/image replacement, but **not** `docker system prune --volumes`. Do not prune volumes prefixed with `symphony-`.

> [!TIP]
> For restricted network egress, pre-provision a custom Docker network with `DOCKER-USER` iptables rules and set `codex.sandbox.network` to that network name.

### 🎯 Model Overrides

Save per-issue overrides via the dashboard or the API:

```bash
curl -s -X POST http://127.0.0.1:4000/api/v1/MT-42/model \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-5","reasoning_effort":"medium"}'
```

> [!NOTE]
> Model changes do **not** interrupt the active worker — they apply on the next run.

---

## 📡 JSON API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/state` | Snapshot — queued, running, retrying, completed + token totals |
| `POST` | `/api/v1/refresh` | Trigger immediate reconciliation pass |
| `GET` | `/api/v1/:issue_identifier` | Issue detail, recent events, archived attempts |
| `GET` | `/api/v1/:issue_identifier/attempts` | Archived attempts + current live attempt id |
| `GET` | `/api/v1/attempts/:attempt_id` | Archived per-attempt event timeline |

---

## 🗂️ Archived Attempts and Logs

By default, archives are stored in `.symphony/` next to the workflow file (override with `--log-dir`).

```
.symphony/
├── issue-index.json
├── attempts/<attempt-id>.json
└── events/<attempt-id>.jsonl
```

This archive keeps historical attempt information visible in the dashboard and API after a restart.

For archive-first CLI inspection, use the repo-root helper:

```bash
./symphony-logs MT-42
./symphony-logs NIN-3 --attempts --dir tests/fixtures/symphony-archive-sandbox/.symphony
./symphony-logs --attempt 00000000-0000-4000-8000-000000000422 --dir tests/fixtures/symphony-archive-sandbox/.symphony
```

The helper emits JSON and prefers `issue-index.json` when present, while still falling back to scanning archived attempt files if the index is missing.

---

## ⚠️ Common Failure Cases

> [!WARNING]
> ### Missing Tracker API Key
> If `tracker.api_key` resolves to an empty value, startup fails with `missing_tracker_api_key`.

> [!WARNING]
> ### Missing Codex Auth
> If `codex app-server` cannot authenticate, `account/read` fails the run early as a startup failure instead of leaving the worker hanging.

> [!WARNING]
> ### Required MCP Startup Failure
> This is a **Codex runtime** problem, not a Symphony bug:
> ```text
> error code=startup_failed msg="thread/start failed because a required MCP server did not initialize"
> ```

> [!WARNING]
> ### Invalid External Credentials
> If the Linear token or provider credentials are invalid, Symphony surfaces the upstream failure rather than crashing.

---

## 🔐 Trust and Auth

Symphony is designed for a local, operator-controlled, high-trust environment.

→ See **[`docs/TRUST_AND_AUTH.md`](TRUST_AND_AUTH.md)** for the full trust boundary and auth model.
