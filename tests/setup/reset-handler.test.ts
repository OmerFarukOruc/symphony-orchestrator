import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Request } from "express";

import {
  type HoistedMocks,
  createSecretsStoreMock,
  createConfigOverlayStoreMock,
  createOrchestratorMock,
  setupBeforeEach,
  setupAfterEach,
} from "./setup-fixtures.js";
import { makeMockResponse } from "../helpers.js";

/* ── hoisted mocks ────────────────────────────────────────────────── */

const mocks = vi.hoisted(() => ({
  existsSyncMock: vi.fn<(filePath: string) => boolean>(),
  mkdirMock: vi.fn<(filePath: string, options?: { recursive?: boolean }) => Promise<void>>(),
  writeFileMock:
    vi.fn<(filePath: string, data: string, options?: { encoding?: BufferEncoding; mode?: number }) => Promise<void>>(),
  startDeviceAuthMock: vi.fn(),
  pollDeviceAuthMock: vi.fn(),
  saveDeviceAuthTokensMock: vi.fn(),
})) satisfies HoistedMocks;

vi.mock("node:fs", () => ({ existsSync: mocks.existsSyncMock }));
vi.mock("node:fs/promises", () => ({ mkdir: mocks.mkdirMock, writeFile: mocks.writeFileMock }));
vi.mock("../../src/setup/device-auth.js", () => ({
  startDeviceAuth: mocks.startDeviceAuthMock,
  pollDeviceAuth: mocks.pollDeviceAuthMock,
  saveDeviceAuthTokens: mocks.saveDeviceAuthTokensMock,
}));

import { handlePostReset } from "../../src/setup/handlers/reset.js";
import type { SetupApiDeps } from "../../src/setup/handlers/shared.js";

beforeEach(() => setupBeforeEach(mocks));
afterEach(setupAfterEach);

/* ── helpers ──────────────────────────────────────────────────────── */

function makeDeps(overrides: Partial<SetupApiDeps> = {}): SetupApiDeps {
  return {
    secretsStore: createSecretsStoreMock(),
    configOverlayStore: createConfigOverlayStoreMock(),
    orchestrator: createOrchestratorMock(),
    archiveDir: "/archive-root",
    ...overrides,
  };
}

/* ── tests ────────────────────────────────────────────────────────── */

describe("handlePostReset", () => {
  it("stops orchestrator, deletes all secrets, resets config, and clears master key", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "reset").mockReturnValue(undefined);
    const configOverlayStore = createConfigOverlayStoreMock();
    const orchestrator = createOrchestratorMock();
    vi.spyOn(secretsStore, "list").mockReturnValue(["LINEAR_API_KEY", "OPENAI_API_KEY"]);

    const deps = makeDeps({ secretsStore, configOverlayStore, orchestrator });
    const handler = handlePostReset(deps);
    const res = makeMockResponse();

    await handler({} as Request, res);

    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
    expect(orchestrator.stop).toHaveBeenCalledOnce();
    expect(secretsStore.delete).toHaveBeenCalledTimes(2);
    expect(secretsStore.delete).toHaveBeenCalledWith("LINEAR_API_KEY");
    expect(secretsStore.delete).toHaveBeenCalledWith("OPENAI_API_KEY");
    expect(configOverlayStore.set).toHaveBeenCalledWith("codex.auth.mode", "");
    expect(configOverlayStore.set).toHaveBeenCalledWith("codex.auth.source_home", "");
    expect(configOverlayStore.delete).toHaveBeenCalledWith("codex.provider");
    expect(mocks.writeFileMock).toHaveBeenCalledWith("/archive-root/master.key", "", {
      encoding: "utf8",
      mode: 0o600,
    });
    expect(secretsStore.reset).toHaveBeenCalledOnce();
  });

  it("works when secrets store has no secrets to delete", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "list").mockReturnValue([]);
    const deps = makeDeps({ secretsStore });
    const handler = handlePostReset(deps);
    const res = makeMockResponse();

    await handler({} as Request, res);

    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
    expect(secretsStore.delete).not.toHaveBeenCalled();
  });

  it("calls orchestrator.stop before deleting secrets", async () => {
    const callOrder: string[] = [];
    const orchestrator = createOrchestratorMock();
    vi.spyOn(orchestrator, "stop").mockImplementation(async () => {
      callOrder.push("stop");
    });
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "list").mockReturnValue(["KEY_A"]);
    vi.spyOn(secretsStore, "delete").mockImplementation(async () => {
      callOrder.push("delete");
      return true;
    });

    const deps = makeDeps({ secretsStore, orchestrator });
    const handler = handlePostReset(deps);
    const res = makeMockResponse();

    await handler({} as Request, res);

    expect(callOrder[0]).toBe("stop");
    expect(callOrder).toContain("delete");
  });

  it("returns 500 with reset_failed when orchestrator.stop throws", async () => {
    const orchestrator = createOrchestratorMock();
    vi.spyOn(orchestrator, "stop").mockRejectedValueOnce(new Error("stop failed"));
    const deps = makeDeps({ orchestrator });
    const handler = handlePostReset(deps);
    const res = makeMockResponse();

    await handler({} as Request, res);

    expect(res._status).toBe(500);
    expect(res._body).toEqual({
      error: { code: "reset_failed", message: "stop failed" },
    });
  });

  it("returns 500 with reset_failed when secret deletion throws", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "list").mockReturnValue(["BROKEN_KEY"]);
    vi.spyOn(secretsStore, "delete").mockRejectedValueOnce(new Error("delete boom"));
    const deps = makeDeps({ secretsStore });
    const handler = handlePostReset(deps);
    const res = makeMockResponse();

    await handler({} as Request, res);

    expect(res._status).toBe(500);
    expect(res._body).toEqual({
      error: { code: "reset_failed", message: "delete boom" },
    });
  });

  it("returns 500 with reset_failed when writeFile throws", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "list").mockReturnValue([]);
    mocks.writeFileMock.mockRejectedValueOnce(new Error("write failed"));
    const deps = makeDeps({ secretsStore });
    const handler = handlePostReset(deps);
    const res = makeMockResponse();

    await handler({} as Request, res);

    expect(res._status).toBe(500);
    expect(res._body).toEqual({
      error: { code: "reset_failed", message: "write failed" },
    });
  });

  it("uses fallback message when error is not an Error instance", async () => {
    const orchestrator = createOrchestratorMock();
    vi.spyOn(orchestrator, "stop").mockRejectedValueOnce("string-error");
    const deps = makeDeps({ orchestrator });
    const handler = handlePostReset(deps);
    const res = makeMockResponse();

    await handler({} as Request, res);

    expect(res._status).toBe(500);
    expect(res._body).toEqual({
      error: { code: "reset_failed", message: "Failed to reset configuration" },
    });
  });

  it("calls secretsStore.reset after all parallel cleanup completes", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "reset").mockReturnValue(undefined);
    vi.spyOn(secretsStore, "list").mockReturnValue([]);
    const deps = makeDeps({ secretsStore });
    const handler = handlePostReset(deps);
    const res = makeMockResponse();

    await handler({} as Request, res);

    expect(secretsStore.reset).toHaveBeenCalledOnce();
  });
});
