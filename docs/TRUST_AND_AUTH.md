# 🔐 Trust and Auth

> Trust boundary and authentication model for Symphony Orchestrator.

---

## 🎵 Symphony's Role

Symphony has a narrow job: it launches a local Codex app-server, talks to Linear, manages issue workspaces, and reports state locally. It does **not** choose backing Codex accounts, perform browser login, or implement provider pooling itself.

---

## 🏗️ Trust Layers

```mermaid
flowchart TB
    S["🎵 Symphony\nDecides WHEN to launch\nand WHICH workspace"]
    C["🤖 Codex\nDecides HOW to execute\neach turn"]
    P["🌐 Provider / Proxy\nDecides HOW the model\ncall is routed"]

    S --> C --> P

    style S fill:#2563eb,stroke:#1d4ed8,color:#fff
    style C fill:#d97706,stroke:#b45309,color:#fff
    style P fill:#059669,stroke:#047857,color:#fff
```

| Layer | Component | Responsibility |
|:-----:|-----------|----------------|
| **1** | **Symphony** | Decides when to launch work and what workspace directory the worker can use |
| **2** | **Codex** | Decides how to execute each turn, including approvals and any configured MCP servers |
| **3** | **Provider / Proxy** | Decides which backing account or route handles the actual model call |

---

## ⚠️ Recommended v0.1 Trust Posture

> [!WARNING]
> The recommended v0.1 posture is deliberately **high trust** — appropriate **only** for local, operator-controlled environments:

| Setting | Value |
|---------|-------|
| `approval_policy` | `"never"` |
| `thread_sandbox` | `"danger-full-access"` |
| `turn_sandbox_policy` | `{ type: "dangerFullAccess" }` |

The workflow example uses an isolated `CODEX_HOME` so the daemon avoids inheriting personal experiments or unrelated MCP servers. The checked-in `WORKFLOW.md` points at the minimal fixture home in `tests/fixtures/codex-home-custom-provider` for the same reason.

---

## 🌐 Provider Boundary

Symphony launches the exact `codex.command` from `WORKFLOW.md`. If that Codex runtime is already configured to use a provider or proxy, Symphony inherits that behavior. This keeps account routing **below** Symphony instead of duplicating it inside.

---

## 🐳 Docker Sandbox Boundary

Symphony runs the Codex agent inside a Docker container using the `codex-universal` base image. The container is a **transparent wrapper** — the same `codex.command` runs inside, with the same paths and environment.

**Key properties:**

| Property | How |
|----------|-----|
| **Path identity** | All host paths are bind-mounted at their same absolute path inside the container (`-v /host/path:/host/path`) |
| **Auth preservation** | `CODEX_AUTH_SOURCE_HOME` is set and its directory is bind-mounted read-only |
| **Host permissions** | Container runs as `--user $(id -u):$(id -g)` — files it creates are owned by the host user |
| **Provider decoupling** | Symphony does not manage provider config; the launcher and `CODEX_HOME` handle auth, same as without Docker |
| **Network** | Default is Docker's default bridge (full internet). Operators can pre-provision a restricted network and reference it by name |

> [!NOTE]
> Named Docker volumes (used for build caches) survive container and image replacement, but **not** `docker system prune --volumes`. Operator docs should warn against pruning volumes prefixed with `symphony-`.

---

## 🔑 Required Credentials

| Credential | Source | Purpose |
|------------|--------|---------|
| **Linear access** | `tracker.api_key` (typically `$LINEAR_API_KEY`) | Polling issues from Linear |
| **Codex auth** | Launched `codex app-server`'s `CODEX_HOME` | Authenticating model calls |

---

## 🚨 Required MCP Failure

> [!NOTE]
> This failure is a **Codex runtime startup problem**, not a Symphony orchestration bug:
> ```text
> error code=startup_failed msg="thread/start failed because a required MCP server did not initialize"
> ```
