import type { Page, Locator } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object Model for the Setup Wizard page.
 */
export class SetupPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /** Navigate to the setup page and wait for content. */
  async navigate(): Promise<void> {
    await this.goto("/setup");
    await this.waitForPageContent();
  }

  /** Navigate to setup and wait for the master key to be generated. */
  async navigateAndWaitForKey(): Promise<void> {
    await this.navigate();
    await this.keyValue.waitFor({ state: "visible", timeout: 5000 });
  }

  /** Check if the setup page is currently displayed. */
  async isVisible(): Promise<boolean> {
    const path = await this.currentPath();
    return path === "/setup";
  }

  // ── Headings & intro ────────────────────────────────────────────

  /** Get the welcome heading shown on the master-key step. */
  get welcomeHeading(): Locator {
    return this.page.locator(".setup-intro-heading");
  }

  /** Get the page heading (generic). */
  get heading(): Locator {
    return this.page.locator(".page-title, h1").first();
  }

  // ── Step indicator ──────────────────────────────────────────────

  /** Container for the step indicator row. */
  get stepIndicatorRow(): Locator {
    return this.page.locator(".setup-steps");
  }

  /** All individual step indicator items. */
  get stepIndicators(): Locator {
    return this.page.locator(".setup-step-indicator");
  }

  /** The currently active step indicator. */
  get activeStepIndicator(): Locator {
    return this.page.locator(".setup-step-indicator.is-active");
  }

  /** Step indicators marked as done. */
  get doneStepIndicators(): Locator {
    return this.page.locator(".setup-step-indicator.is-done");
  }

  // ── Step content ────────────────────────────────────────────────

  /** The setup content area that wraps the current step. */
  get stepContent(): Locator {
    return this.page.locator(".setup-content");
  }

  /** Step title inside the content area. */
  get stepTitle(): Locator {
    return this.page.locator(".setup-title, .setup-title-row").first();
  }

  // ── Master key step ─────────────────────────────────────────────

  /** The generated key display area. */
  get keyDisplay(): Locator {
    return this.page.locator(".setup-key-display");
  }

  /** The key value text. */
  get keyValue(): Locator {
    return this.page.locator(".setup-key-value");
  }

  // ── Linear project step ─────────────────────────────────────────

  /** The Linear API key input. */
  get linearApiKeyInput(): Locator {
    return this.page.locator("#setup-linear-api-key");
  }

  /** The project selection grid. */
  get projectGrid(): Locator {
    return this.page.locator(".setup-project-grid");
  }

  /** Individual project cards in the grid. */
  get projectCards(): Locator {
    return this.page.locator(".setup-project-card");
  }

  /** The currently selected project card. */
  get selectedProjectCard(): Locator {
    return this.page.locator(".setup-project-card.is-selected");
  }

  // ── Repo config step ────────────────────────────────────────────

  /** Repo URL input field. */
  get repoUrlInput(): Locator {
    return this.page.locator("#setup-repo-url");
  }

  // ── OpenAI setup step ───────────────────────────────────────────

  /** All auth mode cards on the OpenAI step. */
  get openaiAuthCards(): Locator {
    return this.page.locator(".setup-auth-card");
  }

  /** Proxy / compatible provider auth mode card. */
  get proxyProviderCard(): Locator {
    return this.page.locator(".setup-auth-card", { hasText: /Proxy \/ compatible provider/ });
  }

  /** Optional provider display name input. */
  get providerNameInput(): Locator {
    return this.page.locator("#setup-openai-provider-name");
  }

  /** Provider base URL input. */
  get providerBaseUrlInput(): Locator {
    return this.page.locator("#setup-openai-provider-base-url");
  }

  /** Provider token input. */
  get providerTokenInput(): Locator {
    return this.page.locator("#setup-openai-provider-token");
  }

  // ── GitHub token step ───────────────────────────────────────────

  /** GitHub token input field. */
  get githubTokenInput(): Locator {
    return this.page.locator("#setup-github-token");
  }

  // ── Done step ───────────────────────────────────────────────────

  /** The done step container. */
  get doneContainer(): Locator {
    return this.page.locator(".setup-done");
  }

  /** The done step title. */
  get doneTitle(): Locator {
    return this.page.locator(".setup-done-title");
  }

  /** The "Open dashboard" button on the done step. */
  get goToDashboardButton(): Locator {
    return this.page.getByRole("button", { name: /Open dashboard|Go to Dashboard/ });
  }

  // ── Shared controls ─────────────────────────────────────────────

  /** Primary "Next" / "Continue" button. */
  get nextButton(): Locator {
    return this.page.locator("button.mc-button.is-primary", { hasText: /next|continue|saving|save/i });
  }

  /** "Skip" button (ghost variant). */
  get skipButton(): Locator {
    return this.page.locator("button.mc-button.is-ghost", { hasText: /Skip/ });
  }

  /** "Check key" / "Check again" button on the Linear step. */
  get verifyKeyButton(): Locator {
    return this.page.locator("button.mc-button.is-primary", {
      hasText: /Check key|Check again|Checking|Verify|Re-verify|Verifying/,
    });
  }

  /** Error message display. */
  get errorMessage(): Locator {
    return this.page.locator(".setup-error");
  }

  /** All setup step elements (legacy locator). */
  get steps(): Locator {
    return this.page.locator(".setup-step, .setup-card, [class*='setup']");
  }
}
