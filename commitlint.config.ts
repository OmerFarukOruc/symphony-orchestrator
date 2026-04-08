import type { UserConfig } from "@commitlint/types";

const config: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "agent",
        "alerts",
        "audit",
        "automation",
        "ci",
        "cli",
        "codex",
        "config",
        "core",
        "dashboard",
        "deps",
        "dispatch",
        "docker",
        "e2e",
        "frontend",
        "git",
        "github",
        "http",
        "linear",
        "notification",
        "observability",
        "orchestrator",
        "persistence",
        "prompt",
        "release",
        "secrets",
        "setup",
        "state",
        "tracker",
        "utils",
        "webhook",
        "workflow",
        "workspace",
      ],
    ],
  },
};

export default config;
