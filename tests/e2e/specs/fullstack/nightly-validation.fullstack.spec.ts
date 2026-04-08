import { test, expect } from "../../fixtures/fullstack.js";

const shouldFail = process.env.NIGHTLY_VALIDATION_MODE === "fullstack-fail";

test.describe("nightly validation", () => {
  test.skip(!shouldFail, "nightly validation disabled for fullstack project");

  test("emits a deterministic fullstack failure after artifacts are available", async ({ page, fullstack }) => {
    await page.goto(fullstack.fullstackBaseUrl);
    await expect(page.locator("body")).toBeVisible();
    expect(
      "nightly validation marker: fullstack-fail",
      "workflow_dispatch validation should fail after Playwright artifacts exist",
    ).toBe("");
  });
});
