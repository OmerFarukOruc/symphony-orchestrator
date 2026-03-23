import type { Page, Locator } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object Model for the app shell — sidebar, header, and layout.
 */
export class AppShellPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ── Sidebar ──────────────────────────────────────────────────────────

  get sidebar(): Locator {
    return this.page.locator(".shell-sidebar");
  }

  get sidebarItems(): Locator {
    return this.page.locator(".sidebar-item");
  }

  sidebarItemByPath(path: string): Locator {
    return this.page.locator(`.sidebar-item[data-path="${path}"]`);
  }

  get activeSidebarItem(): Locator {
    return this.page.locator(".sidebar-item.is-active");
  }

  async navigateViaSidebar(path: string): Promise<void> {
    await this.sidebarItemByPath(path).click();
    // Wait for the SPA to re-render
    await this.page.waitForFunction(
      (p: string) => window.location.pathname === p || window.location.pathname.startsWith(`${p}/`),
      path,
    );
  }

  // ── Header ───────────────────────────────────────────────────────────

  get header(): Locator {
    return this.page.locator(".shell-header");
  }

  get refreshButton(): Locator {
    return this.page.locator('[aria-label="Refresh"], .refresh-button, [title*="Refresh"]');
  }

  get themeToggle(): Locator {
    return this.page.locator('[aria-label*="theme"], [title*="theme"], .theme-toggle');
  }

  // ── Stale Banner ─────────────────────────────────────────────────────

  get staleBanner(): Locator {
    return this.page.locator("#stale-banner");
  }

  async isStaleBannerVisible(): Promise<boolean> {
    const hidden = await this.staleBanner.getAttribute("hidden");
    return hidden === null;
  }

  // ── Navigation Helpers ───────────────────────────────────────────────

  async gotoOverview(): Promise<void> {
    await this.navigateViaSidebar("/");
  }

  async gotoQueue(): Promise<void> {
    await this.navigateViaSidebar("/queue");
  }

  async gotoConfig(): Promise<void> {
    await this.navigateViaSidebar("/config");
  }

  async gotoSecrets(): Promise<void> {
    await this.navigateViaSidebar("/secrets");
  }
}
