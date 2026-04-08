import { test, expect } from "../../fixtures/test";
import { ConfigPage } from "../../pages/config.page";

/**
 * Complements config-secrets.smoke.spec.ts and settings-interactions.smoke.spec.ts
 * by covering the unified page load, rail navigation, section rendering, and a11y.
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

  test("settings page renders the Codex Admin operator block", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    await expect(page.getByRole("heading", { name: "Codex Admin" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Model catalog" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Threads" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "MCP servers" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "gpt-5.4", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "github", exact: true })).toBeVisible();
  });

  test("settings page renders sidebar rail with navigation items", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    await expect(settings.settingsRail).toBeVisible({ timeout: 5000 });

    // The rail should contain multiple navigation items (Tracker, Agent, etc.)
    const navItems = settings.railNavItems;
    const count = await navItems.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  // ── Rail Section Content ──────────────────────────────────────────

  test("first section is selected by default and shows Tracker section", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    // The first nav item in the rail should be selected
    const firstNavItem = settings.railNavItems.first();
    await expect(firstNavItem).toHaveClass(/is-selected/);
    await expect(page.getByText("Tracker").first()).toBeVisible({ timeout: 5000 });
  });

  test("settings page renders section title elements", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    const sectionTitles = page.locator(".settings-section-title");
    await expect(sectionTitles.first()).toBeVisible({ timeout: 5000 });

    const count = await sectionTitles.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // ── Accessibility ──────────────────────────────────────────────────

  test("rail navigation items are keyboard-focusable", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    const firstNavItem = settings.railNavItems.first();
    await expect(firstNavItem).toBeVisible({ timeout: 5000 });
    await firstNavItem.focus();
    await expect(firstNavItem).toBeFocused();
  });
});
