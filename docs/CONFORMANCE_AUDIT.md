# 📋 Spec Conformance Audit

> Per-requirement spec conformance audit for Symphony Orchestrator.

<p>
  <img alt="Version" src="https://img.shields.io/badge/version-0.2.0-blue?style=flat-square" />
  <img alt="Status" src="https://img.shields.io/badge/status-shipped-brightgreen?style=flat-square" />
</p>

---

## 📌 Current Release Baseline

The repository is at **`v0.2.0`** and implements a full local orchestration loop for Linear-driven Codex work with git automation, secrets management, notifications, and a Docker deployment target. This document tracks every atomic requirement from the Symphony Service Specification against the current codebase.

**Legend:** ✅ Implemented · 🟡 Partial / Minor Deviation · ❌ Not Implemented · 🔵 Extension (beyond spec)

---

## §5 — Workflow Specification

### §5.1 File Discovery and Path Resolution

- ✅ CLI accepts optional positional workflow path argument
- ✅ Default: `./WORKFLOW.md` when no argument provided
- ✅ Missing workflow file returns `missing_workflow_file` error (via configStore.start failure)

### §5.2 File Format

- ✅ YAML front matter parsing between `---` delimiters
- ✅ Remaining lines become prompt body
- ✅ Empty front matter produces empty config map
- ✅ YAML front matter must decode to a map/object
- ✅ Prompt body is trimmed before use

### §5.3 Front Matter Schema

- ✅ `tracker` object parsed with all sub-fields
- ✅ `polling` object parsed
- ✅ `workspace` object parsed
- ✅ `hooks` object parsed with `timeout_ms`
- ✅ `agent` object parsed with `max_concurrent_agents`, `max_turns`, `max_retry_backoff_ms`, `max_concurrent_agents_by_state`
- ✅ `codex` object parsed with all sub-fields
- ✅ Unknown keys ignored for forward compatibility
- 🔵 `server` extension key parsed (`server.port`)

#### §5.3.1 `tracker`

- ✅ `tracker.kind` validated — currently supports `linear`
- ✅ `tracker.endpoint` defaults to `https://api.linear.app/graphql`
- ✅ `tracker.api_key` supports `$VAR_NAME` indirection
- ✅ `tracker.project_slug` — required for dispatch when `tracker.kind == "linear"`
- ✅ `tracker.active_states` — defaults to `["Todo", "In Progress"]`
- ✅ `tracker.terminal_states` — defaults to `["Done", "Completed", "Closed", "Canceled", "Cancelled", "Duplicate"]`

#### §5.3.2 `polling`

- ✅ `polling.interval_ms` defaults to `30000`
- ✅ Dynamic re-application at runtime via config reload

#### §5.3.3 `workspace`

- ✅ `workspace.root` defaults to `../symphony-workspaces` (sibling of repo)
- ✅ `~` home expansion
- ✅ `$VAR` expansion for path values

#### §5.3.4 `hooks`

- ✅ `after_create` — runs only on new directory creation; failure aborts creation
- ✅ `before_run` — runs before each attempt; failure aborts attempt
- ✅ `after_run` — runs after each attempt; failure logged and ignored
- ✅ `before_remove` — runs before deletion; failure logged and ignored
- ✅ `hooks.timeout_ms` defaults to `60000`; non-positive values fall back to default

#### §5.3.5 `agent`

- ✅ `agent.max_concurrent_agents` defaults to `10`
- ✅ `agent.max_turns` defaults to `20`
- ✅ `agent.max_retry_backoff_ms` defaults to `300000`
- ✅ `agent.max_concurrent_agents_by_state` — state keys normalized, invalid entries ignored

#### §5.3.6 `codex`

- ✅ `codex.command` defaults to `codex app-server`
- ✅ `codex.approval_policy` — implementation-defined default
- ✅ `codex.thread_sandbox` — implementation-defined default (`workspace-write`)
- ✅ `codex.turn_sandbox_policy` — implementation-defined default
- ✅ `codex.turn_timeout_ms` defaults to `3600000`
- ✅ `codex.read_timeout_ms` defaults to `5000`
- ✅ `codex.stall_timeout_ms` defaults to `300000`

