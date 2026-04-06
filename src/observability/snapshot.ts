import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ObservabilityHealthSummary, ObservabilityHealthSurface } from "./health.js";
import type { ObservabilityMetricCounter } from "./metrics.js";
import type { ObservabilityTraceRecord } from "./tracing.js";

export interface ObservabilitySessionRecord {
  key: string;
  component: string;
  status: string;
  updatedAt: string;
  correlationId: string | null;
  metadata?: Record<string, unknown>;
}

export interface ComponentObservabilitySnapshot {
  component: string;
  pid: number;
  updatedAt: string;
  metrics: Record<string, ObservabilityMetricCounter>;
  health: Record<string, ObservabilityHealthSurface>;
  traces: ObservabilityTraceRecord[];
  sessions: Record<string, ObservabilitySessionRecord>;
}

export interface ObservabilitySummary {
  generatedAt: string;
  snapshotRoot: string;
  components: ComponentObservabilitySnapshot[];
  health: ObservabilityHealthSummary;
  traces: ObservabilityTraceRecord[];
  sessionState: ObservabilitySessionRecord[];
  runtimeState: Record<string, unknown>;
  rawMetrics: string;
}

const PROCESS_SNAPSHOT_DIR = "processes";

export function resolveObservabilityRoot(archiveDir?: string): string {
  const configured = process.env.RISOLUTO_OBSERVABILITY_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(archiveDir ?? path.join(os.tmpdir(), "risoluto-observability"), "observability");
}

export function buildProcessSnapshotPath(root: string, component: string, pid = process.pid): string {
  const safeComponent = component.replaceAll(/[^\w.-]+/g, "-");
  return path.join(root, PROCESS_SNAPSHOT_DIR, `${safeComponent}-${pid}.json`);
}

export async function writeComponentSnapshot(
  root: string,
  snapshot: ComponentObservabilitySnapshot,
  pid = snapshot.pid,
): Promise<void> {
  const targetPath = buildProcessSnapshotPath(root, snapshot.component, pid);
  await mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${randomUUID()}.tmp`;
  const content = JSON.stringify(snapshot, null, 2);
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, targetPath);
}

export async function readComponentSnapshots(root: string): Promise<ComponentObservabilitySnapshot[]> {
  const dir = path.join(root, PROCESS_SNAPSHOT_DIR);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const snapshots = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => {
        const snapshotPath = path.join(dir, entry);
        try {
          const raw = await readFile(snapshotPath, "utf8");
          const snapshot = JSON.parse(raw) as ComponentObservabilitySnapshot;
          if (!isProcessAlive(snapshot.pid)) {
            await unlink(snapshotPath).catch(() => undefined);
            return null;
          }
          return snapshot;
        } catch {
          return null;
        }
      }),
  );
  return snapshots.filter((snapshot): snapshot is ComponentObservabilitySnapshot => snapshot !== null);
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}
