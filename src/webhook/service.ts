import type { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { RisolutoLogger, WebhookConfig } from "../core/types.js";
import type { PersistenceRuntime } from "../persistence/sqlite/runtime.js";
import type { SecretsStore } from "../secrets/store.js";
import { DefaultWebhookHealthTracker, type WebhookHealthTracker } from "./health-tracker.js";
import type { WebhookHandlerDeps } from "./http-adapter.js";
import type { WebhookPort, WebhookPortSnapshot } from "./port.js";
import { WebhookRegistrar, type WebhookRegistrationPort } from "./registrar.js";

type WebhookLinearClient = WebhookRegistrationPort & {
  runGraphQL(query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>>;
};

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

export interface WebhookService extends WebhookPort {
  webhookHealthTracker: WebhookHealthTracker | undefined;
  webhookInbox: PersistenceRuntime["webhook"]["inbox"] | undefined;
  webhookRegistrar: WebhookRegistrar | undefined;
}

export function createWebhookService(input: {
  persistence: PersistenceRuntime;
  webhookConfig: WebhookConfig | null | undefined;
  linearClient: WebhookLinearClient | null;
  eventBus: TypedEventBus<RisolutoEventMap>;
  secretsStore: Pick<SecretsStore, "get" | "set" | "delete">;
  logger: RisolutoLogger;
}): WebhookService {
  const webhookConfig = input.webhookConfig;
  const webhookUrlSet = !!webhookConfig?.webhookUrl;
  const webhookEnabled = evaluateWebhookConfig(webhookConfig, input.logger);
  const webhookPersistence = webhookUrlSet ? input.persistence.webhook : undefined;

  const webhookInbox = webhookPersistence?.inbox;
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
    buildHandlerDeps({ orchestrator, logger }): WebhookHandlerDeps | undefined {
      if (!webhookUrlSet) {
        return undefined;
      }

      return {
        getWebhookSecret: () => resolvedWebhookSecret.current,
        getPreviousWebhookSecret: () => resolvedPreviousWebhookSecret,
        requestRefresh: (reason: string) => orchestrator.requestRefresh(reason),
        requestTargetedRefresh: (issueId: string, issueIdentifier: string, reason: string) =>
          orchestrator.requestTargetedRefresh(issueId, issueIdentifier, reason),
        stopWorkerForIssue: (issueIdentifier: string, reason: string) =>
          orchestrator.stopWorkerForIssue(issueIdentifier, reason),
        recordVerifiedDelivery: (eventType: string) => webhookHealthTracker?.recordVerifiedDelivery(eventType),
        webhookInbox,
        logger: logger.child({ component: "webhook-handler" }),
      };
    },
    async getSnapshot(limit = 20): Promise<WebhookPortSnapshot> {
      if (!webhookPersistence) {
        return {
          health: webhookHealthTracker?.getHealth() ?? null,
          inboxStats: null,
          recentDeliveries: [],
        };
      }

      const snapshot = await webhookPersistence.getSnapshot(limit);
      return {
        health: webhookHealthTracker?.getHealth() ?? null,
        inboxStats: snapshot.stats,
        recentDeliveries: snapshot.recent,
      };
    },
  };
}