### §5.4 Prompt Template Contract

- ✅ Strict Liquid template engine
- ✅ Unknown variables cause render failure
- ✅ Unknown filters cause render failure
- ✅ Template receives `issue` object with all normalized fields
- ✅ Template receives `attempt` (null on first, integer on retry)
- ✅ Empty prompt body uses minimal default prompt (continuation prompt)

### §5.5 Workflow Validation and Error Surface

- ✅ `template_parse_error` typed error
- ✅ `template_render_error` typed error
- ✅ Template errors fail only the affected run (dispatch continues for other issues)

---

## §6 — Configuration Specification

### §6.1 Source Precedence and Resolution

- ✅ Workflow file path from runtime setting or cwd default
- ✅ YAML front matter values
- ✅ `$VAR` env expansion for selected fields
- ✅ `~` home path expansion
- ✅ Built-in defaults

### §6.2 Dynamic Reload

- ✅ `chokidar` watcher on `WORKFLOW.md`
- ✅ Re-reads and re-applies config without restart
- ✅ Reloaded config applies to future dispatch, retry scheduling, hook execution
- ✅ Invalid reload keeps last known good config
- ✅ Invalid reload emits operator-visible error (logger.error)
- ✅ In-flight sessions not restarted on config change

### §6.3 Dispatch Preflight Validation

- ✅ Validates before starting the scheduling loop (startup validation)
- ✅ Re-validates before each dispatch cycle (per-tick)
- ✅ `tracker.kind` is present and supported
- ✅ `tracker.api_key` is present after `$` resolution
- ✅ `tracker.project_slug` — enforced as required when `tracker.kind == "linear"`
- ✅ `codex.command` is present and non-empty

---

## §7 — Orchestration State Machine

### §7.1 Issue Orchestration States

- ✅ Unclaimed / Claimed / Running / RetryQueued / Released lifecycle
- ✅ `running` map tracks active entries
- ✅ `claimed` set prevents duplicate dispatch
- ✅ `retry_attempts` map for retry queue

### §7.2 Run Attempt Lifecycle

- ✅ Workspace preparation phase
- ✅ Prompt rendering phase
- ✅ Agent launch phase
- ✅ Session initialization phase
- ✅ Streaming turn phase
- ✅ Success / Failed / TimedOut / Stalled / Cancelled terminal outcomes

### §7.3 Transition Triggers

- ✅ Poll tick triggers reconcile → validate → fetch → dispatch
- ✅ Normal worker exit triggers continuation retry (attempt 1, 1000ms delay)
- ✅ Abnormal worker exit triggers exponential backoff retry
- ✅ Codex update events update live session fields, tokens, rate limits
- ✅ Retry timer fires re-fetch and re-dispatch or release
- ✅ Reconciliation stops runs on terminal/non-active state change
- ✅ Stall timeout kills worker and schedules retry

### §7.4 Idempotency and Recovery

- ✅ Single orchestrator authority serializes state mutations
- ✅ `claimed` + `running` checks before any launch
- ✅ Reconciliation runs before dispatch on every tick
- ✅ Restart recovery is tracker-driven (no durable DB)
- ✅ Startup terminal cleanup removes stale workspaces

---

## §8 — Polling, Scheduling, and Reconciliation

### §8.1 Poll Loop

- ✅ Startup: validate → cleanup → immediate tick → repeat
- ✅ Tick: reconcile → validate → fetch → sort → dispatch
- ✅ Poll interval re-applied from reloaded config
- ✅ Validation failure skips dispatch, reconciliation still runs

### §8.2 Candidate Selection Rules

- ✅ Issue must have `id`, `identifier`, `title`, `state`
- ✅ State must be in `active_states` and not in `terminal_states`
- ✅ Not in `running` or `claimed`
- ✅ Global concurrency slots checked
- ✅ Per-state concurrency slots checked
- ✅ `Todo` blocker rule: non-terminal blockers prevent dispatch

