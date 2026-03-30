# 🛠️ Operator Guide

> Day-to-day setup and operations reference for Symphony Orchestrator.

---

## 🎵 What Symphony Does

Symphony polls Linear for candidate issues, creates a workspace per issue, launches `codex app-server` inside that workspace, and keeps a local dashboard plus JSON API up to date with live and archived attempt state.

---

## Quick start (5 minutes)

> Already familiar with Symphony? Skip to [Prerequisites](#-prerequisites) for the full setup reference.

**1. Install and build**

```bash
git clone <repo-url> && cd symphony-orchestrator
pnpm install && pnpm run build
bash bin/build-sandbox.sh
```

**2. Start Symphony**

```bash
node dist/cli/index.js --port 4000
```

Open http://127.0.0.1:4000 — the **setup wizard** opens automatically and walks you through:

1. **Protect secrets** — generates an encryption master key
2. **Connect Linear** — paste your API key and select a project
3. **Add OpenAI** — paste an API key or use Codex Login (see [Setup Wizard](#-setup-wizard))
4. **Add GitHub** — paste a GitHub PAT (optional)

**3. Verify it works**
Set a Linear issue to "In Progress". Within one poll cycle (default: 30s), Symphony picks it up and the dashboard shows it running.

---

## 📋 Prerequisites

Make sure the following are in place before running Symphony:

| Requirement        | Details                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| **Node.js**        | v22 or newer                                                                |
| **Docker**         | Docker Engine installed and running (`docker info` should succeed)          |
| **Codex auth**     | Working auth for `codex app-server` (API key or `codex login`)              |

> [!TIP]
> Credentials (Linear API key, OpenAI key, GitHub PAT) are entered through the setup wizard — no environment variables needed upfront when using Docker or the WebUI bootstrap flow.

---

> **Note for new users:** The sections below are the complete operations reference. For day-one setup, the quick start above is all you need.

## 🌐 Deployment Architecture

Symphony always launches workers in Docker, but the model-routing/auth layer is now generic. You can use:

- direct OpenAI API auth with `OPENAI_API_KEY`
- a custom OpenAI-compatible provider via `codex.provider`
- ChatGPT/Codex login via `codex login` and `codex.auth.mode: openai_login`

Optional host-side proxies such as [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) still work; Symphony rewrites host-bound URLs so Docker workers can reach them.

```mermaid
flowchart TD
    subgraph Host ["🖥️ Host (local machine or VDS)"]
        CLIP["🔑 CLIProxyAPI\n127.0.0.1:8317"]
        SYM["🎵 Symphony Orchestrator\nport 4000"]
        LINEAR["🗂️ Linear API"]
    end

    subgraph Docker ["🐳 Docker Containers"]
        CX1["🤖 Codex Worker 1"]
        CX2["🤖 Codex Worker 2"]
        CXN["🤖 Codex Worker N"]
    end

    SYM -->|poll| LINEAR
    SYM -->|spawn| CX1
    SYM -->|spawn| CX2
    SYM -->|spawn| CXN
    CX1 -->|"host.docker.internal:8317"| CLIP
    CX2 -->|"host.docker.internal:8317"| CLIP
    CXN -->|"host.docker.internal:8317"| CLIP

    style CLIP fill:#059669,stroke:#047857,color:#fff
    style SYM fill:#2563eb,stroke:#1d4ed8,color:#fff
    style CX1 fill:#d97706,stroke:#b45309,color:#fff
    style CX2 fill:#d97706,stroke:#b45309,color:#fff
    style CXN fill:#d97706,stroke:#b45309,color:#fff
```

> [!IMPORTANT]
> If you use a host-side proxy such as CLIProxyAPI, run it **once on the host** and let all sandbox containers reach it over the network. Do not install it inside the Docker images.

### 🐳 How Docker Networking Works

Containers cannot reach the host's `127.0.0.1`. Symphony automatically:

1. Adds `--add-host=host.docker.internal:host-gateway` to every container
2. Rewrites `127.0.0.1` → `host.docker.internal` in the Codex `config.toml` when running inside Docker

This is transparent — Symphony rewrites host-bound provider URLs in the generated runtime config at container startup.

### 🖥️ VDS / Server Deployment

```bash
# 1. Install Node.js 22+ and Docker
# 2. Clone the repo and install
git clone <repo-url> && cd symphony-orchestrator
pnpm install && pnpm run build

# 3. Build the sandbox image
bash bin/build-sandbox.sh

# 4. Choose a Codex auth mode
#    API key:
export OPENAI_API_KEY="sk-..."
#    or ChatGPT/Codex login:
#    codex login
#    for headless machines:
#    codex login --device-auth

# 5. Optional: configure a host-side OpenAI-compatible proxy
#    Example: CLIProxyAPI listening on 127.0.0.1:8317

# 6. Start Symphony — complete setup via the wizard at http://server:4000
node dist/cli/index.js --log-dir /var/lib/symphony --port 4000
```

> [!TIP]
> For persistent operation, run Symphony and CLIProxyAPI under `systemd`, `tmux`, or `screen`.

---

## 📁 Data Directory

Symphony stores all runtime state in a single directory (default: `~/.symphony`):

| Path inside `--log-dir` | Purpose |
| ----------------------- | ------- |
| `config/overlay.yaml`   | Persistent operator config (written by setup wizard and config API) |
| `master.key`            | Encryption key for the secrets store |
| `secrets.enc`           | AES-256-GCM encrypted credentials |
| `symphony.db`           | SQLite database for attempt history and issue state |
| `archives/`             | Per-attempt event archives |

Override the default with `--log-dir`:

```bash
node dist/cli/index.js --log-dir /var/lib/symphony --port 4000
```

> [!TIP]
> In Docker deployments the data directory maps to a named volume (`symphony-archives`). The `DATA_DIR` env var is an alternative way to set it: Symphony resolves `$DATA_DIR/archives` as the archive root.

### Legacy auto-import

On the first boot of a fresh data directory, Symphony checks for a `WORKFLOW.md` file in the current working directory (or the parent of the data directory). If found, it imports the front-matter as the initial overlay config and the prompt body as the prompt template. This is a one-time migration path — subsequent boots use the data directory exclusively.

---

## 📦 Install and Validate

```bash
# Install dependencies
pnpm install

# Run the deterministic test suite
pnpm test

# Build the project
pnpm run build

# Build the Docker sandbox image
bash bin/build-sandbox.sh

# Start Symphony — setup wizard runs on first boot
node dist/cli/index.js --port 4000
```

Symphony stores all runtime config in `~/.symphony/` by default (override with `--log-dir <path>`). On first boot with no config seeded, Symphony enters **setup mode** and the wizard at http://127.0.0.1:4000/setup guides you through credentials.

If credentials are missing after setup, Symphony logs a warning and stays in setup mode. Common startup errors when starting without the wizard (e.g. with a pre-seeded overlay):

```text
error code=missing_tracker_project_slug msg="tracker.project_slug is required when tracker.kind is linear"
error code=missing_tracker_api_key msg="tracker.api_key is required after env resolution"
error code=missing_codex_provider_env msg="codex runtime requires OPENAI_API_KEY in the host environment"
```

---

## ▶️ Start the Service

```bash
node dist/cli/index.js --port 4000
# Override the data directory:
node dist/cli/index.js --log-dir /var/lib/symphony --port 4000
```

- 🖥️ **Dashboard**: [http://127.0.0.1:4000/](http://127.0.0.1:4000/)
- 📡 **API**: `curl -s http://127.0.0.1:4000/api/v1/state`

### CLI flags

| Flag | Default | Purpose |
| ---- | ------- | ------- |
| `--port <n>` | `4000` (or `server.port` from config) | HTTP listen port |
| `--log-dir <path>` | `~/.symphony` | Data directory for DB, secrets, config overlay, and archives |

## 🐳 Run the Service in Docker

### Zero-Environment Docker Compose

Symphony supports a zero-configuration Docker start — no environment variables needed upfront:

```bash
docker compose up --build
```

Open http://localhost:4000 and the **setup wizard** guides you through all credentials. All data is stored in named Docker volumes:

| Volume                | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| `symphony-archives`   | Encrypted secrets, config overlay, auth tokens, run archives |
| `symphony-workspaces` | Cloned repositories for each issue                           |
| `codex-auth`          | OpenAI Codex login tokens                                    |

### Traditional Docker Compose

```bash
cp .env.example .env
# fill in absolute host paths and credentials
docker compose up --build
```

Container-specific notes:

- `DATA_DIR=/data` makes the archive root `/data/archives` — the same directory serves as `--log-dir`.
- `workspace.root` resolves to `/data/workspaces` inside the service container.
- `PathRegistry` translates those container paths back to the host bind-mount sources before worker containers are launched.
- The setup wizard stores credentials in the `symphony-archives` volume — no workflow file is needed in the image.

### Control/Data Plane Architecture (Remote Dispatch Mode)

By default, Symphony runs in **local mode** — all orchestration and agent execution happen in a single process. For scale-out scenarios (remote SSH workers, hot upgrades, multi-host distribution), enable **remote dispatch mode**:

```bash
# .env
DISPATCH_MODE=remote
DISPATCH_URL=http://data-plane:9100/dispatch
DISPATCH_SHARED_SECRET=your-secure-secret-here
```

This splits Symphony into two containers:

```mermaid
flowchart TD
    subgraph Docker ["🐳 Docker Compose"]
        CP["🎵 Control Plane\n:4000\n• Linear polling\n• Dashboard/API\n• Workspace lifecycle\n• Config/secrets"]
        DP["⚙️ Data Plane\n:9100 (internal)\n• Agent execution\n• Container spawning"]
    end

    CP -->|"HTTP + SSE\nBearer auth"| DP
    DP -->|"Docker CLI"| CX1["🤖 Worker 1"]
    DP -->|"Docker CLI"| CX2["🤖 Worker 2"]

    style CP fill:#2563eb,stroke:#1d4ed8,color:#fff
    style DP fill:#059669,stroke:#047857,color:#fff
```

**Control plane responsibilities:**

- Polls Linear for issues
- Creates/manages workspaces and git clones
- Serves the dashboard and HTTP API
- Holds config overlay and secrets
- Dispatches run requests to the data plane

**Data plane responsibilities:**

- Receives dispatch requests with pre-computed config
- Spawns and manages Codex worker containers
- Streams events back to control plane via SSE
- Returns final `RunOutcome` for each dispatch

The data plane is **not exposed to the host** — it only listens on the private `symphony-internal` Docker bridge network. The `DISPATCH_SHARED_SECRET` authenticates inter-container communication.

**When to use remote dispatch mode:**

| Scenario                       | Benefit                                             |
| ------------------------------ | --------------------------------------------------- |
| Hot upgrades (#96)             | Upgrade control plane without killing active agents |
| Multi-host SSH workers (#33)   | Data plane runs on remote hosts                     |
| Interactive workspaces (#70)   | WebSocket proxy routes to correct data plane        |
| Multi-repo orchestration (#50) | Multiple data planes with different checkouts       |

> [!NOTE]
> Remote dispatch mode is opt-in. The default `DISPATCH_MODE=local` runs everything in one process with no behavior changes from prior versions.

---

## 🧙 Setup Wizard

When Symphony starts without a master key configured, it enters **setup mode** and serves a step-by-step wizard at `/setup`. The wizard enforces a navigation guard — all routes redirect to `/setup` until configuration is complete.

### Wizard Steps

| Step                   | What it does                                                                                                                                                                                               | Required?      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **1. Protect secrets** | Calls `POST /api/v1/setup/master-key` to generate and persist the encryption key that protects stored credentials on disk.                                                                                 | Yes            |
| **2. Connect Linear**  | Stores `LINEAR_API_KEY` via `POST /api/v1/secrets/:key`, lists projects with `GET /api/v1/setup/linear-projects`, then saves the selected `tracker.project_slug` with `POST /api/v1/setup/linear-project`. | Yes            |
| **3. Add OpenAI**      | Uses `POST /api/v1/setup/openai-key` for API-key mode, browser PKCE sign-in via `POST /api/v1/setup/pkce-auth/start`, or `POST /api/v1/setup/codex-auth` for manual `auth.json` upload.                    | Yes            |
| **4. Add GitHub**      | Optionally validates and stores a GitHub PAT with `POST /api/v1/setup/github-token`.                                                                                                                       | No (skippable) |

After completing all steps, click **"Go to Dashboard"** to unlock normal navigation.

### Wizard Navigation

- **Clickable stepper**: completed and active step indicators in the top bar are clickable — click any completed step to go back and review or change credentials.
- **Keyboard accessible**: step indicators support `Tab`, `Enter`, and `Space` for full keyboard navigation.
- **Master key reconfigure**: returning to Step 1 after it's been completed shows a confirmation that the key is configured. Click **Reconfigure** to reset all stored secrets and generate a new encryption key (requires re-entering all credentials).
- **Empty project list**: if a valid Linear API key is connected but no projects exist in the workspace, the wizard displays a guidance message with a link to create a project in Linear.

> [!NOTE]
> The backend exposes `POST /api/v1/setup/pkce-auth/start` and `GET /api/v1/setup/pkce-auth/status` for the browser-based PKCE login flow. The wizard also supports pasting or uploading `auth.json` as a manual fallback.

### OpenAI Authentication Options

#### API Key Mode

Paste an `sk-...` API key directly. Symphony validates it and stores it in the encrypted secrets store.

#### Codex Login Mode (Browser Sign-In)

Authenticate with your ChatGPT/Codex subscription directly in the browser:

1. In the setup wizard (Step 3), select **"Codex Login"**
2. Click **"Sign in with OpenAI"** — a new browser tab opens to `auth.openai.com`
3. Log in with your OpenAI account and approve the authorization
4. The browser redirects to `localhost:1455/auth/callback` — Symphony exchanges the code for tokens automatically
5. The wizard detects success and advances to the next step

> [!TIP]
> This uses the official Codex CLI's registered OAuth client with PKCE (Proof Key for Code Exchange). No device code or CLI binary is needed — everything happens in the browser.

#### Manual Fallback

If the browser flow doesn't work (e.g., port 1455 is blocked, or you're on a headless server):

1. Run `codex login` (or `codex login --device-auth`) in your terminal
2. Paste the contents of `~/.codex/auth.json` into the manual auth field in the wizard

> [!IMPORTANT]
> The PKCE flow requires port `1455` to be free on `localhost`. If another Codex CLI instance is running, close it first.

### Reset & Re-run Setup

To re-configure credentials without a full factory reset:

1. Navigate to **System → Setup** in the sidebar (or go to `/setup` directly)
2. Click **"Reset & Re-run Setup"** on the done screen, or click **Reconfigure** on the Protect Secrets step
3. Confirm the dialog — all API keys (Linear, OpenAI, GitHub) are cleared
4. If initiated from the done screen, the wizard restarts from Step 2 (the master key is preserved). If initiated from Reconfigure, a new master key is generated and you restart from Step 1.

### Factory Reset (Full)

To start completely fresh including a new master key:

```bash
docker compose down -v && docker compose up --build -d
```

The `-v` flag deletes all named volumes. You lose:

- Master key and all encrypted secrets
- Config overlay (project slug, auth mode, custom settings)
- OpenAI `auth.json` login tokens
- Agent run archives and logs
- Cloned workspaces (re-cloned on next dispatch)

What you keep: source code, Docker images, external services (Linear issues, GitHub repos, OpenAI account).

## ⚙️ Persistent Overlay and Secrets

`WORKFLOW.md` is still the primary config source and still live-reloads on file change. Symphony now adds two operator-only persistent layers on top:

- Config overlay: stored as YAML under the archive data root and exposed through `/api/v1/config*` (including `/api/v1/config/schema`)
- Secrets store: stored encrypted at rest under the archive data root and exposed through `/api/v1/secrets*`

If Symphony finds an existing `secrets.enc` that cannot be decrypted with the current `MASTER_KEY`, startup now fails fast and leaves the encrypted file untouched. Fix the key mismatch before retrying.

Merge order:

1. built-in defaults
2. `WORKFLOW.md`
3. persistent overlay
4. environment and `$SECRET:name` resolution

Examples:

```bash
curl -s http://127.0.0.1:4000/api/v1/config
curl -s http://127.0.0.1:4000/api/v1/config/overlay
curl -s -X PUT http://127.0.0.1:4000/api/v1/config/overlay \
  -H 'Content-Type: application/json' \
  -d '{"codex":{"model":"gpt-5.4"}}'

curl -s -X POST http://127.0.0.1:4000/api/v1/secrets/SLACK_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"value":"https://hooks.slack.com/services/..."}'
```

## 🔔 Notifications and Git Automation

The workflow can now configure:

- `notifications.slack.webhook_url`
- `notifications.slack.verbosity`
- `repos[]` routing entries for identifier-prefix or label-based repository selection

Routing precedence is now explicit: Symphony checks label routes first, then falls back to identifier-prefix routes. Use labels for per-issue overrides and prefixes for the default team-to-repo mapping.

When a routed issue reports `SYMPHONY_STATUS: DONE`, Symphony can now:

1. commit and push the workspace branch
2. open a GitHub pull request
3. expose read/comment GitHub actions to the agent through the `github_api` dynamic tool

Notifications are best-effort. Delivery failures are logged but do not crash the orchestrator.

## 🧪 First End-to-End Smoke Issue

For the first live proving run, use an issue that can succeed even if the workspace contains no cloned repository yet.

### Create the Linear Issue

Put the issue in an active state such as `In Progress`, not `Todo`, and use:

**Title**

```text
SMOKE: create workspace proof file
```

**Description**

```md
Goal: prove Symphony can pick up a live issue, launch Codex, write a file in the issue workspace, and archive the attempt.

Steps:

1. Create `SYMPHONY_SMOKE_RESULT.md` in the workspace for this issue.
2. Include:
   - the issue identifier
   - the current UTC timestamp
   - the current working directory
   - the output of `pwd`
   - the output of `ls -la`
   - one line saying whether the workspace looks empty or repo-backed
3. Do not modify files outside the issue workspace.
4. Stop after the file exists and the summary is written.
```

### Verify the Run

1. Start Symphony and open the dashboard or poll `GET /api/v1/state`.
2. Confirm the issue appears under `running`.
3. Check `GET /api/v1/<ISSUE_IDENTIFIER>` or `GET /api/v1/<ISSUE_IDENTIFIER>/attempts` for a recorded attempt.
4. Inspect `workspace.root/<ISSUE_IDENTIFIER>/SYMPHONY_SMOKE_RESULT.md`. With the checked-in workflows, the default root is `../symphony-workspaces` (a sibling directory of the project repo).
5. After the first successful attempt lands, move the issue to `Done` or another terminal state so Symphony stops scheduling continuation turns for the still-active issue.

The checked-in workflows also instruct the agent to finish with `SYMPHONY_STATUS: DONE` on success or `SYMPHONY_STATUS: BLOCKED` when it cannot proceed. Symphony uses that explicit signal to stop local continuation turns for one-shot issues.

### Automated E2E Lifecycle Test

For repeatable, hands-free verification of the full pipeline (startup through PR creation), use the automated E2E lifecycle test:

```bash
cp scripts/e2e-config.example.yaml scripts/e2e-config.yaml
# Fill in your Linear project slug, team ID, GitHub repo, etc.
./scripts/run-e2e.sh
```

This creates a real Linear issue, waits for Symphony to pick it up and complete it, verifies the PR, checks Linear state, tests restart resilience, and cleans up — all in one command. See **[E2E Testing Guide](E2E_TESTING.md)** for full configuration and phase details.

---

## ⚙️ Runtime Behavior

### 🔄 Polling and Work Selection

Symphony polls Linear on the configured interval, filters candidates using `tracker.active_states`, sorts dispatches by priority then oldest creation time then identifier, suppresses blocked `Todo` issues, and enforces both the global concurrency limit and any per-state caps from `agent.max_concurrent_agents_by_state`.

During startup, active issues now emit lifecycle events through the same recent-events stream used by the rest of the dashboard. The queue UI surfaces `issue_queued`, `workspace_preparing`, `workspace_ready`, `container_starting`, `container_running`, `codex_initializing`, and `thread_started` so operators can see where time is being spent before the first agent response.

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

### 🌳 Workspace Strategies

Symphony supports two workspace strategies controlled by `workspace.strategy`:

| Strategy    | Description                                     | Disk Usage                  | Default |
| ----------- | ----------------------------------------------- | --------------------------- | ------- |
| `directory` | Full clone per issue — independent workspaces   | Higher (full clone each)    | Yes     |
| `worktree`  | Git worktree per issue from a shared bare clone | Lower (shares object store) | No      |

**Worktree strategy:**

When `workspace.strategy: worktree`, Symphony creates a single bare clone under `workspace.root/.base/<repo-key>.git` and issues get lightweight worktrees that share the same object store.

- Base clone is created automatically on first issue for a given repo route
- `git fetch` syncs refs before worktree creation — existing worktrees are never reset or rebased
- On retry, existing worktrees are reused as-is (branch attached if worktree dir was deleted)
- Successful terminal runs clean up the worktree; hard failures can be preserved for debugging
- The `.base` directory is excluded from startup transient cleanup
- Fail-fast: worktree mode requires a matching repo route for every issue
- Symphony warns when a configured repo route points back to `symphony-orchestrator` itself; keep that only for deliberate self-test traffic

**Configuration:**

```yaml
workspace:
  root: ../symphony-workspaces
  strategy: worktree # "directory" or "worktree"
  branch_prefix: "symphony/" # prefix for symphony-created branches
```

### ⏱️ Timeouts and Retries

| Knob               | Config Key                   | Purpose                                                                                                       |
| ------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Hook timeout       | `hooks.timeout_ms`           | Max time for any lifecycle hook                                                                               |
| Read timeout       | `codex.read_timeout_ms`      | JSON-RPC read timeout                                                                                         |
| Turn timeout       | `codex.turn_timeout_ms`      | Total time for a single turn                                                                                  |
| Turn stall timeout | `codex.stall_timeout_ms`     | Detect long-silent turns (per-turn level)                                                                     |
| Orchestrator stall | `agent.stall_timeout_ms`     | Kill agents with no events for this duration (default 1200000 ms = 20 min); set to `0` or negative to disable |
| Success state      | `agent.success_state`        | Linear state name to transition the issue to on successful completion; null = no transition                   |
| Retry backoff      | `agent.max_retry_backoff_ms` | Ceiling for retry delay                                                                                       |
| Active states      | `tracker.active_states`      | Which tracker states are eligible for dispatch                                                                |
| Terminal states    | `tracker.terminal_states`    | Which states stop work and trigger cleanup                                                                    |

> [!TIP]
> For safer live proving, set `codex.turn_timeout_ms` to something short like `120000` (2 minutes).

### 🐳 Docker Sandbox

Symphony runs the Codex agent inside a Docker container by default using a `node:22-bookworm` base image with the Codex CLI installed globally. This provides process isolation, resource limits, and security hardening.

**Key runtime behavior:**

| Property                   | How                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Path identity**          | All host paths are bind-mounted at their same absolute path inside the container                             |
| **Host permissions**       | Container runs as your UID/GID — no ownership drift                                                          |
| **Writable HOME**          | A persistent named volume is mounted at `/home/agent` for npm/pip/git caches                                 |
| **Generated runtime home** | Symphony materializes a temporary container-local `CODEX_HOME` per attempt and removes it with the container |
| **Resource limits**        | Memory, CPU, and tmpfs are configurable via `codex.sandbox.resources`                                        |
| **OOM detection**          | Exit code 137 with `OOMKilled=true` is surfaced as `container_oom` (retryable)                               |

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

## 📂 Filesystem Paths Reference

Symphony creates and reads several directories at runtime. This section documents every path so you know what is safe to keep, move, or delete.

### Host-Side Paths

| Path                                        | Source                                                     | Purpose                                                                                    | Safe to delete?                                     |
| ------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `.symphony/` (next to workflow file)        | `src/cli/index.ts` — default `archiveDir`                  | SQLite database (`symphony.db`) with attempts, events, and issue index; config overlay; encrypted secrets store | ⚠️ You lose all historical attempt data             |
| `../symphony-workspaces/` (sibling of repo) | `src/config/builders.ts` — default `workspace.root`        | Per-issue workspace directories (one subdirectory per issue identifier)                    | ✅ Yes — workspaces are re-created on next dispatch |
| `~/.codex/`                                 | `src/config/builders.ts` — default `codex.auth.sourceHome` | Codex CLI auth credentials (`auth.json`) read for `openai_login` mode                      | ⚠️ You'll need to re-run `codex login`              |

> [!NOTE]
> The archive directory can be overridden with `--log-dir` or the `DATA_DIR` environment variable. The workspace root can be overridden via `workspace.root` in the workflow file. The auth source home can be overridden via `codex.auth.source_home`.

### Inside Docker Containers

These paths exist only inside worker containers and are **not** on the host filesystem:

| Path                         | Source                                         | Purpose                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/home/agent/.codex-runtime` | `src/docker/spawn.ts` — `CONTAINER_CODEX_HOME` | Ephemeral per-attempt `CODEX_HOME` with generated `config.toml`, trusted-project entries, and optional `auth.json` — created at container startup, destroyed with the container |
| `/home/agent`                | `src/docker/spawn.ts` — `CONTAINER_HOME`       | Container `HOME` backed by a named Docker volume (`symphony-cache-<runId>`) for npm/pip/git caches                                                                              |

### Named Docker Volumes

| Volume                   | Purpose                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `symphony-cache-<runId>` | Persistent build caches for each worker (npm, pip, git) — survives container restarts but **not** `docker system prune --volumes` |

> [!TIP]
> Directories like `~/.symphony-codex` or `~/.symphony-codex-home` are **not** created or used by Symphony. If you find them on your host, they are leftover Codex CLI application data and can safely be deleted.

---

## 🔒 Network Security

### Bind Address

By default, Symphony binds to `127.0.0.1` (loopback only). Override with:

```bash
export SYMPHONY_BIND="0.0.0.0"   # Listen on all interfaces
```

### Write Guard

All mutating API requests (POST, PUT, PATCH, DELETE) are protected by a write guard middleware (`src/http/write-guard.ts`):

| Scenario | Behavior |
|----------|----------|
| Request from loopback (`127.0.0.1`, `::1`) | Allowed — no token required |
| Request from non-loopback, no `SYMPHONY_WRITE_TOKEN` set | **403 `write_forbidden`** |
| `SYMPHONY_WRITE_TOKEN` set, valid `Authorization: Bearer <token>` | Allowed from any address |
| `SYMPHONY_WRITE_TOKEN` set, missing or invalid token | **401 `write_unauthorized`** |

To enable remote write access:

```bash
export SYMPHONY_BIND="0.0.0.0"
export SYMPHONY_WRITE_TOKEN="your-secret-token"
```

All mutating requests then require:

```
Authorization: Bearer your-secret-token
```

> [!CAUTION]
> Exposing Symphony on a non-loopback address without `SYMPHONY_WRITE_TOKEN` blocks all mutations from remote clients. Always set both when binding to `0.0.0.0`.

### Rate Limiting

All `/api/*` and `/metrics` endpoints are rate-limited to **300 requests per 60 seconds** per client. When the limit is exceeded, the server responds with HTTP `429 Too Many Requests`.

### Read-only methods

`GET`, `HEAD`, and `OPTIONS` requests are exempt from write guard checks and always allowed from any address.

---

## 🌍 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LINEAR_API_KEY` | — | Linear API key (required for Linear tracker) |
| `LINEAR_PROJECT_SLUG` | — | Linear project slug |
| `OPENAI_API_KEY` | — | OpenAI API key (for `api_key` auth mode) |
| `GITHUB_TOKEN` | — | GitHub Personal Access Token for git automation |
| `MASTER_KEY` | — | AES encryption key for the secrets store |
| `SYMPHONY_BIND` | `127.0.0.1` | Address to bind the HTTP server |
| `SYMPHONY_WRITE_TOKEN` | — | Bearer token for remote write access (see [Network Security](#-network-security)) |
| `SYMPHONY_LOG_FORMAT` | — | Logger output format (`logfmt` or JSON when unset) |
| `SYMPHONY_PERSISTENCE` | `sqlite` | Persistence backend |
| `SYMPHONY_HOST_WORKSPACE_ROOT` | — | Host-side workspace root for Docker volume mapping |
| `SYMPHONY_HOST_ARCHIVE_DIR` | — | Host-side archive directory for Docker volume mapping |
| `SYMPHONY_CONTAINER_WORKSPACE_ROOT` | — | Container-side workspace path |
| `SYMPHONY_CONTAINER_ARCHIVE_DIR` | — | Container-side archive path |
| `DATA_DIR` | `.symphony/` | Archive and workspace base directory |
| `DISPATCH_MODE` | `local` | `local` for single-process, `remote` for control/data plane split |
| `DISPATCH_URL` | — | Data plane URL when `DISPATCH_MODE=remote` |
| `DISPATCH_PORT` | `9100` | Data plane listen port (in remote dispatch mode) |
| `DISPATCH_SHARED_SECRET` | — | Shared secret for remote dispatch authentication |
| `SENTRY_DSN` | — | Sentry-compatible error tracking DSN |
| `CODEX_AUTH_SOURCE_HOME` | `~/.codex` | Codex auth credential home directory |
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |

---

## 🔧 Advanced Configuration Reference

The workflow YAML file supports the following configuration sections. Options not set in your workflow file use the defaults shown below.

### `codex` — Agent Provider Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `command` | string | `"codex app-server"` | Command to start the Codex agent server |
| `model` | string | `"gpt-5.4"` | Model identifier passed to Codex |
| `reasoningEffort` | enum | `"high"` | Reasoning level: `none`, `minimal`, `low`, `medium`, `high`, `xhigh` |
| `personality` | string | `"friendly"` | Agent personality/tone setting |
| `selfReview` | boolean | `false` | Enable agent self-review mode |
| `structuredOutput` | boolean | `false` | Enable structured output mode |
| `approvalPolicy` | string\|object | reject all | Tool call approval policy |
| `threadSandbox` | string | `"workspace-write"` | Thread-level sandbox: `workspace-write` or `danger-full-access` |
| `turnSandboxPolicy` | object | `{type: "workspaceWrite"}` | Per-turn sandbox policy (type, writableRoots, networkAccess) |
| `readTimeoutMs` | number | `5000` | Timeout for reading agent responses |
| `turnTimeoutMs` | number | `3600000` | Maximum duration per agent turn (1 hour) |
| `drainTimeoutMs` | number | `2000` | Timeout for draining pending work on shutdown |
| `startupTimeoutMs` | number | `30000` | Docker container startup timeout |
| `stallTimeoutMs` | number | `300000` | Per-turn stall detection timeout (5 min) |

### `codex.auth` — Authentication

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `mode` | enum | `"api_key"` | `api_key` or `openai_login` |
| `sourceHome` | string | `"~/.codex"` | Path to Codex auth credentials |

### `codex.sandbox` — Container Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `image` | string | `"symphony-codex:latest"` | Docker image for sandboxed agents |
| `network` | string | `""` | Docker network name (empty = default) |
| `extraMounts` | string[] | `[]` | Extra host→container bind mounts (identity-mapped paths) |
| `envPassthrough` | string[] | `[]` | Environment variables forwarded into the container |
| `egressAllowlist` | string[] | `[]` | Allowed egress domains for network filtering |

### `codex.sandbox.security`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `noNewPrivileges` | boolean | `true` | Set `--security-opt=no-new-privileges` on the container |
| `dropCapabilities` | boolean | `true` | Drop all Linux capabilities |
| `gvisor` | boolean | `false` | Enable gVisor runtime |
| `seccompProfile` | string | `""` | Path to a custom Seccomp profile |

### `codex.sandbox.resources`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `memory` | string | `"4g"` | Container memory limit |
| `memoryReservation` | string | `"1g"` | Guaranteed memory reservation |
| `memorySwap` | string | `"4g"` | Swap limit (equal to memory = no swap) |
| `cpus` | string | `"2.0"` | CPU limit |
| `tmpfsSize` | string | `"512m"` | Size of tmpfs mount |

### `codex.sandbox.logs`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `driver` | string | `"json-file"` | Docker log driver |
| `maxSize` | string | `"50m"` | Maximum log file size |
| `maxFile` | number | `3` | Maximum number of rotated log files |

### `agent` — Orchestrator Agent Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `maxConcurrentAgents` | number | `10` | Maximum agents running simultaneously |
| `maxConcurrentAgentsByState` | object | `{}` | Per-state concurrency limits (e.g. `{"In Progress": 5}`) |
| `maxTurns` | number | `20` | Maximum conversation turns per agent run |
| `maxRetryBackoffMs` | number | `300000` | Maximum retry backoff (5 min) |
| `maxContinuationAttempts` | number | `5` | Maximum continuation turns for a single run |
| `successState` | string | `null` | Linear state to transition to on success |
| `stallTimeoutMs` | number | `1200000` | Agent-level stall timeout (20 min) |
| `preflightCommands` | string[] | `[]` | Shell commands to run before each agent turn |

### `workspace` — Workspace Isolation

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `root` | string | `"../symphony-workspaces"` | Root directory for per-issue workspaces |
| `strategy` | enum | `"directory"` | `directory` (clone) or `worktree` (git worktree) |
| `branchPrefix` | string | `"symphony/"` | Branch name prefix for worktree strategy |

### `workspace.hooks`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `afterCreate` | string | `null` | Shell command to run after workspace creation |
| `beforeRun` | string | `null` | Shell command to run before each agent run |
| `afterRun` | string | `null` | Shell command to run after each agent run |
| `beforeRemove` | string | `null` | Shell command to run before workspace removal |
| `timeoutMs` | number | `60000` | Hook execution timeout (1 min) |

### `stateMachine` — Custom Workflow Stages

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `stages` | array | `[]` | Workflow stage definitions, each with `name` (string) and `kind` (`backlog`, `todo`, `active`, `gate`, `terminal`) |
| `transitions` | object | `{}` | State transition map — keys are state names, values are arrays of allowed target states |

When `stages` is empty, Symphony derives stages from the tracker's workflow configuration.

### `github` — GitHub Integration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `token` | string | — | GitHub Personal Access Token |
| `apiBaseUrl` | string | `"https://api.github.com"` | Custom GitHub API endpoint (for GitHub Enterprise) |

### `notifications.slack`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `webhookUrl` | string | — | Slack incoming webhook URL |
| `verbosity` | enum | `"critical"` | `off`, `critical`, or `verbose` |

---

## 📡 JSON API Reference

| Method   | Endpoint                               | Description                                                                           |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET`    | `/metrics`                             | Prometheus-format service metrics                                                     |
| `GET`    | `/api/v1/runtime`                      | Runtime metadata such as version, workflow path, data directory, and provider summary |
| `GET`    | `/api/v1/state`                        | Snapshot — queued, running, retrying, completed, workflow columns, and token totals   |
| `POST`   | `/api/v1/refresh`                      | Trigger immediate reconciliation pass                                                 |
| `GET`    | `/api/v1/transitions`                  | List available workflow transitions per issue                                         |
| `GET`    | `/api/v1/:issue_identifier`            | Issue detail, recent events, and archived attempts                                    |
| `GET`    | `/api/v1/:issue_identifier/attempts`   | Archived attempts plus current live attempt id                                        |
| `GET`    | `/api/v1/attempts/:attempt_id`         | Archived per-attempt event timeline                                                   |
| `POST`   | `/api/v1/:issue_identifier/model`      | Save per-issue model override                                                         |
| `POST`   | `/api/v1/:issue_identifier/transition` | Transition an issue to another workflow state                                         |
| `GET`    | `/api/v1/config`                       | Effective merged operator config                                                      |
| `GET`    | `/api/v1/config/schema`                | Config API schema and example overlay payloads                                        |
| `GET`    | `/api/v1/config/overlay`               | Persistent overlay values only                                                        |
| `PUT`    | `/api/v1/config/overlay`               | Apply an overlay patch                                                                |
| `PATCH`  | `/api/v1/config/overlay/:path`         | Set one overlay path to a specific value                                              |
| `DELETE` | `/api/v1/config/overlay/:path`         | Remove one overlay path                                                               |
| `GET`    | `/api/v1/secrets`                      | List configured secret keys                                                           |
| `POST`   | `/api/v1/secrets/:key`                 | Store one secret                                                                      |
| `DELETE` | `/api/v1/secrets/:key`                 | Delete one secret                                                                     |
| `GET`    | `/api/v1/setup/status`                 | Setup wizard completion status for each step                                          |
| `POST`   | `/api/v1/setup/master-key`             | Set or regenerate the encryption master key                                           |
| `GET`    | `/api/v1/setup/linear-projects`        | List Linear projects using the configured `LINEAR_API_KEY`                            |
| `POST`   | `/api/v1/setup/linear-project`         | Save the selected Linear project slug into `tracker.project_slug`                     |
| `POST`   | `/api/v1/setup/openai-key`             | Validate and store an OpenAI API key                                                  |
| `POST`   | `/api/v1/setup/codex-auth`             | Upload `auth.json` for Codex Login mode                                               |
| `POST`   | `/api/v1/setup/pkce-auth/start`        | Start the browser-based PKCE login flow and return the auth URL                       |
| `GET`    | `/api/v1/setup/pkce-auth/status`       | Poll PKCE authorization status; exchanges code for tokens when the callback arrives   |
| `POST`   | `/api/v1/setup/pkce-auth/cancel`       | Cancel an active PKCE login flow                                                      |
| `POST`   | `/api/v1/setup/github-token`           | Validate and store a GitHub PAT                                                       |
| `POST`   | `/api/v1/setup/create-test-issue`      | Create a smoke test issue in the configured tracker                                   |
| `POST`   | `/api/v1/setup/create-label`           | Create a workflow label in the tracker                                                |
| `POST`   | `/api/v1/setup/create-project`         | Create a new tracker project                                                          |
| `GET`    | `/api/v1/setup/repo-routes`           | List configured repository routing rules                                              |
| `POST`   | `/api/v1/setup/repo-route`            | Add a repository routing rule                                                         |
| `DELETE` | `/api/v1/setup/repo-route/:index`     | Remove a repository routing rule by index                                             |
| `POST`   | `/api/v1/setup/detect-default-branch` | Detect the default branch of a configured repository                                  |
| `POST`   | `/api/v1/setup/reset`                  | Clear stored secrets plus auth-mode overlay values and restart setup                  |
| `GET`    | `/api/v1/events`                       | SSE stream of real-time orchestrator events                                           |
| `GET`    | `/api/v1/models`                       | List available Codex models from the provider                                         |
| `POST`   | `/api/v1/:issue_identifier/abort`      | Abort a running issue                                                                 |
| `POST`   | `/api/v1/:issue_identifier/steer`      | Inject a steering message into a running agent session                                |
| `GET`    | `/api/v1/git/context`                  | Git repository context and configured repo routes                                     |
| `GET`    | `/api/v1/workspaces`                   | Workspace inventory with disk usage and lifecycle info                                |
| `DELETE` | `/api/v1/workspaces/:workspace_key`    | Remove a workspace directory                                                          |
| `GET`    | `/api/v1/templates`                    | List prompt templates                                                                 |
| `POST`   | `/api/v1/templates`                    | Create a prompt template                                                              |
| `GET`    | `/api/v1/templates/:id`               | Get a prompt template by ID                                                           |
| `PUT`    | `/api/v1/templates/:id`               | Update a prompt template                                                              |
| `DELETE` | `/api/v1/templates/:id`               | Delete a prompt template                                                              |
| `POST`   | `/api/v1/templates/:id/preview`       | Preview a rendered template with sample data                                          |
| `GET`    | `/api/v1/audit`                        | Query audit log entries with optional filters                                         |
| `GET`    | `/api/v1/openapi.json`                 | OpenAPI 3.0 specification                                                             |
| `GET`    | `/api/docs`                            | Swagger UI for interactive API exploration                                            |

---

## 📡 Real-time Events (SSE)

`GET /api/v1/events` opens a Server-Sent Events stream that pushes real-time orchestrator events to the dashboard and any connected client.

### Event Types

| Channel | Payload Fields | When It Fires |
|---------|---------------|---------------|
| `issue.started` | `issueId`, `identifier`, `attempt` | Agent worker launched for an issue |
| `issue.completed` | `issueId`, `identifier`, `outcome` | Agent finished (any terminal outcome) |
| `issue.stalled` | `issueId`, `identifier`, `reason` | Stall detected and agent killed |
| `issue.queued` | `issueId`, `identifier` | Issue queued for later processing |
| `worker.failed` | `issueId`, `identifier`, `error` | Worker crash, timeout, or other failure |
| `model.updated` | `identifier`, `model`, `source` | Model selection changed at runtime |
| `workspace.event` | `issueId`, `identifier`, `status` | Workspace lifecycle event (preparing, ready, failed) |
| `agent.event` | `issueId`, `identifier`, `type`, `message`, `sessionId`, `timestamp`, `content` | Raw agent event forwarded from the worker stream |
| `poll.complete` | `timestamp`, `issueCount` | Polling cycle completed |
| `system.error` | `message`, `context` | System-level error not tied to a specific issue |
| `audit.mutation` | `tableName`, `key`, `path`, `operation`, `actor`, `timestamp` | Config, secret, or template mutation logged |

### Connecting

```bash
curl -N http://localhost:4000/api/v1/events
```

The dashboard connects automatically and uses these events to update the Overview, Board, Issue Inspector, and Live Log views in real time.

---

## 🐳 Sandbox Image Tooling

The sandbox Docker image (`Dockerfile.sandbox`) ships with:

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 22 (bookworm) | Runtime |
| Codex CLI | 0.116.0 | AI agent execution |
| bubblewrap | system | Sandbox isolation |
| git | system | Source control |
| curl | system | HTTP operations |
| jq | system | JSON processing |
| ripgrep | system | Fast search |

The container runs as the host user (`--user $(id -u):$(id -g)`) to avoid file ownership drift.

---

## 🏷️ GitHub Label Management

`scripts/sync-labels.sh` creates and updates GitHub issue labels for the project:

```bash
bash scripts/sync-labels.sh
```

Creates labels in these categories:
- **Priority**: P0 (critical), P1 (high), P2 (medium), P3 (low)
- **Type**: bug, enhancement, chore, documentation
- **Area**: core, api, dashboard, infra
- **Workflow**: triage, good first issue

Requires `gh` CLI authenticated with repo access.

---

## 🗂️ Archived Attempts and Logs

By default, the data directory is `.symphony/` next to the workflow file (override with `--log-dir` or `DATA_DIR`).

### Storage: SQLite

All attempt and event data is persisted in a **SQLite database** (`symphony.db`) using Drizzle ORM with WAL mode:

```
.symphony/
├── symphony.db           # SQLite database (attempts, events, issue index)
├── symphony.db-shm       # WAL shared-memory file (normal, do not delete)
├── symphony.db-wal       # Write-ahead log (normal, do not delete)
├── config/               # Operator config overlay (YAML)
├── secrets.enc           # AES-encrypted credential store
├── secrets.audit.log     # Secret access audit trail
├── master.key            # Encryption master key
└── codex-auth/           # Codex login tokens
```

The database contains three tables:

| Table | Contents |
| ----- | -------- |
| `attempts` | One row per agent execution — status, model, tokens, timing, PR URL, stop signal |
| `attempt_events` | Individual events per attempt — type, message, content, token usage |
| `issue_index` | Materialized index mapping issue identifiers to their latest attempt state |

> [!NOTE]
> Legacy JSONL archives (`attempts/*.json` + `events/*.jsonl`) are automatically migrated into SQLite on first startup. The migration is idempotent and safe to run repeatedly.

### Viewing Attempt Data

**Web dashboard** — open `http://127.0.0.1:4000` for the full UI with board, overview, and attempt detail views.

**API endpoints:**

```bash
curl -s http://127.0.0.1:4000/api/v1/state                         # full runtime snapshot
curl -s http://127.0.0.1:4000/api/v1/NIN-6                         # issue detail + recent events
curl -s http://127.0.0.1:4000/api/v1/NIN-6/attempts                # all attempts for an issue
curl -s http://127.0.0.1:4000/api/v1/attempts/<attempt-id>         # single attempt + events
curl -N  http://127.0.0.1:4000/api/v1/events                       # SSE real-time event stream
```

**Direct SQLite queries** (when Symphony is stopped, or read-only via WAL mode):

```bash
sqlite3 .symphony/symphony.db "SELECT attempt_id, issue_identifier, status, model, started_at FROM attempts ORDER BY started_at DESC LIMIT 10;"
sqlite3 .symphony/symphony.db "SELECT type, message, timestamp FROM attempt_events WHERE attempt_id = '...' ORDER BY timestamp;"
```

**CLI helper** for archive-first inspection:

```bash
./symphony-logs MT-42
./symphony-logs NIN-3 --attempts --dir tests/fixtures/symphony-archive-sandbox/.symphony
./symphony-logs --attempt 00000000-0000-4000-8000-000000000422 --dir tests/fixtures/symphony-archive-sandbox/.symphony
```

The helper emits JSON and works with both the SQLite database and legacy JSONL archives.

### Process Logs

Runtime process logs are emitted to **stdout** via Pino (not written to files). Control the format and verbosity with environment variables:

| Variable | Values | Default |
| -------- | ------ | ------- |
| `SYMPHONY_LOG_FORMAT` | `logfmt`, `json` | `logfmt` |
| `LOG_LEVEL` | `trace`, `debug`, `info`, `warn`, `error`, `fatal` | `info` |

To persist process logs, pipe stdout to a file:

```bash
node dist/cli/index.js ./WORKFLOW.md --port 4000 2>&1 | tee symphony.log
```

---

## ⚠️ Common Failure Cases

> [!WARNING]
>
> ### Missing Tracker API Key
>
> If `tracker.api_key` resolves to an empty value, startup fails with `missing_tracker_api_key`.

> [!WARNING]
>
> ### Missing Codex Auth
>
> If `codex app-server` cannot authenticate, `account/read` fails the run early as a startup failure instead of leaving the worker hanging.

> [!WARNING]
>
> ### Required MCP Startup Failure
>
> This is a **Codex runtime** problem, not a Symphony bug:
>
> ```text
> error code=startup_failed msg="thread/start failed because a required MCP server did not initialize"
> ```

> [!WARNING]
>
> ### Invalid External Credentials
>
> If the Linear token or provider credentials are invalid, Symphony surfaces the upstream failure rather than crashing.

---

## 🔭 Visual Verification of Dashboard UI

Symphony includes a `visual-verify` skill and project-level `agent-browser` configuration for visually verifying dashboard UI changes using bundled Chromium in headed mode.

### Prerequisites

| Requirement       | Details                                           |
| ----------------- | ------------------------------------------------- |
| **agent-browser** | `pnpm add -g agent-browser && agent-browser install` |

### Project Configuration

The `agent-browser.json` at project root configures headed mode with screenshots saved to `docs/archive/screenshots/`:

```json
{
  "headed": true,
  "screenshotDir": "./docs/archive/screenshots",
  "screenshotFormat": "png"
}
```

> [!NOTE]
> `agent-browser` uses its own bundled Chromium. Run `agent-browser install` to download it. No `executablePath` is needed.

### Quick Verify Workflow

Use after a targeted UI change to confirm the edit visually:

```bash
# 1. Start the dashboard
node dist/cli/index.js ./WORKFLOW.example.md --port 4000

# 2. Baseline screenshot
agent-browser open http://127.0.0.1:4000
agent-browser wait --load networkidle
agent-browser screenshot --annotate docs/archive/screenshots/before.png

# 3. Make code changes, then reload
agent-browser reload
agent-browser wait --load networkidle
agent-browser screenshot --annotate docs/archive/screenshots/after.png

# 4. Pixel diff
agent-browser diff screenshot --baseline docs/archive/screenshots/before.png

# 5. Cleanup
agent-browser close
```

### Full QA Workflow

For comprehensive testing (before releases, after major UI changes), the `visual-verify` skill in `skills/visual-verify/SKILL.md` teaches a structured exploration workflow with video recording, annotated screenshots, console error checking, and a report template.

> [!TIP]
> Read `skills/visual-verify/SKILL.md` for the full workflow. Reference docs in `skills/visual-verify/references/` cover the dashboard element map, command reference, and issue severity taxonomy.

---

## 🔐 Trust and Auth

Symphony is designed for a local, operator-controlled, high-trust environment.

→ See **[`docs/TRUST_AND_AUTH.md`](TRUST_AND_AUTH.md)** for the full trust boundary and auth model.
