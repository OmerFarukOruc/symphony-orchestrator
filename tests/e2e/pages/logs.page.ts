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

  /**
   * The sticky identity strip at the top of the logs page. Under the
   * hierarchical redesign the old `.logs-header` section was removed in favour
   * of the sticky `.mc-logs-top-bar`, which shows issue id, status, and tokens.
   */
  get header(): Locator {
    return this.page.locator(".mc-logs-top-bar");
  }

  get breadcrumb(): Locator {
    return this.page.locator(".mc-logs-top-bar-id");
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

  /**
   * Any log entry visible on the page. The hierarchical renderer emits
   * `.mc-logs-step` elements inside turn blocks; the legacy flat renderer
   * (used when filters/search are active) emits `.mc-log-row`. Both count
   * as user-visible entries.
   */
  get logRows(): Locator {
    return this.page.locator(".mc-logs-step, .mc-log-row");
  }

  get turnBlocks(): Locator {
    return this.page.locator(".mc-logs-turn");
  }

  get activeTurnBlock(): Locator {
    return this.page.locator(".mc-logs-turn.is-active");
  }

  get topBar(): Locator {
    return this.page.locator(".mc-logs-top-bar");
  }

  get stateBanner(): Locator {
    return this.page.locator(".mc-logs-top-bar-banner");
  }

  get logMessages(): Locator {
    return this.page.locator(".mc-logs-step-message, .mc-log-message");
  }

  get logTimestamps(): Locator {
    return this.page.locator(".mc-logs-step-time, .mc-log-time");
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
