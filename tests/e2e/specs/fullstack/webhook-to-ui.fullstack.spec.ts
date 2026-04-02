/**
 * Fullstack E2E: Webhook-to-UI pipeline.
 *
 * Tests that POSTing a signed Linear webhook to `/webhooks/linear` causes
 * the frontend to reflect the state change via SSE — no page reload needed.
 *
 * Runs against the real backend started by the fullstack global setup.
 */

import { test, expect } from "../../fixtures/fullstack.js";

test.describe("Webhook to UI pipeline", () => {
  test("POST signed Issue:update webhook is accepted and returns 200", async ({ fullstack }) => {
    const response = await fullstack.postWebhook({
      type: "Issue",
      action: "update",
      webhookTimestamp: Date.now(),
      data: {
        id: "issue-fs-001",
        identifier: "FS-1",
        title: "Fullstack webhook test",
        state: { name: "In Progress" },
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test("browser overview page receives SSE update after webhook POST", async ({ page, fullstack }) => {
    // Set up SSE event counter before navigation so the listener is in place
    // before EventSource connects.
    await page.addInitScript(() => {
      (globalThis as Record<string, unknown>).__sseEventCount = 0;
      globalThis.addEventListener("risoluto:any-event", () => {
        (globalThis as Record<string, unknown>).__sseEventCount =
          ((globalThis as Record<string, unknown>).__sseEventCount as number) + 1;
      });
    });

    // Navigate to the dashboard overview.
    // Note: "networkidle" cannot be used because the SSE stream keeps the
    // network perpetually active. Use "domcontentloaded" + explicit waiter.
    await page.goto(fullstack.fullstackBaseUrl);
    await page.waitForLoadState("domcontentloaded");

    // Wait for the SPA to mount its main content container
    await page.waitForFunction(
      () => {
        const main = document.getElementById("main-content");
        return main !== null;
      },
      { timeout: 10_000 },
    );

    // Give EventSource time to connect before posting the webhook
    await page.waitForTimeout(1000);

    const initialEventCount = await page.evaluate(
      () => (globalThis as Record<string, unknown>).__sseEventCount as number,
    );

    // POST a signed webhook — the event bus should emit an event that SSE forwards
    const response = await fullstack.postWebhook({
      type: "Issue",
      action: "update",
      webhookTimestamp: Date.now(),
      data: {
        id: "issue-fs-002",
        identifier: "FS-2",
        title: "SSE update test issue",
        state: { name: "In Progress" },
      },
    });
    expect(response.status).toBe(200);

    // Wait for the SSE event to propagate to the browser (up to 5 seconds).
    await page.waitForFunction(
      (baseline) => ((globalThis as Record<string, unknown>).__sseEventCount as number) > baseline,
      initialEventCount,
      { timeout: 5000 },
    );

    const eventCount = await page.evaluate(() => (globalThis as Record<string, unknown>).__sseEventCount as number);
    expect(eventCount).toBeGreaterThan(0);
  });

  test("webhook for unknown issue does not crash the page", async ({ page, fullstack }) => {
    await page.goto(fullstack.fullstackBaseUrl);
    await page.waitForLoadState("domcontentloaded");

    // POST webhook referencing an issue not tracked by the orchestrator
    const response = await fullstack.postWebhook({
      type: "Issue",
      action: "update",
      webhookTimestamp: Date.now(),
      data: {
        id: "issue-phantom-999",
        identifier: "PHANTOM-999",
        title: "Ghost issue",
        state: { name: "Triage" },
      },
    });

    expect(response.status).toBe(200);

    // Page should remain functional — no unhandled error, no blank screen
    await page.waitForTimeout(500);
    const bodyText = await page.evaluate(() => document.body.textContent ?? "");
    expect(bodyText.length).toBeGreaterThan(0);
  });
});
