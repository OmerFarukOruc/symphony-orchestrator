import { test, expect } from "../../fixtures/test";

test.describe("Audit Log Page Smoke", () => {
  test.beforeEach(async ({ apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);
  });

  test("navigates to /audit and renders page", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.locator(".audit-page, .page").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Audit Log").first()).toBeVisible();
  });

  test("sidebar shows Audit Log under Observe", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('.sidebar-item[data-path="/audit"]')).toBeVisible({ timeout: 5000 });
  });

  test("audit table loads with entries", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.locator(".audit-table").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=codex.model").first()).toBeVisible({ timeout: 5000 });
  });

  test("audit entries show operation badges", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.locator(".audit-op").first()).toBeVisible({ timeout: 5000 });
  });

  test("live indicator is visible", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.locator(".audit-live-dot").first()).toBeVisible({ timeout: 5000 });
  });

  test("keyboard shortcut g a navigates to audit", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.keyboard.press("g");
    await page.keyboard.press("a");
    await page.waitForURL("**/audit", { timeout: 5000 });
    expect(new URL(page.url()).pathname).toBe("/audit");
  });

  test("filter select is present with table options", async ({ page }) => {
    await page.goto("/audit");
    const select = page.locator(".audit-filters select").first();
    await expect(select).toBeVisible({ timeout: 5000 });
    await expect(select.locator("option")).toHaveCount(4); // All, Config, Secrets, Templates
  });
});