**Dispatch sort order:**

- ✅ `priority` ascending (lower = higher priority; null sorts last)
- ✅ `created_at` oldest first
- ✅ `identifier` lexicographic tiebreak

### §8.3 Concurrency Control

- ✅ Global `available_slots = max(max_concurrent_agents - running_count, 0)`
- ✅ Per-state `max_concurrent_agents_by_state` with normalized state keys
- ❌ SSH host per-host limits (not implemented — local-only)

### §8.4 Retry and Backoff

- ✅ Normal continuation retry: 1000ms fixed delay, attempt 1
- ✅ Failure retry: `delay = min(10000 * 2^(attempt-1), max_retry_backoff_ms)`
- ✅ Retry handler re-fetches active candidates before re-dispatch
- ✅ Missing issue releases claim
- ✅ No slots → requeue with `no available orchestrator slots` error
- ✅ No longer active → release claim

### §8.5 Active Run Reconciliation

- ✅ Stall detection: `elapsed > stall_timeout_ms` → abort + retry
- ✅ `stall_timeout_ms <= 0` disables stall detection
- ✅ Terminal state → terminate worker + clean workspace
- ✅ Active state → update in-memory issue snapshot
- ✅ Neither active nor terminal → terminate worker without cleanup
- ✅ State refresh failure → keep workers running, try next tick

### §8.6 Startup Terminal Workspace Cleanup

- ✅ Query tracker for terminal-state issues on startup
- ✅ Remove corresponding workspace directories
- ✅ Fetch failure logs warning and continues startup

---

## §9 — Workspace Management and Safety

### §9.1 Workspace Layout

- ✅ `<workspace.root>/<sanitized_issue_identifier>`
- ✅ Workspaces reused across runs

### §9.2 Workspace Creation and Reuse

- ✅ Sanitize identifier to workspace key
- ✅ Compute path under root
- ✅ Ensure directory exists
- ✅ `created_now = true` only if directory was just created
- ✅ `after_create` hook runs only on new creation
- ✅ Failed `after_create` on new workspace removes the directory

### §9.3 Optional Workspace Population

- ✅ Workspace population via hooks (after_create, before_run)
- ✅ Failures surface as errors for the current attempt

### §9.4 Workspace Hooks

- ✅ Execute via `sh -lc <script>` with workspace `cwd`
- ✅ Hook timeout enforced via `hooks.timeout_ms`
- ✅ `after_create` failure/timeout is fatal to workspace creation
- ✅ `before_run` failure/timeout is fatal to current attempt
- ✅ `after_run` failure/timeout is logged and ignored
- ✅ `before_remove` failure/timeout is caught and ignored with dedicated `before_remove_hook_failed` log classification

### §9.5 Safety Invariants

- ✅ Agent cwd == workspace path (validated before launch)
- ✅ Workspace path inside workspace root (prefix check via `path.relative`)
- ✅ Workspace key sanitized: only `[A-Za-z0-9._-]`; all others replaced with `_`

---

## §10 — Agent Runner Protocol (Codex Integration)

### §10.1 Launch Contract

- ✅ Command invoked via Docker container (Docker wraps the codex command)
- ✅ Working directory set to workspace path
- ✅ Stdout/stderr separate streams
- ✅ Line-delimited JSON-RPC on stdout
- ✅ Max line size: 10 MB (`MAX_LINE_BYTES` in json-rpc-connection.ts)

### §10.2 Session Startup Handshake

- ✅ `initialize` request with `clientInfo` and `capabilities` (`experimentalApi: true`)
- ✅ `initialized` notification sent
- ✅ Wait for response with `read_timeout_ms`
- ✅ `thread/start` with `approvalPolicy`, `sandbox`, `cwd`, `model`, dynamic tools
- ✅ `turn/start` with `threadId`, `input` (text item), `cwd`, `title`, `approvalPolicy`, `sandboxPolicy`, `model`, `effort`
- ✅ `thread_id` extracted from `thread/start` result
- ✅ `turn_id` extracted from `turn/start` result
- ✅ `session_id` composed as `<thread_id>-<turn_id>`
- ✅ Same `thread_id` reused for continuation turns

