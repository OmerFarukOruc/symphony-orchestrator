import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import YAML from "yaml";
import { afterAll, describe, expect, it } from "vitest";

import { ConfigStore } from "../../src/config/store.js";
import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { AttemptStore } from "../../src/core/attempt-store.js";
import { createLogger } from "../../src/core/logger.js";
import type { AttemptEvent, AttemptRecord } from "../../src/core/types.js";
import { SecretsStore } from "../../src/secrets/store.js";

const MASTER_KEY = "characterization-master-key";
const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "symphony-persistence-characterization-"));
  tempDirs.push(dir);
  return dir;
}

function createAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId: "attempt-001",
    issueId: "issue-001",
    issueIdentifier: "CH-42",
    title: "Characterize file persistence",
    workspaceKey: "CH-42",
    workspacePath: "/tmp/symphony/CH-42",
    status: "failed",
    attemptNumber: 1,
    startedAt: "2026-03-26T09:00:00.000Z",
    endedAt: "2026-03-26T09:05:00.000Z",
    model: "gpt-5.4",
    reasoningEffort: "high",
    modelSource: "default",
    threadId: "thread-001",
    turnId: "turn-001",
    turnCount: 2,
    errorCode: "turn_failed",
    errorMessage: "worker exited",
    tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    pullRequestUrl: null,
    stopSignal: null,
    ...overrides,
  };
}

function createEvent(overrides: Partial<AttemptEvent> = {}): AttemptEvent {
  return {
    attemptId: "attempt-001",
    at: "2026-03-26T09:01:00.000Z",
    issueId: "issue-001",
    issueIdentifier: "CH-42",
    sessionId: "session-001",
    event: "attempt.updated",
    message: "updated",
    content: "delta",
    metadata: { phase: "characterization" },
    usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    rateLimits: { requestsRemaining: 42 },
    ...overrides,
  };
}

function writeWorkflow(rootDir: string): { workflowPath: string; workflowConfig: Record<string, unknown> } {
  const workflowPath = path.join(rootDir, "WORKFLOW.md");
  const workflowConfig = {
    tracker: {
      kind: "linear",
      api_key: "$LINEAR_API_KEY",
      endpoint: "https://api.linear.app/graphql",
      project_slug: "BASE",
      active_states: ["In Progress"],
      terminal_states: ["Done"],
    },
    agent: {
      max_concurrent_agents: 2,
    },
    codex: {
      command: "codex",
      model: "gpt-5.4",
      reasoning_effort: "medium",
      auth: {
        mode: "api_key",
        source_home: "/workflow-auth",
      },
      provider: {
        env_key: "OPENAI_API_KEY",
      },
    },
    workspace: {
      root: path.join(rootDir, "workflow-workspaces"),
    },
    server: {
      port: 4000,
    },
  } satisfies Record<string, unknown>;

  writeFileSync(workflowPath, `---\n${YAML.stringify(workflowConfig)}---\nCharacterize persistence output.\n`, "utf8");

  return { workflowPath, workflowConfig };
}

