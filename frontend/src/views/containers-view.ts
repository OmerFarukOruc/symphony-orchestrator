import { createEmptyState } from "../components/empty-state.js";
import { createPageHeader } from "../components/page-header.js";
import { router } from "../router.js";
import { getRuntimeClient } from "../state/runtime-client.js";
import { buttonClassName } from "../ui/buttons.js";
import { skeletonCard } from "../ui/skeleton.js";
import { statusChip } from "../ui/status-chip.js";
import type { AppState } from "../state/store.js";
import type { RuntimeIssueView, RuntimeSnapshot } from "../types/runtime.js";
import { formatRelativeTime, formatTokenUsage } from "../utils/format.js";
import { registerPageCleanup } from "../utils/page.js";

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase().replaceAll(/\s+/g, "_");
}

function buildLoadingSkeleton(): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "containers-loading";
  wrapper.setAttribute("aria-hidden", "true");

  const detail = document.createElement("div");
  detail.className = "containers-active-grid";
  detail.append(skeletonCard(), skeletonCard());

  wrapper.append(detail);
  return wrapper;
}

function sortByUpdatedAt(left: RuntimeIssueView, right: RuntimeIssueView): number {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function buildMetaStrip(snapshot: RuntimeSnapshot): HTMLElement {
  const strip = document.createElement("section");
  strip.className = "containers-meta-strip";
  const items: Array<[string, string, "live" | "warning" | null]> = [
    ["Running", String(snapshot.running.length), snapshot.running.length > 0 ? "live" : null],
    ["Retrying", String(snapshot.retrying.length), snapshot.retrying.length > 0 ? "warning" : null],
    ["Queued next", String(snapshot.queued.length), null],
  ];
  for (const [label, value, tone] of items) {
    const item = document.createElement("div");
    item.className = ["containers-meta-item", tone ? `is-${tone}` : ""].filter(Boolean).join(" ");
    const labelEl = document.createElement("span");
    labelEl.className = "containers-meta-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.className = "containers-meta-value text-mono";
    valueEl.textContent = value;
    item.append(labelEl, valueEl);
    strip.append(item);
  }
  const refresh = document.createElement("span");
  refresh.className = "containers-meta-refresh";
  refresh.textContent = `Updated ${formatRelativeTime(snapshot.generated_at)}`;
  strip.append(refresh);
  return strip;
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

  // The card background tint already communicates status; the chip is redundant.
  const head = document.createElement("div");
  head.className = "containers-card-head";
  const identifier = document.createElement("span");
  identifier.className = "text-identifier containers-card-identifier";
  identifier.textContent = issue.identifier;
  head.append(identifier);

  const title = document.createElement("h3");
  title.className = "containers-card-title";
  title.textContent = issue.title;

  // Primary inline row: the three fields an operator needs at a glance —
  // attempt, age, token delta. Everything else is archival.
  const primary = document.createElement("div");
  primary.className = "containers-card-primary";
  primary.append(
    buildDetail("Attempt", issue.attempt === null ? "Waiting to start" : `#${issue.attempt}`),
    buildDetail("Updated", formatRelativeTime(issue.updatedAt)),
    buildDetail("Tokens", formatTokenUsage(issue.tokenUsage?.totalTokens ?? null)),
  );

  const moreDetails = document.createElement("details");
  moreDetails.className = "containers-card-details-more";
  const summary = document.createElement("summary");
  summary.textContent = "More context";
  moreDetails.append(summary);
  const secondary = document.createElement("div");
  secondary.className = "containers-card-secondary";
  secondary.append(
    buildDetail("Workspace", issue.workspaceKey ?? "Pending allocation"),
    buildDetail("Model", issue.model ?? "Default"),
    buildDetail("Branch", issue.branchName ?? "Not created yet"),
  );
  moreDetails.append(secondary);

  const actions = document.createElement("div");
  actions.className = "containers-card-actions";
  actions.append(
    buildNavButton("Open issue", `/queue/${issue.identifier}`),
    buildNavButton("Logs", `/issues/${issue.identifier}/logs`),
  );

  if (issue.attempt !== null) {
    actions.append(buildNavButton("Runs", `/issues/${issue.identifier}/runs`));
  }

  card.append(head, title, primary, moreDetails, actions);
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
  body.replaceChildren(buildMetaStrip(snapshot), activeSection ?? buildEmptyStateForSnapshot(snapshot));
}

export function createContainersPage(): HTMLElement {
  const runtimeClient = getRuntimeClient();
  const page = document.createElement("div");
  page.className = "page containers-page fade-in";

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.className = buttonClassName({ tone: "ghost", size: "sm" });
  refreshButton.textContent = "Refresh (r)";
  refreshButton.title = "Refresh container state (r)";

  const header = createPageHeader(
    "Containers",
    "Watch sandbox activity, see which issues currently hold a worker slot, and track what is waiting next.",
    { actions: [refreshButton] },
  );

  const body = document.createElement("section");
  body.className = "page-body containers-page-body";
  body.append(buildLoadingSkeleton());

  page.append(header, body);

  function renderFromState(state: AppState): void {
    const snapshot = state.snapshot;
    if (!snapshot) {
      body.replaceChildren(buildLoadingSkeleton());
      refreshButton.toggleAttribute("disabled", true);
      return;
    }
    refreshButton.toggleAttribute("disabled", false);
    renderSnapshot(body, snapshot);
  }

  refreshButton.addEventListener("click", () => {
    void runtimeClient.pollOnce().catch(() => {
      body.replaceChildren(buildFallbackEmptyState(() => void runtimeClient.pollOnce()));
    });
  });

  const unsubscribeState = runtimeClient.subscribeState(renderFromState, { includeHeartbeat: true });
  renderFromState(runtimeClient.getAppState());

  function handleKeydown(event: KeyboardEvent): void {
    const isTyping =
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable);
    if (!isTyping && event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      refreshButton.click();
    }
  }
  globalThis.addEventListener("keydown", handleKeydown);

  registerPageCleanup(page, () => {
    unsubscribeState();
    globalThis.removeEventListener("keydown", handleKeydown);
  });

  return page;
}
