import os from "node:os";

import type { PathRegistry } from "../workspace/path-registry.js";
import type { SandboxConfig } from "../core/types.js";

const CONTAINER_HOME = "/home/agent";
/**
 * Container-internal path — isolated from host filesystem and kept under
 * HOME so Codex can safely install helper binaries when needed.
 */
const CONTAINER_CODEX_HOME = "/home/agent/.codex-runtime"; // NOSONAR — container-internal path, not host

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
  const { sandboxConfig, workspacePath, archiveDir, pathRegistry } = input;
  const mounts: Array<[string, string, string?]> = [
    [pathRegistry?.translate(workspacePath) ?? workspacePath, workspacePath],
    [pathRegistry?.translate(archiveDir) ?? archiveDir, archiveDir],
  ];
  for (const [host, container, mode] of mounts) {
    args.push("-v", mode ? `${host}:${container}:${mode}` : `${host}:${container}`);
  }
  args.push("-v", `${cacheVolumeName}:${CONTAINER_HOME}`);
  for (const mount of sandboxConfig.extraMounts) {
    args.push("-v", mount);
  }
}

function buildEnvArgs(args: string[], input: DockerRunInput): void {
  const {
    sandboxConfig,
    runtimeConfigToml,
    runtimeAuthJsonBase64 = null,
    command,
    requiredEnv = [],
    workspacePath,
  } = input;
  const trustedProjectConfig = `${runtimeConfigToml}\n[projects.${JSON.stringify(workspacePath)}]\ntrust_level = "trusted"\n`;
  args.push(
    "-e",
    `HOME=${CONTAINER_HOME}`,
    "-e",
    `CODEX_HOME=${CONTAINER_CODEX_HOME}`,
    "-e",
    `SYMPHONY_CODEX_CONFIG_TOML=${trustedProjectConfig}`,
  );
  if (runtimeAuthJsonBase64) {
    args.push("-e", `SYMPHONY_CODEX_AUTH_JSON_B64=${runtimeAuthJsonBase64}`);
  }
  args.push("-e", `SYMPHONY_CODEX_COMMAND=${command}`);

  const envNames = new Set([...sandboxConfig.envPassthrough, ...requiredEnv]);
  for (const envName of envNames) {
    const value = process.env[envName];
    if (value !== undefined) {
      args.push("-e", `${envName}=${value}`);
    }
  }
}

function buildSecurityArgs(args: string[], sandboxConfig: SandboxConfig): void {
  if (sandboxConfig.security.dropCapabilities) {
    args.push("--cap-drop=ALL");
  }
  if (sandboxConfig.security.noNewPrivileges) {
    args.push("--security-opt=no-new-privileges");
  }
  if (sandboxConfig.security.gvisor) {
    args.push("--runtime=runsc");
  }
  if (sandboxConfig.security.seccompProfile) {
    args.push(`--security-opt=seccomp=${sandboxConfig.security.seccompProfile}`);
  }
}

function buildResourceAndLogArgs(args: string[], sandboxConfig: SandboxConfig): void {
  args.push(
    "--memory",
    sandboxConfig.resources.memory,
    "--memory-reservation",
    sandboxConfig.resources.memoryReservation,
    "--memory-swap",
    sandboxConfig.resources.memorySwap,
    "--cpus",
    sandboxConfig.resources.cpus,
    "--tmpfs",
    `/tmp:exec,size=${sandboxConfig.resources.tmpfsSize}`,
    "--log-driver",
    sandboxConfig.logs.driver,
    "--log-opt",
    `max-size=${sandboxConfig.logs.maxSize}`,
    "--log-opt",
    `max-file=${sandboxConfig.logs.maxFile}`,
  );
}

function buildEntrypointScript(egressAllowlist: string[], options?: { unsetApiKey?: boolean }): string {
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
  );

  // When using openai_login auth, prevent stale OPENAI_API_KEY from the host
  // environment from overriding the token-based auth flow inside Codex CLI.
  if (options?.unsetApiKey) {
    steps.push("unset OPENAI_API_KEY 2>/dev/null || true");
  }

  steps.push('exec bash -lc "$SYMPHONY_CODEX_COMMAND"');

  return steps.join("; ");
}

export function buildDockerRunArgs(input: DockerRunInput): DockerRunResult {
  const { sandboxConfig, runId, workspacePath } = input;
  const containerName = `symphony-${runId}`;
  const cacheVolumeName = `symphony-cache-${runId}`;
  const uid = os.userInfo().uid;
  const gid = os.userInfo().gid;

  const args: string[] = ["run", "-i", "--name", containerName];
  args.push("--user", `${uid}:${gid}`, "--workdir", workspacePath);

  buildMountArgs(args, input, cacheVolumeName);
  buildEnvArgs(args, input);
  args.push("--add-host=host.docker.internal:host-gateway");

  if (sandboxConfig.network) {
    args.push("--network", sandboxConfig.network);
  }

  buildResourceAndLogArgs(args, sandboxConfig);
  buildSecurityArgs(args, sandboxConfig);

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

  const egressAllowlist = sandboxConfig.egressAllowlist ?? [];
  if (egressAllowlist.length > 0) {
    args.push("--cap-add=NET_ADMIN", "-e", `SYMPHONY_EGRESS_ALLOWLIST=${egressAllowlist.join(" ")}`);
  }

  args.push(
    sandboxConfig.image,
    "bash",
    "-lc",
    buildEntrypointScript(egressAllowlist, {
      unsetApiKey: Boolean(input.runtimeAuthJsonBase64),
    }),
  );

  return { program: "docker", args, containerName, cacheVolumeName };
}