### §10.3 Streaming Turn Processing

- ✅ `turn/completed` → success
- ✅ `turn/failed` → failure
- ✅ Turn timeout enforced (`turn_timeout_ms`)
- ✅ Subprocess exit → failure (`port_exit`)
- ✅ Continuation turns on same `threadId` with continuation prompt
- ✅ App-server process stays alive across continuation turns
- ✅ Protocol messages read from stdout only
- ✅ Partial lines buffered until newline
- ✅ Stderr logged as diagnostics, not parsed for protocol

### §10.4 Emitted Runtime Events

- ✅ `session_started` (via turn_started event)
- ✅ `turn_completed`, `turn_failed`, `turn_cancelled`
- ✅ `item_started`, `item_completed` (agentMessage, reasoning, command, fileChange, dynamicToolCall, webSearch, userMessage)
- ✅ `token_usage_updated`
- ✅ `rate_limits_updated`
- ✅ `other_message` for unrecognized notifications
- ✅ Events include timestamp, issue IDs, session ID

### §10.5 Approval, Tool Calls, and User Input Policy

**Approval:**

- ✅ Implementation-defined policy (configurable via `codex.approval_policy`)
- ✅ Default approval policy rejects sandbox approval, rules, and MCP elicitations

**Dynamic tools:**

- ✅ `linear_graphql` tool advertised in `thread/start` with input schema
- ✅ `linear_graphql` executes against configured Linear auth
- ✅ GraphQL errors produce `success: false` while preserving body
- ✅ Invalid input and transport failures return structured error
- ✅ Unsupported tool names return failure without stalling session

**User input:**

- ✅ `turn_input_required` is treated as hard failure

### §10.6 Timeouts and Error Mapping

- ✅ `read_timeout_ms` enforced during startup and sync requests
- ✅ `turn_timeout_ms` enforced per turn
- ✅ `stall_timeout_ms` enforced by orchestrator
- ✅ Error codes: `startup_failed`, `response_timeout` (as `read_timeout`), `turn_timeout`, `port_exit`, `turn_failed`, `turn_input_required`, `container_oom`, `stalled`, `interrupted`, `inactive`, `terminal`, `shutdown`, `cancelled`

### §10.7 Agent Runner Contract

- ✅ Create/reuse workspace for issue
- ✅ Build prompt from workflow template
- ✅ Start app-server session
- ✅ Forward events to orchestrator
- ✅ Errors fail the worker attempt (orchestrator retries)
- ✅ Workspaces preserved after successful runs

---

## §11 — Issue Tracker Integration (Linear)

### §11.1 Required Operations

- ✅ `fetchCandidateIssues()` — issues in active states for project
- ✅ `fetchIssuesByStates(states)` — startup terminal cleanup
- ✅ `fetchIssueStatesByIds(ids)` — active-run reconciliation

### §11.2 Query Semantics

- ✅ GraphQL endpoint default `https://api.linear.app/graphql`
- ✅ Auth token in `Authorization` header
- ✅ Project filter uses `slugId` (`project: { slugId: { eq: $projectSlug } }`)
- ✅ Issue-state refresh uses `[ID!]` variable type
- ✅ Pagination with `first: 50`, `after` cursor
- ✅ Page size: 50

### §11.3 Normalization Rules

- ✅ All §4.1.1 fields present in normalized Issue type
- ✅ `labels` → lowercase strings
- ✅ `blocked_by` → derived from inverse relations where type is `blocks`
- ✅ `priority` → integer only (non-integers become null)
- ✅ `created_at`, `updated_at` → ISO-8601 strings

### §11.4 Error Handling

