import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type HoistedMocks,
  getExternalFetchMock,
  postJson,
  setupAfterEach,
  setupBeforeEach,
  startSetupApiServer,
} from "./setup-fixtures.js";
import { createJsonResponse as jsonResponse } from "../helpers.js";

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

/* ── helpers ───────────────────────────────────────────────────────── */

function teamsResponse(teams: Array<{ id: string; name: string; key: string }>) {
  return jsonResponse(200, {
    data: { teams: { nodes: teams } },
  });
}

function projectCreateResponse(
  success: boolean,
  project?: { id: string; name: string; slugId: string; url: string; teams?: { nodes: Array<{ key: string }> } },
) {
  return jsonResponse(200, {
    data: { projectCreate: { success, project } },
  });
}

/* ── tests ─────────────────────────────────────────────────────────── */

describe("POST /api/v1/setup/create-project (extended)", () => {
  it("returns 400 when LINEAR_API_KEY is missing", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue(undefined);

    const response = await postJson(baseUrl, "/api/v1/setup/create-project", { name: "Proj" });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_api_key");
  });

  it("returns 400 when name is missing from body", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");

    const response = await postJson(baseUrl, "/api/v1/setup/create-project", {});

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_name");
  });

  it("returns 400 when name is an empty string", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");

    const response = await postJson(baseUrl, "/api/v1/setup/create-project", { name: "" });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_name");
  });

  it("returns 400 when name is whitespace-only", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");

    const response = await postJson(baseUrl, "/api/v1/setup/create-project", { name: "   \t  " });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_name");
  });

  it("returns 400 when name is not a string", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");

    const response = await postJson(baseUrl, "/api/v1/setup/create-project", { name: 42 });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_name");
  });

  it("returns 400 when no teams are found in the Linear workspace", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");

    getExternalFetchMock().mockResolvedValueOnce(teamsResponse([]));

    const response = await postJson(baseUrl, "/api/v1/setup/create-project", { name: "New Proj" });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("no_teams");
  });

  it("creates project using the first team and returns full project details", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");

    const teams = [
      { id: "team-1", name: "Engineering", key: "ENG" },
      { id: "team-2", name: "Design", key: "DES" },
    ];
    const project = {
      id: "proj-new",
      name: "New Proj",
      slugId: "new-proj-abc",
      url: "https://linear.app/team/new-proj-abc",
      teams: { nodes: [{ key: "ENG" }] },
    };

    let callCount = 0;
    getExternalFetchMock().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return teamsResponse(teams);
      }
      return projectCreateResponse(true, project);
    });

    const response = await postJson(baseUrl, "/api/v1/setup/create-project", { name: "New Proj" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      project: { id: string; name: string; slugId: string; url: string; teamKey: string };
    };
    expect(body.ok).toBe(true);
    expect(body.project.id).toBe("proj-new");
    expect(body.project.name).toBe("New Proj");
    expect(body.project.slugId).toBe("new-proj-abc");
    expect(body.project.url).toBe("https://linear.app/team/new-proj-abc");
    expect(body.project.teamKey).toBe("ENG");
  });

  it("falls back to first team key when project response has no teams", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");

    const teams = [{ id: "team-1", name: "Engineering", key: "FALLBACK" }];
    const project = {
      id: "proj-new",
      name: "Proj",
      slugId: "proj-slug",
      url: "https://linear.app/team/proj-slug",
      // No teams in project response
    };

    let callCount = 0;
    getExternalFetchMock().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return teamsResponse(teams);
      }
      return projectCreateResponse(true, project);
    });

    const response = await postJson(baseUrl, "/api/v1/setup/create-project", { name: "Proj" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { project: { teamKey: string } };
    expect(body.project.teamKey).toBe("FALLBACK");
  });

  it("returns 502 when Linear API does not confirm project creation", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");

    let callCount = 0;
    getExternalFetchMock().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return teamsResponse([{ id: "team-1", name: "Eng", key: "ENG" }]);
      }
      return projectCreateResponse(false);
    });

    const response = await postJson(baseUrl, "/api/v1/setup/create-project", { name: "Proj" });

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("linear_api_error");
    expect(body.error.message).toContain("did not confirm");
  });

  it("returns 502 when Linear API throws a network error on teams fetch", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");

    getExternalFetchMock().mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const response = await postJson(baseUrl, "/api/v1/setup/create-project", { name: "Proj" });

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("linear_api_error");
  });

  it("returns null for url when project response omits it", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");

    const project = {
      id: "proj-new",
      name: "Proj",
      slugId: "proj-slug",
      // url omitted
      teams: { nodes: [{ key: "ENG" }] },
    };

    let callCount = 0;
    getExternalFetchMock().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return teamsResponse([{ id: "team-1", name: "Eng", key: "ENG" }]);
      }
      return projectCreateResponse(true, project as Parameters<typeof projectCreateResponse>[1]);
    });

    const response = await postJson(baseUrl, "/api/v1/setup/create-project", { name: "Proj" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { project: { url: string | null } };
    expect(body.project.url).toBeNull();
  });
});
