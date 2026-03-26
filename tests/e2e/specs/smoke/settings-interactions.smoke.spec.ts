import { test, expect } from "../../fixtures/test";
import { ConfigPage } from "../../pages/config.page";

test.describe("Settings Interaction Smoke", () => {
  test.beforeEach(async ({ apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);
  });

  // ── Advanced Tab: Raw JSON Config Editing ────────────────────────────

  test("raw JSON mode: editing and saving sends PUT with correct payload", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToConfig();

    await page.getByRole("button", { name: "Raw JSON" }).click();
    const editor = page.locator(".config-textarea-large");
    await expect(editor).toBeVisible({ timeout: 5000 });

    const payload = '{"codex.model":"o4-mini","orchestrator.max_concurrent":5}';
    await editor.fill(payload);

    const putPromise = page.waitForRequest((req) => {
      return req.url().includes("/api/v1/config/overlay") && req.method() === "PUT";
    });

    await page.route("**/api/v1/config/overlay", (route) => {
      if (route.request().method() === "PUT") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            updated: ["codex.model", "orchestrator.max_concurrent"],
            overlay: { "codex.model": "o4-mini", "orchestrator.max_concurrent": 5 },
          }),
        });
      }
      return route.fallback();
    });

    await page.getByRole("button", { name: "Save Changes" }).click();

    const putRequest = await putPromise;
    const body = putRequest.postDataJSON() as Record<string, unknown>;
    expect(body).toHaveProperty("patch");

    const patch = body.patch as Record<string, unknown>;
    expect(patch["codex.model"]).toBe("o4-mini");
    expect(patch["orchestrator.max_concurrent"]).toBe(5);
  });

  test("raw JSON mode: invalid JSON does not send PUT request", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToConfig();

    await page.getByRole("button", { name: "Raw JSON" }).click();
    const editor = page.locator(".config-textarea-large");
    await expect(editor).toBeVisible({ timeout: 5000 });

    await editor.fill("{invalid json}");

    let putSent = false;
    page.on("request", (req) => {
      if (req.url().includes("/api/v1/config/overlay") && req.method() === "PUT") {
        putSent = true;
      }
    });

    // JSON.parse fails client-side, so no PUT should fire
    await page.getByRole("button", { name: "Save Changes" }).click();
    await page.waitForTimeout(300);
    expect(putSent).toBe(false);
  });

  // ── Credentials Tab: Create Secret ───────────────────────────────────

  test("new secret: filling form and submitting sends POST with value", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSecrets();

    const postPromise = page.waitForRequest((req) => {
      return req.url().includes("/api/v1/secrets/MY_NEW_KEY") && req.method() === "POST";
    });

    await page.getByRole("button", { name: "New secret" }).click();
    const modal = page.locator(".confirm-modal-shell");
    await expect(modal).toBeVisible({ timeout: 5000 });

    await modal.locator("input[required]").fill("MY_NEW_KEY");
    await modal.locator("textarea[required]").fill("super-secret-value-123");
    await modal.getByRole("button", { name: "Save secret" }).click();

    const postRequest = await postPromise;
    const body = postRequest.postDataJSON() as Record<string, unknown>;
    expect(body).toHaveProperty("value", "super-secret-value-123");
  });

  // ── Credentials Tab: Delete Secret ───────────────────────────────────

  test("delete secret: confirming deletion sends DELETE request", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSecrets();

    await expect(page.getByText("LINEAR_API_KEY").first()).toBeVisible({ timeout: 5000 });

    const deletePromise = page.waitForRequest((req) => {
      return req.url().includes("/api/v1/secrets/LINEAR_API_KEY") && req.method() === "DELETE";
    });

    const row = page.locator("tr").filter({ hasText: "LINEAR_API_KEY" });
    await row.getByRole("button", { name: "Delete" }).click();

    const modal = page.locator(".confirm-modal-shell");
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Type the exact key name to satisfy the confirmation guard
    await modal.locator("input[required]").fill("LINEAR_API_KEY");
    await modal.getByRole("button", { name: "Delete key" }).click();

    const deleteRequest = await deletePromise;
    expect(deleteRequest.method()).toBe("DELETE");
    expect(deleteRequest.url()).toContain("/api/v1/secrets/LINEAR_API_KEY");
  });

  // ── Credentials Tab: Empty Key/Value Validation ──────────────────────

  test("new secret: empty key or value shows validation feedback", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSecrets();

    await page.getByRole("button", { name: "New secret" }).click();
    const modal = page.locator(".confirm-modal-shell");
    await expect(modal).toBeVisible({ timeout: 5000 });

    let postSent = false;
    page.on("request", (req) => {
      if (req.url().includes("/api/v1/secrets/") && req.method() === "POST") {
        postSent = true;
      }
    });

    // Submit with both fields empty -- client-side validation should block the POST
    await modal.getByRole("button", { name: "Save secret" }).click();
    await page.waitForTimeout(300);
    expect(postSent).toBe(false);
  });

  // ── Tab Switching Preserves Content ──────────────────────────────────

  test("credentials tab content persists after switching to Advanced and back", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToSecrets();

    await expect(page.getByText("LINEAR_API_KEY").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("OPENAI_API_KEY").first()).toBeVisible({ timeout: 5000 });

    await settings.tabButton("Advanced").click();
    await expect(settings.tabButton("Advanced")).toHaveAttribute("aria-selected", "true");

    await settings.tabButton("Credentials").click();
    await expect(settings.tabButton("Credentials")).toHaveAttribute("aria-selected", "true");

    await expect(page.getByText("LINEAR_API_KEY").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("OPENAI_API_KEY").first()).toBeVisible({ timeout: 5000 });
  });

  test("advanced tab raw edits survive round-trip through General tab", async ({ page }) => {
    const settings = new ConfigPage(page);
    await settings.navigateToConfig();

    await page.getByRole("button", { name: "Raw JSON" }).click();
    const editor = page.locator(".config-textarea-large");
    await editor.fill('{"my.draft":"persist-me"}');

    await settings.tabButton("General").click();
    await settings.tabButton("Advanced").click();

    await expect(editor).toHaveValue('{"my.draft":"persist-me"}');
  });
});
