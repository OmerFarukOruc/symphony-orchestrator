import { expect, test } from "../../fixtures/test";
import { buildAttemptRecord } from "../../mocks/data/attempts";
import { buildCheckpointRecord, buildMidRunCheckpoint, buildStartCheckpoint } from "../../mocks/data/checkpoint";
import { buildGitContext } from "../../mocks/data/git-context";
import { buildIssueDetail } from "../../mocks/data/issue-detail";
import { buildMergedPrRecord, buildPrRecord } from "../../mocks/data/pr";

test.describe("Git Lifecycle Smoke", () => {
  test("git page shows tracked PR lifecycle records", async ({ page, apiMock }) => {
    await apiMock.install({
      gitContext: buildGitContext(),
      prRecords: [
        buildPrRecord(),
        buildMergedPrRecord({
          number: 43,
          issueId: "issue-merged",
          url: "https://github.com/owner/repo/pull/43",
          branchName: "sym-41-cleanup",
          mergeCommitSha: "fedcba654321",
        }),
      ],
    });

    await page.goto("/git");
    await page.waitForSelector("#main-content", { state: "attached" });

    await expect(page.getByRole("heading", { name: "Tracked PR lifecycle" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("1 merged")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("owner/repo").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("fedcba654321").first()).toBeVisible({ timeout: 5000 });
  });

  test("attempt page shows checkpoint history and agent-authored PR summary", async ({ page, apiMock }) => {
    await apiMock.install({
      attemptRecords: {
        "att-001": buildAttemptRecord({
          attemptId: "att-001",
          issueIdentifier: "SYM-42",
          summary: "- Added checkpoint history to the attempt page\n- Surfaced tracked PR lifecycle in the Git view",
        }),
      },
      issueDetail: {
        "SYM-42": buildIssueDetail({
          identifier: "SYM-42",
          pullRequestUrl: "https://github.com/owner/repo/pull/42",
        }),
      },
      checkpointRecords: {
        "att-001": [
          buildStartCheckpoint({ attemptId: "att-001", checkpointId: 1, ordinal: 1 }),
          buildMidRunCheckpoint({ attemptId: "att-001", checkpointId: 2, ordinal: 2 }),
          buildCheckpointRecord({ attemptId: "att-001", checkpointId: 3, ordinal: 3, trigger: "pr_merged" }),
        ],
      },
    });

    await page.goto("/attempts/att-001");
    await page.waitForSelector("#main-content", { state: "attached" });

    await expect(page.getByText("Agent-authored PR summary")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Added checkpoint history to the attempt page")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Checkpoint history" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("PR Merged").first()).toBeVisible({ timeout: 5000 });
  });
});
