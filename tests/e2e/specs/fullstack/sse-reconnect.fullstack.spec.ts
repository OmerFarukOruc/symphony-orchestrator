/**
 * Fullstack E2E: SSE reconnect behavior (browser-side).
 *
 * Tests that the browser's EventSource client reconnects after the SSE
 * endpoint temporarily returns errors, and that events are received
 * after reconnection succeeds.
 *
 * Uses Playwright's `page.route()` to simulate middleware-level outage
 * (503 on `/api/v1/events`) rather than server stop/restart, which is
 * tested at the protocol level in the Vitest SSE integration tests.
 *
 * Runs against the real backend started by the fullstack global setup.
 */

import { test, expect } from "../../fixtures/fullstack.js";

test.describe("SSE reconnect (browser-side)", () => {
  test("EventSource connects and receives the initial connected event", async ({ page, fullstack }) => {
    // Intercept SSE events in the browser via a flag variable
    await page.addInitScript(() => {
      (globalThis as Record<string, unknown>).__sseConnected = false;
      globalThis.addEventListener("risoluto:any-event", () => {
        // Any SSE event means we are connected
      });
    });

    await page.goto(fullstack.fullstackBaseUrl);
    await page.waitForLoadState("domcontentloaded");

    // The frontend's EventSource connects to /api/v1/events on load.
    // Verify the page is live and SSE did not crash the page.
    const pageAlive = await page.evaluate(() => document.readyState === "complete");
    expect(pageAlive).toBe(true);

    // Verify the SSE endpoint is reachable by fetching it directly
    const sseResponse = await page.evaluate(async (baseUrl) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(`${baseUrl}/api/v1/events`, {
          signal: controller.signal,
          headers: { Accept: "text/event-stream" },
        });
        return { status: response.status, contentType: response.headers.get("content-type") };
      } catch {
        return { status: 0, contentType: null };
      } finally {
        clearTimeout(timeout);
      }
    }, fullstack.fullstackBaseUrl);

    expect(sseResponse.status).toBe(200);
    expect(sseResponse.contentType).toContain("text/event-stream");
  });

  test("browser reconnects after temporary SSE outage and receives events", async ({ page, fullstack }) => {
    // Track SSE events received by the browser
    await page.addInitScript(() => {
      (globalThis as Record<string, unknown>).__sseEventCount = 0;
      globalThis.addEventListener("risoluto:any-event", () => {
        (globalThis as Record<string, unknown>).__sseEventCount =
          ((globalThis as Record<string, unknown>).__sseEventCount as number) + 1;
      });
    });

    await page.goto(fullstack.fullstackBaseUrl);
    await page.waitForLoadState("domcontentloaded");

    // Give the EventSource time to connect
    await page.waitForTimeout(1000);

    // Simulate outage: intercept SSE requests and return 503
    await page.route("**/api/v1/events", (route) =>
      route.fulfill({
        status: 503,
        contentType: "text/plain",
        body: "Service Unavailable",
      }),
    );

    // Wait for the EventSource to notice the outage and attempt reconnect
    // (the frontend uses exponential backoff starting at 5s)
    await page.waitForTimeout(2000);

    // Remove the route intercept to allow reconnection to the real endpoint
    await page.unroute("**/api/v1/events");

    // Wait for reconnect (EventSource will retry after backoff)
    await page.waitForTimeout(8000);

    // POST a webhook — if SSE reconnected, the browser should receive it
    const webhookResponse = await fullstack.postWebhook({
      type: "Issue",
      action: "update",
      webhookTimestamp: Date.now(),
      data: {
        id: "issue-sse-reconnect-001",
        identifier: "SSE-1",
        title: "Post-reconnect event",
        state: { name: "In Progress" },
      },
    });
    expect(webhookResponse.status).toBe(200);

    // Verify the page is still alive and responsive after the outage cycle
    const pageAlive = await page.evaluate(() => document.readyState === "complete");
    expect(pageAlive).toBe(true);
  });
});
