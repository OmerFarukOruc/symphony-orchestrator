import { describe, expect, it, vi } from "vitest";
import type { ConfigStore } from "../../src/config/store.js";

import { AutomationScheduler } from "../../src/automation/scheduler.js";
import { createMockLogger } from "../helpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createConfigStore(initialAutomations: Array<Record<string, unknown>>) {
  let automations = initialAutomations;
  const listeners = new Set<() => void>();
  return {
    api: {
      getConfig: () => ({ automations }) as ReturnType<ConfigStore["getConfig"]>,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as ConfigStore,
    setAutomations(nextAutomations: Array<Record<string, unknown>>) {
      automations = nextAutomations;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

function createTask() {
  return {
    destroy: vi.fn(),
    getNextRun: vi.fn().mockReturnValue(new Date("2026-04-05T00:00:00.000Z")),
  };
}

function makeAutomation(overrides: Record<string, unknown> = {}) {
  return {
    name: "nightly-report",
    schedule: "0 2 * * *",
    mode: "report",
    prompt: "Summarize status",
    enabled: true,
    repoUrl: "https://github.com/acme/app",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Scheduler extended tests
// ---------------------------------------------------------------------------

describe("AutomationScheduler (extended coverage)", () => {
  it("stop() destroys all tasks and clears entries", () => {
    const configStore = createConfigStore([makeAutomation()]);
    const task = createTask();
    const scheduler = new AutomationScheduler({
      configStore: configStore.api,
      runner: { run: vi.fn() } as never,
      logger: createMockLogger(),
      cronApi: {
        validate: vi.fn().mockReturnValue(true),
        schedule: vi.fn().mockReturnValue(task),
      },
    });

    scheduler.start();
    expect(scheduler.listAutomations()).toHaveLength(1);

    scheduler.stop();
    expect(task.destroy).toHaveBeenCalledOnce();
    expect(scheduler.listAutomations()).toHaveLength(0);
  });

  it("stop() unsubscribes from config changes", () => {
    const configStore = createConfigStore([makeAutomation()]);
    const scheduleMock = vi.fn().mockReturnValue(createTask());
    const scheduler = new AutomationScheduler({
      configStore: configStore.api,
      runner: { run: vi.fn() } as never,
      logger: createMockLogger(),
      cronApi: {
        validate: vi.fn().mockReturnValue(true),
        schedule: scheduleMock,
      },
    });

    scheduler.start();
    expect(scheduleMock).toHaveBeenCalledOnce();

    scheduler.stop();

    // Config changes after stop() should not trigger sync
    configStore.setAutomations([makeAutomation({ schedule: "0 3 * * *" })]);
    // schedule was only called once (at start), not again after stop
    expect(scheduleMock).toHaveBeenCalledOnce();
  });

  it("runNow returns null for unknown automation", async () => {
    const configStore = createConfigStore([makeAutomation()]);
    const scheduler = new AutomationScheduler({
      configStore: configStore.api,
      runner: { run: vi.fn() } as never,
      logger: createMockLogger(),
      cronApi: {
        validate: vi.fn().mockReturnValue(true),
        schedule: vi.fn().mockReturnValue(createTask()),
      },
    });

    scheduler.start();
    const result = await scheduler.runNow("nonexistent");
    expect(result).toBeNull();
  });

  it("runNow delegates to runner with 'manual' trigger", async () => {
    const configStore = createConfigStore([makeAutomation()]);
    const runner = { run: vi.fn().mockResolvedValue({ id: "run-1", status: "completed" }) };
    const scheduler = new AutomationScheduler({
      configStore: configStore.api,
      runner: runner as never,
      logger: createMockLogger(),
      cronApi: {
        validate: vi.fn().mockReturnValue(true),
        schedule: vi.fn().mockReturnValue(createTask()),
      },
    });

    scheduler.start();
    const result = await scheduler.runNow("nightly-report");

    expect(result).toMatchObject({ id: "run-1", status: "completed" });
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({ name: "nightly-report" }), "manual");
  });

  it("does not schedule a task for disabled automations", () => {
    const configStore = createConfigStore([makeAutomation({ enabled: false })]);
    const scheduleMock = vi.fn();
    const scheduler = new AutomationScheduler({
      configStore: configStore.api,
      runner: { run: vi.fn() } as never,
      logger: createMockLogger(),
      cronApi: {
        validate: vi.fn().mockReturnValue(true),
        schedule: scheduleMock,
      },
    });

    scheduler.start();
    expect(scheduleMock).not.toHaveBeenCalled();

    const automations = scheduler.listAutomations();
    expect(automations).toHaveLength(1);
    expect(automations[0].valid).toBe(true);
    expect(automations[0].nextRun).toBeNull();
  });

  it("removes automations that are deleted from config", () => {
    const configStore = createConfigStore([makeAutomation({ name: "keep-me" }), makeAutomation({ name: "remove-me" })]);
    const task1 = createTask();
    const task2 = createTask();
    const scheduleMock = vi.fn().mockReturnValueOnce(task1).mockReturnValueOnce(task2);
    const scheduler = new AutomationScheduler({
      configStore: configStore.api,
      runner: { run: vi.fn() } as never,
      logger: createMockLogger(),
      cronApi: {
        validate: vi.fn().mockReturnValue(true),
        schedule: scheduleMock,
      },
    });

    scheduler.start();
    expect(scheduler.listAutomations()).toHaveLength(2);

    configStore.setAutomations([makeAutomation({ name: "keep-me" })]);
    expect(scheduler.listAutomations()).toHaveLength(1);
    expect(scheduler.listAutomations()[0].name).toBe("keep-me");
    expect(task2.destroy).toHaveBeenCalledOnce();
  });

  it("does not re-schedule when config has not changed", () => {
    const automation = makeAutomation();
    const configStore = createConfigStore([automation]);
    const scheduleMock = vi.fn().mockReturnValue(createTask());
    const scheduler = new AutomationScheduler({
      configStore: configStore.api,
      runner: { run: vi.fn() } as never,
      logger: createMockLogger(),
      cronApi: {
        validate: vi.fn().mockReturnValue(true),
        schedule: scheduleMock,
      },
    });

    scheduler.start();
    expect(scheduleMock).toHaveBeenCalledOnce();

    // Re-emit the exact same config
    configStore.setAutomations([automation]);
    expect(scheduleMock).toHaveBeenCalledOnce(); // No new call
  });

  it("sorts automations alphabetically", () => {
    const configStore = createConfigStore([
      makeAutomation({ name: "zzzz" }),
      makeAutomation({ name: "aaaa" }),
      makeAutomation({ name: "mmmm" }),
    ]);
    const scheduler = new AutomationScheduler({
      configStore: configStore.api,
      runner: { run: vi.fn() } as never,
      logger: createMockLogger(),
      cronApi: {
        validate: vi.fn().mockReturnValue(true),
        schedule: vi.fn().mockReturnValue(createTask()),
      },
    });

    scheduler.start();
    const names = scheduler.listAutomations().map((a) => a.name);
    expect(names).toEqual(["aaaa", "mmmm", "zzzz"]);
  });

  it("reports repoUrl correctly in automation view", () => {
    const configStore = createConfigStore([
      makeAutomation({ name: "with-repo", repoUrl: "https://github.com/acme/app" }),
      makeAutomation({ name: "no-repo", repoUrl: null }),
    ]);
    const scheduler = new AutomationScheduler({
      configStore: configStore.api,
      runner: { run: vi.fn() } as never,
      logger: createMockLogger(),
      cronApi: {
        validate: vi.fn().mockReturnValue(true),
        schedule: vi.fn().mockReturnValue(createTask()),
      },
    });

    scheduler.start();
    const automations = scheduler.listAutomations();
    expect(automations.find((a) => a.name === "with-repo")?.repoUrl).toBe("https://github.com/acme/app");
    expect(automations.find((a) => a.name === "no-repo")?.repoUrl).toBeNull();
  });
});
