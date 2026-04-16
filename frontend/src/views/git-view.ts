import { api } from "../api";
import { createEmptyState } from "../components/empty-state";
import { createPageHeader } from "../components/page-header";
import { router } from "../router";
import { getRuntimeClient } from "../state/runtime-client.js";
import type { ActiveBranchView, GitCommitView, GitContextResponse, GitPullView, GitRepoView } from "../types/setup.js";
import type { TrackedPrRecord } from "../types/config.js";
import { statusDot as sharedStatusDot } from "../ui/status-chip";
import { el } from "../utils/dom";
import { registerPageCleanup } from "../utils/page";
import { formatRelativeTime, formatTimestamp } from "../utils/format";

interface GitPageData {
  context: GitContextResponse;
  trackedPrs: TrackedPrRecord[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function externalLink(url: string, text: string, className?: string): HTMLAnchorElement {
  const a = el("a", className, text);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

function badge(text: string, variant: string): HTMLSpanElement {
  const span = el("span", `git-badge git-badge--${variant}`, text);
  return span;
}

function statusDot(status: string): HTMLSpanElement {
  // Uses the canonical statusDot primitive but with the git-scoped base class
  // so git-view.css continues to own the visual treatment.
  return sharedStatusDot(status, "git-status-dot") as HTMLSpanElement;
}

function sortTrackedPrs(prs: TrackedPrRecord[]): TrackedPrRecord[] {
  return [...prs].sort((left, right) => {
    const leftTime = Date.parse(left.mergedAt ?? left.updatedAt);
    const rightTime = Date.parse(right.mergedAt ?? right.updatedAt);
    return rightTime - leftTime;
  });
}

function countTrackedPrs(prs: TrackedPrRecord[], status?: TrackedPrRecord["status"]): number {
  if (!status) {
    return prs.length;
  }
  return prs.filter((pr) => pr.status === status).length;
}

/* ------------------------------------------------------------------ */
/*  Section builders                                                   */
/* ------------------------------------------------------------------ */

function buildRepoCardCommits(commits: GitCommitView[]): HTMLElement {
  const section = el("div", "git-repo-inline-commits");
  section.append(el("span", "git-repo-inline-commits-title", "Recent commits"));
  const list = el("div", "git-repo-inline-commit-list");
  for (const commit of commits.slice(0, 3)) {
    const row = el("div", "git-repo-inline-commit");
    row.append(el("code", "git-commit-sha", commit.sha), el("span", "git-repo-inline-commit-msg", commit.message));
    list.append(row);
  }
  section.append(list);
  return section;
}

function buildRepoCard(repo: GitRepoView): HTMLElement {
  const card = el("div", "git-repo-card");
  const repoUrl =
    repo.githubOwner && repo.githubRepo ? `https://github.com/${repo.githubOwner}/${repo.githubRepo}` : repo.repoUrl;

  // Make entire card clickable
  card.addEventListener("click", (e) => {
    // Don't intercept clicks on inner links
    if ((e.target as HTMLElement).closest("a")) return;
    window.open(repoUrl, "_blank", "noopener,noreferrer");
  });

  const header = el("div", "git-repo-card-header");
  const name = repo.githubOwner && repo.githubRepo ? `${repo.githubOwner}/${repo.githubRepo}` : repo.repoUrl;

  if (repo.githubOwner && repo.githubRepo) {
    header.append(externalLink(repoUrl, name, "git-repo-name"));
  } else {
    header.append(el("span", "git-repo-name", name));
  }

  if (repo.github?.visibility) {
    header.append(badge(repo.github.visibility, "muted"));
  }
  header.append(badge(repo.configured ? "configured" : "discovered", repo.configured ? "accent" : "discovered"));
  card.append(header);

  if (repo.github?.description) {
    card.append(el("p", "git-repo-desc", repo.github.description));
  }

  const meta = el("div", "git-repo-meta");
  meta.append(badge(repo.defaultBranch, "branch"));
  if (repo.identifierPrefix) {
    meta.append(badge(`prefix: ${repo.identifierPrefix}`, "muted"));
  }
  if (repo.label) {
    meta.append(badge(`label: ${repo.label}`, "muted"));
  }
  if (repo.github) {
    meta.append(badge(`${repo.github.openPrCount} open PRs`, "accent"));
  }
  card.append(meta);

  // Inline recent commits
  if (repo.github?.recentCommits?.length) {
    card.append(buildRepoCardCommits(repo.github.recentCommits));
  }

  return card;
}

function buildBranchRow(branch: ActiveBranchView): HTMLElement {
  const row = el("div", "git-branch-row");

  const idBtn = el("button", "git-branch-id");
  idBtn.type = "button";
  idBtn.append(statusDot(branch.status), el("span", "text-mono", branch.identifier));
  idBtn.addEventListener("click", () => router.navigate(`/queue/${branch.identifier}`));
  row.append(idBtn);

  row.append(el("span", "git-branch-name text-mono", branch.branchName));
  row.append(el("span", "git-branch-status", branch.status));

  if (branch.pullRequestUrl) {
    const prLink = externalLink(branch.pullRequestUrl, "PR ↗", "git-branch-pr-link");
    prLink.setAttribute("aria-label", `Open pull request for ${branch.branchName}`);
    row.append(prLink);
  }

  return row;
}

function buildPullRow(pr: GitPullView): HTMLElement {
  const row = el("div", "git-pr-row");

  const info = el("div", "git-pr-info");
  info.append(externalLink(pr.url, `#${pr.number}`, "git-pr-number text-mono"), el("span", "git-pr-title", pr.title));
  row.append(info);

  const meta = el("div", "git-pr-meta");
  meta.append(
    el("span", "git-pr-author", pr.author),
    badge(pr.headBranch, "branch"),
    el("span", "git-pr-time", formatRelativeTime(pr.updatedAt)),
  );
  row.append(meta);

  return row;
}

function buildCommitRow(commit: GitCommitView): HTMLElement {
  const row = el("div", "git-commit-row");
  row.append(
    el("code", "git-commit-sha", commit.sha),
    el("span", "git-commit-msg", commit.message),
    el("span", "git-commit-author", commit.author),
    el("span", "git-commit-time", formatRelativeTime(commit.date)),
  );
  return row;
}

function buildTrackedPrRow(pr: TrackedPrRecord): HTMLElement {
  const row = el("article", "git-tracked-pr-row");
  const top = el("div", "git-tracked-pr-top");
  const identity = el("div", "git-tracked-pr-identity");
  identity.append(
    externalLink(pr.url, `#${pr.number}`, "git-pr-number text-mono"),
    badge(pr.status, pr.status),
    el("span", "git-tracked-pr-repo", pr.repo),
  );
  top.append(identity, el("span", "git-pr-time", formatRelativeTime(pr.mergedAt ?? pr.updatedAt)));

  const meta = el("div", "git-tracked-pr-meta");
  meta.append(
    badge(pr.branchName, "branch"),
    el("span", "git-tracked-pr-issue text-mono", `issue ${pr.issueId}`),
    el(
      "span",
      "git-tracked-pr-updated",
      pr.status === "merged" && pr.mergedAt
        ? `Merged ${formatTimestamp(pr.mergedAt)}`
        : `Updated ${formatTimestamp(pr.updatedAt)}`,
    ),
  );
  if (pr.mergeCommitSha) {
    meta.append(el("code", "git-tracked-pr-sha", pr.mergeCommitSha.slice(0, 12)));
  }

  row.append(top, meta);
  return row;
}

function sectionHeader(title: string, count?: number): HTMLElement {
  const header = el("div", "git-section-header");
  header.append(el("h2", "git-section-title", title));
  if (count !== undefined) {
    header.append(badge(String(count), "accent"));
  }
  return header;
}

function collectPulls(data: GitContextResponse): GitPullView[] {
  const pulls: GitPullView[] = [];
  for (const repo of data.repos) {
    if (repo.github?.pulls) {
      pulls.push(...repo.github.pulls);
    }
  }
  return pulls;
}

function repoLabel(repo: GitRepoView): string {
  return repo.githubOwner && repo.githubRepo ? `${repo.githubOwner}/${repo.githubRepo}` : repo.repoUrl;
}

function buildRepoSection(data: GitContextResponse): HTMLElement {
  const section = el("section", "git-section git-section--repos");
  const configured = data.repos.filter((r) => r.configured);
  const discovered = data.repos.filter((r) => !r.configured);

  section.append(sectionHeader("Repositories", data.repos.length));

  const grid = el("div", "git-repo-grid");
  for (const repo of configured) {
    grid.append(buildRepoCard(repo));
  }
  for (const repo of discovered) {
    grid.append(buildRepoCard(repo));
  }
  section.append(grid);
  return section;
}

function buildBranchSection(data: GitContextResponse): HTMLElement {
  const section = el("section", "git-section git-section--branches");
  section.append(sectionHeader("Active branches", data.activeBranches.length));
  if (data.activeBranches.length > 0) {
    const list = el("div", "git-branch-list");
    for (const branch of data.activeBranches) {
      list.append(buildBranchRow(branch));
    }
    section.append(list);
  } else {
    section.append(
      createEmptyState(
        "No active branches",
        "Branches appear here when a running issue has an assigned branch name in the tracker.",
        undefined,
        undefined,
        "queue",
        { headingLevel: "h3" },
      ),
    );
  }
  return section;
}

function buildPrSection(pulls: GitPullView[]): HTMLElement | null {
  if (pulls.length === 0) return null;
  const section = el("section", "git-section git-section--prs");
  section.append(sectionHeader("Open pull requests", pulls.length));
  const list = el("div", "git-pr-list");
  for (const pr of pulls) {
    list.append(buildPullRow(pr));
  }
  section.append(list);
  return section;
}

function buildTrackedPrSection(trackedPrs: TrackedPrRecord[]): HTMLElement {
  const section = el("section", "git-section git-section--tracked");
  section.append(sectionHeader("Tracked PR lifecycle", trackedPrs.length));

  const summary = el("div", "git-tracked-pr-summary");
  summary.append(
    badge(`${countTrackedPrs(trackedPrs, "open")} open`, "open"),
    badge(`${countTrackedPrs(trackedPrs, "merged")} merged`, "merged"),
    badge(`${countTrackedPrs(trackedPrs, "closed")} closed`, "closed"),
  );
  section.append(summary);

  if (trackedPrs.length === 0) {
    section.append(
      createEmptyState(
        "No tracked PRs yet",
        "Records appear here after Risoluto opens or monitors agent pull requests.",
        undefined,
        undefined,
        "events",
        { headingLevel: "h3" },
      ),
    );
    return section;
  }

  const list = el("div", "git-tracked-pr-list");
  for (const pr of sortTrackedPrs(trackedPrs)) {
    list.append(buildTrackedPrRow(pr));
  }
  section.append(list);
  return section;
}

function buildCommitRail(data: GitContextResponse): HTMLElement[] {
  const sections: HTMLElement[] = [];
  for (const repo of data.repos) {
    if (!repo.github?.recentCommits?.length) continue;
    const railSection = el("div", "git-rail-section git-rail-section--activity");
    railSection.append(el("h3", "git-rail-title", `Recent commits — ${repoLabel(repo)}`));
    const commitList = el("div", "git-commit-list");
    for (const commit of repo.github.recentCommits) {
      commitList.append(buildCommitRow(commit));
    }
    railSection.append(commitList);
    sections.push(railSection);
  }
  return sections;
}

function buildGithubStatusRail(githubAvailable: boolean): HTMLElement | null {
  if (githubAvailable) {
    return null;
  }
  const ghSection = el("div", "git-rail-section git-rail-section--status");
  ghSection.append(el("h3", "git-rail-title", "GitHub API"));
  ghSection.append(
    el(
      "p",
      "git-empty-hint",
      "No GitHub token found. Add a GITHUB_TOKEN under Settings \u2192 Credentials to unlock pull requests, commits, and repo details.",
    ),
  );
  return ghSection;
}

function countOpenPrs(data: GitContextResponse): number {
  let total = 0;
  for (const repo of data.repos) {
    total += repo.github?.openPrCount ?? 0;
  }
  return total;
}

function buildSummaryStrip(data: GitContextResponse, trackedPrs: TrackedPrRecord[]): HTMLElement {
  const shell = el("section", "git-summary-shell");
  const strip = el("div", "summary-strip git-summary-strip");
  const items: Array<{ label: string; value: string }> = [
    { label: "Repos", value: String(data.repos.length) },
    { label: "Active branches", value: String(data.activeBranches.length) },
    { label: "Open PRs", value: String(countOpenPrs(data)) },
    { label: "Tracked PRs", value: String(trackedPrs.length) },
    { label: "Merged", value: String(countTrackedPrs(trackedPrs, "merged")) },
    { label: "GitHub", value: data.githubAvailable ? "connected" : "no token" },
  ];
  for (const { label, value } of items) {
    const item = el("div", "summary-strip-item");
    item.append(el("span", "summary-strip-label", label), el("span", "summary-strip-value", value));
    strip.append(item);
  }
  shell.append(strip);
  return shell;
}

function renderGitContext(page: HTMLElement, data: GitPageData): void {
  const body = page.querySelector(".git-page-body");
  if (!body) return;
  body.replaceChildren();

  // Always show the summary strip, even if there are repos
  body.append(buildSummaryStrip(data.context, data.trackedPrs));

  if (data.context.repos.length === 0 && data.context.activeBranches.length === 0 && data.trackedPrs.length === 0) {
    const emptyShell = el("section", "git-empty-shell");
    emptyShell.append(
      createEmptyState(
        "No repositories linked yet",
        "Repositories connect your Linear issues to GitHub. Add one under Settings \u2192 Repositories so Risoluto knows where each issue should commit.",
        "Open repository settings",
        () => router.navigate("/settings#devtools"),
        "default",
        { headingLevel: "h2" },
      ),
    );
    body.append(emptyShell);
    return;
  }

  const layout = el("div", "git-layout");
  const mainPanel = el("div", "git-main-panel git-main-panel--stack");
  const activityRail = el("div", "git-activity-rail git-activity-rail--stack");

  if (data.context.repos.length > 0) {
    mainPanel.append(buildRepoSection(data.context));
  }
  mainPanel.append(buildBranchSection(data.context), buildTrackedPrSection(data.trackedPrs));

  const prSection = buildPrSection(collectPulls(data.context));
  if (prSection) mainPanel.append(prSection);

  for (const commitSection of buildCommitRail(data.context)) {
    activityRail.append(commitSection);
  }
  const ghStatusRail = buildGithubStatusRail(data.context.githubAvailable);
  if (ghStatusRail) {
    activityRail.append(ghStatusRail);
  }

  layout.append(mainPanel, activityRail);
  body.append(layout);
}

export function createGitPage(): HTMLElement {
  const runtimeClient = getRuntimeClient();
  const page = el("div", "page git-page fade-in");

  const refreshBtn = el("button", "mc-button is-sm is-ghost", "Refresh (r)");
  refreshBtn.type = "button";
  refreshBtn.title = "Refresh repository context (r)";

  const header = createPageHeader(
    "Git & Repositories",
    "Repository context, active branches, pull requests, and recent commits.",
    { actions: [refreshBtn] },
  );

  const body = el("section", "git-page-body");
  const loading = el("div", "git-loading");
  loading.append(el("p", "git-empty-hint", "Loading git context…"));
  body.append(loading);

  page.append(header, body);

  let currentData: GitPageData | null = null;

  async function fetchAndRender(): Promise<void> {
    try {
      const [context, trackedPrs] = await Promise.all([
        api.getGitContext(),
        api
          .getTrackedPrs()
          .then((response) => response.prs)
          .catch(() => [] as TrackedPrRecord[]),
      ]);
      currentData = { context, trackedPrs };
      renderGitContext(page, currentData);
    } catch {
      body.replaceChildren();
      body.append(
        createEmptyState(
          "Could not load git context",
          "Something went wrong fetching repository data. Check the server logs for details, or try refreshing the page.",
          "Retry",
          () => void fetchAndRender(),
          "error",
          { headingLevel: "h2" },
        ),
      );
    }
  }

  refreshBtn.addEventListener("click", () => void fetchAndRender());

  function handleKeydown(event: KeyboardEvent): void {
    const isTyping =
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable);
    if (!isTyping && event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      void fetchAndRender();
    }
  }
  globalThis.addEventListener("keydown", handleKeydown);

  void fetchAndRender();

  // Re-fetch when state updates (branch/status may change)
  const onState = (): void => {
    if (currentData) void fetchAndRender();
  };
  const unsubscribeState = runtimeClient.subscribeState(onState);
  registerPageCleanup(page, () => {
    unsubscribeState();
    globalThis.removeEventListener("keydown", handleKeydown);
  });

  return page;
}
