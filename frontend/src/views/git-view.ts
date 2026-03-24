import { api } from "../api";
import { createEmptyState } from "../components/empty-state";
import { createPageHeader } from "../components/page-header";
import { router } from "../router";
import type { ActiveBranchView, GitCommitView, GitContextResponse, GitPullView, GitRepoView } from "../types";
import { registerPageCleanup } from "../utils/page";
import { formatRelativeTime } from "../utils/format";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

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
  return el("span", `git-status-dot git-status-dot--${status}`);
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
    row.append(externalLink(branch.pullRequestUrl, "PR ↗", "git-branch-pr-link"));
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
  const section = el("section", "git-section");
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
  const section = el("section", "git-section");
  section.append(sectionHeader("Active branches", data.activeBranches.length));
  if (data.activeBranches.length > 0) {
    const list = el("div", "git-branch-list");
    for (const branch of data.activeBranches) {
      list.append(buildBranchRow(branch));
    }
    section.append(list);
  } else {
    section.append(
      el("p", "git-empty-hint", "No active branches — issues need to be running with a branchName to appear here."),
    );
  }
  return section;
}

function buildPrSection(pulls: GitPullView[]): HTMLElement | null {
  if (pulls.length === 0) return null;
  const section = el("section", "git-section");
  section.append(sectionHeader("Open pull requests", pulls.length));
  const list = el("div", "git-pr-list");
  for (const pr of pulls) {
    list.append(buildPullRow(pr));
  }
  section.append(list);
  return section;
}

function buildCommitRail(data: GitContextResponse): HTMLElement[] {
  const sections: HTMLElement[] = [];
  for (const repo of data.repos) {
    if (!repo.github?.recentCommits?.length) continue;
    const railSection = el("div", "git-rail-section");
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

function buildQuickLinksRail(githubAvailable: boolean): HTMLElement[] {
  const items: HTMLElement[] = [];

  const ghSection = el("div", "git-rail-section");
  ghSection.append(el("h3", "git-rail-title", "GitHub API"));
  if (githubAvailable) {
    const connected = el("div", "git-gh-status git-gh-status--ok");
    connected.append(el("span", undefined, "✓"), el("span", undefined, "Connected"));
    ghSection.append(connected);
  } else {
    ghSection.append(
      el(
        "p",
        "git-empty-hint",
        "No GitHub token configured. Add a GITHUB_TOKEN in Settings → Credentials to see PRs, commits, and repo details.",
      ),
    );
  }
  items.push(ghSection);

  const linksSection = el("div", "git-rail-section");
  linksSection.append(el("h3", "git-rail-title", "Quick links"));
  const links = el("div", "git-quick-links");
  const queueBtn = el("button", "git-quick-link-btn", "View queue board");
  queueBtn.type = "button";
  queueBtn.addEventListener("click", () => router.navigate("/queue"));
  links.append(queueBtn);
  const configBtn = el("button", "git-quick-link-btn", "Advanced settings");
  configBtn.type = "button";
  configBtn.addEventListener("click", () => router.navigate("/settings#advanced"));
  links.append(configBtn);
  const credentialsBtn = el("button", "git-quick-link-btn", "Manage credentials");
  credentialsBtn.type = "button";
  credentialsBtn.addEventListener("click", () => router.navigate("/settings#credentials"));
  links.append(credentialsBtn);
  linksSection.append(links);
  items.push(linksSection);

  return items;
}

function countOpenPrs(data: GitContextResponse): number {
  let total = 0;
  for (const repo of data.repos) {
    total += repo.github?.openPrCount ?? 0;
  }
  return total;
}

function buildSummaryStrip(data: GitContextResponse): HTMLElement {
  const strip = el("div", "summary-strip git-summary-strip");
  const items: Array<{ label: string; value: string }> = [
    { label: "Repos", value: String(data.repos.length) },
    { label: "Active branches", value: String(data.activeBranches.length) },
    { label: "Open PRs", value: String(countOpenPrs(data)) },
    { label: "GitHub", value: data.githubAvailable ? "Connected" : "No token" },
  ];
  for (const { label, value } of items) {
    const item = el("div", "summary-strip-item");
    item.append(el("span", "summary-strip-label", label), el("span", "summary-strip-value", value));
    strip.append(item);
  }
  return strip;
}

function renderGitContext(page: HTMLElement, data: GitContextResponse): void {
  const body = page.querySelector(".git-page-body");
  if (!body) return;
  body.innerHTML = "";

  // Always show the summary strip, even if there are repos
  body.append(buildSummaryStrip(data));

  if (data.repos.length === 0) {
    body.append(
      createEmptyState(
        "No repositories configured",
        "Add repos to your workflow YAML to see git context here. Each repo entry maps a Linear identifier prefix to a GitHub repository.",
        "Open advanced settings",
        () => router.navigate("/settings#advanced"),
      ),
    );
    return;
  }

  const layout = el("div", "git-layout");
  const mainPanel = el("div", "git-main-panel");
  const activityRail = el("div", "git-activity-rail");

  mainPanel.append(buildRepoSection(data), buildBranchSection(data));

  const prSection = buildPrSection(collectPulls(data));
  if (prSection) mainPanel.append(prSection);

  for (const commitSection of buildCommitRail(data)) {
    activityRail.append(commitSection);
  }
  for (const railItem of buildQuickLinksRail(data.githubAvailable)) {
    activityRail.append(railItem);
  }

  layout.append(mainPanel, activityRail);
  body.append(layout);
}

export function createGitPage(): HTMLElement {
  const page = el("div", "page git-page fade-in");

  const header = createPageHeader(
    "Git & Repositories",
    "Repository context, active branches, pull requests, and recent commits.",
  );

  const body = el("section", "git-page-body");
  const loading = el("div", "git-loading");
  loading.append(el("p", "git-empty-hint", "Loading git context…"));
  body.append(loading);

  page.append(header, body);

  let currentData: GitContextResponse | null = null;

  async function fetchAndRender(): Promise<void> {
    try {
      currentData = await api.getGitContext();
      renderGitContext(page, currentData);
    } catch {
      body.innerHTML = "";
      body.append(
        createEmptyState(
          "Failed to load git context",
          "The git context API returned an error. Check server logs or try refreshing.",
          "Retry",
          () => void fetchAndRender(),
          "error",
        ),
      );
    }
  }

  void fetchAndRender();

  // Re-fetch when state updates (branch/status may change)
  const handler = (): void => {
    if (currentData) void fetchAndRender();
  };
  window.addEventListener("state:update", handler);
  registerPageCleanup(page, () => window.removeEventListener("state:update", handler));

  return page;
}
