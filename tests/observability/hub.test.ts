import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createObservabilityHub } from "../../src/observability/hub.js";
import {
  buildProcessSnapshotPath,
  readComponentSnapshots,
  writeComponentSnapshot,
} from "../../src/observability/snapshot.js";

describe("ObservabilityHub", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-observability-"));
    tempDirs.push(dir);
    return dir;
  }

  function findDeadPid(start = 999_999): number {
    let candidate = start;
    while (candidate < start + 10_000) {
      try {
        process.kill(candidate, 0);
        candidate += 1;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") {
          return candidate;
        }
        candidate += 1;
      }
    }
    throw new Error("Could not find a dead pid for snapshot pruning test");
  }

  it("writes component snapshots to disk and aggregates them", async () => {
    const archiveDir = await createTempDir();
    const hub = createObservabilityHub({ archiveDir });
    const observer = hub.getComponent("http");

    observer.recordOperation({
      metric: "api_request",
      operation: "http_request",
      outcome: "success",
      correlationId: "req-1",
      durationMs: 12,
      data: { path: "/api/v1/state" },
    });
    observer.setHealth({
      surface: "http",
      status: "ok",
      reason: "request handling healthy",
    });
    observer.setSession("req-1", {
      status: "completed",
      correlationId: "req-1",
      metadata: { path: "/api/v1/state" },
    });
    await observer.drain();

    const persisted = await readComponentSnapshots(path.join(archiveDir, "observability"));
    expect(persisted).toHaveLength(1);
    expect(persisted[0].component).toBe("http");
    expect(persisted[0].metrics.api_request.total).toBe(1);

    const summary = await hub.aggregate({
      runtimeState: {
        generated_at: "2026-04-06T00:00:00Z",
        counts: { running: 0, retrying: 0 },
        running: [],
        retrying: [],
        queued: [],
        completed: [],
        workflow_columns: [],
        codex_totals: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          seconds_running: 0,
          cost_usd: 0,
        },
        rate_limits: null,
        recent_events: [],
      },
      rawMetrics: "# HELP risoluto_http_requests_total Total HTTP requests\nrisoluto_http_requests_total 1\n",
      attemptStoreConfigured: true,
    });

    expect(summary.components).toHaveLength(1);
    expect(summary.health.status).toBe("ok");
    expect(summary.sessionState).toHaveLength(1);
    expect(summary.rawMetrics).toContain("risoluto_http_requests_total 1");
  });

  it("ignores snapshots from dead processes and prunes them from disk", async () => {
    const archiveDir = await createTempDir();
    const root = path.join(archiveDir, "observability");
    const deadPid = findDeadPid();
    const snapshotPath = buildProcessSnapshotPath(root, "http", deadPid);

    await writeComponentSnapshot(
      root,
      {
        component: "http",
        pid: deadPid,
        updatedAt: "2026-04-06T00:00:00Z",
        metrics: {},
        health: {
          http: {
            surface: "http",
            component: "http",
            status: "warn",
            updatedAt: "2026-04-06T00:00:00Z",
            reason: "http server stopped",
          },
        },
        traces: [],
        sessions: {},
      },
      deadPid,
    );

    const persisted = await readComponentSnapshots(root);

    expect(persisted).toEqual([]);
    await expect(access(snapshotPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
