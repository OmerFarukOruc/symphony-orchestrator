import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function isNotFound(error: unknown): boolean {
  if (error instanceof Error && "stderr" in error) {
    const stderr = (error as { stderr?: string }).stderr;
    return typeof stderr === "string" && (stderr.includes("No such container") || stderr.includes("No such volume"));
  }
  return false;
}

/**
 * Gracefully stop a running container.
 * Sends SIGTERM, waits `timeoutSeconds`, then SIGKILL.
 */
export async function stopContainer(name: string, timeoutSeconds = 5): Promise<void> {
  try {
    await execFileAsync("docker", ["stop", "--time", String(timeoutSeconds), name]);
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }
}

/**
 * Inspect whether the container was killed by the OOM killer.
 * Returns `true` if OOMKilled is set, `false` if the container exists and OOMKilled is not set,
 * and `null` if the container no longer exists ("No such container").
 * Non-not-found inspection errors are rethrown.
 */
export async function inspectOomKilled(name: string): Promise<boolean | null> {
  try {
    const { stdout } = await execFileAsync("docker", ["inspect", name, "--format", "{{.State.OOMKilled}}"]);
    return stdout.trim() === "true";
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * Inspect whether the container is currently running.
 * Returns `true` if running, `false` if the container exists but is stopped,
 * and `null` if the container does not exist.
 */
export async function inspectContainerRunning(name: string): Promise<boolean | null> {
  try {
    const { stdout } = await execFileAsync("docker", ["inspect", name, "--format", "{{.State.Running}}"]);
    return stdout.trim() === "true";
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * Forcefully remove a container. Safe to call even if already removed.
 */
export async function removeContainer(name: string): Promise<void> {
  try {
    await execFileAsync("docker", ["rm", "-f", name]);
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }
}

/**
 * Remove a named Docker volume. Safe to call if it is already absent.
 */
export async function removeVolume(name: string): Promise<void> {
  try {
    await execFileAsync("docker", ["volume", "rm", "-f", name]);
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }
}
