# E2E Lifecycle Test

> Automated end-to-end testing for the full Symphony pipeline: startup, setup wizard, issue creation, agent work, PR verification, and restart resilience.

---

## Overview

The E2E lifecycle test replaces the manual 10-30 minute verification loop with a single command:

```bash
./scripts/run-e2e.sh
```

It drives Symphony through every stage of its lifecycle against real Linear and GitHub APIs, then produces a structured verdict with diagnostics.

```
f(config) -> { verdict: "pass" | "fail", summary.json, events.jsonl }
```

---

## Prerequisites

Before running the test, ensure you have:

| Requirement | How to verify |
|---|---|
| Node.js >= 22 | `node --version` |
| pnpm | `pnpm --version` |
| Docker daemon running | `docker info` |
| `gh` CLI authenticated | `gh auth status` |
| Linear API key | Set `LINEAR_API_KEY` env var |
| GitHub personal access token | Set `GITHUB_TOKEN` env var |
| Codex auth file | `~/.codex/auth.json` must exist |
| A dedicated Linear test project | Used to create and clean up test issues |
| A test GitHub repository | Where the agent will create PRs |

> **Tip**: Use a throwaway Linear project and GitHub repo. The test creates real issues and PRs, then cleans them up automatically.

---

## Quick Start

**1. Copy and fill the config**

```bash
cp scripts/e2e-config.example.yaml scripts/e2e-config.yaml
```

Edit `scripts/e2e-config.yaml` with your values:

```yaml
linear:
  api_key: $LINEAR_API_KEY          # env var reference or literal
  project_slug: "my-test-project"   # your Linear project's slug
  team_id: "abc-123-uuid"           # your Linear team UUID

github:
  token: $GITHUB_TOKEN
  test_repo:
    url: "https://github.com/you/test-repo.git"
    branch: "main"
    identifier_prefix: "SYM"
    owner: "you"
    repo: "test-repo"
```

> `scripts/e2e-config.yaml` is gitignored — your secrets stay local.

**2. Run the test**

```bash
./scripts/run-e2e.sh
```

Or with options:

```bash
./scripts/run-e2e.sh --skip-build --verbose
```

**3. Read the results**

Terminal output shows each phase inline:

```
  preflight          pass    1.2s
  clean-slate        pass    0.1s
  start-symphony     pass    3.4s
  setup-wizard       pass    8.2s
  create-issue       pass    1.1s   SYM-42
  wait-pickup        pass   12.3s   claimed
  monitor-lifecycle  pass  187.4s
  verify-pr          pass    2.1s
  verify-linear      pass    1.5s
  restart-resilience pass    8.3s
  collect-artifacts  pass    0.8s
  cleanup            pass    2.3s

  VERDICT: PASS  (220.4s)
  Issue:   SYM-42 -- https://linear.app/...
  PR:      https://github.com/.../pull/14
  Report:  e2e-reports/abc123/
```

---

## CLI Options

```
npx tsx scripts/e2e-lifecycle.ts [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--config <path>` | `scripts/e2e-config.yaml` | Path to the config file |
| `--timeout <seconds>` | 1800 (30 min) | Override the lifecycle timeout |
| `--skip-build` | false | Skip `pnpm run build` in preflight |
| `--keep` | false | Don't auto-cleanup the test issue and PR |
| `--keep-symphony` | false | Don't kill the Symphony process after the run |
| `--verbose` | false | Print debug-level polling logs |
| `--help` | | Show usage |

---

## Config Reference

The config file is YAML with Zod validation. Values starting with `$` are expanded from environment variables.

### `linear` (required)

| Field | Type | Description |
|-------|------|-------------|
| `api_key` | string | Linear API key. Use `$LINEAR_API_KEY` for env expansion |
| `project_slug` | string | The Linear project's slug (visible in project URL) |
| `team_id` | string | Your Linear team's UUID (find via Linear API or team settings) |

### `codex` (optional — has defaults)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `auth_mode` | `"openai_login"` \| `"api_key"` | `"api_key"` | How Codex authenticates with OpenAI |
| `source_home` | string | `"~/.codex"` | Path to directory containing `auth.json` |
| `model` | string | `"o3-mini"` | Model name for the agent. Use a cheap/fast model for testing |
| `reasoning_effort` | enum | `"low"` | One of: `none`, `minimal`, `low`, `medium`, `high`, `xhigh` |

### `github` (required)

