import { test, expect } from "../../fixtures/test";
import { IssuePage } from "../../pages/issue.page";
import { buildIssueDrilldownScenario } from "../../mocks/scenarios/issue-drilldown";
import { buildIssueDetail } from "../../mocks/data/issue-detail";
import { buildAttemptSummary } from "../../mocks/data/attempts";
import { buildRuntimeSnapshot, buildIssueView } from "../../mocks/data/runtime-snapshot";
import { buildSetupStatus } from "../../mocks/data/setup-status";
import type { ApiMockFixture } from "../../fixtures/test";

/**
 * Build and install a retrying-issue scenario for the given identifier.
 */
async function installRetryingScenario(
  apiMock: ApiMockFixture,
  opts: {
    identifier: string;
    title: string;
    error: string;
    errorCode: string;
    attempt?: number;
  },
): Promise<void> {
  const { identifier, title, error, errorCode, attempt = 1 } = opts;
  const issueId = `issue-${identifier.toLowerCase()}`;
  const attemptId = `att-${identifier.toLowerCase()}`;

  const retryingIssue = buildIssueView({
    issueId,
    identifier,
    title,
    state: "In Progress",
    status: "retrying",
    attempt,
    error,
  });

  const retryDetail = buildIssueDetail({
    issueId,
    identifier,
    title,
    state: "In Progress",
    status: "retrying",
    attempt,
    error,
    attempts: [
      buildAttemptSummary({
        attemptId,
        attemptNumber: attempt,
        status: "failed",
        endedAt: "2026-01-15T10:30:00.000Z",
        errorCode,
        errorMessage: error,
      }),
    ],
    currentAttemptId: attemptId,
  });

  await apiMock.install({
    setupStatus: buildSetupStatus(),
    runtimeSnapshot: buildRuntimeSnapshot({
      running: [],
      retrying: [retryingIssue],
      counts: { running: 0, retrying: 1 },
    }),
    issueDetail: { [identifier]: retryDetail },
  });
}

/** Locator for the model text input inside the model settings form. */
const MODEL_INPUT_SELECTOR = ".issue-form-grid select.mc-select";

test.describe("Issue Actions: Abort", () => {
  test.beforeEach(async ({ apiMock }) => {
    await apiMock.install(buildIssueDrilldownScenario());
  });

  test("abort button is visible for a running issue", async ({ page }) => {
    const issue = new IssuePage(page);
    await issue.navigate("SYM-42");

    await expect(issue.abortButton).toBeVisible({ timeout: 5000 });
  });

  test("clicking abort opens a confirmation modal", async ({ page }) => {
    const issue = new IssuePage(page);
    await issue.navigate("SYM-42");

    await issue.abortButton.click();

    await expect(page.getByText("Abort SYM-42?")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("Abort issue")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Keep running")).toBeVisible({ timeout: 5000 });
  });

  test("confirming abort sends POST to abort endpoint", async ({ page }) => {
    const issue = new IssuePage(page);
    await issue.navigate("SYM-42");

    const abortRequest = page.waitForRequest(
      (req) => req.method() === "POST" && /\/api\/v1\/SYM-42\/abort$/.test(req.url()),
    );

    await issue.abortButton.click();
    await page.getByText("Abort issue").click();

    const request = await abortRequest;
    expect(request.method()).toBe("POST");
    expect(new URL(request.url()).pathname).toBe("/api/v1/SYM-42/abort");
  });

  test("cancelling abort modal does not send a request", async ({ page }) => {
    const issue = new IssuePage(page);
    await issue.navigate("SYM-42");

    let abortRequestSent = false;
    await page.route(/\/api\/v1\/SYM-42\/abort$/, (route) => {
      abortRequestSent = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await issue.abortButton.click();
    await page.getByText("Keep running").click();

    await page.waitForTimeout(500);
    expect(abortRequestSent).toBe(false);
  });
});

test.describe("Issue Actions: Model Override", () => {
  test.beforeEach(async ({ apiMock }) => {
    await apiMock.install(buildIssueDrilldownScenario());
  });

  test("model settings section is visible on issue detail", async ({ page }) => {
    const issue = new IssuePage(page);
    await issue.navigate("SYM-42");

    await expect(page.getByText("Model settings")).toBeVisible({
      timeout: 5000,
    });
  });

  test("model form shows current model value", async ({ page }) => {
    const issue = new IssuePage(page);
    await issue.navigate("SYM-42");

    const modelInput = page.locator(MODEL_INPUT_SELECTOR).first();
    await expect(modelInput).toBeVisible({ timeout: 5000 });
    await expect(modelInput).toHaveValue("o3-mini");
  });

  test("submitting model override sends POST with correct payload", async ({ page }) => {
    const issue = new IssuePage(page);
    await issue.navigate("SYM-42");

    const modelInput = page.locator(MODEL_INPUT_SELECTOR).first();
    await expect(modelInput).toBeVisible({ timeout: 5000 });
    await expect(modelInput.locator('option[value="gpt-5.4"]')).toBeAttached({ timeout: 5000 });

    const modelRequest = page.waitForRequest(
      (req) => req.method() === "POST" && /\/api\/v1\/SYM-42\/model$/.test(req.url()),
    );

    await modelInput.selectOption("gpt-5.4");
    await modelInput.locator("xpath=ancestor::form").locator('button[type="submit"]').click();

    const request = await modelRequest;
    const body = request.postDataJSON();
    expect(body.model).toBe("gpt-5.4");
    expect(new URL(request.url()).pathname).toBe("/api/v1/SYM-42/model");
  });

  test("model override shows success toast", async ({ page }) => {
    const issue = new IssuePage(page);
    await issue.navigate("SYM-42");

    const modelInput = page.locator(MODEL_INPUT_SELECTOR).first();
    await expect(modelInput).toBeVisible({ timeout: 5000 });
    await expect(modelInput.locator('option[value="gpt-5.4"]')).toBeAttached({ timeout: 5000 });

    await modelInput.selectOption("gpt-5.4");
    await modelInput.locator("xpath=ancestor::form").locator('button[type="submit"]').click();

    await expect(page.getByText("Model override saved for next run.")).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Issue Actions: Retry", () => {
  test("retrying issue shows retry schedule section", async ({ apiMock, page }) => {
    await installRetryingScenario(apiMock, {
      identifier: "SYM-50",
      title: "Flaky test fix",
      error: "Agent timed out",
      errorCode: "AGENT_TIMEOUT",
      attempt: 2,
    });

    const issue = new IssuePage(page);
    await issue.navigate("SYM-50");

    await expect(page.getByText("Retry schedule")).toBeVisible({
      timeout: 5000,
    });
  });

  test("retrying issue shows error reason", async ({ apiMock, page }) => {
    await installRetryingScenario(apiMock, {
      identifier: "SYM-51",
      title: "Broken deployment",
      error: "Container crashed unexpectedly",
      errorCode: "CONTAINER_CRASH",
    });

    const issue = new IssuePage(page);
    await issue.navigate("SYM-51");

    await expect(page.getByText("Container crashed unexpectedly").first()).toBeVisible({ timeout: 5000 });
  });

  test("abort button is not visible for a retrying issue", async ({ apiMock, page }) => {
    await installRetryingScenario(apiMock, {
      identifier: "SYM-52",
      title: "Retry visibility test",
      error: "Agent failed",
      errorCode: "AGENT_ERROR",
    });

    const issue = new IssuePage(page);
    await issue.navigate("SYM-52");

    await expect(issue.abortButton).toBeHidden({ timeout: 5000 });
  });
});
