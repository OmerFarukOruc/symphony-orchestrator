import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface ContainerStats {
  cpuPercent: string;
  memoryUsage: string;
  memoryLimit: string;
  memoryPercent: string;
  netIO: string;
  pids: string;
}

/**
 * Query `docker stats` for a single container snapshot.
 * Returns null if the container is not running or stats are unavailable.
 */
export async function getContainerStats(containerName: string): Promise<ContainerStats | null> {
  try {
    const { stdout } = await execFileAsync("docker", [
      "stats",
      "--no-stream",
      "--format",
      '{"cpu":"{{.CPUPerc}}","mem":"{{.MemUsage}}","memPerc":"{{.MemPerc}}","net":"{{.NetIO}}","pids":"{{.PIDs}}"}',
      containerName,
    ]);
    const trimmed = stdout.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = JSON.parse(trimmed) as Record<string, string>;
    const memParts = (parsed.mem ?? "").split(" / ");
    return {
      cpuPercent: parsed.cpu ?? "0%",
      memoryUsage: memParts[0] ?? parsed.mem ?? "0B",
      memoryLimit: memParts[1] ?? "",
      memoryPercent: parsed.memPerc ?? "0%",
      netIO: parsed.net ?? "0B / 0B",
      pids: parsed.pids ?? "0",
    };
  } catch {
    return null;
  }
}
