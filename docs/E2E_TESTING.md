# E2E Lifecycle Test

> Automated end-to-end testing for the full Risoluto pipeline: startup, issue creation, agent work, PR verification, and restart resilience.

---

## Overview

The E2E lifecycle test replaces the manual 10-30 minute verification loop with a single command:

```bash
./scripts/run-e2e.sh
```

It drives Risoluto through every stage of its lifecycle against real Linear and GitHub APIs, then produces a structured verdict with diagnostics.

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
  start-risoluto     pass    3.4s
  create-issue       pass    1.1s   SYM-42
  wait-pickup        pass   12.3s   claimed
  monitor-lifecycle  pass  187.4s
  verify-pr          pass    2.1s
  verify-linear      pass    1.5s
  restart-resilience pass    8.3s
  collect-artifacts  pass    0.8s
  cleanup            pass    2.3s

  VERDICT: PASS  (212.2s)
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
| `--keep-risoluto` | false | Don't kill the Risoluto process after the run |
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
| `model` | string | `"gpt-5-codex-mini"` | Model name for the agent. Use a cheap/fast model for testing |
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
| `port` | number | `4111` | Port for the test Risoluto instance. Use a non-default port to avoid collision with a dev instance on 4000 |

### `timeouts` (optional — all in milliseconds)

| Field | Default | Description |
|-------|---------|-------------|
| `risoluto_startup_ms` | 15000 | Max wait for Risoluto HTTP server to become ready |
| `setup_complete_ms` | 30000 | Reserved (setup wizard bypassed in current test) |
| `issue_pickup_ms` | 60000 | Max wait for Risoluto to claim the test issue |
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
| 1 | **clean-slate** | Removes `.risoluto/` directory for a fresh start |
| 2 | **start-risoluto** | Generates a fully-configured WORKFLOW file, spawns Risoluto in normal mode (setup bypassed via `MASTER_KEY` env var and pre-filled config), waits for HTTP readiness |
| 3 | **create-issue** | Creates a test issue in Linear via GraphQL in "In Progress" state |
| 4 | **wait-pickup** | Polls `/api/v1/state` until the issue appears in `running[]` |
| 5 | **monitor-lifecycle** | Polls state + attempts until the agent completes or times out |
| 6 | **verify-api-surface** | Hits all API endpoints and validates response shapes (state, issue detail, attempts, runtime, models, metrics, workspaces, git context, SSE) |
| 7 | **verify-pr** | Validates the PR exists, has commits, and has a non-empty diff |
| 8 | **verify-linear** | Confirms the Linear issue reached "Done" state with a Risoluto comment |
| 9 | **restart-resilience** | Restarts Risoluto and verifies the completed issue is NOT re-dispatched |
| 10 | **collect-artifacts** | Copies `.risoluto/attempts/`, `events/`, and `risoluto.db` to the report dir |
| 11 | **cleanup** | Closes the PR (with branch deletion) and cancels the Linear issue |

---

## Output

Each run creates a report directory:

```
e2e-reports/{run-id}/
  e2e-summary.json        # Machine-readable verdict + metadata
  e2e-junit.xml           # JUnit XML for GitHub Actions rendering
  events.jsonl            # Timestamped event log (one JSON per line)
  risoluto-stdout.log     # Risoluto process stdout
  risoluto-stderr.log     # Risoluto process stderr
  WORKFLOW.e2e.md         # The generated workflow file
  artifacts/
    attempts/             # Copied from .risoluto/attempts/
    events/               # Copied from .risoluto/events/
    risoluto.db           # SQLite database (if present)
```

The `e2e-junit.xml` file is included in the uploaded artifact for download. In CI, the `EnricoMi/publish-unit-test-result-action` step renders phase-level pass/fail results as check annotations on the commit.

### Summary JSON

The `e2e-summary.json` contains the full structured result:

