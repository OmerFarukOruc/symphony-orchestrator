# Symphony v1 ExecPlan

This is the living implementation plan for Symphony v1. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` are updated as work lands.

## Purpose / Big Picture

After this change, a person can place a `WORKFLOW.md` file in this repository, start a local Symphony service, and watch it do real work: poll Linear for issues, create a dedicated filesystem workspace per issue, launch `codex app-server` inside that workspace, retry or stop work when issue state changes, and expose a local status page and JSON API at `http://127.0.0.1:<port>/`.

## Progress

- [x] (2026-03-15 22:58Z) Read the Symphony specification, the local Codex app-server schema, the local Codex provider configuration, and the current repository contents.
- [x] (2026-03-15 22:58Z) Resolved the main open design choices: TypeScript on Node 22+, high-trust Codex defaults, no SSH workers in v1, `account/read` preflight, and keeping multi-account routing below Symphony instead of inside Symphony.
- [x] (2026-03-16 09:20Z) Re-anchored the project to `/home/oruc/Desktop/codex`, copied the initial scaffold into the correct root, and updated the plan to use this repository path.
- [x] (2026-03-16 09:26Z) Created `package.json`, preserved `tsconfig.json`, established the source, test, docs, and bin directory structure, and proved the initial dry-start validation path.
- [x] (2026-03-16 09:26Z) Created the first user-facing docs: `README.md`, `WORKFLOW.example.md`, and `docs/TRUST_AND_AUTH.md`.
- [x] (2026-03-16 09:26Z) Implemented workflow loading, typed config resolution, validation, dynamic reload, and last-known-good fallback.
- [x] (2026-03-16 09:48Z) Implemented the Linear client, including the raw GraphQL helper needed by the `linear_graphql` dynamic tool, and corrected the query shape against live Linear schema introspection.
- [x] (2026-03-16 09:43Z) Implemented workspace management, hook execution, transient-directory cleanup, and safe workspace removal.
- [x] (2026-03-16 09:45Z) Implemented narrow Codex protocol helpers, a deterministic mock app-server fixture, and the real `AgentRunner`.
- [x] (2026-03-16 09:46Z) Implemented the orchestrator state machine, retry logic, stall detection, and shutdown behavior.
- [x] (2026-03-16 09:46Z) Implemented the local HTTP dashboard and JSON API without relying on machine-specific external files.
- [x] (2026-03-16 09:47Z) Added unit tests, fixture-driven protocol tests, and opt-in live integration fixtures/tests.
- [x] (2026-03-16 09:49Z) Ran the full local validation sequence, including `npm test`, `npm run build`, dry-start validation, `npm run test:integration`, and a local HTTP smoke check on `/api/v1/state`.
- [x] (2026-03-16 00:22Z) Added explicit `hooks.timeout_ms`, `codex.read_timeout_ms`, `codex.turn_timeout_ms`, safer omitted-policy defaults, and fixed live token accounting/detail-state drift during active worker runs.
- [x] (2026-03-16 00:22Z) Replaced the dashboard template with a one-to-one live adaptation of `/home/oruc/Desktop/stitch/code.html`, wired to the current `/api/v1/*` state and detail endpoints.
- [x] (2026-03-16 02:29Z) Fixed the shutdown and hard-failure retry rules so `SIGINT`, inactive issues, terminal issues, and startup/input failures do not queue new retries after a worker stops.
- [x] (2026-03-16 02:29Z) Switched the checked-in local `WORKFLOW.md` to a Docker-backed `codex login` smoke path and removed the earlier repo-local Codex home fixture dependency.
- [x] (2026-03-16 02:39Z) Replaced the repo-local launcher with generated per-attempt runtime homes so API-key, OpenAI-compatible provider, and `codex login` flows all run through the same Docker path.
- [x] (2026-03-16 02:55Z) Changed the Symphony default worker selection to `gpt-5.4` with `high` reasoning and added per-issue model overrides through the dashboard/API.
- [x] (2026-03-16 03:00Z) Performed a deep parity audit against the upstream Symphony spec, the OpenAI Elixir README, and the Rondo transparency model; confirmed the main remaining gaps are SSH workers, archived attempt persistence, and richer event-stream visibility.
- [x] (2026-03-16 03:13Z) Implemented durable attempt and event persistence under `.symphony/`, exposed archived run endpoints, and added the first run-inspector tabs to the dashboard detail panel.
- [x] (2026-03-16 03:20Z) Changed per-issue model overrides so they no longer restart an active worker; saved model settings now apply on the next run while the current run keeps its original model.
- [x] (2026-03-16 12:40Z) Persisted `.symphony/issue-index.json` alongside attempt archives, added the repo-root `./symphony-logs` inspection helper plus a controlled archive sandbox fixture, and refreshed the release docs for `v0.2.0`.
- [x] (2026-03-16 17:10Z) Updated the public docs set to match the shipped hardening pass, including config-driven tracker state policy, retry revalidation, current observability boundaries, and the remaining roadmap after the `v0.2.0` spec-conformance slice.
- [x] (2026-03-16 14:30Z) Added an operator-facing smoke-issue recipe plus workflow prompt guidance so the first end-to-end live test can succeed in an otherwise empty issue workspace by writing a proof file instead of depending on repo hydration.
- [x] (2026-03-16 14:43Z) Added a local completion-stop path: normal turns that end with an explicit `SYMPHONY_STATUS: DONE` or `SYMPHONY_STATUS: BLOCKED` signal, or a clearly final completion message, now stop instead of auto-queuing another continuation turn.

