import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createConfigOverlayStoreMock,
  createOrchestratorMock,
  type HoistedMocks,
  getExternalFetchMock,
  postJson,
  setupAfterEach,
  setupBeforeEach,
  startSetupApiServer,
} from "./setup-fixtures.js";
import { createJsonResponse as jsonResponse, createTextResponse as textResponse } from "../helpers.js";

/* ── hoisted mocks (must remain in each test file) ─────────────────── */

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

/* ── GET /api/v1/setup/linear-projects ─────────────────────────────── */

describe("GET /api/v1/setup/linear-projects", () => {
  it("returns 400 when LINEAR_API_KEY is missing", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue(undefined);

    const response = await fetch(`${baseUrl}/api/v1/setup/linear-projects`);

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_api_key");
  });

  it("lists projects from Linear API", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "LINEAR_API_KEY" ? "lin_api_key" : null));

    getExternalFetchMock().mockResolvedValueOnce(
      jsonResponse(200, {
        data: {
          projects: {
            nodes: [
              { id: "p1", name: "Alpha", slugId: "alpha", teams: { nodes: [{ key: "ENG" }] } },
              { id: "p2", name: "Beta", slugId: "beta", teams: { nodes: [] } },
            ],
          },
        },
      }),
    );

    const response = await fetch(`${baseUrl}/api/v1/setup/linear-projects`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { projects: Array<{ id: string; teamKey: string | null }> };
    expect(body.projects).toEqual([
      { id: "p1", name: "Alpha", slugId: "alpha", teamKey: "ENG" },
      { id: "p2", name: "Beta", slugId: "beta", teamKey: null },
    ]);
  });

  it("returns empty array when Linear API returns no projects", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "LINEAR_API_KEY" ? "lin_api_key" : null));

    getExternalFetchMock().mockResolvedValueOnce(
      jsonResponse(200, {
        data: { projects: { nodes: [] } },
      }),
    );

    const response = await fetch(`${baseUrl}/api/v1/setup/linear-projects`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { projects: unknown[] };
    expect(body.projects).toEqual([]);
  });

  it("returns 502 when Linear API returns a non-OK status", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "LINEAR_API_KEY" ? "lin_api_key" : null));

    getExternalFetchMock().mockResolvedValueOnce(textResponse(500, "internal error"));

    const response = await fetch(`${baseUrl}/api/v1/setup/linear-projects`);

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("linear_api_error");
  });

  it("returns 502 when Linear API request throws", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "LINEAR_API_KEY" ? "lin_api_key" : null));

    getExternalFetchMock().mockRejectedValueOnce(new Error("DNS resolution failed"));

    const response = await fetch(`${baseUrl}/api/v1/setup/linear-projects`);

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("linear_api_error");
    expect(body.error.message).toBe("DNS resolution failed");
  });
});

/* ── POST /api/v1/setup/linear-project ─────────────────────────────── */

describe("POST /api/v1/setup/linear-project", () => {
  it("returns 400 when slugId is missing", async () => {
    const { baseUrl } = await startSetupApiServer();

    const response = await postJson(baseUrl, "/api/v1/setup/linear-project", {});

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_slug_id");
  });

  it("returns 400 when slugId is not a string", async () => {
    const { baseUrl } = await startSetupApiServer();

    const response = await postJson(baseUrl, "/api/v1/setup/linear-project", { slugId: 123 });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_slug_id");
  });

  it("saves project slug, starts orchestrator, and triggers refresh", async () => {
    const configOverlayStore = createConfigOverlayStoreMock();
    const orchestrator = createOrchestratorMock();
    const { baseUrl } = await startSetupApiServer({ configOverlayStore, orchestrator });

    const response = await postJson(baseUrl, "/api/v1/setup/linear-project", { slugId: "my-proj-42" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(configOverlayStore.set).toHaveBeenCalledWith("tracker.project_slug", "my-proj-42");
    expect(orchestrator.start).toHaveBeenCalledTimes(1);
    expect(orchestrator.requestRefresh).toHaveBeenCalledWith("setup");
  });
});
