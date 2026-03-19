import type { RuntimeIssueView } from "../types";
import { statusChip } from "../ui/status-chip";
import { flashDiff, setTextWithDiff } from "../utils/diff";
import { formatPriority, getRetryLabel } from "../utils/issues";
import { formatRelativeTime, formatTokenUsage } from "../utils/format";

interface IssueCardOptions {
  issue: RuntimeIssueView;
  density: "compact" | "comfortable";
  selected: boolean;
  focused: boolean;
  onOpen: () => void;
  onFullPage: () => void;
  onFocus: () => void;
}

export interface IssueCardHandle {
  element: HTMLButtonElement;
  update: (options: IssueCardOptions) => void;
}

function createMetaSignature(issue: RuntimeIssueView): string {
  return [issue.priority ?? "low", issue.status, String(issue.modelChangePending)].join("|");
}

export function createIssueCard(options: IssueCardOptions): IssueCardHandle {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "issue-card";

  const identifier = document.createElement("div");
  identifier.className = "issue-card-identifier text-mono";

  const title = document.createElement("div");
  title.className = "issue-card-title";

  const meta = document.createElement("div");
  meta.className = "issue-card-meta";

  const footer = document.createElement("div");
  footer.className = "issue-card-footer text-secondary";
  const tokens = document.createElement("span");
  tokens.className = "text-mono";
  const updated = document.createElement("span");
  footer.append(tokens, updated);

  const retry = document.createElement("div");
  retry.className = "issue-card-retry text-secondary";

  let currentActions = {
    onOpen: options.onOpen,
    onFullPage: options.onFullPage,
    onFocus: options.onFocus,
  };
  let metaSignature = "";
  let retryValue: string | null = null;

  card.append(identifier, title, meta, retry, footer);

  function syncMeta(issue: RuntimeIssueView): void {
    const nextSignature = createMetaSignature(issue);
    if (nextSignature === metaSignature) {
      return;
    }
    const priority = document.createElement("span");
    priority.className = `priority-badge priority-${issue.priority ?? "low"}`;
    priority.textContent = formatPriority(issue.priority);
    const children: HTMLElement[] = [priority, statusChip(issue.status)];
    if (issue.modelChangePending) {
      const pending = document.createElement("span");
      pending.className = "inline-badge";
      pending.textContent = "Next run pending";
      children.push(pending);
    }
    meta.replaceChildren(...children);
    if (metaSignature) {
      flashDiff(meta);
      flashDiff(card);
    }
    metaSignature = nextSignature;
  }

  function syncRetry(issue: RuntimeIssueView): void {
    const nextRetry = getRetryLabel(issue);
    if (nextRetry) {
      retry.hidden = false;
      setTextWithDiff(retry, nextRetry);
    } else {
      retry.hidden = true;
      retry.textContent = "";
    }
    if (retryValue && retryValue !== nextRetry) {
      flashDiff(card);
    }
    retryValue = nextRetry;
  }

  function update(next: IssueCardOptions): void {
    const previousTitle = title.textContent ?? "";
    currentActions = { onOpen: next.onOpen, onFullPage: next.onFullPage, onFocus: next.onFocus };
    card.className = `issue-card issue-card-${next.density}`;
    card.classList.toggle("is-selected", next.selected);
    card.classList.toggle("is-focused", next.focused);
    card.dataset.issueId = next.issue.identifier;
    setTextWithDiff(identifier, next.issue.identifier);
    setTextWithDiff(title, next.issue.title);
    syncMeta(next.issue);
    setTextWithDiff(tokens, formatTokenUsage(next.issue.tokenUsage?.totalTokens ?? null));
    updated.textContent = formatRelativeTime(next.issue.updatedAt);
    syncRetry(next.issue);
    if (previousTitle && previousTitle !== next.issue.title) {
      flashDiff(card);
    }
  }

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
