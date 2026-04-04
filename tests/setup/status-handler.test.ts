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

import { handleGetStatus } from "../../src/setup/handlers/status.js";
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

describe("handleGetStatus", () => {
  it("returns all steps as incomplete when nothing is configured", () => {
    const deps = makeDeps();
    const handler = handleGetStatus(deps);
    const res = makeMockResponse();

    handler({} as Request, res);

    expect(res._status).toBe(200);
    expect(res._body).toEqual({
      configured: false,
      steps: {
        masterKey: { done: false },
        linearProject: { done: false },
        repoRoute: { done: false },
        openaiKey: { done: false },
        githubToken: { done: false },
      },
    });
  });

  it("marks masterKey as done when secretsStore is initialized", () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "isInitialized").mockReturnValue(true);
    const deps = makeDeps({ secretsStore });
    const handler = handleGetStatus(deps);
    const res = makeMockResponse();

    handler({} as Request, res);

    expect(res._body).toMatchObject({
      steps: { masterKey: { done: true } },
    });
  });

  it("marks linearProject as done when tracker.project_slug is in the overlay", () => {
    const configOverlayStore = createConfigOverlayStoreMock();
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({ "tracker.project_slug": "risoluto" });
    const deps = makeDeps({ configOverlayStore });
    const handler = handleGetStatus(deps);
    const res = makeMockResponse();

    handler({} as Request, res);

    expect(res._body).toMatchObject({
      steps: { linearProject: { done: true } },
    });
  });

  it("keeps linearProject incomplete when only LINEAR_API_KEY is present", () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "LINEAR_API_KEY" ? "lin_key" : null));
    const deps = makeDeps({ secretsStore });
    const handler = handleGetStatus(deps);
    const res = makeMockResponse();

    handler({} as Request, res);

    expect(res._body).toMatchObject({
      steps: { linearProject: { done: false } },
    });
  });

  it("marks openaiKey as done when OPENAI_API_KEY is in secrets store", () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "OPENAI_API_KEY" ? "sk-test" : null));
    const deps = makeDeps({ secretsStore });
    const handler = handleGetStatus(deps);
    const res = makeMockResponse();

    handler({} as Request, res);

    expect(res._body).toMatchObject({
      steps: { openaiKey: { done: true } },
    });
  });

  it("marks openaiKey as done when OPENAI_API_KEY is in env", () => {
    process.env.OPENAI_API_KEY = "sk-env";
    const deps = makeDeps();
    const handler = handleGetStatus(deps);
    const res = makeMockResponse();

    handler({} as Request, res);

    expect(res._body).toMatchObject({
      steps: { openaiKey: { done: true } },
    });
  });

  it("marks openaiKey as done when codex auth.json file exists", () => {
    mocks.existsSyncMock.mockReturnValue(true);
    const deps = makeDeps();
    const handler = handleGetStatus(deps);
    const res = makeMockResponse();

    handler({} as Request, res);

    expect(res._body).toMatchObject({
      steps: { openaiKey: { done: true } },
    });
    expect(mocks.existsSyncMock).toHaveBeenCalledWith("/archive-root/codex-auth/auth.json");
  });

  it("marks githubToken as done when GITHUB_TOKEN is in secrets store", () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "GITHUB_TOKEN" ? "ghp_test" : null));
    const deps = makeDeps({ secretsStore });
    const handler = handleGetStatus(deps);
    const res = makeMockResponse();

    handler({} as Request, res);

    expect(res._body).toMatchObject({
      steps: { githubToken: { done: true } },
    });
  });

  it("marks githubToken as done when GITHUB_TOKEN is in env", () => {
    process.env.GITHUB_TOKEN = "ghp_env";
    const deps = makeDeps();
    const handler = handleGetStatus(deps);
    const res = makeMockResponse();

    handler({} as Request, res);

    expect(res._body).toMatchObject({
      steps: { githubToken: { done: true } },
    });
  });

  it("marks repoRoute as done when repos array is present in overlay", () => {
    const configOverlayStore = createConfigOverlayStoreMock();
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({ repos: [{ url: "https://github.com/test/repo" }] });
    const deps = makeDeps({ configOverlayStore });
    const handler = handleGetStatus(deps);
    const res = makeMockResponse();

    handler({} as Request, res);

    expect(res._body).toMatchObject({
      steps: { repoRoute: { done: true } },
    });
  });

  it("sets configured to true only when both masterKey and linearProject are done", () => {
    const secretsStore = createSecretsStoreMock();
    const configOverlayStore = createConfigOverlayStoreMock();
    vi.spyOn(secretsStore, "isInitialized").mockReturnValue(true);
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({ "tracker.project_slug": "risoluto" });
    const deps = makeDeps({ secretsStore, configOverlayStore });
    const handler = handleGetStatus(deps);
    const res = makeMockResponse();

    handler({} as Request, res);

    expect(res._body).toMatchObject({ configured: true });
  });

  it("sets configured to false when masterKey is done but linearProject is not", () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "isInitialized").mockReturnValue(true);
    const deps = makeDeps({ secretsStore });
    const handler = handleGetStatus(deps);
    const res = makeMockResponse();

    handler({} as Request, res);

    expect(res._body).toMatchObject({ configured: false });
  });
});