## Surprises & Discoveries

- Observation: the implementation target moved mid-run from the earlier playground path to `/home/oruc/Desktop/codex`, and the actual target directory was empty.
  Evidence: `ls -la /home/oruc/Desktop/codex` showed only `.` and `..`, with no `AGENTS.md`, `tsconfig.json`, or project files.

- Observation: the initial Linear query draft matched the earlier design notes but not the current live Linear GraphQL schema.
  Evidence: a local service smoke run with a placeholder `LINEAR_API_KEY` produced GraphQL validation errors for `project.slug`, `IssueRelation.identifier`, and `IssueRelation.state`, and direct introspection against `https://api.linear.app/graphql` confirmed `NullableProjectFilter.slugId` and `IssueRelation.issue` / `relatedIssue`.

- Observation: the real Codex app-server wire format and tool validation rules diverged from the deterministic mock in a few important places.
  Evidence: live runs showed notifications and responses without `jsonrpc`, `thread/start` requiring `experimentalApi` plus an object-shaped `inputSchema`, and `turn/start` requiring `input` rather than `prompt`.

- Observation: the current dashboard is visually one-to-one with the stitch mock, but that fidelity currently depends on the same remote Tailwind and Google Fonts includes as the prototype rather than a fully self-contained asset path.
  Evidence: both `/home/oruc/Desktop/stitch/code.html` and `src/dashboard-template.ts` include `https://cdn.tailwindcss.com` and `fonts.googleapis.com` resources.

- Observation: the largest remaining upstream feature gap is worker distribution across SSH hosts rather than the local single-host orchestration path.
  Evidence: the upstream Symphony spec and Elixir README document `worker.ssh_hosts`, `worker.max_concurrent_agents_per_host`, and per-host execution flow, while this repository currently launches workers only on the local machine.

- Observation: the repo-local isolated Codex home was clean enough to avoid inherited skill noise, but not sufficient by itself to authenticate against the local CLIProxyAPI.
  Evidence: direct proxy probes showed `401 Missing API key` with no bearer header, `401 Invalid API key` for the placeholder value in `~/.cli-proxy-api/config.yaml`, and `200` for the bearer key stored in `~/.codex/auth.json`; after exporting that key in `bin/codex-app-server-live`, the proxy logs returned `200` for Symphony `/v1/responses` requests.

- Observation: Codex app-server supports model overrides at the protocol layer, so Symphony does not need to rewrite a shared `CODEX_HOME` config file just to change one issue's model.
  Evidence: the local `codex_app_server_protocol.v2.schemas.json` includes `model` on `thread/start` and both `model` and `effort` on `turn/start`, and live proxy logs showed Symphony switching a running issue from `gpt-5.4/high` to `gpt-5/medium` after a single API override.

- Observation: operators expect per-issue model selection to behave like a saved setting, not a hot-swapped live run mutation.
  Evidence: a fresh live smoke run showed the corrected behavior: the active run stayed on `gpt-5.4/high`, the saved configuration changed to `gpt-5/medium`, and the issue detail API surfaced that as a pending next-run change instead of interrupting the worker.

- Observation: this repository already emits enough live event detail to support a Rondo-like transparency view, but it currently keeps only an in-memory ring buffer rather than a persisted archive of attempts and per-run event timelines.
  Evidence: `/api/v1/state` and `/api/v1/:issue_identifier` already expose `recent_events` and streamed `item_started` / `item_completed` / `turn_started` / `turn_completed` activity, while the current code stores those events only in `Orchestrator.recentEvents` and does not write per-attempt history to disk or SQLite.

- Observation: the new `.symphony/` archive format is already sufficient to back an operator-facing run inspector without needing a database migration first.
  Evidence: a live smoke run created `attempts/<attempt-id>.json` and `events/<attempt-id>.jsonl`, `/api/v1/NIN-5` returned the current attempt summary, and `/api/v1/attempts/:attempt_id` returned the archived event stream for that attempt.

## Decision Log

- Decision: use ESM across the repository by adding `"type": "module"` to `package.json` and keeping TypeScript on `module: "NodeNext"`.
  Rationale: the repository already had a NodeNext TypeScript configuration, the codebase is greenfield, and one module system is easier to follow.
  Date/Author: 2026-03-15 / Codex