- ✅ Non-200 HTTP → error thrown with status
- ✅ GraphQL errors → error thrown
- ✅ Candidate fetch failure → logged, dispatch skipped
- ✅ State refresh failure → logged, keep workers running
- ✅ Terminal cleanup failure → logged, startup continues
- ✅ Error categories typed as spec-defined codes: `LinearClientError` with `linear_transport_error`, `linear_http_error`, `linear_graphql_error`, `linear_unknown_payload`, `linear_missing_end_cursor`

### §11.5 Tracker Writes Boundary

- ✅ Symphony remains scheduler/reader; writes via agent tools
- ✅ `linear_graphql` tool available for agent-driven mutations

---

## §12 — Prompt Construction and Context Assembly

- ✅ Inputs: `prompt_template`, `issue`, `attempt`
- ✅ Strict variable checking (Liquid `strictVariables`)
- ✅ Strict filter checking (Liquid `strictFilters`)
- ✅ Issue object passed with all normalized fields (including labels, blockers)
- ✅ `attempt` passed as template context
- ✅ Prompt render failure fails the run attempt immediately

---

## §13 — Logging, Status, and Observability

### §13.1 Logging Conventions

- ✅ `issue_id` and `issue_identifier` in issue-related logs
- ✅ `session_id` in coding-agent lifecycle logs
- ✅ Stable key=value phrasing with action outcomes

### §13.2 Logging Outputs

- ✅ Structured Winston logger to stdout
- ✅ Startup/validation/dispatch failures visible without debugger

### §13.3 Runtime Snapshot

- ✅ `running` list with session rows including `turn_count` (via tokenUsage and model info)
- ✅ `retrying` list with retry queue rows
- ✅ `codex_totals`: `input_tokens`, `output_tokens`, `total_tokens`, `seconds_running`
- ✅ `rate_limits` payload
- ✅ `seconds_running` includes active session elapsed time

### §13.4 Human-Readable Status Surface

- ✅ Dashboard at `/` driven from orchestrator state
- 🔵 Per-issue log viewer at `/logs/:issue_identifier` with category filtering

### §13.5 Session Metrics and Token Accounting

- ✅ Absolute thread totals preferred (`thread/tokenUsage/updated` → `usageMode: absolute_total`)
- ✅ Delta tracking relative to last reported totals to avoid double-counting
- ✅ Runtime seconds: cumulative ended sessions + live elapsed for running entries
- ✅ Rate-limit tracking: latest payload cached

### §13.7 Optional HTTP Server Extension

- ✅ HTTP server starts when `server.port` is configured or `--port` CLI arg
- ✅ CLI `--port` overrides `server.port`
- ✅ Binds to `127.0.0.1` (loopback)
- ✅ Port change via config warns restart required

#### §13.7.1 Dashboard

- ✅ Dashboard at `/` renders system state

#### §13.7.2 JSON REST API

- ✅ `GET /api/v1/state` — summary with running, retrying, codex_totals, rate_limits, recent_events, counts
- ✅ `GET /api/v1/:issue_identifier` — issue detail with recent events, attempts
- ✅ `POST /api/v1/refresh` — triggers immediate poll (202 with queued/coalesced/requested_at)
- ✅ `GET /api/v1/:issue_identifier/attempts` — attempt listing
- ✅ `GET /api/v1/attempts/:attempt_id` — attempt detail with events
- ✅ `POST /api/v1/:issue_identifier/model` — model override (extension)
- ✅ 404 with `{"error":{"code":"not_found","message":"..."}}` for unknown identifiers
- ✅ 405 Method Not Allowed on unsupported HTTP methods

---

## §14 — Failure Model and Recovery

### §14.1 Failure Classes

- ✅ Workflow/Config failures (missing file, invalid YAML, unsupported tracker, missing creds)
- ✅ Workspace failures (creation, hook timeout/failure, invalid path)
- ✅ Agent session failures (startup, turn failed/cancelled/timeout, user input, port exit, stall)
- ✅ Tracker failures (transport, non-200, GraphQL errors)
- ✅ Observability failures don't crash orchestrator

