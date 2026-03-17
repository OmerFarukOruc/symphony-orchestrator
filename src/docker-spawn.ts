import os from "node:os";

import type { PathRegistry } from "./path-registry.js";
import type { SandboxConfig } from "./types.js";

const CONTAINER_HOME = "/home/agent";
const CONTAINER_CODEX_HOME = "/tmp/symphony-codex-home";

export interface DockerRunInput {
  sandboxConfig: SandboxConfig;
  runId: string;
  command: string;
  workspacePath: string;
  archiveDir: string;
  pathRegistry?: PathRegistry;
  runtimeConfigToml: string;
  runtimeAuthJsonBase64?: string | null;
  requiredEnv?: string[];
}

export interface DockerRunResult {
  program: string;
  args: string[];
  containerName: string;
}

export function buildDockerRunArgs(input: DockerRunInput): DockerRunResult {
  const {
    sandboxConfig: cfg,
    runId,
    command,
    workspacePath,
    archiveDir,
    pathRegistry,
    runtimeConfigToml,
    runtimeAuthJsonBase64 = null,
    requiredEnv = [],
  } = input;
  const containerName = `symphony-${runId}`;
  const uid = os.userInfo().uid;
  const gid = os.userInfo().gid;

  const args: string[] = ["run", "-i", "--name", containerName];

  // Run as host UID:GID to prevent ownership drift
  args.push("--user", `${uid}:${gid}`);

  // Working directory preserves the cwd contract
  args.push("--workdir", workspacePath);

  // Identity mounts: -v host:container[:mode] so all absolute paths are valid inside the container
  const mounts: Array<[string, string, string?]> = [
    [pathRegistry?.translate(workspacePath) ?? workspacePath, workspacePath], // workspace
    [pathRegistry?.translate(archiveDir) ?? archiveDir, archiveDir], // logs/archive
  ];
  for (const [host, container, mode] of mounts) {
    args.push("-v", mode ? `${host}:${container}:${mode}` : `${host}:${container}`);
  }

  // Persistent HOME cache volume for npm/pip/git under numeric UID
  args.push("-v", `symphony-cache-${runId}:${CONTAINER_HOME}`);

  // Extra user-defined mounts
  for (const mount of cfg.extraMounts) {
    args.push("-v", mount);
  }

  // Environment variables
  args.push("-e", `HOME=${CONTAINER_HOME}`);
  args.push("-e", `CODEX_HOME=${CONTAINER_CODEX_HOME}`);
  args.push("-e", `SYMPHONY_CODEX_CONFIG_TOML=${runtimeConfigToml}`);
  if (runtimeAuthJsonBase64) {
    args.push("-e", `SYMPHONY_CODEX_AUTH_JSON_B64=${runtimeAuthJsonBase64}`);
  }
  args.push("-e", `SYMPHONY_CODEX_COMMAND=${command}`);

  // Pass through configured env vars from host
  const envNames = new Set([...cfg.envPassthrough, ...requiredEnv]);
  for (const envName of envNames) {
    const value = process.env[envName];
    if (value !== undefined) {
      args.push("-e", `${envName}=${value}`);
    }
  }

  // Allow the container to reach host-bound services (e.g. CLIProxyAPI)
  args.push("--add-host=host.docker.internal:host-gateway");

  // Network
  if (cfg.network) {
    args.push("--network", cfg.network);
  }

  // Resource limits
  args.push("--memory", cfg.resources.memory);
  args.push("--memory-reservation", cfg.resources.memoryReservation);
  args.push("--memory-swap", cfg.resources.memorySwap);
  args.push("--cpus", cfg.resources.cpus);
  args.push("--tmpfs", `/tmp:exec,size=${cfg.resources.tmpfsSize}`);

  // Security
  if (cfg.security.dropCapabilities) {
    args.push("--cap-drop=ALL");
  }
  if (cfg.security.noNewPrivileges) {
    args.push("--security-opt=no-new-privileges");
  }
  if (cfg.security.gvisor) {
    args.push("--runtime=runsc");
  }

  // Log driver
  args.push("--log-driver", cfg.logs.driver);
  args.push("--log-opt", `max-size=${cfg.logs.maxSize}`);
  args.push("--log-opt", `max-file=${cfg.logs.maxFile}`);

  // Image
  args.push(cfg.image);

  // Materialize the runtime home entirely inside the container before starting Codex.
  args.push(
    "bash",
    "-lc",
    [
      "set -euo pipefail",
      "umask 077",
      'rm -rf "$CODEX_HOME"',
      'mkdir -p "$CODEX_HOME"',
      'printf "%s" "$SYMPHONY_CODEX_CONFIG_TOML" > "$CODEX_HOME/config.toml"',
      'if [ -n "${SYMPHONY_CODEX_AUTH_JSON_B64:-}" ]; then printf "%s" "$SYMPHONY_CODEX_AUTH_JSON_B64" | base64 -d > "$CODEX_HOME/auth.json"; fi',
      'exec bash -lc "$SYMPHONY_CODEX_COMMAND"',
    ].join("; "),
  );

  return { program: "docker", args, containerName };
}
