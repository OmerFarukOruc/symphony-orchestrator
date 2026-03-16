# Trust and Auth

Symphony has a narrow job: it launches a local Codex app-server, talks to Linear, manages issue workspaces, and reports state locally. It does not choose backing Codex accounts, do browser login, or implement provider pooling itself.

There are three trust layers:

1. Symphony decides when to launch work and what workspace directory the worker can use.
2. Codex decides how to execute each turn, including approvals and any configured Model Context Protocol servers.
3. The configured provider or proxy, such as CLIProxyAPI, decides which backing account or route handles the actual model call.

The recommended v1 trust posture is deliberately high trust:

- `approval_policy: "never"`
- `thread_sandbox: "danger-full-access"`
- `turn_sandbox_policy: { type: "dangerFullAccess" }`

That posture is appropriate only for local, operator-controlled environments. The workflow example uses an isolated `CODEX_HOME` so the daemon can avoid inheriting personal experiments or unrelated MCP servers unless the operator wants it to. In this repository, the checked-in `WORKFLOW.md` points at the minimal fixture home in `tests/fixtures/codex-home-custom-provider` for the same reason.

## Provider boundary

Symphony launches the exact `codex.command` from `WORKFLOW.md`. If that Codex runtime is already configured to use a provider or proxy, Symphony inherits that behavior. This keeps account routing below Symphony instead of duplicating it inside Symphony.

## Required credentials

- Linear access comes from `tracker.api_key`, typically via `$LINEAR_API_KEY`.
- Codex auth comes from whatever the launched `codex app-server` needs in its chosen `CODEX_HOME`.

## Required MCP failure example

This failure shape is a Codex runtime startup problem, not a Symphony orchestration bug:

```text
error code=startup_failed msg="thread/start failed because a required MCP server did not initialize"
```