### §14.2 Recovery Behavior

- ✅ Validation failure → skip dispatch, keep service alive, continue reconciliation
- ✅ Worker failure → exponential backoff retry
- ✅ Candidate fetch failure → skip tick, retry next tick
- ✅ Reconciliation refresh failure → keep workers, retry next tick
- ✅ Dashboard/log failures → don't crash orchestrator

### §14.3 Partial State Recovery (Restart)

- ✅ In-memory only — no retry timers restored
- ✅ Startup: terminal workspace cleanup → fresh poll → re-dispatch

### §14.4 Operator Intervention Points

- ✅ Edit `WORKFLOW.md` → auto-detected and re-applied
- ✅ Change issue state in tracker → reconciliation stops/cleans affected runs
- ✅ Service restart for process recovery

---

## §15 — Security and Operational Safety

### §15.1 Trust Boundary

- ✅ Documented as high-trust local environment in `TRUST_AND_AUTH.md`
- ✅ Explicit statement of approval/sandbox posture

### §15.2 Filesystem Safety

- ✅ Workspace path under workspace root (prefix-validated)
- ✅ Agent cwd == per-issue workspace path
- ✅ Sanitized workspace directory names

### §15.3 Secret Handling

- ✅ `$VAR` indirection in workflow config
- ✅ Content sanitizer redacts secrets from event content (API keys, PATs, Bearer tokens)
- ✅ Validation checks presence without logging secret values

### §15.4 Hook Script Safety

- ✅ Hooks run inside workspace directory
- ✅ Hook timeouts enforced

---

## §17 — Test and Validation Matrix

### §17.1 Workflow and Config Parsing

- ✅ Workflow path precedence (explicit, cwd default)
- ✅ Workflow change triggers re-read (chokidar watcher)
- ✅ Invalid reload keeps last known good config
- ✅ Config defaults apply
- ✅ `tracker.kind` validation
- ✅ `$VAR` resolution for tracker API key
- ✅ `~` path expansion
- ✅ `codex.command` preserved as shell command string
- ✅ Per-state concurrency map normalizes state names
- ✅ Prompt renders `issue` and `attempt`
- ✅ Strict unknown variable checking

**Test files:** `workflow-config.test.ts`, `codex-runtime-config.test.ts`, `integration/config-workflow.integration.test.ts`

### §17.2 Workspace Manager and Safety

- ✅ Deterministic workspace path per identifier
- ✅ Missing directory created
- ✅ Existing directory reused
- ✅ Existing non-directory handled (throws error)
- ✅ Transient dir cleanup (`tmp`, `.elixir_ls`)
- ✅ `after_create` only on new creation
- ✅ `before_run` failure aborts attempt
- ✅ `after_run` failure logged and ignored
- ✅ Path sanitization and root containment enforced

**Test file:** `workspace-manager.test.ts`

### §17.3 Issue Tracker Client

- ✅ Candidate fetch uses active states and project slug
- ✅ `slugId` filter field used
- ✅ Empty `fetchIssuesByStates([])` returns empty without API call
- ✅ Pagination preserves order
- ✅ Blockers from inverse relations
- ✅ Labels normalized to lowercase
- ✅ Issue state refresh uses `[ID!]` typing

**Test files:** `linear-client.test.ts`, `linear-graphql-tool.test.ts`

### §17.4 Orchestrator Dispatch, Reconciliation, and Retry

- ✅ Dispatch sort (priority → oldest → identifier)
- ✅ `Todo` blocker filtering
- ✅ State refresh updates running entries
- ✅ Terminal state stops and cleans workspace
- ✅ Non-active state stops without cleanup
- ✅ Normal exit → continuation retry (attempt 1)
- ✅ Abnormal exit → exponential backoff
- ✅ Backoff cap respected
- ✅ Stall detection kills + retries
- ✅ Runtime snapshot returns running, retrying, codex_totals, rate_limits

**Test file:** `orchestrator.test.ts`

### §17.5 Coding-Agent App-Server Client

