import type { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { RisolutoLogger, WebhookConfig } from "../core/types.js";
import type { PersistenceRuntime } from "../persistence/sqlite/runtime.js";
import type { WebhookHandlerDeps } from "../http/webhook-handler.js";
import type { OrchestratorPort } from "../orchestrator/port.js";
import type { SecretsStore } from "../secrets/store.js";
import type { createTracker } from "../tracker/factory.js";
import { createWebhookRuntime, evaluateWebhookConfig, type WebhookRuntime } from "./runtime.js";

/**
 * Webhook infrastructure composition helpers.
 *
 * Kept as a stable compatibility surface for CLI/service wiring while the
 * real lifecycle lives in `src/webhook/runtime.ts`.
 */
export { evaluateWebhookConfig };

export type WebhookInfrastructure = WebhookRuntime;

/**
 * Initialize webhook infrastructure: inbox, health tracker, registrar.
 * Returns a runtime boundary that owns persistence, health, registration,
 * secret resolution, and handler dependency assembly.
 */
export function initWebhookInfrastructure(input: {
  persistence: PersistenceRuntime;
  webhookConfig: WebhookConfig | null | undefined;
  linearClient: ReturnType<typeof createTracker>["linearClient"];
  eventBus: TypedEventBus<RisolutoEventMap>;
  secretsStore: SecretsStore;
  logger: RisolutoLogger;
}): WebhookInfrastructure {
  return createWebhookRuntime({
    persistence: input.persistence,
    webhookConfig: input.webhookConfig,
    linearClient: input.linearClient ?? null,
    eventBus: input.eventBus,
    secretsStore: input.secretsStore,
    logger: input.logger,
  });
}

/**
 * Build webhook handler deps through the runtime boundary.
 */
export function buildWebhookHandlerDeps(input: {
  orchestrator: Pick<OrchestratorPort, "requestRefresh" | "requestTargetedRefresh" | "stopWorkerForIssue">;
  webhook: WebhookRuntime;
  logger: RisolutoLogger;
}): WebhookHandlerDeps {
  return input.webhook.buildHandlerDeps({
    orchestrator: input.orchestrator,
    logger: input.logger,
  })!;
}
