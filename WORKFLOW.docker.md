---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: $LINEAR_PROJECT_SLUG

polling:
  interval_ms: 30000

workspace:
  root: /data/workspaces

hooks:
  timeout_ms: 60000

agent:
  max_concurrent_agents: 10
  max_turns: 20
  max_retry_backoff_ms: 120000

codex:
  command: "codex app-server"
  model: "gpt-5.4"
  reasoning_effort: "high"
  approval_policy: "never"
  thread_sandbox: "danger-full-access"
  turn_sandbox_policy:
    type: "dangerFullAccess"
  read_timeout_ms: 5000
  turn_timeout_ms: 120000
  stall_timeout_ms: 300000
  auth:
    mode: "openai_login"
    source_home: "/codex-auth"
  sandbox:
    image: "symphony-codex:latest"
    network: ""
    security:
      no_new_privileges: true
      drop_capabilities: true
      gvisor: false
    resources:
      memory: "4g"
      memory_reservation: "1g"
      memory_swap: "4g"
      cpus: "2.0"
      tmpfs_size: "512m"
    extra_mounts: []
    env_passthrough:
      - LINEAR_API_KEY
      - GITHUB_TOKEN
    logs:
      driver: json-file
      max_size: "50m"
      max_file: 3

server:
  port: 4000
---
You are working on Linear issue {{ issue.identifier }}.

Respect the repository state you find in the workspace, make concrete progress, and stop when the issue is complete or blocked.

End your final message with `SYMPHONY_STATUS: DONE` when the issue is complete.
End your final message with `SYMPHONY_STATUS: BLOCKED` when progress is not possible.
