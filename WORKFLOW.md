---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: $LINEAR_PROJECT_SLUG
  active_states:
    - Backlog
    - Todo
    - In Progress
polling:
  interval_ms: 15000
workspace:
  root: ../symphony-workspaces
  strategy: worktree
hooks:
  timeout_ms: 60000
  after_create: |
    echo "workspace created for $SYMPHONY_ISSUE_IDENTIFIER"
  before_run: |
    echo "about to run in $PWD"
  after_run: |
    echo "attempt finished"
  before_remove: |
    echo "removing workspace $PWD"
agent:
  max_concurrent_agents: 10
  max_turns: 20
  max_retry_backoff_ms: 120000
  success_state: "Done"
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
repos:
  # This NIN route currently self-targets Symphony for smoke/self-test traffic.
  # Replace it with the real NIN target repository before using NIN as a production route.
  - repo_url: "https://github.com/OmerFarukOruc/symphony-orchestrator.git"
    default_branch: "main"
    identifier_prefix: "NIN"
    github_owner: "OmerFarukOruc"
    github_repo: "symphony-orchestrator"
    github_token_env: "GITHUB_TOKEN"
  - repo_url: "https://github.com/OmerFarukOruc/sentinel-test-arena.git"
    default_branch: "main"
    identifier_prefix: "STA"
    github_owner: "OmerFarukOruc"
    github_repo: "sentinel-test-arena"
    github_token_env: "GITHUB_TOKEN"
server:
  port: 4000
---

You are working on Linear issue {{ issue.identifier }}: "{{ issue.title }}"
{% if issue.description %}

## Issue Description

{{ issue.description }}
{% endif %}

If the issue is a smoke test, healthcheck, or end-to-end verification task, prefer a minimal proof that works even in an otherwise empty workspace. In that case, create a file such as `SYMPHONY_SMOKE_RESULT.md` inside the issue workspace with the issue identifier, UTC timestamp, current working directory, and a short summary of what succeeded.

When you have truly finished the issue and should stop, end your final message with `SYMPHONY_STATUS: DONE`. If you are blocked and cannot make further progress, end your final message with `SYMPHONY_STATUS: BLOCKED`.

Respect the repository state you find in the workspace, explain what you are doing in short operator-friendly updates, and stop once the issue is either complete or blocked.
