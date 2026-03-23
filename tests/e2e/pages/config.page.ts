import type { Page, Locator } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object Model for the Config ("/config") and Secrets ("/secrets") pages.
 */
export class ConfigPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigateToConfig(): Promise<void> {
    await this.goto("/config");
    await this.waitForPageContent();
  }

  async navigateToSecrets(): Promise<void> {
    await this.goto("/secrets");
    await this.waitForPageContent();
  }

  // ── Config View ──────────────────────────────────────────────────────

  get configTable(): Locator {
    return this.page.locator("table, .config-table, [class*='config']").first();
  }

  get configRows(): Locator {
    return this.page.locator("tr, .config-row, [class*='config-row']");
  }

  get overlaySection(): Locator {
    return this.page.locator("[class*='overlay'], [class*='override']").first();
  }

  // ── Secrets View ─────────────────────────────────────────────────────

  get secretsList(): Locator {
    return this.page.locator(".secrets-list, table, [class*='secret']").first();
  }

  get secretRows(): Locator {
    return this.page.locator(".secret-row, tr").filter({ has: this.page.locator("td, .secret-key") });
  }

  get addSecretButton(): Locator {
    return this.page.locator("button").filter({ hasText: /add|new|create/i });
  }

  secretByKey(key: string): Locator {
    return this.page.getByText(key, { exact: true });
  }
}
