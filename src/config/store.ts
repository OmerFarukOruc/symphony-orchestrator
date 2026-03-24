import chokidar, { type FSWatcher } from "chokidar";

import type { ConfigOverlayStore } from "./overlay.js";
import { collectDispatchWarnings, validateDispatch } from "./validators.js";
import type { SecretsStore } from "../secrets/store.js";
import type { SymphonyLogger, ValidationError, WorkflowDefinition, ServiceConfig } from "../core/types.js";
import { loadWorkflowDefinition } from "../workflow/loader.js";
import { deriveServiceConfig } from "./builders.js";
import { cloneConfigMap, deepMerge } from "./merge.js";

export class ConfigStore {
  private watcher: FSWatcher | null = null;
  private workflow: WorkflowDefinition | null = null;
  private config: ServiceConfig | null = null;
  private mergedConfigMap: Record<string, unknown> = {};
  private readonly listeners = new Set<() => void>();
  private overlayUnsubscribe: (() => void) | null = null;
  private secretsUnsubscribe: (() => void) | null = null;

  constructor(
    private readonly workflowPath: string,
    private readonly logger: SymphonyLogger,
    private readonly deps?: {
      overlayStore?: Pick<ConfigOverlayStore, "toMap" | "subscribe">;
      secretsStore?: Pick<SecretsStore, "get" | "subscribe">;
    },
  ) {}

  async start(): Promise<void> {
    await this.refresh("startup");
    this.overlayUnsubscribe =
      this.deps?.overlayStore?.subscribe(() => {
        void this.refresh("overlay:change");
      }) ?? null;
    this.secretsUnsubscribe =
      this.deps?.secretsStore?.subscribe(() => {
        void this.refresh("secrets:change");
      }) ?? null;
    this.watcher = chokidar.watch(this.workflowPath, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
    });
    this.watcher.on("add", () => void this.refresh("watch:add"));
    this.watcher.on("change", () => void this.refresh("watch:change"));
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.overlayUnsubscribe?.();
    this.overlayUnsubscribe = null;
    this.secretsUnsubscribe?.();
    this.secretsUnsubscribe = null;
  }

  async refresh(reason: string): Promise<void> {
    try {
      const workflow = await loadWorkflowDefinition(this.workflowPath);
      const overlay = cloneConfigMap(this.deps?.overlayStore?.toMap() ?? {});
      const mergedConfigMap = deepMerge(workflow.config, overlay) as Record<string, unknown>;
      const config = deriveServiceConfig(workflow, {
        overlay,
        secretResolver: (name) => this.deps?.secretsStore?.get(name) ?? undefined,
      });
      this.workflow = workflow;
      this.config = config;
      this.mergedConfigMap = mergedConfigMap;
      this.logger.info({ workflowPath: this.workflowPath, reason }, "workflow loaded");
      for (const warning of collectDispatchWarnings(config)) {
        this.logger.warn({ workflowPath: this.workflowPath, code: warning.code, reason }, warning.message);
      }
      for (const listener of this.listeners) {
        listener();
      }
    } catch (error) {
      if (this.config === null || this.workflow === null) {
        throw error;
      }
      this.logger.error(
        {
          workflowPath: this.workflowPath,
          reason,
          error: error instanceof Error ? error.message : String(error),
        },
        "workflow reload rejected; keeping last known good config",
      );
    }
  }

  getWorkflow(): WorkflowDefinition {
    if (!this.workflow) {
      throw new Error("config store has not been started");
    }
    return this.workflow;
  }

  getConfig(): ServiceConfig {
    if (!this.config) {
      throw new Error("config store has not been started");
    }
    return this.config;
  }

  getMergedConfigMap(): Record<string, unknown> {
    return cloneConfigMap(this.mergedConfigMap);
  }

  validateDispatch(): ValidationError | null {
    return validateDispatch(this.getConfig());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
