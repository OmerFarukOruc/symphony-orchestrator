import { test, expect } from "../../fixtures/test";
import { ConfigPage } from "../../pages/config.page";

test.describe("Config & Secrets Smoke", () => {
  test.beforeEach(async ({ apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);
  });

  // ── Config Page ────────────────────────────────────────────────────

  test("config page loads and shows heading", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToConfig();

    // The page has a main heading "Configuration"
    await expect(page.locator("h1, .page-title").first()).toBeVisible({ timeout: 5000 });
  });

  test("config page shows overlay entries", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToConfig();

    // The config overlay mock provides codex.model and orchestrator.max_concurrent
    await expect(page.getByText("codex.model").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("orchestrator.max_concurrent").first()).toBeVisible({ timeout: 5000 });
  });

  test("config page has mode tabs", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToConfig();

    // The tabs are rendered as buttons with class config-mode-label
    await expect(page.locator(".config-mode-label").first()).toBeVisible({ timeout: 5000 });
  });

  // ── Secrets / Credentials Page ─────────────────────────────────────

  test("credentials page loads", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToSecrets();

    // Just verify the page loaded and has content
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    // The URL should be /secrets
    expect(new URL(page.url()).pathname).toBe("/secrets");
  });

  test("credentials page shows secret information", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToSecrets();

    // The page shows descriptions mentioning key names
    await expect(page.getByText(/LINEAR_API_KEY/).first()).toBeVisible({ timeout: 5000 });
  });

  test("credentials page has new secret button", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToSecrets();

    await expect(page.getByText("New secret")).toBeVisible({ timeout: 5000 });
  });
});
