import type { ConfigOverlayPort } from "./overlay.js";
import { collectDispatchWarnings, validateDispatch } from "./validators.js";
import type { SecretsStore } from "../secrets/store.js";
import { toErrorString } from "../utils/type-guards.js";
import type { SymphonyLogger, ValidationError, WorkflowDefinition, ServiceConfig } from "../core/types.js";
import { deriveServiceConfig } from "./builders.js";
import { cloneConfigMap, deepMerge } from "./merge.js";

export class ConfigStore {
  private config: ServiceConfig | null = null;
  private mergedConfigMap: Record<string, unknown> = {};
  private readonly listeners = new Set<() => void>();
  private overlayUnsubscribe: (() => void) | null = null;
  private secretsUnsubscribe: (() => void) | null = null;

  constructor(
    private readonly logger: SymphonyLogger,
    private readonly deps?: {
      overlayStore?: Pick<ConfigOverlayPort, "toMap" | "subscribe">;
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
  }

  async stop(): Promise<void> {
    this.overlayUnsubscribe?.();
    this.overlayUnsubscribe = null;
    this.secretsUnsubscribe?.();
    this.secretsUnsubscribe = null;
  }

  async refresh(reason: string): Promise<void> {
    try {
      const workflow: WorkflowDefinition = { config: {}, promptTemplate: "" };
      const overlay = cloneConfigMap(this.deps?.overlayStore?.toMap() ?? {});
      const mergedConfigMap = deepMerge(workflow.config, overlay) as Record<string, unknown>;
      const config = deriveServiceConfig(workflow, {
        overlay,
        secretResolver: (name) => this.deps?.secretsStore?.get(name) ?? undefined,
      });
      this.config = config;
      this.mergedConfigMap = mergedConfigMap;
      this.logger.info({ reason }, "config refreshed");
      for (const warning of collectDispatchWarnings(config)) {
        this.logger.warn({ code: warning.code, reason }, warning.message);
      }
      for (const listener of this.listeners) {
        listener();
      }
    } catch (error) {
      if (this.config === null) {
        throw error;
      }
      this.logger.error(
        {
          reason,
          error: toErrorString(error),
        },
        "config reload rejected; keeping last known good config",
      );
    }
  }

  /**
   * @deprecated ConfigStore no longer loads workflow files. Returns an empty
   * WorkflowDefinition stub. Use getConfig() for runtime configuration.
   * Will be removed when worker-launcher.ts is updated in a subsequent unit.
   */
  getWorkflow(): WorkflowDefinition {
    return { config: {}, promptTemplate: "" };
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
