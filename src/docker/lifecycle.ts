import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Gracefully stop a running container.
 * Sends SIGTERM, waits `timeoutSeconds`, then SIGKILL.
 */
export async function stopContainer(name: string, timeoutSeconds = 5): Promise<void> {
  try {
    await execFileAsync("docker", ["stop", "--time", String(timeoutSeconds), name]);
  } catch {
    // Container may already be stopped or removed — safe to ignore.
  }
}

/**
 * Inspect whether the container was killed by the OOM killer.
 * Returns `true` if OOMKilled is set, `false` otherwise (including on inspect failure).
 */
export async function inspectOomKilled(name: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("docker", ["inspect", name, "--format", "{{.State.OOMKilled}}"]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Forcefully remove a container. Safe to call even if already removed.
 */
export async function removeContainer(name: string): Promise<void> {
  try {
    await execFileAsync("docker", ["rm", "-f", name]);
  } catch {
    // Already removed — safe to ignore.
  }
}
