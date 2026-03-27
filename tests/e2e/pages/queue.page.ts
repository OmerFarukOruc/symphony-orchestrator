import type { Page, Locator } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object Model for the Queue ("/queue") page.
 */
export class QueuePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    await this.goto("/queue");
    await this.waitForPageContent();
  }

  // ── Kanban Board ─────────────────────────────────────────────────────

  get board(): Locator {
    return this.page.locator(".kanban-board, .queue-board, [class*='kanban'], [class*='board']").first();
  }

  get columns(): Locator {
    return this.page.locator("section.kanban-column, section.queue-column");
  }

  columnByLabel(label: string): Locator {
    return this.columns.filter({ hasText: label });
  }

  // ── Issue Cards ──────────────────────────────────────────────────────

  get issueCards(): Locator {
    return this.page.locator("button.kanban-card, button.issue-card");
  }

  issueCardByIdentifier(identifier: string): Locator {
    return this.issueCards.filter({ hasText: identifier });
  }

  async clickIssue(identifier: string): Promise<void> {
    await this.issueCardByIdentifier(identifier).click();
    // Wait for the SPA to navigate to the issue detail
    await this.page.waitForFunction(
      (id: string) => window.location.pathname.includes(id) || window.location.pathname.includes("issues"),
      identifier,
      { timeout: 5000 },
    );
  }

  // ── Column Counts ────────────────────────────────────────────────────

  async getColumnCount(label: string): Promise<number> {
    const column = this.columnByLabel(label);
    const cards = column.locator(".kanban-card, .issue-card, [class*='kanban-card']");
    return cards.count();
  }
}
