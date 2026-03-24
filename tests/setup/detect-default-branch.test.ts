import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSecretsStoreMock,
  getExternalFetchMock,
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

function githubRepoResponse(defaultBranch: string): Response {
  return new Response(JSON.stringify({ default_branch: defaultBranch }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("detect-default-branch handler", () => {
  it("returns detected default branch for a valid GitHub URL", async () => {
    const fetchMock = getExternalFetchMock();
    fetchMock.mockResolvedValueOnce(githubRepoResponse("master"));

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/OmerFarukOruc/sentinel-test-arena",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.defaultBranch).toBe("master");
  });

  it("falls back to main when GitHub API returns non-200", async () => {
    const fetchMock = getExternalFetchMock();
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/does/not-exist",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.defaultBranch).toBe("main");
  });

  it("falls back to main on network error", async () => {
    const fetchMock = getExternalFetchMock();
    fetchMock.mockRejectedValueOnce(new Error("network failure"));

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/some/repo",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.defaultBranch).toBe("main");
  });

  it("rejects missing repoUrl with 400", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {});

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("missing_repo_url");
  });

  it("rejects non-GitHub URL with 400", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://gitlab.com/org/repo",
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_repo_url");
  });

  it("uses stored GITHUB_TOKEN for authenticated request", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "GITHUB_TOKEN" ? "ghp_test_token" : null));

    const fetchMock = getExternalFetchMock();
    fetchMock.mockResolvedValueOnce(githubRepoResponse("develop"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/org/private-repo",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.defaultBranch).toBe("develop");

    // Verify the fetch was called with auth header
    const fetchCall = fetchMock.mock.calls[0];
    const url = typeof fetchCall[0] === "string" ? fetchCall[0] : "";
    expect(url).toContain("/repos/org/private-repo");
    const headers = fetchCall[1]?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer ghp_test_token");
  });

  it("falls back to unauthenticated when authenticated request fails", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "GITHUB_TOKEN" ? "ghp_bad_token" : null));

    const fetchMock = getExternalFetchMock();
    // First call (authenticated) fails
    fetchMock.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    // Second call (unauthenticated) succeeds
    fetchMock.mockResolvedValueOnce(githubRepoResponse("master"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/org/public-repo",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.defaultBranch).toBe("master");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
