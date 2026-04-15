import type { Response } from "express";

import type { RisolutoLogger } from "../core/types.js";
import { toErrorString } from "../utils/type-guards.js";

export interface VerifiedWebhookDelivery {
  deliveryId: string;
  type: string;
  action: string;
  entityId: string | null;
  issueId: string | null;
  issueIdentifier: string | null;
  webhookTimestamp: number | null;
  payloadJson: string | null;
}

export interface VerifiedWebhookDeliveryStore {
  insertVerified(delivery: VerifiedWebhookDelivery): Promise<{ isNew: boolean }>;
}

interface DeliveryLogContext {
  deliveryId: string;
  type: string;
  action: string;
}

function deliveryLogContext(delivery: VerifiedWebhookDelivery): DeliveryLogContext {
  return {
    deliveryId: delivery.deliveryId,
    type: delivery.type,
    action: delivery.action,
  };
}

export class WebhookDeliveryWorkflow {
  constructor(
    private readonly logger: RisolutoLogger,
    private readonly store?: VerifiedWebhookDeliveryStore,
  ) {}

  respondAccepted(
    res: Response,
    options: {
      delivery: VerifiedWebhookDelivery;
      status?: number;
      body?: unknown;
      eventType?: string;
      recordVerifiedDelivery?: (eventType: string) => void;
      process: () => void | Promise<void>;
      duplicateMessage?: string;
      errorMessage?: string;
    },
  ): void {
    res.status(options.status ?? 200).json(options.body ?? { ok: true });

    void this.ensureNew(options.delivery)
      .then((isNew) => {
        if (!isNew) {
          this.logger.debug(
            deliveryLogContext(options.delivery),
            options.duplicateMessage ?? "duplicate webhook delivery skipped",
          );
          return;
        }

        if (options.eventType && options.recordVerifiedDelivery) {
          options.recordVerifiedDelivery(options.eventType);
        }

        return options.process();
      })
      .catch((error) => {
        this.logger.error(
          {
            ...deliveryLogContext(options.delivery),
            error: toErrorString(error),
          },
          options.errorMessage ?? "webhook delivery processing failed",
        );
      });
  }

  async ensureNew(delivery: VerifiedWebhookDelivery): Promise<boolean> {
    if (!this.store) {
      return true;
    }

    try {
      const result = await this.store.insertVerified(delivery);
      return result.isNew;
    } catch (error) {
      this.logger.error(
        {
          ...deliveryLogContext(delivery),
          error: toErrorString(error),
        },
        "webhook inbox insert failed — proceeding without durable dedupe",
      );
      return true;
    }
  }
}