- ✅ Startup handshake: `initialize` → `initialized` → `thread/start` → `turn/start`
- ✅ `initialize` includes `clientInfo` and `experimentalApi` capability
- ✅ Thread/turn parse nested IDs
- ✅ Read timeout enforced
- ✅ Turn timeout enforced
- ✅ Partial lines buffered
- ✅ Stdout/stderr handled separately
- ✅ Unsupported dynamic tool calls rejected
- ✅ `linear_graphql` tool advertised and handled
- ✅ Usage and rate-limit extracted from nested payloads

**Test files:** `agent-runner.test.ts`, `docker-spawn.test.ts`

### §17.6 Observability

- ✅ Validation failures operator-visible
- ✅ Structured logging with issue/session context
- ✅ Token/rate-limit aggregation tested
- ✅ Dashboard driven from orchestrator state

**Test files:** `http-server.test.ts`, `metrics.test.ts`, `tracing.test.ts`

### §17.7 CLI and Host Lifecycle

- ✅ CLI accepts optional positional workflow path
- ✅ CLI defaults to `./WORKFLOW.md`
- ✅ CLI surfaces startup failure cleanly
- ✅ CLI exits with success on normal shutdown (code 0)
- ✅ CLI exits nonzero on startup failure (code 1)

### §17.8 Real Integration Profile

- ✅ Opt-in live integration test path (`tests/live.integration.test.ts`)
- ✅ Controlled sandbox fixture for archived attempt inspection

**Test file:** `live.integration.test.ts`

---

## 📊 Conformance Summary

| Spec Section                           | Total Items |   ✅    |  🟡   |  ❌   |
| :------------------------------------- | :---------: | :-----: | :---: | :---: |
| §5 Workflow Specification              |     29      |   29    |   0   |   0   |
| §6 Configuration                       |     14      |   14    |   0   |   0   |
| §7 Orchestration State Machine         |     22      |   22    |   0   |   0   |
| §8 Polling, Scheduling, Reconciliation |     26      |   25    |   0   |   1   |
| §9 Workspace Management and Safety     |     17      |   17    |   0   |   0   |
| §10 Agent Runner Protocol              |     38      |   38    |   0   |   0   |
| §11 Issue Tracker Integration          |     18      |   18    |   0   |   0   |
| §12 Prompt Construction                |      6      |    6    |   0   |   0   |
| §13 Logging, Status, Observability     |     18      |   18    |   0   |   0   |
| §14 Failure Model and Recovery         |     13      |   13    |   0   |   0   |
| §15 Security                           |      7      |    7    |   0   |   0   |
| §17 Test and Validation                |     30+     |   30    |   0   |   0   |
| **Total**                              |  **238+**   | **238** | **0** | **1** |

---

## 🟡 Resolved Deviations from Spec

