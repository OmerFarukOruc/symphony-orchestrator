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

## ⚠️ Recommended v0.2 Trust Posture

> [!WARNING]
> The recommended v0.2 posture is deliberately **high trust** — appropriate **only** for local, operator-controlled environments:

| Setting | Value |
|---------|-------|
| `approval_policy` | `"never"` |
| `thread_sandbox` | `"danger-full-access"` |
| `turn_sandbox_policy` | `{ type: "dangerFullAccess" }` |

Symphony now generates a fresh per-attempt container-local `CODEX_HOME` for every worker run. API-key flows render provider config into that runtime home, and `openai_login` flows read `auth.json` from `codex.auth.source_home` and inject it into the container runtime home.

---

## 🌐 Provider Boundary

Symphony launches the exact `codex.command` from the workflow, but it now owns the minimal runtime config that `codex app-server` sees inside Docker. That config is generic:

- Direct OpenAI API usage: `codex.auth.mode: "api_key"` with no `codex.provider` block
- OpenAI-compatible proxy or third-party endpoint: `codex.auth.mode: "api_key"` plus `codex.provider.base_url`, `env_key`, and optional headers/query params
- ChatGPT/Codex login backed flows: `codex.auth.mode: "openai_login"` with an optional custom provider that sets `requires_openai_auth: true`

When running inside Docker, the container cannot reach the host's `127.0.0.1` directly. Symphony handles that transparently by:

- adding `--add-host=host.docker.internal:host-gateway` to every container
- rewriting host-bound provider URLs such as `127.0.0.1` and `localhost` to `host.docker.internal` in the generated runtime config

This keeps provider routing **below** Symphony without keeping repo-local launcher scripts or checked-in Codex homes.

---

## 🐳 Docker Sandbox Boundary

Symphony runs the Codex agent inside a Docker container using a `node:22-bookworm` base image with the Codex CLI installed globally. The container is a **transparent wrapper** — the same `codex.command` runs inside, with the same paths and environment.

**Key properties:**

| Property | How |
|----------|-----|
| **Path identity** | Workspace and archive paths are bind-mounted at the same absolute path inside the container |
| **Auth preservation** | `openai_login` reads `auth.json` from `codex.auth.source_home` and injects it into the container-local runtime home before launch |
| **Host permissions** | Container runs as `--user $(id -u):$(id -g)` — files it creates are owned by the host user |
| **Provider decoupling** | Symphony renders the runtime config, but the configured provider still decides how model calls are routed |
| **Network** | Default is Docker's default bridge (full internet). Operators can pre-provision a restricted network and reference it by name |

> [!NOTE]
> Named Docker volumes (used for build caches) survive container and image replacement, but **not** `docker system prune --volumes`. Operator docs should warn against pruning volumes prefixed with `symphony-`.

---

## 🔑 Required Credentials

| Credential | Source | Purpose |
|------------|--------|---------|
| **Linear access** | `tracker.api_key` (typically `$LINEAR_API_KEY`) | Polling issues from Linear |
| **Codex auth** | Either provider env vars on the host or `auth.json` under `codex.auth.source_home` | Authenticating model calls |

---

## 🚨 Required MCP Failure

> [!NOTE]
> This failure is a **Codex runtime startup problem**, not a Symphony orchestration bug:
> ```text
> error code=startup_failed msg="thread/start failed because a required MCP server did not initialize"
> ```
