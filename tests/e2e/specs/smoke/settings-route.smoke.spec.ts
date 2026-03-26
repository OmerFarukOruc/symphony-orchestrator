import { test, expect } from "../../fixtures/test";
import { ConfigPage } from "../../pages/config.page";

test.describe("Settings React route", () => {
  test.beforeEach(async ({ apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install({
      ...scenario,
      config: {
        tracker: {
          project_slug: "SYM",
          active_states: ["Todo", "In Progress"],
          terminal_states: ["Done", "Canceled"],
        },
        agent: {
          max_concurrent_agents: 3,
          max_turns: 20,
          max_retry_backoff_ms: 300000,
        },
        codex: {
          model: "gpt-5.4",
          reasoning_effort: "high",
          approval_policy: "never",
          auth: {
            mode: "api_key",
          },
        },
        workspace: {
          strategy: "directory",
          root: "/tmp/symphony-workspaces",
        },
      },
      configOverlay: {
        overlay: {
          tracker: { project_slug: "SYM" },
          codex: { model: "gpt-5.4" },
        },
      },
      routeOverrides: {
        "**/api/v1/config/overlay": async (route) => {
          if (route.request().method() === "PUT") {
            const body = route.request().postDataJSON() as { patch?: Record<string, unknown> };
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ overlay: body.patch ?? {}, updated: true }),
            });
            return;
          }
          await route.fallback();
        },
      },
    });
  });

  test("renders the settings form and saves overlay updates", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByTestId("settings-form")).toBeVisible();
    await expect(page.getByLabel("Linear project slug")).toHaveValue("SYM");
    await expect(page.getByLabel("Default model")).toHaveValue("gpt-5.4");

    await page.getByLabel("Linear project slug").fill("OPS");
    await page.getByLabel("Default model").fill("gpt-5.4-mini");
    await page.getByTestId("settings-save").click();

    await expect(page.getByText("Settings saved to the persistent config overlay.", { exact: true })).toBeVisible();
  });
});
