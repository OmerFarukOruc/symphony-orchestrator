import type { Page, Locator } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object Model for the Logs page ("/issues/:id/logs" and "/logs/:id").
 */
export class LogsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /** Navigate to the issue logs page via the /issues/:id/logs route. */
  async navigateIssueLogs(identifier: string): Promise<void> {
    await this.goto(`/issues/${encodeURIComponent(identifier)}/logs`);
    await this.waitForPageContent();
  }

  /** Navigate to the live logs page via the /logs/:id route. */
  async navigateLiveLogs(identifier: string): Promise<void> {
    await this.goto(`/logs/${encodeURIComponent(identifier)}`);
    await this.waitForPageContent();
  }

  // ── Header ───────────────────────────────────────────────────────────

  get header(): Locator {
    return this.page.locator(".logs-header");
  }

  get breadcrumb(): Locator {
    return this.page.locator(".logs-breadcrumb");
  }

  // ── Mode Tabs ────────────────────────────────────────────────────────

  get liveButton(): Locator {
    return this.page.locator(".logs-live-btn");
  }

  get archiveButton(): Locator {
    return this.page.locator(".mc-button-segment button").filter({ hasText: "History" });
  }

  // ── Filter Controls ──────────────────────────────────────────────────

  get controlBar(): Locator {
    return this.page.locator(".logs-control");
  }

  get searchInput(): Locator {
    return this.page.locator(".logs-search");
  }

  get typeChips(): Locator {
    return this.page.locator(".mc-chip.is-interactive");
  }

  get activeTypeChip(): Locator {
    return this.page.locator(".mc-chip.is-interactive.is-active");
  }

  // ── Log Rows ─────────────────────────────────────────────────────────

  get scrollArea(): Locator {
    return this.page.locator(".logs-scroll");
  }

  get logRows(): Locator {
    return this.page.locator(".mc-log-row");
  }

  get logMessages(): Locator {
    return this.page.locator(".mc-log-message");
  }

  get logTimestamps(): Locator {
    return this.page.locator(".mc-log-time");
  }

  // ── View Actions ─────────────────────────────────────────────────────

  get sortButton(): Locator {
    return this.page.locator(".logs-view-actions button").first();
  }

  get viewActions(): Locator {
    return this.page.locator(".logs-view-actions");
  }

  // ── Empty State ──────────────────────────────────────────────────────

  get emptyState(): Locator {
    return this.page.locator(".mc-empty-state, [class*='empty-state']");
  }
}
