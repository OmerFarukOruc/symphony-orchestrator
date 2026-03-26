import { test, expect } from "../../fixtures/test";
import { ConfigPage } from "../../pages/config.page";

test.describe("Unified Settings Smoke", () => {
  test.beforeEach(async ({ apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);
  });

  test("settings page loads with general settings visible by default", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    await expect(page.locator("h1, .page-title").first()).toContainText("Settings");
    // General settings rail should be visible
    await expect(page.locator(".settings-rail")).toBeVisible({ timeout: 5000 });
  });

  test("configure nav is consolidated to a single Settings entry", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    await expect(page.locator('.sidebar-item[data-path="/settings"]')).toBeVisible();
    await expect(page.locator('.sidebar-item[data-path="/config"]')).toHaveCount(0);
    await expect(page.locator('.sidebar-item[data-path="/secrets"]')).toHaveCount(0);
  });

  // ── Dev Tools / Legacy Config Alias ──────────────────────────────

  test("legacy /config route redirects to Settings with devtools hash", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToConfig();

    expect(new URL(page.url()).pathname).toBe("/settings");
    expect(new URL(page.url()).hash).toBe("#devtools");
    await expect(config.devToolsSection).toBeAttached();
  });

  test("devtools section shows overlay entries when opened", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToConfig();

    // Details is opened automatically by hash navigation
    await expect(config.devToolsSection).toHaveAttribute("open", "");
    await expect(page.getByText("codex.model").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("orchestrator.max_concurrent").first()).toBeVisible({ timeout: 5000 });
  });

  test("devtools section shows config editor mode buttons when opened", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToConfig();

    await expect(config.devToolsSection).toHaveAttribute("open", "");
    await expect(page.locator(".config-mode-label").first()).toBeVisible({ timeout: 5000 });
  });

  // ── Credentials / Legacy Secrets Alias ───────────────────────────

  test("legacy /secrets route redirects to Settings with credentials hash", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToSecrets();

    expect(new URL(page.url()).pathname).toBe("/settings");
    expect(new URL(page.url()).hash).toBe("#credentials");
    await expect(config.credentialsSection).toBeAttached();
  });

  test("credentials section shows secret information", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToSecrets();

    await expect(page.getByText(/LINEAR_API_KEY/).first()).toBeVisible({ timeout: 5000 });
  });

  test("credentials section has new secret button", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToSecrets();

    await expect(page.getByText("New secret")).toBeVisible({ timeout: 5000 });
  });

  test("global keyboard aliases open devtools and credentials sections", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.keyboard.press("g");
    await page.keyboard.press("c");
    expect(new URL(page.url()).pathname).toBe("/settings");
    expect(new URL(page.url()).hash).toBe("#devtools");

    await page.keyboard.press("g");
    await page.keyboard.press("s");
    expect(new URL(page.url()).hash).toBe("#credentials");
  });
});
