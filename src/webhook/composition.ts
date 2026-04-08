/**
 * Webhook infrastructure composition helpers.
 *
 * Extracted from `src/cli/services.ts` to keep the service registry thin.
 * Responsible for instantiating the webhook inbox, health tracker, and
 * registrar from raw config and shared infrastructure.
 */

import type { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { RisolutoLogger, WebhookConfig } from "../core/types.js";
import type { WebhookHandlerDeps } from "../http/webhook-handler.js";
import { DefaultWebhookHealthTracker, type WebhookHealthTracker } from "./health-tracker.js";
import { WebhookRegistrar } from "./registrar.js";
import { SqliteWebhookInbox } from "../persistence/sqlite/webhook-inbox.js";
import type { PersistenceRuntime } from "../persistence/sqlite/runtime.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import type { SecretsStore } from "../secrets/store.js";
import type { createTracker } from "../tracker/factory.js";

/**
 * Evaluate webhook config and emit the appropriate startup log.
 *
 * Returns `true` when webhook mode is fully configured (both URL and
 * secret present), `false` otherwise.
 */
export function evaluateWebhookConfig(
  webhookConfig: WebhookConfig | null | undefined,
  logger: RisolutoLogger,
): boolean {
  if (webhookConfig?.webhookUrl && webhookConfig.webhookSecret) {
    logger.info({ webhookUrl: webhookConfig.webhookUrl }, "webhook mode enabled — waiting for first verified delivery");
    return true;
  }

  if (webhookConfig?.webhookUrl && !webhookConfig.webhookSecret) {
    logger.warn(
      { webhookUrl: webhookConfig.webhookUrl },
      "webhook_url is configured but webhook_secret is missing — set $LINEAR_WEBHOOK_SECRET or configure webhook_secret in Settings",
    );
  }

  return false;
}

export interface WebhookInfrastructure {
  webhookUrlSet: boolean;
  webhookHealthTracker: WebhookHealthTracker | undefined;
  webhookInbox: SqliteWebhookInbox | undefined;
  webhookRegistrar: WebhookRegistrar | undefined;
  resolvedWebhookSecret: { current: string | null };
  resolvedPreviousWebhookSecret: string | null;
}

/**
 * Initialize webhook infrastructure: inbox, health tracker, registrar.
 * Returns a mutable secret reference that the registrar can update.
 */
export function initWebhookInfrastructure(input: {
  persistence: PersistenceRuntime;
  webhookConfig: WebhookConfig | null | undefined;
  linearClient: ReturnType<typeof createTracker>["linearClient"];
  eventBus: TypedEventBus<RisolutoEventMap>;
  secretsStore: SecretsStore;
  logger: RisolutoLogger;
}): WebhookInfrastructure {
  const webhookConfig = input.webhookConfig;
  const webhookUrlSet = !!webhookConfig?.webhookUrl;
  const webhookEnabled = evaluateWebhookConfig(webhookConfig, input.logger);

  const webhookInbox = webhookUrlSet
    ? new SqliteWebhookInbox(input.persistence.db, input.logger.child({ component: "webhook-inbox" }))
    : undefined;

  const webhookHealthTracker = webhookEnabled
    ? new DefaultWebhookHealthTracker({
        config: webhookConfig!,
        eventBus: input.eventBus,
        logger: input.logger.child({ component: "webhook-health" }),
        linearClient: input.linearClient ?? undefined,
      })
    : undefined;

  const resolvedWebhookSecret = { current: webhookConfig?.webhookSecret ?? null };
  const resolvedPreviousWebhookSecret = webhookConfig?.previousWebhookSecret ?? null;

  const webhookRegistrar =
    webhookUrlSet && input.linearClient
      ? new WebhookRegistrar({
          linearClient: input.linearClient,
          secretsStore: input.secretsStore,
          getWebhookConfig: () => input.webhookConfig,
          onSecretResolved: (secret) => {
            resolvedWebhookSecret.current = secret;
          },
          logger: input.logger.child({ component: "webhook-registrar" }),
        })
      : undefined;

  return {
    webhookUrlSet,
    webhookHealthTracker,
    webhookInbox,
    webhookRegistrar,
    resolvedWebhookSecret,
    resolvedPreviousWebhookSecret,
  };
}

/**
 * Build webhook handler deps when webhook URL is configured.
 */
export function buildWebhookHandlerDeps(input: {
  orchestrator: Orchestrator;
  webhookHealthTracker: WebhookHealthTracker | undefined;
  webhookInbox: SqliteWebhookInbox | undefined;
  getWebhookSecret: () => string | null;
  getPreviousWebhookSecret: () => string | null;
  logger: RisolutoLogger;
}): WebhookHandlerDeps {
  return {
    getWebhookSecret: input.getWebhookSecret,
    getPreviousWebhookSecret: input.getPreviousWebhookSecret,
    requestRefresh: (reason: string) => input.orchestrator.requestRefresh(reason),
    requestTargetedRefresh: (issueId: string, issueIdentifier: string, reason: string) =>
      input.orchestrator.requestTargetedRefresh(issueId, issueIdentifier, reason),
    stopWorkerForIssue: (issueIdentifier: string, reason: string) =>
      input.orchestrator.stopWorkerForIssue(issueIdentifier, reason),
    recordVerifiedDelivery: (eventType: string) => input.webhookHealthTracker?.recordVerifiedDelivery(eventType),
    webhookInbox: input.webhookInbox,
    logger: input.logger.child({ component: "webhook-handler" }),
  };
}
