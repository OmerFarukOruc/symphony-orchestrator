import type { Page, Locator } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object Model for the Issue Detail ("/issues/:id") page.
 */
export class IssuePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigate(identifier: string): Promise<void> {
    await this.goto(`/issues/${encodeURIComponent(identifier)}`);
    await this.waitForPageContent();
  }

  // ── Header ───────────────────────────────────────────────────────────

  get title(): Locator {
    return this.page.locator(".issue-title, .page-title, h1").first();
  }

  get identifier(): Locator {
    return this.page.locator(".issue-identifier, .issue-id, [class*='identifier']").first();
  }

  get statusBadge(): Locator {
    return this.page.locator(".issue-status, .status-badge, [class*='status']").first();
  }

  // ── Actions ──────────────────────────────────────────────────────────

  get abortButton(): Locator {
    return this.page.locator("button").filter({ hasText: /abort|stop|cancel/i });
  }

  // ── Attempts Section ─────────────────────────────────────────────────

  get attemptsSection(): Locator {
    return this.page.locator("[class*='attempt'], [class*='run']").first();
  }

  get attemptRows(): Locator {
    return this.page.locator(".attempt-row, tr, [class*='attempt-row']");
  }

  // ── Events / Logs ────────────────────────────────────────────────────

  get eventRows(): Locator {
    return this.page.locator(".event-row, [class*='event-row']");
  }

  get logRows(): Locator {
    return this.page.locator(".log-row, [class*='log-row'], [class*='log-entry']");
  }

  // ── Details Section ──────────────────────────────────────────────────

  get descriptionSection(): Locator {
    return this.page.locator("[class*='description'], [class*='detail']").first();
  }

  get modelInfo(): Locator {
    return this.page.getByText(/o3-mini|model/i).first();
  }

  get tokenUsage(): Locator {
    return this.page.locator("[class*='token'], [class*='usage']").first();
  }

  get branchName(): Locator {
    return this.page.locator("[class*='branch']").first();
  }
}
