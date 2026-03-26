import { test, expect } from "../../fixtures/test";
import { AppShellPage } from "../../pages/app-shell.page";
import { IssuePage } from "../../pages/issue.page";
import { BasePage } from "../../pages/base.page";

const ERROR_BODY = JSON.stringify({ error: { code: "internal", message: "server error" } });

test.describe("Error Scenarios Smoke", () => {
  test("app shell still renders when /api/v1/state returns 500", async ({ page, apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install({
      ...scenario,
      routeOverrides: {
        "**/api/v1/state": (route) =>
          route.fulfill({ status: 500, contentType: "application/json", body: ERROR_BODY }),
      },
    });

    await page.goto("/");
    const base = new BasePage(page);
    await base.waitForReady();

    const shell = new AppShellPage(page);
    await expect(shell.sidebar).toBeVisible({ timeout: 5000 });
  });

  test("app remains usable when state request times out", async ({ page, apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install({
      ...scenario,
      routeOverrides: {
        "**/api/v1/state": (route) => route.abort("timedout"),
      },
    });

    await page.goto("/");
    const base = new BasePage(page);
    await base.waitForReady();

    const shell = new AppShellPage(page);
    await expect(shell.sidebar).toBeVisible({ timeout: 5000 });
  });

  test("app recovers when setup status returns malformed JSON", async ({ page, apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install({
      ...scenario,
      routeOverrides: {
        "**/api/v1/setup/status": (route) =>
          route.fulfill({ status: 200, contentType: "application/json", body: "{not valid json!!!" }),
      },
    });

    // The app's catch handler for getSetupStatus allows navigation to proceed
    await page.goto("/");
    const base = new BasePage(page);
    await base.waitForReady();

    const shell = new AppShellPage(page);
    await expect(shell.sidebar).toBeVisible({ timeout: 5000 });
  });

  test("navigating to unknown issue identifier handles 404 gracefully", async ({ page, apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);

    await page.goto("/issues/NONEXISTENT-999");
    const base = new BasePage(page);
    await base.waitForReady();

    const shell = new AppShellPage(page);
    await expect(shell.sidebar).toBeVisible({ timeout: 5000 });

    const issue = new IssuePage(page);
    await expect(issue.title).not.toContainText("Fix authentication bug", { timeout: 3000 });
  });

  test("stale banner appears after consecutive poll failures", async ({ page, apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);

    await page.goto("/");
    const base = new BasePage(page);
    await base.waitForPageContent();

    const shell = new AppShellPage(page);
    await expect(shell.staleBanner).toBeHidden();

    // Override state endpoint to fail; STALE_THRESHOLD is 3 and poll interval is 5s
    await page.route("**/api/v1/state", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: ERROR_BODY }),
    );

    await expect(shell.staleBanner).toBeVisible({ timeout: 20_000 });
    await expect(shell.staleBanner).toContainText("stale", { ignoreCase: true });
  });
});
