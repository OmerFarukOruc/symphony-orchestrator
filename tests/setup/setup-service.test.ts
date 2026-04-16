import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { SecretsStore } from "../../src/secrets/store.js";
import { createSetupService } from "../../src/setup/setup-service.js";
import { buildSilentLogger, buildStubOrchestrator, buildStubTracker } from "../helpers/http-server-harness.js";

const MASTER_KEY = "test-master-key-32chars-exactly!!";
const originalEnv = { ...process.env };

let tmpDir: string;
let secretsStore: SecretsStore;
let configOverlayStore: ConfigOverlayStore;
let orchestrator: ReturnType<typeof buildStubOrchestrator>;
let tracker: ReturnType<typeof buildStubTracker>;

beforeEach(async () => {
  process.env = { ...originalEnv };
  delete process.env.OPENAI_API_KEY;
  delete process.env.GITHUB_TOKEN;
  delete process.env.LINEAR_API_KEY;

  tmpDir = await mkdtemp(path.join(os.tmpdir(), "setup-service-"));
  const logger = buildSilentLogger();

  secretsStore = new SecretsStore(tmpDir, logger);
  await secretsStore.startDeferred();

  configOverlayStore = new ConfigOverlayStore(path.join(tmpDir, "overlay.yaml"), logger);
  await configOverlayStore.start();

  orchestrator = buildStubOrchestrator();
  tracker = buildStubTracker();
});

afterEach(async () => {
  process.env = { ...originalEnv };
  await configOverlayStore.stop();
  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  vi.restoreAllMocks();
});

describe("setup-service", () => {
  it("drives the setup status through master-key, Linear selection, and Codex auth from one boundary", async () => {
    const service = createSetupService({
      secretsStore,
      configOverlayStore,
      orchestrator,
      archiveDir: tmpDir,
      tracker,
    });

    expect(service.getStatus()).toEqual({
      configured: false,
      steps: {
        masterKey: { done: false },
        linearProject: { done: false },
        repoRoute: { done: false },
        openaiKey: { done: false },
        githubToken: { done: false },
      },
    });

    await service.createMasterKey(MASTER_KEY);
    await service.selectLinearProject("NIN");
    await service.saveCodexAuth(JSON.stringify({ access_token: "tok_abc", refresh_token: "ref_123" }));

    expect(orchestrator.start).toHaveBeenCalledTimes(1);
    expect(orchestrator.requestRefresh).toHaveBeenCalledWith("setup");

    expect(service.getStatus()).toEqual({
      configured: true,
      steps: {
        masterKey: { done: true },
        linearProject: { done: true },
        repoRoute: { done: false },
        openaiKey: { done: true },
        githubToken: { done: false },
      },
    });

    const authJson = await readFile(path.join(tmpDir, "codex-auth", "auth.json"), "utf8");
    expect(JSON.parse(authJson)).toMatchObject({
      tokens: {
        access_token: "tok_abc",
        refresh_token: "ref_123",
      },
    });
  });

  it("resets secrets, auth overlay, and master key from the shared setup boundary", async () => {
    secretsStore = new SecretsStore(tmpDir, buildSilentLogger(), { masterKey: MASTER_KEY });
    await secretsStore.start();
    await secretsStore.set("LINEAR_API_KEY", "lin_test");
    await secretsStore.set("GITHUB_TOKEN", "gh_test");
    await configOverlayStore.set("codex.auth.mode", "openai_login");
    await configOverlayStore.set("codex.auth.source_home", "/tmp/auth");

    const service = createSetupService({
      secretsStore,
      configOverlayStore,
      orchestrator,
      archiveDir: tmpDir,
      tracker,
    });

    await service.reset();

    expect(orchestrator.stop).toHaveBeenCalledTimes(1);
    expect(secretsStore.isInitialized()).toBe(false);
    expect(secretsStore.list()).toEqual([]);
    expect(configOverlayStore.toMap()).toMatchObject({
      codex: {
        auth: {
          mode: "",
          source_home: "",
        },
      },
    });
    expect(await readFile(path.join(tmpDir, "master.key"), "utf8")).toBe("");
  });

  it("manages repo routes through the shared setup boundary", async () => {
    const service = createSetupService({
      secretsStore,
      configOverlayStore,
      orchestrator,
      archiveDir: tmpDir,
      tracker,
    });

    expect(service.getRepoRoutes()).toEqual({ routes: [] });

    await service.saveRepoRoute({
      repoUrl: "https://github.com/org/repo-a",
      defaultBranch: "develop",
      identifierPrefix: "nin",
      label: "triage",
    });
    await service.saveRepoRoute({
      repoUrl: "https://github.com/org/repo-b",
      identifierPrefix: "OPS",
    });

    expect(service.getRepoRoutes()).toEqual({
      routes: [
        {
          repo_url: "https://github.com/org/repo-a",
          default_branch: "develop",
          identifier_prefix: "NIN",
          label: "triage",
        },
        {
          repo_url: "https://github.com/org/repo-b",
          default_branch: "main",
          identifier_prefix: "OPS",
        },
      ],
    });

    const deleteResult = await service.deleteRepoRoute(0);
    expect(deleteResult).toEqual({
      ok: true,
      routes: [
        {
          repo_url: "https://github.com/org/repo-b",
          default_branch: "main",
          identifier_prefix: "OPS",
        },
      ],
    });
  });

  it("detects the default branch and falls back to main through the shared setup boundary", async () => {
    const service = createSetupService({
      secretsStore,
      configOverlayStore,
      orchestrator,
      archiveDir: tmpDir,
      tracker,
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ default_branch: "trunk" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(service.detectDefaultBranch("https://github.com/openai/risoluto")).resolves.toEqual({
      defaultBranch: "trunk",
    });

    fetchMock.mockRejectedValueOnce(new Error("network failure"));
    await expect(service.detectDefaultBranch("https://github.com/openai/risoluto")).resolves.toEqual({
      defaultBranch: "main",
    });
  });
});
