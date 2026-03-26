import { expect } from "@playwright/test";

import { test } from "../../fixtures/test";
import { AppShellPage } from "../../pages/app-shell.page";
import { ConfigPage } from "../../pages/config.page";

test.describe("Secrets React route", () => {
  test.beforeEach(async ({ apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install({
      ...scenario,
      secrets: { keys: ["LINEAR_API_KEY", "OPENAI_API_KEY"] },
      routeOverrides: {
        "**/api/v1/secrets": async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ keys: ["LINEAR_API_KEY", "OPENAI_API_KEY"] }),
          });
        },
        "**/api/v1/secrets/*": async (route) => {
          if (route.request().method() === "POST") {
            await route.fulfill({ status: 204, body: "" });
            return;
          }
          if (route.request().method() === "DELETE") {
            await route.fulfill({ status: 204, body: "" });
            return;
          }
          await route.fallback();
        },
      },
    });
  });

  test("renders credentials route and sidebar entry", async ({ page }) => {
    const config = new ConfigPage(page);
    const shell = new AppShellPage(page);
    await config.navigateToSecrets();

    await expect(page.getByRole("heading", { name: "Credentials", exact: true })).toBeVisible();
    await expect(page.getByTestId("secrets-table")).toBeVisible();
    await expect(shell.sidebarItemByPath("/secrets")).toHaveClass(/is-active/);
  });

  test("creates or updates a secret via the form", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToSecrets();

    await page.getByTestId("secret-key-input").fill("GITHUB_TOKEN");
    await page.getByTestId("secret-value-input").fill("github_pat_test");
    await page.getByTestId("secret-save").click();

    await expect(page.getByText("Secret GITHUB_TOKEN saved.", { exact: true })).toBeVisible();
  });

  test("deletes an existing secret", async ({ page }) => {
    const config = new ConfigPage(page);
    await config.navigateToSecrets();

    await page.getByRole("button", { name: "Delete LINEAR_API_KEY", exact: true }).click();

    await expect(page.getByText("Secret LINEAR_API_KEY deleted.", { exact: true })).toBeVisible();
  });
});
