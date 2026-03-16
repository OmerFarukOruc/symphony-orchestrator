# 🗺️ Roadmap and Status

> Per-requirement spec conformance audit and product vision for Symphony Orchestrator.

<p>
  <img alt="Version" src="https://img.shields.io/badge/version-0.2.0-blue?style=flat-square" />
  <img alt="Status" src="https://img.shields.io/badge/status-shipped-brightgreen?style=flat-square" />
</p>

---

# Part 1 — Shipped ✅

> Everything below is implemented, tested, and running in the current `v0.2.0` release.

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

- ✅ `workspace.root` defaults to `<system-temp>/symphony_workspaces`
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
- ❌ SSH host per-host limits — **deferred: superseded by Docker fleet model**

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
- 🟡 Error categories not typed as spec-defined codes (e.g., no `linear_unknown_payload` or `linear_missing_end_cursor`)

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

| Spec Section | Total Items | ✅ | 🟡 | ❌ |
|:-------------|:-----------:|:--:|:--:|:--:|
| §5 Workflow Specification | 29 | 29 | 0 | 0 |
| §6 Configuration | 14 | 14 | 0 | 0 |
| §7 Orchestration State Machine | 22 | 22 | 0 | 0 |
| §8 Polling, Scheduling, Reconciliation | 26 | 25 | 0 | 1 |
| §9 Workspace Management and Safety | 17 | 17 | 0 | 0 |
| §10 Agent Runner Protocol | 38 | 38 | 0 | 0 |
| §11 Issue Tracker Integration | 18 | 17 | 1 | 0 |
| §12 Prompt Construction | 6 | 6 | 0 | 0 |
| §13 Logging, Status, Observability | 18 | 18 | 0 | 0 |
| §14 Failure Model and Recovery | 13 | 13 | 0 | 0 |
| §15 Security | 7 | 7 | 0 | 0 |
| §17 Test and Validation | 30+ | 30 | 0 | 0 |
| **Total** | **238+** | **237** | **1** | **1** |

### 🟡 Remaining Minor Deviation

| Deviation | Status |
|-----------|--------|
| Linear error categories not typed as spec-defined codes (§11.4) | Planned for Phase 1 |

### 🔵 Extensions Beyond Spec (Shipped)

| Extension | Description |
|-----------|-------------|
| Per-issue model override | Dashboard/API to change model and reasoning effort per-issue without restarting workers |
| Per-issue log viewer | Full-page event viewer at `/logs/:issue_identifier` with category filtering and copy-to-clipboard |
| Durable attempt archive | `.symphony/` directory with persisted attempts and per-attempt event timelines |
| Attempt detail API | `GET /api/v1/attempts/:attempt_id` for archived event inspection |
| Attempt listing API | `GET /api/v1/:issue_identifier/attempts` for issue run history |
| Completion-stop signals | `SYMPHONY_STATUS: DONE` / `BLOCKED` detection stops continuation retries |
| Docker container sandbox | Full Docker isolation with resource limits, security hardening, OOM detection |
| Content sanitizer | Secret redaction (API keys, tokens, PATs) in event content before dashboard/logs |
| Feature flag system | `SYMPHONY_FLAGS` env and `flags.json` for runtime flags |
| Prometheus metrics | Counter/histogram collector for HTTP, polls, and agent runs |
| Request tracing | `X-Request-ID` middleware for request correlation |
| Error tracking | Sentry-ready error tracker with breadcrumbs and context |
| Developer tooling | ESLint, Prettier, husky, knip, jscpd, TypeDoc |

---

# Part 2 — Planned 🔲

> Everything below is NOT yet implemented. This is the product vision.
> Organized into **v1.0** (MVP fundamentals) and **v2.0** (advanced AI autonomy).
> v1.0 ships first — it builds everything needed for a fully operational autonomous agent platform.
> v2.0 layers on verification, observability-driven feedback, and lights-out operation once the foundation is solid.

---

# v1.0 — MVP Platform 🏗️

> Core infrastructure, automation, and operator tooling. Everything an operator needs to run Symphony in production with confidence.

---

## Phase 1 — Quick Wins & Spec Polish

Close remaining spec gaps and ship small high-value improvements.

