import type { RecentEvent, RuntimeIssueView } from "../types";
import { priorityBadge } from "../ui/priority-badge";
import { statusChip } from "../ui/status-chip";
import { flashDiff, setTextWithDiff } from "../utils/diff";
import { getRetryLabel } from "../utils/issues";
import { formatRelativeTime, formatTokenUsage } from "../utils/format";
import { createLifecycleSyncState, syncLifecycleElement } from "./kanban-card-lifecycle.js";

interface KanbanCardOptions {
  issue: RuntimeIssueView;
  recentEvents: RecentEvent[];
  selected: boolean;
  focused: boolean;
  onOpen: () => void;
  onFullPage: () => void;
  onFocus: () => void;
  onMove?: (direction: -1 | 1) => void;
}

export interface KanbanCardHandle {
  element: HTMLButtonElement;
  update: (options: KanbanCardOptions) => void;
}

function normalizeStatus(status: string): string {
  return status.toLowerCase().replaceAll(" ", "_");
}

function buildLabelsRow(labels: string[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "kanban-card-labels";
  for (const label of labels) {
    const badge = document.createElement("span");
    badge.className = "mc-badge is-sm";
    badge.textContent = label;
    row.append(badge);
  }
  return row;
}

export function createKanbanCard(options: KanbanCardOptions): KanbanCardHandle {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "kanban-card stagger-item";

  const identifier = document.createElement("div");
  identifier.className = "kanban-card-identifier";

  const title = document.createElement("div");
  title.className = "kanban-card-title";

  const desc = document.createElement("div");
  desc.className = "kanban-card-desc";

  const labelsRow = document.createElement("div");
  labelsRow.className = "kanban-card-labels";

  const meta = document.createElement("div");
  meta.className = "kanban-card-meta";

  const retry = document.createElement("div");
  retry.className = "kanban-card-retry";

  const lifecycle = document.createElement("div");
  lifecycle.className = "kanban-card-lifecycle";

  const footer = document.createElement("div");
  footer.className = "kanban-card-footer";
  const footerMeta = document.createElement("span");
  footerMeta.className = "kanban-card-footer-meta";
  const tokens = document.createElement("span");
  const updated = document.createElement("span");
  const hint = document.createElement("span");
  hint.className = "kanban-card-hint";
  hint.textContent = "↵ open · ⇧↵ full";
  footerMeta.append(tokens, document.createTextNode(" "), updated);
  footer.append(footerMeta, hint);

  card.append(identifier, title, desc, labelsRow, meta, retry, lifecycle, footer);

  let currentActions = {
    onOpen: options.onOpen,
    onFullPage: options.onFullPage,
    onFocus: options.onFocus,
    onMove: options.onMove,
  };
  let prevMetaSig = "";
  let prevRetryVal: string | null = null;
  const lifecycleState = createLifecycleSyncState();

  function syncMeta(issue: RuntimeIssueView): void {
    const sig = [issue.priority ?? "low", issue.status, String(issue.modelChangePending)].join("|");
    if (sig === prevMetaSig) return;

    const priBadge = priorityBadge(issue.priority);
    const children: HTMLElement[] = [priBadge, statusChip(issue.status)];
    if (issue.modelChangePending) {
      const pending = document.createElement("span");
      pending.className = "mc-badge is-sm";
      pending.textContent = "Next run pending";
      children.push(pending);
    }
    meta.replaceChildren(...children);
    if (prevMetaSig) {
      flashDiff(meta);
      flashDiff(card);
    }
    prevMetaSig = sig;
  }

  function syncRetry(issue: RuntimeIssueView): void {
    const label = getRetryLabel(issue);
    if (label) {
      retry.hidden = false;
      setTextWithDiff(retry, label);
    } else {
      retry.hidden = true;
      retry.textContent = "";
    }
    if (prevRetryVal && prevRetryVal !== label) flashDiff(card);
    prevRetryVal = label;
  }

  function syncLabels(labels: string[]): void {
    if (labels.length === 0) {
      labelsRow.hidden = true;
      labelsRow.replaceChildren();
      return;
    }
    labelsRow.hidden = false;
    labelsRow.replaceChildren(...buildLabelsRow(labels).children);
  }

  function syncDesc(issue: RuntimeIssueView): void {
    const text = issue.description ?? issue.message ?? "";
    if (text) {
      desc.hidden = false;
      desc.textContent = text;
    } else {
      desc.hidden = true;
      desc.textContent = "";
    }
  }

  function update(next: KanbanCardOptions): void {
    const prevTitle = title.textContent ?? "";
    currentActions = { onOpen: next.onOpen, onFullPage: next.onFullPage, onFocus: next.onFocus, onMove: next.onMove };

    card.dataset.issueId = next.issue.identifier;
    card.dataset.status = normalizeStatus(next.issue.status);
    card.setAttribute(
      "aria-label",
      `${next.issue.identifier}: ${next.issue.title}. Press Enter to open or Shift plus Enter for full page.`,
    );
    card.classList.toggle("is-selected", next.selected);
    card.classList.toggle("is-focused", next.focused);

    setTextWithDiff(identifier, next.issue.identifier);
    setTextWithDiff(title, next.issue.title);
    syncDesc(next.issue);
    syncLabels(next.issue.labels ?? []);
    syncMeta(next.issue);
    setTextWithDiff(tokens, formatTokenUsage(next.issue.tokenUsage?.totalTokens ?? null));
    updated.textContent = formatRelativeTime(next.issue.updatedAt);
    syncRetry(next.issue);
    syncLifecycleElement(lifecycle, lifecycleState, next.issue, next.recentEvents);

    if (prevTitle && prevTitle !== next.issue.title) flashDiff(card);
  }

  card.draggable = true;
  card.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData("text/plain", card.dataset.issueId ?? "");
    card.classList.add("is-dragging");
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("is-dragging");
  });
  card.addEventListener("click", () => currentActions.onOpen());
  card.addEventListener("focus", () => currentActions.onFocus());
  card.addEventListener("keydown", (event) => {
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      currentActions.onMove?.(event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      currentActions.onFullPage();
    }
  });

  update(options);
  return { element: card, update };
}
