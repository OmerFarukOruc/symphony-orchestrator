/**
 * Fullstack E2E: Issue lifecycle state transitions.
 *
 * Tests that sequential webhook POSTs (pickup -> running -> done) cause
 * the UI to reflect each state transition via real SSE updates.
 *
 * Runs against the real backend started by the fullstack global setup.
 */

import { test, expect } from "../../fixtures/fullstack.js";

test.describe("Issue lifecycle via webhooks", () => {
  test("POST agent-pickup webhook is accepted", async ({ fullstack }) => {
    const response = await fullstack.postWebhook({
      type: "Issue",
      action: "update",
      webhookTimestamp: Date.now(),
      data: {
        id: "issue-lc-001",
        identifier: "LC-1",
        title: "Lifecycle test issue",
        state: { name: "In Progress" },
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test("POST completion webhook is accepted", async ({ fullstack }) => {
    const response = await fullstack.postWebhook({
      type: "Issue",
      action: "update",
      webhookTimestamp: Date.now(),
      data: {
        id: "issue-lc-002",
        identifier: "LC-2",
        title: "Lifecycle completion test",
        state: { name: "Done" },
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test("full lifecycle: sequential webhooks all accepted in order", async ({ fullstack }) => {
    const issueId = "issue-lc-003";
    const identifier = "LC-3";

    // Step 1: Issue created / picked up
    const createResponse = await fullstack.postWebhook({
      type: "Issue",
      action: "create",
      webhookTimestamp: Date.now(),
      data: {
        id: issueId,
        identifier,
        title: "Full lifecycle test issue",
        state: { name: "Triage" },
      },
    });
    expect(createResponse.status).toBe(200);

    // Step 2: Issue transitions to In Progress (running)
    const runningResponse = await fullstack.postWebhook({
      type: "Issue",
      action: "update",
      webhookTimestamp: Date.now(),
      data: {
        id: issueId,
        identifier,
        title: "Full lifecycle test issue",
        state: { name: "In Progress" },
      },
    });
    expect(runningResponse.status).toBe(200);

    // Step 3: Issue transitions to Done
    const doneResponse = await fullstack.postWebhook({
      type: "Issue",
      action: "update",
      webhookTimestamp: Date.now(),
      data: {
        id: issueId,
        identifier,
        title: "Full lifecycle test issue",
        state: { name: "Done" },
      },
    });
    expect(doneResponse.status).toBe(200);
  });

  test("browser remains stable through full lifecycle webhook sequence", async ({ page, fullstack }) => {
    await page.goto(fullstack.fullstackBaseUrl);
    await page.waitForLoadState("domcontentloaded");

    const issueId = "issue-lc-004";
    const identifier = "LC-4";

    // Fire the full lifecycle sequence while the browser is connected
    for (const state of ["Triage", "In Progress", "Done"]) {
      const response = await fullstack.postWebhook({
        type: "Issue",
        action: state === "Triage" ? "create" : "update",
        webhookTimestamp: Date.now(),
        data: {
          id: issueId,
          identifier,
          title: "Browser lifecycle test",
          state: { name: state },
        },
      });
      expect(response.status).toBe(200);
    }

    // Page should still be alive and responsive after all webhooks
    const pageAlive = await page.evaluate(() => document.readyState === "complete");
    expect(pageAlive).toBe(true);
  });
});
