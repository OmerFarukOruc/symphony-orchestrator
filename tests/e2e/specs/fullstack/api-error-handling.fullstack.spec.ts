/**
 * Fullstack E2E: API error handling.
 *
 * Tests that the real backend returns correct error responses for invalid
 * requests, and that the browser UI handles error states gracefully.
 *
 * Runs against the real backend started by the fullstack global setup.
 */

import { test, expect } from "../../fixtures/fullstack.js";

test.describe("API error handling", () => {
  test("GET /api/v1/<nonexistent-issue> returns 404", async ({ fullstack }) => {
    const response = await fetch(`${fullstack.fullstackBaseUrl}/api/v1/NONEXISTENT-999`);

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not_found");
  });

  test("POST /api/v1/NONEXISTENT-999/abort returns 404 for unknown issue", async ({ fullstack }) => {
    const response = await fetch(`${fullstack.fullstackBaseUrl}/api/v1/NONEXISTENT-999/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not_found");
  });

  test("GET /api/v1/nonexistent-route returns 404", async ({ fullstack }) => {
    const response = await fetch(`${fullstack.fullstackBaseUrl}/api/v1/this/route/does/not/exist`);

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  test("POST /webhooks/linear without signature returns 401", async ({ fullstack }) => {
    const response = await fetch(`${fullstack.fullstackBaseUrl}/webhooks/linear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "Issue",
        action: "update",
        webhookTimestamp: Date.now(),
        data: { id: "issue-bad-001" },
      }),
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("signature_missing");
  });

  test("POST /webhooks/linear with bad signature returns 401", async ({ fullstack }) => {
    const payload = JSON.stringify({
      type: "Issue",
      action: "update",
      webhookTimestamp: Date.now(),
      data: { id: "issue-bad-002" },
    });

    const response = await fetch(`${fullstack.fullstackBaseUrl}/webhooks/linear`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Linear-Signature": "deadbeef0000000000000000000000000000000000000000000000000000cafe",
        "Linear-Delivery": "bad-sig-delivery-001",
      },
      body: payload,
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("signature_invalid");
  });

  test("navigating to /issues/NONEXISTENT-999 renders gracefully", async ({ page, fullstack }) => {
    await page.goto(`${fullstack.fullstackBaseUrl}/issues/NONEXISTENT-999`);
    await page.waitForLoadState("networkidle");

    // The page should not crash — SPA catch-all serves index.html
    const pageAlive = await page.evaluate(() => document.readyState === "complete");
    expect(pageAlive).toBe(true);

    // The page should have some content rendered (not blank)
    const bodyText = await page.evaluate(() => document.body.textContent ?? "");
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test("PUT on webhook endpoint returns 405 Method Not Allowed", async ({ fullstack }) => {
    const response = await fetch(`${fullstack.fullstackBaseUrl}/webhooks/linear`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(405);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("method_not_allowed");
  });
});
