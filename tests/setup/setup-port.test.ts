import { mkdtemp, rm } from "node:fs/promises";
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

beforeEach(async () => {
  process.env = { ...originalEnv };
  delete process.env.LINEAR_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GITHUB_TOKEN;

  tmpDir = await mkdtemp(path.join(os.tmpdir(), "setup-port-"));
  const logger = buildSilentLogger();

  secretsStore = new SecretsStore(tmpDir, logger, { masterKey: MASTER_KEY });
  await secretsStore.start();

  configOverlayStore = new ConfigOverlayStore(path.join(tmpDir, "overlay.yaml"), logger);
  await configOverlayStore.start();
});

afterEach(async () => {
  process.env = { ...originalEnv };
  await configOverlayStore.stop();
  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  vi.restoreAllMocks();
});

describe("setup-port", () => {
  it("routes linear project discovery through tracker provisioning", async () => {
    await secretsStore.set("LINEAR_API_KEY", "lin_test");

    const tracker = buildStubTracker({
      provision: vi.fn(async (input) => {
        expect(input).toEqual({ type: "list_projects" });
        return {
          projects: [{ id: "proj-1", name: "Ninja", slugId: "NIN", teamKey: "nin" }],
        };
      }),
    });

    const service = createSetupService({
      secretsStore,
      configOverlayStore,
      orchestrator: buildStubOrchestrator(),
      archiveDir: tmpDir,
      tracker,
    });

    await expect(service.getLinearProjects()).resolves.toEqual({
      projects: [{ id: "proj-1", name: "Ninja", slugId: "NIN", teamKey: "nin" }],
    });
  });

  it("routes test-issue and label provisioning through the tracker boundary", async () => {
    await secretsStore.set("LINEAR_API_KEY", "lin_test");
    await configOverlayStore.set("tracker.project_slug", "NIN");

    const tracker = buildStubTracker({
      provision: vi.fn(async (input) => {
        switch (input.type) {
          case "create_test_issue":
            return {
              ok: true,
              issueIdentifier: "NIN-1",
              issueUrl: "https://tracker.example/NIN-1",
            };
          case "create_label":
            return {
              ok: true,
              labelId: "label-1",
              labelName: "risoluto",
              alreadyExists: false,
            };
          default:
            throw new Error(`Unexpected setup provision call: ${input.type}`);
        }
      }),
    });

    const service = createSetupService({
      secretsStore,
      configOverlayStore,
      orchestrator: buildStubOrchestrator(),
      archiveDir: tmpDir,
      tracker,
    });

    await expect(service.createTestIssue()).resolves.toEqual({
      ok: true,
      issueIdentifier: "NIN-1",
      issueUrl: "https://tracker.example/NIN-1",
    });
    await expect(service.createLabel()).resolves.toEqual({
      ok: true,
      labelId: "label-1",
      labelName: "risoluto",
      alreadyExists: false,
    });
    expect(tracker.provision).toHaveBeenCalledWith({ type: "create_test_issue" });
    expect(tracker.provision).toHaveBeenCalledWith({ type: "create_label" });
  });

  it("does not require a Linear project slug when tracker.kind is github", async () => {
    await configOverlayStore.set("tracker.kind", "github");

    const service = createSetupService({
      secretsStore,
      configOverlayStore,
      orchestrator: buildStubOrchestrator(),
      archiveDir: tmpDir,
      tracker: buildStubTracker(),
    });

    expect(service.getStatus()).toEqual({
      configured: true,
      steps: {
        masterKey: { done: true },
        linearProject: { done: true },
        repoRoute: { done: false },
        openaiKey: { done: false },
        githubToken: { done: false },
      },
    });
  });
});
