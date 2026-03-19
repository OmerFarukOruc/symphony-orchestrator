import { describe, expect, it, vi, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { ConfigStore } from "../../src/config/store.js";
import type { SymphonyLogger } from "../../src/core/types.js";

function makeLogger(): SymphonyLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  } as unknown as SymphonyLogger;
}

// Uses front-matter format (starts with ---) so the loader parses the YAML config section
const MINIMAL_WORKFLOW_YAML = `---
tracker:
  kind: linear
  api_key: lin_test
  endpoint: https://api.linear.app/graphql
  project_slug: TEST
  active_states:
    - In Progress
  terminal_states:
    - Done
codex:
  command: codex
  turn_timeout_ms: 30000
  auth:
    mode: api_key
    source_home: /tmp
agent: {}
server: {}
workspace:
  root: /tmp/symphony
---
Work on the issue.
`;

// Unclosed bracket causes YAML.parse to throw
const INVALID_YAML = `---
tracker:
  kind: [unclosed
---
Work on the issue.
`;

async function writeTempWorkflow(dir: string, content = MINIMAL_WORKFLOW_YAML): Promise<string> {
  const filePath = join(dir, "workflow.yaml");
  await writeFile(filePath, content);
  return filePath;
}

let tmpDir: string;

afterEach(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

async function makeTestDir(): Promise<string> {
  tmpDir = join(tmpdir(), `config-store-test-${randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });
  return tmpDir;
}

describe("ConfigStore", () => {
  it("loads workflow successfully on start", async () => {
    const dir = await makeTestDir();
    const workflowPath = await writeTempWorkflow(dir);
    const logger = makeLogger();
    const store = new ConfigStore(workflowPath, logger);

    await store.start();
    try {
      const config = store.getConfig();
      expect(config.tracker.kind).toBe("linear");
      expect(config.tracker.activeStates).toContain("In Progress");
    } finally {
      await store.stop();
    }
  });

  it("throws when getConfig is called before start", () => {
    const store = new ConfigStore("/nonexistent/path.yaml", makeLogger());
    expect(() => store.getConfig()).toThrow("config store has not been started");
  });

  it("throws when getWorkflow is called before start", () => {
    const store = new ConfigStore("/nonexistent/path.yaml", makeLogger());
    expect(() => store.getWorkflow()).toThrow("config store has not been started");
  });

  it("throws on start when workflow file does not exist", async () => {
    const store = new ConfigStore("/nonexistent/path.yaml", makeLogger());
    await expect(store.start()).rejects.toThrow();
  });

  it("keeps last known good config on failed refresh", async () => {
    const dir = await makeTestDir();
    const workflowPath = await writeTempWorkflow(dir);
    const logger = makeLogger();
    const store = new ConfigStore(workflowPath, logger);

    await store.start();
    try {
      const firstConfig = store.getConfig();
      expect(firstConfig.tracker.kind).toBe("linear");

      // Write invalid YAML to trigger a reload failure
      await writeFile(workflowPath, INVALID_YAML);
      // Manually trigger refresh
      await store.refresh("test:bad-reload");

      // Config should be unchanged (last known good)
      const configAfterError = store.getConfig();
      expect(configAfterError.tracker.kind).toBe("linear");
      expect(logger.error).toHaveBeenCalled();
    } finally {
      await store.stop();
    }
  });

  it("notifies listeners on successful refresh", async () => {
    const dir = await makeTestDir();
    const workflowPath = await writeTempWorkflow(dir);
    const store = new ConfigStore(workflowPath, makeLogger());
    await store.start();

    try {
      const listener = vi.fn();
      store.subscribe(listener);
      await store.refresh("test:manual");
      expect(listener).toHaveBeenCalled();
    } finally {
      await store.stop();
    }
  });

  it("subscribe returns an unsubscribe function that stops notifications", async () => {
    const dir = await makeTestDir();
    const workflowPath = await writeTempWorkflow(dir);
    const store = new ConfigStore(workflowPath, makeLogger());
    await store.start();

    try {
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);
      unsubscribe();
      await store.refresh("test:after-unsub");
      expect(listener).not.toHaveBeenCalled();
    } finally {
      await store.stop();
    }
  });

  it("stop cleans up watchers and subscriptions", async () => {
    const dir = await makeTestDir();
    const workflowPath = await writeTempWorkflow(dir);
    const overlayUnsubscribeFn = vi.fn();
    const overlayStore = {
      toMap: vi.fn().mockReturnValue({}),
      subscribe: vi.fn().mockReturnValue(overlayUnsubscribeFn),
    };
    const store = new ConfigStore(workflowPath, makeLogger(), { overlayStore });
    await store.start();
    await store.stop();

    expect(overlayUnsubscribeFn).toHaveBeenCalled();
  });

  it("merges overlay store values into config map", async () => {
    const dir = await makeTestDir();
    const workflowPath = await writeTempWorkflow(dir);
    const overlayStore = {
      toMap: vi.fn().mockReturnValue({ custom_field: "overlay_value" }),
      subscribe: vi.fn().mockReturnValue(() => undefined),
    };
    const store = new ConfigStore(workflowPath, makeLogger(), { overlayStore });
    await store.start();

    try {
      const map = store.getMergedConfigMap();
      expect(map.custom_field).toBe("overlay_value");
    } finally {
      await store.stop();
    }
  });

  it("getMergedConfigMap returns a clone (mutations don't affect store)", async () => {
    const dir = await makeTestDir();
    const workflowPath = await writeTempWorkflow(dir);
    const store = new ConfigStore(workflowPath, makeLogger());
    await store.start();

    try {
      const map1 = store.getMergedConfigMap();
      map1.injected = "mutated";
      const map2 = store.getMergedConfigMap();
      expect(map2.injected).toBeUndefined();
    } finally {
      await store.stop();
    }
  });
});