```json
{
  "verdict": "pass",
  "run_id": "abc123",
  "started_at": "2026-03-28T10:30:00Z",
  "finished_at": "2026-03-28T10:33:40Z",
  "duration_ms": 220400,
  "config_summary": { "model": "gpt-5-codex-mini", "project": "test-project", "repo": "you/test-repo" },
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

On failure, the test scans Risoluto's stderr log and attempt records to classify the problem:

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

### `--keep-risoluto` mode

Run with `--keep-risoluto` to leave the Risoluto process running after the test:

```bash
./scripts/run-e2e.sh --keep-risoluto
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
{"ts":"...","phase":"start-risoluto","step":"normal-mode-verified"}
{"ts":"...","event":"log","message":"Issue created: SYM-42 (state: In Progress)"}
```

---

## How It Works (Technical Details)

### Setup bypass

The test bypasses Risoluto's setup wizard entirely by pre-filling all configuration:

1. **WORKFLOW.e2e.md** is generated with the real `project_slug`, `api_key: $LINEAR_API_KEY` (env expansion), and a fully-populated `repos` section — so `validateDispatch()` passes without triggering setup mode.
2. **MASTER_KEY** is generated as a random 64-hex string and passed as an environment variable to the Risoluto child process — so `SecretsStore.start()` succeeds on the first try without needing a `master.key` file.
3. **LINEAR_API_KEY** and **GITHUB_TOKEN** are inherited from the parent process environment.

This avoids the setup-mode race condition where the orchestrator's tracker is initialized before credentials exist. The file is written to `{reportDir}/WORKFLOW.e2e.md`.

### Completion detection

The test detects issue completion through **attempt records**, not the `completed[]` array in the state snapshot. This is intentional — `completed[]` reflects Linear state transitions that could be manual, while the attempt record's `status` and `stopSignal` fields are authoritative:

- `status: "completed"` + `stopSignal: "done"` = pass
- `status: "failed"` / `"timed_out"` / `"stalled"` / `"cancelled"` = fail

### Restart resilience (Phase 9)

This phase verifies Risoluto's deduplication mechanism (`seedCompletedClaims`): after a completed issue, restarting Risoluto should NOT re-dispatch it. The test:

1. Sends SIGTERM to the running Risoluto process
2. Waits for exit, then spawns a fresh instance
3. Waits for the orchestrator's first poll cycle (10s settle time)
4. Asserts the completed issue is NOT in `running[]`

### Normal mode verification

After spawning, the test hits `/api/v1/state` to confirm the orchestrator is running in normal mode (not setup mode). A successful response with a `generated_at` timestamp confirms the orchestrator started polling immediately.

---

## CI Integration

The E2E lifecycle test runs automatically on every push to `main`, gated behind the `build-and-test` quality check. It is **always non-blocking** (`continue-on-error: true`) — it reports status but never gates Docker push or other jobs.

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `LINEAR_API_KEY` | Linear API key for creating/managing test issues |
| `E2E_GITHUB_TOKEN` | GitHub PAT with `repo` scope for PR creation on the test repo |
| `OPENAI_API_KEY` | OpenAI API key for Codex model access |
| `CODEX_AUTH_JSON` | Base64-encoded contents of `~/.codex/auth.json` |

Generate the `CODEX_AUTH_JSON` value:

```bash
base64 -w0 ~/.codex/auth.json
```

### CI Config

The job uses `scripts/e2e-config.ci.yaml` which references all credentials via `$ENV_VAR` syntax (no literal secrets). The config sets `source_home: "/tmp/codex-auth"` as a literal path because `resolveEnvValue` only handles single `$VAR` expansion.

### Concurrency

The job uses a concurrency group (`e2e-lifecycle`) with `cancel-in-progress: false` to prevent parallel runs from colliding on the shared test repo. Rapid pushes to main queue behind the current run — up to 30 minutes latency for subsequent push results.

### Notes

- Doc-only pushes matching the CI workflow's `paths-ignore` pattern skip the E2E job entirely
- `OPENAI_API_KEY` is not validated at preflight; if missing, failure surfaces during `monitor-lifecycle` with an `AUTH_EXPIRED` diagnosis
- JUnit results are published via `EnricoMi/publish-unit-test-result-action@v2` for in-commit check annotations