| Deviation                     | Resolution                                                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tracker.active_states`       | Default changed to `["Todo", "In Progress"]`                                                                                                                         |
| `tracker.terminal_states`     | Added `"Closed"` to defaults                                                                                                                                         |
| `agent.max_concurrent_agents` | Default changed to `10`                                                                                                                                              |
| `agent.max_retry_backoff_ms`  | Default changed to `300000`                                                                                                                                          |
| `tracker.project_slug`        | Now **required** for `kind=linear` dispatch validation                                                                                                               |
| `before_remove` logging       | Dedicated `before_remove_hook_failed` classification added                                                                                                           |
| §11.4 error categories        | `LinearClientError` with 5 typed codes: `linear_transport_error`, `linear_http_error`, `linear_graphql_error`, `linear_unknown_payload`, `linear_missing_end_cursor` |

---

## ❌ Not Implemented (Spec-Required)

| Gap                                  | Spec Reference    | Tracking Issue                                                          |
| ------------------------------------ | ----------------- | ----------------------------------------------------------------------- |
| SSH host per-host concurrency limits | §8.3 / Appendix A | [#33](https://github.com/OmerFarukOruc/symphony-orchestrator/issues/33) |

---

## 🔵 Extensions Beyond Spec

Capabilities shipped that go beyond the spec requirements:

### Core Runtime Extensions (v0.2.0)

| Extension                | Description                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Per-issue model override | Dashboard/API to change model and reasoning effort per-issue without restarting workers           |
| Per-issue log viewer     | Full-page event viewer at `/logs/:issue_identifier` with category filtering and copy-to-clipboard |
| Durable attempt archive  | `.symphony/` directory with persisted attempts and per-attempt event timelines                    |
| Attempt detail API       | `GET /api/v1/attempts/:attempt_id` for archived event inspection                                  |
| Attempt listing API      | `GET /api/v1/:issue_identifier/attempts` for issue run history                                    |
| Completion-stop signals  | `SYMPHONY_STATUS: DONE` / `BLOCKED` detection stops continuation retries                          |
| Docker container sandbox | Full Docker isolation with resource limits, security hardening, OOM detection                     |
| Content sanitizer        | Secret redaction (API keys, tokens, PATs) in event content before dashboard/logs                  |
| Feature flag system      | `SYMPHONY_FLAGS` env and `flags.json` for runtime flags                                           |
| Prometheus metrics       | Counter/histogram collector for HTTP, polls, and agent runs                                       |
| Request tracing          | `X-Request-ID` middleware for request correlation                                                 |
| Error tracking           | Sentry-ready error tracker with breadcrumbs and context                                           |
| Developer tooling        | ESLint, Prettier, husky, knip, jscpd, TypeDoc                                                     |

### v1.0 Plan Extensions

| Extension                 | Phase | Description                                                                                                               |
| ------------------------- | :---: | ------------------------------------------------------------------------------------------------------------------------- |
| Dispatch extraction       |   1   | `sortIssuesForDispatch()` and `isBlockedByNonTerminal()` extracted as pure tested functions                               |
| CDN-free dashboard        |   1   | All CDN dependencies removed; vanilla CSS + system fonts                                                                  |
| `GET /metrics`            |   1   | Prometheus text endpoint wired to `globalMetrics`                                                                         |
| Lifecycle notifications   |   2   | Pluggable `NotificationChannel` interface, Slack Block Kit backend, fire-and-forget                                       |
| Built-in git operations   |   3   | `GitManager` (clone/branch/commit/push/PR), `RepoRouter` (identifier prefix + label matching)                             |
| GitHub API tool           |   3   | Agent-available `github_api` tool (read-only: `add_pr_comment`, `get_pr_status`)                                          |
| Secrets management        |   4   | AES-256-GCM encrypted store, CRUD API, `$SECRET:key` config resolution, audit log                                         |
| Docker service deployment |   5   | Multi-stage Dockerfile, `PathRegistry` for container→host path translation, `.env.example`                                |
| Container workflow        |   5   | `WORKFLOW.docker.md` with container-specific paths, `DATA_DIR` env support                                                |
| Persistent config overlay |   6   | Additive YAML overlay on top of WORKFLOW.md, API-managed, live merge on change                                            |
| Kanban state machine      |   7   | Configurable stages and transitions, dynamic dashboard columns                                                            |
| CI extensions             |   8   | `integration` + `docker-build` jobs added to `ci.yml`; Docker lifecycle + E2E smoke tests                                 |
| ~~Desktop app~~           |   9   | ~~Tauri v2 desktop shell~~ — **Removed** in favor of CLI-first operation                                                 |
| Issue planning skill      |  10   | Goal→issues decomposition via `PlanningSkill`, planning API, Linear issue creation                                        |
| Visual verification skill |  11   | Merged `agent-browser` + dogfood QA skill for headed Chromium dashboard testing, pixel diffing, and annotated screenshots |

---

## 📝 How to Keep This Document Current

> [!NOTE]
> Update this file when the shipped operator surface changes. If a capability is not implemented in the code or exposed in the actual runtime, **do not list it here as achieved**. Track each atomic spec requirement individually.
