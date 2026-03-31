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

function projectLookupResponse(teamId: string) {
  return jsonResponse(200, {
    data: {
      projects: {
        nodes: [
          {
            id: "proj-1",
            name: "Test Project",
            slugId: "test-project",
            teams: { nodes: [{ id: teamId, key: "ENG" }] },
          },
        ],
      },
    },
  });
}

function labelCreateResponse(id: string, name: string) {
  return jsonResponse(200, {
    data: {
      issueLabelCreate: {
        success: true,
        issueLabel: { id, name },
      },
    },
  });
}

/* ── tests ─────────────────────────────────────────────────────────── */

describe("POST /api/v1/setup/create-label", () => {
  it("returns 400 when LINEAR_API_KEY is missing", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue(undefined);

    const response = await postJson(baseUrl, "/api/v1/setup/create-label");

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_api_key");
  });

  it("returns 400 when no project is selected", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");

    const response = await postJson(baseUrl, "/api/v1/setup/create-label");

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_project");
  });

  it("creates a risoluto label and returns id + name", async () => {
    const { baseUrl, secretsStore, configOverlayStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({ "tracker.project_slug": "my-proj" });

    let callCount = 0;
    getExternalFetchMock().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return projectLookupResponse("team-1");
      }
      return labelCreateResponse("label-42", "risoluto");
    });

    const response = await postJson(baseUrl, "/api/v1/setup/create-label");

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; labelId: string; labelName: string; alreadyExists: boolean };
    expect(body.ok).toBe(true);
    expect(body.labelId).toBe("label-42");
    expect(body.labelName).toBe("risoluto");
    expect(body.alreadyExists).toBe(false);
  });

  it("returns alreadyExists when Linear reports a duplicate label", async () => {
    const { baseUrl, secretsStore, configOverlayStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({ "tracker.project_slug": "my-proj" });

    let callCount = 0;
    getExternalFetchMock().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return projectLookupResponse("team-1");
      }
      // The GraphQL call throws with a "duplicate" message
      return jsonResponse(200, {
        data: null,
        errors: [{ message: "Duplicate label name" }],
      });
    });

    const response = await postJson(baseUrl, "/api/v1/setup/create-label");

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; alreadyExists: boolean };
    expect(body.ok).toBe(true);
    expect(body.alreadyExists).toBe(true);
  });

  it("returns 502 when Linear API throws a network error", async () => {
    const { baseUrl, secretsStore, configOverlayStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({ "tracker.project_slug": "my-proj" });

    getExternalFetchMock().mockRejectedValue(new Error("Network unreachable"));

    const response = await postJson(baseUrl, "/api/v1/setup/create-label");

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("linear_api_error");
  });

  it("returns 502 when the project has no team", async () => {
    const { baseUrl, secretsStore, configOverlayStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({ "tracker.project_slug": "my-proj" });

    getExternalFetchMock().mockResolvedValue(
      jsonResponse(200, {
        data: {
          projects: {
            nodes: [
              {
                id: "proj-1",
                name: "No Team Project",
                slugId: "no-team",
                teams: { nodes: [] },
              },
            ],
          },
        },
      }),
    );

    const response = await postJson(baseUrl, "/api/v1/setup/create-label");

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("linear_api_error");
    expect(body.error.message).toContain("No team found");
  });

  it("returns 502 when label creation is not confirmed by Linear", async () => {
    const { baseUrl, secretsStore, configOverlayStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({ "tracker.project_slug": "my-proj" });

    let callCount = 0;
    getExternalFetchMock().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return projectLookupResponse("team-1");
      }
      return jsonResponse(200, {
        data: { issueLabelCreate: { success: false } },
      });
    });

    const response = await postJson(baseUrl, "/api/v1/setup/create-label");

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("linear_api_error");
    expect(body.error.message).toContain("did not confirm");
  });
});
