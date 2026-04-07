import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchDefaultBranch, parseOwnerRepo, resolveToken } from "../../src/setup/detect-default-branch.js";
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

describe("detect-default-branch helpers", () => {
  it("parses valid owner and repo combinations", () => {
    expect(parseOwnerRepo("https://github.com/openai/risoluto")).toEqual({
      owner: "openai",
      repo: "risoluto",
    });
    expect(parseOwnerRepo("https://www.github.com/OpenAI/risoluto.git")).toEqual({
      owner: "OpenAI",
      repo: "risoluto",
    });
    expect(parseOwnerRepo("https://github.com/o/r/")).toEqual({
      owner: "o",
      repo: "r",
    });
  });

  it("rejects malformed, non-normalized, or unsupported GitHub URLs", () => {
    expect(parseOwnerRepo(" https://github.com/openai/risoluto ")).toBeNull();
    expect(parseOwnerRepo("http://github.com/openai/risoluto")).toBeNull();
    expect(parseOwnerRepo("https://github.com/openai")).toBeNull();
    expect(parseOwnerRepo("https://github.com/openai/.git")).toBeNull();
    expect(parseOwnerRepo("https://github.com//repo")).toBeNull();
    expect(parseOwnerRepo("https://github.com/!!!/repo")).toBeNull();
    expect(parseOwnerRepo("https://github.com/openai/repo!")).toBeNull();
    expect(parseOwnerRepo("https://github.com/openai/!!!")).toBeNull();
    expect(parseOwnerRepo("https://github.com/openai/risoluto?tab=readme")).toBeNull();
    expect(parseOwnerRepo("https://github.com/openai/risoluto#readme")).toBeNull();
  });

  it("rejects GitHub URLs with extra path segments instead of truncating them", () => {
    expect(parseOwnerRepo("https://github.com/openai/risoluto/issues")).toBeNull();
  });

  it("rejects owner and repo segments that only end with valid characters", () => {
    expect(parseOwnerRepo("https://github.com/!openai/repo")).toBeNull();
    expect(parseOwnerRepo("https://github.com/openai/!repo")).toBeNull();
  });

  it("prefers secret-store tokens, then env tokens, then null", () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "GITHUB_TOKEN" ? "ghp_secret" : null));
    process.env.GITHUB_TOKEN = "ghp_env";
    expect(resolveToken({ secretsStore })).toBe("ghp_secret");

    vi.spyOn(secretsStore, "get").mockReturnValue(null);
    expect(resolveToken({ secretsStore })).toBe("ghp_env");

    delete process.env.GITHUB_TOKEN;
    expect(resolveToken({ secretsStore })).toBeNull();
  });

  it("fetches default branch with auth first and falls back to public when needed", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ default_branch: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(githubRepoResponse("public-main"));

    await expect(fetchDefaultBranch("openai", "risoluto", "ghp_token", fetchImpl)).resolves.toBe("public-main");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.github.com/repos/openai/risoluto");
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe("GET");
    expect((fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>).authorization).toBe("Bearer ghp_token");
    expect((fetchImpl.mock.calls[1]?.[1]?.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("ignores default_branch in non-ok authenticated responses and retries publicly", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ default_branch: "private-main" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(githubRepoResponse("public-main"));

    await expect(fetchDefaultBranch("openai", "risoluto", "ghp_token", fetchImpl)).resolves.toBe("public-main");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws a GitHub API status error for failed unauthenticated responses", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("not found", { status: 404 }));

    await expect(fetchDefaultBranch("openai", "risoluto", null, fetchImpl)).rejects.toThrow("GitHub API returned 404");
  });

  it("returns the configured fallback when the unauthenticated response lacks default_branch", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ default_branch: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchDefaultBranch("openai", "risoluto", null, fetchImpl)).resolves.toBe("main");
  });
});

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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.github.com/repos/OmerFarukOruc/sentinel-test-arena");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
  });

  it("accepts trimmed GitHub URLs with www and .git suffixes", async () => {
    const fetchMock = getExternalFetchMock();
    fetchMock.mockResolvedValueOnce(githubRepoResponse("mainline"));

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: " https://www.github.com/OpenAI/risoluto.git ",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.defaultBranch).toBe("mainline");

    const fetchCall = fetchMock.mock.calls[0];
    const url = typeof fetchCall?.[0] === "string" ? fetchCall[0] : "";
    expect(url).toContain("/repos/OpenAI/risoluto");
  });

  it("trims the request body before parsing the GitHub URL", async () => {
    const fetchMock = getExternalFetchMock();
    fetchMock.mockResolvedValueOnce(githubRepoResponse("trimmed-main"));

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: " https://github.com/openai/risoluto ",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).defaultBranch).toBe("trimmed-main");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.github.com/repos/openai/risoluto");
  });

  it("accepts a bare GitHub repo URL without trailing slash or .git", async () => {
    const fetchMock = getExternalFetchMock();
    fetchMock.mockResolvedValueOnce(githubRepoResponse("stable"));

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/openai/risoluto",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).defaultBranch).toBe("stable");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/repos/openai/risoluto");
  });

  it("accepts single-character owner and repo names plus a trailing slash", async () => {
    const fetchMock = getExternalFetchMock();
    fetchMock.mockResolvedValueOnce(githubRepoResponse("tiny"));

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/o/r/",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).defaultBranch).toBe("tiny");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/repos/o/r");
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to main when the GitHub response has no default_branch string", async () => {
    const fetchMock = getExternalFetchMock();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ default_branch: null, name: "repo" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/openai/risoluto",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.defaultBranch).toBe("main");
  });

  it("falls back to main when the authenticated GitHub response has no default_branch string", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "GITHUB_TOKEN" ? "ghp_partial_token" : null));

    const fetchMock = getExternalFetchMock();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ default_branch: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValueOnce(githubRepoResponse("fallback-public"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/openai/risoluto",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).defaultBranch).toBe("fallback-public");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects missing repoUrl with 400", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {});

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("missing_repo_url");
    expect(body.error.message).toBe("repoUrl is required");
  });

  it("rejects null and non-string repoUrl values with 400", async () => {
    const { baseUrl } = await startSetupApiServer();

    const nullResponse = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: null,
    });
    expect(nullResponse.status).toBe(400);
    expect((await nullResponse.json()).error.code).toBe("missing_repo_url");

    const numberResponse = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: 42,
    });
    expect(numberResponse.status).toBe(400);
    expect((await numberResponse.json()).error.code).toBe("missing_repo_url");

    const blankResponse = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "   ",
    });
    expect(blankResponse.status).toBe(400);
    expect((await blankResponse.json()).error.code).toBe("missing_repo_url");
  });

  it("rejects non-GitHub URL with 400", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://gitlab.com/org/repo",
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_repo_url");
    expect(body.error.message).toBe("repoUrl must be a valid GitHub URL");
  });

  it("rejects malformed GitHub URLs with missing owner or repo", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/openai",
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_repo_url");
    expect(body.error.message).toBe("repoUrl must be a valid GitHub URL");
  });

  it("rejects GitHub URLs with extra path segments at the handler layer", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/openai/risoluto/issues",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_repo_url");
  });

  it("rejects GitHub URLs with query strings or hashes", async () => {
    const { baseUrl } = await startSetupApiServer();

    const queryResponse = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/openai/risoluto?tab=readme",
    });
    expect(queryResponse.status).toBe(400);
    expect((await queryResponse.json()).error.code).toBe("invalid_repo_url");

    const hashResponse = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/openai/risoluto#readme",
    });
    expect(hashResponse.status).toBe(400);
    expect((await hashResponse.json()).error.code).toBe("invalid_repo_url");
  });

  it("rejects malformed owner and repo segments in GitHub URLs", async () => {
    const { baseUrl } = await startSetupApiServer();

    const badOwner = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/!!!/repo",
    });
    expect(badOwner.status).toBe(400);
    expect((await badOwner.json()).error.code).toBe("invalid_repo_url");

    const badRepo = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/openai/!!!",
    });
    expect(badRepo.status).toBe(400);
    expect((await badRepo.json()).error.code).toBe("invalid_repo_url");
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
    expect(url).toBe("https://api.github.com/repos/org/private-repo");
    const headers = fetchCall[1]?.headers as Record<string, string>;
    expect(fetchCall[1]?.method).toBe("GET");
    expect(headers.authorization).toBe("Bearer ghp_test_token");
  });

  it("falls back to process.env.GITHUB_TOKEN when the secret store has no token", async () => {
    process.env.GITHUB_TOKEN = "ghp_env_token";
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockReturnValue(null);

    const fetchMock = getExternalFetchMock();
    fetchMock.mockResolvedValueOnce(githubRepoResponse("develop"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/org/env-repo",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).defaultBranch).toBe("develop");

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer ghp_env_token");
  });

  it("uses unauthenticated headers when no token is available anywhere", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockReturnValue(null);

    const fetchMock = getExternalFetchMock();
    fetchMock.mockResolvedValueOnce(githubRepoResponse("main"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/org/public-repo",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).defaultBranch).toBe("main");

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.accept).toBe("application/vnd.github+json");
    expect(headers["user-agent"]).toBe("risoluto");
    expect(headers["x-github-api-version"]).toBe("2022-11-28");
    expect(headers.authorization).toBeUndefined();
  });

  it("falls back to main when the unauthenticated request also fails after an auth miss", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "GITHUB_TOKEN" ? "ghp_bad_token" : null));

    const fetchMock = getExternalFetchMock();
    fetchMock.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/org/missing-public-repo",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).defaultBranch).toBe("main");
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
    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(firstHeaders.authorization).toBe("Bearer ghp_bad_token");
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(secondHeaders.authorization).toBeUndefined();
  });

  it("falls back to unauthenticated when the authenticated request throws", async () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "GITHUB_TOKEN" ? "ghp_throwing_token" : null));

    const fetchMock = getExternalFetchMock();
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    fetchMock.mockResolvedValueOnce(githubRepoResponse("resilient"));

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/detect-default-branch", {
      repoUrl: "https://github.com/org/retry-repo",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).defaultBranch).toBe("resilient");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(secondHeaders.authorization).toBeUndefined();
  });
});
