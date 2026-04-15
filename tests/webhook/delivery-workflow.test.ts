import { describe, expect, it, vi } from "vitest";

import { WebhookDeliveryWorkflow } from "../../src/webhook/delivery-workflow.js";
import { createMockLogger, makeMockResponse } from "../helpers.js";

describe("WebhookDeliveryWorkflow", () => {
  it("responds immediately, records accepted deliveries, and runs the processor for new deliveries", async () => {
    const logger = createMockLogger();
    const insertVerified = vi.fn().mockResolvedValue({ isNew: true });
    const recordVerifiedDelivery = vi.fn();
    const process = vi.fn();
    const res = makeMockResponse();
    const workflow = new WebhookDeliveryWorkflow(logger, { insertVerified });

    workflow.respondAccepted(res, {
      delivery: {
        deliveryId: "delivery-1",
        type: "Issue",
        action: "update",
        entityId: "entity-1",
        issueId: "issue-1",
        issueIdentifier: "ENG-1",
        webhookTimestamp: Date.now(),
        payloadJson: '{"ok":true}',
      },
      eventType: "Issue:update",
      recordVerifiedDelivery,
      process,
    });

    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(insertVerified).toHaveBeenCalledOnce();
    expect(recordVerifiedDelivery).toHaveBeenCalledWith("Issue:update");
    expect(process).toHaveBeenCalledOnce();
  });

  it("skips duplicate deliveries without recording or processing", async () => {
    const logger = createMockLogger();
    const insertVerified = vi.fn().mockResolvedValue({ isNew: false });
    const recordVerifiedDelivery = vi.fn();
    const process = vi.fn();
    const workflow = new WebhookDeliveryWorkflow(logger, { insertVerified });

    workflow.respondAccepted(makeMockResponse(), {
      delivery: {
        deliveryId: "delivery-dup",
        type: "issues",
        action: "opened",
        entityId: null,
        issueId: "7",
        issueIdentifier: "acme/app#7",
        webhookTimestamp: null,
        payloadJson: '{"action":"opened"}',
      },
      eventType: "issues:opened",
      recordVerifiedDelivery,
      process,
      duplicateMessage: "duplicate github webhook delivery skipped",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(recordVerifiedDelivery).not.toHaveBeenCalled();
    expect(process).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      { deliveryId: "delivery-dup", type: "issues", action: "opened" },
      "duplicate github webhook delivery skipped",
    );
  });

  it("ensureNew returns true when no store is configured", async () => {
    const workflow = new WebhookDeliveryWorkflow(createMockLogger());

    await expect(
      workflow.ensureNew({
        deliveryId: "delivery-free",
        type: "Trigger",
        action: "re_poll",
        entityId: null,
        issueId: null,
        issueIdentifier: null,
        webhookTimestamp: null,
        payloadJson: '{"action":"re_poll"}',
      }),
    ).resolves.toBe(true);
  });
});
