import { test, expect } from "../../fixtures/test";
import { ConfigPage } from "../../pages/config.page";

/**
 * Complements config-secrets.smoke.spec.ts and settings-interactions.smoke.spec.ts
 * by covering the unified page load, General tab section rendering, and a11y.
 * Credential / Advanced / Legacy-redirect tests live in those sibling specs.
 */
test.describe("Settings Unified View Smoke", () => {
  test.beforeEach(async ({ apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);
  });

  // ── Page Load ──────────────────────────────────────────────────────

  test("settings page loads and displays Settings heading", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    await expect(page.locator("h1, .page-title").first()).toContainText("Settings");
  });

  test("settings page renders all three tab controls", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    await expect(settings.tabButton("General")).toBeVisible({ timeout: 5000 });
    await expect(settings.tabButton("Credentials")).toBeVisible({ timeout: 5000 });
    await expect(settings.tabButton("Advanced")).toBeVisible({ timeout: 5000 });
  });

  // ── General Tab Section Content ────────────────────────────────────

  test("general tab is selected by default and shows Tracker section", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    await expect(settings.tabButton("General")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Tracker").first()).toBeVisible({ timeout: 5000 });
  });

  test("general tab renders settings section title elements", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    const sectionTitles = page.locator(".settings-section-title");
    await expect(sectionTitles.first()).toBeVisible({ timeout: 5000 });

    const count = await sectionTitles.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // ── Accessibility ──────────────────────────────────────────────────

  test("tab controls are keyboard-focusable", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    const generalTab = settings.tabButton("General");
    await expect(generalTab).toBeVisible({ timeout: 5000 });
    await generalTab.focus();
    await expect(generalTab).toBeFocused();
  });
});
