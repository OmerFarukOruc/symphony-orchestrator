import { test, expect } from "../../fixtures/test";
import { ConfigPage } from "../../pages/config.page";

test.describe("Settings Codex Admin Smoke", () => {
  test("account and thread detail flows render through the Codex admin UI", async ({ page, apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);

    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    await expect(page.getByRole("heading", { name: "Account" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("operator@example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Details" }).first()).toBeVisible();

    await page.getByRole("button", { name: "Details" }).first().click();

    await expect(page.getByText("turn_1")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Unload" }).first()).toBeVisible();
  });

  test("pending prompt answers round-trip through the Codex admin UI", async ({ page, apiMock }) => {
    let promptResolved = false;
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);
    await page.route("**/api/v1/codex/requests/user-input", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: promptResolved
            ? []
            : [
                {
                  requestId: "req-1",
                  method: "item/tool/requestUserInput",
                  threadId: "thr_1",
                  turnId: "turn_1",
                  questions: [
                    {
                      id: "choice",
                      header: "Pick one",
                      question: "Pick one",
                      options: [{ label: "Yes" }],
                    },
                  ],
                  createdAt: "2026-04-08T11:00:00Z",
                },
              ],
        }),
      });
    });
    await page.route("**/api/v1/codex/requests/user-input/*/respond", async (route) => {
      promptResolved = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    const settings = new ConfigPage(page);
    await settings.navigateToSettings();

    await expect(page.getByRole("heading", { name: "Pending prompts" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Answer" })).toBeVisible();

    page.on("dialog", async (dialog) => {
      if (dialog.type() === "prompt") {
        await dialog.accept("Yes");
      }
    });

    const respondPromise = page.waitForRequest((request) => {
      return request.url().includes("/api/v1/codex/requests/user-input/req-1/respond") && request.method() === "POST";
    });

    await page.getByRole("button", { name: "Answer" }).click();

    const respondRequest = await respondPromise;
    expect(respondRequest.postDataJSON()).toEqual({
      result: {
        answers: [{ id: "choice", value: "Yes" }],
      },
    });

    await expect(page.getByText("No prompts waiting")).toBeVisible({ timeout: 5000 });
  });
});