afterAll(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("file-based persistence characterization", () => {
  it("records current AttemptStore archive shapes, ordering, filtering, and naming", async () => {
    const baseDir = createTempDir();
    const store = new AttemptStore(baseDir, createLogger());
    await store.start();

    const olderAttempt = createAttempt({ attemptId: "attempt-001", startedAt: "2026-03-26T09:00:00.000Z" });
    const latestAttempt = createAttempt({
      attemptId: "attempt-002",
      issueId: "issue-002",
      startedAt: "2026-03-26T09:10:00.000Z",
      threadId: "thread-002",
      turnId: "turn-002",
    });
    const otherIssueAttempt = createAttempt({
      attemptId: "attempt-003",
      issueId: "issue-003",
      issueIdentifier: "CH-99",
      workspaceKey: "CH-99",
      workspacePath: "/tmp/symphony/CH-99",
      startedAt: "2026-03-26T08:00:00.000Z",
    });
    const firstEvent = createEvent({
      attemptId: latestAttempt.attemptId,
      issueId: latestAttempt.issueId,
      at: "2026-03-26T09:11:00.000Z",
      event: "attempt.started",
      message: "started",
    });
    const secondEvent = createEvent({
      attemptId: latestAttempt.attemptId,
      issueId: latestAttempt.issueId,
      at: "2026-03-26T09:12:00.000Z",
      event: "attempt.failed",
      message: "failed",
      content: "stderr",
      metadata: { phase: "teardown" },
      usage: { inputTokens: 4, outputTokens: 5, totalTokens: 9 },
      rateLimits: { requestsRemaining: 41 },
    });

    await store.createAttempt(olderAttempt);
    await store.createAttempt(latestAttempt);
    await store.createAttempt(otherIssueAttempt);
    await store.appendEvent(firstEvent);
    await store.appendEvent(secondEvent);

    expect(store.getAttempt(latestAttempt.attemptId)).toEqual(latestAttempt);
    expect(JSON.parse(readFileSync(path.join(baseDir, "attempts", "attempt-002.json"), "utf8"))).toEqual(latestAttempt);

    const persistedEvents = readFileSync(path.join(baseDir, "events", "attempt-002.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as AttemptEvent);
    expect(persistedEvents).toEqual([firstEvent, secondEvent]);
    expect(persistedEvents).toHaveLength(2);
    expect(store.getEvents(latestAttempt.attemptId)).toEqual([firstEvent, secondEvent]);

    expect(store.getAttemptsForIssue("CH-42")).toEqual([latestAttempt, olderAttempt]);
    expect(store.getAttemptsForIssue("CH-42")[0]).toEqual(latestAttempt);
    expect(store.getAttemptsForIssue("CH-99")).toEqual([otherIssueAttempt]);
    expect(store.getAttemptsForIssue("CH-404")).toEqual([]);
    expect(JSON.parse(readFileSync(path.join(baseDir, "issue-index.json"), "utf8"))).toEqual({
      "CH-42": ["attempt-002", "attempt-001"],
      "CH-99": ["attempt-003"],
    });

    expect(readdirSync(baseDir).sort()).toEqual(["attempts", "events", "issue-index.json", "symphony.db"]);
    expect(readdirSync(path.join(baseDir, "attempts")).sort()).toEqual([
      "attempt-001.json",
      "attempt-002.json",
      "attempt-003.json",
    ]);
    expect(readdirSync(path.join(baseDir, "events")).sort()).toEqual([
      "attempt-001.jsonl",
      "attempt-002.jsonl",
      "attempt-003.jsonl",
    ]);

    const restartedStore = new AttemptStore(baseDir, createLogger());
    await restartedStore.start();
    expect(restartedStore.getAttempt(latestAttempt.attemptId)).toEqual(latestAttempt);
    expect(restartedStore.getEvents(latestAttempt.attemptId)).toEqual([firstEvent, secondEvent]);
  });

  it("records current workflow loading, overlay precedence, and overlay persistence behavior", async () => {
    const baseDir = createTempDir();
    const overlayPath = path.join(baseDir, "config", "overlay.yaml");
    const overlayMap = {
      tracker: { project_slug: "OVERRIDE" },
      agent: { max_concurrent_agents: 7 },
      codex: { model: "gpt-5.5" },
      workspace: { root: path.join(baseDir, "overlay-workspaces") },
    };
    const { workflowPath, workflowConfig } = writeWorkflow(baseDir);
    const overlayStore = new ConfigOverlayStore(overlayPath, createLogger());
    await overlayStore.start();
    await overlayStore.replace(overlayMap);

    const secretsStore = new SecretsStore(baseDir, createLogger(), { masterKey: MASTER_KEY });
    await secretsStore.start();
    await secretsStore.set("LINEAR_API_KEY", "lin_characterization_secret");
    await secretsStore.set("OPENAI_API_KEY", "sk_characterization_secret");

    const store = new ConfigStore(workflowPath, createLogger(), { overlayStore, secretsStore });
    await store.start();

    expect(store.getWorkflow()).toEqual({
      config: workflowConfig,
      promptTemplate: "Characterize persistence output.",
    });
    expect(store.getMergedConfigMap()).toEqual({
      ...workflowConfig,
      tracker: { ...(workflowConfig.tracker as Record<string, unknown>), project_slug: "OVERRIDE" },
      agent: { ...(workflowConfig.agent as Record<string, unknown>), max_concurrent_agents: 7 },
      codex: { ...(workflowConfig.codex as Record<string, unknown>), model: "gpt-5.5" },
      workspace: { root: path.join(baseDir, "overlay-workspaces") },
    });
    expect(store.getConfig().tracker.apiKey).toBe("lin_characterization_secret");
    expect(store.getConfig().tracker.projectSlug).toBe("OVERRIDE");
    expect(store.getConfig().agent.maxConcurrentAgents).toBe(7);
    expect(store.getConfig().codex.model).toBe("gpt-5.5");
    expect(store.getConfig().workspace.root).toBe(path.join(baseDir, "overlay-workspaces"));
    expect(overlayStore.toMap()).toEqual(overlayMap);

    await store.stop();
    await overlayStore.stop();

    const restartedOverlayStore = new ConfigOverlayStore(overlayPath, createLogger());
    await restartedOverlayStore.start();
    expect(restartedOverlayStore.toMap()).toEqual(overlayMap);
    expect(readFileSync(overlayPath, "utf8")).toContain("project_slug: OVERRIDE");
    await restartedOverlayStore.stop();
  });

  it("records current SecretsStore encryption, listing, restart, and delete behavior", async () => {
    const baseDir = createTempDir();
    const store = new SecretsStore(baseDir, createLogger(), { masterKey: MASTER_KEY });
    await store.start();

    await store.set("BETA_TOKEN", "beta-secret");
    await store.set("ALPHA_TOKEN", "alpha-secret");

    const envelope = JSON.parse(readFileSync(path.join(baseDir, "secrets.enc"), "utf8")) as Record<string, string>;
    expect(envelope.version).toBe(1);
    expect(envelope.algorithm).toBe("aes-256-gcm");
    expect(readFileSync(path.join(baseDir, "secrets.enc"), "utf8")).not.toContain("alpha-secret");
    expect(readFileSync(path.join(baseDir, "secrets.enc"), "utf8")).not.toContain("beta-secret");

    const restartedStore = new SecretsStore(baseDir, createLogger(), { masterKey: MASTER_KEY });
    await restartedStore.start();
    expect(restartedStore.get("ALPHA_TOKEN")).toBe("alpha-secret");
    expect(restartedStore.get("BETA_TOKEN")).toBe("beta-secret");
    expect(restartedStore.list()).toEqual(["ALPHA_TOKEN", "BETA_TOKEN"]);

    expect(await restartedStore.delete("ALPHA_TOKEN")).toBe(true);
    expect(await restartedStore.delete("MISSING_TOKEN")).toBe(false);
    expect(restartedStore.get("ALPHA_TOKEN")).toBeNull();
    expect(restartedStore.list()).toEqual(["BETA_TOKEN"]);

    const afterDeleteStore = new SecretsStore(baseDir, createLogger(), { masterKey: MASTER_KEY });
    await afterDeleteStore.start();
    expect(afterDeleteStore.get("ALPHA_TOKEN")).toBeNull();
    expect(afterDeleteStore.get("BETA_TOKEN")).toBe("beta-secret");
  });
});