- Decision: keep the high-trust Codex defaults as `approval_policy: "never"`, `thread_sandbox: "danger-full-access"`, and `turn_sandbox_policy: { type: "dangerFullAccess" }`.
  Rationale: this matches the trusted-environment posture and the local schema research.
  Date/Author: 2026-03-15 / Codex

- Decision: build the dashboard as a repository-local HTML template with inline browser JavaScript, while temporarily accepting remote Tailwind and font dependencies in the current iteration.
  Rationale: the implementation must stay repo-local and not depend on machine-local prototype files, even though the current dashboard still uses remote CDNs and can be made more self-contained in a later pass.
  Date/Author: 2026-03-15 / Codex

- Decision: remove the repo-local launcher and checked-in custom-provider Codex home, and generate a fresh runtime `CODEX_HOME` for every Docker attempt instead.
  Rationale: this keeps the repository generic, avoids stale machine-specific auth/config leftovers, and lets one runtime path support API-key providers plus `codex login` users.
  Date/Author: 2026-03-16 / Codex

- Decision: make `gpt-5.4` with `high` reasoning the Symphony default, while exposing per-issue runtime overrides in the dashboard and JSON API.
  Rationale: this matches the preferred default operating mode while keeping the operator free to downshift or experiment on a single issue without disturbing other workers.
  Date/Author: 2026-03-16 / Codex

- Decision: prioritize archived attempt/event transparency immediately after SSH parity work, borrowing the best parts of the Rondo-style dashboard while keeping Symphony's operator-facing state model.
  Rationale: the current API already proves the value of live event streaming; persisting that data per run would remove much of the remaining "black box" feeling without changing the orchestration core.
  Date/Author: 2026-03-16 / Codex

- Decision: use a filesystem-backed attempt archive first, rooted under `--log-dir` or repo-local `.symphony/`, instead of introducing a new external database dependency.
  Rationale: this keeps the implementation simple, debuggable, and self-contained while still unlocking archived run APIs, dashboard tabs, and future migration to richer storage if needed.
  Date/Author: 2026-03-16 / Codex

## Outcomes & Retrospective

The implementation now exists end to end in `/home/oruc/Desktop/codex`: workflow parsing and reload fallback, Linear transport, workspace lifecycle, Codex app-server protocol handling, orchestration, retries, the local dashboard/API, deterministic tests, and opt-in integration fixtures. The local validation sequence passed with `npm test`, `npm run build`, `node dist/cli.js ./WORKFLOW.example.md` producing the expected `missing_tracker_api_key` failure, `npm run test:integration`, and a local smoke run on `http://127.0.0.1:4010/api/v1/state` returning a valid snapshot while the service surfaced the expected upstream 401 from Linear for a dummy token instead of crashing.

The current repo also includes a parity-focused runtime hardening pass: hook timeout support, codex turn timeout support, corrected thread/token usage aggregation, running-state issue detail fixes, a live dashboard that matches the provided stitch mock much more closely while staying backed by the real API surface, a corrected shutdown path that no longer queues retries after `SIGINT` or other non-retriable worker stops, a generated per-attempt runtime `CODEX_HOME` that supports API-key providers plus `codex login` users without a repo-local launcher, issue-level model routing controls that save the next-run model and reasoning pair from the website or API without interrupting an active worker, and a durable attempt archive under `.symphony/` with archived-run API access and dashboard tabs. The archive now also persists `issue-index.json` for fast issue-to-attempt lookups, and the repo-root `./symphony-logs` helper plus the controlled sandbox fixture make historical run inspection reproducible without touching live production data. A fresh live smoke run with the checked-in `WORKFLOW.md` now starts on `gpt-5.4/high`, can authenticate through either `codex login` or an env-backed provider path, saves a pending next-run override to `gpt-5/medium` through the override endpoint, and writes the attempt plus its event stream to disk for later inspection.

The biggest remaining parity gap versus upstream Symphony is SSH host distribution. Local single-host orchestration is now materially ahead of where it started, but `worker.ssh_hosts` and per-host concurrency are not implemented yet. Archived attempt transparency is now implemented through the filesystem-backed `.symphony/` archive, archived-run API endpoints, and dashboard detail inspection, while the current dashboard fidelity still relies on remote Tailwind/font assets instead of fully local static assets.

## Context and Orientation

- Repository root: `/home/oruc/Desktop/codex`
- Existing config at start: none; the directory was empty and the scaffold was recreated there
- Planned top-level additions: `package.json`, `README.md`, `WORKFLOW.example.md`, `docs/`, `src/`, `tests/`, and `bin/`

## Milestones

### Milestone 1

Bootstrap the repository, implement workflow/config loading, and make dry-start validation readable.

### Milestone 2

Implement the Linear adapter and workspace manager with deterministic tests.

### Milestone 3

Implement the Codex protocol subset, `linear_graphql`, a deterministic mock app-server, and the real `AgentRunner`.

### Milestone 4

Implement the orchestrator, HTTP surface, and end-to-end validation.