| Field | Type | Description |
|-------|------|-------------|
| `token` | string | GitHub personal access token. Use `$GITHUB_TOKEN` |
| `test_repo.url` | string | Full clone URL of the test repository |
| `test_repo.branch` | string | Default branch name (usually `"main"`) |
| `test_repo.identifier_prefix` | string | Issue prefix for this repo (e.g. `"SYM"`) |
| `test_repo.owner` | string | GitHub owner (org or user) |
| `test_repo.repo` | string | GitHub repository name |

### `server` (optional)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | number | `4111` | Port for the test Symphony instance. Use a non-default port to avoid collision with a dev instance on 4000 |

### `timeouts` (optional — all in milliseconds)

| Field | Default | Description |
|-------|---------|-------------|
| `symphony_startup_ms` | 15000 | Max wait for Symphony HTTP server to become ready |
| `setup_complete_ms` | 30000 | Max wait for setup wizard completion |
| `issue_pickup_ms` | 60000 | Max wait for Symphony to claim the test issue |
| `lifecycle_complete_ms` | 1800000 | Max wait for the agent to complete its work (30 min) |
| `pr_verification_ms` | 30000 | Max wait for PR verification via `gh` |
| `graceful_shutdown_ms` | 10000 | Grace period before SIGKILL on shutdown |

### `test_issue` (required)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `title` | string | | Issue title. `{run_id}` is NOT expanded here — it's appended automatically |
| `description` | string | | Issue description. `{run_id}` is replaced with the actual run ID |
| `priority` | number | 3 | Linear priority (0=none, 1=urgent, 2=high, 3=medium, 4=low) |

### `cleanup` (optional)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Auto-cleanup issue + PR after the run. Override with `--keep` |

---

## Phase Pipeline

The test runs 12 phases sequentially. On the first failure, remaining phases skip — except `collect-artifacts` and `cleanup`, which always run.

| # | Phase | What it does |
|---|-------|--------------|
| 0 | **preflight** | Validates credentials, Docker, `gh`, port availability, repo reachability, builds the project |
| 1 | **clean-slate** | Removes `.symphony/` directory for a fresh start |
| 2 | **start-symphony** | Generates a minimal WORKFLOW file, spawns Symphony, waits for HTTP readiness |
| 3 | **setup-wizard** | Drives all 5 setup API steps: master key, GitHub token, Codex auth, repo route, Linear project |
| 4 | **create-issue** | Creates a test issue in Linear via GraphQL (in default state, not "In Progress") |
| 5 | **wait-pickup** | Polls `/api/v1/state` until the issue appears in `running[]` |
| 6 | **monitor-lifecycle** | Polls state + attempts until the agent completes or times out |
| 7 | **verify-pr** | Validates the PR exists, has commits, and has a non-empty diff |
| 8 | **verify-linear** | Confirms the Linear issue reached "Done" state with a Symphony comment |
| 9 | **restart-resilience** | Restarts Symphony and verifies the completed issue is NOT re-dispatched |
| 10 | **collect-artifacts** | Copies `.symphony/attempts/`, `events/`, and `symphony.db` to the report dir |
| 11 | **cleanup** | Closes the PR (with branch deletion) and cancels the Linear issue |

---

## Output

Each run creates a report directory:

```
e2e-reports/{run-id}/
  e2e-summary.json        # Machine-readable verdict + metadata
  events.jsonl            # Timestamped event log (one JSON per line)
  symphony-stdout.log     # Symphony process stdout
  symphony-stderr.log     # Symphony process stderr
  WORKFLOW.e2e.md         # The generated workflow file
  artifacts/
    attempts/             # Copied from .symphony/attempts/
    events/               # Copied from .symphony/events/
    symphony.db           # SQLite database (if present)
```

### Summary JSON

The `e2e-summary.json` contains the full structured result:

```json
{
  "verdict": "pass",
  "run_id": "abc123",
  "started_at": "2026-03-28T10:30:00Z",
  "finished_at": "2026-03-28T10:33:40Z",
  "duration_ms": 220400,
  "config_summary": { "model": "o3-mini", "project": "test-project", "repo": "you/test-repo" },
  "phases": [
    { "name": "preflight", "status": "pass", "duration_ms": 1200 },
    ...
  ],
  "issue": { "identifier": "SYM-42", "url": "https://linear.app/..." },
  "diagnosis": null,
  "errors": []
}
```

### Failure Diagnosis

On failure, the test scans Symphony's stderr log and attempt records to classify the problem:

| Category | What it means |
|----------|---------------|
| `AUTH_EXPIRED` | 401 from Linear or GitHub — token needs refresh |
| `DOCKER_OOM` | Container killed (exit 137) — increase Docker memory |
| `RATE_LIMITED` | 429 response — wait and retry |
| `AGENT_TIMEOUT` | Agent stalled with no progress |
| `AGENT_CRASH` | Non-zero exit or uncaught exception |
| `CONFIG_ERROR` | Validation failure in config |
| `NETWORK_ERROR` | ECONNREFUSED or ETIMEDOUT |
| `BUILD_FAILURE` | `pnpm run build` failed |
| `UNKNOWN` | No pattern matched — check logs manually |

---

## Debugging

### `--keep` mode

Run with `--keep` to preserve the test issue and PR for manual inspection:

```bash
./scripts/run-e2e.sh --keep --verbose
```

The terminal output includes direct links to the Linear issue and GitHub PR.

### `--keep-symphony` mode

Run with `--keep-symphony` to leave the Symphony process running after the test:

```bash
./scripts/run-e2e.sh --keep-symphony
```

Then open `http://127.0.0.1:4111` to inspect the dashboard state.

### Verbose logging

`--verbose` prints every state/attempt poll to the console. All events are always written to `events.jsonl` regardless of this flag.

### Reading the event log

```bash
cat e2e-reports/<run-id>/events.jsonl | jq .
```

Each line is a timestamped JSON object:

```jsonl
{"ts":"...","phase":"preflight","name":"Docker running","status":"pass"}
{"ts":"...","phase":"setup-wizard","name":"master-key","status":"pass","step":1}
{"ts":"...","event":"log","message":"Issue created: SYM-42 (state: Backlog)"}
```

---

## How It Works (Technical Details)

### Setup wizard automation

The test drives Symphony's setup wizard via its HTTP API, not the browser UI. The 5 steps must execute in a specific order:

1. **Master Key** must be first (initializes the secrets store encryption)
2. **GitHub Token** and **Codex Auth** can be in any order (both depend only on master key)
3. **Repo Route** can be anywhere after master key
4. **Linear Project** must be last (it triggers `orchestrator.start()`)

Each API call has a 15-second timeout via `AbortSignal.timeout()`.

### WORKFLOW.e2e.md scaffold

The test generates a minimal workflow file with `project_slug: ""` — this triggers setup mode via Zod validation failure (`z.string().min(1)`), so the orchestrator doesn't start until the setup wizard completes. The file is written to `{reportDir}/WORKFLOW.e2e.md` and deleted on cleanup.

### Completion detection

The test detects issue completion through **attempt records**, not the `completed[]` array in the state snapshot. This is intentional — `completed[]` reflects Linear state transitions that could be manual, while the attempt record's `status` and `stopSignal` fields are authoritative:

- `status: "completed"` + `stopSignal: "done"` = pass
- `status: "failed"` / `"timed_out"` / `"stalled"` / `"cancelled"` = fail

### Restart resilience (Phase 9)

This phase verifies Symphony's deduplication mechanism (`seedCompletedClaims`): after a completed issue, restarting Symphony should NOT re-dispatch it. The test:

1. Sends SIGTERM to the running Symphony process
2. Waits for exit, then spawns a fresh instance
3. Waits for the orchestrator's first poll cycle (10s settle time)
4. Asserts the completed issue is NOT in `running[]`

### `configured` vs individual steps

Symphony's `/api/v1/setup/status` returns `configured: true` when `masterKey` AND `linearProject` are done — but `linearProject.done` only checks API key presence (not project slug selection). The test checks all 5 steps individually rather than relying on the `configured` flag.

---

## CI Integration

The E2E test requires real credentials and Docker, so it's not part of the standard CI pipeline. To add it:

```yaml
# Example GitHub Actions job
e2e-lifecycle:
  runs-on: ubuntu-latest
  needs: build
  if: github.event_name == 'workflow_dispatch'
  env:
    LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - run: pnpm install
    - run: pnpm run build
    - run: |
        cp scripts/e2e-config.example.yaml scripts/e2e-config.yaml
        # Patch config with CI values...
        ./scripts/run-e2e.sh --skip-build --timeout 600
    - uses: actions/upload-artifact@v4
      with:
        name: e2e-report
        path: e2e-reports/
```

> Use `workflow_dispatch` to run on-demand rather than on every push.
