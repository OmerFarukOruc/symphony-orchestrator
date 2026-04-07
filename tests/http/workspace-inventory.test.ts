import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import http from "node:http";
import { mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Request, Response } from "express";

import {
  handleWorkspaceInventory,
  handleWorkspaceRemove,
  type WorkspaceInventoryDeps,
} from "../../src/http/workspace-inventory.js";
import { withWorkspaceLifecycleLock } from "../../src/workspace/lifecycle-lock.js";

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

function makeJsonResponse(): Response & {
  _status: number;
  _body: unknown;
  _ended: boolean;
} {
  const response = {
    _status: 200,
    _body: undefined as unknown,
    _ended: false,
    status(code: number) {
      response._status = code;
      return response;
    },
    json(body: unknown) {
      response._body = body;
      return response;
    },
    end() {
      response._ended = true;
      return response;
    },
  };
  return response as unknown as Response & { _status: number; _body: unknown; _ended: boolean };
}

async function loadWorkspaceInventoryModuleWithFsMocks(options?: {
  readdirImpl?: typeof readdir;
  statImpl?: (typeof import("node:fs/promises"))["stat"];
  rmImpl?: (typeof import("node:fs/promises"))["rm"];
}) {
  vi.resetModules();

  const readdirMock = vi.fn(options?.readdirImpl);
  const statMock = vi.fn(options?.statImpl);
  const rmMock = vi.fn(options?.rmImpl);
  const withWorkspaceLifecycleLockMock = vi.fn(async (_workspaceKey: string, task: () => Promise<void>) => {
    await task();
  });

  vi.doMock("node:fs/promises", () => ({
    readdir: readdirMock,
    stat: statMock,
    rm: rmMock,
  }));
  vi.doMock("../../src/workspace/lifecycle-lock.js", () => ({
    withWorkspaceLifecycleLock: withWorkspaceLifecycleLockMock,
  }));

  const module = await import("../../src/http/workspace-inventory.js");
  return {
    handleWorkspaceInventory: module.handleWorkspaceInventory,
    handleWorkspaceRemove: module.handleWorkspaceRemove,
    readdirMock,
    statMock,
    rmMock,
    withWorkspaceLifecycleLockMock,
  };
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

  it("counts nested files but skips symbolic links when calculating disk usage", async () => {
    await mkdir(path.join(workspaceRoot, "NIN-1", "nested"), { recursive: true });
    await writeFile(path.join(workspaceRoot, "NIN-1", "root.txt"), "root");
    await writeFile(path.join(workspaceRoot, "NIN-1", "nested", "child.txt"), "child");
    await symlink(
      path.join(workspaceRoot, "NIN-1", "nested", "child.txt"),
      path.join(workspaceRoot, "NIN-1", "linked.txt"),
    );

    ({ server } = await startTestServer({
      orchestrator: makeOrchestrator([
        { identifier: "NIN-1", title: "Run", state: "In Progress", workspaceKey: "NIN-1", status: "running" },
      ]) as never,
      configStore: makeConfigStore(workspaceRoot) as never,
    }));

    const res = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/workspaces`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const workspaces = body.workspaces as Array<Record<string, unknown>>;
    const nin1 = workspaces.find((workspace) => workspace.workspace_key === "NIN-1");

    expect(nin1?.disk_bytes).toBe(9);
    expect(nin1?.last_modified_at).toEqual(expect.any(String));
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

  it("prioritizes status order even when filesystem order would differ", async () => {
    await mkdir(path.join(workspaceRoot, "A-ORPHAN"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "B-DONE"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "C-RETRY"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "D-RUN"), { recursive: true });

    ({ server } = await startTestServer({
      orchestrator: makeOrchestrator(
        [{ identifier: "D-RUN", title: "Run", state: "In Progress", workspaceKey: "D-RUN", status: "running" }],
        [{ identifier: "C-RETRY", title: "Retry", state: "In Progress", workspaceKey: "C-RETRY", status: "retrying" }],
        [{ identifier: "B-DONE", title: "Done", state: "Done", workspaceKey: "B-DONE", status: "completed" }],
      ) as never,
      configStore: makeConfigStore(workspaceRoot) as never,
    }));
    const res = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/workspaces`);
    const body = (await res.json()) as Record<string, unknown>;
    const workspaces = body.workspaces as Array<Record<string, unknown>>;

    expect(workspaces.map((workspace) => workspace.workspace_key)).toEqual(["D-RUN", "C-RETRY", "B-DONE", "A-ORPHAN"]);
  });

  it("returns 503 when configStore is missing", async () => {
    ({ server } = await startTestServer({
      orchestrator: makeOrchestrator() as never,
    }));
    const res = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/workspaces`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toEqual({
      code: "config_unavailable",
      message: "Workspace config not available",
    });
  });

  it("falls back to the default strategy when workspace strategy is missing", async () => {
    await mkdir(path.join(workspaceRoot, "NIN-1"), { recursive: true });
    const configStore = {
      getConfig: vi.fn().mockReturnValue({
        workspace: { root: workspaceRoot },
      }),
    };

    ({ server } = await startTestServer({
      orchestrator: makeOrchestrator() as never,
      configStore: configStore as never,
    }));

    const res = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/workspaces`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const workspaces = body.workspaces as Array<Record<string, unknown>>;
    expect(workspaces[0]?.strategy).toBe("directory");
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

  it("returns 409 when removing a retrying workspace", async () => {
    await mkdir(path.join(workspaceRoot, "NIN-2"), { recursive: true });

    ({ server } = await startTestServer({
      orchestrator: makeOrchestrator(
        [],
        [{ identifier: "NIN-2", title: "Retry", state: "In Progress", workspaceKey: "NIN-2", status: "retrying" }],
      ) as never,
      configStore: makeConfigStore(workspaceRoot) as never,
    }));
    const port = (server.address() as { port: number }).port;

    const res = await fetch(`http://127.0.0.1:${port}/api/v1/workspaces/NIN-2`, { method: "DELETE" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect((body.error as Record<string, unknown>)?.message).toBe("Cannot remove an active workspace");
  });

  it("returns 404 when the workspace path exists but is not a directory", async () => {
    await writeFile(path.join(workspaceRoot, "NIN-file"), "hello");

    ({ server } = await startTestServer({
      orchestrator: makeOrchestrator() as never,
      configStore: makeConfigStore(workspaceRoot) as never,
    }));
    const port = (server.address() as { port: number }).port;

    const res = await fetch(`http://127.0.0.1:${port}/api/v1/workspaces/NIN-file`, { method: "DELETE" });
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toEqual({ code: "not_found", message: "Workspace not found" });
  });

  it("waits for the workspace lifecycle lock before deleting", async () => {
    await mkdir(path.join(workspaceRoot, "NIN-1"), { recursive: true });
    await writeFile(path.join(workspaceRoot, "NIN-1", "file.txt"), "hello");

    ({ server } = await startTestServer({
      orchestrator: makeOrchestrator() as never,
      configStore: makeConfigStore(workspaceRoot) as never,
    }));
    const port = (server.address() as { port: number }).port;

    let releaseLock: (() => void) | null = null;
    const holdLock = withWorkspaceLifecycleLock("NIN-1", async () => {
      await new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    const deletePromise = fetch(`http://127.0.0.1:${port}/api/v1/workspaces/NIN-1`, { method: "DELETE" });
    await new Promise((resolve) => setTimeout(resolve, 10));

    const entriesBeforeRelease = await readdir(workspaceRoot);
    expect(entriesBeforeRelease).toContain("NIN-1");

    releaseLock?.();
    await holdLock;

    const res = await deletePromise;
    expect(res.status).toBe(204);
  });
});

describe("workspace inventory direct handler guards", () => {
  it("rejects missing workspace_key parameters", async () => {
    const response = makeJsonResponse();

    await handleWorkspaceRemove(
      {
        orchestrator: makeOrchestrator() as never,
        configStore: makeConfigStore("/tmp") as never,
      },
      { params: { workspace_key: "" } } as unknown as Request,
      response,
    );

    expect(response._status).toBe(400);
    expect(response._body).toEqual({
      error: { code: "bad_request", message: "Missing workspace_key parameter" },
    });
  });

  it("rejects invalid workspace keys that escape the workspace root", async () => {
    const response = makeJsonResponse();

    await handleWorkspaceRemove(
      {
        orchestrator: makeOrchestrator() as never,
        configStore: makeConfigStore("/tmp/risoluto-root") as never,
      },
      { params: { workspace_key: "../escape" } } as unknown as Request,
      response,
    );

    expect(response._status).toBe(400);
    expect(response._body).toEqual({
      error: { code: "bad_request", message: "Invalid workspace key" },
    });
  });

  it("rejects workspace keys that resolve to the workspace root itself", async () => {
    const response = makeJsonResponse();

    await handleWorkspaceRemove(
      {
        orchestrator: makeOrchestrator() as never,
        configStore: makeConfigStore("/tmp/risoluto-root") as never,
      },
      { params: { workspace_key: "." } } as unknown as Request,
      response,
    );

    expect(response._status).toBe(400);
    expect(response._body).toEqual({
      error: { code: "bad_request", message: "Invalid workspace key" },
    });
  });

  it("returns config_unavailable for delete requests when workspace config is missing", async () => {
    const response = makeJsonResponse();

    await handleWorkspaceRemove(
      {
        orchestrator: makeOrchestrator() as never,
      },
      { params: { workspace_key: "NIN-1" } } as unknown as Request,
      response,
    );

    expect(response._status).toBe(503);
    expect(response._body).toEqual({
      error: { code: "config_unavailable", message: "Workspace config not available" },
    });
  });

  it("does not treat non-matching running or retrying workspaces as active", async () => {
    const root = createTestDir("ws-direct-delete");
    await mkdir(path.join(root, "NIN-1"), { recursive: true });
    const response = makeJsonResponse();

    try {
      await handleWorkspaceRemove(
        {
          orchestrator: makeOrchestrator(
            [{ identifier: "OTHER", title: "Other", state: "In Progress", workspaceKey: "OTHER", status: "running" }],
            [{ identifier: "RETRY", title: "Retry", state: "In Progress", workspaceKey: "RETRY", status: "retrying" }],
          ) as never,
          configStore: makeConfigStore(root) as never,
        },
        { params: { workspace_key: "NIN-1" } } as unknown as Request,
        response,
      );

      expect(response._status).toBe(204);
      expect(response._ended).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rethrows non-ENOENT inventory read errors", async () => {
    const error = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const { handleWorkspaceInventory } = await loadWorkspaceInventoryModuleWithFsMocks({
      readdirImpl: vi.fn().mockRejectedValue(error) as never,
    });

    await expect(
      handleWorkspaceInventory(
        {
          orchestrator: makeOrchestrator() as never,
          configStore: makeConfigStore("/tmp/risoluto-root") as never,
        },
        {} as Request,
        makeJsonResponse(),
      ),
    ).rejects.toBe(error);
  });

  it("ignores non-file and non-directory entries when calculating disk usage", async () => {
    const root = "/tmp/risoluto-root";
    const oddEntry = {
      name: "socket",
      isDirectory: () => false,
      isFile: () => false,
      isSymbolicLink: () => false,
    };
    const { handleWorkspaceInventory, statMock } = await loadWorkspaceInventoryModuleWithFsMocks({
      readdirImpl: vi.fn(async (targetPath: string) => {
        if (targetPath === root) {
          return [
            {
              name: "NIN-1",
              isDirectory: () => true,
              isFile: () => false,
              isSymbolicLink: () => false,
            },
          ];
        }

        if (targetPath === path.join(root, "NIN-1")) {
          return [oddEntry];
        }

        return [];
      }) as never,
      statImpl: vi
        .fn()
        .mockResolvedValue({ size: 99, mtime: new Date("2024-01-01T00:00:00.000Z"), isDirectory: () => true }) as never,
    });
    const response = makeJsonResponse();

    await handleWorkspaceInventory(
      {
        orchestrator: makeOrchestrator() as never,
        configStore: makeConfigStore(root) as never,
      },
      {} as Request,
      response,
    );

    expect(response._status).toBe(200);
    expect(response._body).toEqual({
      workspaces: [
        {
          workspace_key: "NIN-1",
          path: path.join(root, "NIN-1"),
          status: "orphaned",
          strategy: "directory",
          issue: null,
          disk_bytes: 0,
          last_modified_at: "2024-01-01T00:00:00.000Z",
        },
      ],
      generated_at: expect.any(String),
      total: 1,
      active: 0,
      orphaned: 1,
    });
    expect(statMock).toHaveBeenCalledTimes(1);
    expect(statMock).toHaveBeenCalledWith(path.join(root, "NIN-1"));
  });

  it("rethrows non-ENOENT workspace stat errors during delete", async () => {
    const error = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const { handleWorkspaceRemove } = await loadWorkspaceInventoryModuleWithFsMocks({
      statImpl: vi.fn().mockRejectedValue(error) as never,
    });

    await expect(
      handleWorkspaceRemove(
        {
          orchestrator: makeOrchestrator() as never,
          configStore: makeConfigStore("/tmp/risoluto-root") as never,
        },
        { params: { workspace_key: "NIN-1" } } as unknown as Request,
        makeJsonResponse(),
      ),
    ).rejects.toBe(error);
  });

  it("returns the exact not_found payload when workspace stat reports ENOENT during delete", async () => {
    const { handleWorkspaceRemove, rmMock } = await loadWorkspaceInventoryModuleWithFsMocks({
      statImpl: vi.fn().mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" })) as never,
      rmImpl: vi.fn().mockResolvedValue(undefined) as never,
    });
    const response = makeJsonResponse();

    await handleWorkspaceRemove(
      {
        orchestrator: makeOrchestrator() as never,
        configStore: makeConfigStore("/tmp/risoluto-root") as never,
      },
      { params: { workspace_key: "NIN-1" } } as unknown as Request,
      response,
    );

    expect(response._status).toBe(404);
    expect(response._body).toEqual({
      error: { code: "not_found", message: "Workspace not found" },
    });
    expect(rmMock).not.toHaveBeenCalled();
  });

  it("removes inactive workspaces with recursive force enabled", async () => {
    const { handleWorkspaceRemove, rmMock, statMock } = await loadWorkspaceInventoryModuleWithFsMocks({
      statImpl: vi.fn().mockResolvedValue({ isDirectory: () => true }) as never,
      rmImpl: vi.fn().mockResolvedValue(undefined) as never,
    });
    const response = makeJsonResponse();

    await handleWorkspaceRemove(
      {
        orchestrator: {
          getSnapshot: vi.fn().mockReturnValue({
            running: [],
            retrying: undefined,
          }),
        } as never,
        configStore: makeConfigStore("/tmp/risoluto-root") as never,
      },
      { params: { workspace_key: "NIN-1" } } as unknown as Request,
      response,
    );

    expect(statMock).toHaveBeenCalledWith("/tmp/risoluto-root/NIN-1");
    expect(rmMock).toHaveBeenCalledWith("/tmp/risoluto-root/NIN-1", { recursive: true, force: true });
    expect(response._status).toBe(204);
    expect(response._ended).toBe(true);
  });
});
