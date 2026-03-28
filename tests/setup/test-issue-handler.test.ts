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

function projectLookupResponse(projectId: string, teamId: string) {
  return jsonResponse(200, {
    data: {
      projects: {
        nodes: [
          {
            id: projectId,
            name: "Test Project",
            slugId: "test-project",
            teams: { nodes: [{ id: teamId, key: "ENG" }] },
          },
        ],
      },
    },
  });
}

function teamStatesResponse(teamId: string, states: Array<{ id: string; name: string }>) {
  return jsonResponse(200, {
    data: {
      team: {
        id: teamId,
        name: "Engineering",
        states: { nodes: states },
      },
    },
  });
}

function issueCreateResponse(identifier: string, url: string) {
  return jsonResponse(200, {
    data: {
      issueCreate: {
        success: true,
        issue: { id: "issue-1", identifier, url },
      },
    },
  });
}

/* ── tests ─────────────────────────────────────────────────────────── */

describe("POST /api/v1/setup/create-test-issue", () => {
  it("returns 400 when LINEAR_API_KEY is missing", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue(undefined);

    const response = await postJson(baseUrl, "/api/v1/setup/create-test-issue");

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_api_key");
  });

  it("returns 400 when no project is selected", async () => {
    const { baseUrl, secretsStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");

    const response = await postJson(baseUrl, "/api/v1/setup/create-test-issue");

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_project");
  });

  it("creates a smoke test issue and returns identifier + url", async () => {
    const { baseUrl, secretsStore, configOverlayStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({ "tracker.project_slug": "my-proj" });

    let callCount = 0;
    getExternalFetchMock().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // First call: project lookup
        return projectLookupResponse("proj-1", "team-1");
      }
      if (callCount === 2) {
        // Second call: team states lookup
        return teamStatesResponse("team-1", [
          { id: "state-todo", name: "Triage" },
          { id: "state-ip", name: "In Progress" },
          { id: "state-done", name: "Done" },
        ]);
      }
      // Third call: issue creation
      return issueCreateResponse("ENG-123", "https://linear.app/team/issue/ENG-123");
    });

    const response = await postJson(baseUrl, "/api/v1/setup/create-test-issue");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      issueIdentifier: string;
      issueUrl: string;
    };
    expect(body.ok).toBe(true);
    expect(body.issueIdentifier).toBe("ENG-123");
    expect(body.issueUrl).toBe("https://linear.app/team/issue/ENG-123");
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

    const response = await postJson(baseUrl, "/api/v1/setup/create-test-issue");

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("linear_api_error");
    expect(body.error.message).toContain("No team found");
  });

  it("returns 502 when no In Progress state exists", async () => {
    const { baseUrl, secretsStore, configOverlayStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({ "tracker.project_slug": "my-proj" });

    let callCount = 0;
    getExternalFetchMock().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return projectLookupResponse("proj-1", "team-1");
      }
      // States without "In Progress"
      return teamStatesResponse("team-1", [
        { id: "state-todo", name: "Triage" },
        { id: "state-done", name: "Done" },
      ]);
    });

    const response = await postJson(baseUrl, "/api/v1/setup/create-test-issue");

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("linear_api_error");
    expect(body.error.message).toContain("In Progress");
  });

  it("returns 502 when Linear API throws a network error", async () => {
    const { baseUrl, secretsStore, configOverlayStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({ "tracker.project_slug": "my-proj" });

    getExternalFetchMock().mockRejectedValue(new Error("Connection refused"));

    const response = await postJson(baseUrl, "/api/v1/setup/create-test-issue");

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("linear_api_error");
  });

  it("returns 502 when issue creation is not confirmed by Linear", async () => {
    const { baseUrl, secretsStore, configOverlayStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({ "tracker.project_slug": "my-proj" });

    let callCount = 0;
    getExternalFetchMock().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return projectLookupResponse("proj-1", "team-1");
      }
      if (callCount === 2) {
        return teamStatesResponse("team-1", [{ id: "state-ip", name: "In Progress" }]);
      }
      // Issue creation returns success: false
      return jsonResponse(200, {
        data: { issueCreate: { success: false } },
      });
    });

    const response = await postJson(baseUrl, "/api/v1/setup/create-test-issue");

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("linear_api_error");
    expect(body.error.message).toContain("did not confirm");
  });

  it("matches In Progress state name case-insensitively", async () => {
    const { baseUrl, secretsStore, configOverlayStore } = await startSetupApiServer();
    vi.spyOn(secretsStore, "get").mockReturnValue("lin_api_key");
    vi.spyOn(configOverlayStore, "toMap").mockReturnValue({ "tracker.project_slug": "my-proj" });

    let callCount = 0;
    getExternalFetchMock().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return projectLookupResponse("proj-1", "team-1");
      }
      if (callCount === 2) {
        // State name uses mixed case
        return teamStatesResponse("team-1", [{ id: "state-ip", name: "in progress" }]);
      }
      return issueCreateResponse("ENG-456", "https://linear.app/team/issue/ENG-456");
    });

    const response = await postJson(baseUrl, "/api/v1/setup/create-test-issue");

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; issueIdentifier: string };
    expect(body.ok).toBe(true);
    expect(body.issueIdentifier).toBe("ENG-456");
  });
});
