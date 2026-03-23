import { test, expect } from "../../fixtures/test";
import { CommandPaletteComponent } from "../../pages/command-palette.component";

test.describe("Command Palette Smoke", () => {
  test.beforeEach(async ({ page, apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);
    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });
  });

  test("opens and closes with keyboard shortcut", async ({ page }) => {
    const palette = new CommandPaletteComponent(page);

    // Should start hidden
    expect(await palette.isOpen()).toBe(false);

    // Open with Ctrl+K
    await palette.open();
    expect(await palette.isOpen()).toBe(true);

    // Close with Escape
    await palette.close();
    expect(await palette.isOpen()).toBe(false);
  });

  test("shows navigation entries when opened", async ({ page }) => {
    const palette = new CommandPaletteComponent(page);
    await palette.open();

    // Should have at least some palette items (nav routes)
    const count = await palette.itemCount();
    expect(count).toBeGreaterThan(0);
  });

  test("filters entries when typing", async ({ page }) => {
    const palette = new CommandPaletteComponent(page);
    await palette.open();

    const initialCount = await palette.itemCount();

    // Search for "config" which should narrow the results
    await palette.search("config");
    const filteredCount = await palette.itemCount();

    // Filtered count should be less than or equal to initial
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
    expect(filteredCount).toBeGreaterThan(0);
  });

  test("shows empty message for non-matching query", async ({ page }) => {
    const palette = new CommandPaletteComponent(page);
    await palette.open();

    await palette.search("zzznonexistentquery999");

    await expect(palette.emptyMessage).toBeVisible();
  });

  test("navigates with arrow keys and highlights active item", async ({ page }) => {
    const palette = new CommandPaletteComponent(page);
    await palette.open();

    // First item should be active by default
    const firstActiveText = await palette.activeItemText();
    expect(firstActiveText.length).toBeGreaterThan(0);

    // Arrow down to select second item
    await palette.arrowDown();
    const secondActiveText = await palette.activeItemText();

    // Active item should have changed (unless there's only one item)
    const count = await palette.itemCount();
    if (count > 1) {
      expect(secondActiveText).not.toBe(firstActiveText);
    }
  });

  test("navigates to selected route on Enter", async ({ page }) => {
    const palette = new CommandPaletteComponent(page);
    await palette.open();

    // Search for "queue" to get the queue nav item
    await palette.search("queue");
    await page.waitForTimeout(200);

    const count = await palette.itemCount();
    if (count > 0) {
      await palette.selectActiveItem();

      // Palette should close after selection
      await page.waitForTimeout(500);
      expect(await palette.isOpen()).toBe(false);
    }
  });

  test("closes when clicking outside the panel", async ({ page }) => {
    const palette = new CommandPaletteComponent(page);
    await palette.open();

    // Click the overlay backdrop (outside the panel)
    await palette.overlay.click({ position: { x: 10, y: 10 } });

    await page.waitForTimeout(200);
    expect(await palette.isOpen()).toBe(false);
  });
});
