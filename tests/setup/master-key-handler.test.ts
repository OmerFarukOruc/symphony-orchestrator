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

import { handlePostMasterKey } from "../../src/setup/handlers/master-key.js";
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

function makeRequest(body: unknown = {}): Request {
  return { body } as Request;
}

/* ── tests ────────────────────────────────────────────────────────── */

describe("handlePostMasterKey", () => {
  it("generates a random key when no key is provided in the body", async () => {
    const deps = makeDeps();
    const handler = handlePostMasterKey(deps);
    const res = makeMockResponse();

    await handler(makeRequest({}), res);

    expect(res._status).toBe(200);
    const body = res._body as { key: string };
    expect(body.key).toMatch(/^[a-f0-9]{64}$/u);
    expect(mocks.mkdirMock).toHaveBeenCalledWith("/archive-root", { recursive: true });
    expect(mocks.writeFileMock).toHaveBeenCalledWith("/archive-root/master.key", body.key, {
      encoding: "utf8",
      mode: 0o600,
    });
    expect(deps.secretsStore.initializeWithKey).toHaveBeenCalledWith(body.key);
  });

  it("uses a provided key when given in the request body", async () => {
    const deps = makeDeps();
    const handler = handlePostMasterKey(deps);
    const res = makeMockResponse();

    await handler(makeRequest({ key: "my-custom-key-1234" }), res);

    expect(res._status).toBe(200);
    expect(res._body).toEqual({ key: "my-custom-key-1234" });
    expect(mocks.writeFileMock).toHaveBeenCalledWith("/archive-root/master.key", "my-custom-key-1234", {
      encoding: "utf8",
      mode: 0o600,
    });
    expect(deps.secretsStore.initializeWithKey).toHaveBeenCalledWith("my-custom-key-1234");
  });

  it("returns 409 when secrets store is already initialized", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "isInitialized").mockReturnValue(true);
    const deps = makeDeps({ secretsStore });
    const handler = handlePostMasterKey(deps);
    const res = makeMockResponse();

    await handler(makeRequest({ key: "some-key" }), res);

    expect(res._status).toBe(409);
    expect(res._body).toEqual({
      error: { code: "already_initialized", message: "Master key is already set" },
    });
    expect(mocks.writeFileMock).not.toHaveBeenCalled();
    expect(secretsStore.initializeWithKey).not.toHaveBeenCalled();
  });

  it("returns 500 when mkdir fails", async () => {
    mocks.mkdirMock.mockRejectedValueOnce(new Error("permission denied"));
    const deps = makeDeps();
    const handler = handlePostMasterKey(deps);
    const res = makeMockResponse();

    await handler(makeRequest({ key: "test-key" }), res);

    expect(res._status).toBe(500);
    expect(res._body).toEqual({
      error: { code: "setup_error", message: "permission denied" },
    });
  });

  it("returns 500 when writeFile fails", async () => {
    mocks.writeFileMock.mockRejectedValueOnce(new Error("disk full"));
    const deps = makeDeps();
    const handler = handlePostMasterKey(deps);
    const res = makeMockResponse();

    await handler(makeRequest({ key: "test-key" }), res);

    expect(res._status).toBe(500);
    expect(res._body).toEqual({
      error: { code: "setup_error", message: "disk full" },
    });
  });

  it("returns 500 when initializeWithKey fails", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "initializeWithKey").mockRejectedValueOnce(new Error("crypto error"));
    const deps = makeDeps({ secretsStore });
    const handler = handlePostMasterKey(deps);
    const res = makeMockResponse();

    await handler(makeRequest({ key: "test-key" }), res);

    expect(res._status).toBe(500);
    expect(res._body).toEqual({
      error: { code: "setup_error", message: "crypto error" },
    });
  });

  it("generates a random key when body.key is not a string", async () => {
    const deps = makeDeps();
    const handler = handlePostMasterKey(deps);
    const res = makeMockResponse();

    await handler(makeRequest({ key: 42 }), res);

    expect(res._status).toBe(200);
    const body = res._body as { key: string };
    expect(body.key).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("generates a random key when body.key is an empty string", async () => {
    const deps = makeDeps();
    const handler = handlePostMasterKey(deps);
    const res = makeMockResponse();

    await handler(makeRequest({ key: "" }), res);

    expect(res._status).toBe(200);
    const body = res._body as { key: string };
    expect(body.key).toMatch(/^[a-f0-9]{64}$/u);
  });
});
