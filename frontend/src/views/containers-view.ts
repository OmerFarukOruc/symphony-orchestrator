import { api } from "../api.js";
import { createEmptyState } from "../components/empty-state.js";
import { createPageHeader } from "../components/page-header.js";
import { router } from "../router.js";
import { buttonClassName } from "../ui/buttons.js";
import { skeletonCard } from "../ui/skeleton.js";
import { statusChip } from "../ui/status-chip.js";
import type { RuntimeIssueView, RuntimeSnapshot } from "../types.js";
import { formatRelativeTime, formatTokenUsage } from "../utils/format.js";
import { registerPageCleanup } from "../utils/page.js";

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase().replaceAll(/\s+/g, "_");
}

function buildStatCard(label: string, value: string | number, accent?: "live" | "warning"): HTMLElement {
  const card = document.createElement("div");
  card.className = ["mc-stat-card", accent ? `is-${accent}` : ""].filter(Boolean).join(" ");

  const number = document.createElement("span");
  number.className = "heading-display";
  number.textContent = String(value);

  const caption = document.createElement("span");
  caption.className = "mc-stat-card-label";
  caption.textContent = label;

  card.append(number, caption);
  return card;
}

function buildLoadingSkeleton(): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "containers-loading";
  wrapper.setAttribute("aria-hidden", "true");

  const summary = document.createElement("div");
  summary.className = "containers-summary-grid";
  Array.from({ length: 4 }).forEach(() => {
    summary.append(skeletonCard());
  });

  const detail = document.createElement("div");
  detail.className = "containers-active-grid";
  detail.append(skeletonCard(), skeletonCard());

  wrapper.append(summary, detail);
  return wrapper;
}

function sortByUpdatedAt(left: RuntimeIssueView, right: RuntimeIssueView): number {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function buildSummary(snapshot: RuntimeSnapshot): HTMLElement {
  const row = document.createElement("section");
  row.className = "containers-summary-grid";
  row.append(
    buildStatCard("Running", snapshot.running.length, snapshot.running.length > 0 ? "live" : undefined),
    buildStatCard("Retrying", snapshot.retrying.length, snapshot.retrying.length > 0 ? "warning" : undefined),
    buildStatCard("Queued next", snapshot.queued.length),
    buildStatCard("Last refresh", formatRelativeTime(snapshot.generated_at)),
  );
  return row;
}

function buildSectionHeader(title: string, subtitle: string): HTMLElement {
  const header = document.createElement("div");
  header.className = "containers-section-header";

  const copy = document.createElement("div");
  copy.className = "containers-section-copy";

  const titleElement = document.createElement("h2");
  titleElement.className = "section-title";
  titleElement.textContent = title;

  const subtitleElement = document.createElement("p");
  subtitleElement.className = "containers-section-subtitle";
  subtitleElement.textContent = subtitle;

  copy.append(titleElement, subtitleElement);
  header.append(copy);
  return header;
}

function buildDetail(label: string, value: string): HTMLElement {
  const item = document.createElement("div");
  item.className = "containers-detail";

  const labelElement = document.createElement("span");
  labelElement.className = "containers-detail-label";
  labelElement.textContent = label;

  const valueElement = document.createElement("span");
  valueElement.className = "containers-detail-value";
  valueElement.textContent = value;

  item.append(labelElement, valueElement);
  return item;
}

function buildNavButton(label: string, path: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = buttonClassName({ tone: "ghost", size: "sm" });
  button.textContent = label;
  button.addEventListener("click", () => router.navigate(path));
  return button;
}

function buildIssueCard(issue: RuntimeIssueView): HTMLElement {
  const card = document.createElement("article");
  const normalized = normalizeStatus(issue.status);
  card.className = ["mc-container", "containers-issue-card", `is-status-${normalized}`].join(" ");

  const head = document.createElement("div");
  head.className = "containers-card-head";

  const identifier = document.createElement("span");
  identifier.className = "text-identifier containers-card-identifier";
  identifier.textContent = issue.identifier;

  head.append(identifier, statusChip(issue.status));

  const title = document.createElement("h3");
  title.className = "containers-card-title";
  title.textContent = issue.title;

  const details = document.createElement("div");
  details.className = "containers-card-details";
  details.append(
    buildDetail("Attempt", issue.attempt === null ? "Waiting to start" : `#${issue.attempt}`),
    buildDetail("Updated", formatRelativeTime(issue.updatedAt)),
    buildDetail("Workspace", issue.workspaceKey ?? "Pending allocation"),
    buildDetail("Model", issue.model ?? "Default"),
    buildDetail("Branch", issue.branchName ?? "Not created yet"),
    buildDetail("Token usage", formatTokenUsage(issue.tokenUsage?.totalTokens ?? null)),
  );

  const actions = document.createElement("div");
  actions.className = "containers-card-actions";
  actions.append(
    buildNavButton("Open issue", `/queue/${issue.identifier}`),
    buildNavButton("Logs", `/issues/${issue.identifier}/logs`),
  );

  if (issue.attempt !== null) {
    actions.append(buildNavButton("Runs", `/issues/${issue.identifier}/runs`));
  }

  card.append(head, title, details, actions);
  return card;
}

function buildQueueItem(issue: RuntimeIssueView): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "containers-queue-item";
  button.addEventListener("click", () => router.navigate(`/queue/${issue.identifier}`));

  const top = document.createElement("div");
  top.className = "containers-queue-item-top";
  top.append(
    Object.assign(document.createElement("span"), {
      className: "text-identifier containers-card-identifier",
      textContent: issue.identifier,
    }),
    statusChip(issue.status),
  );

  const title = document.createElement("span");
  title.className = "containers-queue-item-title";
  title.textContent = issue.title;

  const meta = document.createElement("span");
  meta.className = "containers-queue-item-meta";
  meta.textContent = issue.priority ? `Priority ${issue.priority}` : "Waiting for a worker slot";

  button.append(top, title, meta);
  return button;
}

