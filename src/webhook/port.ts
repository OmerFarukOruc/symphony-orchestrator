import type { RisolutoLogger } from "../core/types.js";
import type { WebhookHandlerDeps } from "./http-adapter.js";
import type { OrchestratorPort } from "../orchestrator/port.js";
import type { WebhookDeliveryRecord, WebhookInboxStats } from "../persistence/sqlite/webhook-inbox.js";
import type { WebhookHealthState } from "./types.js";

type WebhookOrchestrator = Pick<OrchestratorPort, "requestRefresh" | "requestTargetedRefresh" | "stopWorkerForIssue">;

export interface WebhookPortSnapshot {
  health: WebhookHealthState | null;
  inboxStats: WebhookInboxStats | null;
  recentDeliveries: WebhookDeliveryRecord[];
}

export interface WebhookPort {
  webhookUrlSet: boolean;
  resolvedWebhookSecret: { current: string | null };
  resolvedPreviousWebhookSecret: string | null;
  buildHandlerDeps(input: {
    orchestrator: WebhookOrchestrator;
    logger: RisolutoLogger;
  }): WebhookHandlerDeps | undefined;
  getSnapshot(limit?: number): Promise<WebhookPortSnapshot>;
}
