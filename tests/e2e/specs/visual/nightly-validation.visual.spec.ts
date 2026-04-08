import { test, expect } from "@playwright/test";

const shouldFail = process.env.NIGHTLY_VALIDATION_MODE === "visual-fail";

test.describe("nightly validation", () => {
  test.skip(!shouldFail, "nightly validation disabled for visual project");

  test("emits a deterministic visual failure after report artifacts are generated", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    expect(
      "nightly validation marker: visual-fail",
      "workflow_dispatch validation should fail after Playwright artifacts exist",
    ).toBe("");
  });
});