function buildActiveSection(snapshot: RuntimeSnapshot): HTMLElement | null {
  const active = [...snapshot.running, ...snapshot.retrying].sort(sortByUpdatedAt);
  if (active.length === 0) {
    return null;
  }

  const section = document.createElement("section");
  section.className = "containers-active-grid";

  const activeColumn = document.createElement("div");
  activeColumn.className = "mc-panel containers-section";
  activeColumn.append(
    buildSectionHeader(
      "Active sandboxes",
      active.length === 1
        ? "One worker currently has a sandbox open."
        : `${active.length} workers currently have sandboxes open.`,
    ),
  );

  const list = document.createElement("div");
  list.className = "containers-issue-list";
  active.forEach((issue) => {
    list.append(buildIssueCard(issue));
  });
  activeColumn.append(list);

  const queueColumn = document.createElement("aside");
  queueColumn.className = "mc-panel containers-section";
  queueColumn.append(
    buildSectionHeader(
      "Queued next",
      snapshot.queued.length > 0
        ? `${snapshot.queued.length} queued ${snapshot.queued.length === 1 ? "issue is" : "issues are"} waiting for capacity.`
        : "No additional work is waiting behind the active sandboxes.",
    ),
  );

  if (snapshot.queued.length === 0) {
    queueColumn.append(
      createEmptyState(
        "Queue is clear",
        "New work will appear here before Risoluto opens the next sandbox.",
        "Open board",
        () => router.navigate("/queue"),
        "queue",
        { headingLevel: "h3" },
      ),
    );
  } else {
    const queueList = document.createElement("div");
    queueList.className = "containers-queue-list";
    snapshot.queued.slice(0, 4).forEach((issue) => {
      queueList.append(buildQueueItem(issue));
    });
    queueColumn.append(queueList);
  }

  section.append(activeColumn, queueColumn);
  return section;
}

function buildEmptyStateForSnapshot(snapshot: RuntimeSnapshot): HTMLElement {
  if (snapshot.queued.length > 0) {
    return createEmptyState(
      "Queue is ready",
      "Work is queued, but no sandbox is open yet. Risoluto will spin up the next container as soon as a worker claims the issue.",
      "Open board",
      () => router.navigate("/queue"),
      "queue",
      { secondaryActionLabel: "View observability", secondaryActionHref: "/observability", headingLevel: "h2" },
    );
  }

  return createEmptyState(
    "No containers running",
    "This page tracks sandbox health once agent workers start. Pick an issue from the board to launch the first container.",
    "Open board",
    () => router.navigate("/queue"),
    "network",
    { secondaryActionLabel: "View observability", secondaryActionHref: "/observability", headingLevel: "h2" },
  );
}

function buildFallbackEmptyState(onRetry: () => void): HTMLElement {
  return createEmptyState(
    "Could not load container status",
    "Something went wrong fetching container data. Check the server logs for details, or try refreshing.",
    "Retry",
    onRetry,
    "error",
    { headingLevel: "h2" },
  );
}

function renderSnapshot(body: HTMLElement, snapshot: RuntimeSnapshot): void {
  const activeSection = buildActiveSection(snapshot);
  body.replaceChildren(buildSummary(snapshot), activeSection ?? buildEmptyStateForSnapshot(snapshot));
}

export function createContainersPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "page containers-page fade-in";

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.className = buttonClassName({ tone: "ghost", size: "sm" });
  refreshButton.textContent = "Refresh";

  const header = createPageHeader(
    "Containers",
    "Watch sandbox activity, see which issues currently hold a worker slot, and track what is waiting next.",
    { actions: [refreshButton] },
  );

  const body = document.createElement("section");
  body.className = "page-body containers-page-body";
  body.append(buildLoadingSkeleton());

  page.append(header, body);

  let currentSnapshot: RuntimeSnapshot | null = null;
  let isLoading = false;

  async function fetchAndRender(): Promise<void> {
    if (isLoading) {
      return;
    }
    isLoading = true;
    refreshButton.toggleAttribute("disabled", true);
    try {
      currentSnapshot = await api.getState();
      renderSnapshot(body, currentSnapshot);
    } catch {
      currentSnapshot = null;
      body.replaceChildren(buildFallbackEmptyState(() => void fetchAndRender()));
    } finally {
      refreshButton.toggleAttribute("disabled", false);
      isLoading = false;
    }
  }

  refreshButton.addEventListener("click", () => {
    void fetchAndRender();
  });

  void fetchAndRender();

  const onStateUpdate = (): void => {
    if (currentSnapshot) {
      void fetchAndRender();
    }
  };
  window.addEventListener("state:update", onStateUpdate);
  registerPageCleanup(page, () => {
    window.removeEventListener("state:update", onStateUpdate);
  });

  return page;
}
