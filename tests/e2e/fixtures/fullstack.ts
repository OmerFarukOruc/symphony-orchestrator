/**
 * Playwright fixtures for fullstack E2E tests.
 *
 * Provides:
 * - `fullstackBaseUrl`: The URL of the real backend started by global setup.
 * - `webhookSecret`: The HMAC-SHA256 secret for signing webhook payloads.
 * - `signWebhook(body)`: Helper that returns headers needed to POST a signed
 *   webhook to `/webhooks/linear`.
 * - `postWebhook(payload, deliveryId?)`: Convenience method that signs, serializes,
 *   and POSTs a webhook payload, returning the fetch Response.
 */

import { createHmac, randomUUID } from "node:crypto";

import { test as base, expect } from "@playwright/test";

export interface WebhookHeaders {
  "Content-Type": string;
  "Linear-Signature": string;
  "Linear-Delivery": string;
}

export interface FullstackFixture {
  /** Base URL of the running fullstack server (e.g. `http://127.0.0.1:54321`). */
  fullstackBaseUrl: string;
  /** The webhook HMAC-SHA256 secret. */
  webhookSecret: string;
  /**
   * Compute HMAC-SHA256 signature headers for a raw body string.
   * Returns headers ready to spread into a `fetch()` call.
   */
  signWebhook(rawBody: string, deliveryId?: string): WebhookHeaders;
  /**
   * Serialize a payload to JSON, sign it, and POST to `/webhooks/linear`.
   * Returns the fetch `Response`.
   */
  postWebhook(payload: Record<string, unknown>, deliveryId?: string): Promise<Response>;
}

export const test = base.extend<{ fullstack: FullstackFixture }>({
  fullstack: async ({ page: _page }, use) => {
    const fullstackBaseUrl = process.env.FULLSTACK_BASE_URL;
    const webhookSecret = process.env.FULLSTACK_WEBHOOK_SECRET;

    if (!fullstackBaseUrl || !webhookSecret) {
      throw new Error(
        "Fullstack fixtures require FULLSTACK_BASE_URL and FULLSTACK_WEBHOOK_SECRET. " +
          "Run with: pnpm exec playwright test --config playwright.fullstack.config.ts",
      );
    }

    const signWebhook = (rawBody: string, deliveryId?: string): WebhookHeaders => {
      const signature = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
      return {
        "Content-Type": "application/json",
        "Linear-Signature": signature,
        "Linear-Delivery": deliveryId ?? randomUUID(),
      };
    };

    const postWebhook = async (payload: Record<string, unknown>, deliveryId?: string): Promise<Response> => {
      const rawBody = JSON.stringify(payload);
      const headers = signWebhook(rawBody, deliveryId);
      return fetch(`${fullstackBaseUrl}/webhooks/linear`, {
        method: "POST",
        headers,
        body: rawBody,
      });
    };

    const fixture: FullstackFixture = {
      fullstackBaseUrl,
      webhookSecret,
      signWebhook,
      postWebhook,
    };

    await use(fixture);
  },
});

export { expect };
