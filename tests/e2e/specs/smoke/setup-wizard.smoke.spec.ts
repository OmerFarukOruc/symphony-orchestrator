import { test, expect } from "../../fixtures/test";
import { SetupPage } from "../../pages/setup.page";

test.describe("Setup Wizard Walkthrough", () => {
  let setup: SetupPage;

  test.beforeEach(async ({ page, apiMock }) => {
    setup = new SetupPage(page);
    const scenario = apiMock.scenario().withSetupUnconfigured().build();
    await apiMock.install(scenario);
  });

  // ── Step indicator ──────────────────────────────────────────────

  test("renders step indicators with five steps", async () => {
    await setup.navigate();

    await expect(setup.stepIndicatorRow).toBeVisible({ timeout: 5000 });
    await expect(setup.stepIndicators).toHaveCount(5);
  });

  test("first step is active on initial load", async () => {
    await setup.navigate();

    await expect(setup.activeStepIndicator).toBeVisible({ timeout: 5000 });
    await expect(setup.activeStepIndicator).toContainText("Protect secrets");
  });

  // ── Master key step ─────────────────────────────────────────────

  test("shows welcome heading on master key step", async () => {
    await setup.navigate();

    await expect(setup.welcomeHeading).toBeVisible({ timeout: 5000 });
    await expect(setup.welcomeHeading).toContainText("Welcome to Symphony");
  });

  test("generates and displays master key", async () => {
    await setup.navigateAndWaitForKey();

    await expect(setup.keyDisplay).toBeVisible();
    await expect(setup.keyValue).toContainText("sym_test_master_key_abc123");
  });

  test("advances from master key to Linear project step", async ({ page }) => {
    await setup.navigateAndWaitForKey();
    await setup.nextButton.click();

    await expect(setup.activeStepIndicator).toContainText("Connect Linear");
    await expect(setup.doneStepIndicators).toHaveCount(1);
    await expect(page.getByText("Connect to Linear")).toBeVisible();
  });

  // ── Linear project step ─────────────────────────────────────────

  test("Linear step shows API key input and verify button", async () => {
    await setup.navigateAndWaitForKey();
    await setup.nextButton.click();

    await expect(setup.linearApiKeyInput).toBeVisible({ timeout: 5000 });
    await expect(setup.verifyKeyButton).toBeVisible();
    await expect(setup.verifyKeyButton).toBeDisabled();
  });

  test("verifying Linear key shows project grid", async ({ page }) => {
    await setup.navigateAndWaitForKey();
    await setup.nextButton.click();

    await setup.linearApiKeyInput.fill("lin_api_test_key_123");
    await expect(setup.verifyKeyButton).toBeEnabled();
    await setup.verifyKeyButton.click();

    await expect(setup.projectGrid).toBeVisible({ timeout: 5000 });
    await expect(setup.projectCards).toHaveCount(2);
    await expect(page.getByText("My Project")).toBeVisible();
    await expect(page.getByText("Other Project")).toBeVisible();
  });

  test("selecting a project enables Next button", async () => {
    await setup.navigateAndWaitForKey();
    await setup.nextButton.click();

    await setup.linearApiKeyInput.fill("lin_api_test_key_123");
    await setup.verifyKeyButton.click();
    await expect(setup.projectGrid).toBeVisible({ timeout: 5000 });

    await expect(setup.nextButton).toBeDisabled();
    await setup.projectCards.first().click();
    await expect(setup.selectedProjectCard).toBeVisible();
    await expect(setup.nextButton).toBeEnabled();
  });

  // ── Step navigation via indicator ───────────────────────────────

  test("clicking step indicator navigates between steps", async ({ page }) => {
    await setup.navigateAndWaitForKey();

    await setup.stepIndicators.nth(1).click();
    await expect(setup.activeStepIndicator).toContainText("Connect Linear");
    await expect(page.getByText("Connect to Linear")).toBeVisible();

    await setup.stepIndicators.nth(4).click();
    await expect(setup.activeStepIndicator).toContainText("Add GitHub");
    await expect(page.getByText("Add GitHub access")).toBeVisible();
  });

  // ── Skip behavior ──────────────────────────────────────────────

  test("skip button on Linear step advances to GitHub step", async ({ page }) => {
    await setup.navigateAndWaitForKey();
    await setup.nextButton.click();

    await expect(page.getByText("Connect to Linear")).toBeVisible({ timeout: 5000 });
    await setup.skipButton.click();

    await expect(setup.activeStepIndicator).toContainText("Add GitHub");
    await expect(page.getByText("Add GitHub access")).toBeVisible();
  });

  test("skip on GitHub step advances to done", async () => {
    await setup.navigateAndWaitForKey();

    await setup.stepIndicators.nth(4).click();
    await expect(setup.skipButton).toBeVisible({ timeout: 5000 });
    await setup.skipButton.click();

    await expect(setup.doneContainer).toBeVisible({ timeout: 5000 });
    await expect(setup.doneTitle).toContainText("You're all set");
  });

  // ── Done step ───────────────────────────────────────────────────

  test("done step shows completion state and dashboard button", async ({ page }) => {
    await setup.navigateAndWaitForKey();

    // Navigate to GitHub step, then skip to done
    await setup.stepIndicators.nth(4).click();
    await expect(setup.skipButton).toBeVisible({ timeout: 5000 });
    await setup.skipButton.click();

    await expect(setup.doneContainer).toBeVisible({ timeout: 5000 });
    await expect(setup.doneTitle).toContainText("You're all set");
    await expect(setup.stepIndicatorRow).toHaveCount(0);
    await expect(setup.goToDashboardButton).toBeVisible();
    await expect(page.getByText("Create a test issue")).toBeVisible();
    await expect(page.getByText("Create Symphony label")).toBeVisible();
  });

  // ── Full walkthrough ────────────────────────────────────────────

  test("full wizard walkthrough from master key to done", async ({ page }) => {
    await setup.navigateAndWaitForKey();

    // Step 1: Master Key
    await expect(setup.welcomeHeading).toBeVisible();
    await setup.nextButton.click();

    // Step 2: Linear Project -- verify key and select project
    await expect(page.getByText("Connect to Linear")).toBeVisible({ timeout: 5000 });
    await expect(setup.doneStepIndicators).toHaveCount(1);
    await setup.linearApiKeyInput.fill("lin_api_test_key_123");
    await setup.verifyKeyButton.click();
    await expect(setup.projectGrid).toBeVisible({ timeout: 5000 });
    await setup.projectCards.first().click();
    await setup.nextButton.click();

    // Step 3: Repo Config
    await expect(setup.activeStepIndicator).toContainText("Link repo", { timeout: 5000 });
    await expect(setup.doneStepIndicators).toHaveCount(2);
    await setup.skipButton.click();

    // Step 4: OpenAI Key
    await expect(setup.activeStepIndicator).toContainText("Add OpenAI", { timeout: 5000 });
    await expect(setup.doneStepIndicators).toHaveCount(3);
    await setup.skipButton.click();

    // Step 5: GitHub Token
    await expect(setup.activeStepIndicator).toContainText("Add GitHub", { timeout: 5000 });
    await expect(setup.doneStepIndicators).toHaveCount(4);
    await setup.skipButton.click();

    // Done
    await expect(setup.doneContainer).toBeVisible({ timeout: 5000 });
    await expect(setup.doneTitle).toContainText("You're all set");
    await expect(setup.goToDashboardButton).toBeVisible();
  });
});
