---
# Tracker credentials come from the environment on purpose so dry-start can fail cleanly when they are absent.
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: $LINEAR_PROJECT_SLUG
  # endpoint: https://api.linear.app/graphql
  # active_states:
  #   - In Progress
  # terminal_states:
  #   - Done
  #   - Completed
  #   - Canceled
  #   - Cancelled
  #   - Duplicate

# The polling loop never overlaps; the next pass is scheduled only after the current pass completes.
polling:
  interval_ms: 30000

# Workspaces live as sibling directories of the project repo.
workspace:
  root: ../symphony-workspaces

# Every hook runs with the issue workspace as cwd.
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

# Max concurrency, turn budgeting, retry ceiling, synchronous read timeout, and stall timeout all live here.
agent:
  max_concurrent_agents: 10
  # Optional per-state cap keyed by normalized state name.
  # max_concurrent_agents_by_state:
  #   in progress: 4
  max_turns: 20
  max_retry_backoff_ms: 120000

codex:
  command: "codex app-server"
  # Default worker model; the dashboard/API can override this per issue at runtime.
  model: "gpt-5.4"
  reasoning_effort: "high"
  approval_policy: "never"
  thread_sandbox: "danger-full-access"
  turn_sandbox_policy:
    type: "dangerFullAccess"
  read_timeout_ms: 5000
  turn_timeout_ms: 120000
  stall_timeout_ms: 300000
  # Generic auth:
  # - api_key: env-driven provider auth
  # - openai_login: copy auth.json from codex.auth.source_home into the runtime home
  auth:
    mode: "api_key"
    source_home: "~/.codex"
  # No provider block is needed for direct OpenAI API-key usage.
  # For an OpenAI-compatible proxy or third-party endpoint, add:
  # provider:
  #   id: "custom"
  #   name: "Custom Provider"
  #   base_url: $CODEX_PROVIDER_BASE_URL
  #   env_key: "CUSTOM_PROVIDER_API_KEY"
  #   wire_api: "responses"
  #   env_http_headers:
  #     X-Tenant-ID: "CUSTOM_PROVIDER_TENANT"
  #
  # For a host-side proxy that expects ChatGPT/Codex login instead of an API key:
  # auth:
  #   mode: "openai_login"
  # provider:
  #   id: "cliproxyapi"
  #   name: "CLIProxyAPI"
  #   base_url: $CODEX_PROVIDER_BASE_URL
  #   wire_api: "responses"
  #   requires_openai_auth: true
  # Docker sandbox — the agent runs inside a container.
  # Build the image first: bash bin/build-sandbox.sh
  sandbox:
    image: "symphony-codex:latest"
    # Empty = Docker default bridge. Set to a pre-existing network name for egress filtering.
    network: ""
    security:
      no_new_privileges: true
      drop_capabilities: true
      # Set to true if gVisor (runsc) is installed on the host for stronger isolation.
      gvisor: false
    resources:
      memory: "4g"
      memory_reservation: "1g"
      memory_swap: "4g"
      cpus: "2.0"
      tmpfs_size: "512m"
    # Extra host:container bind mounts (identity-mapped by default).
    extra_mounts: []
    # Extra env vars to forward into the container from the host.
    # Provider env vars named in codex.provider.env_key/env_http_headers are forwarded automatically.
    env_passthrough:
      - LINEAR_API_KEY
    logs:
      driver: json-file
      max_size: "50m"
      max_file: 3

# The HTTP dashboard and JSON API bind locally by default.
server:
  port: 4000
---
You are working on Linear issue {{ issue.identifier }}.

If the issue is a smoke test, healthcheck, or end-to-end verification task, prefer a minimal proof that works even in an otherwise empty workspace. In that case, create a file such as `SYMPHONY_SMOKE_RESULT.md` inside the issue workspace with the issue identifier, UTC timestamp, current working directory, and a short summary of what succeeded.

When you have truly finished the issue and should stop, end your final message with `SYMPHONY_STATUS: DONE`. If you are blocked and cannot make further progress, end your final message with `SYMPHONY_STATUS: BLOCKED`.

Respect the repository state you find in the workspace, explain what you are doing in short operator-friendly updates, and stop once the issue is either complete or blocked.
