import type { RuntimeIssueView } from "../types";
import { statusChip } from "../ui/status-chip";
import { flashDiff, setTextWithDiff } from "../utils/diff";
import { formatPriority, getRetryLabel } from "../utils/issues";
import { formatRelativeTime, formatTokenUsage } from "../utils/format";

interface KanbanCardOptions {
  issue: RuntimeIssueView;
  selected: boolean;
  focused: boolean;
  onOpen: () => void;
  onFullPage: () => void;
  onFocus: () => void;
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

  const footer = document.createElement("div");
  footer.className = "kanban-card-footer";
  const tokens = document.createElement("span");
  const updated = document.createElement("span");
  footer.append(tokens, updated);

  card.append(identifier, title, desc, labelsRow, meta, retry, footer);

  let currentActions = {
    onOpen: options.onOpen,
    onFullPage: options.onFullPage,
    onFocus: options.onFocus,
  };
  let prevMetaSig = "";
  let prevRetryVal: string | null = null;

  function syncMeta(issue: RuntimeIssueView): void {
    const sig = [issue.priority ?? "low", issue.status, String(issue.modelChangePending)].join("|");
    if (sig === prevMetaSig) return;

    const priBadge = document.createElement("span");
    priBadge.className = `priority-badge priority-${issue.priority ?? "low"}`;
    priBadge.textContent = formatPriority(issue.priority);
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
    currentActions = { onOpen: next.onOpen, onFullPage: next.onFullPage, onFocus: next.onFocus };

    card.dataset.issueId = next.issue.identifier;
    card.dataset.status = normalizeStatus(next.issue.status);
    card.classList.toggle("is-selected", next.selected);
    card.classList.toggle("is-focused", next.focused);

    setTextWithDiff(identifier, next.issue.identifier);
    setTextWithDiff(title, next.issue.title);
    syncDesc(next.issue);
    syncLabels(next.issue.labels);
    syncMeta(next.issue);
    setTextWithDiff(tokens, formatTokenUsage(next.issue.tokenUsage?.totalTokens ?? null));
    updated.textContent = formatRelativeTime(next.issue.updatedAt);
    syncRetry(next.issue);

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
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      currentActions.onFullPage();
    }
  });

  update(options);
  return { element: card, update };
}
