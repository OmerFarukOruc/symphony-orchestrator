import type { Page, Locator } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object Model for the Setup Wizard page.
 */
export class SetupPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /** Navigate to the setup page. */
  async navigate(): Promise<void> {
    await this.goto("/setup");
    await this.waitForReady();
  }

  /** Check if the setup page is currently displayed. */
  async isVisible(): Promise<boolean> {
    const path = await this.currentPath();
    return path === "/setup";
  }

  /** Get the page heading. */
  get heading(): Locator {
    return this.page.locator(".page-title, h1").first();
  }

  /** Get all setup step elements. */
  get steps(): Locator {
    return this.page.locator(".setup-step, .setup-card, [class*='setup']");
  }
}
