import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigOverlayStore } from "../../src/config/overlay.js";
import {
  createConfigOverlayStoreMock,
  createSecretsStoreMock,
  getExternalFetchMock,
  type HoistedMocks,
  postJson,
  setupAfterEach,
  setupBeforeEach,
  startSetupApiServer,
} from "./setup-fixtures.js";
import { createJsonResponse as jsonResponse, createTextResponse as textResponse } from "../helpers.js";

const mocks: HoistedMocks = vi.hoisted(() => ({
  existsSyncMock: vi.fn<(filePath: string) => boolean>(),
  mkdirMock: vi.fn<(filePath: string, options?: { recursive?: boolean }) => Promise<void>>(),
  writeFileMock:
    vi.fn<(filePath: string, data: string, options?: { encoding?: BufferEncoding; mode?: number }) => Promise<void>>(),
  startDeviceAuthMock: vi.fn<
    () => Promise<{
      user_code: string;
      verification_uri: string;
      verification_uri_complete?: string;
      device_code: string;
      expires_in: number;
      interval: number;
    }>
  >(),
  pollDeviceAuthMock:
    vi.fn<(deviceCode: string) => Promise<{ status: "pending" | "complete" | "expired"; error?: string }>>(),
  saveDeviceAuthTokensMock:
    vi.fn<
      (
        deviceCode: string,
        archiveDir: string,
        configOverlayStore: ConfigOverlayStore,
      ) => Promise<{ ok: boolean; error?: string }>
    >(),
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

function mockLinearApiKey(): ReturnType<typeof createSecretsStoreMock> {
  const secretsStore = createSecretsStoreMock();
  vi.spyOn(secretsStore, "get").mockImplementation((key) => (key === "LINEAR_API_KEY" ? "linear-secret" : null));
  return secretsStore;
}

function mockProjectSlug(slug = "risoluto"): ReturnType<typeof createConfigOverlayStoreMock> {
  const configOverlayStore = createConfigOverlayStoreMock();
  vi.spyOn(configOverlayStore, "toMap").mockReturnValue({ "tracker.project_slug": slug });
  return configOverlayStore;
}

function projectLookupResponse(): Response {
  return jsonResponse(200, {
    data: {
      projects: {
        nodes: [
          {
            id: "project-1",
            name: "Risoluto",
            slugId: "risoluto",
            teams: { nodes: [{ id: "team-1", key: "ENG" }] },
          },
        ],
      },
    },
  });
}

function inProgressStatesResponse(): Response {
  return jsonResponse(200, {
    data: {
      team: {
        states: {
          nodes: [
            { id: "state-1", name: "Backlog", type: "unstarted" },
            { id: "state-2", name: "In Progress", type: "started" },
          ],
        },
      },
    },
  });
}

function issueCreateResponse(): Response {
  return jsonResponse(200, {
    data: {
      issueCreate: {
        success: true,
        issue: {
          id: "issue-1",
          identifier: "SYM-123",
          url: "https://linear.app/acme/issue/SYM-123",
        },
      },
    },
  });
}

function labelCreateResponse(): Response {
  return jsonResponse(200, {
    data: {
      issueLabelCreate: {
        success: true,
        issueLabel: {
          id: "label-1",
          name: "risoluto",
        },
      },
    },
  });
}

describe("registerSetupApi — quick start helpers", () => {
  it("creates a Linear smoke test issue successfully", async () => {
    const secretsStore = mockLinearApiKey();
    const configOverlayStore = mockProjectSlug();
    getExternalFetchMock()
      .mockResolvedValueOnce(projectLookupResponse())
      .mockResolvedValueOnce(inProgressStatesResponse())
      .mockResolvedValueOnce(issueCreateResponse());

    const { baseUrl } = await startSetupApiServer({ secretsStore, configOverlayStore });
    const response = await postJson(baseUrl, "/api/v1/setup/create-test-issue");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      issueIdentifier: "SYM-123",
      issueUrl: "https://linear.app/acme/issue/SYM-123",
    });
    expect(getExternalFetchMock()).toHaveBeenCalledTimes(3);
  });

  it("returns missing_api_key when creating a test issue without Linear credentials", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/create-test-issue");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "missing_api_key", message: "LINEAR_API_KEY not configured" },
    });
  });

  it("returns missing_project when creating a test issue without a selected project", async () => {
    const secretsStore = mockLinearApiKey();

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/create-test-issue");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "missing_project", message: "No Linear project selected" },
    });
  });

  it("returns linear_api_error when creating a test issue and Linear responds with an error status", async () => {
    const secretsStore = mockLinearApiKey();
    const configOverlayStore = mockProjectSlug();
    getExternalFetchMock().mockResolvedValueOnce(textResponse(503, "unavailable"));

    const { baseUrl } = await startSetupApiServer({ secretsStore, configOverlayStore });
    const response = await postJson(baseUrl, "/api/v1/setup/create-test-issue");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { code: "linear_api_error", message: "Linear API returned 503: unavailable" },
    });
  });

  it("returns linear_api_error when the selected project cannot be found for test issue creation", async () => {
    const secretsStore = mockLinearApiKey();
    const configOverlayStore = mockProjectSlug();
    getExternalFetchMock().mockResolvedValueOnce(jsonResponse(200, { data: { projects: { nodes: [] } } }));

    const { baseUrl } = await startSetupApiServer({ secretsStore, configOverlayStore });
    const response = await postJson(baseUrl, "/api/v1/setup/create-test-issue");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { code: "linear_api_error", message: 'Project "risoluto" not found' },
    });
  });

  it("creates a Linear label successfully", async () => {
    const secretsStore = mockLinearApiKey();
    const configOverlayStore = mockProjectSlug();
    getExternalFetchMock().mockResolvedValueOnce(projectLookupResponse()).mockResolvedValueOnce(labelCreateResponse());

    const { baseUrl } = await startSetupApiServer({ secretsStore, configOverlayStore });
    const response = await postJson(baseUrl, "/api/v1/setup/create-label");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      labelId: "label-1",
      labelName: "risoluto",
      alreadyExists: false,
    });
    expect(getExternalFetchMock()).toHaveBeenCalledTimes(2);
  });

  it("returns missing_api_key when creating a label without Linear credentials", async () => {
    const { baseUrl } = await startSetupApiServer();
    const response = await postJson(baseUrl, "/api/v1/setup/create-label");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "missing_api_key", message: "LINEAR_API_KEY not configured" },
    });
  });

  it("returns missing_project when creating a label without a selected project", async () => {
    const secretsStore = mockLinearApiKey();

    const { baseUrl } = await startSetupApiServer({ secretsStore });
    const response = await postJson(baseUrl, "/api/v1/setup/create-label");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "missing_project", message: "No Linear project selected" },
    });
  });

  it("returns linear_api_error when creating a label and Linear responds with an error status", async () => {
    const secretsStore = mockLinearApiKey();
    const configOverlayStore = mockProjectSlug();
    getExternalFetchMock().mockResolvedValueOnce(textResponse(503, "unavailable"));

    const { baseUrl } = await startSetupApiServer({ secretsStore, configOverlayStore });
    const response = await postJson(baseUrl, "/api/v1/setup/create-label");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { code: "linear_api_error", message: "Linear API returned 503: unavailable" },
    });
  });
});
