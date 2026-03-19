import os from "node:os";

import type { PathRegistry } from "../workspace/path-registry.js";
import type { SandboxConfig } from "../core/types.js";

const CONTAINER_HOME = "/home/agent";
/**
 * Container-internal path — isolated from host filesystem.
 * The container's /tmp is a dedicated tmpfs mount with restricted
 * size and permissions (see buildResourceAndLogArgs). The container
 * also runs with --cap-drop=ALL and --security-opt=no-new-privileges.
 */
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

function buildMountArgs(args: string[], input: DockerRunInput, cacheVolumeName: string): void {
  const { sandboxConfig: cfg, workspacePath, archiveDir, pathRegistry } = input;
  const mounts: Array<[string, string, string?]> = [
    [pathRegistry?.translate(workspacePath) ?? workspacePath, workspacePath],
    [pathRegistry?.translate(archiveDir) ?? archiveDir, archiveDir],
  ];
  for (const [host, container, mode] of mounts) {
    args.push("-v", mode ? `${host}:${container}:${mode}` : `${host}:${container}`);
  }
  args.push("-v", `${cacheVolumeName}:${CONTAINER_HOME}`);
  for (const mount of cfg.extraMounts) {
    args.push("-v", mount);
  }
}

function buildEnvArgs(args: string[], input: DockerRunInput): void {
  const { sandboxConfig: cfg, runtimeConfigToml, runtimeAuthJsonBase64 = null, command, requiredEnv = [] } = input;
  args.push(
    "-e",
    `HOME=${CONTAINER_HOME}`,
    "-e",
    `CODEX_HOME=${CONTAINER_CODEX_HOME}`,
    "-e",
    `SYMPHONY_CODEX_CONFIG_TOML=${runtimeConfigToml}`,
  );
  if (runtimeAuthJsonBase64) {
    args.push("-e", `SYMPHONY_CODEX_AUTH_JSON_B64=${runtimeAuthJsonBase64}`);
  }
  args.push("-e", `SYMPHONY_CODEX_COMMAND=${command}`);

  const envNames = new Set([...cfg.envPassthrough, ...requiredEnv]);
  for (const envName of envNames) {
    const value = process.env[envName];
    if (value !== undefined) {
      args.push("-e", `${envName}=${value}`);
    }
  }
}

function buildSecurityArgs(args: string[], cfg: SandboxConfig): void {
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
}

function buildResourceAndLogArgs(args: string[], cfg: SandboxConfig): void {
  args.push(
    "--memory",
    cfg.resources.memory,
    "--memory-reservation",
    cfg.resources.memoryReservation,
    "--memory-swap",
    cfg.resources.memorySwap,
    "--cpus",
    cfg.resources.cpus,
    "--tmpfs",
    `/tmp:exec,size=${cfg.resources.tmpfsSize}`,
    "--log-driver",
    cfg.logs.driver,
    "--log-opt",
    `max-size=${cfg.logs.maxSize}`,
    "--log-opt",
    `max-file=${cfg.logs.maxFile}`,
  );
}

function buildEntrypointScript(egressAllowlist: string[]): string {
  const steps = ["set -euo pipefail", "umask 077"];

  if (egressAllowlist.length > 0) {
    steps.push(
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

  steps.push(
    'rm -rf "$CODEX_HOME"',
    'mkdir -p "$CODEX_HOME"',
    'printf "%s" "$SYMPHONY_CODEX_CONFIG_TOML" > "$CODEX_HOME/config.toml"',
    'if [ -n "${SYMPHONY_CODEX_AUTH_JSON_B64:-}" ]; then printf "%s" "$SYMPHONY_CODEX_AUTH_JSON_B64" | base64 -d > "$CODEX_HOME/auth.json"; fi',
    'exec bash -lc "$SYMPHONY_CODEX_COMMAND"',
  );

  return steps.join("; ");
}

export function buildDockerRunArgs(input: DockerRunInput): DockerRunResult {
  const { sandboxConfig: cfg, runId, workspacePath } = input;
  const containerName = `symphony-${runId}`;
  const cacheVolumeName = `symphony-cache-${runId}`;
  const uid = os.userInfo().uid;
  const gid = os.userInfo().gid;

  const args: string[] = ["run", "-i", "--name", containerName];
  args.push("--user", `${uid}:${gid}`, "--workdir", workspacePath);

  buildMountArgs(args, input, cacheVolumeName);
  buildEnvArgs(args, input);
  args.push("--add-host=host.docker.internal:host-gateway");

  if (cfg.network) {
    args.push("--network", cfg.network);
  }

  buildResourceAndLogArgs(args, cfg);
  buildSecurityArgs(args, cfg);

  if (input.issueIdentifier) {
    args.push("--label", `symphony.issue=${input.issueIdentifier}`);
  }
  if (input.model) {
    args.push("--label", `symphony.model=${input.model}`);
  }
  args.push(
    "--label",
    `symphony.workspace=${workspacePath}`,
    "--label",
    `symphony.started-at=${new Date().toISOString()}`,
  );

  const egressAllowlist = cfg.egressAllowlist ?? [];
  if (egressAllowlist.length > 0) {
    args.push("--cap-add=NET_ADMIN", "-e", `SYMPHONY_EGRESS_ALLOWLIST=${egressAllowlist.join(" ")}`);
  }

  args.push(cfg.image, "bash", "-lc", buildEntrypointScript(egressAllowlist));

  return { program: "docker", args, containerName, cacheVolumeName };
}
