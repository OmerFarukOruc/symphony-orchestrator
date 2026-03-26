import type { Server } from "node:http";

import express from "express";
import { vi } from "vitest";

import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { AttemptStore } from "../../src/core/attempt-store.js";
import type { RunAttemptDispatcher } from "../../src/dispatch/types.js";
import { ConfigStore } from "../../src/config/store.js";
import { LinearClient } from "../../src/linear/client.js";
import { LinearTrackerAdapter } from "../../src/tracker/linear-adapter.js";
import { Orchestrator } from "../../src/orchestrator/orchestrator.js";
import { SecretsStore } from "../../src/secrets/store.js";
import { registerSetupApi } from "../../src/setup/api.js";
import { WorkspaceManager } from "../../src/workspace/manager.js";
import { createMockLogger } from "../helpers.js";

/* ── Type aliases ──────────────────────────────────────────────────── */

export type FetchStub = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Mocks that must be created with `vi.hoisted()` in each test file
 * and passed into the shared helpers below.
 */
export interface HoistedMocks {
  existsSyncMock: ReturnType<typeof vi.fn<(filePath: string) => boolean>>;
  mkdirMock: ReturnType<typeof vi.fn<(filePath: string, options?: { recursive?: boolean }) => Promise<void>>>;
  writeFileMock: ReturnType<
    typeof vi.fn<
      (filePath: string, data: string, options?: { encoding?: BufferEncoding; mode?: number }) => Promise<void>
    >
  >;
  startDeviceAuthMock: ReturnType<typeof vi.fn>;
  pollDeviceAuthMock: ReturnType<typeof vi.fn>;
  saveDeviceAuthTokensMock: ReturnType<typeof vi.fn>;
}

/* ── Mock factories ────────────────────────────────────────────────── */

export function createSecretsStoreMock(): SecretsStore {
  const store = new SecretsStore("/secrets-store", createMockLogger());
  vi.spyOn(store, "start").mockResolvedValue(undefined);
  vi.spyOn(store, "startDeferred").mockResolvedValue(undefined);
  vi.spyOn(store, "initializeWithKey").mockResolvedValue(undefined);
  vi.spyOn(store, "set").mockResolvedValue(undefined);
  vi.spyOn(store, "delete").mockResolvedValue(true);
  return store;
}

export function createConfigOverlayStoreMock(): ConfigOverlayStore {
  const store = new ConfigOverlayStore("/overlay/config.yaml", createMockLogger());
  vi.spyOn(store, "start").mockResolvedValue(undefined);
  vi.spyOn(store, "stop").mockResolvedValue(undefined);
  vi.spyOn(store, "replace").mockResolvedValue(true);
  vi.spyOn(store, "applyPatch").mockResolvedValue(true);
  vi.spyOn(store, "set").mockResolvedValue(true);
  vi.spyOn(store, "delete").mockResolvedValue(true);
  return store;
}

export function createAgentRunnerMock(): RunAttemptDispatcher {
  return {
    runAttempt: vi.fn(async () => {
      throw new Error("not used in setup api tests");
    }),
  };
}

export function createOrchestratorMock(): Orchestrator {
  const logger = createMockLogger();
  const orchestrator = new Orchestrator({
    attemptStore: new AttemptStore("/attempt-store", logger),
    configStore: new ConfigStore("/workflow.md", logger),
    tracker: new LinearTrackerAdapter(
      new LinearClient(() => {
        throw new Error("not used in setup api tests");
      }, logger),
    ),
    workspaceManager: new WorkspaceManager(() => {
      throw new Error("not used in setup api tests");
    }, logger),
    agentRunner: createAgentRunnerMock(),
    logger,
  });
  vi.spyOn(orchestrator, "start").mockResolvedValue(undefined);
  vi.spyOn(orchestrator, "stop").mockResolvedValue(undefined);
  vi.spyOn(orchestrator, "requestRefresh").mockReturnValue({
    queued: true,
    coalesced: false,
    requestedAt: "2026-03-22T00:00:00Z",
  });
  vi.spyOn(orchestrator, "getSnapshot").mockImplementation(() => {
    throw new Error("not used in setup api tests");
  });
  vi.spyOn(orchestrator, "getIssueDetail").mockReturnValue(null);
  vi.spyOn(orchestrator, "getAttemptDetail").mockReturnValue(null);
  vi.spyOn(orchestrator, "updateIssueModelSelection").mockResolvedValue(null);
  return orchestrator;
}

/* ── Server lifecycle ──────────────────────────────────────────────── */

const servers: Server[] = [];

export async function startSetupApiServer(options?: {
  archiveDir?: string;
  secretsStore?: SecretsStore;
  configOverlayStore?: ConfigOverlayStore;
  orchestrator?: Orchestrator;
}): Promise<{
  baseUrl: string;
  secretsStore: SecretsStore;
  configOverlayStore: ConfigOverlayStore;
  orchestrator: Orchestrator;
}> {
  const app = express();
  app.use(express.json());

  const secretsStore = options?.secretsStore ?? createSecretsStoreMock();
  const configOverlayStore = options?.configOverlayStore ?? createConfigOverlayStoreMock();
  const orchestrator = options?.orchestrator ?? createOrchestratorMock();

  registerSetupApi(app, {
    secretsStore,
    configOverlayStore,
    orchestrator,
    archiveDir: options?.archiveDir ?? "/archive-root",
  });

  const server = await new Promise<Server>((resolve) => {
    const startedServer = app.listen(0, "127.0.0.1", () => resolve(startedServer));
  });
  servers.push(server);

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new TypeError("Expected HTTP server to bind to an address object");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    secretsStore,
    configOverlayStore,
    orchestrator,
  };
}

export async function postJson(baseUrl: string, route: string, body?: unknown): Promise<Response> {
  return fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/* ── Shared lifecycle hooks ────────────────────────────────────────── */

const originalEnv = { ...process.env };
const realFetch = globalThis.fetch.bind(globalThis);
let externalFetchMock = vi.fn<FetchStub>();

export function getExternalFetchMock(): ReturnType<typeof vi.fn<FetchStub>> {
  return externalFetchMock;
}

export function setupBeforeEach(mocks: HoistedMocks): void {
  process.env = { ...originalEnv };
  delete process.env.LINEAR_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GITHUB_TOKEN;

  mocks.existsSyncMock.mockReset();
  mocks.existsSyncMock.mockReturnValue(false);
  mocks.mkdirMock.mockReset();
  mocks.mkdirMock.mockResolvedValue(undefined);
  mocks.writeFileMock.mockReset();
  mocks.writeFileMock.mockResolvedValue(undefined);
  mocks.startDeviceAuthMock.mockReset();
  mocks.pollDeviceAuthMock.mockReset();
  mocks.saveDeviceAuthTokensMock.mockReset();

  externalFetchMock = vi.fn<FetchStub>();
  vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("http://127.0.0.1:")) {
      return realFetch(input, init);
    }
    return externalFetchMock(input, init);
  });
}

export async function setupAfterEach(): Promise<void> {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
    ),
  );
}

export { type SecretsStore, type ConfigOverlayStore, type Orchestrator };
