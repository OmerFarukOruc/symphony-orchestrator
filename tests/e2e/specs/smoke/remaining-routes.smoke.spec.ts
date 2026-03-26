import { test, expect } from "../../fixtures/test";
import { AppShellPage } from "../../pages/app-shell.page";
import { ConfigPage } from "../../pages/config.page";
import { IssuePage } from "../../pages/issue.page";
import { QueuePage } from "../../pages/queue.page";
import { SetupPage } from "../../pages/setup.page";

test.describe("Remaining route parity smoke", () => {
  test.beforeEach(async ({ apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install({
      ...scenario,
      routeOverrides: {
        "**/api/v1/workspaces/*": async (route) => {
          if (route.request().method() === "DELETE") {
            await route.fulfill({
              status: 204,
              body: "",
            });
            return;
          }

          await route.fallback();
        },
        "**/api/v1/git/context": async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              repos: [
                {
                  repoUrl: "https://github.com/acme/symphony",
                  githubOwner: "acme",
                  githubRepo: "symphony",
                  configured: true,
                  defaultBranch: "main",
                  identifierPrefix: "SYM",
                  label: "Primary",
                  github: {
                    visibility: "private",
                    description: "Operator control plane repository",
                    openPrCount: 2,
                    recentCommits: [
                      {
                        sha: "abc1234",
                        message: "Refine route parity coverage",
                        author: "Omer",
                        date: "2026-01-15T12:00:00.000Z",
                      },
                    ],
                    pulls: [
                      {
                        number: 42,
                        title: "React remaining routes",
                        url: "https://github.com/acme/symphony/pull/42",
                        author: "Omer",
                        headBranch: "react-route-parity",
                        updatedAt: "2026-01-15T12:05:00.000Z",
                      },
                    ],
                  },
                },
              ],
              activeBranches: [
                {
                  identifier: "SYM-42",
                  branchName: "sym-42-fix-auth",
                  status: "running",
                  pullRequestUrl: "https://github.com/acme/symphony/pull/42",
                },
              ],
            }),
          });
        },
      },
      runtimeInfo: {
        version: "0.3.1",
        workflow_path: "/tmp/WORKFLOW.md",
        data_dir: "/tmp/symphony-data",
        feature_flags: {},
        provider_summary: "Codex",
      },
    });
  });

  test("sidebar covers every remaining registered route", async ({ page }) => {
    const shell = new AppShellPage(page);
    await page.goto("/");
    await shell.waitForPageContent();

    await expect(shell.sidebarItemByPath("/queue")).toBeVisible();
    await expect(shell.sidebarItemByPath("/settings")).toBeVisible();
    await expect(shell.sidebarItemByPath("/observability")).toBeVisible();
    await expect(shell.sidebarItemByPath("/notifications")).toBeVisible();
    await expect(shell.sidebarItemByPath("/git")).toBeVisible();
    await expect(shell.sidebarItemByPath("/containers")).toBeVisible();
    await expect(shell.sidebarItemByPath("/workspaces")).toBeVisible();
    await expect(shell.sidebarItemByPath("/welcome")).toBeVisible();
    await expect(shell.sidebarItemByPath("/setup")).toBeVisible();
  });

  test("queue detail route renders the legacy drawer view in React", async ({ page }) => {
    const queue = new QueuePage(page);
    await page.goto("/queue/SYM-42");
    await queue.waitForPageContent();

    await expect(page.getByTestId("queue-route")).toBeVisible();
    await expect(page.getByText("Fix authentication bug").first()).toBeVisible();
    await expect(page).toHaveURL(/\/queue\/SYM-42$/);
  });

  test("issue runs, issue logs, logs alias, and attempt routes render", async ({ page }) => {
    const issue = new IssuePage(page);

    await page.goto("/issues/SYM-42/runs");
    await issue.waitForPageContent();
    await expect(page.getByTestId("issue-runs-route")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Run History/i })).toBeVisible();

    await page.goto("/issues/SYM-42/logs");
    await issue.waitForPageContent();
    await expect(page.getByTestId("logs-route")).toBeVisible();
    await expect(page.getByText("Archive", { exact: true })).toBeVisible();

    await page.goto("/logs/SYM-42");
    await issue.waitForPageContent();
    await expect(page.getByTestId("logs-route")).toBeVisible();
    await expect(page.getByText("Live", { exact: true })).toBeVisible();

    await page.goto("/attempts/att-001");
    await issue.waitForPageContent();
    await expect(page.getByTestId("attempt-route")).toBeVisible();
    await expect(page.getByText("Archived attempt metadata", { exact: false })).toBeVisible();
  });

  test("observability, git, and workspaces routes mount legacy views", async ({ page }) => {
    await page.goto("/observability");
    await page.waitForSelector('[data-testid="observability-route"]', { state: "visible" });
    await expect(page.getByRole("heading", { name: "Observability", exact: true })).toBeVisible();
    await expect(page.getByText("Raw metrics", { exact: false })).toBeVisible();

    await page.goto("/git");
    await page.waitForSelector('[data-testid="git-route"]', { state: "visible" });
    await expect(page.getByRole("heading", { name: "Repositories", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Open pull requests", exact: true })).toBeVisible();

    await page.goto("/workspaces");
    await page.waitForSelector('[data-testid="workspaces-route"]', { state: "visible" });
    await expect(page.getByTestId("workspaces-route").locator("h1").first()).toContainText("Workspaces");
    await expect(page.getByText("No workspaces on disk", { exact: false })).toBeVisible();
  });

  test("placeholder-backed remaining pages render through React shell", async ({ page }) => {
    await page.goto("/containers");
    await page.waitForSelector('[data-testid="containers-route"]', { state: "visible" });
    await expect(page.getByText("Container telemetry needs backend API support", { exact: false })).toBeVisible();

    await page.goto("/notifications");
    await page.waitForSelector('[data-testid="notifications-route"]', { state: "visible" });
    await expect(page.getByText("Notification history needs backend API support", { exact: false })).toBeVisible();
  });

  test("welcome and setup routes render operator onboarding pages", async ({ page }) => {
    const setup = new SetupPage(page);

    await page.goto("/welcome");
    await page.waitForSelector('[data-testid="welcome-route"]', { state: "visible" });
    await expect(page.getByText("Get started", { exact: true })).toBeVisible();
    await expect(page.getByText("Your autonomous coding pipeline.", { exact: true })).toBeVisible();

    await setup.navigate();
    await page.waitForSelector('[data-testid="setup-route"]', { state: "visible" });
    await expect(page.getByRole("heading", { name: "Protect your secrets", exact: true })).toBeVisible();
  });

  test("legacy config alias redirects while secrets route remains directly addressable", async ({ page }) => {
    const config = new ConfigPage(page);

    await config.navigateToConfig();
    await expect(page).toHaveURL(/\/settings#advanced$/);
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

    await config.navigateToSecrets();
    await expect(page).toHaveURL(/\/secrets$/);
    await expect(page.getByRole("heading", { name: "Credentials", exact: true })).toBeVisible();
  });
});
