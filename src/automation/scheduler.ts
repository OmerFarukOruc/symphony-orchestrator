import cron, { type ScheduledTask } from "node-cron";

import type { ConfigStore } from "../config/store.js";
import type { AutomationConfig, RisolutoLogger } from "../core/types.js";
import type { NotificationManager } from "../notification/manager.js";
import type { AutomationRunRecord } from "./types.js";
import type { AutomationRunner } from "./runner.js";

export interface AutomationScheduleView {
  name: string;
  schedule: string;
  mode: AutomationConfig["mode"];
  enabled: boolean;
  repoUrl: string | null;
  valid: boolean;
  nextRun: string | null;
  lastError: string | null;
}

type CronApi = Pick<typeof cron, "schedule" | "validate">;

interface ScheduledAutomationEntry {
  config: AutomationConfig;
  signature: string;
  task: ScheduledTask | null;
  valid: boolean;
  lastError: string | null;
}

interface AutomationSchedulerOptions {
  configStore: ConfigStore;
  runner: AutomationRunner;
  notificationManager?: NotificationManager;
  logger: RisolutoLogger;
  cronApi?: CronApi;
}

export class AutomationScheduler {
  private readonly entries = new Map<string, ScheduledAutomationEntry>();

  private unsubscribe: (() => void) | null = null;

  private readonly cronApi: CronApi;

  constructor(private readonly options: AutomationSchedulerOptions) {
    this.cronApi = options.cronApi ?? cron;
  }

  start(): void {
    this.sync(this.options.configStore.getConfig().automations ?? []);
    this.unsubscribe = this.options.configStore.subscribe(() => {
      this.sync(this.options.configStore.getConfig().automations ?? []);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const entry of this.entries.values()) {
      entry.task?.destroy();
    }
    this.entries.clear();
  }

  listAutomations(): AutomationScheduleView[] {
    return [...this.entries.values()]
      .map((entry) => ({
        name: entry.config.name,
        schedule: entry.config.schedule,
        mode: entry.config.mode,
        enabled: entry.config.enabled,
        repoUrl: entry.config.repoUrl,
        valid: entry.valid,
        nextRun: entry.task?.getNextRun()?.toISOString() ?? null,
        lastError: entry.lastError,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async runNow(name: string): Promise<AutomationRunRecord | null> {
    const entry = this.entries.get(name);
    if (!entry) {
      return null;
    }
    return this.options.runner.run(entry.config, "manual");
  }

  private sync(configs: AutomationConfig[]): void {
    const nextNames = new Set(configs.map((config) => config.name));
    for (const [name, entry] of this.entries) {
      if (!nextNames.has(name)) {
        entry.task?.destroy();
        this.entries.delete(name);
      }
    }

    for (const config of configs) {
      const signature = JSON.stringify(config);
      const existing = this.entries.get(config.name);
      if (existing && existing.signature === signature) {
        continue;
      }

      existing?.task?.destroy();
      const nextEntry = this.createEntry(config, signature);
      this.entries.set(config.name, nextEntry);
    }
  }

  private createEntry(config: AutomationConfig, signature: string): ScheduledAutomationEntry {
    if (!config.enabled) {
      return { config, signature, task: null, valid: true, lastError: null };
    }

    if (!this.cronApi.validate(config.schedule)) {
      const message = `Invalid cron expression for automation ${config.name}: ${config.schedule}`;
      this.options.logger.warn({ automationName: config.name, schedule: config.schedule }, message);
      void this.options.notificationManager?.notify({
        type: "automation_failed",
        severity: "warning",
        timestamp: new Date().toISOString(),
        title: config.name,
        message,
        source: "automation-scheduler",
        href: null,
        issue: {
          id: null,
          identifier: `automation:${config.name}`,
          title: config.name,
          state: null,
          url: null,
        },
        attempt: null,
        metadata: {
          automationName: config.name,
          schedule: config.schedule,
        },
        dedupeKey: `automation-invalid:${config.name}:${config.schedule}`,
      });
      return { config, signature, task: null, valid: false, lastError: message };
    }

    const task = this.cronApi.schedule(
      config.schedule,
      async () => {
        await this.options.runner.run(config, "schedule");
      },
      {
        name: config.name,
        noOverlap: true,
      },
    );
    return { config, signature, task, valid: true, lastError: null };
  }
}
