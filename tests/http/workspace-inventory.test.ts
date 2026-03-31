import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import http from "node:http";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import {
  handleWorkspaceInventory,
  handleWorkspaceRemove,
  type WorkspaceInventoryDeps,
} from "../../src/http/workspace-inventory.js";

function createTestDir(suffix: string): string {
  return path.join(tmpdir(), `risoluto-test-${suffix}-${Date.now()}`);
}

function makeOrchestrator(running: unknown[] = [], retrying: unknown[] = [], completed: unknown[] = []) {
  return {
    getSnapshot: vi.fn().mockReturnValue({
      generatedAt: "2024-01-01T00:00:00Z",
      counts: { running: running.length, retrying: retrying.length },
      running,
      retrying,
      completed,
      queued: [],
      workflowColumns: [],
      codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0, costUsd: 0 },
      rateLimits: null,
      recentEvents: [],
    }),
  };
}

function makeConfigStore(root: string) {
  return {
    getConfig: vi.fn().mockReturnValue({
      workspace: {
        root,
        strategy: "directory",
        branchPrefix: "risoluto/",
        hooks: { beforeRun: null, afterRun: null, beforeRemove: null, afterCreate: null, timeoutMs: 10_000 },
      },
      repos: [],
      tracker: {},
      polling: { intervalMs: 60_000 },
      agent: {},
      codex: {},
      server: { port: 3000 },
    }),
  };
}

function createApp(deps: WorkspaceInventoryDeps): express.Express {
  const app = express();
  app.use(express.json());
  app.get("/api/v1/workspaces", async (req, res) => {
    await handleWorkspaceInventory(deps, req, res);
  });
  app.delete("/api/v1/workspaces/:workspace_key", async (req, res) => {
    await handleWorkspaceRemove(deps, req, res);
  });
  return app;
}

function startTestServer(deps: WorkspaceInventoryDeps): Promise<{ server: http.Server; port: number }> {
  const app = createApp(deps);
  return new Promise((resolve) => {
    const srv = app.listen(0, () => {
      resolve({ server: srv, port: (srv.address() as { port: number }).port });
    });
  });
}

