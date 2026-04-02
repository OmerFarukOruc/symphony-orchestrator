import { test, expect } from "../../fixtures/test";
import { ConfigPage } from "../../pages/config.page";
import { freezeClock } from "../../support/clock";
import { applyScreenshotStyles } from "../../support/screenshot-css";

test.describe("Settings Tabs Visual Regression", () => {
  test("settings credentials tab", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);

    const config = new ConfigPage(page);
    await config.navigateToSecrets();

    await expect(config.credentialsSection).toBeVisible();
    await expect(page.getByText("Stored credentials").first()).toBeVisible();
    await expect(page.getByText("LINEAR_API_KEY").first()).toBeVisible();
    await expect(config.addCredentialButton).toBeVisible();
    await applyScreenshotStyles(page);
    await page.waitForTimeout(100);

    await expect(config.credentialsSection).toHaveScreenshot("settings-credentials-tab.png");
  });

  test("settings devtools tab", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);

    const config = new ConfigPage(page);
    await config.navigateToConfig();
    await page.evaluate(() => {
      const devtoolsEl = document.querySelector<HTMLDetailsElement>(".settings-devtools-section");
      if (devtoolsEl) {
        devtoolsEl.open = true;
        devtoolsEl.scrollIntoView({ block: "start" });
      }
    });
    await page.waitForFunction(() => {
      const devtoolsEl = document.querySelector<HTMLDetailsElement>(".settings-devtools-section");
      return devtoolsEl?.open === true;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("settings-devtools-tab.png", {
      fullPage: true,
    });
  });
});
