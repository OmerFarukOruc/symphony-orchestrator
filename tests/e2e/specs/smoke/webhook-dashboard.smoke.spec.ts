import { test, expect } from "../../fixtures/test";
import { OverviewPage } from "../../pages/overview.page";
import { buildWebhookHealth } from "../../mocks/data/runtime-snapshot";

test.describe("Webhook Health Dashboard", () => {
  test("shows webhook panel when webhook_health is present", async ({ page, apiMock }) => {
    const scenario = apiMock
      .scenario()
      .withSetupConfigured()
      .withSnapshot({ webhook_health: buildWebhookHealth() })
      .build();
    await apiMock.install(scenario);
    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });

    const overview = new OverviewPage(page);
    await expect(overview.webhookHealthPanel).toBeVisible({ timeout: 5000 });
  });

  test("displays Connected status badge", async ({ page, apiMock }) => {
    const scenario = apiMock
      .scenario()
      .withSetupConfigured()
      .withSnapshot({ webhook_health: buildWebhookHealth({ status: "connected" }) })
      .build();
    await apiMock.install(scenario);
    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });

    const overview = new OverviewPage(page);
    await expect(overview.webhookStatus).toHaveText("Connected", { timeout: 5000 });
    await expect(overview.webhookHealthPanel).toHaveClass(/is-connected/);
  });

  test("displays Degraded status badge", async ({ page, apiMock }) => {
    const scenario = apiMock
      .scenario()
      .withSetupConfigured()
      .withSnapshot({ webhook_health: buildWebhookHealth({ status: "degraded" }) })
      .build();
    await apiMock.install(scenario);
    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });

    const overview = new OverviewPage(page);
    await expect(overview.webhookStatus).toHaveText("Degraded", { timeout: 5000 });
    await expect(overview.webhookHealthPanel).toHaveClass(/is-degraded/);
  });

  test("shows delivery count", async ({ page, apiMock }) => {
    const scenario = apiMock
      .scenario()
      .withSetupConfigured()
      .withSnapshot({
        webhook_health: buildWebhookHealth({
          stats: { deliveries_received: 123, last_delivery_at: null, last_event_type: null },
        }),
      })
      .build();
    await apiMock.install(scenario);
    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });

    const overview = new OverviewPage(page);
    await expect(overview.webhookDeliveries).toHaveText("123", { timeout: 5000 });
  });

  test("shows last event type and relative timestamp", async ({ page, apiMock }) => {
    const scenario = apiMock
      .scenario()
      .withSetupConfigured()
      .withSnapshot({
        webhook_health: buildWebhookHealth({
          last_delivery_at: new Date().toISOString(),
          last_event_type: "Issue",
        }),
      })
      .build();
    await apiMock.install(scenario);
    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });

    const overview = new OverviewPage(page);
    await expect(overview.webhookLastEvent).toContainText("Issue", { timeout: 5000 });
  });

  test("shows current polling interval", async ({ page, apiMock }) => {
    const scenario = apiMock
      .scenario()
      .withSetupConfigured()
      .withSnapshot({
        webhook_health: buildWebhookHealth({ effective_interval_ms: 15_000 }),
      })
      .build();
    await apiMock.install(scenario);
    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });

    const overview = new OverviewPage(page);
    await expect(overview.webhookInterval).toHaveText("15s", { timeout: 5000 });
  });

  test("panel hidden when webhook_health is absent", async ({ page, apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().withSnapshot({ webhook_health: undefined }).build();
    await apiMock.install(scenario);
    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });

    const overview = new OverviewPage(page);
    await expect(overview.webhookHealthPanel).toBeHidden({ timeout: 5000 });
  });
});
