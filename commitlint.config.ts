import type { UserConfig } from "@commitlint/types";

const config: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "orchestrator",
        "http",
        "cli",
        "core",
        "workspace",
        "linear",
        "git",
        "docker",
        "config",
        "persistence",
        "dashboard",
        "setup",
        "secrets",
        "agent",
        "ci",
        "frontend",
        "e2e",
        "deps",
      ],
    ],
  },
};

export default config;