describe("GET /api/v1/workspaces", () => {
  let workspaceRoot: string;
  let server: http.Server;

  beforeEach(async () => {
    workspaceRoot = createTestDir("ws-inventory");
    await mkdir(workspaceRoot, { recursive: true });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("returns empty inventory when workspace root is empty", async () => {
    ({ server } = await startTestServer({
      orchestrator: makeOrchestrator() as never,
      configStore: makeConfigStore(workspaceRoot) as never,
    }));
    const res = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/workspaces`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.workspaces).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.active).toBe(0);
    expect(body.orphaned).toBe(0);
  });

  it("returns empty inventory when workspace root does not exist", async () => {
    const nonExistent = path.join(workspaceRoot, "nope");
    ({ server } = await startTestServer({
      orchestrator: makeOrchestrator() as never,
      configStore: makeConfigStore(nonExistent) as never,
    }));
    const res = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/workspaces`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.workspaces).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("classifies workspaces by orchestrator state", async () => {
    await mkdir(path.join(workspaceRoot, "NIN-1"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "NIN-2"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "NIN-3"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "NIN-4"), { recursive: true });
    await writeFile(path.join(workspaceRoot, "NIN-1", "file.txt"), "hello");

    ({ server } = await startTestServer({
      orchestrator: makeOrchestrator(
        [
          {
            issueId: "i1",
            identifier: "NIN-1",
            title: "Fix auth",
            state: "In Progress",
            workspaceKey: "NIN-1",
            status: "running",
          },
        ],
        [
          {
            issueId: "i2",
            identifier: "NIN-2",
            title: "Update docs",
            state: "In Progress",
            workspaceKey: "NIN-2",
            status: "retrying",
          },
        ],
        [
          {
            issueId: "i3",
            identifier: "NIN-3",
            title: "Add tests",
            state: "Done",
            workspaceKey: "NIN-3",
            status: "completed",
          },
        ],
      ) as never,
      configStore: makeConfigStore(workspaceRoot) as never,
    }));
    const res = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/workspaces`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.total).toBe(4);
    expect(body.active).toBe(2);
    expect(body.orphaned).toBe(1);

    const workspaces = body.workspaces as Array<Record<string, unknown>>;
    expect(workspaces).toHaveLength(4);

    const nin1 = workspaces.find((w) => w.workspace_key === "NIN-1");
    expect(nin1?.status).toBe("running");
    expect((nin1?.issue as Record<string, unknown>)?.identifier).toBe("NIN-1");
    expect(nin1?.disk_bytes).toBeGreaterThan(0);

    const nin4 = workspaces.find((w) => w.workspace_key === "NIN-4");
    expect(nin4?.status).toBe("orphaned");
    expect(nin4?.issue).toBeNull();
  });

  it("skips hidden directories (e.g. .base)", async () => {
    await mkdir(path.join(workspaceRoot, "NIN-1"), { recursive: true });
    await mkdir(path.join(workspaceRoot, ".base"), { recursive: true });

    ({ server } = await startTestServer({
      orchestrator: makeOrchestrator() as never,
      configStore: makeConfigStore(workspaceRoot) as never,
    }));
    const res = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/workspaces`);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.total).toBe(1);

    const workspaces = body.workspaces as Array<Record<string, unknown>>;
    expect(workspaces[0].workspace_key).toBe("NIN-1");
  });

  it("sorts running first, then retrying, completed, orphaned", async () => {
    await mkdir(path.join(workspaceRoot, "Z-ORPHAN"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "A-RETRY"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "B-RUN"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "C-DONE"), { recursive: true });

    ({ server } = await startTestServer({
      orchestrator: makeOrchestrator(
        [{ identifier: "B-RUN", title: "Run", state: "In Progress", workspaceKey: "B-RUN", status: "running" }],
        [{ identifier: "A-RETRY", title: "Retry", state: "In Progress", workspaceKey: "A-RETRY", status: "retrying" }],
        [{ identifier: "C-DONE", title: "Done", state: "Done", workspaceKey: "C-DONE", status: "completed" }],
      ) as never,
      configStore: makeConfigStore(workspaceRoot) as never,
    }));
    const res = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/workspaces`);
    const body = (await res.json()) as Record<string, unknown>;
    const workspaces = body.workspaces as Array<Record<string, unknown>>;

    expect(workspaces[0].status).toBe("running");
    expect(workspaces[1].status).toBe("retrying");
    expect(workspaces[2].status).toBe("completed");
    expect(workspaces[3].status).toBe("orphaned");
  });

  it("returns 503 when configStore is missing", async () => {
    ({ server } = await startTestServer({
      orchestrator: makeOrchestrator() as never,
    }));
    const res = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/workspaces`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect((body.error as Record<string, unknown>)?.code).toBe("config_unavailable");
  });
});

describe("DELETE /api/v1/workspaces/:workspace_key", () => {
  let workspaceRoot: string;
  let server: http.Server;

  beforeEach(async () => {
    workspaceRoot = createTestDir("ws-delete");
    await mkdir(workspaceRoot, { recursive: true });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("removes an orphaned workspace directory", async () => {
    await mkdir(path.join(workspaceRoot, "NIN-1"), { recursive: true });
    await writeFile(path.join(workspaceRoot, "NIN-1", "file.txt"), "hello");

    ({ server } = await startTestServer({
      orchestrator: makeOrchestrator() as never,
      configStore: makeConfigStore(workspaceRoot) as never,
    }));
    const port = (server.address() as { port: number }).port;

    const res = await fetch(`http://127.0.0.1:${port}/api/v1/workspaces/NIN-1`, { method: "DELETE" });
    expect(res.status).toBe(204);

    const checkRes = await fetch(`http://127.0.0.1:${port}/api/v1/workspaces`);
    const body = (await checkRes.json()) as Record<string, unknown>;
    expect(body.total).toBe(0);
  });

  it("returns 404 for non-existent workspace", async () => {
    ({ server } = await startTestServer({
      orchestrator: makeOrchestrator() as never,
      configStore: makeConfigStore(workspaceRoot) as never,
    }));
    const port = (server.address() as { port: number }).port;

    const res = await fetch(`http://127.0.0.1:${port}/api/v1/workspaces/nonexistent`, { method: "DELETE" });
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect((body.error as Record<string, unknown>)?.code).toBe("not_found");
  });

  it("returns 409 when removing a running workspace", async () => {
    await mkdir(path.join(workspaceRoot, "NIN-1"), { recursive: true });

    ({ server } = await startTestServer({
      orchestrator: makeOrchestrator([
        { identifier: "NIN-1", title: "Run", state: "In Progress", workspaceKey: "NIN-1", status: "running" },
      ]) as never,
      configStore: makeConfigStore(workspaceRoot) as never,
    }));
    const port = (server.address() as { port: number }).port;

    const res = await fetch(`http://127.0.0.1:${port}/api/v1/workspaces/NIN-1`, { method: "DELETE" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect((body.error as Record<string, unknown>)?.code).toBe("conflict");
  });
});
