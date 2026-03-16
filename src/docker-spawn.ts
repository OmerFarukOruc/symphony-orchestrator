import os from "node:os";
import path from "node:path";

import type { SandboxConfig } from "./types.js";

const CONTAINER_HOME = "/home/agent";

export interface DockerRunInput {
  sandboxConfig: SandboxConfig;
  runId: string;
  command: string;
  workspacePath: string;
  codexHome: string;
  archiveDir: string;
}

export interface DockerRunResult {
  program: string;
  args: string[];
  containerName: string;
}

/**
 * Resolve the host-side auth source directory that
 * `bin/codex-app-server-live` reads from.
 */
export function resolveAuthSourceHome(): string {
  return process.env.CODEX_AUTH_SOURCE_HOME ?? path.join(os.homedir(), ".codex");
}

/**
 * Resolve the repo root for mounting the launcher and fixture files.
 * Falls back to cwd if the env var is not set.
 */
export function resolveRepoRoot(): string {
  return process.env.SYMPHONY_REPO_ROOT ?? process.cwd();
}

export function buildDockerRunArgs(input: DockerRunInput): DockerRunResult {
  const { sandboxConfig: cfg, runId, command, workspacePath, codexHome, archiveDir } = input;
  const containerName = `symphony-${runId}`;
  const uid = os.userInfo().uid;
  const gid = os.userInfo().gid;
  const authSourceHome = resolveAuthSourceHome();
  const repoRoot = resolveRepoRoot();

  const args: string[] = ["run", "-i", "--name", containerName];

  // Run as host UID:GID to prevent ownership drift
  args.push("--user", `${uid}:${gid}`);

  // Working directory preserves the cwd contract
  args.push("--workdir", workspacePath);

  // Identity mounts: -v host:host so all absolute paths are valid inside the container
  const mounts: Array<[string, string]> = [
    [workspacePath, workspacePath], // workspace
    [repoRoot, `${repoRoot}:ro`], // repo (launcher + fixtures), read-only
    [codexHome, codexHome], // CODEX_HOME (runtime)
    [authSourceHome, `${authSourceHome}:ro`], // auth source, read-only
    [archiveDir, archiveDir], // logs/archive
  ];
  for (const [, target] of mounts) {
    args.push("-v", target.includes(":") ? target : `${target}:${target}`);
  }

  // Persistent HOME cache volume for npm/pip/git under numeric UID
  args.push("-v", `symphony-cache-${runId}:${CONTAINER_HOME}`);

  // Extra user-defined mounts
  for (const mount of cfg.extraMounts) {
    args.push("-v", mount);
  }

  // Environment variables
  args.push("-e", `HOME=${CONTAINER_HOME}`);
  args.push("-e", `CODEX_HOME=${codexHome}`);
  args.push("-e", `CODEX_AUTH_SOURCE_HOME=${authSourceHome}`);

  // Pass through configured env vars from host
  for (const envName of cfg.envPassthrough) {
    const value = process.env[envName];
    if (value !== undefined) {
      args.push("-e", `${envName}=${value}`);
    }
  }

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

  // Command (matches current: bash -lc <command>)
  args.push("bash", "-lc", command);

  return { program: "docker", args, containerName };
}
