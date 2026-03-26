import { expect } from "@playwright/test";

import { test } from "../../fixtures/test";
import { SetupPage } from "../../pages/setup.page";

test.describe("Setup React route", () => {
  test.beforeEach(async ({ apiMock }) => {
    const scenario = apiMock.scenario().withSetupUnconfigured().build();
    await apiMock.install({
      ...scenario,
      routeOverrides: {
        "**/api/v1/setup/master-key": async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ key: "generated-master-key" }),
          });
        },
        "**/api/v1/secrets/*": async (route) => {
          if (route.request().method() === "POST") {
            await route.fulfill({ status: 204, body: "" });
            return;
          }
          await route.fallback();
        },
        "**/api/v1/setup/linear-projects": async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              projects: [{ id: "proj-1", name: "Symphony", slugId: "SYM", teamKey: "SYM" }],
            }),
          });
        },
        "**/api/v1/setup/linear-project": async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
        },
        "**/api/v1/setup/repo-route": async (route) => {
          if (route.request().method() === "POST") {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                ok: true,
                route: {
                  repo_url: "https://github.com/acme/symphony",
                  default_branch: "main",
                  identifier_prefix: "SYM",
                },
              }),
            });
            return;
          }
          if (route.request().method() === "DELETE") {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ok: true, routes: [] }),
            });
            return;
          }
          await route.fallback();
        },
        "**/api/v1/setup/repo-routes": async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ routes: [] }) });
        },
        "**/api/v1/setup/detect-default-branch": async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ defaultBranch: "main" }),
          });
        },
        "**/api/v1/setup/openai-key": async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ valid: true }) });
        },
        "**/api/v1/setup/github-token": async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ valid: true }) });
        },
      },
    });
  });

  test("renders setup intro and generated master key step", async ({ page }) => {
    const setup = new SetupPage(page);
    await setup.navigate();

    await expect(page.getByRole("heading", { name: "Bring Symphony online", exact: true })).toBeVisible();
    await expect(page.getByText("generated-master-key", { exact: true })).toBeVisible();
  });

  test("walks through required setup steps to done state", async ({ page }) => {
    const setup = new SetupPage(page);
    await setup.navigate();

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Linear API key").fill("lin_api_test");
    await page.getByRole("button", { name: "Verify key", exact: true }).click();
    await page.getByRole("button", { name: "Symphony SYM" }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("GitHub repository URL").fill("https://github.com/acme/symphony");
    await page.getByRole("button", { name: "Save & Continue", exact: true }).click();
    await page.getByLabel("OpenAI API key").fill("sk-test");
    await page.getByRole("button", { name: "Validate & Save", exact: true }).click();
    await page.getByLabel("Personal access token").fill("github_pat_test");
    await page.getByRole("button", { name: "Validate & Save", exact: true }).click();

    await expect(page.getByRole("heading", { name: "You're all set", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Go to Dashboard →", exact: true })).toBeVisible();
  });
});
