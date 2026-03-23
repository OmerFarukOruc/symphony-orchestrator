import type { Page, Locator } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object Model for the Overview ("/") page.
 */
export class OverviewPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    await this.goto("/");
    await this.waitForPageContent();
  }

  // ── Metric Cards ─────────────────────────────────────────────────────

  /** The "NOW" status bar with running/queue/rate-limit/attention counts. */
  get statusBar(): Locator {
    return this.page.locator(".overview-status, .status-bar, .metric-row").first();
  }

  get runningCount(): Locator {
    return this.page.getByText("RUNNING");
  }

  get queueCount(): Locator {
    return this.page.locator(".overview-live-label").filter({ hasText: "Queue" });
  }

  // ── Attention Queue ──────────────────────────────────────────────────

  get attentionSection(): Locator {
    return this.page.locator("text=Attention").first();
  }

  get issueCards(): Locator {
    return this.page.locator(".issue-card, .attention-card, [class*='issue-card']");
  }

  // ── Token Burn ───────────────────────────────────────────────────────

  get tokenBurnSection(): Locator {
    return this.page.getByText("TOKEN BURN");
  }

  // ── Recent Events ────────────────────────────────────────────────────

  get recentEventsSection(): Locator {
    return this.page.getByText("Recent events");
  }

  get eventRows(): Locator {
    return this.page.locator(".event-row, [class*='event-row']");
  }

  // ── System Health ────────────────────────────────────────────────────

  get systemHealthSection(): Locator {
    return this.page.getByText("System health");
  }

  // ── Quick Actions ────────────────────────────────────────────────────

  get quickActionsSection(): Locator {
    return this.page.getByText("QUICK ACTIONS");
  }
}