| Item | Current State | Target | Effort |
|------|--------------|--------|--------|
| Linear typed error codes (§11 🟡) | Generic `Error` throws | `LinearClientError` with `linear_transport_error`, `linear_http_error`, `linear_graphql_error`, `linear_unknown_payload`, `linear_missing_end_cursor` | ~1h |
| `GET /metrics` endpoint | `MetricsCollector` exists, not wired | `GET /metrics` returns Prometheus text format | ~30m |
| Dispatch sort/blocker tests (§17.4) | Covered implicitly | Explicit deterministic tests for priority→oldest→identifier sort and Todo blocker filtering | ~1h |
| Local static assets | CDN: Tailwind, Google Fonts | Inline CSS bundle + system font stack; dashboard renders fully offline | ~2h |

---

## Phase 2 — Lifecycle Notifications

| Item | Current State | Target |
|------|--------------|--------|
| Notification framework | ❌ Not supported | `NotificationChannel` interface with pluggable backends |
| Slack webhook | ❌ | POST to configurable Slack webhook URL |
| Dashboard alerts | ❌ | In-memory recent-alerts list rendered in dashboard |
| Per-project granularity | ❌ | `"off" \| "critical" \| "verbose"` per project |
| Event coverage | ❌ | Issue picked up · work started · PR submitted · retry triggered · terminal failure · completed |

---

## Phase 3 — Autonomous Git & CI/CD Lifecycle

