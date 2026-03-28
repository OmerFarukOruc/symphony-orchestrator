import { test, expect } from "../../fixtures/test";

test.describe("Templates Page Smoke", () => {
  test.beforeEach(async ({ apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);
  });

  test("navigates to /templates and renders page", async ({ page }) => {
    await page.goto("/templates");
    await expect(page.locator(".templates-page, .page").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Prompt Templates").first()).toBeVisible();
  });

  test("sidebar shows Templates under Configure", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('.sidebar-item[data-path="/templates"]')).toBeVisible({ timeout: 5000 });
  });

  test("template list loads with default template", async ({ page }) => {
    await page.goto("/templates");
    await expect(page.locator("text=Default Template").first()).toBeVisible({ timeout: 5000 });
  });

  test("selecting a template shows the editor", async ({ page }) => {
    await page.goto("/templates");
    await page.locator("text=Default Template").first().click();
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 5000 });
  });

  test("keyboard shortcut g t navigates to templates", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.keyboard.press("g");
    await page.keyboard.press("t");
    await page.waitForURL("**/templates", { timeout: 5000 });
    expect(new URL(page.url()).pathname).toBe("/templates");
  });
});
