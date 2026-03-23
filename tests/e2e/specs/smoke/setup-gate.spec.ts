import { test, expect } from "../../fixtures/test";

test.describe("Setup Gate", () => {
  test("blocks navigation to non-setup routes when unconfigured", async ({ page, apiMock }) => {
    const scenario = apiMock.scenario().withSetupUnconfigured().build();
    await apiMock.install(scenario);

    // Load the app — initial render happens before the guard is set,
    // so the overview may briefly appear. The guard blocks SUBSEQUENT navigations.
    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });

    // Wait for the SPA to initialize and the setup guard to be set.
    // The guard is set after router.init() and startPolling().
    await page.waitForTimeout(500);

    // Try navigating to /config — the guard should redirect back to /setup
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("router:navigate"));
      // Simulate a client-side navigation attempt
      window.history.pushState({}, "", "/config");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    // Wait for the guard to process the navigation
    await page.waitForTimeout(500);

    const path = new URL(page.url()).pathname;
    expect(path).toBe("/setup");
  });

  test("shows overview when configured", async ({ page, apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);

    await page.goto("/");

    // Wait for the page to load and not redirect to setup
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    const path = new URL(page.url()).pathname;
    expect(path).toBe("/");
  });

  test("sidebar shows navigation items when configured", async ({ page, apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);

    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });

    // Verify sidebar navigation items are present
    const sidebar = page.locator(".shell-sidebar");
    await expect(sidebar).toBeVisible();

    // Verify at least the Overview nav item exists
    const overviewItem = page.locator('.sidebar-item[data-path="/"]');
    await expect(overviewItem).toBeVisible();
  });

  test("renders metric cards on overview when configured", async ({ page, apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);

    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    // Wait for metric card content to render from mocked state data
    // The snapshot factory provides 1 running, 0 retrying
    await expect(page.getByText("RUNNING")).toBeVisible({ timeout: 5000 });
  });
});
