import { test, expect } from "../../fixtures/test";
import { ConfigPage } from "../../pages/config.page";

test.describe("Unified Settings Smoke", () => {
  test.beforeEach(async ({ apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);
  });

  test("settings route loads the React settings form", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByTestId("settings-form")).toBeVisible();
  });

  test("configure nav shows both Settings and Credentials entries", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    await expect(page.locator('.sidebar-item[data-path="/settings"]')).toBeVisible();
    await expect(page.locator('.sidebar-item[data-path="/secrets"]')).toBeVisible();
    await expect(page.locator('.sidebar-item[data-path="/config"]')).toHaveCount(0);
  });

  test("legacy /config route redirects to settings route", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToConfig();

    expect(new URL(page.url()).pathname).toBe("/settings");
    expect(new URL(page.url()).hash).toBe("#advanced");
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  });

  test("settings route shows overlay-backed fields", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToConfig();

    await expect(page.getByLabel("Linear project slug")).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel("Default model")).toBeVisible({ timeout: 5000 });
  });

  test("settings route exposes save action", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToConfig();

    await expect(page.getByTestId("settings-save")).toBeVisible({ timeout: 5000 });
  });

  test("settings route accepts draft edits", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToConfig();

    const modelField = page.getByLabel("Default model");
    await modelField.fill("gpt-5.4-mini");
    await expect(modelField).toHaveValue("gpt-5.4-mini");
  });

  test("credentials route renders directly", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToSecrets();

    expect(new URL(page.url()).pathname).toBe("/secrets");
    await expect(page.getByRole("heading", { name: "Credentials", exact: true })).toBeVisible();
  });

  test("credentials route shows secret information", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToSecrets();

    await expect(page.getByText(/LINEAR_API_KEY/).first()).toBeVisible({ timeout: 5000 });
  });

  test("credentials route has new secret button", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToSecrets();

    await expect(page.getByText("New secret")).toBeVisible({ timeout: 5000 });
  });
});
