import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  type HoistedMocks,
  createSecretsStoreMock,
  createConfigOverlayStoreMock,
  createOrchestratorMock,
  setupBeforeEach,
  setupAfterEach,
} from "./setup-fixtures.js";
import { createJsonResponse, createTextResponse } from "../helpers.js";

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

import { callLinearGraphQL, getLinearApiKey, lookupProject } from "../../src/setup/handlers/shared.js";
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

function mockFetchResponse(response: Response): void {
  vi.mocked(globalThis.fetch).mockResolvedValueOnce(response);
}

/* ── callLinearGraphQL ────────────────────────────────────────────── */

describe("callLinearGraphQL", () => {
  it("sends a POST request to Linear with correct headers and body", async () => {
    mockFetchResponse(createJsonResponse(200, { data: { viewer: { id: "user-1" } } }));

    await callLinearGraphQL("lin_api_key", "{ viewer { id } }", {});

    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.linear.app/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "lin_api_key" },
      body: JSON.stringify({ query: "{ viewer { id } }", variables: {} }),
    });
  });

  it("returns parsed data on successful response", async () => {
    const payload = { data: { projects: { nodes: [{ id: "p1", name: "Alpha" }] } } };
    mockFetchResponse(createJsonResponse(200, payload));

    const result = await callLinearGraphQL("key", "query", { slug: "alpha" });

    expect(result).toEqual(payload);
  });

  it("passes variables through to the request body", async () => {
    mockFetchResponse(createJsonResponse(200, { data: {} }));

    await callLinearGraphQL("key", "query($a: String!)", { a: "value" });

    const callBody = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body as string);
    expect(callBody.variables).toEqual({ a: "value" });
  });

  it("throws when Linear API returns a non-OK status", async () => {
    mockFetchResponse(createTextResponse(503, "Service Unavailable"));

    await expect(callLinearGraphQL("key", "query", {})).rejects.toThrow("Linear API returned 503: Service Unavailable");
  });

  it("throws with empty body text when response.text() fails", async () => {
    const badResponse = new Response(null, { status: 401 });
    vi.spyOn(badResponse, "text").mockRejectedValueOnce(new Error("read error"));
    mockFetchResponse(badResponse);

    await expect(callLinearGraphQL("key", "query", {})).rejects.toThrow("Linear API returned 401: ");
  });

  it("throws when response contains GraphQL errors", async () => {
    mockFetchResponse(
      createJsonResponse(200, {
        data: null,
        errors: [{ message: "Field not found" }, { message: "Unauthorized" }],
      }),
    );

    await expect(callLinearGraphQL("key", "query", {})).rejects.toThrow("Field not found; Unauthorized");
  });

  it("does not throw when errors array is empty", async () => {
    mockFetchResponse(createJsonResponse(200, { data: { ok: true }, errors: [] }));

    const result = await callLinearGraphQL("key", "query", {});

    expect(result.data).toEqual({ ok: true });
  });
});

/* ── getLinearApiKey ──────────────────────────────────────────────── */

describe("getLinearApiKey", () => {
  it("returns key from secrets store when available", () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "LINEAR_API_KEY" ? "store-key" : null));
    const deps = makeDeps({ secretsStore });

    expect(getLinearApiKey(deps)).toBe("store-key");
  });

  it("falls back to process.env when secrets store returns null", () => {
    process.env.LINEAR_API_KEY = "env-key";
    const deps = makeDeps();

    expect(getLinearApiKey(deps)).toBe("env-key");
  });

  it("returns empty string when neither store nor env has the key", () => {
    const deps = makeDeps();

    expect(getLinearApiKey(deps)).toBe("");
  });

  it("prefers secrets store over env", () => {
    const secretsStore = createSecretsStoreMock();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "LINEAR_API_KEY" ? "store-key" : null));
    process.env.LINEAR_API_KEY = "env-key";
    const deps = makeDeps({ secretsStore });

    expect(getLinearApiKey(deps)).toBe("store-key");
  });
});

/* ── lookupProject ────────────────────────────────────────────────── */

describe("lookupProject", () => {
  it("returns the first matching project node", async () => {
    const projectNode = {
      id: "proj-1",
      name: "Symphony",
      slugId: "symphony",
      teams: { nodes: [{ id: "team-1", key: "ENG" }] },
    };
    mockFetchResponse(
      createJsonResponse(200, {
        data: { projects: { nodes: [projectNode] } },
      }),
    );

    const result = await lookupProject("api-key", "symphony");

    expect(result).toEqual(projectNode);
  });

  it("throws when no project matches the slug", async () => {
    mockFetchResponse(
      createJsonResponse(200, {
        data: { projects: { nodes: [] } },
      }),
    );

    await expect(lookupProject("api-key", "nonexistent")).rejects.toThrow('Project "nonexistent" not found');
  });

  it("throws when projects.nodes is undefined", async () => {
    mockFetchResponse(
      createJsonResponse(200, {
        data: { projects: {} },
      }),
    );

    await expect(lookupProject("api-key", "missing")).rejects.toThrow('Project "missing" not found');
  });

  it("propagates errors from callLinearGraphQL", async () => {
    mockFetchResponse(createTextResponse(500, "Internal Server Error"));

    await expect(lookupProject("api-key", "slug")).rejects.toThrow("Linear API returned 500");
  });

  it("sends the project slug as a variable", async () => {
    mockFetchResponse(
      createJsonResponse(200, {
        data: { projects: { nodes: [{ id: "p1", name: "Test", slugId: "test-slug" }] } },
      }),
    );

    await lookupProject("api-key", "test-slug");

    const callBody = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body as string);
    expect(callBody.variables).toEqual({ projectSlug: "test-slug" });
  });
});
