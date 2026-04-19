import type { RenderedTimeline } from "../features/logs/logs-reducer.js";
import type { RuntimeIssueView } from "../types/runtime.js";

export interface LogsTopBarHandle {
  element: HTMLElement;
  update: (input: LogsTopBarInput) => void;
  dispose: () => void;
}

export interface LogsTopBarInput {
  issueId: string;
  issueView: RuntimeIssueView | null;
  title: string | null;
  timeline: RenderedTimeline;
  mode: "live" | "archive";
}

interface BuiltElements {
  element: HTMLElement;
  identity: HTMLElement;
  identifier: HTMLElement;
  titleEl: HTMLElement;
  modelEl: HTMLElement;
  statusPill: HTMLElement;
  banner: HTMLElement;
  bannerCopy: HTMLElement;
  bannerElapsed: HTMLElement;
  tokens: HTMLElement;
  prLink: HTMLAnchorElement;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return String(value);
}

function formatElapsed(fromIso: string | null): string {
  if (!fromIso) {
    return "";
  }
  const startedMs = Date.parse(fromIso);
  if (!Number.isFinite(startedMs)) {
    return "";
  }
  const elapsed = (Date.now() - startedMs) / 1000;
  if (elapsed < 0) {
    return "";
  }
  if (elapsed < 60) {
    return `${elapsed.toFixed(1)}s`;
  }
  const minutes = Math.floor(elapsed / 60);
  const seconds = Math.floor(elapsed % 60);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function buildElements(): BuiltElements {
  const element = document.createElement("section");
  element.className = "mc-logs-top-bar";

  const identity = document.createElement("div");
  identity.className = "mc-logs-top-bar-identity";

  const identifier = document.createElement("span");
  identifier.className = "mc-logs-top-bar-id";

  const statusPill = document.createElement("span");
  statusPill.className = "mc-logs-top-bar-status";

  const titleEl = document.createElement("h1");
  titleEl.className = "mc-logs-top-bar-title";

  const modelEl = document.createElement("span");
  modelEl.className = "mc-logs-top-bar-model";

  const prLink = document.createElement("a");
  prLink.className = "mc-logs-top-bar-pr";
  prLink.target = "_blank";
  prLink.rel = "noopener noreferrer";
  prLink.hidden = true;
  prLink.textContent = "PR ↗";

  identity.append(identifier, statusPill, titleEl, modelEl, prLink);

  const banner = document.createElement("div");
  banner.className = "mc-logs-top-bar-banner";
  // role="status" already implies aria-live="polite" — setting both is redundant.
  banner.setAttribute("role", "status");

  const bannerCopy = document.createElement("span");
  bannerCopy.className = "mc-logs-top-bar-banner-copy";

  const bannerElapsed = document.createElement("span");
  bannerElapsed.className = "mc-logs-top-bar-banner-elapsed";
  bannerElapsed.setAttribute("aria-hidden", "true");

  banner.append(bannerCopy, bannerElapsed);

  const tokens = document.createElement("div");
  tokens.className = "mc-logs-top-bar-tokens";

  element.append(identity, banner, tokens);

  return {
    element,
    identity,
    identifier,
    titleEl,
    modelEl,
    statusPill,
    banner,
    bannerCopy,
    bannerElapsed,
    tokens,
    prLink,
  };
}

function buildSkeleton(kind: "title" | "pill" | "tokens"): HTMLElement {
  const el = document.createElement("span");
  el.className = "mc-logs-top-bar-skeleton";
  el.dataset["skeleton"] = kind;
  el.setAttribute("aria-hidden", "true");
  return el;
}

function applyTokens(tokens: HTMLElement, issue: RuntimeIssueView | null, showSkeleton: boolean): void {
  if (showSkeleton) {
    tokens.hidden = false;
    tokens.replaceChildren(buildSkeleton("tokens"));
    return;
  }
  if (!issue) {
    tokens.textContent = "";
    tokens.hidden = true;
    return;
  }
  tokens.hidden = false;
  tokens.replaceChildren();

  const usage = issue.tokenUsage;
  if (usage) {
    const inputEl = document.createElement("span");
    inputEl.className = "mc-logs-top-bar-token-in";
    inputEl.textContent = `${formatNumber(usage.inputTokens)} in`;
    const separator = document.createElement("span");
    separator.className = "mc-logs-top-bar-token-sep";
    separator.textContent = "·";
    const outputEl = document.createElement("span");
    outputEl.className = "mc-logs-top-bar-token-out";
    outputEl.textContent = `${formatNumber(usage.outputTokens)} out`;
    tokens.append(inputEl, separator, outputEl);
  }

  if (issue.attempt !== null && issue.attempt !== undefined) {
    const attemptEl = document.createElement("span");
    attemptEl.className = "mc-logs-top-bar-attempt";
    attemptEl.textContent = `attempt ${issue.attempt}`;
    tokens.append(attemptEl);
  }
}

function normalizeStatus(status: string): string {
  return status.toLowerCase().replaceAll(/\s+/g, "-");
}

function applyStatus(pill: HTMLElement, issue: RuntimeIssueView | null, showSkeleton: boolean): void {
  if (showSkeleton) {
    pill.hidden = false;
    pill.replaceChildren(buildSkeleton("pill"));
    delete pill.dataset["status"];
    return;
  }
  if (!issue) {
    pill.hidden = true;
    return;
  }
  pill.hidden = false;
  pill.textContent = issue.status;
  pill.dataset["status"] = normalizeStatus(issue.status);
}

function applyTitle(titleEl: HTMLElement, title: string | null, issueId: string, showSkeleton: boolean): void {
  if (showSkeleton) {
    titleEl.replaceChildren(buildSkeleton("title"));
    return;
  }
  titleEl.textContent = title && title !== issueId ? title : "";
}

function applyPrLink(link: HTMLAnchorElement, issue: RuntimeIssueView | null): void {
  if (!issue?.pullRequestUrl) {
    link.hidden = true;
    return;
  }
  link.hidden = false;
  link.href = issue.pullRequestUrl;
  link.title = `View PR for ${issue.identifier}`;
}

export function createLogsTopBar(): LogsTopBarHandle {
  const parts = buildElements();

  let currentInput: LogsTopBarInput | null = null;
  let elapsedTimer: number | null = null;

  function tickElapsed(): void {
    const banner = currentInput?.timeline.activeBanner;
    if (!banner?.elapsedStartedAt) {
      parts.bannerElapsed.textContent = "";
      return;
    }
    parts.bannerElapsed.textContent = formatElapsed(banner.elapsedStartedAt);
  }

  function startElapsedTimer(): void {
    if (elapsedTimer !== null) {
      return;
    }
    elapsedTimer = globalThis.setInterval(tickElapsed, 250) as unknown as number;
  }

  function stopElapsedTimer(): void {
    if (elapsedTimer !== null) {
      globalThis.clearInterval(elapsedTimer as unknown as ReturnType<typeof setInterval>);
      elapsedTimer = null;
    }
  }

  function update(input: LogsTopBarInput): void {
    currentInput = input;
    parts.identifier.textContent = input.issueId;

    // Skeleton mode: the first render before any IssueDetail has landed. We
    // only swallow the title/pill/tokens so the URL-derived id stays visible.
    const isInitialLoad =
      input.issueView === null && input.timeline.preamble.events.length === 0 && input.timeline.turns.length === 0;

    applyTitle(parts.titleEl, input.title, input.issueId, isInitialLoad);

    const model = input.issueView?.model ?? null;
    if (model) {
      parts.modelEl.textContent = model;
      parts.modelEl.hidden = false;
    } else {
      parts.modelEl.hidden = true;
    }

    applyStatus(parts.statusPill, input.issueView, isInitialLoad);
    applyTokens(parts.tokens, input.issueView, isInitialLoad);
    applyPrLink(parts.prLink, input.issueView);

    const banner = input.timeline.activeBanner;
    if (banner) {
      parts.banner.hidden = false;
      parts.bannerCopy.textContent = banner.copy;
      parts.banner.dataset["level"] = banner.level;
      if (banner.elapsedStartedAt) {
        startElapsedTimer();
        tickElapsed();
      } else {
        stopElapsedTimer();
        parts.bannerElapsed.textContent = "";
      }
    } else {
      parts.banner.hidden = true;
      stopElapsedTimer();
      parts.bannerElapsed.textContent = "";
    }

    parts.element.dataset["mode"] = input.mode;
  }

  function dispose(): void {
    stopElapsedTimer();
    currentInput = null;
  }

  return { element: parts.element, update, dispose };
}
