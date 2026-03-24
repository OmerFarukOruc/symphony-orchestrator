import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createConfigOverlayStoreMock,
  postJson,
  setupAfterEach,
  setupBeforeEach,
  startSetupApiServer,
  type HoistedMocks,
} from "./setup-fixtures.js";

const mocks: HoistedMocks = vi.hoisted(() => ({
  existsSyncMock: vi.fn<(filePath: string) => boolean>(),
  mkdirMock: vi.fn<(filePath: string, options?: { recursive?: boolean }) => Promise<void>>(),
  writeFileMock:
    vi.fn<(filePath: string, data: string, options?: { encoding?: BufferEncoding; mode?: number }) => Promise<void>>(),
  startDeviceAuthMock: vi.fn(),
  pollDeviceAuthMock: vi.fn(),
  saveDeviceAuthTokensMock: vi.fn(),
}));

vi.mock("node:fs", () => ({ existsSync: mocks.existsSyncMock }));
vi.mock("node:fs/promises", () => ({ mkdir: mocks.mkdirMock, writeFile: mocks.writeFileMock }));
vi.mock("../../src/setup/device-auth.js", () => ({
  startDeviceAuth: mocks.startDeviceAuthMock,
  pollDeviceAuth: mocks.pollDeviceAuthMock,
  saveDeviceAuthTokens: mocks.saveDeviceAuthTokensMock,
}));

beforeEach(() => setupBeforeEach(mocks));
afterEach(setupAfterEach);

describe("repo route handlers", () => {
  it("GET returns empty routes when no repos configured", async () => {
    const { baseUrl } = await startSetupApiServer();

    const response = await fetch(`${baseUrl}/api/v1/setup/repo-routes`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ routes: [] });
  });

  it("POST saves a new route to the overlay", async () => {
    const configOverlayStore = createConfigOverlayStoreMock();
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({});

    const { baseUrl } = await startSetupApiServer({ configOverlayStore });
    const response = await postJson(baseUrl, "/api/v1/setup/repo-route", {
      repoUrl: "https://github.com/org/repo",
      defaultBranch: "main",
      identifierPrefix: "NIN",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.route).toEqual({
      repo_url: "https://github.com/org/repo",
      default_branch: "main",
      identifier_prefix: "NIN",
    });
    expect(configOverlayStore.set).toHaveBeenCalledWith("repos", [
      {
        repo_url: "https://github.com/org/repo",
        default_branch: "main",
        identifier_prefix: "NIN",
      },
    ]);
  });

  it("POST with same prefix replaces existing route", async () => {
    const configOverlayStore = createConfigOverlayStoreMock();
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({
      repos: [{ repo_url: "https://github.com/org/old-repo", default_branch: "main", identifier_prefix: "NIN" }],
    });

    const { baseUrl } = await startSetupApiServer({ configOverlayStore });
    const response = await postJson(baseUrl, "/api/v1/setup/repo-route", {
      repoUrl: "https://github.com/org/new-repo",
      defaultBranch: "develop",
      identifierPrefix: "NIN",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.route.repo_url).toBe("https://github.com/org/new-repo");
    expect(configOverlayStore.set).toHaveBeenCalledWith("repos", [
      {
        repo_url: "https://github.com/org/new-repo",
        default_branch: "develop",
        identifier_prefix: "NIN",
      },
    ]);
  });

  it("POST validates repo URL format", async () => {
    const { baseUrl } = await startSetupApiServer();

    const response = await postJson(baseUrl, "/api/v1/setup/repo-route", {
      repoUrl: "not-a-valid-url",
      identifierPrefix: "NIN",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_repo_url",
        message: "repoUrl must be a valid GitHub URL (https://github.com/org/repo)",
      },
    });
  });

  it("POST requires identifierPrefix", async () => {
    const { baseUrl } = await startSetupApiServer();

    const response = await postJson(baseUrl, "/api/v1/setup/repo-route", {
      repoUrl: "https://github.com/org/repo",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "missing_prefix",
        message: "identifierPrefix is required",
      },
    });
  });

  it("DELETE removes route by index", async () => {
    const configOverlayStore = createConfigOverlayStoreMock();
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({
      repos: [
        { repo_url: "https://github.com/org/repo1", default_branch: "main", identifier_prefix: "AAA" },
        { repo_url: "https://github.com/org/repo2", default_branch: "main", identifier_prefix: "BBB" },
      ],
    });

    const { baseUrl } = await startSetupApiServer({ configOverlayStore });
    const response = await fetch(`${baseUrl}/api/v1/setup/repo-route`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index: 0 }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.routes).toEqual([
      { repo_url: "https://github.com/org/repo2", default_branch: "main", identifier_prefix: "BBB" },
    ]);
    expect(configOverlayStore.set).toHaveBeenCalledWith("repos", [
      { repo_url: "https://github.com/org/repo2", default_branch: "main", identifier_prefix: "BBB" },
    ]);
  });

  it("DELETE rejects invalid index", async () => {
    const configOverlayStore = createConfigOverlayStoreMock();
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({ repos: [] });

    const { baseUrl } = await startSetupApiServer({ configOverlayStore });
    const response = await fetch(`${baseUrl}/api/v1/setup/repo-route`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index: 5 }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "invalid_index", message: "index must be between 0 and -1" },
    });
  });

  it("GET returns routes from overlay", async () => {
    const configOverlayStore = createConfigOverlayStoreMock();
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({
      repos: [{ repo_url: "https://github.com/org/repo", default_branch: "main", identifier_prefix: "NIN" }],
    });

    const { baseUrl } = await startSetupApiServer({ configOverlayStore });
    const response = await fetch(`${baseUrl}/api/v1/setup/repo-routes`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      routes: [{ repo_url: "https://github.com/org/repo", default_branch: "main", identifier_prefix: "NIN" }],
    });
  });

  it("status endpoint includes repoRoute.done", async () => {
    const configOverlayStore = createConfigOverlayStoreMock();
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({
      repos: [{ repo_url: "https://github.com/org/repo", default_branch: "main", identifier_prefix: "NIN" }],
    });

    const { baseUrl } = await startSetupApiServer({ configOverlayStore });
    const response = await fetch(`${baseUrl}/api/v1/setup/status`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.steps.repoRoute.done).toBe(true);
  });
});
