# 🗺️ Roadmap and Status

> Public-facing status snapshot for Symphony Orchestrator — intentionally factual.

<p>
  <img alt="Version" src="https://img.shields.io/badge/version-0.2.0-blue?style=flat-square" />
  <img alt="Status" src="https://img.shields.io/badge/status-shipped-brightgreen?style=flat-square" />
</p>

---

## 📌 Current Release Baseline

The repository is at **`v0.2.0`** and implements a working local orchestration loop for Linear-driven Codex work, including the first major spec-conformance hardening pass.

---

## ✅ What Is Achieved So Far

### 🏗️ Core Runtime

- ✅ Workflow loading and config validation
- ✅ Workflow file reload with last-known-good fallback
- ✅ Local CLI entrypoint and built binary wrapper
- ✅ Local archive directory selection with `--log-dir`
- ✅ Config-driven tracker endpoint, active states, and terminal states
- ✅ System-temp workspace default with `$VAR` expansion for `workspace.root`

### 🎯 Issue Orchestration

- ✅ Linear polling for candidate issues
- ✅ Dispatch sorting by priority, oldest creation time, and identifier tiebreak
- ✅ `Todo` blocker filtering and explicit claimed-set dispatch dedupe
- ✅ Per-state concurrency limits via `agent.max_concurrent_agents_by_state`
- ✅ Per-issue workspace creation and cleanup
- ✅ Workspace lifecycle hooks with timeout enforcement
- ✅ Retry handling with bounded backoff
- ✅ Retry re-validation before relaunch and startup terminal workspace cleanup
- ✅ Shutdown handling and non-retriable hard-failure handling
- ✅ Stall detection for long-silent workers

### 🤖 Codex Worker Integration

- ✅ `codex app-server` process orchestration
- ✅ JSON-RPC initialization and thread/turn lifecycle handling
- ✅ Authentication preflight via `account/read`
- ✅ Rate limit preflight via `account/rateLimits/read`
- ✅ Dynamic `linear_graphql` tool exposure to the worker
- ✅ `turn/start` titles plus explicit `template_parse_error` / `template_render_error` typing
- ✅ Per-issue model override selection saved by the operator
- ✅ Docker container sandbox with `node:22-bookworm` base image and Codex CLI
- ✅ Resource limits (memory, CPU, tmpfs) and security hardening (cap-drop, no-new-privileges)
- ✅ OOM kill detection via `docker inspect` with distinct `container_oom` error code
- ✅ Container lifecycle management (stop, inspect, remove) on abort/shutdown

### 🖥️ Operator Visibility

- ✅ Local dashboard at `/`
- ✅ JSON API for state, issue detail, attempt listing, attempt detail, refresh, and model override updates
- ✅ Aggregate token accounting in the runtime snapshot
- ✅ Recent event visibility for active work
- ✅ Runtime `seconds_running` derived from archived attempt durations plus live elapsed time
- ✅ Durable archived attempts and per-attempt event timelines under `.symphony/`
- ✅ Repo-root `./symphony-logs` helper for issue and attempt inspection from archived evidence

### 🧪 Validation

- ✅ Deterministic Vitest unit coverage
- ✅ Fixture-driven protocol tests for the agent runner
- ✅ Docker spawn argument building tests
- ✅ Opt-in live integration test path

---

## 📊 Progress Overview

```mermaid
pie title Symphony v0.2.0 Completion
    "Core Runtime" : 4
    "Issue Orchestration" : 6
    "Codex Integration" : 6
    "Operator Visibility" : 5
    "Validation" : 3
```

---

## 🔭 Current Operating Scope

Symphony is currently meant for **local, operator-controlled use on a single host**. It is a practical orchestration tool for:

1. 📋 Watching Linear for candidate issues
2. 📁 Launching Codex workspaces locally
3. 🖥️ Inspecting live or archived work through the dashboard and API

---

## 🔴 Spec Conformance Gap Analysis

> [!IMPORTANT]
> The first major hardening pass closed the orchestration, config, and runtime-accounting gaps that had drifted from `SPEC.md`. The remaining spec work is now small and mostly polish-oriented.

### 🟡 Remaining Low-Priority Gaps

| Gap | Spec Reference | Current State |
|-----|----------------|---------------|
| **`tracker.project_slug` validation when required by tracker kind** | §6.3 | `tracker.kind` is now validated for the supported Linear adapter, but `project_slug` is still only type-checked rather than validated against future non-Linear tracker requirements |
| **No `before_remove` hook failure logging distinction** | §9.4 | `removeWorkspace` still treats `before_remove` failures as catch-and-ignore without a dedicated log classification separating ignored cleanup failures from fatal ones |

