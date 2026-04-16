import type { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { RisolutoLogger } from "../core/types.js";
import type { ConfigStore } from "../config/store.js";
import type { NotificationManager } from "../notification/manager.js";
import type { AlertHistoryStorePort } from "./history-store.js";
import { AlertPipeline } from "./alert-pipeline.js";
import { toErrorString } from "../utils/type-guards.js";

interface AlertEngineOptions {
  configStore: ConfigStore;
  eventBus: TypedEventBus<RisolutoEventMap>;
  notificationManager: NotificationManager;
  historyStore: AlertHistoryStorePort;
  logger: RisolutoLogger;
  pipeline?: AlertPipeline;
}

type EventPayload = RisolutoEventMap[keyof RisolutoEventMap];

export class AlertEngine {
  private readonly pipeline: AlertPipeline;

  private readonly onAnyHandler = (channel: keyof RisolutoEventMap, payload: EventPayload) => {
    if (String(channel).startsWith("notification.")) {
      return;
    }
    void this.pipeline.processEvent(String(channel), payload).catch((error: unknown) => {
      this.options.logger.error(
        { channel: String(channel), error: toErrorString(error) },
        "alert pipeline processing failed",
      );
    });
  };

  constructor(private readonly options: AlertEngineOptions) {
    this.pipeline =
      options.pipeline ??
      new AlertPipeline({
        configStore: options.configStore,
        notificationManager: options.notificationManager,
        historyStore: options.historyStore,
        logger: options.logger,
      });
  }

  start(): void {
    this.options.eventBus.onAny(this.onAnyHandler);
  }

  stop(): void {
    this.options.eventBus.offAny(this.onAnyHandler);
  }
}