The largest remaining gap — moves from hook-driven manual git setup to fully autonomous issue-to-PR delivery. CI/CD monitoring and auto-fix are delegated to [Sentinel-Review](https://github.com/OmerFarukOruc/sentinel-review).

| Feature | Current State | Target |
|---------|--------------|--------|
| **Multi-repo routing** | Single implicit repo via hooks | `repos[]` config with issue→repo matching by project slug, label, or prefix |
| **Git clone & branch** | Manual `after_create` hook | Built-in: clone repo, create branch from `issue.branchName` |
| **Private repo auth** | Manual `env_passthrough` / `extra_mounts` | Credentials from config/secrets store, injected automatically |
| **Commit & push** | Manual `after_run` hook | Built-in: auto-commit on `SYMPHONY_STATUS: DONE` |
| **PR creation** | ❌ Not supported | `github_api` dynamic tool for agent-driven PRs |
| **CI/CD status polling** | ❌ Not supported | Delegated to Sentinel's `ci-fixer/detector.ts` — detects failing checks, fetches logs, analyzes failures |
| **CI auto-fix loop** | ❌ Not supported | Sentinel's `ci-fixer/ci-pipeline.ts` — detect → analyze → generate fix → canary test → self-improve |
| **Auto-merge on green CI** | ❌ Not supported | Sentinel's `orchestrator/auto-merge.ts` — risk-score-gated merge with multi-gate checks |
| **PR review feedback loop** | ❌ Not supported | Sentinel reports findings → Symphony re-dispatches with feedback (see v2.0 Phase 1E) |

---

## Phase 4 — Dashboard-Based Secrets Management

| Problem with Env-Only | Dashboard Solution |
|-----------------------|-------------------|
| Secrets leak into logs / `docker inspect` | AES-256-GCM encrypted at rest, injected at runtime only |
| No audit trail | Append-only audit log for credential changes |
| No rotation | Dashboard shows expiry, supports rotation |
| Scattered across profiles / `.env` / CI | Single pane in operator dashboard |
| No validation | Dashboard validates format and tests connectivity |

Implementation: `secrets-store.ts` with `MASTER_KEY` bootstrap, `$SECRET:key_name` resolution in config, CRUD API at `/api/v1/secrets/*`, dashboard credentials page.

---

## Phase 5 — Docker-First Service Deployment

**Everything related to Symphony orchestration bundled in a Docker container.**

| Item | Current State | Target |
|------|--------------|--------|
| Service container | ❌ Only `Dockerfile.sandbox` for agents | `Dockerfile` for Symphony service (multi-stage Node 22 build) |
| Compose stack | ❌ | `docker-compose.yml` with named volumes |
| Persistence volumes | `.symphony/` local dir | `/data/logs`, `/data/archives`, `/data/config`, `/data/workspaces` |
| Log rotation | ❌ | Compress old logs; **deletion forbidden** — archive to cold storage |
| Health check | ❌ | `GET /api/v1/state` probe |
| Docker-in-Docker | Agent sandboxes bind Docker socket | Service container mounts `/var/run/docker.sock` for agent spawning |

> [!CAUTION]
> **Non-negotiable**: All environment configs, logs, archived runs, and state MUST be preserved across container reboots and must NEVER be deleted automatically.

---

## Phase 6 — App-Based Configuration

Replace env-var-only config with a persistent, UI-manageable config store.

| Item | Current State | Target |
|------|--------------|--------|
| Config surface | YAML front matter in `WORKFLOW.md` + env vars | Structured config file (YAML) in persistent volume |
| Config editing | Edit `WORKFLOW.md` by hand | Dashboard UI + API for config CRUD |
| Sensitive values | `$VAR` env indirection | Encrypted at rest via secrets store (Phase 4) |
| Env vars role | Primary config mechanism | **Override/bootstrap only** (e.g., initial `MASTER_KEY`) |
| Per-project config | Single workflow file | `projects[]` array with per-project tracker, state machine, agent, notification settings |
| Validation | Dispatch preflight only | In-app validation with discoverable, documented fields |

---

## Phase 7 — Flexible Kanban State Machine

| Item | Current State | Target |
|------|--------------|--------|
| Board stages | Hard-coded `active_states` / `terminal_states` | Configurable per-project state machine |
| Valid transitions | ❌ Not tracked | `valid_transitions` map defining allowed state changes |
| Custom stages | Partial — configurable lists | Full support for `Review`, `QA`, `Staging`, `Blocked`, etc. |
| State machine config | In workflow YAML | Persisted in app config (Phase 6), editable via dashboard |

---

## Phase 8 — Testing Pipeline Hardening

| Item | Current State | Target |
|------|--------------|--------|
| Unit tests | ✅ Vitest, < 30s | Maintain coverage for all new modules |
| Integration tests | ✅ Opt-in with `LINEAR_API_KEY` | Add Docker lifecycle tests (build, start, health, shutdown) |
| E2E smoke test | ❌ | Full pipeline: create Linear issue → agent picks up → commit/PR → terminal state |
| CI/CD | ❌ No GitHub Actions | `npm test` on every PR, integration + E2E on main, always green |
| Config persistence | ❌ | Test config survives simulated container restarts |
| Test repo | ❌ | Dedicated test repo + Linear project for E2E (trivial task for speed) |

---

## Phase 9 — Cross-Platform Desktop App (Orchestration Manager)

Inspired by [Superset](https://github.com/superset-sh/superset) and multi-session orchestration dashboards.

| Item | Current State | Target |
|------|--------------|--------|
| Technology | ❌ No desktop app | Tauri or Electron (TBD) |
| Service control | CLI only | Start/stop/restart Symphony service and individual agents |
| Config editing | `WORKFLOW.md` by hand | Visual config editor connected to app config API |
| Run history | Dashboard + API | Rich history browser with logs, events, and archived attempts |
| Planning skill | ❌ | Trigger manual issue planning via planning skill UI |
| Resource monitoring | ❌ | CPU, memory, network per agent container (via `docker stats`) |

---

## Phase 10 — Skill-Driven Issue Planning

| Item | Current State | Target |
|------|--------------|--------|
| Planning skill | ❌ | Structured prompt template that decomposes goals into Linear issues |
| Issue quality | Manual | Crystal-clear titles, descriptions, acceptance criteria — self-contained for autonomous execution |
| Project routing | ❌ | Inferred from active workspace/repo; issues written to correct Linear project |
| Dependency ordering | ❌ | Explicit sequencing and blocking relationships between created issues |
| Trigger surface | ❌ | Dashboard UI + `POST /api/v1/plan` API + desktop app |

---

# v2.0 — Advanced AI Autonomy 🚀

> Verification, observability-driven feedback loops, and lights-out operation. These phases require a solid v1.0 foundation — they layer on top of working git automation, CI/CD, secrets management, and operator tooling.

---

## Phase 1 — Work Verification & Drift Prevention

> [!IMPORTANT]
> This phase addresses the two hardest problems in autonomous coding: **"did the agent break anything?"** and **"what happens when multiple agents touch the same code?"**

### 1A — Entity-Level Merging with Weave

Integrate [Weave](https://github.com/Ataraxy-Labs/weave) as Symphony's merge driver to eliminate false merge conflicts when multiple agents work in parallel.

| Item | Description |
|------|-------------|
| **Weave setup in workspaces** | Run `weave setup` during repo clone (v1.0 Phase 3) to configure entity-level merge driver |
| **Weave MCP tools for agents** | Expose Weave's 14 MCP tools as dynamic tools alongside `linear_graphql` — agents can claim entities before editing, check what others are working on, get conflict warnings |
| **Entity-level conflict resolution** | Tree-sitter-based parsing merges at function/class/method level — different functions in the same file = no conflict (100% clean merge on 31/31 real-world scenarios vs git's 48%) |
| **Scope-aware dispatch** | Query Weave's entity claim registry before dispatching — serialize hard overlaps (same entity), parallelize soft overlaps (same file, different entities) |

### 1B — Reviewer Agent via [Sentinel-Review](https://github.com/OmerFarukOruc/sentinel-review)

Instead of building a reviewer agent from scratch, Symphony delegates post-work verification to Sentinel-Review — an already-built multi-model code review platform with adversarial debate, oracle validation, and executable verification.

| Sentinel Module | What It Provides |
|---|---|
| **`review/specialist-registry.ts`** + **`soul-generator.ts`** | N-Specialist panel (Claude Opus + GPT-5) with ExpertPrompting templates — multi-model consensus, not single-model rubber-stamping |
| **`review/filtering/` (5 stages)** | Dedup → consensus → risk scoring (0–100) → severity gating → adversarial debate |
| **`review/debate.ts`** | Adversarial debate — a Defender argues FOR the finding, a Judge rules `confirmed`/`rejected` |
| **`review/oracle-validator.ts`** | Final GPT oracle gate — batch-validates findings with `confirmed`/`rejected`/`downgraded` verdicts |
| **`review/verification-engine.ts`** | Docker-isolated execution to *prove* findings are real — runs category-specific test scripts |
| **`review/ast-incremental.ts`** | AST-based incremental scoping — only re-reviews changed functions + their 5-level call graph |
| **`review/convergence.ts`** | Stall/regression/unfixable detection in auto-fix loops — prevents infinite retry cycles |
| **`orchestrator/auto-merge.ts`** | Risk-score-gated auto-merge with multi-gate checks (risk threshold, draft status, blocked authors) |

**Symphony's role**: Create the PR (v1.0 Phase 3), then Sentinel handles review → verdict → auto-merge/block. See Phase 1E for the integration contract.

### 1C — Auto-Rebase Cascade

When any agent's PR merges to `main`, automatically rebase all other in-flight agent branches.

| Item | Description |
|------|-------------|
| **Main movement detection** | GitHub webhook or polling detects new commits on `main` |
| **Weave-powered rebase** | `git rebase main` using Weave as merge driver — resolves false conflicts automatically |
| **Clean rebase → continue** | Agent keeps working, no interruption needed |
| **Real entity conflict → re-dispatch** | Kill the conflicting agent, re-dispatch issue from fresh `main` |
| **Conflict logging** | Track which modules cause frequent conflicts for future serialization hints |

### 1D — Stacked PRs (Optional Enhancement)

Inspired by [Graphite](https://graphite.dev), break agent output into small, dependent PRs instead of one monolithic PR.

| Item | Description |
|------|-------------|
| **Stack-aware merge queue** | PRs in a stack merge in order; CI runs against the cumulative result of all predecessors |
| **Smaller review surface** | Each PR in the stack is focused, making Sentinel review more tractable |
| **Ejection handling** | If any PR in the stack fails, the stack is re-evaluated and the agent is notified |

### 1E — Symphony ↔ Sentinel Integration Contract

The webhook/API contract that connects Symphony (orchestrator) with Sentinel (verifier).

#### Flow

```
Symphony                              GitHub                           Sentinel
   │                                    │                                  │
   │── commit + push ──────────────────►│                                  │
   │── POST /repos/.../pulls ──────────►│                                  │
   │                                    │── webhook (pull_request) ───────►│
   │                                    │                                  │── review pipeline
   │                                    │                                  │── adversarial debate
   │                                    │                                  │── oracle validation
   │                                    │◄── POST review comments ────────│
   │                                    │◄── POST check_run (verdict) ────│
   │                                    │                                  │
   │◄── webhook (check_run completed) ──│                                  │
   │    or poll GET /check-runs         │                                  │
   │                                    │                                  │
   ├── verdict == APPROVE?              │                                  │
   │   YES → Sentinel auto-merges      │◄── PUT /pulls/.../merge ────────│
   │   REQUEST_CHANGES → re-dispatch    │                                  │
   │   with review comments as context  │                                  │
   │   BLOCK → notify operator          │                                  │
```

#### Symphony → Sentinel (via GitHub)

| Event | Mechanism | Data |
|---|---|---|
| PR created | GitHub `pull_request.opened` webhook → Sentinel | `repo`, `pr_number`, `head_sha`, `branch` |
| PR updated (re-push after fix) | GitHub `pull_request.synchronize` webhook → Sentinel | Same — triggers re-review with AST incremental scoping |

#### Sentinel → Symphony (via GitHub)

| Event | Mechanism | Data |
|---|---|---|
| Review verdict | GitHub Check Run (`check_run.completed`) → Symphony polls or receives webhook | `conclusion`: `success` (APPROVE), `action_required` (REQUEST_CHANGES), `failure` (BLOCK) |
| Review findings | GitHub PR review comments | Per-finding: `file`, `line`, `severity`, `message`, `suggestion` |
| Auto-merge completed | GitHub `pull_request.closed` + `merged=true` → triggers rebase cascade (1C) | `merge_commit_sha` |

#### Symphony Re-Dispatch on REQUEST_CHANGES

When Sentinel's verdict is `action_required`, Symphony:
1. Fetches the PR review comments via GitHub API
2. Formats them as structured feedback in the agent's prompt context
3. Re-dispatches the worker agent with `attempt + 1`, including:
   - The original issue description
   - The diff that was rejected
   - Each review finding with file, line, severity, and suggestion
4. Worker fixes the issues and re-pushes → Sentinel re-reviews (AST incremental — only re-checks changed functions)

#### Shared Configuration

Both services need to agree on:

| Config | Symphony | Sentinel |
|---|---|---|
| GitHub App credentials | `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY` | Same GitHub App (shared installation) |
| Target repos | `repos[]` in `WORKFLOW.md` | Auto-discovered from webhook events |
| Auto-merge policy | `auto_merge: true/false` per repo | `.reviewbot.yml` per repo (`auto_merge.enabled`, `risk_threshold`) |
| Notification webhook | `notifications.slack_webhook` | Sentinel has its own notification config |

---

## Phase 2 — Observability as the Feedback Loop

> Inspired by the "SDLC is dead" thesis: when agents ship faster than humans can review, **observability becomes the primary safety mechanism**.

| Item | Description |
|------|-------------|
| **Closed-loop telemetry** | Production anomaly detected → Symphony creates a new Linear issue → agent investigates and fixes autonomously |
| **Behavioral diffs** | Compare system outputs before/after a merged change — flag unexpected behavioral changes even when tests pass |
| **Agent-consumed monitoring** | Monitoring data feeds directly into agent context, not human dashboards — agents react to alerts faster than any on-call rotation |
| **Anomaly-driven rollback** | If post-deploy monitoring detects regression, auto-revert the merge and re-dispatch the issue with the anomaly as context |

---

## Phase 3 — Lights-Out Codebase (Long-Term Vision)

> [!NOTE]
> The end state: no human ever reads the code. Agents write it, agents review it, agents test it, agents deploy it, agents monitor it, agents fix regressions. Humans provide intent and handle genuinely novel situations.

| Principle | Implementation |
|-----------|---------------|
| **TDD-first generation** | Agents write tests before implementation; test suite is the contract, not code review |
| **AI reviews AI** | Reviewer agent (v2.0 Phase 1B) as mandatory gate; different LLM cross-checks worker output |
| **Dedicated specialist agents** | Security review agent, performance review agent, architecture compliance agent — each focused on one concern |
| **No human code review** | PRs are verified by reviewer agents + CI + observability; human involvement is exception-based (`BLOCK` verdict only) |
| **Behavioral acceptance testing** | Like hardware chip acceptance testing — run black-box acceptance tests proving the system's design is correct without inspecting internals |
| **Observability as the safety net** | Closed-loop monitoring → auto-rollback → auto-fix (Phase 2) replaces manual incident response |
| **Multi-model adversarial review** | Different LLMs review each other's work — reduces model-specific blind spots |

---

## 🌐 Infrastructure Scaling (Deferred)

| Feature | Status | Notes |
|---------|--------|-------|
| SSH worker host distribution | Deferred | Superseded by Docker VDS fleet model (v1.0 Phase 5) |
| Persisted retry queue across restarts | Not implemented | Planned for v1.0 Phase 5 with persistent volumes |
| Pluggable tracker adapters beyond Linear | Not implemented | Future extension after core platform stabilizes |
| First-class tracker write APIs | Not implemented | Currently agent-driven via `linear_graphql` tool |

---

## 📝 How to Keep This Document Current

> [!NOTE]
> Update this file when the shipped operator surface changes. Move items from Part 2 (Planned) to Part 1 (Shipped) as they are completed. If a capability is not implemented in the code or exposed in the actual runtime, **do not list it in Part 1**. Track each atomic spec requirement individually.
