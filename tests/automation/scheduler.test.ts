import { describe, expect, it, vi } from "vitest";
import type { ConfigStore } from "../../src/config/store.js";

import { AutomationScheduler } from "../../src/automation/scheduler.js";
import { createMockLogger } from "../helpers.js";

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

describe("AutomationScheduler", () => {
  it("schedules enabled automations and lists next runs", () => {
    const configStore = createConfigStore([
      {
        name: "nightly-report",
        schedule: "0 2 * * *",
        mode: "report",
        prompt: "Summarize status",
        enabled: true,
        repoUrl: "https://github.com/acme/app",
      },
    ]);
    const task = createTask();
    const cronApi = {
      validate: vi.fn().mockReturnValue(true),
      schedule: vi.fn().mockReturnValue(task),
    };
    const runner = { run: vi.fn() };

    const scheduler = new AutomationScheduler({
      configStore: configStore.api,
      runner: runner as never,
      logger: createMockLogger(),
      cronApi,
    });

    scheduler.start();

    expect(cronApi.schedule).toHaveBeenCalledOnce();
    expect(scheduler.listAutomations()).toEqual([
      {
        name: "nightly-report",
        schedule: "0 2 * * *",
        mode: "report",
        enabled: true,
        repoUrl: "https://github.com/acme/app",
        valid: true,
        nextRun: "2026-04-05T00:00:00.000Z",
        lastError: null,
      },
    ]);
  });

  it("records invalid cron expressions without destabilizing startup", () => {
    const configStore = createConfigStore([
      {
        name: "broken",
        schedule: "not cron",
        mode: "report",
        prompt: "Summarize status",
        enabled: true,
        repoUrl: "https://github.com/acme/app",
      },
    ]);
    const notificationManager = { notify: vi.fn().mockResolvedValue(undefined) };
    const scheduler = new AutomationScheduler({
      configStore: configStore.api,
      runner: { run: vi.fn() } as never,
      notificationManager: notificationManager as never,
      logger: createMockLogger(),
      cronApi: {
        validate: vi.fn().mockReturnValue(false),
        schedule: vi.fn(),
      },
    });

    scheduler.start();

    expect(scheduler.listAutomations()[0]).toMatchObject({
      name: "broken",
      valid: false,
    });
    expect(notificationManager.notify).toHaveBeenCalled();
  });

  it("destroys replaced tasks when config changes", () => {
    const configStore = createConfigStore([
      {
        name: "nightly-report",
        schedule: "0 2 * * *",
        mode: "report",
        prompt: "Summarize status",
        enabled: true,
        repoUrl: "https://github.com/acme/app",
      },
    ]);
    const firstTask = createTask();
    const secondTask = createTask();
    const scheduleMock = vi.fn().mockReturnValueOnce(firstTask).mockReturnValueOnce(secondTask);
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
    configStore.setAutomations([
      {
        name: "nightly-report",
        schedule: "0 3 * * *",
        mode: "report",
        prompt: "Summarize status",
        enabled: true,
        repoUrl: "https://github.com/acme/app",
      },
    ]);

    expect(firstTask.destroy).toHaveBeenCalledOnce();
    expect(scheduleMock).toHaveBeenCalledTimes(2);
  });
});