---

## 🔲 Remaining Major Roadmap Gaps

> [!IMPORTANT]
> The two largest remaining gaps are **autonomous git & CI/CD lifecycle** and **dashboard-based secrets management**. Together they represent the path from "hook-driven manual setup" to a fully autonomous orchestrator across multiple public and private repos.

### 🔀 Autonomous Git & CI/CD Lifecycle

Symphony currently relies on workspace hooks (`after_create`, `before_run`, `after_run`) for all git operations. The operator must manually configure clone, branch, commit, and push commands. There is no built-in awareness of repositories, branches, pull requests, or CI/CD pipelines.

| Feature | Current State | Target |
|---------|--------------|--------|
| **Multi-repo routing** | Single implicit repo via hooks | Issue → repo mapping via Linear project/label/prefix; config-driven repo registry |
| **Git clone & branch** | Manual `after_create` hook | Built-in: clone repo, create branch from `issue.branchName` or `issue.identifier` |
| **Private repo auth** | Manual `env_passthrough` or `extra_mounts` for SSH keys / tokens | Dashboard-managed credentials injected into containers automatically |
| **Commit & push** | Manual `after_run` hook | Built-in: auto-commit on `SYMPHONY_STATUS: DONE`, push branch |
| **PR creation** | ❌ Not supported | New `github_api` dynamic tool (like `linear_graphql`) for agent-driven PR creation |
| **CI/CD status polling** | ❌ Not supported | Post-push phase that polls GitHub Actions / webhook listener for status |
| **Auto-merge on green CI** | ❌ Not supported | Configurable: auto-merge, or notify operator and wait for approval |
| **PR review feedback loop** | ❌ Not supported | Agent reads PR review comments, iterates, re-pushes |

### 🔑 Dashboard-Based Secrets & Credential Management

Secrets are currently managed exclusively via environment variables (`env_passthrough`, host env) or file mounts (`extra_mounts`). This has significant drawbacks:

| Problem with Env-Only | Dashboard-Based Solution |
|-----------------------|--------------------------|
| Secrets leak into logs, `docker inspect`, error messages | Encrypted at rest in a local vault; injected at runtime only |
| No audit trail — who set what, when | Dashboard logs all credential changes with timestamps |
| No rotation — stale tokens accumulate | Dashboard shows expiry, supports rotation workflow |
| Scattered across shell profiles, `.env` files, CI configs | Single pane of glass in the operator dashboard |
| No validation — typos cause silent failures | Dashboard validates format and tests connectivity on save |

**Proposed approach:**

- **Settings page** in the dashboard (`/settings` or `/credentials`) for managing:
  - Git credentials (GitHub PAT, GitLab token, SSH keys)
  - Linear API key
  - LLM provider API keys
  - Custom env vars for containers
- **Encrypted local storage** under `.symphony/secrets.enc` (AES-256, key derived from operator passphrase or machine identity)
- **Runtime injection** — secrets are resolved at container launch time, never written to WORKFLOW.md or env files
- **Env fallback** — existing `env_passthrough` and `$VAR` expansion still work as override/fallback for CI or headless environments

### 🌐 Infrastructure Scaling

| Feature | Spec Section |
|---------|-------------|
| SSH worker host distribution (`worker.ssh_hosts`, per-host concurrency) | Appendix A |
| Persisted retry queue across restarts | §18.2 (TODO) |
| Pluggable tracker adapters beyond Linear | §18.2 (TODO) |
| First-class tracker write APIs | §18.2 (TODO) |

---

## 💡 Smaller Follow-Up Opportunities

These are not blockers for `v0.2.0`, but reasonable follow-up areas:

| Area | Description |
|------|-------------|
| 🎨 Dashboard polish | Further UI improvements, settings page, credential management UI |
| 🚀 Release automation | Stronger CI/CD and release pipeline |
| 📦 Local static assets | Replace remote CDN assets with fully local ones |
| 📊 Richer reporting | Operator reporting, Slack/webhook notifications on issue completion |
| 🧪 Test coverage for dispatch sorting/blocker logic | Spec §17.4 requires deterministic tests for dispatch sort and blocker rules |
| 📄 Configurable observability settings | Spec §18.2 TODO |
| 🔗 GitHub dynamic tool | `github_api` tool for agents to create PRs, check CI, read reviews |
| 🗂️ Multi-repo config | Repo registry in WORKFLOW.md mapping Linear teams/projects to git URLs |

---

## 📝 How to Keep This Document Current

> [!NOTE]
> Update this file when the shipped operator surface changes. If a capability is not implemented in the code or exposed in the actual runtime, **do not list it here as achieved**.
