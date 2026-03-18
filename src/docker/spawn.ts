import os from "node:os";

import type { PathRegistry } from "../workspace/path-registry.js";
import type { SandboxConfig } from "../core/types.js";

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
  issueIdentifier?: string;
  model?: string;
}

interface DockerRunResult {
  program: string;
  args: string[];
  containerName: string;
  cacheVolumeName: string;
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
  const cacheVolumeName = `symphony-cache-${runId}`;
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
  args.push("-v", `${cacheVolumeName}:${CONTAINER_HOME}`);

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
  if (cfg.security.seccompProfile) {
    args.push(`--security-opt=seccomp=${cfg.security.seccompProfile}`);
  }

  // Log driver
  args.push("--log-driver", cfg.logs.driver);
  args.push("--log-opt", `max-size=${cfg.logs.maxSize}`);
  args.push("--log-opt", `max-file=${cfg.logs.maxFile}`);

  // Observability labels
  if (input.issueIdentifier) {
    args.push("--label", `symphony.issue=${input.issueIdentifier}`);
  }
  if (input.model) {
    args.push("--label", `symphony.model=${input.model}`);
  }
  args.push("--label", `symphony.workspace=${workspacePath}`);
  args.push("--label", `symphony.started-at=${new Date().toISOString()}`);

  // Egress allowlist: grant CAP_NET_ADMIN and pass allowlist as env
  const egressAllowlist = cfg.egressAllowlist ?? [];
  if (egressAllowlist.length > 0) {
    args.push("--cap-add=NET_ADMIN");
    args.push("-e", `SYMPHONY_EGRESS_ALLOWLIST=${egressAllowlist.join(" ")}`);
  }

  // Image
  args.push(cfg.image);

  // Build the entrypoint script with optional egress iptables rules
  const entrypointSteps = ["set -euo pipefail", "umask 077"];

  // When egress allowlist is configured, inject iptables rules before starting Codex
  if (egressAllowlist.length > 0) {
    entrypointSteps.push(
      // Only apply iptables if available (graceful degradation)
      'if command -v iptables >/dev/null 2>&1 && [ -n "${SYMPHONY_EGRESS_ALLOWLIST:-}" ]; then',
      "  iptables -A OUTPUT -o lo -j ACCEPT",
      "  iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
      "  iptables -A OUTPUT -p udp --dport 53 -j ACCEPT",
      "  iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT",
      "  for domain in $SYMPHONY_EGRESS_ALLOWLIST; do",
      "    for ip in $(getent hosts \"$domain\" 2>/dev/null | awk '{print $1}' | head -5); do",
      '      iptables -A OUTPUT -d "$ip" -j ACCEPT',
      "    done",
      "  done",
      "  iptables -A OUTPUT -j REJECT 2>/dev/null || iptables -A OUTPUT -j DROP",
      "fi",
    );
  }

  entrypointSteps.push(
    'rm -rf "$CODEX_HOME"',
    'mkdir -p "$CODEX_HOME"',
    'printf "%s" "$SYMPHONY_CODEX_CONFIG_TOML" > "$CODEX_HOME/config.toml"',
    'if [ -n "${SYMPHONY_CODEX_AUTH_JSON_B64:-}" ]; then printf "%s" "$SYMPHONY_CODEX_AUTH_JSON_B64" | base64 -d > "$CODEX_HOME/auth.json"; fi',
    'exec bash -lc "$SYMPHONY_CODEX_COMMAND"',
  );

  // Materialize the runtime home entirely inside the container before starting Codex.
  args.push("bash", "-lc", entrypointSteps.join("; "));

  return { program: "docker", args, containerName, cacheVolumeName };
}
