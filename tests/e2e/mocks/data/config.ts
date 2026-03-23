export function buildConfig(): Record<string, unknown> {
  return {
    "linear.project": "SYM",
    "linear.team": "Engineering",
    "codex.model": "o3-mini",
    "codex.reasoning_effort": "medium",
    "orchestrator.poll_interval_ms": 30_000,
    "orchestrator.max_concurrent": 3,
    "orchestrator.retry_limit": 2,
    "workspace.base_dir": "/tmp/workspaces",
  };
}

export function buildConfigOverlay(): { overlay: Record<string, unknown> } {
  return {
    overlay: {
      "codex.model": "o3-mini",
      "orchestrator.max_concurrent": 3,
    },
  };
}

export function buildConfigSchema(): unknown {
  return {
    properties: {
      "linear.project": { type: "string", description: "Linear project slug" },
      "linear.team": { type: "string", description: "Linear team name" },
      "codex.model": { type: "string", description: "Default model for Codex" },
      "codex.reasoning_effort": {
        type: "string",
        enum: ["none", "minimal", "low", "medium", "high", "xhigh"],
        description: "Reasoning effort level",
      },
      "orchestrator.poll_interval_ms": { type: "number", description: "Polling interval in ms" },
      "orchestrator.max_concurrent": { type: "number", description: "Max concurrent workers" },
      "orchestrator.retry_limit": { type: "number", description: "Max retry attempts" },
      "workspace.base_dir": { type: "string", description: "Base directory for workspaces" },
    },
  };
}
