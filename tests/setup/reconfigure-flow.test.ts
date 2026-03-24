import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfigOverlayStore } from "../../src/config/overlay.js";
import {
  type HoistedMocks,
  postJson,
  setupAfterEach,
  setupBeforeEach,
  startSetupApiServer,
  type Orchestrator,
  type SecretsStore,
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

function setOverlayValue(target: Record<string, unknown>, pathExpression: string, value: unknown): void {
  const segments = pathExpression.split(".");
  let cursor = target;
  for (const segment of segments.slice(0, -1)) {
    const child = cursor[segment];
    if (child && typeof child === "object" && !Array.isArray(child)) {
      cursor = child as Record<string, unknown>;
      continue;
    }
    const next: Record<string, unknown> = {};
    cursor[segment] = next;
    cursor = next;
  }
  cursor[segments.at(-1) ?? pathExpression] = value;
}

function deleteOverlayValue(target: Record<string, unknown>, pathExpression: string): boolean {
  const segments = pathExpression.split(".");
  let cursor: Record<string, unknown> | undefined = target;
  for (const segment of segments.slice(0, -1)) {
    const child = cursor?.[segment];
    if (!child || typeof child !== "object" || Array.isArray(child)) {
      return false;
    }
    cursor = child as Record<string, unknown>;
  }
  if (!cursor || !Object.hasOwn(cursor, segments.at(-1) ?? "")) {
    return false;
  }
  delete cursor[segments.at(-1) ?? ""];
  return true;
}

function createMutableConfigOverlay(initial: Record<string, unknown>): ConfigOverlayStore {
  const overlay = structuredClone(initial) as Record<string, unknown>;

  return {
    toMap: vi.fn(() => structuredClone(overlay) as Record<string, unknown>),
    set: vi.fn(async (pathExpression: string, value: unknown) => {
      setOverlayValue(overlay, pathExpression, value);
      return true;
    }),
    delete: vi.fn(async (pathExpression: string) => deleteOverlayValue(overlay, pathExpression)),
  } as unknown as ConfigOverlayStore;
}

function createMutableSecretsStore(initialized: boolean, secretsInput: Record<string, string>) {
  let ready = initialized;
  const secrets = new Map(Object.entries(secretsInput));

  const store = {
    isInitialized: vi.fn(() => ready),
    initializeWithKey: vi.fn(async () => {
      ready = true;
    }),
    list: vi.fn(() => [...secrets.keys()].sort()),
    delete: vi.fn(async (key: string) => secrets.delete(key)),
    get: vi.fn((key: string) => secrets.get(key) ?? null),
    reset: vi.fn(() => {
      secrets.clear();
      ready = false;
    }),
  } as unknown as SecretsStore;

  return { store, isInitialized: () => ready };
}

function createOrchestratorStub() {
  const stop = vi.fn(async () => undefined);

  return {
    store: {
      stop,
      start: vi.fn(async () => undefined),
      requestRefresh: vi.fn(() => ({ queued: true, coalesced: false, requestedAt: "2026-03-24T00:00:00.000Z" })),
    } as unknown as Orchestrator,
    stop,
  };
}

beforeEach(() => setupBeforeEach(mocks));
afterEach(setupAfterEach);

describe("setup reconfigure flow", () => {
  it("clears master-key state during reset so the next setup run can generate a fresh key", async () => {
    const secretsStore = createMutableSecretsStore(true, {
      GITHUB_TOKEN: "github-token",
      LINEAR_API_KEY: "linear-key",
      OPENAI_API_KEY: "openai-key",
    });
    const configOverlayStore = createMutableConfigOverlay({
      codex: { auth: { mode: "openai_login", source_home: "/archive-root/codex-auth" } },
    });
    const orchestrator = createOrchestratorStub();

    const { baseUrl } = await startSetupApiServer({
      secretsStore: secretsStore.store,
      configOverlayStore,
      orchestrator: orchestrator.store,
    });

    const resetResponse = await postJson(baseUrl, "/api/v1/setup/reset");
    expect(resetResponse.status).toBe(200);
    expect(orchestrator.stop).toHaveBeenCalledTimes(1);
    expect(mocks.writeFileMock).toHaveBeenNthCalledWith(1, "/archive-root/master.key", "", {
      encoding: "utf8",
      mode: 0o600,
    });
    expect(secretsStore.isInitialized()).toBe(false);

    const masterKeyResponse = await postJson(baseUrl, "/api/v1/setup/master-key", {});
    const body = (await masterKeyResponse.json()) as { key: string };

    expect(masterKeyResponse.status).toBe(200);
    expect(body.key).toMatch(/^[a-f0-9]{64}$/u);
    expect(mocks.writeFileMock).toHaveBeenNthCalledWith(2, "/archive-root/master.key", body.key, {
      encoding: "utf8",
      mode: 0o600,
    });
  });

  it("treats a leftover auth file as cleared once reset marks Codex auth as empty", async () => {
    const secretsStore = createMutableSecretsStore(true, {});
    const configOverlayStore = createMutableConfigOverlay({
      codex: { auth: { mode: "openai_login", source_home: "/archive-root/codex-auth" } },
    });
    const orchestrator = createOrchestratorStub();
    mocks.existsSyncMock.mockImplementation((filePath) => filePath === "/archive-root/codex-auth/auth.json");

    const { baseUrl } = await startSetupApiServer({
      secretsStore: secretsStore.store,
      configOverlayStore,
      orchestrator: orchestrator.store,
    });

    const before = await fetch(`${baseUrl}/api/v1/setup/status`);
    expect(await before.json()).toEqual({
      configured: false,
      steps: {
        masterKey: { done: true },
        linearProject: { done: false },
        repoRoute: { done: false },
        openaiKey: { done: true },
        githubToken: { done: false },
      },
    });

    await postJson(baseUrl, "/api/v1/setup/reset");

    const after = await fetch(`${baseUrl}/api/v1/setup/status`);
    expect(await after.json()).toEqual({
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
});
