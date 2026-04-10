import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Component Object Model for the Command Palette (Cmd+K / Ctrl+K).
 */
export class CommandPaletteComponent {
  constructor(private readonly page: Page) {}

  get overlay(): Locator {
    return this.page.locator(".palette-overlay");
  }

  get input(): Locator {
    return this.page.locator(".palette-input");
  }

  get itemList(): Locator {
    return this.page.locator(".palette-list");
  }

  get items(): Locator {
    return this.page.locator(".palette-item");
  }

  get activeItem(): Locator {
    return this.page.locator(".palette-item.is-active");
  }

  get groupHeaders(): Locator {
    return this.page.locator(".palette-group-header");
  }

  get emptyMessage(): Locator {
    return this.page.locator(".palette-group-header").filter({ hasText: "No matching" });
  }

  // ── Actions ──────────────────────────────────────────────────────────

  async open(): Promise<void> {
    // Use Ctrl+K (Linux/Windows) to open the palette
    await this.page.keyboard.press("Control+k");
    await expect(this.overlay).not.toHaveAttribute("hidden", "");
    await expect(this.input).toBeFocused();
  }

  async close(): Promise<void> {
    await this.page.keyboard.press("Escape");
    await expect(this.overlay).toHaveAttribute("hidden", "");
  }

  async search(query: string): Promise<void> {
    await this.input.fill(query);
    // Wait for the list to re-render
    await this.page.waitForTimeout(100);
  }

  async selectActiveItem(): Promise<void> {
    await this.page.keyboard.press("Enter");
  }

  async arrowDown(times = 1): Promise<void> {
    for (let i = 0; i < times; i++) {
      await this.page.keyboard.press("ArrowDown");
    }
  }

  async arrowUp(times = 1): Promise<void> {
    for (let i = 0; i < times; i++) {
      await this.page.keyboard.press("ArrowUp");
    }
  }

  async isOpen(): Promise<boolean> {
    if ((await this.overlay.count()) === 0) {
      return false;
    }
    const hidden = await this.overlay.getAttribute("hidden");
    return hidden === null;
  }

  async itemCount(): Promise<number> {
    return this.items.count();
  }

  async activeItemText(): Promise<string> {
    return (await this.activeItem.locator(".palette-item-name").textContent()) ?? "";
  }
}
