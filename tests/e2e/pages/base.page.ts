import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Base Page Object Model providing shared helpers for all E2E page objects.
 */
export class BasePage {
  constructor(protected readonly page: Page) {}

  /** Navigate to a path relative to baseURL. */
  async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }

  /** Wait for the app shell to be ready (main content rendered). */
  async waitForReady(): Promise<void> {
    await this.page.waitForSelector("#main-content", { state: "attached" });
  }

  /** Wait for shell + first real content inside the outlet. */
  async waitForPageContent(): Promise<void> {
    await this.waitForReady();
    // Wait for at least one child in the main outlet
    await this.page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });
  }

  /** Get a locator by data-testid attribute. */
  getByTestId(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  /** Assert that no console errors were logged. */
  async assertNoConsoleErrors(): Promise<void> {
    const errors: string[] = [];
    this.page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("[E2E]")) {
        errors.push(msg.text());
      }
    });
    // Give a small window for any deferred errors
    await this.page.waitForTimeout(100);
    expect(errors).toEqual([]);
  }

  /** Get the current URL path. */
  async currentPath(): Promise<string> {
    return new URL(this.page.url()).pathname;
  }

  /** Get the document title. */
  async documentTitle(): Promise<string> {
    return this.page.title();
  }
}
