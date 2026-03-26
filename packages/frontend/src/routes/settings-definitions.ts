import type { SettingsSectionDefinition } from "./settings-form";

export const settingsSections: readonly SettingsSectionDefinition[] = [
  {
    id: "tracker",
    title: "Tracker",
    description: "Choose which Linear project Symphony watches and how tracker states map to active work.",
    fields: [
      {
        path: "tracker.project_slug",
        label: "Linear project slug",
        kind: "text",
        description: "Project identifier Symphony should dispatch from.",
        placeholder: "SYM",
      },
      {
        path: "tracker.active_states",
        label: "Active states",
        kind: "list",
        description: "One state per line. These states mean the issue is ready or actively in flight.",
        placeholder: "Todo\nIn Progress",
      },
      {
        path: "tracker.terminal_states",
        label: "Terminal states",
        kind: "list",
        description: "One state per line. These states mean the issue is finished or no longer actionable.",
        placeholder: "Done\nCanceled",
      },
    ],
  },
  {
    id: "agent",
    title: "Agent",
    description: "Control concurrency, retry pacing, and the per-run turn budget.",
    fields: [
      {
        path: "agent.max_concurrent_agents",
        label: "Max concurrent agents",
        kind: "number",
        description: "Upper bound for simultaneous issue workers.",
      },
      {
        path: "agent.max_turns",
        label: "Max turns",
        kind: "number",
        description: "Maximum turns an agent can spend on one attempt.",
      },
      {
        path: "agent.max_retry_backoff_ms",
        label: "Retry backoff (ms)",
        kind: "number",
        description: "Longest delay between retries after failures or stalls.",
      },
    ],
  },
  {
    id: "codex",
    title: "Model provider / auth",
    description: "Define the model, reasoning depth, approval mode, and auth path used by Codex workers.",
    fields: [
      {
        path: "codex.model",
        label: "Default model",
        kind: "text",
        description: "Fallback model used when an issue-specific override is not present.",
        placeholder: "gpt-5.4",
      },
      {
        path: "codex.reasoning_effort",
        label: "Reasoning effort",
        kind: "select",
        description: "Higher settings trade latency and token usage for more deliberate reasoning.",
        options: ["none", "minimal", "low", "medium", "high", "xhigh"].map((value) => ({ label: value, value })),
      },
      {
        path: "codex.approval_policy",
        label: "Approval policy",
        kind: "text",
        description: "Approval mode forwarded to the Codex app server.",
        placeholder: "never",
      },
      {
        path: "codex.auth.mode",
        label: "Auth mode",
        kind: "select",
        description: "How Symphony authenticates Codex inside the worker environment.",
        options: [
          { label: "API key", value: "api_key" },
          { label: "OpenAI login", value: "openai_login" },
        ],
      },
    ],
  },
  {
    id: "workspace",
    title: "Workspace",
    description: "Tune the local workspace strategy and where issue sandboxes are created.",
    fields: [
      {
        path: "workspace.strategy",
        label: "Workspace strategy",
        kind: "select",
        description: "Choose between per-issue directories and git worktrees.",
        options: [
          { label: "Directory", value: "directory" },
          { label: "Worktree", value: "worktree" },
        ],
      },
      {
        path: "workspace.root",
        label: "Workspace root",
        kind: "text",
        description: "Absolute base path where issue workspaces are created.",
        placeholder: "/tmp/symphony-workspaces",
      },
    ],
  },
] as const;
